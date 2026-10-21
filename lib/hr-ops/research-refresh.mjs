import {assert, canonical, fresh, hash, rankedContacts, supported} from './model.mjs';
import {researchTasks} from './operations.mjs';
import {readCapture} from './feed-captures.mjs';
import {classifyLiveness} from '../../liveness-core.mjs';

// Advisory projection over canonical state and its existing snapshots. It never
// closes an opening, rewrites a decision, or interprets absence from a feed.
function openingValue(o) {
  const fields=['title','url','location','status','hiring_for','role_family','requisition_id','posting_id','board','reconciliation_needed'];
  return {...Object.fromEntries(fields.map(k=>[k,o[k]??null])), reconciliation_needed:!!o.reconciliation_needed,
    verification:Object.fromEntries(Object.entries(o.verification??{}).map(([k,v])=>[k,v.status])),
    eligibility:o.eligibility?.status??'unknown', geography:o.eligibility?.geography??null};
}

function changes(p) {
  const event=p.history.findLast(h=>['research','collect-openings'].includes(h.action)&&h.before&&h.after);
  if(!event)return {baseline:null,added:[],changed:[],removed:[],facts:[],contacts:{added:[],changed:[],removed:[]},note:'No comparable research snapshot. No change inferred.'};
  const before=new Map(event.before.openings.map(o=>[o.id,o]));
  const after=new Map(event.after.openings.map(o=>[o.id,o]));
  const contactsBefore=new Map((event.before.contacts??[]).map(c=>[c.id,c]));
  const contactsAfter=new Map((event.after.contacts??[]).map(c=>[c.id,c]));
  const contactValue=c=>({...Object.fromEntries(['name','title','url','email'].map(k=>[k,c[k]??null])),
    supplier_authority:{value:c.supplier_authority?.value??null,confidence:c.supplier_authority?.confidence??'unknown'}});
  const changed=(a,b)=>JSON.stringify(canonical(a))!==JSON.stringify(canonical(b));
  return {baseline:{history_id:event.id,at:event.at,action:event.action},
    added:[...after.keys()].filter(id=>!before.has(id)),
    changed:[...after.keys()].filter(id=>before.has(id)&&changed(openingValue(before.get(id)),openingValue(after.get(id)))),
    removed:[...before.keys()].filter(id=>!after.has(id)),
    facts:Object.keys(event.after.facts).filter(k=>changed(
      {value:event.before.facts[k]?.value??null,confidence:event.before.facts[k]?.confidence??'unknown'},
      {value:event.after.facts[k].value,confidence:event.after.facts[k].confidence})),
    contacts:{added:[...contactsAfter.keys()].filter(id=>!contactsBefore.has(id)),
      changed:[...contactsAfter.keys()].filter(id=>contactsBefore.has(id)&&changed(contactValue(contactsBefore.get(id)),contactValue(contactsAfter.get(id)))),
      removed:[...contactsBefore.keys()].filter(id=>!contactsAfter.has(id))},
    note:'Recorded differences in the latest research write, not verified market changes or distinct hire counts. Historical schemas are compared without rewriting them.'};
}

function captureSignal(repo,o,c,now,cache) {
  if(!o.capture)return null;
  if(!cache.has(o.capture)){
    const value=readCapture(repo,o.capture);
    if(Array.isArray(value.jobs)){
      const content=JSON.stringify(value.jobs);
      assert(value.content_sha256===hash(content)&&hash(JSON.stringify({board:value.url,observed_at:value.observed_at,content}))===o.capture,'Opening board capture hash mismatch');
      assert(value.jobs.every(j=>j&&typeof j.url==='string'&&typeof j.title==='string'),'Invalid captured job identity');
    }
    assert(value.jobs===undefined||Array.isArray(value.jobs),'Invalid opening board capture');
    cache.set(o.capture,value);
  }
  const capture=cache.get(o.capture);
  // A whole board, search snippet or another role is never a liveness input.
  const candidates=(capture.jobs??[]).filter(j=>
    o.posting_id&&o.board===capture.url?j.posting_id===o.posting_id:
      [o.url,...(o.aliases??[])].includes(j.url)&&j.title.trim().toLowerCase()===o.title.trim().toLowerCase());
  if(candidates.length!==1||typeof candidates[0].description!=='string')return null;
  const job=candidates[0];
  return {capture_id:o.capture,observed_at:capture.observed_at,stale:!fresh(capture.observed_at,c.freshness.openings,now),
    ...classifyLiveness({requestedUrl:job.url,finalUrl:job.url,bodyText:job.description}),advisory:true,
    note:'Retained role text only. Reverify on the official source before any currentness decision. This signal never closes or qualifies an opening.'};
}

