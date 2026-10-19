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
export function websiteExclusion(exclusions,website){
  const normalize=d=>d.toLowerCase().replace(/\.$/,'').replace(/^www\./,'');
  const host=normalize(domain(website));
  return exclusions.find(e=>{const known=normalize(e.domain);return host===known||host.endsWith('.'+known);});
}
export function rankedSources(repo,c,sources,now=new Date()){
  const dir=join(repo.dir,'research-runs'),runs=existsSync(dir)?readdirSync(dir).filter(f=>f.endsWith('.json')).map(f=>researchBudget(repo,c,f.slice(0,-5))):[];
  const records=repo.list();
  const entries=sources.map(source=>({source,key:source.id??source.website??source.url,
    aliases:[...new Set([source.website,source.id,source.url,source.careers_url,source.api].filter(Boolean))]}));
  const canonicalKeys=new Set(entries.map(e=>e.key)),owners=new Map();
  for(const entry of entries)for(const alias of entry.aliases){if(!owners.has(alias))owners.set(alias,new Set());owners.get(alias).add(entry.key);}
  return entries.map(({source:s,key,aliases:declaredAliases})=>{
    // A result-reference URL is not an alias for the source that owns that key.
    // Ambiguous noncanonical aliases stay in the ledger, without double credit.
    const aliases=declaredAliases.filter(alias=>alias===key||(!canonicalKeys.has(alias)&&owners.get(alias).size===1));
    // Normalize only the caller-supplied source's explicit aliases. Do not merge
    // unrelated sources by hostname or let cross-ICP outcomes inflate yield.
    const attributed=runs.map(run=>({...run,attempts:run.attempts.filter(a=>aliases.includes(a.attribution?.source_id)&&[s.icp,'both'].includes(a.attribution?.icp))
      .map(a=>({...a,attribution:{...a.attribution,source_id:key,icp:s.icp}}))}));
    const y=researchYield(attributed,records,p=>scoreProspect(p,c,now))[0];
    const vacancy=s.icp==='agency'&&s.hiring_for==='client'&&!s.identity_stale;
    const quality=!y?'unobserved':y.readable_attempts>0?'readable':y.unresolved_attempts===y.attempts?'unresolved_only':'no_readable_evidence';
    return {...s,source_performance:y??null,priority_basis:{client_vacancy_source:vacancy,
      attribution_aliases:aliases,ignored_attribution_aliases:declaredAliases.filter(alias=>!aliases.includes(alias)),
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
