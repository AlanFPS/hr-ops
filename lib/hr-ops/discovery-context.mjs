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
  const yields=researchYield(runs,repo.list(),p=>scoreProspect(p,c,now));
  return sources.map(s=>{
    const y=yields.find(y=>[s.website,s.id,s.url].filter(Boolean).includes(y.source)&&y.icp===s.icp);
    return {...s,source_performance:y??null};
  }).sort((a,b)=>{
    const vacancy=s=>s.icp==='agency'&&s.hiring_for==='client'?1:0;
    const yieldRate=s=>s.source_performance?.readable_attempts?s.source_performance.distinct_validated_demand_matches/s.source_performance.readable_attempts:0;
    return vacancy(b)-vacancy(a)||yieldRate(b)-yieldRate(a)||(a.name??a.id??a.url).localeCompare(b.name??b.id??b.url);
  });
}
