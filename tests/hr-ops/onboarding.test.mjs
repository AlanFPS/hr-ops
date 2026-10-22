import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {fileURLToPath} from 'node:url';
import * as yaml from 'js-yaml';
import {createWorkspace,readWorkspace,configureWorkspace} from '../../lib/hr-ops/workspace.mjs';
import {LocalRepository,initialize,loadConfig} from '../../lib/hr-ops/store.mjs';
import {ONBOARDING_QUESTIONS,onboardingStatus,readOnboarding,saveOnboarding,applyOnboarding,reconcileOnboarding,readOnboardingRecoveries} from '../../lib/hr-ops/onboarding.mjs';
import {diagnostics,backup,restore,verifyBackup} from '../../lib/hr-ops/maintenance.mjs';
import {hash,DEFAULTS,firmFingerprint,configurationFingerprint,canonical,validateConfig} from '../../lib/hr-ops/model.mjs';
import {saveDraft,draftCurrent,qualify,researchTasks,outreachBrief} from '../../lib/hr-ops/operations.mjs';
import {publishDossier,reportStatus} from '../../lib/hr-ops/reports.mjs';
import {runHr} from '../../lib/hr-ops/client.mjs';
import {writeFileAtomic} from '../../tracker-utils.mjs';
import {config,prospect,draft,input,auth} from './fixtures.mjs';
import {startInbox} from '../../lib/hr-ops/inbox-import.mjs';
import {inspectSources,sourceCatalog} from '../../lib/hr-ops/sources.mjs';
import {discoveryFeeds} from '../../lib/hr-ops/feed-contract.mjs';
const CODE=fileURLToPath(new URL('../../',import.meta.url));
const known=value=>({status:'known',value,source:'user_confirmed'});
const core=(overrides={})=>({...Object.fromEntries(ONBOARDING_QUESTIONS.filter(q=>q.core).map(q=>[q.id,{status:'unknown'}])),...overrides});
async function setup(t,config){
 const parent=fs.mkdtempSync(join(tmpdir(),'hr-onboard-')),root=join(parent,'workspace');
 t.after(()=>fs.rmSync(parent,{recursive:true,force:true,maxRetries:5,retryDelay:50}));
 await createWorkspace(root,{name:'Synthetic Firm Workspace',purpose:'experimental',...(config?{config}:{})});
 return {parent,root,repo:new LocalRepository(root),opts:{cwd:CODE,env:{...process.env,HR_OPS_ROOT:root}}};
}
const profile=s=>fs.readFileSync(join(s.root,'config/profile.yml'),'utf8');
const checkpoint=s=>fs.readFileSync(join(s.repo.dir,'onboarding.json'),'utf8');
async function reviewed(s,answers=core()){
 const revision=onboardingStatus(s.repo).revision;
 const saved=await saveOnboarding(s.repo,{answers},{expectedRevision:revision});
 const preview=await applyOnboarding(s.repo,{}, {expectedRevision:saved.revision,dryRun:true});return {saved,preview};
}
async function apply(s,r){return applyOnboarding(s.repo,{preview_fingerprint:r.preview.preview_fingerprint},{expectedRevision:r.saved.revision});}

