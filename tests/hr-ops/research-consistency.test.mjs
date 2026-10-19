import test from 'node:test';import assert from 'node:assert/strict';
import { mkdtempSync,rmSync } from 'node:fs';import {join} from 'node:path';import {tmpdir} from 'node:os';
import { LocalRepository } from '../../lib/hr-ops/store.mjs';
import { reserveResearch,researchBudget,updateRun,captureSource } from '../../lib/hr-ops/research-run.mjs';
import { researchYield } from '../../lib/hr-ops/research-outcomes.mjs';
import { sourceCatalog,inspectSources } from '../../lib/hr-ops/sources.mjs';
import { researchTasks } from '../../lib/hr-ops/operations.mjs';
import { discoverSources,discoveryQueries } from '../../lib/hr-ops/discovery.mjs';
import { config,input,prospect,now } from './fixtures.mjs';
function setup(t){const root=mkdtempSync(join(tmpdir(),'hr-yield-'));t.after(()=>rmSync(root,{recursive:true,force:true}));return {repo:new LocalRepository(root),c:config()};}
test('attributed outcomes preserve budgets, unique demand counts and historical unknown attribution',async t=>{
 const {repo,c}=setup(t);const p=(await repo.discover(input(),{now})).prospect;
 await reserveResearch(repo,c,'run',{kind:'query',target:'engineering firms',attribution:{source_id:'agency-vacancies',icp:'agency',query_recipe:'client-engineering'}},{now});
 const outcome={sequence:1,category:'demand_match',prospect_ids:[p.id],note:'Synthetic verified client demand'};
 await updateRun(repo,c,'run',{action:'outcome',outcome});await updateRun(repo,c,'run',{action:'outcome',outcome});
 const run=researchBudget(repo,c,'run');assert.equal(run.outcomes.length,1);assert.deepEqual(run.prospect_ids,[p.id]);
 await reserveResearch(repo,c,'old',{kind:'query',target:'legacy query'},{now});
 const report=researchYield([run,researchBudget(repo,c,'old')],[p],()=>({tier:'RESEARCHING',gaps:['Unknown supplier appetite']}));
 assert.equal(report[0].distinct_reported_demand_matches,1);assert.equal(report[1].source,'unattributed');assert.equal(report[1].outcomes_unrecorded,1);
 await updateRun(repo,c,'run',{action:'complete'});await assert.rejects(updateRun(repo,c,'run',{action:'outcome',outcome}),/Resume/);
 await updateRun(repo,c,'run',{action:'resume'});assert.equal(researchBudget(repo,c,'run').attempts.length,1);
});
test('failed page reads count against budgets and get access-failure outcomes',async t=>{
 const {repo,c}=setup(t);await assert.rejects(captureSource(repo,c,'failure',{company:'https://fictional.example',url:'https://fictional.example/jobs',attribution:{source_id:'official',icp:'startup'}},{fetchText:async()=>{throw Error('HTTP 503');}}),/503/);
 const r=researchBudget(repo,c,'failure');assert.equal(r.attempts.length,1);assert.equal(r.outcomes[0].category,'access_failure');
 await assert.rejects(reserveResearch(repo,c,'bad',{kind:'query',target:'test',attribution:{source_id:'x',icp:'wrong'}}),/icp/);
 await assert.rejects(updateRun(repo,c,'failure',{action:'outcome',outcome:{sequence:99,category:'empty_board',prospect_ids:[],note:'not a valid observation'}}),/reservation/);
});
test('services-only pages are research references; disabled overrides still win',()=>{
 const cat=sourceCatalog();assert(!cat.sources.some(s=>s.name==='Cadre'));assert(cat.research_references.some(s=>s.name==='Cadre'));
 const c=config();c.discovery.sources=[{website:cat.sources[0].website,enabled:false}];assert(!inspectSources(c,{starter:true}).sources.some(s=>s.website===cat.sources[0].website));
 const tasks=researchTasks(prospect(),c,now).tasks.join(' ');assert.match(tasks,/board/);assert.match(tasks,/appetite unknown/);assert.match(tasks,/captures/);
});

