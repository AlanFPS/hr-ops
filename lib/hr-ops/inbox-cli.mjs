import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { assert, keys, stamp, text, hash } from './model.mjs';
import { profileUrl } from './linkedin-browser.mjs';
import { dataRoot, LocalRepository, loadConfig } from './store.mjs';
import { readInbox, changeInbox, inboxSummary, threadUrl } from './inbox-state.mjs';
import { startInbox, importThread, observedMessageKey, observedMessageHash, contactMatches } from './inbox-import.mjs';
import { LinkedinInboxBrowser, scanInbox } from './inbox-browser.mjs';
import {requireWorkspaceAccount,workspaceBrowserPath} from './workspace.mjs';

export function filterReviews(repo,{state='pending',reason='',businessMatch}={}){
  assert(['pending','resolved','discarded','all'].includes(state),'Invalid review state');
  assert(!businessMatch||['known','unknown','ambiguous'].includes(businessMatch),'Invalid business-match filter');
  const records=repo.list(),inbox=readInbox(repo);
  return Object.values(inbox.reviews).map(({message,...r})=>{
    const matches=contactMatches(records,r.profile_url);
    const match=r.prospect_id||inbox.bindings?.[r.profile_url]?'known':matches.length>1?'ambiguous':matches.length===1?'known':'unknown';
    return {...r,business_match:match};
  }).filter(r=>(state==='all'||r.status===state)&&r.reason.toLowerCase().includes(reason.toLowerCase())&&(!businessMatch||r.business_match===businessMatch));
}

