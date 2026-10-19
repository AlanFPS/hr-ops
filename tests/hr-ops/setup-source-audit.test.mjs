import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {fileURLToPath} from 'node:url';
import {initialize,LocalRepository} from '../../lib/hr-ops/store.mjs';
import {config,input,evidence} from './fixtures.mjs';
import {runHr} from '../../lib/hr-ops/client.mjs';
import {collectDiscoveryFeed} from '../../lib/hr-ops/discovery-feeds.mjs';
import {researchBudget,updateRun,reserveResearch} from '../../lib/hr-ops/research-run.mjs';
import {discoveryPlan} from '../../lib/hr-ops/discovery-plan.mjs';
import {discoverSources} from '../../lib/hr-ops/discovery.mjs';
import {hash} from '../../lib/hr-ops/model.mjs';
import {backup,restore,diagnostics} from '../../lib/hr-ops/maintenance.mjs';
import {runAcceptanceTests} from '../../lib/hr-ops/acceptance.mjs';
const CODE=fileURLToPath(new URL('../../',import.meta.url));
async function setup(t,candidates=5){
  const parent=fs.mkdtempSync(join(tmpdir(),'hr-setup-audit-')),root=join(parent,'data');
  t.after(()=>fs.rmSync(parent,{recursive:true,force:true,maxRetries:5,retryDelay:50}));
  const c=config();await initialize(root,c);const repo=new LocalRepository(root);
  await updateRun(repo,c,'audit',{action:'configure',scope:{candidates,pages:10,directory_pages:8}});
  return {parent,root,c,repo,options:{cwd:CODE,env:{...process.env,HR_OPS_ROOT:root}}};
}
const job=(id,extra={})=>({id,company_name:'Example Labs',title:'Backend Engineer',url:'https://remotive.com/remote-jobs/software-development/'+id,description:'Build backend services.',...extra});
const collect=(s,extra={})=>collectDiscoveryFeed(s.repo,s.c,{id:'remotive',run:'audit',...extra});
const capturePath=(s,id)=>join(s.repo.dir,'captures',id+'.json');
function cached(s){const id=researchBudget(s.repo,s.c,'audit').captures.at(-1);return {id,path:capturePath(s,id),value:JSON.parse(fs.readFileSync(capturePath(s,id)))};}

test('source publication dates retain honest unknowns instead of calendar rollover or numeric guessing',async t=>{
  const s=await setup(t);
  const result=await collect(s,{fetchText:async()=>JSON.stringify({jobs:[job(1,{publication_date:'2026-02-30T12:00:00Z'}),job(2,{publication_date:0}),job(3,{publication_date:'2099-01-01T00:00:00Z'}),job(4,{publication_date:'2024-02-29'})]})});
  const rows=result.research_tasks[0].observations;
  for(const row of rows.slice(0,3)){assert.equal(row.posted_at,null);assert.equal(row.posted_at_status,'unresolved');}
  assert.equal(rows[0].reported_posted_at,'2026-02-30T12:00:00Z');
  assert.equal(rows[3].posted_at,'2024-02-29T00:00:00.000Z');assert.equal(rows[3].posted_at_precision,'day');
});

test('HN thread payload must match the requested hiring story',async t=>{
  const s=await setup(t);let requests=0;
  const result=await collectDiscoveryFeed(s.repo,s.c,{id:'hackernews',run:'audit',fetchText:async target=>{requests++;return JSON.stringify(target.includes('search_by_date')?{hits:[{objectID:'42',title:'Ask HN: Who is hiring?'}]}:{id:999,children:[{id:43,text:'Other | Backend engineer | US remote'}]});}});
  assert.equal(requests,2);assert.equal(result.requests_spent,2);assert.deepEqual(result.research_tasks,[]);assert.equal(result.stopping_reason,'source_unresolved');
});

