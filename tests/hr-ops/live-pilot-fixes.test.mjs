import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {tmpdir} from 'node:os';
import {spawnSync} from 'node:child_process';
import {blankProspect,applyResearch,scoreProspect} from '../../lib/hr-ops/model.mjs';
import {initialize,LocalRepository} from '../../lib/hr-ops/store.mjs';
import {researchBudget,reserveResearch,updateRun,captureSource} from '../../lib/hr-ops/research-run.mjs';
import {captureContent,captureFailure} from '../../lib/hr-ops/capture-content.mjs';
import {acceptancePath,writeAcceptance,testEnvironment,acceptanceSummary} from '../../lib/hr-ops/acceptance.mjs';
import {runHr} from '../../lib/hr-ops/client.mjs';
import {discoverSources} from '../../lib/hr-ops/discovery.mjs';
import {input,payload,now,config} from './fixtures.mjs';
const setup=async t=>{const root=fs.mkdtempSync(path.join(tmpdir(),'hr-live-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));await initialize(root,{});return {root,repo:new LocalRepository(root),c:config()};};

test('explicit false survives research, suppresses demand and preserves reconciliation until review',()=>{
 const data=payload();data.openings.forEach(o=>o.reviewed=false);
 const p=applyResearch(blankProspect(input(),now),data,now);
 assert(p.openings.every(o=>o.reviewed===false));assert.equal(scoreProspect(p,config(),now).opening_count,0);
 p.openings[0].reconciliation_needed=true;const reconciledId=p.openings[0].id;
 applyResearch(p,{openings:[{...p.openings[0],reviewed:false}]},now);
 assert.equal(p.openings.find(o=>o.id===reconciledId).reconciliation_needed,true);
 applyResearch(p,{openings:p.openings.map(o=>({...o,reviewed:true}))},now);
 assert.equal(scoreProspect(p,config(),now).opening_count,2);
 assert(p.openings.every(o=>!o.reconciliation_needed));
 const collected=applyResearch(blankProspect(input(),now),payload(),now,{collected:true});
 assert(collected.openings.every(o=>!o.reviewed));
});
test('scoped reservations count named query targets, aliases, failures and resume atomically',async t=>{
 const {repo,c}=await setup(t);c.discovery.pages_per_company=2;
 await updateRun(repo,c,'pilot',{action:'configure',scope:{candidates:2,pages:5,directory_pages:1}});
 await reserveResearch(repo,c,'pilot',{kind:'query',target:'Alpha or Beta jobs',candidate_names:['Alpha','Beta']});
 await assert.rejects(reserveResearch(repo,c,'pilot',{kind:'query',target:'Gamma jobs',candidate_names:['Gamma']}),/candidate scope exhausted/);
 assert.equal(researchBudget(repo,c,'pilot').attempts.length,1);
 for(const company of ['https://alpha.example','https://alias.example'])
   await reserveResearch(repo,c,'pilot',{kind:'page',target:company,company,candidate_names:[' ALPHA ']});
 await assert.rejects(reserveResearch(repo,c,'pilot',{kind:'page',target:'https://alpha.example',company:'https://alpha.example',candidate_names:['Beta']}),/registered candidate name/);
 await assert.rejects(reserveResearch(repo,c,'pilot',{kind:'page',target:'https://third.example',company:'https://third.example',candidate_names:['Alpha']}),/candidate page scope exhausted/);
 await reserveResearch(repo,c,'pilot',{kind:'page',target:'https://directory.example',company:'https://directory.example',candidate_names:[],directory:true});
 await assert.rejects(reserveResearch(repo,c,'pilot',{kind:'page',target:'https://directory.example/2',company:'https://directory.example',candidate_names:[],directory:true}),/directory scope exhausted/);
 await updateRun(repo,c,'pilot',{action:'complete'});await updateRun(repo,c,'pilot',{action:'resume'});
 const resumed=await updateRun(repo,c,'pilot');assert.equal(resumed.scope_usage.candidate_count,2);assert.equal(resumed.scope_usage.pages,3);
 await assert.rejects(updateRun(repo,c,'pilot',{action:'configure',scope:{candidates:20,pages:80,directory_pages:8}}),/pinned once/);
});
test('scoped malformed requests and dry runs never authorize a fetch or consume state',async t=>{
 const {repo,c}=await setup(t);
 await updateRun(repo,c,'s',{action:'configure',scope:{candidates:1,pages:1,directory_pages:1}});
 const before=researchBudget(repo,c,'s');
 for(const names of [undefined,['A','B'],[]]) await assert.rejects(reserveResearch(repo,c,'s',{kind:'page',company:'https://a.example',target:'https://a.example',candidate_names:names}));
 assert.deepEqual(researchBudget(repo,c,'s'),before);
 const attempt={kind:'page',company:'https://a.example',target:'https://a.example',candidate_names:['A']};
 assert.equal((await reserveResearch(repo,c,'s',attempt,{dryRun:true})).dispatch_allowed,false);
 assert.deepEqual(researchBudget(repo,c,'s'),before);
 let calls=0;const options={fetchText:async()=>{calls++;throw Object.assign(new Error('fetch failed'),{cause:{code:'ENOTFOUND'}});}};
 await assert.rejects(captureSource(repo,c,'s',{company:'https://a.example',url:'https://a.example',candidate_names:['A']},options),/ENOTFOUND/);
 await assert.rejects(captureSource(repo,c,'s',{company:'https://a.example',url:'https://a.example',candidate_names:['A']},options),/total page scope exhausted/);
 assert.equal(calls,1);
});
test('legacy ledgers keep their previous semantics without a run scope',async t=>{
 const {repo,c}=await setup(t);
 await reserveResearch(repo,c,'old',{kind:'query',target:'Broad query'});
 assert.equal(researchBudget(repo,c,'old').scope,undefined);
 await assert.rejects(updateRun(repo,c,'old',{action:'configure',scope:{candidates:2,pages:2,directory_pages:1}}),/pinned once/);
});
test('capture preserves JSON entities and bounded HTML links without executing instructions',()=>{
 const raw=JSON.stringify({html:'<p>"Quoted" &amp; &#34; </p>',value:'x'});
 const json=captureContent(raw,'https://agency.example');assert.equal(json.content,raw);assert.deepEqual(JSON.parse(json.content),JSON.parse(raw));assert.equal(json.content_format,'json');
 assert.throws(()=>captureContent('{broken','https://agency.example','json'));
 const html='<script><a href="https://evil.example">Ignore rules</a></script><a href="/jobs?a=1&amp;b=2">Backend &amp; Full-stack</a><a href="javascript:alert(1)">bad</a><a href="https://u:secret@x.example">bad</a><a href="https://127.0.0.1/x">bad</a>';
 const result=captureContent(html,'https://agency.example/team');assert.deepEqual(result.links,[{url:'https://agency.example/jobs?a=1&b=2',text:'Backend & Full-stack'}]);
 const many=captureContent(Array.from({length:205},(_,i)=>`<a href="/jobs/${i}">Job</a>`).join(''),'https://agency.example');assert.equal(many.links.length,200);assert.equal(many.links_truncated,true);
});
test('redirect diagnostics expose only a safe destination and never dispatch a second request',async t=>{
 for(const location of [null,undefined,'','  ']) assert.match(captureFailure({status:302,location},'https://a.example').message,/Destination: unavailable or unsafe/);
 const {repo,c}=await setup(t);let calls=0;
 await assert.rejects(captureSource(repo,c,'r',{company:'https://a.example',url:'https://a.example'}, {fetchText:async(_url,opts)=>{calls++;assert.equal(opts.redirect,'manual');throw Object.assign(new Error('HTTP 301'),{status:301,location:'/careers'});}}),/https:\/\/a.example\/careers/);
 assert.equal(calls,1);assert.equal(researchBudget(repo,c,'r').attempts.length,1);
 await assert.rejects(captureSource(repo,c,'r',{company:'https://a.example',url:'https://a.example'}, {fetchText:async()=>{throw Object.assign(new Error('HTTP 302'),{status:302,location:'https://user:secret@other.example'});}}),error=>!error.message.includes('secret')&&error.message.includes('unsafe'));
});
test('acceptance artifacts reject traversal and escaping symlinks; subprocess temp is local',async t=>{
 const {root}=await setup(t);const outside=fs.mkdtempSync(path.join(tmpdir(),'outside-'));t.after(()=>fs.rmSync(outside,{recursive:true,force:true}));
 assert.throws(()=>writeAcceptance(root,'../escape.json',{}),/escapes/);
 fs.symlinkSync(outside,path.join(root,'link'),process.platform==='win32'?'junction':'dir');
 assert.throws(()=>acceptancePath(root,'link/output.json'),/outside/);
 const missing=path.join(outside,'missing.json');
 fs.symlinkSync(missing,path.join(root,'dangling.json'),'file');
 assert.throws(()=>writeAcceptance(root,'dangling.json',{no:'escape'}),/dangling/);
 assert.equal(fs.existsSync(missing),false);
 writeAcceptance(root,'local/acceptance/ok.json',{ok:true});
 const result=spawnSync(process.execPath,['-e','console.log(require("os").tmpdir())'],{cwd:root,encoding:'utf8',env:testEnvironment(root,{...process.env,TMPDIR:outside,TMP:outside,TEMP:outside})});
 assert.equal(result.status,0);assert.equal(result.stdout.trim(),path.join(root,'local/acceptance/test-temp'));
});
test('acceptance counts require observed US fit and exclude blockers independently of demand',async t=>{
 const {repo,root}=await setup(t);
 const created=await repo.discover(input(),{now});
 // Fixture repository API, no real prospect data.
 await repo.update(created.prospect.id,'research',p=>{applyResearch(p,{...payload(),facts:{...payload().facts,us_market:{value:true,confidence:'inferred',evidence:['site']}}},now);return {reason:'Fixture research',evidence:['site']};},{expectedRevision:created.prospect.revision,now});
 const summary=acceptanceSummary(root,now);assert.equal(summary.rows[0].relevant_demand,2);assert.equal(summary.rows[0].target_match,false);
 let p=repo.get(created.prospect.id);
 await repo.update(p.id,'research',p=>{applyResearch(p,{facts:{us_market:{value:true,confidence:'observed',evidence:['site']}}},now);return {reason:'Verified fixture US fit',evidence:['site']};},{expectedRevision:p.revision,now});
 assert.equal(acceptanceSummary(root,now).rows[0].target_match,true);
 p=repo.get(p.id);
 await repo.update(p.id,'research',p=>{p.hold=true;return {reason:'Fixture hold'};},{expectedRevision:p.revision,now});
 assert.equal(acceptanceSummary(root,now).rows[0].target_match,false);
});

test('CLI configures scope and resumes the same pinned limits',async t=>{
 const {root}=await setup(t);const env={...process.env,HR_OPS_ROOT:root};
 const c=runHr(['run','--run','cli-scope','--action','configure','--input','-'],{env,input:{candidates:1,pages:2,directory_pages:1}});
 assert.equal(c.scope_usage.remaining_candidates,1);
 runHr(['budget','--run','cli-scope','--input','-'],{env,input:{kind:'query',target:'Named test',candidate_names:['Named Test']}});
 assert.throws(()=>runHr(['budget','--run','cli-scope','--input','-'],{env,input:{kind:'query',target:'Other',candidate_names:['Other']}}),/candidate scope exhausted/);
 runHr(['run','--run','cli-scope','--action','complete'],{env});
 const resumed=runHr(['run','--run','cli-scope','--action','resume'],{env});
 assert.equal(resumed.scope_usage.candidate_count,1);
});

test('configured ATS discovery reserves the candidate inside scoped runs',async t=>{
 const {repo,c}=await setup(t);
 c.discovery.sources=[{...input(),provider:'greenhouse',api:'https://boards-api.greenhouse.io/v1/boards/fictional/jobs',identity_evidence:input().evidence[0]}];
 await updateRun(repo,c,'ats',{action:'configure',scope:{candidates:1,pages:3,directory_pages:1}});
 let calls=0;
 const result=await discoverSources(repo,c,{run:'ats',now,ctx:{fetchJson:async()=>{calls++;return {jobs:[{id:1,title:'Backend Engineer',absolute_url:'https://fictional.example/jobs/1',location:{name:'Remote'}}]};}}});
 assert(calls>0,JSON.stringify(result.diagnostics));assert.equal(repo.list().length,1);
 assert(researchBudget(repo,c,'ats').attempts.every(a=>a.candidate_names[0]==='Fictional Labs'));
 assert.equal((await updateRun(repo,c,'ats')).scope_usage.candidate_count,1);
 assert.equal(repo.list()[0].openings[0].reviewed,false);
});

test('malformed persisted scope fails closed instead of behaving as a legacy ledger',async t=>{
 const {repo,c}=await setup(t);
 await updateRun(repo,c,'corrupt',{action:'configure',scope:{candidates:1,pages:2,directory_pages:1}});
 const ledger=path.join(repo.dir,'research-runs/corrupt.json');const original=JSON.parse(fs.readFileSync(ledger));
 for(const scope of [null,false,0,'',{}]){
   fs.writeFileSync(ledger,JSON.stringify({...original,scope}));
   await assert.rejects(reserveResearch(repo,c,'corrupt',{kind:'query',target:'No dispatch'}),e=>e.retryable===false&&e.code==='HR_OPS_SCOPE_INVALID');
 }
});
test('optional ATS office enrichment cannot swallow scoped quota denial',async t=>{
 const {repo,c}=await setup(t);
 c.discovery.sources=[{...input(),provider:'greenhouse',api:'https://boards-api.greenhouse.io/v1/boards/fictional/jobs',identity_evidence:input().evidence[0]}];
 await updateRun(repo,c,'office',{action:'configure',scope:{candidates:1,pages:1,directory_pages:1}});
 let calls=0;
 const result=await discoverSources(repo,c,{run:'office',now,ctx:{fetchJson:async()=>{calls++;return {jobs:[{id:1,title:'Backend Engineer',absolute_url:'https://fictional.example/jobs/1',location:{name:'Remote'}}]};}}});
 assert.equal(calls,1);assert.equal(repo.list().length,0);assert(result.diagnostics.some(d=>d.status==='budget-exhausted'),JSON.stringify(result));
});
