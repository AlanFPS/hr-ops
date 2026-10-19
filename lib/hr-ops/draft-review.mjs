import {scoreProspect,supported} from './model.mjs';
import {claimProse} from './claim-numbers.mjs';

// Narrow editorial checks. These do not infer truth from a pronoun or source text.
export function draftReviewIssues(draft, prospect, config, now = new Date()) {
  const ids=draft.quality?.opening_ids;
  const issues=[];
  if(!Array.isArray(ids)||new Set(ids).size!==ids.length)
    return ['Select distinct quality.opening_ids for the actual hiring signal'];
  if(!ids.length){
    const request=prospect.facts.latam_delivery_request;
    const explicitRequest=prospect.icp==='agency'&&request?.value===true&&request.confidence==='observed'&&
      supported(prospect,request,config.freshness.openings,now)&&
      draft.claims?.some(cl=>cl.kind==='observed'&&cl.text===draft.quality.signal_claim&&request.evidence.every(id=>cl.evidence?.includes(id)));
    if(!explicitRequest)issues.push('An empty opening selection requires a current explicit LATAM delivery request cited by the signal claim');
  }
  const credited=new Set(scoreProspect(prospect,config,now).opening_ids);
  if(ids.some(id=>!credited.has(id)))issues.push('Selected openings must have current validated demand');
  const selected=prospect.openings.filter(o=>ids.includes(o.id));
  const signals=(draft.claims??[]).filter(cl=>cl.kind==='observed');
  const signalEvidence=o=>new Set([...(o.evidence??[]),...(o.verification?.role?.evidence??[]),...(o.verification?.currency?.evidence??[])]);
  const linked=(cl,o)=>cl.evidence?.some(id=>signalEvidence(o).has(id));
  if(selected.length&&!signals.some(cl=>cl.text===draft.quality.signal_claim&&selected.some(o=>linked(cl,o))))
    issues.push('Observed signal citations must link to a selected opening');
  if(selected.some(o=>!signals.some(cl=>linked(cl,o))))
    issues.push('Every selected opening needs an observed signal citation');
  const prose=claimProse([draft.subject??'',draft.body??''].join(' '));
  if(prospect.icp==='agency'&&selected.length>1&&/\b(?:(?:that|this|your|the same|one|a single) client|same employer)\b/i.test(prose))
    issues.push('Multiple agency searches do not establish one shared client; use either search, clients, or select one opening');
  const words={two:2,three:3,four:4,five:5,six:6,seven:7,eight:8,nine:9,ten:10};
  for(const match of prose.matchAll(/\b(\d+|two|three|four|five|six|seven|eight|nine|ten)\s+(?:(?:backend|full[- ]?stack|engineering|open|current|active|distinct|new)\s+)*(hires?|vacanc(?:y|ies)|positions?|roles?|openings?|searches?)\b/gi)) {
    const count=words[match[1].toLowerCase()]??Number(match[1]);
    if(count<=1)continue;
    // Separate posting IDs or different titles are not distinct requisitions.
    const requisitions=selected.filter(o=>o.requisition_id&&o.board).map(o=>JSON.stringify([o.provider??'manual',o.board,o.requisition_id]));
    const explicitPrimaryCount=(draft.claims??[]).some(cl=>cl.kind==='observed'&&cl.text.toLowerCase().includes(match[0].toLowerCase())&&
      cl.evidence?.some(id=>prospect.evidence.some(e=>e.id===id&&e.source_type==='primary'&&e.excerpt_kind==='quote'&&e.excerpt.toLowerCase().includes(match[0].toLowerCase()))));
    if((/^hires?$/i.test(match[2])||count>new Set(requisitions).size)&&!explicitPrimaryCount)
      issues.push('Exact vacancy/hire counts need distinct supported requisitions or an explicit primary count quote; posting records alone are insufficient');
  }
  return [...new Set(issues)];
}
