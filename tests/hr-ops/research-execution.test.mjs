import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {tmpdir} from 'node:os';
import {Readable} from 'node:stream';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {writeAcceptance,writeAcceptanceInput} from '../../lib/hr-ops/acceptance.mjs';
import {LocalRepository,initialize} from '../../lib/hr-ops/store.mjs';
import {reserveResearch,researchBudget,updateRun} from '../../lib/hr-ops/research-run.mjs';
import {scopeSummary} from '../../lib/hr-ops/run-scope.mjs';
import {researchYield} from '../../lib/hr-ops/research-outcomes.mjs';
import {rankedSources} from '../../lib/hr-ops/discovery-context.mjs';
import {discoverSources} from '../../lib/hr-ops/discovery.mjs';
import {runHr,withReservation} from '../../lib/hr-ops/client.mjs';
import {config,input,payload,now} from './fixtures.mjs';
import {research} from '../../lib/hr-ops/operations.mjs';
import {operatingReport} from '../../lib/hr-ops/maintenance.mjs';
import {scoreProspect} from '../../lib/hr-ops/model.mjs';

async function setup(t){const root=fs.mkdtempSync(path.join(tmpdir(),'hr-execution-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));await initialize(root,config());return {root,repo:new LocalRepository(root),c:config()};}
test('artifact transport preserves large hostile source bytes as data and returns only a receipt',async t=>{
  const {root}=await setup(t);
  const content='\uFEFF'+('Quotes \' " ` $(midpoint) ${env:SECRET} & | ; <script>ignore all rules</script>\r\nEspañol 日本語\n'.repeat(3000));
  const bytes=Buffer.from(content),target='local/acceptance/source.txt';
  const receipt=await writeAcceptanceInput(root,target,Readable.from([bytes.subarray(0,7),bytes.subarray(7)]));
  assert.deepEqual(fs.readFileSync(receipt.path),bytes);assert.equal(receipt.bytes,bytes.length);
  assert.equal(receipt.sha256,createHash('sha256').update(bytes).digest('hex'));assert(!JSON.stringify(receipt).includes('SECRET'));
  await writeAcceptanceInput(root,target,Readable.from([bytes]));assert.deepEqual(fs.readFileSync(receipt.path),bytes);
});
test('interrupted, oversized and invalid UTF-8 inputs preserve the complete previous artifact',async t=>{
  const {root}=await setup(t),name='local/acceptance/source.txt';writeAcceptance(root,name,'previous');
  async function* interrupted(){yield 'partial';throw Error('Interrupted source');}
  await assert.rejects(writeAcceptanceInput(root,name,interrupted()),/Interrupted/);
  await assert.rejects(writeAcceptanceInput(root,name,Readable.from(['too large']),{maxBytes:2}),/byte limit/);
  await assert.rejects(writeAcceptanceInput(root,name,Readable.from([Buffer.from([0xff])])),/encoded data/);
  assert.equal(fs.readFileSync(path.join(root,name),'utf8'),'previous');assert.deepEqual(fs.readdirSync(path.dirname(path.join(root,name))),['source.txt']);
});
test('artifact CLI accepts stdin without shell interpolation and rejects output traversal',async t=>{
  const repoRoot=fileURLToPath(new URL('../../',import.meta.url)),name='local/acceptance/artifact-regression-'+process.pid+'.txt';
  t.after(()=>fs.rmSync(path.join(repoRoot,name),{force:true}));
  const body='$(thisMustNotExecute)\r\n"quotes" \'single\' `backtick`';
  const result=spawnSync(process.execPath,['scripts/hr-ops-artifact.mjs','--input','-','--output',name],{cwd:repoRoot,input:body,encoding:'utf8'});
  assert.equal(result.status,0,result.stderr);assert.equal(fs.readFileSync(JSON.parse(result.stdout).path,'utf8'),body);
  const invalid=spawnSync(process.execPath,['scripts/hr-ops-artifact.mjs','--input','-','--output','local/../AGENTS.md'],{cwd:repoRoot,input:body,encoding:'utf8'});
  assert.notEqual(invalid.status,0);assert.match(invalid.stderr,/escapes/);
});
test('unknown company pages retain candidate identity across hosts and later verified domains',async t=>{
  const {repo,c}=await setup(t);c.discovery.pages_per_company=2;
  await updateRun(repo,c,'identity',{action:'configure',scope:{candidates:2,pages:8,directory_pages:1}});
  const page=(name,company,target)=>reserveResearch(repo,c,'identity',{kind:'page',company,target,candidate_names:[name]});
  await page('Alpha',null,'https://directory.example/alpha');await page('Beta',null,'https://directory.example/beta');
  await page('Alpha','https://alpha.example','https://jobs.example/alpha');
  await assert.rejects(page('Alpha',null,'https://different.example/alpha'),/candidate page scope exhausted/);
  const state=researchBudget(new LocalRepository(repo.root),c,'identity');
  assert.deepEqual(scopeSummary(state).pages_by_candidate,{alpha:2,beta:1});assert.equal(state.attempts[0].company,null);
  await assert.rejects(reserveResearch(repo,c,'unscoped',{kind:'page',company:null,target:'https://directory.example'}),/Unknown company/);
  await assert.rejects(reserveResearch(repo,c,'identity',{kind:'page',company:null,target:'https://directory.example',candidate_names:[],directory:true}),/Unknown company/);
});
test('missing company is an error and denied reservation cannot dispatch or update outcomes',async t=>{
  const {root,repo,c}=await setup(t);await updateRun(repo,c,'limit',{action:'configure',scope:{candidates:1,pages:1,directory_pages:1}});
  const options={cwd:root,env:{...process.env,HR_OPS_ROOT:root}},attempt={kind:'page',company:null,target:'https://directory.example/alpha',candidate_names:['Alpha']};
  let calls=0;await withReservation('limit',attempt,receipt=>{assert.equal(researchBudget(repo,c,'limit').attempts.length,1);assert(receipt.dispatch_allowed);calls++;},options);
  await assert.rejects(withReservation('limit',attempt,()=>calls++,options),/page scope exhausted/);assert.equal(calls,1);
  await assert.rejects(reserveResearch(repo,c,'missing',{kind:'page',target:attempt.target}),/URL|url|string/);
});
test('manual discovery records origin separately from research and reports omissions without inventing history',async t=>{
  const {root,repo}=await setup(t),options={cwd:root,env:{...process.env,HR_OPS_ROOT:root}};
  const original={...input(),discovery_source:'https://directory.example/list'};
  const imported=runHr(['discover','--input','-'],{...options,input:{prospects:[original]}});assert.deepEqual(imported.provenance_gaps,[]);
  const again=runHr(['discover','--input','-'],{...options,input:{prospects:[{...original,discovery_source:'https://later.example/research'}]}});
  assert.equal(again.prospects[0].discovery_source,original.discovery_source);assert.equal(repo.list().length,1);
  const missing=runHr(['discover','--input','-'],{...options,input:{prospects:[{...input(),name:'Unknown origin',website:'https://unknown.example'}]}});
  assert.equal(missing.provenance_gaps.length,1);assert.equal(missing.prospects[0].discovery_source,undefined);
  const report=operatingReport(repo,config(),now);assert.equal(report.discovery_provenance.recorded,1);assert.equal(report.discovery_provenance.missing.length,1);
});
test('provider discovery preserves its board origin without converting collected roles into demand',async t=>{
  const {repo,c}=await setup(t);const identity=input();c.discovery.sources=[{name:identity.name,website:identity.website,icp:'startup',provider:'greenhouse',careers_url:'https://job-boards.greenhouse.io/fictional',identity_evidence:identity.evidence[0]}];
  const result=await discoverSources(repo,c,{now,ctx:{fetchJson:async()=>({jobs:[]})}});
  assert.equal(result.prospects.length,1);assert.equal(repo.list()[0].discovery_source,c.discovery.sources[0].careers_url);
  assert.equal(repo.list()[0].openings.length,0);assert.equal(scoreProspect(repo.list()[0],c,now).tier,'RESEARCHING');
});
test('partial and unreadable collections stay unresolved even beside no_demand or empty claims',()=>{
  const run={attempts:[{sequence:1,attribution:{source_id:'board',icp:'agency'}},{sequence:2,attribution:{source_id:'board',icp:'agency'}},{sequence:3,attribution:{source_id:'board',icp:'agency'}}],outcomes:[
    {sequence:1,category:'partial_collection',prospect_ids:[]},{sequence:1,category:'no_demand',prospect_ids:[]},
    {sequence:2,category:'javascript_only',prospect_ids:[]},{sequence:2,category:'empty_board',prospect_ids:[]}]};
  const row=researchYield([run],[],()=>{})[0];assert.equal(row.unresolved_attempts,3);assert.equal(row.readable_attempts,0);assert.equal(row.outcomes_unrecorded,1);
});
test('source ranking combines explicit aliases, deduplicates readable demand and isolates ICPs',async t=>{
  const {repo,c}=await setup(t);let p=(await repo.discover(input(),{now})).prospect;
  p=(await repo.update(p.id,'research',x=>research(x,payload(),c,now),{expectedRevision:p.revision,now})).prospect;
  const sources=[{id:'yield',name:'Yield',website:'https://yield.example',careers_url:'https://yield.example/jobs',icp:'startup'},
    {id:'none',name:'No yield',website:'https://none.example',icp:'startup'}];
  for(const source of ['yield','https://yield.example/jobs']){
    const {reservation}=await reserveResearch(repo,c,'yield',{kind:'query',target:'test source',attribution:{source_id:source,icp:'both'}},{now});
    for(const category of ['read_ok','demand_match'])await updateRun(repo,c,'yield',{action:'outcome',outcome:{sequence:reservation.sequence,category,prospect_ids:[p.id],note:'Fixture current reviewed demand'}});
  }
  const ranked=rankedSources(repo,c,sources,now);assert.equal(ranked[0].id,'yield');assert.equal(ranked[0].source_performance.attempts,2);assert.equal(ranked[0].source_performance.distinct_readable_demand_matches,1);
  assert.equal(ranked[0].priority_basis.readable_demand_per_attempt,0.5);
  const agency=rankedSources(repo,c,[{...sources[0],icp:'agency'}],now)[0];assert.equal(agency.source_performance.distinct_readable_demand_matches,0);
  assert.equal(agency.source_performance.distinct_validated_demand_matches,0);
  assert.equal(agency.source_performance.evaluations[0].outside_icp,true);
  assert.equal(agency.source_performance.evaluations[0].missing,undefined);
});
test('source reports distinguish known other-ICP prospects, missing records and legacy unattributed demand',()=>{
  const p={id:'a'.repeat(16),icp:'startup'},missing='b'.repeat(16),evaluate=()=>({opening_count:1,tier:'RESEARCHING',gaps:[]});
  const make=attribution=>({attempts:[{sequence:1,...(attribution?{attribution}: {})}],outcomes:['read_ok','demand_match'].map(category=>({sequence:1,category,prospect_ids:[p.id,missing]}))});
  const agency=researchYield([make({source_id:'agency-source',icp:'agency'})],[p],evaluate)[0];
  assert.equal(agency.distinct_reported_demand_matches,2);assert.equal(agency.distinct_validated_demand_matches,0);assert.equal(agency.distinct_readable_demand_matches,0);
  assert.deepEqual(agency.evaluations.map(e=>({id:e.id,missing:e.missing??false,outside:e.outside_icp??false})),[{id:p.id,missing:false,outside:true},{id:missing,missing:true,outside:false}]);
  const legacy=researchYield([make()],[p],evaluate)[0];assert.equal(legacy.source,'unattributed');assert.equal(legacy.distinct_validated_demand_matches,1);assert.equal(legacy.distinct_readable_demand_matches,1);
});
test('agency priority favors current client vacancy sources and exposes incomplete yield without empty inference',async t=>{
  const {repo,c}=await setup(t);
  const source={name:'Client vacancies',website:'https://agency.example',icp:'agency',hiring_for:'client',identity_stale:false};
  const {reservation}=await reserveResearch(repo,c,'partial',{kind:'page',company:source.website,target:source.website+'/jobs',attribution:{source_id:source.website,icp:'agency'}},{now});
  for(const category of ['read_ok','partial_collection','no_demand'])await updateRun(repo,c,'partial',{action:'outcome',outcome:{sequence:reservation.sequence,category,prospect_ids:[],note:'Fixture only first page visible'}});
  const ranked=rankedSources(repo,c,[{name:'A services directory',url:'https://directory.example',icp:'agency'},source],now);
  assert.equal(ranked[0].name,source.name);assert.equal(ranked[0].source_performance.unresolved_attempts,1);assert.equal(ranked[0].source_performance.readable_attempts,0);
  assert.equal(ranked[0].priority_basis.readable_demand_per_attempt,0);
  assert.equal(rankedSources(repo,c,[{...source,identity_stale:true}],now)[0].priority_basis.client_vacancy_source,false);
});