test('new isolated workspaces offer two-stage onboarding without selection or copied operating data; legacy roots stay readable',async t=>{
 const envBefore={hr:process.env.HR_OPS_ROOT,legacy:process.env.CAREER_OPS_ROOT},s=await setup(t);
 assert.deepEqual({hr:process.env.HR_OPS_ROOT,legacy:process.env.CAREER_OPS_ROOT},envBefore);
 assert.equal(onboardingStatus(s.repo).stage,'business');assert.equal(onboardingStatus(s.repo).offer,true);
 assert.equal(readWorkspace(s.repo).purpose,'experimental');assert.equal(s.repo.list().length,0);
 assert(!fs.existsSync(join(s.root,'local/browser-profiles')));
 const other=join(s.parent,'second');await createWorkspace(other,{name:'Second',purpose:'experimental'});
 assert.notEqual(readWorkspace(new LocalRepository(other)).id,readWorkspace(s.repo).id);
 const legacy=join(s.parent,'legacy');await initialize(legacy,config());
 assert.equal(onboardingStatus(new LocalRepository(legacy)).stage,'legacy_configured');assert.equal(onboardingStatus(new LocalRepository(legacy)).offer,false);
 const empty=new LocalRepository(join(s.parent,'uninitialized'));assert.equal(onboardingStatus(empty).stage,'workspace');assert.equal(onboardingStatus(empty).offer,true);
 assert(!fs.existsSync(empty.root));
 await assert.rejects(createWorkspace(s.root,{name:'Overwrite',purpose:'operating'}),/new or empty/);
});
test('saving and previewing are resumable, revision checked and leave active settings unchanged',async t=>{
 const s=await setup(t),before=profile(s),stateBefore=checkpoint(s);
 const preview=await saveOnboarding(s.repo,{answers:{firm_name:known('Fixture Recruiting')}},{expectedRevision:0,dryRun:true});
 assert.equal(preview.revision,1);assert.equal(checkpoint(s),stateBefore);assert.equal(profile(s),before);
 const saved=runHr(['onboarding','save','--input','-','--revision','0'],{...s.opts,input:{answers:{firm_name:known('Fixture Recruiting')}}});
 assert.equal(saved.revision,1);assert.equal(profile(s),before);
 const status=runHr(['onboarding','status'],s.opts);assert.equal(status.revision,1);assert.equal(status.questions.find(q=>q.id==='firm_name').draft.value,'Fixture Recruiting');
 await assert.rejects(applyOnboarding(s.repo,{}, {expectedRevision:1,dryRun:true}),/Core questions/);
 await assert.rejects(saveOnboarding(s.repo,{answers:{sender_name:known('Sender')}},{expectedRevision:0}),/revision conflict/);
 assert.throws(()=>runHr(['onboarding','status','--dry-run'],s.opts),/read-only/);
 assert.throws(()=>runHr(['onboarding','save','--input','-','--revision','1','--apply'],{...s.opts,input:{answers:{}}}),/not supported/);
 assert.equal(profile(s),before);
});
test('reviewed application preserves unrelated values and preferences and clears duplicate active answers',async t=>{
 const s=await setup(t),existing=yaml.load(profile(s));existing.legacy={keep:['unchanged',7]};fs.writeFileSync(join(s.root,'config/profile.yml'),yaml.dump(existing));
 const custom='User instructions before the managed block.\n';fs.mkdirSync(join(s.root,'modes'),{recursive:true});fs.writeFileSync(join(s.root,'modes/_custom.md'),custom);
 const answers=core({firm_name:known('Fixture Recruiting'),sender_name:known('Test Operator'),services:known(['sourcing','recruiting']),delivery_model:known('Recruiting delivery partnerships; no payroll or employment service.'),
  talent_focus:known('Senior backend and full-stack sourcing in selected LATAM countries. Country eligibility needs role-specific verification.'),differentiators:known(['A user-confirmed specialization in backend sourcing.']),
  role_families:known(['backend','fullstack']),icp_priority:known('agency'),writing_preferences:known('No em dashes. One or two short LinkedIn sentences.'),linkedin_max_chars:known(300),email:{status:'skipped'}});
 const rebased=await saveOnboarding(s.repo,{answers,base_fingerprint:onboardingStatus(s.repo).base_fingerprint},{expectedRevision:0});
 const preview=await applyOnboarding(s.repo,{}, {expectedRevision:rebased.revision,dryRun:true});
 await assert.rejects(applyOnboarding(s.repo,{}, {expectedRevision:1}),/preview_fingerprint/);
 const r=await applyOnboarding(s.repo,{preview_fingerprint:preview.preview_fingerprint},{expectedRevision:1});assert.equal(r.applied,true);assert.equal(r.recovered,false);
 assert.equal(loadConfig(s.root).firm.name,'Fixture Recruiting');assert.equal(loadConfig(s.root).firm.email,null);assert.deepEqual(yaml.load(profile(s)).legacy,existing.legacy);
 assert.equal(loadConfig(s.root).outreach.linkedin_max_chars,300);assert.equal(loadConfig(s.root).scoring.qualify,65);
 const body=fs.readFileSync(join(s.root,'modes/_custom.md'),'utf8');assert(body.startsWith(custom));assert(body.includes('agency'));assert(body.includes('No em dashes'));
 assert.deepEqual(readOnboarding(s.repo).answers,{});assert.equal(onboardingStatus(s.repo).offer,false);assert.equal(onboardingStatus(s.repo).readiness.research,'ready');
 assert.equal(onboardingStatus(s.repo).readiness.account_behavior,'unvalidated');assert.equal(readWorkspace(s.repo).linkedin_profile_url,null);
 assert.equal(s.repo.list().length,0);
});
test('unknown and skipped core answers can complete without inventing positive capabilities',async t=>{
 const s=await setup(t),r=await reviewed(s,core({services:{status:'skipped'}}));await apply(s,r);
 assert.deepEqual(loadConfig(s.root).firm.services,[]);assert.equal(loadConfig(s.root).firm.delivery_model,null);assert.deepEqual(loadConfig(s.root).firm.differentiators,[]);
 assert.equal(onboardingStatus(s.repo).core_complete,true);assert.equal(onboardingStatus(s.repo).offer,false);assert(readOnboarding(s.repo).unresolved.services==='skipped');
 assert(onboardingStatus(s.repo).readiness.firm_claim_gaps.includes('services'));
});
test('active settings changed after preview require explicit draft reconciliation; stale tokens fail',async t=>{
 const s=await setup(t),r=await reviewed(s,core({firm_name:known('Initial')}));
 fs.appendFileSync(join(s.root,'config/profile.yml'),'\n# Independent operator change\n');
 await assert.rejects(apply(s,r),/Active settings changed/);
 await assert.rejects(saveOnboarding(s.repo,{answers:{firm_name:known('Reconciled')}},{expectedRevision:1}),/reconcile/);
 const saved=await saveOnboarding(s.repo,{answers:{firm_name:known('Reconciled')},base_fingerprint:onboardingStatus(s.repo).base_fingerprint},{expectedRevision:1});
 await assert.rejects(applyOnboarding(s.repo,{preview_fingerprint:r.preview.preview_fingerprint},{expectedRevision:saved.revision}),/preview_fingerprint/);
 const preview=await applyOnboarding(s.repo,{}, {expectedRevision:saved.revision,dryRun:true});await apply(s,{saved,preview});assert.equal(loadConfig(s.root).firm.name,'Reconciled');
});
test('managed preferences preserve surrounding instructions and retain unchanged preference fields',async t=>{
 const s=await setup(t),r=await reviewed(s,core({icp_priority:known('agency'),writing_preferences:known('Keep this writing preference.')}));await apply(s,r);
 fs.appendFileSync(join(s.root,'modes/_custom.md'),'\nUser instructions after block.\n');
 const saved=await saveOnboarding(s.repo,{answers:{icp_priority:known('startup')},base_fingerprint:onboardingStatus(s.repo).base_fingerprint},{expectedRevision:onboardingStatus(s.repo).revision});
 const preview=await applyOnboarding(s.repo,{}, {expectedRevision:saved.revision,dryRun:true});await apply(s,{saved,preview});
 const custom=fs.readFileSync(join(s.root,'modes/_custom.md'),'utf8');assert(custom.includes('Keep this writing preference.'));assert(custom.endsWith('\nUser instructions after block.\n'));assert(custom.includes('startup'));
 fs.appendFileSync(join(s.root,'modes/_custom.md'),'<!-- hr-ops-onboarding:start -->');
 const again=await saveOnboarding(s.repo,{answers:{firm_name:known('Safe')},base_fingerprint:onboardingStatus(s.repo).base_fingerprint},{expectedRevision:onboardingStatus(s.repo).revision});
 const before=profile(s);await assert.rejects(applyOnboarding(s.repo,{}, {expectedRevision:again.revision,dryRun:true}),/Malformed or repeated/);assert.equal(profile(s),before);
});
test('interrupted apply is diagnosed, blocks canonical writes and resumes only planned file bytes',async t=>{
 const s=await setup(t),r=await reviewed(s,core({firm_name:known('After interruption'),writing_preferences:known('Concise.'),icp_priority:known('both')}));let writes=0;
 await assert.rejects(applyOnboarding(s.repo,{preview_fingerprint:r.preview.preview_fingerprint},{expectedRevision:1,write:(p,body)=>{if(++writes===2)throw Error('Injected interruption');writeFileAtomic(p,body);}}),/Injected interruption/);
 assert.equal(loadConfig(s.root).firm.name,'After interruption');assert.equal(readOnboarding(s.repo).revision,2);assert.equal(onboardingStatus(s.repo).stage,'recovery');
 assert.equal(diagnostics(s.repo).ok,false);await assert.rejects(s.repo.discover(input()),/Interrupted onboarding/);
 const recovered=await applyOnboarding(s.repo,{preview_fingerprint:r.preview.preview_fingerprint},{expectedRevision:2});assert.equal(recovered.recovered,true);assert.equal(diagnostics(s.repo).ok,true);
 assert.equal(readOnboarding(s.repo).pending,undefined);assert.equal(s.repo.list().length,0);
});
test('recovery refuses independent edits before touching any remaining file',async t=>{
 const s=await setup(t),r=await reviewed(s,core({firm_name:known('Pending'),writing_preferences:known('Concise.')}));
 await assert.rejects(applyOnboarding(s.repo,{preview_fingerprint:r.preview.preview_fingerprint},{expectedRevision:1,write:()=>{throw Error('Injected');}}),/Injected/);
 fs.appendFileSync(join(s.root,'config/profile.yml'),'\n# Independent edit after interruption\n');const before=profile(s);
 await assert.rejects(applyOnboarding(s.repo,{preview_fingerprint:r.preview.preview_fingerprint},{expectedRevision:2}),/Target changed/);assert.equal(profile(s),before);
 assert(!fs.existsSync(join(s.root,'modes/_custom.md')));
});
test('invalid facts, sources, overrides and account URLs fail before changing the draft',async t=>{
 const s=await setup(t),before=checkpoint(s);
 for(const answers of [{services:known(['EOR'])},{firm_name:{status:'unknown',value:'Invented'}},{firm_name:{...known('Not active'),source:'existing_configuration'}},
  {source_overrides:known({weights:{demand:100}})},{writing_preferences:known('<!-- hr-ops-onboarding:start -->')},
  {linkedin_profile_url:known('https://www.linkedin.com/company/not-personal')},{website:known('http://example.com')},{scoring:known(1)},
  {differentiators:known(['x'.repeat(501)])},{email:known('not an email')}]){
  await assert.rejects(saveOnboarding(s.repo,{answers},{expectedRevision:0}));assert.equal(checkpoint(s),before);
 }
 assert.equal(loadConfig(s.root).firm.name,null);
});
test('backup/restore retains incomplete onboarding and account binding without browser cookies',async t=>{
 const s=await setup(t);await saveOnboarding(s.repo,{answers:{firm_name:known('Incomplete')}},{expectedRevision:0});
 fs.mkdirSync(join(s.root,'local/browser-profiles'),{recursive:true});fs.writeFileSync(join(s.root,'local/browser-profiles','cookie-fixture'),'synthetic');
 const snap=await backup(s.repo),m=verifyBackup(snap.path),dest=join(s.parent,'restored');restore(snap.path,dest,{dryRun:false});
 assert(m.files.some(f=>f.path==='data/hr-ops/onboarding.json'));assert(!m.files.some(f=>f.path.includes('browser')));
 assert.deepEqual(readOnboarding(new LocalRepository(dest)),readOnboarding(s.repo));assert(diagnostics(new LocalRepository(dest)).ok);
 assert.equal(readWorkspace(new LocalRepository(dest)).id,readWorkspace(s.repo).id);assert(!fs.existsSync(join(dest,'local/browser-profiles')));
});
test('neutral fields preserve legacy firm and configuration fingerprints and material context invalidates drafts',()=>{
 const c=config(),old=structuredClone(c);for(const k of ['website','delivery_model','talent_focus','differentiators'])delete old.firm[k];
 assert.equal(firmFingerprint(c.firm),hash(old.firm));assert.equal(configurationFingerprint(c),hash(canonical(old)));validateConfig(old);
 const p=prospect();qualify(p,c);saveDraft(p,draft(p),c);assert(draftCurrent(p.drafts[0],p,c));
 c.firm.delivery_model='User-confirmed sourcing partnerships';assert(!draftCurrent(p.drafts[0],p,c));assert.notEqual(firmFingerprint(c.firm),hash(old.firm));
 assert.equal(researchTasks(p,c).firm.delivery_model,c.firm.delivery_model);assert.equal(outreachBrief(p,c).firm.delivery_model,c.firm.delivery_model);
});
test('new business firm claims require actual configured values and cannot bypass availability guardrails',()=>{
 for(const field of ['delivery_model','talent_focus','differentiators']){
  const c=config(),p=prospect();qualify(p,c);const d=draft(p),claim='Our specific research specialization.';d.body+=' '+claim;d.claims.push({text:claim,kind:'firm',firm_field:field});
  assert.throws(()=>saveDraft(p,d,c),/not configured/);c.firm[field]=field==='differentiators'?[claim]:claim;saveDraft(p,d,c);assert(p.drafts.length===1);
 }
 const c=config(),p=prospect();qualify(p,c);c.firm.delivery_model='Engineers available';const d=draft(p);d.body+=' Engineers available.';d.claims.push({text:'Engineers available',kind:'firm',firm_field:'delivery_model'});
 assert.throws(()=>saveDraft(p,d,c),/candidate_availability|commercial|claim/i);
});
test('neutral configuration additions do not make existing reports stale',async t=>{
 const s=await setup(t),p=prospect(),c=config();publishDossier(s.repo,p,c);assert.equal(reportStatus(s.repo,p,c).status,'current');
 const legacy=structuredClone(c);for(const k of ['website','delivery_model','talent_focus','differentiators'])delete legacy.firm[k];
 assert.equal(reportStatus(s.repo,p,legacy).status,'current');
});
test('previous unknowns disappear from a revised preview and account configuration remains unvalidated',async t=>{
 const s=await setup(t),r=await reviewed(s);await apply(s,r);
 const saved=await saveOnboarding(s.repo,{answers:{firm_name:known('Now known'),linkedin_profile_url:known('https://www.linkedin.com/in/fixture-person'),linkedin_page_url:known('https://www.linkedin.com/company/fixture-firm')}},{expectedRevision:onboardingStatus(s.repo).revision});
 const preview=await applyOnboarding(s.repo,{}, {expectedRevision:saved.revision,dryRun:true});assert(!Object.hasOwn(preview.unknowns,'firm_name'));await apply(s,{saved,preview});
 assert.equal(readWorkspace(s.repo).linkedin_profile_url,'https://www.linkedin.com/in/fixture-person');assert.equal(onboardingStatus(s.repo).readiness.account_behavior,'unvalidated');
 assert.equal(s.repo.list().length,0);assert(!fs.existsSync(join(s.root,'local/browser-profiles')));
});
test('corrupt checkpoints and dangling preference links fail closed without writes',async t=>{
 const s=await setup(t);fs.writeFileSync(join(s.repo.dir,'onboarding.json'),'{}');
 assert.equal(diagnostics(s.repo).ok,false);await assert.rejects(s.repo.discover(input()),/onboarding|version/i);
 const other=await setup(t);fs.mkdirSync(join(other.root,'modes'),{recursive:true});
 try{fs.symlinkSync(join(other.parent,'missing-preferences'),join(other.root,'modes/_custom.md'),'file');}
 catch(error){if(['EPERM','EACCES'].includes(error.code)){t.diagnostic('File symlink unavailable; corrupt-checkpoint half still exercised');return;}throw error;}
 assert.throws(()=>onboardingStatus(other.repo),/must not be a link/);assert.equal(other.repo.list().length,0);
});
test('oversized otherwise-valid draft inputs fail before either preview or save can strand a checkpoint',async t=>{
 const s=await setup(t),before=checkpoint(s),answers={source_overrides:known({queries:{agency:['x'.repeat(2_000_001)]}})};
 for(const dryRun of [true,false])await assert.rejects(saveOnboarding(s.repo,{answers},{expectedRevision:0,dryRun}),/exceeds 2 MB/);
 assert.equal(checkpoint(s),before);assert.equal(onboardingStatus(s.repo).revision,0);
});
test('onboarding cannot rebind an account when history appeared after preview',async t=>{
 const s=await setup(t),sender='https://www.linkedin.com/in/onboarding-original';await configureWorkspace(s.repo,{linkedin_profile_url:sender});
 const saved=await saveOnboarding(s.repo,{answers:core({linkedin_profile_url:known('https://www.linkedin.com/in/onboarding-other')}),base_fingerprint:onboardingStatus(s.repo).base_fingerprint},{expectedRevision:0});
 const preview=await applyOnboarding(s.repo,{}, {expectedRevision:saved.revision,dryRun:true});
 const now=new Date();await startInbox(s.repo,{id:'offline-history',sender_profile_url:sender,since:new Date(+now-86400000).toISOString(),authorization:auth()},now);
 const before=profile(s);await assert.rejects(applyOnboarding(s.repo,{preview_fingerprint:preview.preview_fingerprint},{expectedRevision:saved.revision}),/separate workspace/);
 assert.equal(profile(s),before);assert.equal(readWorkspace(s.repo).linkedin_profile_url,sender);assert.equal(readOnboarding(s.repo).pending,undefined);
});
test('source override drafts use the real source validator and preserve valid disabled overrides',async t=>{
 const s=await setup(t),before=checkpoint(s);
 for(const source of [{website:'not-a-url',enabled:true},{website:'https://fixture.example',enabled:'false'},{website:'https://fixture.example',name:'Fixture',provider:'unknown',icp:'agency'}]){
  await assert.rejects(saveOnboarding(s.repo,{answers:{source_overrides:known({sources:[source]})}},{expectedRevision:0}),/Invalid discovery source overrides/);assert.equal(checkpoint(s),before);
 }
 const answers=core({source_overrides:known({sources:[{website:'https://fixture.example',enabled:false}],feeds:[{id:'bedrock-talent',enabled:false}]})});
 const r=await reviewed(s,answers);await apply(s,r);assert.equal(loadConfig(s.root).discovery.sources[0].enabled,false);assert.equal(loadConfig(s.root).discovery.feeds[0].enabled,false);
 assert.equal(runHr(['doctor'],s.opts).ok,true);
});

