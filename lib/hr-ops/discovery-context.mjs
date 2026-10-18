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
    return {...s,source_performance:y??null,priority_basis:{client_vacancy_source:vacancy,
      readable_demand_per_attempt:y?.attempts?y.distinct_readable_demand_matches/y.attempts:0,
      note:'Observed research yield, not qualification or buying intent. Unreadable and partial boards remain unresolved.'}};
  }).sort((a,b)=>{
    const vacancy=s=>Number(s.priority_basis.client_vacancy_source);
    const yieldRate=s=>s.priority_basis.readable_demand_per_attempt;
    return vacancy(b)-vacancy(a)||yieldRate(b)-yieldRate(a)||(a.name??a.id??a.url).localeCompare(b.name??b.id??b.url);
  });
}
