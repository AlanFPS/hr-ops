import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { assert, hash, keys } from './model.mjs';
import { draftCurrent, outreachEligibility } from './operations.mjs';
import { writeFileAtomic } from '../../tracker-utils.mjs';

export function profileUrl(value) {
  const u = new URL(value);
  assert(u.protocol === 'https:' && ['linkedin.com', 'www.linkedin.com'].includes(u.hostname) &&
    !u.username && !u.password && !u.port && /^\/in\/[a-zA-Z0-9_-]+\/?$/.test(u.pathname),
  'An exact HTTPS linkedin.com/in/ profile URL is required');
  return 'https://www.linkedin.com' + u.pathname.replace(/\/$/, '');
}
const normalized = value => value.trim().replace(/\s+/g, ' ').toLowerCase();

// A plan is bound to current state, the recipient URL and the exact message.
export function linkedinPlan(p, c, input, now = new Date()) {
  keys(input, ['draft_id', 'profile_url', 'sender_profile_url', 'expected_revision'], 'LinkedIn plan');
  assert(Number.isInteger(input.expected_revision) && p.revision === input.expected_revision, 'Revision conflict; reload the prospect');
  const d = p.drafts.find(d => d.id === input.draft_id);
  assert(d && d.channel === 'linkedin' && d.ready && !d.stale && !d.superseded_by && draftCurrent(d, p, c, now), 'A current ready LinkedIn draft is required');
  const eligibility = outreachEligibility(p, c, now, d.purpose);
  assert(!eligibility.blocked, eligibility.reasons.join('; '));
  const contact = p.contacts.find(x => x.id === d.contact_id);
  assert(contact, 'Recipient not found');
  const target = profileUrl(input.profile_url), sender = profileUrl(input.sender_profile_url);
  assert(target !== sender, 'Sender and recipient must differ');
  assert(p.evidence.some(e => {
    try { return profileUrl(e.url) === target && normalized(e.excerpt).includes(normalized(contact.name)); }
    catch { return false; }
  }), 'Recipient profile must have saved identity-matching evidence');
  assert(!p.interactions.some(e => e.kind === 'sent' && e.draft_id === d.id), 'This draft was already recorded as sent');
  const plan = { prospect_id: p.id, revision: p.revision, draft_id: d.id, content_hash: d.content_hash,
    contact_id: contact.id, recipient_name: contact.name, profile_url: target,
    sender_profile_url: sender, sender_name: c.firm.sender_name, body: d.body,
    input: structuredClone(input), firm_hash: hash(c.firm) };
  return { ...plan, plan_hash: hash(plan) };
}

export function attemptPath(repo, plan) {
  return join(repo.dir, 'delivery-attempts', 'linkedin-' + hash(plan.prospect_id + ':' + plan.draft_id).slice(0, 24) + '.json');
}

// The durable attempt precedes the single click. A timeout is ambiguous, never a retry signal.
export async function attemptLinkedinSend(repo, c, plan, driver, authorization, now = new Date()) {
  const { plan_hash, ...bound } = plan;
  assert(hash(bound) === plan_hash, 'The approved plan was modified');
  keys(authorization, ['actor', 'reference', 'statement'], 'authorization');
  assert(authorization.actor === 'human' && authorization.reference?.trim() && authorization.statement?.trim(), 'Actual human authorization required');
  return repo.lock(async () => {
    repo.assertWritable();
    const fresh = linkedinPlan(repo.get(plan.prospect_id), c, plan.input, now);
    assert(fresh.plan_hash === plan.plan_hash, 'The approved plan changed');
    const file = attemptPath(repo, plan);
    assert(!existsSync(file), 'A send attempt already exists for this draft. Inspect it and the conversation; never retry automatically');
    await driver.verify(plan);
    mkdirSync(join(repo.dir, 'delivery-attempts'), { recursive: true });
    const receipt = { version: 1, channel: 'linkedin', status: 'attempted_unconfirmed',
      attempted_at: now.toISOString(), plan, authorization };
    writeFileSync(file, JSON.stringify(receipt, null, 2) + '\n', { flag: 'wx' });
    try {
      await driver.clickSend(plan);
      receipt.click_returned_at = new Date().toISOString();
    } catch (error) {
      receipt.error = String(error.message);
      writeFileAtomic(file, JSON.stringify(receipt, null, 2) + '\n');
      throw new Error('Send outcome is unconfirmed. No retry. Inspect the LinkedIn conversation and ' + file);
    }
    writeFileAtomic(file, JSON.stringify(receipt, null, 2) + '\n');
    return { file, receipt };
  });
}

