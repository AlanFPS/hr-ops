import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { assert, hash, keys, firmFingerprint, localDate, LINKEDIN_SEND_METHODS } from './model.mjs';
import { draftCurrent, outreachEligibility } from './operations.mjs';
import { writeFileAtomic } from '../../tracker-utils.mjs';

export const LINKEDIN_METHODS = LINKEDIN_SEND_METHODS;
// Conservative per-workspace ceiling on send attempts per local day; LinkedIn restricts accounts that send too much.
export const DEFAULT_DAILY_CAP = 20;
const CONFIRMED = ['human_confirmed_sent', 'tool_confirmed_sent'];

export function profileUrl(value) {
  const u = new URL(value);
  assert(u.protocol === 'https:' && ['linkedin.com', 'www.linkedin.com'].includes(u.hostname) &&
    !u.username && !u.password && !u.port && /^\/in\/[a-zA-Z0-9_-]+\/?$/.test(u.pathname),
  'An exact HTTPS linkedin.com/in/ profile URL is required');
  return 'https://www.linkedin.com' + u.pathname.replace(/\/$/, '');
}
const normalized = value => value.trim().replace(/\s+/g, ' ').toLowerCase();
const exactText = value => value.replace(/\r\n/g, '\n');

// A plan is bound to current state, the recipient URL, the delivery method and the exact message.
export function linkedinPlan(p, c, input, now = new Date()) {
  keys(input, ['draft_id', 'profile_url', 'sender_profile_url', 'expected_revision', 'method'], 'LinkedIn plan');
  const method = input.method ?? 'message';
  assert(LINKEDIN_METHODS.includes(method), 'LinkedIn method must be message, connection_request or inmail');
  assert(Number.isInteger(input.expected_revision) && p.revision === input.expected_revision, 'Revision conflict; reload the prospect');
  const d = p.drafts.find(d => d.id === input.draft_id);
  assert(d && d.channel === 'linkedin' && d.ready && !d.stale && !d.superseded_by && draftCurrent(d, p, c, now), 'A current ready LinkedIn draft is required');
  const subject = d.subject ?? null;
  if (method === 'inmail') assert(typeof subject === 'string' && subject.trim(), 'InMail requires a LinkedIn draft with a subject');
  else assert(subject === null, 'Only InMail sends a subject; use a LinkedIn draft without one for messages and connection requests');
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
  const plan = { prospect_id: p.id, revision: p.revision, draft_id: d.id, method, content_hash: d.content_hash,
    contact_id: contact.id, recipient_name: contact.name, profile_url: target,
    sender_profile_url: sender, sender_name: c.firm.sender_name, subject, body: d.body,
    input: structuredClone(input), firm_hash: firmFingerprint(c.firm) };
  return { ...plan, plan_hash: hash(plan) };
}

export function attemptPath(repo, plan) {
  return join(repo.dir, 'delivery-attempts', 'linkedin-' + hash(plan.prospect_id + ':' + plan.draft_id).slice(0, 24) + '.json');
}

// Every receipt counts, including unconfirmed and failed attempts, because each may have reached LinkedIn.
export function linkedinAttemptsToday(repo, c, now = new Date()) {
  const dir = join(repo.dir, 'delivery-attempts');
  if (!existsSync(dir)) return 0;
  const today = localDate(now, c.timezone);
  return readdirSync(dir).filter(f => /^linkedin-[a-f0-9]+\.json$/.test(f)).filter(f => {
    try {
      const r = JSON.parse(readFileSync(join(dir, f), 'utf8'));
      return localDate(r.attempted_at, c.timezone) === today;
    } catch { return true; }
  }).length;
}