const settingBytes=s=>Object.fromEntries(['config/profile.yml','modes/_custom.md','data/hr-ops/workspace.json'].map(path=>[path,fs.existsSync(join(s.root,path))?fs.readFileSync(join(s.root,path),'utf8'):null]));
async function interrupted(s,{afterProfile=false}={}){
 const r=await reviewed(s,core({firm_name:known('Planned firm'),writing_preferences:known('Concise.')}));let writes=0;
 await assert.rejects(applyOnboarding(s.repo,{preview_fingerprint:r.preview.preview_fingerprint},{expectedRevision:r.saved.revision,
  write:(path,body)=>{if(++writes===(afterProfile?2:1))throw Error('Injected interruption');writeFileAtomic(path,body);}}),/Injected interruption/);
 return r;
}

test('partial cadence answers preserve nondefault intervals and disabled follow-ups',async t=>{
 const s=await setup(t,{followups:{first_days:5,subsequent_days:23,max_followups:0}}),r=await reviewed(s,core({followups:known({first_days:3})}));
 assert.deepEqual(loadConfig(s.root).followups,{first_days:5,subsequent_days:23,max_followups:0});
 const proposed=yaml.load(r.preview.changes.find(c=>c.path==='config/profile.yml').after);
 assert.deepEqual(proposed.hr_ops.followups,{first_days:3,subsequent_days:23,max_followups:0});
 await apply(s,r);assert.deepEqual(loadConfig(s.root).followups,proposed.hr_ops.followups);
 for(const value of [7,[],null,{typo:3}])await assert.rejects(saveOnboarding(s.repo,{answers:{followups:known(value)}},{expectedRevision:readOnboarding(s.repo).revision}));
});

