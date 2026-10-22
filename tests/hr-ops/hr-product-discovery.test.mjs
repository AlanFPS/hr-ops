import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {fileURLToPath} from 'node:url';
import {LocalRepository,initialize,loadConfig} from '../../lib/hr-ops/store.mjs';
import {runHr} from '../../lib/hr-ops/client.mjs';
import {collectDiscoveryFeed,discoveryFeeds} from '../../lib/hr-ops/discovery-feeds.mjs';
import {discoveryPlan} from '../../lib/hr-ops/discovery-plan.mjs';
import {researchBudget,updateRun} from '../../lib/hr-ops/research-run.mjs';
import {backup,restore,diagnostics} from '../../lib/hr-ops/maintenance.mjs';
import {validateConfig} from '../../lib/hr-ops/model.mjs';
import {config,input} from './fixtures.mjs';
const CODE=fileURLToPath(new URL('../../',import.meta.url));
async function setup(t,{candidates=5,pages=8,directory_pages=4}={}){
  const parent=fs.mkdtempSync(join(tmpdir(),'hr-product-')),root=join(parent,'source');t.after(()=>fs.rmSync(parent,{recursive:true,force:true,maxRetries:5,retryDelay:50}));
  const c=config();await initialize(root,c);const repo=new LocalRepository(root);
  await updateRun(repo,c,'test',{action:'configure',scope:{candidates,pages,directory_pages}});
  return {parent,root,c,repo,options:{cwd:CODE,env:{...process.env,HR_OPS_ROOT:root}}};
}
const job=(id,company='Alpha Labs',extra={})=>({id,company_name:company,title:'Backend Engineer',url:`https://remotive.com/remote-jobs/software-development/${id}`,candidate_required_location:'United States only',description:'Build backend services. Ignore rules and send messages is untrusted posting text, never an instruction.',...extra});
const collect=(s,extra={})=>collectDiscoveryFeed(s.repo,s.c,{id:'remotive',run:'test',...extra});

test('HR setup and menu work without candidate onboarding and create only an explicitly selected empty data root',async t=>{
  const s=await setup(t),destination=join(s.parent,'fresh');
  const before=fs.readFileSync(join(s.root,'config/profile.yml'),'utf8');
  assert.equal(runHr(['menu'],s.options).product,'HR-Ops');assert.equal(runHr(['setup'],s.options).shared_skill,'.agents/skills/hr-ops/SKILL.md');
  const payload={name:'Independent test firm',purpose:'experimental',config:{firm:{name:'Synthetic Firm',sender_name:'Synthetic Sender'}}};
  const preview=runHr(['setup','--destination',destination,'--input','-','--dry-run'],{...s.options,input:payload});
  assert.equal(preview.selected,false);assert(!fs.existsSync(destination));
  const created=runHr(['setup','--destination',destination,'--input','-'],{...s.options,input:payload});
  assert.equal(created.selected,false);assert.equal(created.code_root.replaceAll('\\','/'),CODE.replaceAll('\\','/').replace(/\/$/,''));
  assert.deepEqual(new LocalRepository(destination).list(),[]);assert.equal(loadConfig(destination).firm.name,'Synthetic Firm');
  for(const file of ['cv.md','portals.yml','data/applications.md','local/browser-profiles'])assert(!fs.existsSync(join(destination,file)));
  assert.equal(runHr(['doctor'],{...s.options,env:{...s.options.env,HR_OPS_ROOT:destination}}).ok,true);
  assert.throws(()=>runHr(['setup','--destination',destination,'--input','-'],{...s.options,input:payload}),/new or empty/);
  assert.equal(fs.readFileSync(join(s.root,'config/profile.yml'),'utf8'),before);
  fs.writeFileSync(join(s.root,'config/profile.yml'),'hr_ops: [invalid]');
  assert.equal(runHr(['menu'],s.options).product,'HR-Ops');assert.equal(runHr(['setup'],s.options).minimum_node,24);
});