// Wording compared with the recipient's name removed, so a template with only the name swapped still matches.
function wording(body, name) {
  let text = body.toLowerCase();
  for (const token of String(name ?? '').toLowerCase().split(/\s+/).filter(t => t.length > 1))
    text = text.replace(new RegExp(`\\b${token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'g'), ' ');
  return text.replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
}

// Repeated outreach text gets accounts flagged as spam, so every LinkedIn message must be distinct.
export function repeatedLinkedinText(repo, plan) {
  const target = wording(plan.body, plan.recipient_name);
  const dir = join(repo.dir, 'delivery-attempts');
  if (existsSync(dir)) for (const f of readdirSync(dir).filter(f => /^linkedin-[a-f0-9]+\.json$/.test(f))) {
    let r;
    try { r = JSON.parse(readFileSync(join(dir, f), 'utf8')); } catch { continue; }
    if (r.plan?.body && r.plan.draft_id !== plan.draft_id && wording(r.plan.body, r.plan.recipient_name) === target)
      return `${r.plan.recipient_name} (attempt ${f})`;
  }
  for (const p of repo.list()) for (const e of p.interactions) {
    if (e.kind !== 'sent' || e.channel !== 'linkedin' || !e.message || e.draft_id === plan.draft_id) continue;
    const name = p.contacts.find(x => x.id === e.contact_id)?.name;
    if (wording(e.message, name) === target) return `${name ?? 'a contact'} at ${p.name}`;
  }
  return null;
}
export function assertDistinctLinkedinText(repo, plan) {
  const repeated = repeatedLinkedinText(repo, plan);
  assert(!repeated, `This text repeats a LinkedIn message already sent to ${repeated} (names ignored); write a distinct message for each recipient`);
}

// The durable attempt precedes the single click. A timeout is ambiguous, never a retry signal.
export async function attemptLinkedinSend(repo, c, plan, driver, authorization, now = new Date(),
  { operator = 'human', dailyCap = DEFAULT_DAILY_CAP } = {}) {
  const { plan_hash, ...bound } = plan;
  assert(hash(bound) === plan_hash, 'The approved plan was modified');
  keys(authorization, ['actor', 'reference', 'statement'], 'authorization');
  assert(authorization.actor === 'human' && authorization.reference?.trim() && authorization.statement?.trim(), 'An actual human instruction is required as authorization');
  assert(['human', 'agent'].includes(operator), 'Operator must be human or agent');
  assert(Number.isInteger(dailyCap) && dailyCap > 0, 'Daily cap must be a positive integer');
  return repo.lock(async () => {
    repo.assertWritable();
    const fresh = linkedinPlan(repo.get(plan.prospect_id), c, plan.input, now);
    assert(fresh.plan_hash === plan.plan_hash, 'The approved plan changed');
    const file = attemptPath(repo, plan);
    assert(!existsSync(file), 'A send attempt already exists for this draft. Inspect it and the conversation; never retry automatically');
    const used = linkedinAttemptsToday(repo, c, now);
    assert(used < dailyCap, `Daily LinkedIn cap reached (${used} of ${dailyCap} attempts today); continue tomorrow or raise --daily-cap deliberately`);
    assertDistinctLinkedinText(repo, plan);
    await driver.verify(plan);
    mkdirSync(join(repo.dir, 'delivery-attempts'), { recursive: true });
    const receipt = { version: 1, channel: 'linkedin', method: plan.method, operator, status: 'attempted_unconfirmed',
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

export function annotateConfirmedAttempt(file, eventId, status = 'human_confirmed_sent') {
  assert(CONFIRMED.includes(status), 'Unknown confirmation status');
  const receipt = JSON.parse(readFileSync(file, 'utf8'));
  assert(receipt.status === 'attempted_unconfirmed', 'Unexpected attempt state');
  writeFileAtomic(file, JSON.stringify({ ...receipt, status,
    confirmation_recorded_at: new Date().toISOString(), interaction_id: eventId }, null, 2) + '\n');
}

// Deliberately narrow English-UI adapter. Unknown layouts, paywalls, sign-in checkpoints and CAPTCHAs stop the operation.
export class LinkedinBrowser {
  constructor(page) { this.page = page; }
  async verifyProfile(url, name) {
    assert(profileUrl(this.page.url()) === url, 'Unexpected page or login/checkpoint redirect');
    const heading = this.page.locator('main h1');
    assert(await heading.count() === 1 && normalized(await heading.innerText()) === normalized(name), 'Profile name does not match the approved identity');
  }
  // Agent-operated runs reuse the human's saved login. A login page or checkpoint stops the run.
  async verifyOwnProfile(url, name, { timeoutMs = 15000 } = {}) {
    await this.page.goto('https://www.linkedin.com/in/me/', { waitUntil: 'domcontentloaded', timeout: 30000 });
    try {
      await this.page.waitForURL(u => u.pathname !== '/in/me/' && u.pathname.startsWith('/in/'), { timeout: timeoutMs });
    } catch {
      throw new Error('LinkedIn is not logged in or shows a checkpoint. A human must run: node hr-ops-linkedin.mjs login');
    }
    await this.verifyProfile(url, name);
  }
  async bubble(plan) {
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
    assert(matches.length === 1, 'Exactly one recipient-matched message composer is required; group chats are unsupported');
    return matches[0];
  }
  async composer(plan) {
    await this.verifyProfile(plan.profile_url, plan.recipient_name);
    const bubble = await this.bubble(plan);
    const subjects = bubble.locator('input[name*="subject" i], input[placeholder*="subject" i]');
    if (plan.method === 'inmail')
      assert(await subjects.count() === 1 && await subjects.first().isVisible(),
        'An InMail composer with one subject field is required; the account may lack Premium or InMail credits');
    else assert(await subjects.count() === 0, 'This composer has a subject field (InMail); use --method inmail with a draft that has a subject');
    const profileLinks = bubble.locator('.msg-overlay-bubble-header a[href*="/in/"]');
    assert(await profileLinks.count() === 1, 'Ambiguous or multiple recipients');
    const editor = bubble.locator('.msg-form__contenteditable[contenteditable="true"][role="textbox"]');
    const send = bubble.getByRole('button', { name: 'Send', exact: true });
    assert(await editor.count() === 1 && await send.count() === 1 && await editor.isVisible(), 'Unsupported message form');
    return { bubble, editor, send, subject: plan.method === 'inmail' ? subjects.first() : null };
  }
  // LinkedIn labels the profile's Connect control with the person's name, which also binds it to the recipient.
  inviteLabel(plan) { return `Invite ${plan.recipient_name} to connect`; }
  async inviteForm(plan) {
    const dialogs = this.page.getByRole('dialog').filter({ visible: true });
    assert(await dialogs.count() === 1, 'Exactly one invitation dialog is required');
    const dialog = dialogs.first();
    const notes = dialog.locator('textarea');
    assert(await notes.count() === 1 && await notes.isVisible(),
      'The invitation note field is unavailable; the account may have reached its personalized-invitation limit');
    const send = dialog.getByRole('button', { name: /^Send( invitation| now)?$/ });
    assert(await send.count() === 1, 'Unsupported invitation dialog');
    return { dialog, note: notes.first(), send };
  }
  async prepare(plan) {
    await this.page.goto(plan.profile_url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await this.verifyProfile(plan.profile_url, plan.recipient_name);
    if (plan.method === 'connection_request') return this.prepareInvitation(plan);
    const message = this.page.locator('main').getByRole('button', { name: 'Message', exact: true });
    assert(await message.count() === 1 && await message.isVisible(), plan.method === 'inmail'
      ? 'A unique Message button is required to open InMail'
      : 'A unique direct Message button is required; for people who are not connections use --method connection_request or inmail');
    await message.click();
    await this.page.locator('.msg-overlay-conversation-bubble').first().waitFor({ state: 'visible', timeout: 10000 });
    const { editor, subject } = await this.composer(plan);
    assert(!(await editor.innerText()).trim() && (!subject || !(await subject.inputValue()).trim()), 'Existing composer text will not be overwritten');
    if (subject) await subject.fill(plan.subject);
    await editor.fill(plan.body);
    await this.verify(plan);
  }
  async prepareInvitation(plan) {
    const main = this.page.locator('main');
    assert(await main.getByRole('button', { name: /^Pending/ }).filter({ visible: true }).count() === 0, 'An invitation to this person is already pending');
    const label = this.inviteLabel(plan);
    let connect = main.getByRole('button', { name: label, exact: true }).filter({ visible: true });
    if (await connect.count() === 0) {
      const more = main.getByRole('button', { name: 'More actions', exact: true }).filter({ visible: true });
      assert(await more.count() === 1, 'No Connect option for this person; they may already be a connection (use --method message)');
      await more.click();
      connect = this.page.getByRole('button', { name: label, exact: true }).filter({ visible: true });
    }
    assert(await connect.count() === 1, 'A unique Connect option naming this person is required');
    await connect.click();
    const dialog = this.page.getByRole('dialog').filter({ visible: true });
    await dialog.first().waitFor({ state: 'visible', timeout: 10000 });
    const add = dialog.getByRole('button', { name: 'Add a note', exact: true });
    assert(await add.count() === 1, 'The invitation dialog offers no Add a note option');
    await add.click();
    const { note } = await this.inviteForm(plan);
    const max = Number(await note.getAttribute('maxlength'));
    assert(!max || [...plan.body].length <= max, `The note is longer than this account's ${max}-character invitation limit`);
    assert(!(await note.inputValue()).trim(), 'Existing note text will not be overwritten');
    await note.fill(plan.body);
    await this.verify(plan);
  }
  async verify(plan) {
    if (plan.method === 'connection_request') {
      await this.verifyProfile(plan.profile_url, plan.recipient_name);
      const { note, send } = await this.inviteForm(plan);
      assert(exactText(await note.inputValue()) === plan.body, 'Invitation note differs from the exact approved draft');
      assert(await send.isVisible() && await send.isEnabled(), 'Send is unavailable');
      return;
    }
    const { editor, send, subject } = await this.composer(plan);
    if (subject) assert(await subject.inputValue() === plan.subject, 'InMail subject differs from the exact approved draft');
    assert(exactText(await editor.innerText()) === plan.body, 'Composer differs from the exact approved draft');
    assert(await send.isVisible() && await send.isEnabled(), 'Send is unavailable');
  }
  async clickSend(plan) {
    await this.verify(plan);
    const { send } = plan.method === 'connection_request' ? await this.inviteForm(plan) : await this.composer(plan);
    await send.click({ timeout: 10000 });
  }
  // Observes the page after the click. False means unconfirmed: never a reason to click again.
  async confirmSent(plan, timeoutMs = 15000) {
    const deadline = Date.now() + timeoutMs;
    for (;;) {
      if (await this.observedSent(plan)) return true;
      if (Date.now() >= deadline) return false;
      await this.page.waitForTimeout(500);
    }
  }
  async observedSent(plan) {
    try {
      if (plan.method === 'connection_request') {
        return await this.page.getByRole('dialog').filter({ visible: true }).count() === 0 &&
          await this.page.locator('main').getByRole('button', { name: /^Pending/ }).filter({ visible: true }).count() > 0;
      }
      const items = (await this.bubble(plan)).locator('.msg-s-event-listitem__body');
      const count = await items.count();
      return count > 0 && exactText(await items.nth(count - 1).innerText()).trim() === plan.body.trim();
    } catch { return false; }
  }
}
