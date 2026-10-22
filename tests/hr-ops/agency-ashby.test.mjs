import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {initialize,LocalRepository} from '../../lib/hr-ops/store.mjs';
import {collectDiscoveryFeed} from '../../lib/hr-ops/discovery-feeds.mjs';
import {discoveryFeeds} from '../../lib/hr-ops/feed-contract.mjs';
import {inventoryView} from '../../lib/hr-ops/inventory.mjs';
import {updateRun,researchBudget,reserveResearch} from '../../lib/hr-ops/research-run.mjs';
import {backup,restore,diagnostics} from '../../lib/hr-ops/maintenance.mjs';
import {config,input} from './fixtures.mjs';
const job=(id='p1',extra={})=>({id,title:'Full Stack Engineer',jobUrl:'https://jobs.ashbyhq.com/bedrock-talent/'+id,isListed:true,
 descriptionPlain:'Our anonymous client needs Python and TypeScript. Remote label, but primarily in person in New York; U.S. authorization required.',
 location:'New York',workplaceType:'Hybrid',isRemote:true,secondaryLocations:[{location:'United States'}],publishedAt:'2026-09-01T00:00:00Z',...extra});
const body=(jobs=[job()],extra={})=>JSON.stringify({apiVersion:'1',jobs,...extra});
async function setup(t){
 const parent=fs.mkdtempSync(join(tmpdir(),'hr-agency-ashby-')),root=join(parent,'workspace'),c=config();
 t.after(()=>fs.rmSync(parent,{recursive:true,force:true,maxRetries:5,retryDelay:50}));await initialize(root,c);const repo=new LocalRepository(root);
 await updateRun(repo,c,'agency',{action:'configure',scope:{candidates:3,pages:6,directory_pages:3}});return {root,parent,c,repo};
}
const collect=(s,extra={})=>collectDiscoveryFeed(s.repo,s.c,{id:'bedrock-talent',run:'agency',icp:'agency',...extra});
test('one bounded agency ATS request retains body restrictions and separate identities without client inference',async t=>{
 const s=await setup(t);let calls=0;
 const r=await collect(s,{fetchText:async target=>{calls++;assert.equal(researchBudget(s.repo,s.c,'agency').attempts.length,1);
  assert.equal(target,'https://api.ashbyhq.com/posting-api/job-board/bedrock-talent');return body([job('p1',{requisition_id:'r1'}),job('p2',{title:'Internal Backend Engineer',descriptionPlain:'Join our own internal backend team.'})]);}});
 assert.equal(calls,1);assert.equal(r.research_tasks.length,1);assert.equal(r.research_tasks[0].name,'Bedrock Talent');assert.equal(r.raw_postings,2);
 const rows=r.research_tasks[0].observations;assert.equal(rows[0].posting_id,'p1');assert.equal(rows[0].provider_metadata.requisition_id,'r1');
 assert.equal(rows[0].provider_metadata.hiring_for,'unreviewed');assert.equal(rows[1].provider_metadata.hiring_for,'unreviewed');
 assert.match(rows[0].description,/in person in New York/);assert(!rows[0].location.includes('Remote'));assert.equal(rows[0].provider_metadata.supplier_appetite,'unknown');
 assert.equal(r.qualified_prospects,0);assert.equal(s.repo.list().length,0);
 assert(inventoryView(s.repo,s.c).companies.some(g=>g.name==='Bedrock Talent'&&g.identity_status==='unresolved'));
 const replay=await collect(s,{fetchText:async()=>assert.fail('Cached read must not dispatch')});assert(replay.cached);assert.equal(replay.requests_spent,0);
 const snap=await backup(s.repo),dest=join(s.parent,'restored');restore(snap.path,dest,{dryRun:false});
 assert(diagnostics(new LocalRepository(dest)).ok);assert(inventoryView(new LocalRepository(dest),s.c).summary.observations_by_layer.feed===2);
});
test('malformed boards, wrong tenants and unlisted rows never become complete empty demand',async t=>{
 for(const payload of [JSON.stringify({jobs:[]}),JSON.stringify({apiVersion:'1',jobs:null}),body([job('wrong',{jobUrl:'https://jobs.ashbyhq.com/other/p1'})]),body([null]),body([job('hidden',{isListed:false})])]){
  const s=await setup(t),r=await collect(s,{fetchText:async()=>payload});
  assert.equal(r.research_tasks.length,0);assert(r.stopping_reason==='source_unresolved'||r.collection_partial);assert.equal(s.repo.list().length,0);
  assert(!researchBudget(s.repo,s.c,'agency').outcomes.some(o=>o.category==='empty_board'));
 }
 const s=await setup(t),empty=await collect(s,{fetchText:async()=>body([])});assert.equal(empty.raw_postings,0);assert.equal(empty.collection_partial,false);
});
test('source and feed overrides, ICP routing, budget denial and failures prevent hidden requests or retries',async t=>{
 const s=await setup(t);let calls=0;const fetchText=async()=>{calls++;const e=Error('Rate restricted');e.status=429;throw e;};
 s.c.discovery.sources=[{website:'https://www.bedrocktalent.io/',enabled:false}];assert.equal(discoveryFeeds(s.c).find(f=>f.id==='bedrock-talent').enabled,false);
 await assert.rejects(collect(s,{fetchText}),/disabled/);assert.equal(calls,0);s.c.discovery.sources=[];
 await assert.rejects(collect(s,{icp:'startup',fetchText}),/requested ICP/);assert.equal(calls,0);
 const failed=await collect(s,{fetchText});assert.equal(calls,1);assert.equal(failed.requests_spent,1);assert.equal(researchBudget(s.repo,s.c,'agency').attempts.length,1);
  const blocked=await collect(s,{fetchText});assert.equal(blocked.requests_spent,0);assert.equal(calls,1);assert.equal(researchBudget(s.repo,s.c,'agency').attempts.length,1);
 s.c.discovery.feeds=[{id:'bedrock-talent',enabled:false}];await assert.rejects(collect(s,{fetchText}),/disabled/);assert.equal(calls,1);
});

