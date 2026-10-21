import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {initialize,LocalRepository} from '../../lib/hr-ops/store.mjs';
import {sourceCatalog,inspectSources} from '../../lib/hr-ops/sources.mjs';
import {discoverSources,discoveryQueries} from '../../lib/hr-ops/discovery.mjs';
import {rankedSources} from '../../lib/hr-ops/discovery-context.mjs';
import {reserveResearch,updateRun} from '../../lib/hr-ops/research-run.mjs';
import {research} from '../../lib/hr-ops/operations.mjs';
import {scoreProspect} from '../../lib/hr-ops/model.mjs';
import {config,input,payload,now} from './fixtures.mjs';

async function setup(t){
  const root=mkdtempSync(join(tmpdir(),'hr-agency-sources-'));
  t.after(()=>rmSync(root,{recursive:true,force:true,maxRetries:5,retryDelay:50}));
  const c=config();await initialize(root,c);return {root,c,repo:new LocalRepository(root)};
}
test('new first-party agency board remains an overridable manual source with restricted demand caveats',async t=>{
  const {repo,c}=await setup(t),source=sourceCatalog().sources.find(s=>s.name==='HIRECLOUT');
  assert.ok(source);assert.equal(source.hiring_for,'client');assert.equal(source.provider,'manual');
  assert.equal(new URL(source.careers_url).hostname,'jobs.'+new URL(source.website).hostname);
  assert.match(source.notes,/requires current\/future U.S. work authorization/);
  assert.match(source.notes,/supplier appetite remain unknown/);assert.match(source.notes,/six months ago/);
  c.discovery.sources=[source];let requests=0;
  const result=await discoverSources(repo,c,{icp:'agency',ctx:{fetchJson:async()=>{requests++;throw Error('No fetch permitted');}}});
  assert.equal(requests,0);assert.equal(repo.list().length,0);
  const task=result.research_tasks[0];assert.equal(task.hiring_for,'client');assert.equal(task.attribution.source_id,source.website);
  assert.equal(task.source_performance,null);assert.match(task.required_checks.join(' '),/US-only/);assert.match(task.required_checks.join(' '),/appetite unknown/);
  c.discovery.sources=[{website:source.website,enabled:false}];assert(!inspectSources(c,{starter:true}).sources.some(s=>s.name===source.name));
});

test('agency yield never turns internal hiring or restricted client demand into eligible LATAM vacancies',async t=>{
  const {repo,c}=await setup(t),source={name:'Fixture board',website:'https://agency.example',icp:'agency',hiring_for:'client'};
  const p=(await repo.discover({...input(),icp:'agency'},{now})).prospect;
  const patch=payload();patch.facts.tech_focus={value:true,confidence:'observed',evidence:['site']};
  patch.openings=patch.openings.map(o=>({...o,hiring_for:'self'}));
  await repo.update(p.id,'research',p=>research(p,patch,c,now),{expectedRevision:1,now});
  const {reservation}=await reserveResearch(repo,c,'yield',{kind:'page',company:source.website,target:source.website+'/jobs',attribution:{source_id:source.website,icp:'agency'}},{now});
  for(const category of ['read_ok','demand_match'])await updateRun(repo,c,'yield',{action:'outcome',outcome:{sequence:reservation.sequence,category,prospect_ids:[p.id],note:'Fixture reviewed source and potential demand'}});
  assert.equal(rankedSources(repo,c,[source],now)[0].source_performance.distinct_readable_demand_matches,0);
  patch.openings=patch.openings.map(o=>({...o,hiring_for:'client',eligibility:{status:'restricted',evidence:['site'],rationale:'Client explicitly requires US employment.',geography:'US only'}}));
  await repo.update(p.id,'research',p=>research(p,patch,c,now),{expectedRevision:2,now});
  const score=scoreProspect(repo.get(p.id),c,now);
  assert.equal(score.opening_count,2);assert.equal(score.eligible_opening_count,0);assert.notEqual(score.tier,'QUALIFIED');
  const ranked=rankedSources(repo,c,[{id:'directory',name:'Services directory',url:'https://directory.example',icp:'agency'},source],now);
  assert.equal(ranked[0].website,source.website);assert.equal(ranked[0].source_performance.distinct_readable_demand_matches,1);
  assert.equal(repo.get(p.id).interactions.length,0);
});

test('agency vacancy recipes stay separate from employer feeds and user overrides win',()=>{
  const c=config(),queries=discoveryQueries('agency',c);
  assert(queries.some(q=>q.includes('site:jobs.hireclout.com/jobs/')));
  assert(!discoveryQueries('startup',c).some(q=>q.includes('hireclout')));
  c.discovery.queries.agency=['Our reviewed agency recipe'];
  assert.deepEqual(discoveryQueries('agency',c),['Our reviewed agency recipe']);
  assert.equal(new Set(queries).size,queries.length);
});