test('collection uses current candidate scope and counts only its own dispatches during concurrent research',async t=>{
  const s=await setup(t,1);
  const result=await collect(s,{fetchText:async()=>{
    await reserveResearch(s.repo,s.c,'audit',{kind:'query',target:'independent broad research',candidate_names:[]});
    await updateRun(s.repo,s.c,'audit',{action:'admit',candidate:{name:'Other Company',source_url:null,source_sequence:null,reason:'Independently selected fixture company'}});
    return JSON.stringify({jobs:[job(1)]});
  }});
  assert.equal(researchBudget(s.repo,s.c,'audit').attempts.length,2);assert.equal(result.requests_spent,1);
  assert.deepEqual(result.research_tasks,[]);assert.equal(result.remaining_candidate_slots,0);
  const hnScope=await setup(t,1);let dispatches=0;
  const stopped=await collectDiscoveryFeed(hnScope.repo,hnScope.c,{id:'hackernews',run:'audit',fetchText:async()=>{
    dispatches++;await updateRun(hnScope.repo,hnScope.c,'audit',{action:'admit',candidate:{name:'Another Company',source_url:null,source_sequence:null,reason:'Independent fixture admission'}});
    return JSON.stringify({hits:[{objectID:'42',title:'Ask HN: Who is hiring?'}]});
  }});
  assert.equal(dispatches,1);assert.equal(stopped.requests_spent,1);assert.equal(stopped.stopping_reason,'candidate_scope_exhausted');
});

test('same-title posting variants retain their different identifiers and country scope',async t=>{
  const s=await setup(t),url='https://remotive.com/remote-jobs/software-development/shared';
  const result=await collect(s,{fetchText:async()=>JSON.stringify({jobs:[job(1,{url,candidate_required_location:'US only'}),job(2,{url,candidate_required_location:'Brazil'}),job(2,{url,candidate_required_location:'Brazil'})]})});
  assert.equal(result.research_tasks[0].observations.length,2);assert.deepEqual(result.research_tasks[0].observations.map(x=>x.posting_id),['1','2']);
  assert.deepEqual(result.research_tasks[0].observations.map(x=>x.location),['US only','Brazil']);assert.equal(result.qualified_prospects,0);
});

test('cached collection requires its raw capture and detects changed or missing evidence before refreshing',async t=>{
  for(const damage of ['missing_raw','changed_raw','missing_cache']){
    const s=await setup(t);await collect(s,{fetchText:async()=>JSON.stringify({jobs:[job(1)]})});
    const cache=cached(s),rawPath=capturePath(s,cache.value.requests[0].capture_id);
    if(damage==='missing_raw')fs.unlinkSync(rawPath);
    if(damage==='changed_raw'){const raw=JSON.parse(fs.readFileSync(rawPath));raw.content='{"jobs":[]}';fs.writeFileSync(rawPath,JSON.stringify(raw));}
    if(damage==='missing_cache')fs.unlinkSync(cache.path);
    for(const refresh of [false,true]){let requests=0;await assert.rejects(collect(s,{refresh,fetchText:async()=>{requests++;return '{"jobs":[]}';}}),/capture|hash|missing/i);assert.equal(requests,0);}
  }
});

test('structurally invalid cache provenance and linked capture directories fail closed',async t=>{
  const s=await setup(t);await collect(s,{fetchText:async()=>JSON.stringify({jobs:[job(1)]})});
  const cache=cached(s);cache.value.requests=[];
  const invalidId=hash(JSON.stringify(cache.value));fs.writeFileSync(capturePath(s,invalidId),JSON.stringify(cache.value));
  await updateRun(s.repo,s.c,'audit',{action:'link',capture:invalidId});
  await assert.rejects(collect(s),/request|provenance/i);
  const other=await setup(t);await collect(other,{fetchText:async()=>JSON.stringify({jobs:[job(1)]})});
  const original=join(other.repo.dir,'captures'),moved=join(other.parent,'moved-captures');fs.renameSync(original,moved);fs.symlinkSync(moved,original,process.platform==='win32'?'junction':'dir');
  let requests=0;await assert.rejects(collect(other,{fetchText:async()=>{requests++;}}),/link/i);assert.equal(requests,0);
  const dangling=await setup(t);fs.symlinkSync(join(dangling.parent,'missing-target'),join(dangling.repo.dir,'captures'),process.platform==='win32'?'junction':'dir');
  await assert.rejects(collect(dangling,{fetchText:async()=>{requests++;}}),/link/i);assert.equal(requests,0);
});