test('agency directory caps stop dispatch, while existing agencies remain refresh work',async t=>{
 const denied=await setup(t);let calls=0;
 for(let i=0;i<3;i++)await reserveResearch(denied.repo,denied.c,'agency',{kind:'page',company:'https://fixture.example',target:'https://fixture.example/'+i,candidate_names:[],directory:true});
 const result=await collect(denied,{fetchText:async()=>{calls++;return body();}});assert.equal(result.stopping_reason,'request_budget_exhausted');assert.equal(calls,0);
 const s=await setup(t);await s.repo.discover({...input(),name:'Bedrock Talent',website:'https://bedrocktalent.io',icp:'agency'});
 const r=await collect(s,{fetchText:async()=>body()});assert.equal(r.research_tasks.length,0);assert.equal(r.excluded[0].reason,'existing_prospect');
 assert.match(r.excluded[0].refresh_instruction,/existing agency/);assert.equal(s.repo.list().length,1);
});

test('missing IDs, bounded descriptions and retained-row caps remain partial across cache reloads',async t=>{
 const s=await setup(t),rows=Array.from({length:201},(_,i)=>job('posting-'+i));rows[0]=job(undefined,{id:undefined,title:'Full Stack Engineer '+ 'x'.repeat(410),descriptionPlain:'text '.repeat(4500)});
 const r=await collect(s,{fetchText:async()=>body(rows)});assert.equal(r.raw_postings,201);assert.equal(r.retained_observations,200);assert.equal(r.collection_partial,true);
 const first=r.research_tasks[0].observations[0];assert.equal(first.posting_id,null);assert.equal(first.description.length,20000);
 const cache=await collect(s,{fetchText:async()=>assert.fail('Cache must not dispatch')});assert(cache.cached);assert.equal(cache.collection_partial,true);
});

test('unexpected pagination and ambiguous posting identity stay partial without extra requests or cache corruption',async t=>{
 for(const paging of [{next_cursor:'next'}, {links:{next:'https://elsewhere.example/page'}}, {pagination:{}}, {offset:0}, {total:99}]){
  const s=await setup(t);let calls=0;const r=await collect(s,{fetchText:async()=>{calls++;return body([job()],paging);}});
  assert.equal(calls,1);assert.equal(r.collection_partial,true);
 }
 const s=await setup(t),r=await collect(s,{fetchText:async()=>body([job('same',{id:null,requisition_id:'one',descriptionPlain:'First unverified body.'}),job('same',{id:null,requisition_id:'two',descriptionPlain:'Second unverified body.'})])});
 assert.equal(r.collection_partial,true);assert.equal(r.retained_observations,2);assert.equal(diagnostics(s.repo).ok,true);
 const replay=await collect(s,{fetchText:async()=>assert.fail('No dispatch for ambiguous cached rows')});assert(replay.cached);assert.equal(s.repo.list().length,0);
});