test('source additions preserve domain aliases, disabled feeds and unmentioned filter values',async t=>{
 const seed=sourceCatalog().sources[0];
 const s=await setup(t,{discovery:{starter_sources:true,sources:[{website:seed.website,enabled:false}],
  feeds:[{id:'remotive',enabled:false},{id:'speedrun',enabled:false,filters:{scope:'speedrun',wp:'remote'}}]}});
 const r=await reviewed(s,core({source_overrides:known({sources:[{website:'https://unrelated.example',enabled:false}],feeds:[{id:'remoteok',enabled:false},{id:'speedrun',filters:{q:'backend'}}]})}));
 await apply(s,r);const c=loadConfig(s.root);
 assert.equal(c.discovery.sources.length,2);assert(!inspectSources(c).sources.some(x=>x.name===seed.name));
 assert.equal(discoveryFeeds(c).find(x=>x.id==='remotive').enabled,false);
 assert.equal(discoveryFeeds(c).find(x=>x.id==='remoteok').enabled,false);
 assert.deepEqual(c.discovery.feeds.find(x=>x.id==='speedrun'),{id:'speedrun',enabled:false,filters:{scope:'speedrun',wp:'remote',q:'backend'}});
 const next=await reviewed(s,{source_overrides:known({sources:[{...seed,website:seed.website.replace('https://','https://www.'),enabled:true}],feeds:[{id:'remotive',enabled:true}]})});
 await apply(s,next);const enabled=loadConfig(s.root);
 assert.equal(enabled.discovery.sources.length,2);assert(inspectSources(enabled).sources.some(x=>x.name===seed.name));
 assert.equal(discoveryFeeds(enabled).find(x=>x.id==='remotive').enabled,true);
 assert.equal(discoveryFeeds(enabled).find(x=>x.id==='remoteok').enabled,false);
});