export function annotateConfirmedAttempt(file, eventId) {
  const receipt = JSON.parse(readFileSync(file, 'utf8'));
  assert(receipt.status === 'attempted_unconfirmed', 'Unexpected attempt state');
  writeFileAtomic(file, JSON.stringify({ ...receipt, status: 'human_confirmed_sent',
    confirmation_recorded_at: new Date().toISOString(), interaction_id: eventId }, null, 2) + '\n');
}

// Deliberately narrow English-UI adapter. Unknown layouts, InMail, paywalls and challenges stop the operation.
export class LinkedinBrowser {
  constructor(page) { this.page = page; }
  async verifyProfile(url, name) {
    assert(profileUrl(this.page.url()) === url, 'Unexpected page or login/checkpoint redirect');
    const heading = this.page.locator('main h1');
    assert(await heading.count() === 1 && normalized(await heading.innerText()) === normalized(name), 'Profile name does not match the approved identity');
  }
  async composer(plan) {
    await this.verifyProfile(plan.profile_url, plan.recipient_name);
    const bubbles = this.page.locator('.msg-overlay-conversation-bubble');
    const matches = [];
    for (let i = 0; i < await bubbles.count(); i++) {
      const bubble = bubbles.nth(i);
      if (!await bubble.isVisible()) continue;
      const headers = bubble.locator('.msg-overlay-bubble-header');
      if (await headers.count() !== 1) continue;
      const links = headers.locator('a[href]');
      for (let j = 0; j < await links.count(); j++) {
        const a = links.nth(j);
        try {
          if (profileUrl(new URL(await a.getAttribute('href'), this.page.url()).href) === plan.profile_url &&
            normalized(await a.innerText()) === normalized(plan.recipient_name)) { matches.push(bubble); break; }
        } catch { /* Non-profile links do not establish recipient identity. */ }
      }
    }
    assert(matches.length === 1, 'Exactly one recipient-matched direct-message composer is required; group chat and InMail are unsupported');
    const bubble = matches[0];
    assert(await bubble.locator('input[name*="subject" i], input[placeholder*="subject" i]').count() === 0,
      'Subject-bearing messages and InMail are unsupported');
    const profileLinks = bubble.locator('.msg-overlay-bubble-header a[href*="/in/"]');
    assert(await profileLinks.count() === 1, 'Ambiguous or multiple recipients');
    const editor = bubble.locator('.msg-form__contenteditable[contenteditable="true"][role="textbox"]');
    const send = bubble.getByRole('button', { name: 'Send', exact: true });
    assert(await editor.count() === 1 && await send.count() === 1 && await editor.isVisible(), 'Unsupported message form');
    return { editor, send };
  }
  async prepare(plan) {
    await this.page.goto(plan.profile_url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await this.verifyProfile(plan.profile_url, plan.recipient_name);
    const message = this.page.locator('main').getByRole('button', { name: 'Message', exact: true });
    assert(await message.count() === 1 && await message.isVisible(), 'A unique direct Message button is required; no connection request or paid InMail fallback');
    await message.click();
    await this.page.locator('.msg-overlay-conversation-bubble').first().waitFor({ state: 'visible', timeout: 10000 });
    const { editor } = await this.composer(plan);
    assert(!(await editor.innerText()).trim(), 'Existing composer text will not be overwritten');
    await editor.fill(plan.body);
    await this.verify(plan);
  }
  async verify(plan) {
    const { editor, send } = await this.composer(plan);
    assert((await editor.innerText()).replace(/\r\n/g, '\n') === plan.body, 'Composer differs from the exact approved draft');
    assert(await send.isVisible() && await send.isEnabled(), 'Send is unavailable');
  }
  async clickSend(plan) {
    await this.verify(plan);
    const { send } = await this.composer(plan);
    await send.click({ timeout: 10000 });
  }
}