export function refreshResearchTask(repo,p,c,now=new Date()) {
  const brief=researchTasks(p,c,now),contacts=rankedContacts(p,c,now),captures=new Map();
  const request=p.facts.latam_delivery_request;
  const explicitDelivery=p.icp==='agency'&&request?.confidence==='observed'&&request.value===true&&
    supported(p,request,Math.min(c.freshness.facts,c.freshness.openings),now);
  const openings=p.openings.filter(o=>o.status==='open'||o.reconciliation_needed).map(o=>({id:o.id,url:o.url,status:o.status,
    stale:!fresh(o.verified_at,c.freshness.openings,now)||o.evidence.some(id=>!fresh(p.evidence.find(e=>e.id===id)?.observed_at,c.freshness.openings,now)),
    reconciliation_needed:!!o.reconciliation_needed,reviewed:o.reviewed!==false,
    verification_gaps:brief.opening_verification_gaps.filter(g=>g.id===o.id||g.opening_id===o.id),
    eligibility:o.eligibility?.status??'unknown',liveness:captureSignal(repo,o,c,now,captures)}));
  const reasons=[];
  if(openings.some(o=>o.reconciliation_needed))reasons.push('opening_reconciliation');
  if(openings.some(o=>o.stale)||brief.stale_fields.length||contacts.some(c=>!c.current))reasons.push('stale_evidence');
  if(openings.some(o=>o.liveness?.result==='expired'&&['http_gone','expired_body','expired_url'].includes(o.liveness.code)))reasons.push('liveness_review');
  if(!brief.score.opening_count&&!explicitDelivery)reasons.push('verify_demand');
  if(brief.opening_verification_gaps.length||openings.some(o=>!o.reviewed||['unknown','possible'].includes(o.eligibility)))reasons.push('opening_scope_review');
  if(!contacts.some(c=>c.current&&c.relevance==='decision-maker'))reasons.push('verify_contact');
  if(brief.unknown_fields.length||brief.score.gaps.length)reasons.push('resolve_research_gaps');
  return {prospect_id:p.id,revision:p.revision,company:p.name,icp:p.icp,reasons,
    urgency:reasons.includes('opening_reconciliation')?0:reasons.includes('stale_evidence')||reasons.includes('liveness_review')?1:2,
    openings,demand_basis:brief.score.opening_count?'reviewed_openings':explicitDelivery?'explicit_delivery_request':'unverified',
    unknown_fields:brief.unknown_fields,stale_fields:brief.stale_fields,
    qualification_gaps:brief.score.gaps,next_action:brief.next_action,
    contacts:contacts.map(c=>({id:c.id,current:c.current,relevance:c.relevance,authority_level:c.authority_level})),
    recorded_changes:changes(p),checks:brief.tasks,
    country_scope_check:'Verify each relevant opening country and engagement scope; remote or timezone overlap alone is insufficient.',
    supplier_check:p.icp==='agency'?'Verify client attribution, restrictions, incremental delivery fit and supplier appetite. Unstated appetite remains unknown.':'Check no-agency policies and incremental service fit. Demand alone does not establish supplier appetite.',
    network_reads_allowed:false,send_enabled:false};
}
