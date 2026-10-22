import {readFileSync} from 'node:fs';
import * as yaml from 'js-yaml';
import {sourceCatalog,inspectSources} from './sources.mjs';
import {rankedSources,discoveryExclusions,websiteExclusion} from './discovery-context.mjs';
import {discoveryQueries} from './discovery.mjs';
import {discoveryFeeds} from './discovery-feeds.mjs';
import {assert} from './model.mjs';

export function discoveryPlan(repo,c,{icp='both',now=new Date()}={}){
  assert(['both','agency','startup'].includes(icp),'Invalid ICP');
  const catalog=sourceCatalog(),inspected=inspectSources(c,{starter:true,icp,now});
  const exclusions=discoveryExclusions(repo);
  const seeds=rankedSources(repo,c,inspected.sources,now).filter(s=>!websiteExclusion(exclusions,s.website));
  const retained=yaml.load(readFileSync(new URL('../../templates/portals.example.yml',import.meta.url),'utf8'));
  return {kind:'hr-discovery-plan',icp,network_reads_allowed:false,send_enabled:false,
    company_inventory:{command:'node hr-ops.mjs inventory',queue_command:'node hr-ops.mjs inventory queue',note:'Network-free overlapping inventory of retained companies, enabled seeds, pipeline identities, cached feeds and imported lists. Review unresolved identities before counting new companies.'},
    reusable_sources:{
      feeds:rankedSources(repo,c,discoveryFeeds(c).filter(f=>f.enabled&&(icp==='both'||f.icp===icp)),now),
      directories:rankedSources(repo,c,(catalog.directories??[]).filter(s=>icp==='both'||s.icp===icp),now),
      query_recipes:Object.fromEntries(['agency','startup'].filter(k=>icp==='both'||icp===k).map(k=>[k,discoveryQueries(k,c)])),
    },
    company_seeds:seeds,controls:catalog.controls??[],research_references:catalog.research_references??[],exclusions,source_errors:inspected.diagnostics,
    agency_instructions:'Prioritize attributable client engineering vacancies from verified recruiting firms. Internal vacancies, service descriptions and directories alone do not establish delivery demand. Supplier appetite remains unknown until supported.',
    retained_career_ops_inventory:{path:'templates/portals.example.yml',company_entries:retained.tracked_companies?.length??0,job_boards:retained.job_boards?.length??0,search_recipes:retained.searches?.length??retained.search_queries?.length??0,
      auto_import:false,note:'Legacy enabled flags, AI/visa/Europe filters and company sizes are not HR qualification. Use entries only as leads for current identity, demand and service-fit research.'},
    next_steps:['Configure a scoped research run before feed requests. Feeds require directory allowance and return unverified lead tasks.',
      'Use dedicated agency directories/queries and verified client-vacancy company sources for agency coverage.',
      'Verify lead employer identity and official ownership, then import through discover --new-only --run and research with expected revisions.',
      'Report attempted sources, actual demand, unknowns and shortfalls; do not count seeds or feed records as qualified clients.']};
}
