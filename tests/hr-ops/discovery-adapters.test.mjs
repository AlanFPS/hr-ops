import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {LocalRepository,initialize} from '../../lib/hr-ops/store.mjs';
import {collectDiscoveryFeed,discoveryFeeds} from '../../lib/hr-ops/discovery-feeds.mjs';
import {updateRun,researchBudget,reserveResearch} from '../../lib/hr-ops/research-run.mjs';
import {inventoryView} from '../../lib/hr-ops/inventory.mjs';
import {backup,restore,diagnostics} from '../../lib/hr-ops/maintenance.mjs';
import {validateConfig} from '../../lib/hr-ops/model.mjs';
import {config,input} from './fixtures.mjs';

async function setup(t,{directory_pages=4}={}){
  const parent=fs.mkdtempSync(join(tmpdir(),'hr-adapters-')),root=join(parent,'source');
  t.after(()=>fs.rmSync(parent,{recursive:true,force:true,maxRetries:5,retryDelay:50}));
  const c=config();await initialize(root,c);const repo=new LocalRepository(root);
  await updateRun(repo,c,'adapters',{action:'configure',scope:{candidates:5,pages:8,directory_pages}});
  return {parent,root,c,repo};
}
const speedJob=(extra={})=>({id:'posting-123',title:'Backend Engineer',company:'Example Startup',company_slug:'example',
  company_url:'https://speedrun-talent-network.com/companies/example',url:'https://speedrun-talent-network.com/jobs/example-backend',
  location:'Remote Americas',remote:true,published_at:'2026-09-01T00:00:00Z',stealth:false,company_size:'11_50',company_stage:'seed',tier:'speedrun',...extra});
const payload=(jobs=[speedJob()],extra={})=>JSON.stringify({jobs,page:0,page_size:50,total:jobs.length,total_pages:Math.ceil(jobs.length/50),facets:{size:{'11_50':1}},scope:'portfolio',...extra});
const card=(id,title='Backend Engineer',extra='Remote US only')=>`<a class="job-card" href="/jobs/${id}"><h3>${title}</h3><span>Direct Hire</span><span>Confidential client</span><p>${extra}</p></a>`;
const board=(cards=card(1),count=1)=>`<h1>Open Positions</h1><p>Browse current opportunities from our partner companies.</p><p>${count} open positions</p>${cards}`;
const collect=(s,id,extra={})=>collectDiscoveryFeed(s.repo,s.c,{id,run:'adapters',...extra});

test('agency board reads stay inside the existing company cap and receipts/review advertise only usable allowance',async t=>{
  const s=await setup(t);await collect(s,'by-recruiting',{fetchText:async()=>board()});
  const attempt={kind:'page',company:'https://www.byrecruiting.com',candidate_names:['BY Recruiting'],target:'https://www.byrecruiting.com/jobs/1'};
  for(const remaining of [4,3,2,1,0]){
    const receipt=await reserveResearch(s.repo,s.c,'adapters',attempt);assert.equal(receipt.remaining,remaining);
    const review=await updateRun(s.repo,s.c,'adapters',{action:'review'});
    assert.equal(review.continuation_review.candidates[0].pages_remaining,remaining);
  }
  const before=researchBudget(s.repo,s.c,'adapters');
  await assert.rejects(reserveResearch(s.repo,s.c,'adapters',attempt),/budget|exhausted/i);
  assert.deepEqual(researchBudget(s.repo,s.c,'adapters'),before);
  const aliases=await setup(t);
  for(let i=0;i<3;i++)await reserveResearch(aliases.repo,aliases.c,'adapters',{kind:'page',company:attempt.company,target:attempt.target,candidate_names:[],directory:true});
  for(let i=0;i<3;i++)await reserveResearch(aliases.repo,aliases.c,'adapters',attempt);
  await reserveResearch(aliases.repo,aliases.c,'adapters',{...attempt,company:'https://other-agency-domain.example'});
  const aliasReview=await updateRun(aliases.repo,aliases.c,'adapters',{action:'review'});
  assert.equal(aliasReview.continuation_review.candidates[0].pages_remaining,1,'Exhausting one domain must not hide remaining allowance on another known route');
});

