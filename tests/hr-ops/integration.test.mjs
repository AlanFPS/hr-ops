import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,mkdtempSync,rmSync,readdirSync,existsSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import * as yaml from 'js-yaml';
import {applyResearch,rankedContacts,scoreProspect,blankProspect} from '../../lib/hr-ops/model.mjs';
import {research,qualify,saveDraft,draftCurrent,recordInteraction,dueFollowups} from '../../lib/hr-ops/operations.mjs';
import {now,evidence,fact,input,prospect,config,draft,auth} from './fixtures.mjs';
const ROOT=fileURLToPath(new URL('../../',import.meta.url));
test('role-specific restriction and size evidence defeat generic remote marketing',()=>{
  const p=prospect(),c=config();p.facts.remote_policy=fact('Company page says worldwide');p.facts.latam_compatibility=fact('restricted');assert.equal(scoreProspect(p,c,now).recommendation,'RESEARCHING');
  p.facts.latam_compatibility=fact('yes');p.facts.employee_count=fact(400);assert.ok(scoreProspect(p,c,now).gaps.some(x=>x.includes('size range')));
  c.icps.startup.employee_range=[5,500];assert.equal(scoreProspect(p,c,now).recommendation,'QUALIFIED');
});
test('unknown size receives partial fit points without claiming complete evidence coverage',()=>{const p=prospect(),c=config();p.facts.employee_count={value:null,confidence:'unknown',evidence:[]};const s=scoreProspect(p,c,now);assert.equal(s.coverage,85);assert.equal(s.dimensions.fit.points,7.5);assert.equal(s.dimensions.fit.known,false);});
test('functional owner outranks a large-company founder and ranking explains why',()=>{
  const p=prospect(),c=config();applyResearch(p,{contacts:[{name:'Aaron Founder',title:'CEO',url:'https://fictional.example/team',verified_at:now.toISOString(),evidence:['site']},{name:'Bea Talent',title:'Talent Lead',url:'https://fictional.example/team',verified_at:now.toISOString(),evidence:['site']}]},now);
  const people=rankedContacts(p,c,now);assert.equal(people[0].title,'CTO');assert.equal(people[1].title,'Talent Lead');assert.match(people[0].reason,/engineering/);
});
test('research and changed firm facts invalidate drafts; regenerating identical text refreshes it',()=>{
  const p=prospect(),c=config();saveDraft(p,draft(p),c,now);assert.equal(draftCurrent(p.drafts[0],p,c,now),true);
  c.firm.services=[];assert.equal(draftCurrent(p.drafts[0],p,c,now),false);qualify(p,c,now);assert.equal(p.status,'CONTACT_IDENTIFIED');
  saveDraft(p,draft(p),c,now);assert.equal(draftCurrent(p.drafts[0],p,c,now),true);assert.equal(p.drafts.length,1);
  research(p,{facts:{recruiting_structure:fact('New research')}},c,now);assert.equal(draftCurrent(p.drafts[0],p,c,now),false);
});
test('reply pauses follow-up drafting as well as the due queue',()=>{
  const p=prospect(),c=config();qualify(p,c,now);recordInteraction(p,{id:'sent',kind:'sent',at:now.toISOString(),authorization:auth(),contact_id:p.contacts[0].id,channel:'linkedin',message:'Prior actual message'},c,now);
  const followup={...draft(p),purpose:'followup'};saveDraft(p,followup,c,now);assert.equal(p.interactions.length,1);
  recordInteraction(p,{id:'reply',kind:'reply',at:now.toISOString(),authorization:auth(),response:'Thanks, will review'},c,now);
  assert.deepEqual(dueFollowups([p],c,'2026-10-02'),[]);assert.throws(()=>saveDraft(p,followup,c,now),/unanswered/);
});
test('duplicate evidence identity cannot carry contradictory discovery claims',()=>{const p=input();p.evidence.push({...p.evidence[0],excerpt:'Conflicting source text'});assert.throws(()=>blankProspect(p,now),/Duplicate evidence/);});
test('draft identity does not depend on JSON property order',()=>{const p=prospect(),c=config(),d={...draft(p),channel:'email',subject:'Backend sourcing'};saveDraft(p,d,c,now);const reordered=Object.fromEntries(Object.entries(d).reverse());reordered.claims=d.claims.map(cl=>Object.fromEntries(Object.entries(cl).reverse()));assert.equal(saveDraft(p,reordered,c,now).noop,true);assert.equal(p.drafts.length,1);});
test('CLI workflow persists evidence and drafts, rejects stale revisions and exports without sending',t=>{
  const root=mkdtempSync(join(tmpdir(),'hr-cli-'));t.after(()=>rmSync(root,{recursive:true,force:true}));
  const run=(args,payload)=>spawnSync(process.execPath,[join(ROOT,'hr-ops.mjs'),...args],{cwd:tmpdir(),env:{...process.env,HR_OPS_ROOT:root},input:payload===undefined?undefined:JSON.stringify(payload),encoding:'utf8'});
  assert.equal(run(['init','--input','-'],config()).status,0);
  const freshAt=new Date().toISOString(), identity=input();
  identity.evidence.forEach(e=>e.observed_at=freshAt);
  let result=run(['discover','--input','-'],{prospects:[identity]});assert.equal(result.status,0,result.stderr);const row=JSON.parse(result.stdout).prospects[0];
  const p=prospect();p.openings.forEach(o=>o.verified_at=freshAt);p.contacts.forEach(c=>c.verified_at=freshAt);
  result=run(['research',row.id,'--input','-','--revision','1'],{facts:p.facts,openings:p.openings,contacts:p.contacts});assert.equal(result.status,0,result.stderr);
  let current=JSON.parse(result.stdout).prospect;assert.equal(current.status,'CONTACT_IDENTIFIED');
  result=run(['outreach',row.id,'--input','-','--revision',String(current.revision)],draft(current));assert.equal(result.status,0,result.stderr);current=JSON.parse(result.stdout).prospect;assert.equal(current.status,'OUTREACH_READY');
  assert.equal(run(['research',row.id,'--input','-','--revision','1'],{}).status,1);
  const exported=JSON.parse(run(['export']).stdout);assert.equal(exported.length,1);assert.equal(exported[0].drafts.length,1);assert.equal(exported[0].interactions.length,0);assert.equal(exported[0].evidence[0].id,'site');
  assert.equal(existsSync(join(root,'reports/hr-ops',row.id+'.md')),true);
  assert.equal(run(['send',row.id]).status,1);
});
test('fork updater refuses apply and rollback even with confirmation or forged environment',()=>{
  for(const command of ['apply','rollback']){const r=spawnSync(process.execPath,[join(ROOT,'update-system.mjs'),command,'--confirm','--force'],{cwd:ROOT,env:{...process.env,CAREER_OPS_UPDATE_CONFIRM:'1'},encoding:'utf8'});assert.equal(r.status,1);assert.match(r.stderr,/fork.*disabled/);}
  const r=spawnSync(process.execPath,[join(ROOT,'update-system.mjs'),'check'],{cwd:ROOT,encoding:'utf8'});assert.equal(JSON.parse(r.stdout).status,'fork-preserved');
});
test('shared client entrypoints resolve and candidate skill is explicit only',()=>{
  const plugin=JSON.parse(readFileSync(join(ROOT,'.claude-plugin/plugin.json'),'utf8'));assert.equal(plugin.name,'hr-ops');for(const skill of plugin.skills)assert.ok(existsSync(join(ROOT,skill,'SKILL.md')));
  for(const mirror of ['.github/plugin/plugin.json','.codex-plugin/plugin.json'])assert.deepEqual(JSON.parse(readFileSync(join(ROOT,mirror),'utf8')),plugin);
  const legacy=yaml.load(readFileSync(join(ROOT,'.agents/skills/career-ops/agents/openai.yaml'),'utf8'));assert.equal(legacy.policy.allow_implicit_invocation,false);
});
test('upstream mutation workflows remain valid YAML and are guarded in the fork',()=>{
  const keep=new Set(['test.yml','web-ci.yml','codeql.yml','dependency-review.yml','no-user-data.yml','plugin-registry-validate.yml','copilot-setup-steps.yml']);
  for(const file of readdirSync(join(ROOT,'.github/workflows')).filter(f=>f.endsWith('.yml'))){const parsed=yaml.load(readFileSync(join(ROOT,'.github/workflows',file),'utf8'));assert.ok(parsed.jobs,file);if(!keep.has(file))for(const job of Object.values(parsed.jobs))assert.ok(job.if?.includes("github.repository == 'career-ops-hq/career-ops'"),file);}
});