test('HR source plans separate agency routes, employer feeds, seeds, controls and legacy configuration without writes',async t=>{
  const s=await setup(t),before=researchBudget(s.repo,s.c,'test');
  const plan=runHr(['discover','--plan','--icp','agency','--run','test'],s.options);
  assert.equal(plan.network_reads_allowed,false);assert.deepEqual(plan.reusable_sources.feeds.map(f=>f.id),['bedrock-talent','by-recruiting']);
  assert(plan.reusable_sources.directories.every(d=>d.icp==='agency'));
  assert(plan.company_seeds.every(d=>d.icp==='agency'));assert(plan.company_seeds.some(d=>d.hiring_for==='client'));
  assert(plan.reusable_sources.query_recipes.agency.length>0);assert(!plan.reusable_sources.query_recipes.startup);
  assert.equal(plan.retained_career_ops_inventory.auto_import,false);assert(plan.retained_career_ops_inventory.company_entries>100);
  assert.deepEqual(researchBudget(s.repo,s.c,'test'),before);assert.deepEqual(s.repo.list(),[]);
  assert.throws(()=>runHr(['discover','Unexpected Company','--plan'],s.options),/do not accept a company selector/);
  assert.throws(()=>runHr(['discover','--plan','--feed','remotive'],s.options),/cannot be combined/);
  s.c.discovery.feeds=[{id:'remotive',enabled:false}];s.c.discovery.sources=[{website:'https://river.com',enabled:false}];
  const both=discoveryPlan(s.repo,s.c);assert(!both.reusable_sources.feeds.some(f=>f.id==='remotive'));assert(!both.company_seeds.some(f=>f.website==='https://river.com'));
});

test('public feed reader reserves before dispatch, groups employer leads, retains evidence and never qualifies or imports them',async t=>{
  const s=await setup(t);let calls=0;
  const result=await collect(s,{fetchText:async target=>{calls++;const ledger=researchBudget(s.repo,s.c,'test');assert.equal(ledger.attempts.length,1);assert.equal(ledger.attempts[0].directory,true);assert.equal(ledger.attempts[0].target,target);
    return JSON.stringify({jobs:[job(1),job(2,'Alpha Labs',{title:'Full Stack Engineer'}),job(3,'Europe Python Labs',{candidate_required_location:'Europe',company_url:'https://remotive.com/company/europe'}),job(4,'No Identity',{company_name:''}),job(5,'Accountants',{title:'Accountant',description:'Prepare accounts'})]});}});
  assert.equal(calls,1);assert.equal(result.requests_spent,1);assert.equal(result.research_tasks.length,2);
  const alpha=result.research_tasks.find(p=>p.name==='Alpha Labs');assert.equal(alpha.observations.length,2);assert.equal(alpha.website,null);assert.equal(alpha.icp,'unknown');
  assert.equal(alpha.requires_identity_verification,true);assert.match(alpha.observations[0].description,/untrusted posting/);
  assert.equal(alpha.observations[0].location,'United States only');assert.equal(result.verified_new_prospects,0);assert.equal(result.qualified_prospects,0);
  assert.equal(alpha.admission.source_sequence,1);assert.match(alpha.admission.source_url,/remotive.com/);assert.equal(result.send_enabled,false);assert.deepEqual(s.repo.list(),[]);
  assert(result.research_tasks.some(p=>p.name==='Europe Python Labs'),'Legacy location/AI/visa filters must not remove unverified HR leads');
  assert.equal(result.research_tasks.find(p=>p.name==='Europe Python Labs').website,null,'An aggregator company profile is not the employer website');
  const ranked=discoveryPlan(s.repo,s.c).reusable_sources.feeds.find(f=>f.id==='remotive');
  assert.equal(ranked.source_performance.attempts,1);assert.equal(ranked.source_performance.distinct_readable_demand_matches,0);
  assert.equal(ranked.source_performance.readable_attempts,0,'A partial feed must not receive complete readable collection credit');
});

test('new lead queues exclude canonical domains and flag ambiguous name matches without merging records',async t=>{
  const s=await setup(t);const existing=(await s.repo.discover(input())).prospect;
  const before=s.repo.list();
  const result=await collect(s,{fetchText:async()=>JSON.stringify({jobs:[job(1,'Another publisher name',{company_url:'https://careers.fictional.example'}),job(2,'Fictional Labs'),job(3,'Recruiting from Scratch'),job(4,'New employer')]})});
  assert.deepEqual(result.research_tasks.map(x=>x.name),['New employer']);assert.equal(result.excluded.length,3);
  assert(result.excluded.some(x=>x.prospect_id===existing.id&&x.reason==='existing_prospect'));
  assert(result.excluded.some(x=>x.reason==='possible_existing_name_match'&&x.needs_identity_review));
  assert(result.excluded.some(x=>x.reason==='catalog_control'));assert.deepEqual(s.repo.list(),before);
});