test('Speedrun makes one reserved read, preserves raw identity/facets, masks stay masked and no facts are promoted',async t=>{
  const s=await setup(t);let calls=0;
  s.c.discovery.feeds=[{id:'speedrun',filters:{q:'backend',size:'11_50',wp:'remote'}}];validateConfig(s.c);
  const result=await collect(s,'speedrun',{fetchText:async target=>{
    calls++;assert.equal(researchBudget(s.repo,s.c,'adapters').attempts.length,calls);
    const u=new URL(target);assert.equal(u.searchParams.get('page'),'0');assert.equal(u.searchParams.get('source'),'hr-ops');
    assert.equal(u.searchParams.get('scope'),'portfolio');assert.equal(u.searchParams.get('size'),'11_50');
    return payload([speedJob(),speedJob({stealth:true,company:'Stealth',id:'masked',title:'Backend Engineer'})]);
  }});
  assert.equal(calls,1);assert.equal(result.research_tasks.length,1);assert.equal(result.requests_spent,1);
  const task=result.research_tasks[0],row=task.observations[0];
  assert.equal(task.website,null);assert.equal(task.website_status,'unknown');assert.equal(task.route_hint,'startup');
  assert.equal(row.posting_id,'posting-123');assert.equal(row.provider_metadata.company_slug,'example');
  assert.equal(row.provider_metadata.reported_size,'11_50');assert.equal(row.provider_metadata.reported_stage,'seed');
  assert.equal(row.description,'');assert.equal(row.posted_at_status,'parsed_unreviewed');
  assert(row.source_url.startsWith('https://speedrun-talent-network.com/jobs/'));
  assert.equal(result.qualified_prospects,0);assert.deepEqual(s.repo.list(),[]);
  assert(task.inventory_observation_ids.length);assert(!JSON.stringify(inventoryView(s.repo,s.c)).includes('masked'));
  const raw=JSON.parse(fs.readFileSync(join(s.repo.dir,'captures',result.facets_capture_id+'.json')));
  assert.deepEqual(JSON.parse(raw.content).facets,{size:{'11_50':1}});
  const resumed=await collect(s,'speedrun',{fetchText:async()=>assert.fail('No request on resume')});assert(resumed.cached);
});

test('Speedrun scope, pagination and malformed metadata never imply exhaustive results or widen scope',async t=>{
  const s=await setup(t);
  const partial=await collect(s,'speedrun',{fetchText:async()=>payload([speedJob()],{total:80,total_pages:2})});
  assert.equal(partial.collection_partial,true);assert.equal(partial.requests_spent,1);assert.equal(partial.collection_scope,'first public page only');
  const mismatch=await collect(s,'speedrun',{refresh:true,fetchText:async()=>payload(undefined,{scope:'everywhere'})});
  assert.equal(mismatch.research_tasks.length,0);assert.equal(mismatch.stopping_reason,'source_unresolved');
  const malformed=await collect(s,'speedrun',{refresh:true,fetchText:async()=>JSON.stringify({jobs:'not an array'})});
  assert.equal(malformed.research_tasks.length,0);assert.equal(malformed.stopping_reason,'source_unresolved');
  assert(!researchBudget(s.repo,s.c,'adapters').outcomes.some(o=>o.category==='empty_board'));
});

test('filter combinations retain separate caches and strict user config cannot inject endpoints, pages or typos',async t=>{
  const s=await setup(t);let calls=0;
  const fetchText=async()=>{calls++;return payload();};
  await collect(s,'speedrun',{fetchText});
  s.c.discovery.feeds=[{id:'speedrun',filters:{q:'backend',scope:'speedrun'}}];
  await collect(s,'speedrun',{fetchText:async()=>{calls++;return payload(undefined,{scope:'speedrun'});}});
  s.c.discovery.feeds=[];const cache=await collect(s,'speedrun',{fetchText:async()=>assert.fail('Use original query cache')});
  assert(cache.cached);assert.equal(calls,2);assert(inventoryView(s.repo,s.c).summary.observations_by_layer.feed>=2);
  for(const entry of [{id:'speedrun',filters:{page:'1'}},{id:'speedrun',filters:{scope:'all'}},
    {id:'speedrun',filters:{api:'https://elsewhere.example'}},{id:'speedrun',filters:{size:50}},
    {id:'remotive',filters:{q:'backend'}}]){s.c.discovery.feeds=[entry];assert.throws(()=>validateConfig(s.c));}
});

test('BY Recruiting stays one agency, preserves restrictions and private client labels, never imports clients or counts hires',async t=>{
  const s=await setup(t);
  const result=await collect(s,'by-recruiting',{icp:'agency',fetchText:async()=>board(card(1)+card(2,'Full Stack Engineer','US Canada LatAm scope needs review'),2)});
  assert.equal(result.requests_spent,1);assert.equal(result.research_tasks.length,1);
  const task=result.research_tasks[0];assert.equal(task.name,'BY Recruiting');assert.equal(task.route_hint,'agency');
  assert.equal(task.observations.length,2);assert.match(task.observations[0].description,/US only/);
  assert.equal(task.observations[0].provider_metadata.hiring_for,'unreviewed');
  assert.equal(task.observations[0].provider_metadata.supplier_appetite,'unknown');
  assert.equal(result.qualified_prospects,0);assert.deepEqual(s.repo.list(),[]);
  const inventory=inventoryView(s.repo,s.c);const observed=inventory.companies.flatMap(g=>g.observations).filter(o=>o.feed_id==='by-recruiting');
  assert.equal(observed.length,2);assert(observed.every(o=>o.icp_hint==='agency'));
  assert(!inventory.companies.some(g=>g.name==='Confidential client'));
  const repeat=await collect(s,'by-recruiting',{icp:'agency',fetchText:async()=>assert.fail('Cached board')});assert(repeat.cached);
  await assert.rejects(collect(s,'by-recruiting',{icp:'startup'}),/requested ICP/);
});