test('partial existing source updates remain independently readable and duplicate updates fail before save',async t=>{
 const source={website:'https://custom-source.example',name:'Synthetic source',icp:'agency',provider:'manual',
  identity_evidence:{id:'synthetic-source',url:'https://custom-source.example/jobs',excerpt:'Synthetic fixture source publishes client vacancies.',observed_at:new Date().toISOString(),source_type:'primary'}};
 const s=await setup(t,{discovery:{sources:[source]}});
 const saved=await saveOnboarding(s.repo,{answers:core({source_overrides:known({sources:[{website:'https://www.custom-source.example',notes:'Updated notes only.'}]})})},{expectedRevision:0});
 assert.equal(readOnboarding(s.repo).answers.source_overrides.value.sources[0].provider,source.provider);
 const preview=await applyOnboarding(s.repo,{}, {expectedRevision:saved.revision,dryRun:true});await apply(s,{saved,preview});
 assert.equal(loadConfig(s.root).discovery.sources[0].notes,'Updated notes only.');
 for(const value of [{sources:[{website:source.website,enabled:false},{website:'https://www.custom-source.example',enabled:false}]},{feeds:[{id:'remotive',enabled:false},{id:'remotive',enabled:true}]}]){
  const before=checkpoint(s);await assert.rejects(saveOnboarding(s.repo,{answers:{source_overrides:known(value)}},{expectedRevision:readOnboarding(s.repo).revision}),/Duplicate/);assert.equal(checkpoint(s),before);
 }
});

