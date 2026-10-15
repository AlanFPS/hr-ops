import { hash, assert, stamp } from './model.mjs';
import { existsSync, readdirSync, readFileSync, lstatSync } from 'node:fs';
import { join } from 'node:path';
import { profileUrl } from './linkedin-browser.mjs';
import { recordInteraction } from './operations.mjs';
import { readInbox, changeInbox, pendingReview, threadUrl } from './inbox-state.mjs';

export function contactMatches(records, target) {
  if(!target)return [];let wanted;try{wanted=profileUrl(target);}catch{return [];}
  return records.flatMap(p=>p.contacts.filter(c=>{
    const urls=[c.url,...c.evidence.map(id=>p.evidence.find(e=>e.id===id)?.url),
      ...p.evidence.filter(e=>e.excerpt.toLowerCase().includes(c.name.toLowerCase())).map(e=>e.url)];
    return urls.some(u=>{try{return profileUrl(u)===wanted;}catch{return false;}});
  }).map(c=>({p,c})));
}
function timeIdentity(at){try{return stamp(at,new Date('9999-12-31T23:59:59.999Z'));}catch{return at??null;}}
const sameOccurrence=(at,m)=>m.timestamp_precision==='minute'?Math.floor(Date.parse(at)/60000)===Math.floor(Date.parse(m.at)/60000):Date.parse(at)===Date.parse(m.at);
export function observedMessageHash(m){return hash(JSON.stringify([m.direction,m.body,timeIdentity(m.at)]));}
export function observedMessageKey(thread,m){return hash(JSON.stringify([threadUrl(thread.thread_url),m.id??[m.direction,timeIdentity(m.at),m.body]]));}
function matchingReceipts(repo,p,contact,m,sender) {
  const dir=join(repo.dir,'delivery-attempts');if(!existsSync(dir))return [];
  assert(!lstatSync(dir).isSymbolicLink(),'Delivery receipts directory must not be a link');
  return readdirSync(dir).filter(name=>/^linkedin-[a-f0-9]+\.json$/.test(name)).flatMap(name=>{
    const path=join(dir,name);assert(!lstatSync(path).isSymbolicLink(),'Delivery receipt must not be a link');
    const r=JSON.parse(readFileSync(path,'utf8')),plan=r.plan;
    if(plan?.prospect_id!==p.id||plan?.contact_id!==contact.id||plan?.sender_profile_url!==sender||plan?.body!==m.body)return [];
    const at=r.click_returned_at??r.attempted_at;
    if(Math.floor(Date.parse(at)/60000)!==Math.floor(Date.parse(m.at)/60000))return [];
    assert(plan.plan_hash===hash(Object.fromEntries(Object.entries(plan).filter(([k])=>k!=='plan_hash'))),'Delivery receipt plan hash mismatch');
    return [{name,receipt:r}];
  });
}
export function optoutMeaning(body) {
  // Conservative full-message patterns. Quotes, forwarding and arbitrary AI instructions are never evaluated as policy.
  const s=body.trim().toLowerCase();
  if(/^(please )?(do not|don't|stop) (contact(ing)?|messag(e|ing)|email(ing)?) me[.!]?$/.test(s)||/^(please )?(unsubscribe me|remove me from your (list|mailing list))[.!]?$/.test(s)||/^(por favor[ ,]*)?(no me (contactes|escribas)|no me contacten|deja de escribirme)[.!]?$/.test(s))return 'clear';
  if(/unsubscribe|stop contacting|do not contact|don't contact|remove me|no me contact|no me escrib/i.test(s))return 'review';
  return null;
}
export async function startInbox(repo,{id,sender_profile_url,authorization,since},now=new Date()) {
  assert(/^[a-zA-Z0-9_-]{1,80}$/.test(id),'Invalid run ID');profileUrl(sender_profile_url);stamp(since,now);
  assert(authorization?.actor==='human'&&authorization.reference?.trim()&&authorization.statement?.trim(),'Actual instruction to import required');
  return changeInbox(repo,s=>{assert(!s.runs[id],'Run already exists; use resume');return s.runs[id]={id,sender_profile_url:profileUrl(sender_profile_url),authorization,since,
    started_at:now.toISOString(),status:'active',visited:[],folders:[],imported:0,reconciled:0,skipped:0,observed_messages:0,coverage_note:null};});
}
export async function importThread(repo,c,runId,thread,now=new Date()) {
  thread.thread_url=threadUrl(thread.thread_url);stamp(thread.observed_at,now);
  const state=readInbox(repo),run=state.runs[runId];assert(run,'Unknown inbox run');
  let matches=contactMatches(repo.list(),thread.profile_url);
  let canonicalProfile;try{canonicalProfile=profileUrl(thread.profile_url);}catch{}
  const binding=state.bindings?.[canonicalProfile];
  if(binding){const p=repo.get(binding.prospect_id),contact=p.contacts.find(x=>x.id===binding.contact_id);assert(contact,'Reviewed contact binding is stale');
    assert(!matches.some(x=>x.p.id!==p.id||x.c.id!==contact.id),'Reviewed binding conflicts with current evidence');matches=[{p,c:contact}];}
  if(thread.participant_count!==2||matches.length!==1){
    return changeInbox(repo,s=>({review:pendingReview(s,runId,thread,thread.participant_count!==2?'Group or ambiguous participants':matches.length?'Multiple prospect matches':'Unknown contact; review business relevance and identity'),imported:0}));
  }
  const {p:original,c:contact}=matches[0];let p=original,imported=0,reconciled=0;
  const businessAnchor=p.interactions.some(e=>e.kind==='sent'&&e.contact_id===contact.id)||
    thread.messages.some(m=>m.direction==='outgoing'&&p.drafts.some(d=>d.contact_id===contact.id&&d.channel==='linkedin'&&d.body===m.body));
  if(!businessAnchor&&!binding?.business_confirmed)return changeInbox(repo,s=>({review:pendingReview(s,runId,thread,'Known contact; confirm recruiting-firm business context before importing history',{prospect_id:p.id,contact_id:contact.id}),imported:0}));
  const duplicateKeys=new Map();for(const m of thread.messages){const key=observedMessageKey(thread,m);duplicateKeys.set(key,(duplicateKeys.get(key)??0)+1);}
  // DOM order is retained for equal minute timestamps. A reply cannot reference a later event.
  for(const m of thread.messages){
    const key=observedMessageKey(thread,m),fingerprint=observedMessageHash(m);
    const queue=async reason=>{
      const id=await changeInbox(repo,s=>pendingReview(s,runId,thread,reason,{prospect_id:p.id,contact_id:contact.id,message:m}));
      const holdId='li-'+key.slice(0,32)+'-review-'+fingerprint.slice(0,16);
      if(m.direction==='incoming'&&typeof m.body==='string'&&optoutMeaning(m.body)&&!p.suppressed&&!p.hold&&
        readInbox(repo).reviews[id].status==='pending'&&!p.interactions.some(e=>e.id===holdId)){
        // This is a new internal hold at collection time, not a guessed historical reply.
        const held=await repo.update(p.id,'inbox-review-hold',record=>recordInteraction(record,{id:holdId,kind:'hold',at:now.toISOString(),
          reason:'Browser-observed opt-out needs review '+id+' in '+thread.thread_url+'. Hold created at collection time; message occurrence remains unresolved.',authorization:run.authorization},c,now),{expectedRevision:p.revision,now});p=held.prospect;
      }
      return id;
    };
    if(m.edited){await queue('Edited message requires review');continue;}
    const seen=readInbox(repo).seen[key];
    if(seen){if(seen.hash!==fingerprint)await queue('Previously observed message changed; preserve historical event');continue;}
    const stopId='li-'+key.slice(0,48)+'-stop',previousStop=p.interactions.find(e=>e.id===stopId);
    if(previousStop&&previousStop.origin?.content_hash!==fingerprint){await queue('Previously observed opt-out changed; preserve suppression history');continue;}
    if(!['incoming','outgoing'].includes(m.direction)||!m.body?.trim()||!m.at||!['exact','minute','human_reported'].includes(m.timestamp_precision)){
      await queue('Message direction, text or occurrence time is incomplete');continue;
    }
    try{stamp(m.at,now);}catch{await queue('Invalid message timestamp');continue;}
    if(!m.id&&(m.timestamp_precision!=='exact'||duplicateKeys.get(key)!==1)){await queue('No stable message ID and unambiguous exact timestamp');continue;}
    const kind=m.direction==='incoming'?'reply':'sent';
    const existing=p.interactions.filter(e=>e.kind===kind&&e.contact_id===contact.id&&e.channel==='linkedin'&&
      (!e.origin?.message_id||!m.id||e.origin.message_id===m.id)&&
      (e.message??e.response)===m.body&&sameOccurrence(e.at,m));
    if(existing.length>1){await queue('Multiple existing interaction matches');continue;}
    if(existing.length===1){
      if(!existing[0].origin?.message_id&&new Set(thread.messages.filter(x=>x.direction===m.direction&&x.body===m.body&&sameOccurrence(existing[0].at,x)).map(x=>observedMessageKey(thread,x))).size>1){await queue('Several observed messages match one manually recorded event');continue;}
      if(Object.entries(readInbox(repo).seen).some(([other,v])=>other!==key&&v.event_id===existing[0].id&&v.prospect_id===p.id)){await queue('Existing event already reconciled to a different observed message');continue;}
      await changeInbox(repo,s=>{s.seen[key]={hash:fingerprint,event_id:existing[0].id,prospect_id:p.id};s.runs[runId].reconciled++;});reconciled++;continue;
    }
    if(p.interactions.some(e=>e.kind===kind&&e.contact_id===contact.id&&e.channel==='linkedin'&&!e.origin?.message_id&&sameOccurrence(e.at,m))){await queue('Nearby manually recorded event has different text; possible edit or rendering difference');continue;}
    const prior=p.interactions.filter(e=>e.kind==='sent'&&e.contact_id===contact.id&&Date.parse(e.at)<=Date.parse(m.at)).sort((a,b)=>Date.parse(a.at)-Date.parse(b.at)).at(-1);
    const origin={method:'linkedin_browser',run:runId,thread_url:thread.thread_url,message_id:m.id??null,observed_at:thread.observed_at,
      timestamp_precision:m.timestamp_precision,content_hash:fingerprint,sender_profile_url:run.sender_profile_url};
    if(kind==='reply'&&!prior){
      const meaning=optoutMeaning(m.body);
      if(meaning&&!previousStop){const result=await repo.update(p.id,'inbox-optout',record=>recordInteraction(record,{id:stopId,kind:meaning==='clear'?'optout':'hold',at:m.at,
        reason:meaning==='clear'?'Observed explicit opt-out; earlier outbound context unavailable':'Possible opt-out requires review; earlier outbound context unavailable',authorization:run.authorization,origin},c,now),{expectedRevision:p.revision,now});p=result.prospect;}
      await queue('Incoming message has no verified earlier sent event');continue;
    }
    let receipts=[];
    try{if(kind==='sent')receipts=matchingReceipts(repo,p,contact,m,run.sender_profile_url);}catch(error){await queue(error.message);continue;}
    if(receipts.length>1){await queue('Multiple delivery receipts match this observed message');continue;}
    const delivery=receipts[0];
    if(delivery&&new Set(thread.messages.filter(x=>x.direction===m.direction&&x.body===m.body&&Math.floor(Date.parse(x.at)/60000)===Math.floor(Date.parse(m.at)/60000)).map(x=>observedMessageKey(thread,x))).size>1){await queue('Several observed messages match one delivery receipt');continue;}
    if(delivery?.receipt.interaction_id){await queue('Delivery receipt references an event that did not match this observation');continue;}
    const event={id:'li-'+key.slice(0,48),kind,at:m.at,channel:'linkedin',contact_id:contact.id,
      ...(kind==='sent'?{message:m.body}:{response:m.body,reply_to:prior.id}),origin,
      ...(delivery?{draft_id:delivery.receipt.plan.draft_id,content_hash:delivery.receipt.plan.content_hash}:{}),
      reason:'Observed in the signed-in LinkedIn conversation; not a newly authorized delivery.'+(delivery?' Matched existing receipt '+delivery.name:''),authorization:run.authorization};
    try{
      const result=await repo.update(p.id,'inbox-observed',record=>{
        const r=recordInteraction(record,event,c,now);
        const disposition=kind==='reply'?optoutMeaning(m.body):null;
        if(disposition&&!previousStop)recordInteraction(record,{id:event.id+'-stop',kind:disposition==='clear'?'optout':'hold',at:m.at,
          reason:disposition==='clear'?'Observed explicit opt-out':'Possible opt-out requires review; outreach held',authorization:run.authorization,origin},c,now);
        return r;
      },{expectedRevision:p.revision,now});p=result.prospect;
      await changeInbox(repo,s=>{s.seen[key]={hash:fingerprint,event_id:event.id,prospect_id:p.id};s.runs[runId].imported++;
        if(kind==='reply'&&optoutMeaning(m.body)==='review')pendingReview(s,runId,thread,'Possible opt-out; hold requires human review',{prospect_id:p.id,contact_id:contact.id,message:m});});
      imported++;
    }catch(error){await queue(error.message);return {imported,reconciled,prospect_id:p.id,incomplete:true,error:error.message};}
  }
  return {imported,reconciled,prospect_id:p.id};
}
