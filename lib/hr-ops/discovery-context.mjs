import {existsSync,readdirSync} from 'node:fs';
import {join} from 'node:path';
import {domain,scoreProspect} from './model.mjs';
import {sourceCatalog} from './sources.mjs';
import {researchBudget} from './research-run.mjs';
import {researchYield} from './research-outcomes.mjs';

export function discoveryExclusions(repo){
  const rows=repo.list().flatMap(p=>p.domains.map(domain=>({domain,reason:'existing_prospect',prospect_id:p.id})));
  for(const control of sourceCatalog().controls??[])if(control.website)rows.push({domain:domain(control.website),reason:'catalog_control'});
  return [...new Map(rows.map(r=>[r.domain,r])).values()];
}
export function rankedSources(repo,c,sources,now=new Date()){
  const dir=join(repo.dir,'research-runs'),runs=existsSync(dir)?readdirSync(dir).filter(f=>f.endsWith('.json')).map(f=>researchBudget(repo,c,f.slice(0,-5))):[];
  const records=repo.list();
  return sources.map(s=>{
    const aliases=[s.website,s.id,s.url,s.careers_url,s.api].filter(Boolean), key=s.id??s.website??s.url;
    // Normalize only the caller-supplied source's explicit aliases. Do not merge
    // unrelated sources by hostname or let cross-ICP outcomes inflate yield.
    const attributed=runs.map(run=>({...run,attempts:run.attempts.filter(a=>aliases.includes(a.attribution?.source_id)&&[s.icp,'both'].includes(a.attribution?.icp))
      .map(a=>({...a,attribution:{...a.attribution,source_id:key,icp:s.icp}}))}));
    const y=researchYield(attributed,records,p=>scoreProspect(p,c,now))[0];
    const vacancy=s.icp==='agency'&&s.hiring_for==='client'&&!s.identity_stale;
    const quality=!y?'unobserved':y.readable_attempts>0?'readable':y.unresolved_attempts===y.attempts?'unresolved_only':'no_readable_evidence';
    return {...s,source_performance:y??null,priority_basis:{client_vacancy_source:vacancy,
      collection_quality:quality,
      comparison_group:y?.comparison_group??'unobserved',
      readable_demand_per_attempt:y?.attempts?y.distinct_readable_demand_matches/y.attempts:0,
      note:'Within the same source class, prefer readable collections, then unobserved sources, before sources with no readable evidence. This is historical guidance, not permission to retry restricted hosts. Compare yield only within the same request-kind group and attribution convention. Yield is not qualification or buying intent.'}};
  }).sort((a,b)=>{
    const vacancy=s=>Number(s.priority_basis.client_vacancy_source);
    const yieldRate=s=>s.priority_basis.readable_demand_per_attempt;
    const group=s=>['page','query','mixed','unknown','unobserved'].indexOf(s.priority_basis.comparison_group);
    const quality=s=>['readable','unobserved','no_readable_evidence','unresolved_only'].indexOf(s.priority_basis.collection_quality);
    return vacancy(b)-vacancy(a)||quality(a)-quality(b)||group(a)-group(b)||yieldRate(b)-yieldRate(a)||(a.name??a.id??a.url).localeCompare(b.name??b.id??b.url);
  });
}
