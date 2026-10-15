import test from 'node:test';import assert from 'node:assert/strict';
import { mkdtempSync,rmSync } from 'node:fs';import {join} from 'node:path';import {tmpdir} from 'node:os';
import { LocalRepository } from '../../lib/hr-ops/store.mjs';
import { reserveResearch,researchBudget,updateRun,captureSource } from '../../lib/hr-ops/research-run.mjs';
import { researchYield } from '../../lib/hr-ops/research-outcomes.mjs';
import { sourceCatalog,inspectSources } from '../../lib/hr-ops/sources.mjs';
import { researchTasks } from '../../lib/hr-ops/operations.mjs';
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