test('changing cache routing metadata cannot turn a corrupt cache into a fresh network read',async t=>{
  for(const field of ['kind','feed_id']){
    const s=await setup(t);await collect(s,{fetchText:async()=>JSON.stringify({jobs:[job(1)]})});
    const cache=cached(s);cache.value[field]='changed';fs.writeFileSync(cache.path,JSON.stringify(cache.value));
    let calls=0;await assert.rejects(collect(s,{refresh:true,fetchText:async()=>{calls++;return '{"jobs":[]}';}}),/capture|hash/i);assert.equal(calls,0);
  }
});

test('doctor diagnostics and restore reject corrupted feed evidence, including backups with valid file checksums',async t=>{
  const s=await setup(t);await collect(s,{fetchText:async()=>JSON.stringify({jobs:[job(1)]})});
  const cache=cached(s),rawPath=capturePath(s,cache.value.requests[0].capture_id);
  const raw=JSON.parse(fs.readFileSync(rawPath));raw.content='{"jobs":[]}';fs.writeFileSync(rawPath,JSON.stringify(raw));
  const health=diagnostics(s.repo);assert.equal(health.ok,false);assert(health.errors.some(x=>/capture/i.test(x.file)&&/hash/i.test(x.error)));
  const saved=await backup(s.repo),destination=join(s.parent,'restored');
  assert.throws(()=>restore(saved.path,destination,{dryRun:false}),/failed validation/);assert(fs.existsSync(destination),'Failed restore is kept isolated for diagnosis');
  assert.deepEqual(s.repo.list(),[]);
});

test('near-cap valid JSON and malformed posting fields remain partial without invented identifiers',async t=>{
  const s=await setup(t),base=JSON.stringify({jobs:[job(1)],padding:''});
  const capped=base.replace('"padding":""','"padding":"'+'x'.repeat(2_000_000-Buffer.byteLength(base))+'"');
  assert.equal(Buffer.byteLength(capped),2_000_000);
  const near=await collect(s,{fetchText:async()=>capped});assert.equal(near.collection_partial,true);assert.equal(near.collection_diagnostic,'partial_collection');
  const legacy=cached(s);legacy.value.collection.partial=false;
  const legacyId=hash(JSON.stringify(legacy.value));fs.writeFileSync(capturePath(s,legacyId),JSON.stringify(legacy.value));await updateRun(s.repo,s.c,'audit',{action:'link',capture:legacyId});
  const before=fs.readFileSync(capturePath(s,legacyId));
  const resumed=await collect(s,{fetchText:async()=>{throw Error('No new request');}});assert.equal(resumed.collection_partial,true);assert.equal(resumed.requests_spent,0);
  assert(fs.readFileSync(capturePath(s,legacyId)).equals(before),'Legacy capture stays immutable');
  const malformed=await collect(s,{refresh:true,fetchText:async()=>JSON.stringify({jobs:[job({not:'an ID'},{description:{not:'role text'}})]})});
  assert.equal(malformed.collection_partial,true);assert.equal(malformed.research_tasks[0].observations[0].posting_id,null);
  const links=await collect(s,{refresh:true,fetchText:async()=>JSON.stringify({jobs:[job(2,{url:'https://linkedin.com./jobs/view/2'}),job(3,{company_url:'https://companies.remotive.com./example'})]})});
  assert.equal(links.research_tasks[0].observations.length,1);assert.equal(links.research_tasks[0].website,null,'Aggregator subdomains are not canonical employer websites');
});

test('role filtering uses the advertised role rather than incidental body or employer-name keywords',async t=>{
  const s=await setup(t);
  const result=await collect(s,{fetchText:async()=>JSON.stringify({jobs:[job(1,{title:'Account Executive',description:'Sell tools to backend engineers.'}),job(2)]})});
  assert.equal(result.relevant_posting_observations,1);assert.equal(result.research_tasks[0].observations.length,1);
  const hn=await collectDiscoveryFeed(s.repo,s.c,{id:'hackernews',run:'audit',fetchText:async target=>JSON.stringify(target.includes('search_by_date')?{hits:[{objectID:'42',title:'Ask HN: Who is hiring?'}]}:{id:42,children:[{id:43,text:'Backend Labs | Account Executive | US remote<p>Work with full-stack engineers.</p>'},{id:44,text:'Other Labs | Backend Engineer | US remote'}]})});
  assert.deepEqual(hn.research_tasks.map(x=>x.name),['Other Labs']);
});

