import { existsSync, readFileSync, mkdirSync, lstatSync } from 'node:fs';
import { join } from 'node:path';
import { writeFileAtomic } from '../../tracker-utils.mjs';
import { assert, keys, text, stamp, hash } from './model.mjs';

export const inboxPath = repo => join(repo.dir,'inbox','state.json');
export function validateOrigin(o) {
  keys(o,['method','run','thread_url','message_id','observed_at','timestamp_precision','content_hash','sender_profile_url'],'interaction origin');
  assert(o.method==='linkedin_browser','Invalid origin method');
  text(o.run,'origin.run',100);threadUrl(o.thread_url);
  if(o.message_id!==null)text(o.message_id,'origin.message_id',2000);
  stamp(o.observed_at);
  assert(['minute','exact','human_reported'].includes(o.timestamp_precision),'Invalid timestamp precision');
  assert(/^[a-f0-9]{64}$/.test(o.content_hash),'Invalid observed content hash');
  assert(/^https:\/\/www\.linkedin\.com\/in\/[a-zA-Z0-9_-]+$/.test(o.sender_profile_url),'Invalid sender profile');
}
export function threadUrl(value) {
  const u=new URL(value);
  assert(u.origin==='https://www.linkedin.com' && /^\/messaging\/thread\/[^/]+\/?$/.test(u.pathname) && !u.username&&!u.password,'Exact LinkedIn thread URL required');
  return u.origin+u.pathname.replace(/\/$/,'')+'/';
}
export function readInbox(repo) {
  const file=inboxPath(repo);
  if(!existsSync(file))return {version:2,runs:{},seen:{},reviews:{},exclusions:{}};
  assert(!lstatSync(file).isSymbolicLink(),'Inbox state must not be a link');
  return validateInbox(JSON.parse(readFileSync(file,'utf8')));
}
export function validateInbox(s) {
  keys(s,['version','runs','seen','reviews','bindings','exclusions'],'inbox state');assert([1,2].includes(s.version),'Unsupported inbox state');
  if(s.version===2)assert(s.exclusions&&typeof s.exclusions==='object'&&!Array.isArray(s.exclusions),'Invalid inbox exclusions');
  for(const [id,e] of Object.entries(s.exclusions??{})){
    assert(id===hash(threadUrl(e.thread_url))&&typeof e.enabled==='boolean','Invalid thread exclusion');
    assert(e.authorization?.actor==='human'&&e.authorization.reference&&e.authorization.statement,'Exclusion requires a human instruction');stamp(e.at);text(e.reason,'Exclusion reason',2000);
  }
  for(const k of ['runs','seen','reviews'])assert(s[k]&&typeof s[k]==='object'&&!Array.isArray(s[k]),'Invalid inbox '+k);
  for(const [id,r] of Object.entries(s.runs)){
    assert(/^[a-zA-Z0-9_-]{1,80}$/.test(id)&&r.id===id,'Invalid inbox run ID');
    assert(['active','partial','complete'].includes(r.status),'Invalid inbox run status');stamp(r.started_at);stamp(r.since);
    assert(Array.isArray(r.visited)&&r.visited.every(x=>typeof x==='string'),'Invalid inbox checkpoint');
    assert(Array.isArray(r.folders)&&r.folders.every(x=>['focused','other'].includes(x))&&new Set(r.folders).size===r.folders.length,'Invalid inbox folders');
    for(const key of ['imported','reconciled','skipped','observed_messages'])assert(Number.isSafeInteger(r[key])&&r[key]>=0,'Invalid inbox count '+key);
    if(r.checked_at)stamp(r.checked_at);
    if(r.unique_processed!==undefined)assert(Array.isArray(r.unique_processed)&&new Set(r.unique_processed).size===r.unique_processed.length&&r.unique_processed.every(id=>/^[a-f0-9]{64}$/.test(id)),'Invalid unique conversation count');
    if(r.invocations!==undefined){
      assert(Array.isArray(r.invocations),'Invalid inbox invocations');
      for(const v of r.invocations){stamp(v.started_at);if(v.finished_at)stamp(v.finished_at);
        assert(Number.isSafeInteger(v.conversations)&&v.conversations>=0&&v.conversations<=100&&Number.isSafeInteger(v.messages)&&v.messages>=0&&v.messages<=1000,'Invalid invocation counts');
        assert(Array.isArray(v.processed)&&v.processed.every(id=>/^[a-f0-9]{64}$/.test(id)),'Invalid processed conversation identity');
        for(const folder of ['focused','other'])assert(Number.isSafeInteger(v.folders?.[folder]?.conversations)&&v.folders[folder].conversations>=0&&Number.isSafeInteger(v.folders[folder].messages)&&v.folders[folder].messages>=0,'Invalid folder progress');
      }
    }
    assert(r.authorization?.actor==='human'&&r.authorization.reference&&r.authorization.statement,'Inbox requires import authorization');
    assert(/^https:\/\/www\.linkedin\.com\/in\/[a-zA-Z0-9_-]+$/.test(r.sender_profile_url),'Invalid inbox sender');
  }
  for(const [id,v] of Object.entries(s.seen)){assert(/^[a-f0-9]{64}$/.test(id)&&/^[a-f0-9]{64}$/.test(v.hash),'Invalid inbox identity');text(v.event_id,'Inbox event ID',200);assert(/^[a-f0-9]{16}$/.test(v.prospect_id),'Invalid inbox prospect ID');}
  for(const [id,r] of Object.entries(s.reviews)){
    assert(/^[a-f0-9]{64}$/.test(id)&&r.id===id,'Invalid inbox review ID');
    assert(['pending','resolved','discarded'].includes(r.status),'Invalid inbox review state');threadUrl(r.thread_url);stamp(r.observed_at);
    text(r.reason,'inbox review reason',2000);
    assert(Object.hasOwn(s.runs,r.run),'Review references missing inbox run');
    if(r.message){assert(typeof r.message.body==='string'&&r.message.body.length<=60000,'Invalid review message body');if(r.message.at!==null&&r.message.at!==undefined)text(r.message.at,'Unresolved timestamp',200);}
  }
  for(const [url,b] of Object.entries(s.bindings??{})){
    assert(/^https:\/\/www\.linkedin\.com\/in\/[a-zA-Z0-9_-]+$/.test(url),'Invalid identity binding URL');
    assert(/^[a-f0-9]{16}$/.test(b.prospect_id)&&/^[a-f0-9]{16}$/.test(b.contact_id)&&b.authorization?.actor==='human','Invalid reviewed identity binding');
  }
  return s;
}
export async function changeInbox(repo, fn) {
  return repo.lock(()=>{repo.assertWritable();const state=readInbox(repo);assert(state.version===2,'Run inbox-migrate --apply before changing legacy inbox state');const result=fn(state);
    validateInbox(state);mkdirSync(join(repo.dir,'inbox'),{recursive:true});writeFileAtomic(inboxPath(repo),JSON.stringify(state,null,2)+'\n');return result;});
}
export function inboxSummary(repo) {
  const s=readInbox(repo),runs=Object.values(s.runs).sort((a,b)=>b.started_at.localeCompare(a.started_at));
  return {schema_version:s.version,migration_needed:s.version<2,last_run:runs[0]??null,last_complete:runs.find(r=>r.status==='complete'&&!r.legacy_unverified)??null,
    excluded_threads:Object.values(s.exclusions??{}).filter(e=>e.enabled).map(e=>({thread_url:e.thread_url,reason:e.reason})),
    pending_reviews:Object.values(s.reviews).filter(r=>r.status==='pending').map(({message,...r})=>r),
    note:'Coverage describes visible Focused and Other inbox folders only. Missing or partial coverage does not establish absence of replies.'};
}
export function pendingReview(state,run,thread,reason,extra={}) {
  if(!extra.message){const pending=Object.values(state.reviews).find(r=>r.status==='pending'&&!r.message&&r.thread_url===threadUrl(thread.thread_url)&&r.reason===reason);if(pending)return pending.id;}
  // Oversized content stays in the visible conversation, not in the private queue.
  if(extra.message?.body?.length>60000)extra={...extra,message:{...extra.message,body:'',oversized:true}};
  const activity=thread.messages?.at(-1);
  const message=extra.message??activity;
  // Stable IDs do not depend on a later improvement to timestamp interpretation.
  const activityKey=message?hash([message.id??null,message.direction??null,message.body??'',message.id?null:(message.timestamp_label??message.at??null)]):'';
  const id=hash(JSON.stringify([threadUrl(thread.thread_url),activityKey,reason]));
  state.reviews[id]??={id,run,status:'pending',reason,thread_url:threadUrl(thread.thread_url),profile_url:thread.profile_url??null,
    name:thread.name??'Unknown',observed_at:thread.observed_at,...extra};return id;
}