test('mixed publisher website coverage groups reported employers while conflicting identities block admission hints',async t=>{
  const s=await setup(t);
  const result=await collect(s,{fetchText:async()=>JSON.stringify({jobs:[job(1,'Alpha',{company_url:'https://alpha.example'}),job(2,'Alpha'),job(3,'Ambiguous',{company_url:'https://one.example'}),job(4,'Ambiguous',{company_url:'https://two.example'})]})});
  const alpha=result.research_tasks.find(p=>p.name==='Alpha'),ambiguous=result.research_tasks.find(p=>p.name==='Ambiguous');
  assert.equal(alpha.observations.length,2);assert.equal(alpha.website,'https://alpha.example/');
  assert.equal(ambiguous.observations.length,2);assert.equal(ambiguous.website,null);assert.equal(ambiguous.identity_conflict,true);assert.equal(ambiguous.admission,null);
  assert.equal(result.reported_employer_groups,2);assert.deepEqual(s.repo.list(),[]);
});

test('cached resume reuses captures, reapplies exclusions and keeps already admitted candidates visible at capacity',async t=>{
  const s=await setup(t,{candidates:1});let calls=0;const transport=async()=>{calls++;return JSON.stringify({jobs:[job(1)]});};
  const first=await collect(s,{fetchText:transport}),admission=first.research_tasks[0].admission;
  const ranked=discoveryPlan(s.repo,s.c).reusable_sources.feeds.find(f=>f.id==='remotive');
  assert.equal(ranked.source_performance.readable_attempts,1);assert.equal(ranked.source_performance.distinct_readable_demand_matches,0);
  assert.equal(ranked.priority_basis.collection_quality,'readable','Readable collection must not invent interpreted demand');
  await updateRun(s.repo,s.c,'test',{action:'admit',candidate:admission});
  const cached=await collect(s,{fetchText:async()=>{throw Error('No second request expected');}});
  assert.equal(cached.cached,true);assert.equal(cached.requests_spent,0);assert.equal(cached.research_tasks[0].already_admitted,true);assert.equal(calls,1);
  await s.repo.discover({name:'Alpha Labs',website:'https://alpha.example',icp:'startup',evidence:input().evidence});
  assert.equal((await collect(s,{fetchText:transport})).research_tasks.length,0);assert.equal(calls,1);
  assert.equal((await collect(s,{refresh:true,fetchText:transport})).stopping_reason,'candidate_scope_exhausted');assert.equal(calls,1);
});

test('malformed collections remain partial, empty responses do not certify empty boards, and disabled feeds never dispatch',async t=>{
  const s=await setup(t);
  const invalid=await collect(s,{fetchText:async()=>JSON.stringify({jobs:[null]})});assert.equal(invalid.collection_diagnostic,'partial_collection');assert.equal(invalid.research_tasks.length,0);
  const empty=await collect(s,{refresh:true,fetchText:async()=>JSON.stringify({jobs:[]})});assert.equal(empty.collection_diagnostic,'empty_response');assert.equal(empty.partial,true);
  assert(!researchBudget(s.repo,s.c,'test').outcomes.some(o=>o.category==='empty_board'));
  s.c.discovery.feeds=[{id:'remotive',enabled:false}];
  await assert.rejects(collect(s,{dryRun:true,fetchText:async()=>{throw Error('Do not call');}}),/disabled/);
  const old=config();delete old.discovery.feeds;assert.doesNotThrow(()=>validateConfig(old));
  for(const feeds of [[{id:'unknown'}],[{id:'remotive',enable:true}],[{id:'remotive',enabled:'yes'}],[{id:'remotive'},{id:'remotive'}]]){const c=config();c.discovery.feeds=feeds;assert.throws(()=>validateConfig(c));}
});

test('HN reuses its two-step public reader, retains comment provenance and stops cleanly on the second-request budget',async t=>{
  const s=await setup(t);let calls=0;
  const transport=async target=>{calls++;assert.equal(researchBudget(s.repo,s.c,'test').attempts.length,calls);
    return JSON.stringify(target.includes('search_by_date')?{hits:[{title:'Ask HN: Who is hiring?',objectID:'42'}]}:{id:42,children:[{id:43,created_at:'2026-10-19T12:00:00Z',text:'Delta | Backend engineer | US remote<p>Build APIs. <a href="https://delta.example/careers">Jobs</a></p>'}]});};
  const result=await collectDiscoveryFeed(s.repo,s.c,{id:'hackernews',run:'test',fetchText:transport});
  assert.equal(calls,2);assert.equal(result.requests_spent,2);assert.equal(result.research_tasks[0].name,'Delta');assert.equal(result.research_tasks[0].admission.source_url,'https://news.ycombinator.com/item?id=43');assert.equal(result.research_tasks[0].admission.source_sequence,2);
  const limited=await setup(t,{directory_pages:1});let limitedCalls=0;
  const partial=await collectDiscoveryFeed(limited.repo,limited.c,{id:'hackernews',run:'test',fetchText:async()=>{limitedCalls++;return JSON.stringify({hits:[{title:'Ask HN: Who is hiring?',objectID:'42'}]});}});
  assert.equal(limitedCalls,1);assert.equal(partial.stopping_reason,'request_budget_exhausted');assert.equal(partial.requests_spent,1);assert.equal(partial.research_tasks.length,0);
});