test('status resolves applied composite values and existing configuration confirmations after restart',async t=>{
 const s=await setup(t),r=await reviewed(s,core({role_families:known(['backend']),icp_priority:known('agency'),writing_preferences:known('Keep messages short.'),
  linkedin_profile_url:known('https://www.linkedin.com/in/fixture-person'),linkedin_page_url:known('https://www.linkedin.com/company/fixture-page'),source_overrides:known({starter_sources:true})}));
 await apply(s,r);const status=runHr(['onboarding','status'],s.opts),values=Object.fromEntries(status.questions.map(q=>[q.id,q.active_value]));
 assert.deepEqual(values.role_families,['backend']);assert.equal(values.icp_priority,'agency');assert.equal(values.writing_preferences,'Keep messages short.');
 assert.equal(values.linkedin_profile_url,'https://www.linkedin.com/in/fixture-person');assert.equal(values.linkedin_page_url,'https://www.linkedin.com/company/fixture-page');
 assert.equal(values.source_overrides.starter_sources,true);
 const answers=Object.fromEntries(['role_families','icp_priority','writing_preferences','source_overrides','linkedin_profile_url','linkedin_page_url'].map(id=>[id,{status:'known',value:values[id],source:'existing_configuration'}]));
 const before=settingBytes(s);await saveOnboarding(s.repo,{answers},{expectedRevision:status.revision});assert.deepEqual(settingBytes(s),before);
 await assert.rejects(saveOnboarding(s.repo,{answers:{icp_priority:{status:'known',value:'startup',source:'existing_configuration'}}},{expectedRevision:readOnboarding(s.repo).revision}),/differs from active/);
});

test('different role families remain visible per ICP rather than becoming a false shared confirmation',async t=>{
 const s=await setup(t,{icps:{agency:{role_families:['backend']},startup:{role_families:['fullstack']}}});
 const role=onboardingStatus(s.repo).questions.find(q=>q.id==='role_families');assert.deepEqual(role.active_value,{agency:['backend'],startup:['fullstack']});
 await assert.rejects(saveOnboarding(s.repo,{answers:{role_families:{status:'known',value:['backend'],source:'existing_configuration'}}},{expectedRevision:0}),/differs from active/);
});