export async function reviewInbox(repo,c,input,now=new Date()) {
  keys(input,['id','action','reason','authorization','prospect_id','contact_id','at'],'inbox review');
  text(input.reason,'Review reason',2000);
  const auth=input.authorization;assert(auth?.actor==='human'&&auth.reference?.trim()&&auth.statement?.trim(),'Actual review instruction required');
  const item=readInbox(repo).reviews[input.id];assert(item,'Review not found');
  if(['exclude','include'].includes(input.action))return changeInbox(repo,s=>{
    const r=s.reviews[input.id],id=hash(threadUrl(r.thread_url));
    s.exclusions[id]={thread_url:r.thread_url,enabled:input.action==='exclude',reason:input.reason,authorization:auth,at:now.toISOString()};
    r.resolutions??=[];r.resolutions.push({action:input.action,reason:input.reason,authorization:auth,at:now.toISOString()});
    if(input.action==='exclude'){delete r.message;delete r.name;delete r.profile_url;r.status='discarded';}
    return {id:r.id,status:r.status,excluded:s.exclusions[id].enabled};
  });
  assert(item.status==='pending','Pending review not found');
  if(input.action==='discard')return changeInbox(repo,s=>{const r=s.reviews[input.id];delete r.message;delete r.name;delete r.profile_url;
    r.status='discarded';r.resolution={reason:input.reason,authorization:auth,at:now.toISOString()};return {id:r.id,status:r.status};});
  assert(input.action==='resolve','Use discard or resolve');
  if(input.prospect_id||input.contact_id){
    const p=repo.get(input.prospect_id),contact=p.contacts.find(c=>c.id===input.contact_id);assert(contact,'Existing contact required; never create a prospect from an inbox guess');
    const url=profileUrl(item.profile_url);
    await changeInbox(repo,s=>{s.bindings??={};s.bindings[url]={prospect_id:p.id,contact_id:contact.id,business_confirmed:true,authorization:auth,reason:input.reason};});
  }
  if(!item.message){assert(readInbox(repo).bindings?.[item.profile_url],'Resolve the identity binding or discard the item');return changeInbox(repo,s=>{const r=s.reviews[input.id];r.status='resolved';r.resolution={reason:input.reason,authorization:auth,at:now.toISOString()};
    const run=s.runs[r.run];run.status='partial';run.visited=[];run.folders=[];run.coverage_note='Identity resolved; resume to read the selected conversation again.';return {id:r.id,status:r.status,needs_resume:true};});
  }
  const message=structuredClone(item.message);
  if(input.at){stamp(input.at,now);message.at=input.at;message.timestamp_precision='human_reported';}
  const result=await importThread(repo,c,item.run,{thread_url:item.thread_url,profile_url:item.profile_url,name:item.name,participant_count:2,observed_at:item.observed_at,messages:[message]},now);
  const seen=readInbox(repo).seen[observedMessageKey(item,message)];
  const alreadyRecorded=seen?.hash===observedMessageHash(message)&&repo.get(seen.prospect_id).interactions.some(e=>e.id===seen.event_id);
  if(result.imported||result.reconciled||alreadyRecorded)await changeInbox(repo,s=>{s.reviews[input.id].status='resolved';s.reviews[input.id].resolution={reason:input.reason,authorization:auth,at:now.toISOString()};});
  if(alreadyRecorded)result.already_recorded=true;
  return result;
}
export async function inboxCli(command,args) {
  if(args.includes('--help')){console.log('inbox --sender-profile-url URL --authorization-reference REF [--resume RUN] [--since YYYY-MM-DD] [--limit 100] [--message-limit 1000]\ninbox-review [--input review.json]\nVisible browser, private human login, then read/import only. May mark conversations read. Focused and Other folders; archived/spam excluded.');return;}
  const o={};assert(args.length%2===0,'Options require values');
  for(let i=0;i<args.length;i+=2){assert(['--sender-profile-url','--authorization-reference','--resume','--since','--limit','--message-limit','--input','--id','--state','--reason','--business-match'].includes(args[i])&&!Object.hasOwn(o,args[i]),'Unknown or duplicate option');o[args[i]]=args[i+1];}
  const root=dataRoot(),repo=new LocalRepository(root),c=loadConfig(root);
  if(command==='inbox-review'){
    assert(Object.keys(o).every(k=>['--input','--id','--state','--reason','--business-match'].includes(k))&&!(o['--input']&&o['--id']),'inbox-review accepts input, ID or review filters');
    if(o['--id']){const item=readInbox(repo).reviews[o['--id']];assert(item,'Review not found');console.log(JSON.stringify(item,null,2));return;}
    console.log(JSON.stringify(o['--input']?await reviewInbox(repo,c,JSON.parse(readFileSync(o['--input']==='-'?0:o['--input'],'utf8').replace(/^\uFEFF/,''))):{...inboxSummary(repo),reviews:filterReviews(repo,{state:o['--state'],reason:o['--reason'],businessMatch:o['--business-match']})},null,2));return;
  }
  assert(!o['--input']&&!o['--id']&&!o['--state']&&!o['--reason']&&!o['--business-match'],'Review options require inbox-review');
  assert(!(o['--resume']&&o['--since']),'Resume preserves its original time window; omit --since');
  const sender=profileUrl(o['--sender-profile-url']);text(o['--authorization-reference'],'Actual user instruction reference');
  const workspace=requireWorkspaceAccount(repo,sender);console.error(`Workspace: ${workspace.name} (${workspace.purpose}) | ${root} | ${workspace.linkedin_profile_url}`);
  let run=o['--resume']?readInbox(repo).runs[o['--resume']]:null;
  if(o['--resume']){assert(run&&run.sender_profile_url===sender,'Resume run/account mismatch');assert(run.status!=='complete','Start a new run after completed coverage');}
  const since=o['--since']?new Date(o['--since']+'T00:00:00Z').toISOString():new Date(Date.now()-30*86400000).toISOString();
  if(!run)run=await startInbox(repo,{id:'inbox-'+randomUUID(),sender_profile_url:sender,since,
    authorization:{actor:'human',reference:o['--authorization-reference'],statement:'User requested this inbox import: record clear matches, flag uncertain records, and stop outreach for observed opt-outs. This is not authorization to send.'}});
  const {chromium}=await import('playwright');let context;
  try{
    console.error('Opening private LinkedIn browser. Log in yourself if prompted. Reading conversations may mark them read. No messages will be sent.');
    context=await chromium.launchPersistentContext(workspaceBrowserPath(repo),{headless:false});
    const page=await context.newPage();await page.goto('https://www.linkedin.com/login',{waitUntil:'domcontentloaded'});
    await page.waitForURL(u=>u.hostname==='www.linkedin.com'&&/^\/(feed|in|messaging)\//.test(u.pathname),{timeout:300000});
    const result=await scanInbox(repo,c,run.id,new LinkedinInboxBrowser(page),{maxConversations:Number(o['--limit']??100),maxMessages:Number(o['--message-limit']??1000)});
    console.log(JSON.stringify({run:result,inbox:inboxSummary(repo)},null,2));
  }catch(error){await changeInbox(repo,s=>Object.assign(s.runs[run.id],{status:'partial',checked_at:new Date().toISOString(),coverage_note:String(error.message).slice(0,2000)}));throw error;}
  finally{if(context)await context.close();}
}