test('agency services-only or changed layouts fail closed; truncation and pagination stay partial, explicit zero is not qualification',async t=>{
  const s=await setup(t);
  const wrong=await collect(s,'by-recruiting',{fetchText:async()=>'<h1>Our engineering recruiting services</h1>'+card(1)});
  assert.equal(wrong.stopping_reason,'source_unresolved');assert.equal(wrong.research_tasks.length,0);
  assert(researchBudget(s.repo,s.c,'adapters').outcomes.some(o=>o.sequence===1&&o.category==='partial_collection'),'Readable services text must not earn complete board credit');
  const partial=await collect(s,'by-recruiting',{fetchText:async()=>board(card(1),5)});assert(partial.collection_partial);
  const zero=await collect(s,'by-recruiting',{refresh:true,fetchText:async()=>board('',0)});
  assert.equal(zero.raw_postings,0);assert.equal(zero.collection_partial,false);assert.equal(zero.collection_diagnostic,'empty_response');
  assert.equal(zero.qualified_prospects,0);assert.equal(researchBudget(s.repo,s.c,'adapters').attempts.length,3);
});

test('new adapters honor preview, no retries, disabled catalog overrides and request caps before dispatch',async t=>{
  const s=await setup(t,{directory_pages:0});let calls=0;
  for(const id of ['speedrun','by-recruiting']){
    const preview=await collect(s,id,{dryRun:true,fetchText:async()=>calls++});assert.equal(preview.network_reads_allowed,false);
    const denied=await collect(s,id,{fetchText:async()=>calls++});assert.equal(denied.stopping_reason,'request_budget_exhausted');
  }
  assert.equal(calls,0);s.c.discovery.sources=[{website:'https://byrecruiting.com',enabled:false}];
  assert.equal(discoveryFeeds(s.c).find(f=>f.id==='by-recruiting').enabled,false);
  await assert.rejects(collect(s,'by-recruiting',{fetchText:async()=>calls++}),/disabled/);
  s.c.discovery.sources=[{website:'https://WWW.BYRECRUITING.COM./careers',enabled:false}];
  assert.equal(discoveryFeeds(s.c).find(f=>f.id==='by-recruiting').enabled,false);
  s.c.discovery.sources.push({website:'https://byrecruiting.com',enabled:true});
  assert.equal(discoveryFeeds(s.c).find(f=>f.id==='by-recruiting').enabled,true,'Last domain override wins');
  const other=await setup(t);let failures=0;
  const failed=await collect(other,'speedrun',{fetchText:async()=>{failures++;throw Object.assign(Error('HTTP 503'),{status:503});}});
  assert.equal(failures,1);assert.equal(failed.requests_spent,1);assert.equal(failed.diagnostics[0].collection_diagnostic,'http_failure');
});

test('new feed inventory and captures survive restore; existing agencies remain refresh work, never new-company completion',async t=>{
  const s=await setup(t);
  const originalSpeedrun=await collect(s,'speedrun',{fetchText:async()=>payload()});
  const p=await s.repo.discover({...input(),name:'BY Recruiting',website:'https://www.byrecruiting.com',icp:'agency'});
  const result=await collect(s,'by-recruiting',{fetchText:async()=>board()});
  assert.equal(result.research_tasks.length,0);assert.equal(result.excluded.length,1);
  assert.equal(result.excluded[0].prospect_id,p.prospect.id);assert.equal(result.excluded[0].observations.length,1);
  assert.match(result.excluded[0].refresh_instruction,/existing agency/);assert.equal(result.verified_new_prospects,0);
  const saved=await backup(s.repo),destination=join(s.parent,'restored');restore(saved.path,destination,{dryRun:false});
  const restored=new LocalRepository(destination);assert(diagnostics(restored).ok);
  const cached=await collectDiscoveryFeed(restored,s.c,{id:'by-recruiting',run:'adapters',fetchText:async()=>assert.fail('No network after restore')});
  assert(cached.cached);assert.deepEqual(cached.excluded,result.excluded);assert.equal(restored.list().length,1);
  const restoredSpeedrun=await collectDiscoveryFeed(restored,s.c,{id:'speedrun',run:'adapters',fetchText:async()=>assert.fail('No Speedrun network after restore')});
  assert(restoredSpeedrun.cached);assert.deepEqual(restoredSpeedrun.research_tasks,originalSpeedrun.research_tasks);
});
