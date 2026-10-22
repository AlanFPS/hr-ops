import fs from 'node:fs';
import {join,dirname} from 'node:path';
import * as yaml from 'js-yaml';
import {assert,keys,text,hash,stamp,canonical,DEFAULTS,mergeConfig,validateConfig} from './model.mjs';
import {loadConfig,isInitialized} from './store.mjs';
import {readWorkspace,configureWorkspace,normalizeWorkspaceAccountUrl} from './workspace.mjs';
import {writeFileAtomic} from '../../tracker-utils.mjs';
import {inspectSources} from './sources.mjs';

const TARGETS=['config/profile.yml','modes/_custom.md','data/hr-ops/workspace.json'];
const BEGIN='<!-- hr-ops-onboarding:start -->',END='<!-- hr-ops-onboarding:end -->';
const PREFIX='\n## HR onboarding preferences\n\nProcedural preferences only; no firm facts or permission to send.\n```json\n';
const definitions=[
 ['firm_name','identity',true,'firm.name'],['sender_name','identity',true,'firm.sender_name'],['website','identity',false,'firm.website'],['email','identity',false,'firm.email'],
 ['services','services',true,'firm.services'],['delivery_model','services',true,'firm.delivery_model'],
 ['talent_focus','talent_focus',true,'firm.talent_focus'],['role_families','talent_focus',true,null],
 ['icp_priority','client_targeting',true,null],['startup_size','client_targeting',true,'icps.startup.employee_range'],['agency_size','client_targeting',true,'icps.agency.recruiter_range'],['exclude_latam_specialists','client_targeting',false,'icps.agency.exclude_latam_specialists'],
 ['differentiators','service_proposition',true,'firm.differentiators'],
 ['language','working_preferences',true,'language'],['timezone','working_preferences',false,'timezone'],['batch_size','working_preferences',true,'discovery.limit'],['followups','working_preferences',true,'followups'],['linkedin_max_chars','working_preferences',true,'outreach.linkedin_max_chars'],['writing_preferences','working_preferences',true,null],
 ['fees','commercial_detail',false,'firm.fees'],['guarantees','commercial_detail',false,'firm.guarantees'],['candidate_availability','commercial_detail',false,'firm.candidate_availability'],
 ['source_overrides','source_detail',false,null],['linkedin_profile_url','account_detail',false,null],['linkedin_page_url','account_detail',false,null],
];
export const ONBOARDING_QUESTIONS=definitions.map(([id,section,core,path])=>({id,section,core,path}));
const Q=new Map(ONBOARDING_QUESTIONS.map(q=>[q.id,q]));
const equal=(a,b)=>JSON.stringify(canonical(a))===JSON.stringify(canonical(b));
export const onboardingPath=repo=>join(repo.dir,'onboarding.json');
function safePath(repo,relative){
 assert([...TARGETS,'data/hr-ops/onboarding.json'].includes(relative),'Unexpected onboarding target');
 const p=join(repo.root,relative);for(let cursor=p;;cursor=dirname(cursor)){
  const stat=fs.lstatSync(cursor,{throwIfNoEntry:false});if(stat)assert(!stat.isSymbolicLink(),'Onboarding path must not be a link');
  if(cursor===repo.root)break;
 }
 return p;
}
function contents(repo,relative){const p=safePath(repo,relative);if(!fs.existsSync(p))return null;assert(fs.statSync(p).isFile()&&fs.statSync(p).size<=2_000_000,'Invalid or oversized onboarding target');return fs.readFileSync(p,'utf8');}
const digest=content=>content===null?null:hash(content);
function baseline(repo){return Object.fromEntries(TARGETS.map(p=>[p,digest(contents(repo,p))]));}
const get=(c,path)=>path.split('.').reduce((v,k)=>v?.[k],c);
function set(c,path,value){const parts=path.split('.');let target=c;for(const k of parts.slice(0,-1))target=target[k]??=( {} );target[parts.at(-1)]=structuredClone(value);}
function preferences(content){
 const old=content??'',a=old.indexOf(BEGIN),b=old.indexOf(END);
 if(a<0&&b<0)return {old,values:{},a:-1,b:-1};
 assert(a>=0&&b>a&&old.indexOf(BEGIN,a+BEGIN.length)<0&&old.indexOf(END,b+END.length)<0,'Malformed or repeated onboarding preference markers; reconcile explicitly');
 const body=old.slice(a+BEGIN.length,b);assert(body.startsWith(PREFIX)&&body.endsWith('\n```\n'),'Edited onboarding preference block requires reconciliation');
 const values=JSON.parse(body.slice(PREFIX.length,-5));keys(values,['icp_priority','writing_preferences'],'managed preferences');
 if(values.icp_priority!==undefined)assert(['both','agency','startup'].includes(values.icp_priority),'Invalid ICP preference');
 if(values.writing_preferences!==undefined)text(values.writing_preferences,'writing_preferences',8000);
 return {old,values,a,b};
}
function validateAnswer(id,a,c,repo){
 assert(Q.has(id),'Unknown onboarding question '+id);keys(a,['status','value','source'],'onboarding answer');
 assert(['known','unknown','skipped'].includes(a.status),'Answer status must be known, unknown or skipped');
 if(a.source!==undefined)assert(['user_confirmed','existing_configuration'].includes(a.source),'Invalid answer source');
 if(a.status!=='known'){assert(!Object.hasOwn(a,'value'),'Unknown/skipped answers cannot carry active values');return;}
 assert(Object.hasOwn(a,'value'),'Known answer requires a value');
 const q=Q.get(id),trial=structuredClone(c);
 if(id==='email')assert(a.value===null||typeof a.value==='string'&&/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(a.value),'Use an email address or leave it unknown');
 if(q.path)set(trial,q.path,a.value);
 else if(id==='role_families'){set(trial,'icps.agency.role_families',a.value);set(trial,'icps.startup.role_families',a.value);}
 else if(id==='source_overrides'){
  keys(a.value,['sources','feeds','queries','starter_sources','max_candidates','max_queries','pages_per_company'],'source overrides');
  trial.discovery=mergeConfig(trial.discovery,a.value);
 }else if(id==='icp_priority')assert(['both','startup','agency'].includes(a.value),'Invalid ICP priority');
 else if(id==='writing_preferences'){text(a.value,'writing_preferences',8000);assert(!a.value.includes(BEGIN)&&!a.value.includes(END),'Preference text cannot contain managed markers');}
 else normalizeWorkspaceAccountUrl(a.value,id==='linkedin_page_url');
 validateConfig(trial);
 if(id==='source_overrides'){
  const checked=inspectSources(trial,{starter:true});assert(!checked.diagnostics.length,'Invalid discovery source overrides: '+checked.diagnostics.map(d=>d.error).join('; '));
 }
 if(a.source==='existing_configuration'){
  const existing=q.path?get(c,q.path):id==='role_families'&&equal(c.icps.agency.role_families,c.icps.startup.role_families)?c.icps.startup.role_families:
   ['linkedin_profile_url','linkedin_page_url'].includes(id)?readWorkspace(repo)?.[id]:preferences(contents(repo,'modes/_custom.md')).values[id];
  assert(equal(existing,a.value),'Existing-configuration answer differs from active value');
 }
}
export function readOnboarding(repo){
 const p=safePath(repo,'data/hr-ops/onboarding.json');if(!fs.existsSync(p))return null;
 const s=JSON.parse(contents(repo,'data/hr-ops/onboarding.json'));
 keys(s,['version','revision','phase','answers','completed','unresolved','baseline','updated_at','pending'],'onboarding state');
 assert(s.version===1&&Number.isSafeInteger(s.revision)&&s.revision>=0,'Invalid onboarding version/revision');
 assert(['draft','complete'].includes(s.phase),'Invalid onboarding phase');stamp(s.updated_at);
 keys(s.baseline,TARGETS,'onboarding baseline');assert(TARGETS.every(p=>Object.hasOwn(s.baseline,p)),'Missing onboarding baseline');
 for(const h of Object.values(s.baseline))assert(h===null||/^[a-f0-9]{64}$/.test(h),'Invalid onboarding baseline hash');
 keys(s.answers,[...Q.keys()],'onboarding answers');
 // Validate draft values independently of active state, which may be partially applied.
 for(const [id,a] of Object.entries(s.answers)){
  if(a.source!==undefined)assert(['user_confirmed','existing_configuration'].includes(a.source),'Invalid answer source');
  validateAnswer(id,{...a,source:'user_confirmed'},structuredClone(DEFAULTS),repo);
 }
 assert(Array.isArray(s.completed)&&new Set(s.completed).size===s.completed.length&&s.completed.every(id=>Q.has(id)),'Invalid onboarding completion metadata');
 assert(s.phase!=='complete'||!Object.keys(s.answers).length&&!s.pending,'Completed onboarding cannot contain an active draft or pending write');
 keys(s.unresolved,[...Q.keys()],'onboarding unresolved');assert(Object.values(s.unresolved).every(v=>['unknown','skipped'].includes(v)),'Invalid unresolved answer');
 if(s.pending){
  keys(s.pending,['fingerprint','targets'],'onboarding pending application');assert(/^[a-f0-9]{64}$/.test(s.pending.fingerprint)&&Array.isArray(s.pending.targets)&&s.pending.targets.length<=3,'Invalid pending onboarding application');
  const seen=new Set();for(const t of s.pending.targets){keys(t,['path','before_hash','after_hash','content'],'pending target');assert(TARGETS.includes(t.path)&&!seen.has(t.path),'Unexpected pending path');seen.add(t.path);
   assert(t.before_hash===s.baseline[t.path]&&typeof t.content==='string'&&t.content.length<=2_000_000&&hash(t.content)===t.after_hash,'Invalid pending target hash');}
 }
 return s;
}
function freshState(repo,now){return {version:1,revision:0,phase:'draft',answers:{},completed:[],unresolved:{},baseline:baseline(repo),updated_at:now.toISOString()};}
function serializedState(s){const value=JSON.stringify(s,null,2)+'\n';assert(Buffer.byteLength(value)<=2_000_000,'Onboarding checkpoint exceeds 2 MB; reduce draft inputs');return value;}
function store(repo,s){writeFileAtomic(safePath(repo,'data/hr-ops/onboarding.json'),serializedState(s));}
export async function beginOnboarding(repo,{now=new Date()}={}){
 return repo.lock(()=>{assert(isInitialized(repo.root),'Initialize HR configuration first');assert(!readOnboarding(repo),'Onboarding checkpoint already exists');const s=freshState(repo,now);store(repo,s);return s;});
}
export function onboardingStatus(repo){
 const state=readOnboarding(repo),initialized=isInitialized(repo.root),c=loadConfig(repo.root),w=readWorkspace(repo),current=baseline(repo);
 const completed=new Set([...(state?.completed??[]),...Object.keys(state?.answers??{})]);
 return {root:repo.root,workspace:w,stage:!initialized?'workspace':state?.pending?'recovery':!state?'legacy_configured':state.phase==='complete'?'complete':'business',
  revision:state?.revision??0,offer:!initialized||!!state&&(state.phase==='draft'||!!state.pending),offer_frequency:'At most once per agent conversation; declining is non-blocking.',
  base_fingerprint:hash(current),active_settings_changed:!!state&&!equal(current,state.baseline),pending_application:!!state?.pending,
  core_complete:ONBOARDING_QUESTIONS.filter(q=>q.core).every(q=>completed.has(q.id)),
  questions:ONBOARDING_QUESTIONS.map(q=>({...q,status:state?.answers[q.id]?.status??state?.unresolved[q.id]??(state?.completed.includes(q.id)?'applied':'unanswered'),
   draft:state?.answers[q.id]??null,active_value:q.path?get(c,q.path):null,
   active_value_is_not_user_confirmation:true,matches_shipped_default:q.path?equal(get(c,q.path),get(DEFAULTS,q.path)):null,
   suggestion:q.id==='linkedin_max_chars'?300:null})),
  readiness:{research:initialized?'ready':'missing_configuration',firm_claim_gaps:['name','sender_name','services'].filter(k=>c.firm[k]===null||c.firm[k]?.length===0),
   business_email_configured:!!c.firm.email,personal_profile_configured:!!w?.linkedin_profile_url,account_behavior:'unvalidated',send_enabled:false},
  advisory:'Talent focus and ICP priorities are guidance, not employment eligibility, candidate availability or new deterministic filters. Unknown answers never establish capabilities.'};
}
export function onboardingHealth(repo){const s=onboardingStatus(repo);return Object.fromEntries(['stage','revision','offer','core_complete','active_settings_changed','pending_application'].map(k=>[k,s[k]]));}
export async function saveOnboarding(repo,input,{expectedRevision,dryRun=false,now=new Date()}={}){
 keys(input,['answers','base_fingerprint'],'onboarding draft');keys(input.answers,[...Q.keys()],'onboarding answers');assert(Object.keys(input.answers).length,'Provide at least one answer');
 const perform=()=>{
  assert(isInitialized(repo.root),'Create/select a workspace or initialize HR configuration first');
  const s=readOnboarding(repo)??freshState(repo,now),active=baseline(repo),c=loadConfig(repo.root);
  assert(Number.isSafeInteger(expectedRevision)&&s.revision===expectedRevision,'Onboarding revision conflict; reload status');assert(!s.pending,'Resume pending onboarding apply before saving');
  if(input.base_fingerprint!==undefined)assert(input.base_fingerprint===hash(active),'Active settings fingerprint changed; reload and reconcile');
  assert(equal(active,s.baseline)||input.base_fingerprint===hash(active),'Active settings changed; reconcile answers and supply current base_fingerprint');
  for(const [id,a] of Object.entries(input.answers))validateAnswer(id,a,c,repo);
  const next={...s,revision:s.revision+1,phase:'draft',answers:{...s.answers,...structuredClone(input.answers)},baseline:active,updated_at:now.toISOString()};
  serializedState(next);
  if(!dryRun)store(repo,next);return {revision:next.revision,dry_run:dryRun,active_settings_changed:false,answers_saved:Object.keys(input.answers),send_enabled:false};
 };return dryRun?perform():repo.lock(perform);
}
async function plan(repo,s){
 const profileText=contents(repo,'config/profile.yml');assert(profileText!==null,'HR profile missing');
 const profile=yaml.load(profileText);assert(profile&&typeof profile==='object'&&!Array.isArray(profile),'Invalid profile');
 const hr=structuredClone(profile.hr_ops??{}),managed=preferences(contents(repo,'modes/_custom.md')),values={...managed.values},account={};let prefChanged=false;
 for(const [id,a] of Object.entries(s.answers))if(a.status==='known'){
  const q=Q.get(id);if(q.path)set(hr,q.path,a.value);
  else if(id==='role_families'){set(hr,'icps.agency.role_families',a.value);set(hr,'icps.startup.role_families',a.value);}
  else if(id==='source_overrides')hr.discovery=mergeConfig(mergeConfig(DEFAULTS.discovery,hr.discovery??{}),a.value);
  else if(id.startsWith('linkedin_')&&id.endsWith('_url'))account[id]=a.value;
  else {values[id]=a.value;prefChanged=true;}
 }
 const effective=validateConfig(mergeConfig(DEFAULTS,hr));
 if(s.answers.source_overrides?.status==='known'){
  const checked=inspectSources(effective,{starter:true});assert(!checked.diagnostics.length,'Invalid discovery source overrides: '+checked.diagnostics.map(d=>d.error).join('; '));
 }
 const outputs={'config/profile.yml':yaml.dump({...profile,hr_ops:hr},{lineWidth:110,noRefs:true})};
 assert(equal(yaml.load(outputs['config/profile.yml']),{...profile,hr_ops:hr}),'Profile serialization changed values');
 if(prefChanged){const block=BEGIN+PREFIX+JSON.stringify(values,null,2)+'\n```\n'+END;
  outputs['modes/_custom.md']=managed.a<0?managed.old+(managed.old.endsWith('\n')?'\n':'\n\n')+block+'\n':managed.old.slice(0,managed.a)+block+managed.old.slice(managed.b+END.length);}
 if(Object.keys(account).length){assert(readWorkspace(repo),'Configure workspace identity before assigning an account');const preview=await configureWorkspace(repo,account,{dryRun:true});preview.workspace.updated_at=s.updated_at;outputs['data/hr-ops/workspace.json']=JSON.stringify(preview.workspace,null,2)+'\n';}
 const targets=Object.entries(outputs).filter(([p,content])=>digest(content)!==s.baseline[p]).map(([path,content])=>({path,content,before_hash:s.baseline[path],after_hash:hash(content)}));
 return {fingerprint:hash({revision:s.revision,baseline:s.baseline,targets}),targets};
}
export async function applyOnboarding(repo,input,{expectedRevision,dryRun=false,now=new Date(),write=writeFileAtomic}={}){
 keys(input,['preview_fingerprint'],'onboarding application');
 const perform=async()=>{
  const s=readOnboarding(repo);assert(s&&s.revision===expectedRevision,'Onboarding revision conflict; reload status');
  assert(s.phase==='draft','No unapplied onboarding draft');
  const answered=new Set([...s.completed,...Object.keys(s.answers)]),missing=ONBOARDING_QUESTIONS.filter(q=>q.core&&!answered.has(q.id)).map(q=>q.id);
  assert(!missing.length,'Core questions need an answer, unknown or skip: '+missing.join(', '));
  if(!s.pending)assert(equal(baseline(repo),s.baseline),'Active settings changed since draft; reconcile with onboarding save');
  const recovering=!!s.pending,pending=s.pending??await plan(repo,s);
  if(!s.pending)serializedState({...s,revision:s.revision+1,pending});
  const remainingUnknowns={...s.unresolved};for(const [id,a] of Object.entries(s.answers)){if(a.status==='known')delete remainingUnknowns[id];else remainingUnknowns[id]=a.status;}
  if(dryRun)return {revision:s.revision,dry_run:true,preview_fingerprint:pending.fingerprint,recovery:!!s.pending,
   changes:pending.targets.map(t=>({path:t.path,before:contents(repo,t.path),after:t.content})),unknowns:remainingUnknowns,send_enabled:false};
  assert(input.preview_fingerprint===pending.fingerprint,'Reviewed preview_fingerprint required; preview and review before applying');
  if(s.pending)for(const p of TARGETS.filter(p=>!pending.targets.some(t=>t.path===p)))assert(digest(contents(repo,p))===s.baseline[p],'Settings changed during interrupted apply; explicit reconciliation required');
  // Check all targets before touching any. Recovery permits only the old or planned bytes.
  for(const t of pending.targets){const current=digest(contents(repo,t.path));assert(current===t.before_hash||!!s.pending&&current===t.after_hash,'Target changed during interrupted apply; explicit reconciliation required');}
  // Recheck existing inbox/delivery identity even when resuming a saved plan.
  const identity=pending.targets.find(t=>t.path==='data/hr-ops/workspace.json');
  if(identity){const planned=JSON.parse(identity.content);await configureWorkspace(repo,{name:planned.name,purpose:planned.purpose,linkedin_profile_url:planned.linkedin_profile_url,linkedin_page_url:planned.linkedin_page_url},{dryRun:true});}
  if(!s.pending){s.pending=pending;s.revision++;store(repo,s);}
  for(const t of pending.targets)if(digest(contents(repo,t.path))!==t.after_hash){const target=safePath(repo,t.path);fs.mkdirSync(dirname(target),{recursive:true});write(target,t.content);}
  const unresolved={...s.unresolved};for(const [id,a] of Object.entries(s.answers)){if(a.status==='known')delete unresolved[id];else unresolved[id]=a.status;}
  const next={version:1,revision:s.revision+1,phase:'complete',answers:{},completed:[...answered],unresolved,baseline:baseline(repo),updated_at:now.toISOString()};
  store(repo,next);return {revision:next.revision,applied:true,recovered:recovering,changed_paths:pending.targets.map(t=>t.path),unresolved,send_enabled:false};
 };return dryRun?perform():repo.lock(perform);
}