test('source plans and collections exclude existing domain aliases, subdomains and trailing dots consistently',async t=>{
  const s=await setup(t);await s.repo.discover(input());
  s.c.discovery.sources=[{name:'Different label',website:'https://careers.fictional.example',icp:'startup',provider:'manual',identity_evidence:evidence()}];
  assert(!discoveryPlan(s.repo,s.c).company_seeds.some(x=>x.name==='Different label'));
  const selected=await discoverSources(s.repo,s.c,{run:'audit',dryRun:true,newOnly:true});assert(!selected.research_tasks.some(x=>x.name==='Different label'));
  const feed=await collect(s,{fetchText:async()=>JSON.stringify({jobs:[job(1,{company_url:'https://fictional.example.'})]})});
  assert.deepEqual(feed.research_tasks,[]);assert.equal(feed.excluded[0].reason,'existing_prospect');
  const conflict=await collect(s,{refresh:true,fetchText:async()=>JSON.stringify({jobs:[job(2,{company_url:'https://fictional.example'}),job(3,{company_url:'https://unrelated.example'})]})});
  assert.equal(conflict.excluded.length,1,'Conflicting publisher claims must not hide a known canonical domain');
  assert.equal(conflict.research_tasks[0].identity_conflict,true);assert.equal(conflict.research_tasks[0].observations.length,1);assert.equal(conflict.research_tasks[0].admission,null);
  const boundary=await collect(s,{refresh:true,fetchText:async()=>JSON.stringify({jobs:[job(4,{company_url:'https://fictional.example.other.example'})]})});
  assert.equal(boundary.research_tasks.length,1,'A suffix without the parent-domain boundary must stay separate');
});

test('setup and menu reject ignored flags rather than silently creating a workspace',async t=>{
  const s=await setup(t),destination=join(s.parent,'fresh'),payload={name:'Synthetic workspace',purpose:'experimental'};
  assert.throws(()=>runHr(['setup','--destination',destination,'--input','-','--apply'],{...s.options,input:payload}),/unsupported|not supported|not valid/i);assert(!fs.existsSync(destination));
  assert.throws(()=>runHr(['menu','--input','ignored.json'],s.options),/unsupported|not supported|not valid/i);
});

test('acceptance runner serializes fixture files while preserving output and exit receipts',async t=>{
  const s=await setup(t),dir=join(s.root,'tests/hr-ops');fs.mkdirSync(dir,{recursive:true});
  const source=`import test from 'node:test';import fs from 'node:fs';import {fileURLToPath} from 'node:url';
test('exclusive fixture resource',async t=>{const file=fileURLToPath(new URL('../../exclusive.lock',import.meta.url));const fd=fs.openSync(file,'wx');t.after(()=>{fs.closeSync(fd);fs.unlinkSync(file);});await new Promise(r=>setTimeout(r,750));});`;
  for(const name of ['a','b'])fs.writeFileSync(join(dir,name+'.test.mjs'),source);
  const result=runAcceptanceTests(s.root);assert.equal(result.exit_code,0);assert.equal(result.files,2);
  assert.equal(JSON.parse(fs.readFileSync(join(s.root,'local/acceptance/tests-exit.json'))).exit_code,0);
  assert.match(fs.readFileSync(join(s.root,'local/acceptance/tests.txt'),'utf8'),/exclusive fixture resource/);assert(!fs.existsSync(join(s.root,'exclusive.lock')));
  const empty=await setup(t);fs.mkdirSync(join(empty.root,'tests/hr-ops'),{recursive:true});
  assert.throws(()=>runAcceptanceTests(empty.root),/No HR test files/);assert(!fs.existsSync(join(empty.root,'local/acceptance/tests-exit.json')));
});
