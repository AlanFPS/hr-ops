#!/usr/bin/env node
import { createInterface } from 'node:readline/promises';
import { existsSync, readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { dataRoot, LocalRepository, loadConfig } from './lib/hr-ops/store.mjs';
import {requireWorkspaceAccount,workspaceBrowserPath} from './lib/hr-ops/workspace.mjs';
import { requireRuntime, runHr } from './lib/hr-ops/client.mjs';
import { assert, keys } from './lib/hr-ops/model.mjs';
import { linkedinPlan, LinkedinBrowser, attemptPath, attemptLinkedinSend, annotateConfirmedAttempt, linkedinAttemptsToday, assertDistinctLinkedinText, profileUrl, DEFAULT_DAILY_CAP } from './lib/hr-ops/linkedin-browser.mjs';
import { isMainModule } from './lib/is-main-module.mjs';
import { inboxCli } from './lib/hr-ops/inbox-cli.mjs';

const USAGE = `Usage:
  node hr-ops-linkedin.mjs preview PROSPECT --draft ID --profile-url URL --sender-profile-url URL --revision N [--method message|connection_request|inmail]
  node hr-ops-linkedin.mjs send PROSPECT --draft ID --profile-url URL --sender-profile-url URL --revision N [--method ...] [--authorization FILE] [--daily-cap N]
  node hr-ops-linkedin.mjs login --sender-profile-url URL
Methods: message (direct message to a connection, the default), connection_request (invitation with the draft as its note),
inmail (paid InMail; the draft needs a subject).
Without --authorization, send runs in a human-operated interactive terminal (OPEN, READY, SEND and SENT prompts).
With --authorization FILE holding {"actor":"human","reference":"...","statement":"..."} that quotes the user's actual send
instruction, the agent runs the send unattended: it reuses the saved login, verifies sender, recipient and exact text,
clicks Send once and checks the result. Logging in is always done by a human with the login command.
Each send is one draft and one attempt: no automatic retries, no CAPTCHA or checkpoint handling, no anti-detection.
Default cap: ${DEFAULT_DAILY_CAP} attempts per workspace per local day.`;

const OPTIONS = ['--draft', '--profile-url', '--sender-profile-url', '--revision', '--method', '--authorization', '--daily-cap'];

function readAuthorization(path) {
  let value;
  try { value = JSON.parse(readFileSync(path, 'utf8')); }
  catch (error) { throw new Error('Authorization must be a readable JSON file: ' + error.message); }
  keys(value, ['actor', 'reference', 'statement'], 'authorization');
  assert(value.actor === 'human' && value.reference?.trim() && value.statement?.trim(),
    'Authorization must quote an actual human send instruction (actor "human", reference and statement)');
  return value;
}

async function openBrowser(repo) {
  const { chromium } = await import('playwright');
  assert(existsSync(chromium.executablePath()), 'Chromium is not installed. Run npx playwright install chromium explicitly, then retry.');
  // Session cookies stay in ignored local storage and outside the HR backup manifest.
  return chromium.launchPersistentContext(workspaceBrowserPath(repo), { headless: false });
}

function record(root, prospectId, revision, event) {
  runHr(['record', prospectId, '--revision', String(revision), '--input', '-'], { cwd: process.cwd(),
    env: { ...process.env, HR_OPS_ROOT: root, CAREER_OPS_ROOT: root }, input: event });
}

// Only the review audit event may advance the revision between inspection and dispatch.
function reviewedPlan(repo, root, plan, authorization, reason) {
  record(root, plan.prospect_id, plan.revision, { id: 'linkedin-review-' + randomUUID(), kind: 'review', at: new Date().toISOString(),
    draft_id: plan.draft_id, content_hash: plan.content_hash, reason, authorization });
  const approved = linkedinPlan(repo.get(plan.prospect_id), loadConfig(root), { ...plan.input, expected_revision: plan.revision + 1 });
  assert(approved.body === plan.body && approved.subject === plan.subject && approved.method === plan.method &&
    approved.content_hash === plan.content_hash && approved.firm_hash === plan.firm_hash &&
    approved.contact_id === plan.contact_id && approved.recipient_name === plan.recipient_name, 'The reviewed plan changed; inspect again before sending');
  return approved;
}

function sentEvent(plan, receipt, authorization, reason) {
  return { id: 'linkedin-' + plan.draft_id, kind: 'sent', at: receipt.click_returned_at, channel: 'linkedin', method: plan.method,
    contact_id: plan.contact_id, draft_id: plan.draft_id, content_hash: plan.content_hash, message: plan.body, reason, authorization };
}

const describe = plan => '\nMETHOD: ' + plan.method + '\nFROM: ' + plan.sender_name + ' ' + plan.sender_profile_url +
  '\nTO: ' + plan.recipient_name + ' ' + plan.profile_url + (plan.subject ? '\nSUBJECT: ' + plan.subject : '') + '\nEXACT TEXT:\n' + plan.body + '\n';

async function login(o) {
  assert(process.stdin.isTTY && process.stdout.isTTY, 'Login requires the human in an interactive terminal; agents never log in or handle credentials');
  const root = dataRoot(), repo = new LocalRepository(root), c = loadConfig(root);
  const sender = profileUrl(o['--sender-profile-url']);
  requireWorkspaceAccount(repo, sender);
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  let context;
  try {
    context = await openBrowser(repo);
    const page = await context.newPage();
    page.setDefaultTimeout(10000);
    await page.goto('https://www.linkedin.com/login', { waitUntil: 'domcontentloaded', timeout: 30000 });
    console.log('Log in yourself in the browser window and complete any verification. Never share passwords, cookies or verification codes with the agent.');
    assert(await rl.question('When you are logged in, type DONE: ') === 'DONE', 'Cancelled');
    await new LinkedinBrowser(page).verifyOwnProfile(sender, c.firm.sender_name);
    console.log('Logged in as the workspace sender. The session stays in the private browser profile for later sends.');
  } finally { rl.close(); if (context) await context.close(); }
}

async function agentSend(repo, root, plan, authorization, dailyCap) {
  let context;
  try {
    context = await openBrowser(repo);
    const page = await context.newPage(), driver = new LinkedinBrowser(page);
    page.setDefaultTimeout(10000);
    await driver.verifyOwnProfile(plan.sender_profile_url, plan.sender_name);
    await driver.prepare(plan);
    const approved = reviewedPlan(repo, root, plan, authorization,
      'Agent-operated send under the quoted user instruction; the tool verified the sender, recipient and exact text in the browser.');
    const { file, receipt } = await attemptLinkedinSend(repo, loadConfig(root), approved, driver, authorization, new Date(), { operator: 'agent', dailyCap });
    if (!await driver.confirmSent(approved))
      return { sent: false, confirmed: false, receipt: file, method: plan.method,
        next: 'One click was attempted but the result was not observed. Do not retry; a human must check the conversation or invitations and reconcile with record.' };
    const event = sentEvent(approved, receipt, authorization,
      'Agent-operated send; the tool observed the exact ' + (plan.method === 'connection_request' ? 'invitation as pending' : 'message in the conversation') +
      ' after one click. Occurrence time is the click completion time, not a server delivery timestamp.');
    record(root, plan.prospect_id, repo.get(plan.prospect_id).revision, event);
    annotateConfirmedAttempt(file, event.id, 'tool_confirmed_sent');
    return { sent: true, confirmed: true, receipt: file, method: plan.method, interaction_id: event.id };
  } finally { if (context) await context.close(); }
}

async function humanSend(repo, root, plan, dailyCap) {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  let context;
  try {
    console.log('LinkedIn prohibits unauthorized website automation. This is not a LinkedIn-approved integration. No anti-detection or restriction bypass is provided.');
    assert(await rl.question('Type OPEN to open the dedicated browser, or anything else to cancel: ') === 'OPEN', 'Cancelled');
    context = await openBrowser(repo);
    const page = await context.newPage(), driver = new LinkedinBrowser(page);
    page.setDefaultTimeout(10000);
    await page.goto('https://www.linkedin.com/in/me/', { waitUntil:'domcontentloaded', timeout:30000 });
    console.log('Log in yourself if needed. Open your own profile using LinkedIn navigation. Do not switch accounts after this check. Never share passwords, cookies or verification codes with the agent.');
    assert(await rl.question('When your own profile is visible, type READY: ') === 'READY', 'Cancelled');
    await driver.verifyProfile(plan.sender_profile_url, plan.sender_name);
    await driver.prepare(plan);
    console.log(describe(plan));
    const token = 'SEND ' + plan.draft_id;
    assert(await rl.question('Inspect the account, recipient and text in the browser. Type ' + token + ' to authorize one send: ') === token, 'Cancelled before sending');
    const authorization = { actor:'human', reference:'interactive-terminal:' + randomUUID(),
      statement:'I inspected the sender, recipient and exact text and typed ' + token + ' to authorize this one LinkedIn ' + plan.method + '.' };
    const approved = reviewedPlan(repo, root, plan, authorization, 'Human inspected the exact browser text and authorized one send.');
    const { file, receipt } = await attemptLinkedinSend(repo, loadConfig(root), approved, driver, authorization, new Date(), { operator: 'human', dailyCap });
    console.log('One send click was attempted. This is not confirmation of delivery. Receipt: ' + file);
    if (await rl.question('Check the actual conversation or invitation. Only if it appears as sent, type SENT; otherwise type UNKNOWN: ') === 'SENT') {
      const event = sentEvent(approved, receipt, { ...authorization, statement: authorization.statement + ' I then visually verified it was sent and typed SENT.' },
        'Human visually confirmed the exact sent text. Occurrence timestamp is the browser click completion time, not a server delivery timestamp.');
      record(root, plan.prospect_id, repo.get(plan.prospect_id).revision, event);
      annotateConfirmedAttempt(file, event.id);
      console.log('Human-confirmed sent event recorded. No further messages will be sent.');
    } else console.log('Outcome remains unconfirmed. No sent event was created. Do not retry; inspect the conversation and reconcile using the receipt.');
  } finally { rl.close(); if (context) await context.close(); }
}

export async function main(args = process.argv.slice(2)) {
  requireRuntime();
  if(['inbox','inbox-review'].includes(args[0]))return inboxCli(args[0],args.slice(1));
  if (args.length === 0 || args.includes('--help')) {
    console.log(USAGE);
    console.log('Inbox: node hr-ops-linkedin.mjs inbox --help | inbox-review --help');return;
  }
  const [mode, ...tail] = args;
  assert(['preview', 'send', 'login'].includes(mode), 'Invalid command; use --help');
  const selector = mode === 'login' ? null : tail[0], rest = mode === 'login' ? tail : tail.slice(1);
  assert((mode === 'login' || selector) && rest.length % 2 === 0, 'Invalid command; use --help');
  const o = {};
  for (let i = 0; i < rest.length; i += 2) {
    assert(OPTIONS.includes(rest[i]) && !Object.hasOwn(o, rest[i]), 'Unknown or repeated option');
    o[rest[i]] = rest[i + 1];
  }
  if (mode === 'login') {
    assert(Object.keys(o).length === 1 && o['--sender-profile-url'], 'login takes only --sender-profile-url');
    return login(o);
  }
  assert(mode === 'send' || (!o['--authorization'] && !o['--daily-cap']), 'Preview takes no --authorization or --daily-cap');
  const authorization = o['--authorization'] ? readAuthorization(o['--authorization']) : null;
  const dailyCap = o['--daily-cap'] === undefined ? DEFAULT_DAILY_CAP : Number(o['--daily-cap']);
  assert(Number.isInteger(dailyCap) && dailyCap > 0, '--daily-cap must be a positive integer');
  if (mode === 'send' && !authorization) assert(process.stdin.isTTY && process.stdout.isTTY,
    'Send without --authorization requires an interactive human-operated terminal; agents pass --authorization with the user\'s instruction');
  const root = dataRoot(), repo = new LocalRepository(root), c = loadConfig(root);
  if(mode==='send'){const workspace=requireWorkspaceAccount(repo,o['--sender-profile-url']);console.error(`Workspace: ${workspace.name} (${workspace.purpose}) | ${root} | ${workspace.linkedin_profile_url}`);}
  const plan = linkedinPlan(repo.get(selector), c, { draft_id:o['--draft'], profile_url:o['--profile-url'],
    sender_profile_url:o['--sender-profile-url'], expected_revision:Number(o['--revision']), method:o['--method'] ?? 'message' });
  assert(!existsSync(attemptPath(repo, plan)), 'An attempt already exists; inspect the receipt and conversation instead of retrying');
  if (mode === 'preview') { console.log(JSON.stringify({ ...plan, sends: false }, null, 2)); return; }
  // Early checks so a capped or repeated send opens no browser; the attempt rechecks under the writer lock.
  const used = linkedinAttemptsToday(repo, c);
  assert(used < dailyCap, `Daily LinkedIn cap reached (${used} of ${dailyCap} attempts today); continue tomorrow or raise --daily-cap deliberately`);
  assertDistinctLinkedinText(repo, plan);
  if (authorization) {
    const result = await agentSend(repo, root, plan, authorization, dailyCap);
    console.log(JSON.stringify(result, null, 2));
    if (!result.confirmed) process.exitCode = 3;
    return;
  }
  return humanSend(repo, root, plan, dailyCap);
}
if(isMainModule(import.meta.url))main().catch(e=>{console.error(JSON.stringify({ok:false,error:e.message}));process.exitCode=1;});