test('verified agency additions remain manual research tasks, respect overrides and expire',async t=>{
 const {repo,c}=setup(t),names=['BY Recruiting','Right Fit Advisors'];
 c.discovery.sources=sourceCatalog().sources.filter(s=>names.includes(s.name));
 assert.equal(c.discovery.sources.length,2);assert(c.discovery.sources.every(s=>s.hiring_for==='client'&&s.provider==='manual'));
 const checked=new Date('2026-10-19T03:00:00Z');let calls=0;
 const result=await discoverSources(repo,c,{now:checked,ctx:{fetchJson:async()=>{calls++;throw Error('Manual seed must not fetch');}}});
 assert.equal(result.research_tasks.length,2);assert.equal(repo.list().length,0);assert.equal(calls,0);
 const expired=await discoverSources(repo,c,{now:new Date('2027-10-19T03:00:00Z')});
 assert(expired.research_tasks.every(t=>t.requires_identity_refresh));assert.equal(repo.list().length,0);
 c.discovery.sources[0]={website:c.discovery.sources[0].website,enabled:false};
 const selected=inspectSources(c,{starter:true,now:checked}).sources;
 assert(!selected.some(s=>s.name===names[0]));assert(selected.some(s=>s.name===names[1]));
});

test('reused employer seed stays opt-in, manual, overridable and subject to identity freshness',async t=>{
 const {repo,c}=setup(t),seed=sourceCatalog().sources.find(s=>s.name==='Resend');
 assert(seed);assert.equal(seed.provider,'manual');assert.equal(seed.icp,'startup');
 const checked=new Date('2026-10-19T06:00:00Z');let calls=0;
 const ctx={fetchJson:async()=>{calls++;throw Error('Manual research must not dispatch');}};
 c.discovery.starter_sources=false;c.discovery.sources=[];
 const without=await discoverSources(repo,c,{icp:'startup',now:checked,ctx});
 assert.equal(without.research_tasks.length,0);
 c.discovery.sources=[seed];
 const fresh=await discoverSources(repo,c,{icp:'startup',now:checked,ctx});
 assert.equal(fresh.research_tasks.length,1);assert.equal(fresh.research_tasks[0].requires_identity_refresh,false);
 const stale=await discoverSources(repo,c,{icp:'startup',now:new Date('2027-10-19T06:00:00Z'),ctx});
 assert.equal(stale.research_tasks[0].requires_identity_refresh,true);
 c.discovery.sources=[{website:'https://www.resend.com',enabled:false}];
 assert(!inspectSources(c,{starter:true,now:checked}).sources.some(s=>s.name==='Resend'));
 assert.equal(calls,0);assert.deepEqual(repo.list(),[]);
});

test('broader employer recipes remain ICP-specific tasks and preserve user query overrides',()=>{
 const c=config(),catalog=sourceCatalog();
 const startup=discoveryQueries('startup',c),agency=discoveryQueries('agency',c);
 assert.deepEqual(startup,catalog.queries.startup);assert.deepEqual(agency,catalog.queries.agency);
 assert(startup.some(q=>q.includes('site:wellfound.com/jobs')));
 assert(startup.some(q=>q.includes('site:jobs.insightpartners.com/jobs')));
 assert.equal(new Set(startup).size,startup.length);
 assert(startup.every(q=>!/\b(?:visa|devrel|Europe)\b/i.test(q)), 'Do not inherit legacy candidate targeting');
 c.discovery.queries.startup=['Custom backend discovery for US employers'];
 assert.deepEqual(discoveryQueries('startup',c),c.discovery.queries.startup);
 assert.deepEqual(discoveryQueries('agency',c),agency);
 assert.deepEqual(discoveryQueries('both',c),[...agency,...c.discovery.queries.startup]);
});