test('onboarding research readiness agrees with health failures while optional email and incomplete interviews stay nonblocking',async t=>{
 const s=await setup(t);assert.equal(onboardingStatus(s.repo).readiness.research,'ready');assert.equal(loadConfig(s.root).firm.email,null);
 assert.equal(runHr(['doctor'],s.opts).readiness.research.state,'ready');
 await interrupted(s);assert.equal(onboardingStatus(s.repo).readiness.research,'invalid_state');
 const broken=await setup(t);fs.writeFileSync(join(broken.repo.records,'1234567890abcdef.json'),'{}');
 assert.equal(onboardingStatus(broken.repo).readiness.research,'invalid_state');assert.equal(diagnostics(broken.repo).ok,false);
 const source=await setup(t,{discovery:{sources:[{website:'https://bad-source.example',enabled:true}]}});
 assert.equal(onboardingStatus(source.repo).readiness.research,'invalid_state');
 const migration=await setup(t);fs.writeFileSync(join(migration.repo.dir,'migration-v2.json'),JSON.stringify({status:'applying',backup:'fixture-backup',ids:[]}));
 assert.equal(onboardingStatus(migration.repo).readiness.research,'invalid_state');
});

test('malformed managed preferences receive structured diagnostics without breaking doctor output',async t=>{
 const s=await setup(t);fs.mkdirSync(join(s.root,'modes'),{recursive:true});fs.writeFileSync(join(s.root,'modes/_custom.md'),'<!-- hr-ops-onboarding:start -->');
 assert.equal(onboardingStatus(s.repo).readiness.research,'invalid_state');assert.match(onboardingStatus(s.repo).preference_error,/Malformed/);
 const {spawnSync}=await import('node:child_process');const child=spawnSync(process.execPath,[join(CODE,'hr-ops.mjs'),'doctor'],{cwd:CODE,env:s.opts.env,encoding:'utf8'});
 assert.equal(child.status,1);const doctor=JSON.parse(child.stdout);assert.equal(doctor.ok,false);assert(doctor.errors.some(e=>e.file==='modes/_custom.md'));
});

test('reviewed reconciliation retains independent settings before and between writes and resumes normal operation',async t=>{
 for(const afterProfile of [false,true]){
  const s=await setup(t),old=await interrupted(s,{afterProfile});
  const raw=yaml.load(profile(s));raw.hr_ops.firm.name='Independent firm';fs.writeFileSync(join(s.root,'config/profile.yml'),yaml.dump(raw));
  fs.mkdirSync(join(s.root,'modes'),{recursive:true});fs.writeFileSync(join(s.root,'modes/_custom.md'),'Independent procedural instruction.\n');
  const w=readWorkspace(s.repo);w.name='Independent workspace name';fs.writeFileSync(join(s.repo.dir,'workspace.json'),JSON.stringify(w,null,2)+'\n');
  const revision=readOnboarding(s.repo).revision,before=settingBytes(s),stateBefore=checkpoint(s);
  const pending=await applyOnboarding(s.repo,{}, {expectedRevision:revision,dryRun:true});assert.equal(pending.applicable,false);
  assert(pending.conflicts.some(c=>c.path==='config/profile.yml'&&c.target));assert(pending.conflicts.some(c=>c.path==='data/hr-ops/workspace.json'&&!c.target));
  const preview=runHr(['onboarding','reconcile','--input','-','--revision',String(revision),'--dry-run'],{...s.opts,input:{}});
  assert.equal(checkpoint(s),stateBefore);assert.deepEqual(settingBytes(s),before);assert.equal(readOnboardingRecoveries(s.repo).length,0);
  await assert.rejects(reconcileOnboarding(s.repo,{}, {expectedRevision:revision}),/reconciliation_fingerprint/);
  const result=runHr(['onboarding','reconcile','--input','-','--revision',String(revision)],{...s.opts,input:{reconciliation_fingerprint:preview.reconciliation_fingerprint}});
  assert.equal(result.needs_new_review,true);assert.equal(result.settings_changed,false);assert.deepEqual(settingBytes(s),before);
  assert.equal(readOnboarding(s.repo).pending,undefined);assert.equal(readOnboardingRecoveries(s.repo).length,1);assert.equal(diagnostics(s.repo).ok,true);
  const saved=await saveOnboarding(s.repo,{answers:{firm_name:{status:'unknown'},writing_preferences:known('Keep this new concise preference.')}},{expectedRevision:result.revision});
  await assert.rejects(applyOnboarding(s.repo,{preview_fingerprint:old.preview.preview_fingerprint},{expectedRevision:saved.revision}),/preview_fingerprint/);
  const fresh=await applyOnboarding(s.repo,{}, {expectedRevision:saved.revision,dryRun:true});await apply(s,{saved,preview:fresh});
  assert.equal(loadConfig(s.root).firm.name,'Independent firm');assert.equal(readWorkspace(s.repo).name,'Independent workspace name');
  assert(fs.readFileSync(join(s.root,'modes/_custom.md'),'utf8').startsWith('Independent procedural instruction.\n'));
  assert.equal((await s.repo.discover(input())).created,true);
 }
});