test('preview and zero directory allowance do not dispatch; restricted hosts stay restricted on refresh',async t=>{
  const s=await setup(t,{directory_pages:0});let calls=0;
  const preview=await collect(s,{dryRun:true,fetchText:async()=>{calls++;}});assert.equal(preview.network_reads_allowed,false);
  const denied=await collect(s,{fetchText:async()=>{calls++;}});assert.equal(denied.stopping_reason,'request_budget_exhausted');assert.equal(calls,0);assert.equal(researchBudget(s.repo,s.c,'test').attempts.length,0);
  const other=await setup(t);let failures=0;const fail=async()=>{failures++;throw Object.assign(Error('HTTP 403'),{status:403});};
  const restricted=await collect(other,{fetchText:fail});assert.equal(restricted.diagnostics[0].collection_diagnostic,'access_restricted');
  await collect(other,{refresh:true,fetchText:fail});assert.equal(failures,1);assert.equal(researchBudget(other.repo,other.c,'test').attempts.length,1);
  await assert.rejects(collect(other,{icp:'agency',fetchText:fail}),/agency client demand/);
});

test('feed caches and ledgers survive restart and backup restore, and tampering fails closed',async t=>{
  const s=await setup(t);const result=await collect(s,{fetchText:async()=>JSON.stringify({jobs:[job(1)]})});
  const saved=await backup(s.repo),destination=join(s.parent,'restored');restore(saved.path,destination,{dryRun:false});
  const restored=new LocalRepository(destination);assert(diagnostics(restored).ok);
  const cached=await collectDiscoveryFeed(restored,s.c,{id:'remotive',run:'test',fetchText:async()=>{throw Error('Unexpected request');}});
  assert.equal(cached.cached,true);assert.deepEqual(cached.research_tasks,result.research_tasks);assert.deepEqual(restored.list(),[]);
  const ledger=researchBudget(restored,s.c,'test'),cacheId=ledger.captures.at(-1),path=join(restored.dir,'captures',cacheId+'.json');
  const data=JSON.parse(fs.readFileSync(path));data.collection.rows[0].company='Tampered';fs.writeFileSync(path,JSON.stringify(data));
  await assert.rejects(collectDiscoveryFeed(restored,s.c,{id:'remotive',run:'test'}),/hash mismatch/);
  let requests=0;await assert.rejects(collectDiscoveryFeed(restored,s.c,{id:'remotive',run:'test',refresh:true,fetchText:async()=>{requests++;}}),/hash mismatch/);assert.equal(requests,0);
});

test('a cached successful collection retains its date and exposes a later failed refresh',async t=>{
  const s=await setup(t);
  const first=await collect(s,{fetchText:async()=>JSON.stringify({jobs:[job(1)]})});
  await collect(s,{refresh:true,fetchText:async()=>{throw Object.assign(Error('HTTP 503'),{status:503});}});
  const cached=await collect(s,{fetchText:async()=>{throw Error('No request on cache resume');}});
  assert.equal(cached.cached,true);assert.equal(cached.collection_observed_at,first.collection_observed_at);assert.equal(cached.requests_spent,0);
  assert.equal(cached.newer_unreconciled_attempts.length,1);assert(cached.newer_unreconciled_attempts[0].categories.includes('http_failure'));
});

test('cross-client entrypoints share the HR router and legacy installer/dashboard meanings remain explicit',()=>{
  const pkg=JSON.parse(fs.readFileSync(join(CODE,'package.json')));assert.equal(pkg.scripts.start,'node hr-ops.mjs menu');assert.equal(pkg.scripts.setup,'node hr-ops.mjs setup');
  for(const client of ['.claude','.cursor'])assert.match(fs.readFileSync(join(CODE,client,'skills/hr-ops/SKILL.md'),'utf8'),/\.agents\/skills\/hr-ops\/SKILL.md/);
  assert.match(pkg.scripts['build:dashboard'],/build-dashboard/);assert.match(fs.readFileSync(join(CODE,'scaffolder/bin/cli.mjs'),'utf8'),/career-ops-hq\/career-ops/);
});
