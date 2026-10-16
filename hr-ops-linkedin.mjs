#!/usr/bin/env node
import { createInterface } from 'node:readline/promises';
import { join } from 'node:path';
import { existsSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { dataRoot, LocalRepository, loadConfig } from './lib/hr-ops/store.mjs';
import {requireWorkspaceAccount,workspaceBrowserPath} from './lib/hr-ops/workspace.mjs';
import { requireRuntime, runHr } from './lib/hr-ops/client.mjs';
import { assert } from './lib/hr-ops/model.mjs';
import { linkedinPlan, LinkedinBrowser, attemptPath, attemptLinkedinSend, annotateConfirmedAttempt } from './lib/hr-ops/linkedin-browser.mjs';
import { isMainModule } from './lib/is-main-module.mjs';
import { inboxCli } from './lib/hr-ops/inbox-cli.mjs';

export async function main(args = process.argv.slice(2)) {
  requireRuntime();
  if(['inbox','inbox-review'].includes(args[0]))return inboxCli(args[0],args.slice(1));
  if (args.length === 0 || args.includes('--help')) {
    console.log('Usage: node hr-ops-linkedin.mjs preview|send PROSPECT --draft ID --profile-url URL --sender-profile-url URL --revision N\nPreview is offline. Send requires a human-operated interactive terminal, a dedicated browser login and exact-message confirmation. No batch sending, connection requests, InMail, account-checkpoint bypass or automatic retries.');
    console.log('Inbox: node hr-ops-linkedin.mjs inbox --help | inbox-review --help');return;
  }
  const [mode, selector, ...rest] = args;
  assert(['preview', 'send'].includes(mode) && selector && rest.length % 2 === 0, 'Invalid command; use --help');
  const o = {};
  for (let i = 0; i < rest.length; i += 2) {
    assert(['--draft','--profile-url','--sender-profile-url','--revision'].includes(rest[i]) && !Object.hasOwn(o, rest[i]), 'Unknown or repeated option');
    o[rest[i]] = rest[i + 1];
  }
  if (mode === 'send') assert(process.stdin.isTTY && process.stdout.isTTY, 'Send requires an interactive human-operated terminal; headless agent input is unsupported');
  const root = dataRoot(), repo = new LocalRepository(root), c = loadConfig(root);
  if(mode==='send'){const workspace=requireWorkspaceAccount(repo,o['--sender-profile-url']);console.error(`Workspace: ${workspace.name} (${workspace.purpose}) | ${root} | ${workspace.linkedin_profile_url}`);}
  const plan = linkedinPlan(repo.get(selector), c, { draft_id:o['--draft'], profile_url:o['--profile-url'],
    sender_profile_url:o['--sender-profile-url'], expected_revision:Number(o['--revision']) });
  assert(!existsSync(attemptPath(repo, plan)), 'An attempt already exists; inspect the receipt and conversation instead of retrying');
  if (mode === 'preview') { console.log(JSON.stringify({ ...plan, sends: false, needs_human_confirmation: true }, null, 2)); return; }
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  let context;
  try {
    console.log('LinkedIn prohibits unauthorized website automation. This is not a LinkedIn-approved integration. No anti-detection or restriction bypass is provided.');
    assert(await rl.question('Type OPEN to open the dedicated browser, or anything else to cancel: ') === 'OPEN', 'Cancelled');
    const { chromium } = await import('playwright');
    assert(existsSync(chromium.executablePath()), 'Chromium is not installed. Run npx playwright install chromium explicitly, then retry.');
    // Session cookies stay in ignored local storage and outside the HR backup manifest.
    context = await chromium.launchPersistentContext(workspaceBrowserPath(repo), { headless: false });
    const page = await context.newPage(), driver = new LinkedinBrowser(page);
    page.setDefaultTimeout(10000);
    await page.goto('https://www.linkedin.com/in/me/', { waitUntil:'domcontentloaded', timeout:30000 });
    console.log('Log in yourself if needed. Open your own profile using LinkedIn navigation. Do not switch accounts after this check. Never share passwords, cookies or verification codes with the agent.');
    assert(await rl.question('When your own profile is visible, type READY: ') === 'READY', 'Cancelled');
    await driver.verifyProfile(plan.sender_profile_url, plan.sender_name);
    await driver.prepare(plan);
    console.log('\nFROM: '+plan.sender_name+' '+plan.sender_profile_url+'\nTO: '+plan.recipient_name+' '+plan.profile_url+'\nEXACT MESSAGE:\n'+plan.body+'\n');
    const token='SEND '+plan.draft_id;
    assert(await rl.question('Inspect the account, recipient and text in the browser. Type '+token+' to authorize one send: ') === token, 'Cancelled before sending');
    const authorization={actor:'human',reference:'interactive-terminal:'+randomUUID(),statement:'I inspected the sender, recipient and exact text and typed '+token+' to authorize this one LinkedIn message.'};
    runHr(['record',plan.prospect_id,'--revision',String(plan.revision),'--input','-'],{cwd:process.cwd(),env:{...process.env,HR_OPS_ROOT:root,CAREER_OPS_ROOT:root},input:{
      id:'linkedin-review-'+randomUUID(),kind:'review',at:new Date().toISOString(),draft_id:plan.draft_id,
      content_hash:plan.content_hash,reason:'Human inspected the exact browser message and authorized one send.',authorization
    }});
    // Only the approval audit event may advance the revision after the human inspected the plan.
    const currentConfig=loadConfig(root);
    const approvedPlan=linkedinPlan(repo.get(plan.prospect_id),currentConfig,{...plan.input,expected_revision:plan.revision+1});
    assert(approvedPlan.body===plan.body && approvedPlan.content_hash===plan.content_hash && approvedPlan.firm_hash===plan.firm_hash &&
      approvedPlan.contact_id===plan.contact_id && approvedPlan.recipient_name===plan.recipient_name, 'The reviewed plan changed; inspect again before sending');
    const {file,receipt}=await attemptLinkedinSend(repo,currentConfig,approvedPlan,driver,authorization);
    console.log('One send click was attempted. This is not confirmation of delivery. Receipt: '+file);
    if (await rl.question('Check the actual conversation. Only if the exact message appears as sent, type SENT; otherwise type UNKNOWN: ') === 'SENT') {
      const current=repo.get(plan.prospect_id),id='linkedin-'+plan.draft_id;
      runHr(['record',plan.prospect_id,'--revision',String(current.revision),'--input','-'],{cwd:process.cwd(),env:{...process.env,HR_OPS_ROOT:root,CAREER_OPS_ROOT:root},input:{
        id,kind:'sent',at:receipt.click_returned_at,channel:'linkedin',contact_id:plan.contact_id,draft_id:plan.draft_id,
        reason:'Human visually confirmed the exact sent message. Occurrence timestamp is the browser click completion time, not a server delivery timestamp.',
        content_hash:plan.content_hash,message:plan.body,authorization:{...authorization,statement:authorization.statement+' I then visually verified the sent message and typed SENT.'}
      }});
      annotateConfirmedAttempt(file,id);
      console.log('Human-confirmed sent event recorded. No further messages will be sent.');
    } else console.log('Outcome remains unconfirmed. No sent event was created. Do not retry; inspect the conversation and reconcile using the receipt.');
  } finally { rl.close(); if(context)await context.close(); }
}
if(isMainModule(import.meta.url))main().catch(e=>{console.error(JSON.stringify({ok:false,error:e.message}));process.exitCode=1;});