test('reconciliation rejects stale previews and revisions without changing settings or receipts',async t=>{
 const s=await setup(t);await interrupted(s);const revision=readOnboarding(s.repo).revision;
 const preview=await reconcileOnboarding(s.repo,{}, {expectedRevision:revision,dryRun:true});
 fs.appendFileSync(join(s.root,'config/profile.yml'),'\n# Later independent edit\n');const state=checkpoint(s),before=settingBytes(s);
 await assert.rejects(reconcileOnboarding(s.repo,{reconciliation_fingerprint:preview.reconciliation_fingerprint},{expectedRevision:revision}),/reconciliation_fingerprint/);
 await assert.rejects(reconcileOnboarding(s.repo,{}, {expectedRevision:revision-1,dryRun:true}),/revision conflict/);
 assert.equal(checkpoint(s),state);assert.deepEqual(settingBytes(s),before);assert.equal(readOnboardingRecoveries(s.repo).length,0);
 const fresh=await reconcileOnboarding(s.repo,{}, {expectedRevision:revision,dryRun:true});
 await reconcileOnboarding(s.repo,{reconciliation_fingerprint:fresh.reconciliation_fingerprint},{expectedRevision:revision});
 await assert.rejects(reconcileOnboarding(s.repo,{}, {expectedRevision:revision+1,dryRun:true}),/No interrupted/);
});

test('interruption after recovery archive creation is retryable without duplicate receipts',async t=>{
 const s=await setup(t);await interrupted(s);const revision=readOnboarding(s.repo).revision;
 const preview=await reconcileOnboarding(s.repo,{}, {expectedRevision:revision,dryRun:true}),state=checkpoint(s),before=settingBytes(s);
 await assert.rejects(reconcileOnboarding(s.repo,{reconciliation_fingerprint:preview.reconciliation_fingerprint},{expectedRevision:revision,
  write:(path,body)=>{if(path.endsWith('onboarding.json'))throw Error('Injected receipt interruption');writeFileAtomic(path,body);}}),/Injected receipt/);
 assert.equal(checkpoint(s),state);assert.deepEqual(settingBytes(s),before);const archives=readOnboardingRecoveries(s.repo);assert.equal(archives.length,1);
 await reconcileOnboarding(s.repo,{reconciliation_fingerprint:preview.reconciliation_fingerprint},{expectedRevision:revision});
 assert.deepEqual(readOnboardingRecoveries(s.repo),archives);assert.deepEqual(settingBytes(s),before);assert.equal(diagnostics(s.repo).ok,true);
});

test('backup and restore validate reconciliation history and retain editable drafts without browser state',async t=>{
 const s=await setup(t);await interrupted(s);const revision=readOnboarding(s.repo).revision;
 const preview=await reconcileOnboarding(s.repo,{}, {expectedRevision:revision,dryRun:true});
 await reconcileOnboarding(s.repo,{reconciliation_fingerprint:preview.reconciliation_fingerprint},{expectedRevision:revision});
 const saved=await backup(s.repo),dest=join(s.parent,'restored-with-recovery');restore(saved.path,dest,{dryRun:false});const restored=new LocalRepository(dest);
 assert.deepEqual(readOnboardingRecoveries(restored),readOnboardingRecoveries(s.repo));assert.deepEqual(readOnboarding(restored),readOnboarding(s.repo));
 assert(verifyBackup(saved.path).files.some(f=>f.path.includes('/onboarding-recoveries/')));assert.equal(diagnostics(restored).ok,true);
 const archive=readOnboardingRecoveries(s.repo)[0];fs.writeFileSync(join(s.repo.dir,'onboarding-recoveries',archive.file),'{}');
 assert.equal(diagnostics(s.repo).ok,false);assert(diagnostics(s.repo).errors.some(e=>e.file==='onboarding-recoveries'));
 await assert.rejects(s.repo.discover(input()),/recovery archive version/);
});

test('inconsistent completion and unresolved metadata fail closed while unknown and skipped responses remain valid',async t=>{
 const s=await setup(t),r=await reviewed(s);await apply(s,r);const valid=readOnboarding(s.repo);
 for(const corrupt of [{...valid,completed:[]},{...valid,completed:valid.completed.filter(id=>id!=='firm_name')},{...valid,unresolved:{...valid.unresolved,email:'unknown'}}]){
  fs.writeFileSync(join(s.repo.dir,'onboarding.json'),JSON.stringify(corrupt));assert.equal(diagnostics(s.repo).ok,false);
  await assert.rejects(s.repo.discover(input()),/completion|core responses/i);
 }
 fs.writeFileSync(join(s.repo.dir,'onboarding.json'),JSON.stringify(valid));assert.equal(diagnostics(s.repo).ok,true);assert.equal(onboardingStatus(s.repo).core_complete,true);
});
