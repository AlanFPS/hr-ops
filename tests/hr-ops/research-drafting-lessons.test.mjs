import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {initialize,LocalRepository} from '../../lib/hr-ops/store.mjs';
import {runHr} from '../../lib/hr-ops/client.mjs';
import {reserveResearch,researchBudget,updateRun} from '../../lib/hr-ops/research-run.mjs';
import {dossier,researchTasks,outreachBrief,saveDraft,draftCurrent,research} from '../../lib/hr-ops/operations.mjs';
import {scoreProspect,rankedContacts} from '../../lib/hr-ops/model.mjs';
import {backup,restore} from '../../lib/hr-ops/maintenance.mjs';
import {config,now,prospect,draft,evidence,fact} from './fixtures.mjs';

function reportedSizeProspect(){
  const p=prospect();
  p.evidence[0].excerpt='Fictional Labs is a US software employer. Alex Doe is CEO & Founder. Current backend and full-stack searches accept worldwide applicants. No supplier appetite or recruiting pain is stated.';
  p.evidence.push({...evidence('reported-size','Employees 51-200'),source_type:'secondary'});
  p.facts.employee_count={value:[51,200],confidence:'observed',evidence:['reported-size']};
  p.facts.recruiting_pain={value:null,confidence:'unknown',evidence:[]};
  p.contacts[0].title='CEO & Founder';
  return p;
}

test('dossiers render inclusive employee/recruiter ranges without implying a large exact count',()=>{
  const p=reportedSizeProspect();p.facts.recruiter_count=fact([2,12]);
  const md=dossier(p,config(),now);
  assert.match(md,/employee_count: 51–200/);
  assert.match(md,/recruiter_count: 2–12/);
  assert.doesNotMatch(md,/employee_count: 51,200/);
  p.facts.employee_count=fact(51);assert.match(dossier(p,config(),now),/employee_count: 51 \(observed/);
  p.facts.employee_count={value:null,confidence:'unknown',evidence:[]};assert.match(dossier(p,config(),now),/employee_count: Unknown/);
});

test('targeted research permits zero directory pages while rejecting a directory read before dispatch',async t=>{
  const parent=fs.mkdtempSync(join(tmpdir(),'hr-targeted-')),root=join(parent,'source');t.after(()=>fs.rmSync(parent,{recursive:true,force:true}));
  const c=config();await initialize(root,c);const repo=new LocalRepository(root),opts={cwd:root,env:{...process.env,HR_OPS_ROOT:root}};
  const configured=runHr(['run','--run','targeted','--action','configure','--input','-'],{...opts,input:{candidates:1,pages:2,directory_pages:0}});
  assert.equal(configured.scope_usage.remaining_directory_pages,0);
  await assert.rejects(reserveResearch(repo,c,'targeted',{kind:'page',company:'https://directory.example',target:'https://directory.example/startups',directory:true,candidate_names:[]},{now}),/directory scope exhausted/);
  assert.equal(researchBudget(repo,c,'targeted').attempts.length,0);
  await reserveResearch(repo,c,'targeted',{kind:'page',company:'https://fictional.example',target:'https://fictional.example/about',candidate_names:['Fictional Labs']},{now});
  const check=runHr(['run','--run','targeted','--action','review'],opts).continuation_review;
  runHr(['run','--run','targeted','--action','complete','--input','-'],{...opts,input:{reason:'Fixture current owner remains unknown',review:{token:check.token,candidates:check.candidates.map(x=>({name:x.name,decision:'deferred',reason:'Contact verification remains, without directory reads',attempt_sequences:x.attempt_sequences}))}}});
  assert.equal(researchBudget(repo,c,'targeted').status,'complete');
  const saved=await backup(repo),destination=join(parent,'restored');restore(saved.path,destination,{dryRun:false});
  assert.deepEqual(researchBudget(new LocalRepository(destination),c,'targeted'),researchBudget(repo,c,'targeted'));
  for(const scope of [{candidates:0,pages:2,directory_pages:0},{candidates:1,pages:0,directory_pages:0},{candidates:1,pages:2,directory_pages:-1},{candidates:1,pages:2,directory_pages:0.5}])
    await assert.rejects(updateRun(repo,c,'invalid',{action:'configure',scope}),/integer/);
});

test('secondary size and executive-only access caveats surface without changing scores or records',()=>{
  const p=reportedSizeProspect(),c=config(),before=structuredClone(p),score=scoreProspect(p,c,now);
  assert.equal(score.total,75);assert.equal(score.tier,'QUALIFIED');
  for(const brief of [researchTasks(p,c,now),outreachBrief(p,c,now)]){
    assert(brief.research_caveats.some(s=>/size.*secondary/i.test(s)));
    assert(brief.research_caveats.some(s=>/executive.*functional/i.test(s)));
    assert(brief.research_caveats.some(s=>/supplier authority.*unverified/i.test(s)));
  }
  const md=dossier(p,c,now);assert.match(md,/supplier authority: unverified/);assert.match(md,/Executive relevance; prefer a verified functional hiring owner/);
  assert.deepEqual(p,before);assert.deepEqual(scoreProspect(p,c,now),score);
  p.evidence.find(e=>e.id==='reported-size').source_type='primary';
  assert(!researchTasks(p,c,now).research_caveats.some(s=>/size.*secondary/i.test(s)));
  p.contacts[0].title='CTO';assert(!researchTasks(p,c,now).research_caveats.some(s=>/executive.*functional/i.test(s)));
});

test('unscoped requisition IDs are visible research gaps without inferred identity or score changes',()=>{
  const p=prospect(),c=config();p.openings[0].provider='greenhouse';p.openings[0].requisition_id='req-5';
  const score=scoreProspect(p,c,now),before=structuredClone(p);
  assert(researchTasks(p,c,now).research_caveats.some(s=>/identifiers.*board scope/i.test(s)));
  assert.deepEqual(p,before);assert.deepEqual(scoreProspect(p,c,now),score);
  p.openings[0].board='https://boards.greenhouse.io/fictional';
  assert(!researchTasks(p,c,now).research_caveats.some(s=>/identifiers.*board scope/i.test(s)));
});

test('existing drafts expose exact wording and pending human review, including stale and replaced drafts',()=>{
  const p=reportedSizeProspect(),c=config(),initial=draft(p);
  initial.quality.recipient_rationale='The current official team page identifies Alex Doe as CEO & Founder; functional hiring ownership and supplier authority remain unknown.';
  saveDraft(p,initial,c,now);
  let row=outreachBrief(p,c,now).existing_drafts[0];
  assert.equal(row.body,p.drafts[0].body);assert.equal(row.review,'pending_human_review');
  assert.equal(row.prepared_for_review,true);assert.equal(row.send_enabled,false);assert.deepEqual(row.missing,[]);
  const replacement={...initial,body:initial.body+' Thanks.',replaces_draft_id:p.drafts[0].id};saveDraft(p,replacement,c,now);
  const rows=outreachBrief(p,c,now).existing_drafts;
  assert.equal(rows.find(r=>r.id===row.id).prepared_for_review,false);
  assert.equal(rows.find(r=>r.id===row.id).superseded_by,p.drafts.at(-1).id);
  assert(rows.every(r=>r.send_enabled===false));
  p.facts.employee_count={value:null,confidence:'unknown',evidence:[]};
  assert.equal(scoreProspect(p,c,now).tier,'PROVISIONAL');
  assert.equal(draftCurrent(p.drafts.at(-1),p,c,now),false);
  assert.equal(outreachBrief(p,c,now).existing_drafts.at(-1).prepared_for_review,false);
  assert.equal(p.interactions.length,0);
  assert.equal(rankedContacts(p,c,now)[0].authority_level,'unverified');
});

test('isolated research-to-draft restart and restore retain caveats, human-review state and zero contact events',async t=>{
  const parent=fs.mkdtempSync(join(tmpdir(),'hr-lessons-flow-')),root=join(parent,'source');t.after(()=>fs.rmSync(parent,{recursive:true,force:true}));
  const c=config();c.firm.email=null;await initialize(root,c);
  const repo=new LocalRepository(root),fixture=reportedSizeProspect();
  const created=(await repo.discover({name:fixture.name,website:fixture.website,icp:fixture.icp,evidence:fixture.evidence},{now})).prospect;
  await repo.update(created.id,'research',p=>research(p,{facts:fixture.facts,openings:fixture.openings,contacts:fixture.contacts},c,now),{expectedRevision:created.revision,now});
  const researched=repo.get(created.id),input=draft(researched);
  input.quality.recipient_rationale='The official team source identifies Alex Doe as CEO & Founder; engineering hiring ownership and supplier authority remain unknown.';
  await repo.update(created.id,'draft',p=>saveDraft(p,input,c,now),{expectedRevision:researched.revision,now});
  const saved=repo.get(created.id);
  await assert.rejects(repo.update(created.id,'draft',p=>saveDraft(p,input,c,now),{expectedRevision:researched.revision,now}),/Revision conflict/);
  assert.equal(saved.status,'OUTREACH_READY');assert.equal(saved.interactions.length,0);
  assert.equal(saved.drafts[0].review,'pending_human_review');assert.equal(saved.drafts[0].ready,true);
  assert.equal(saved.drafts[0].send_enabled,false);assert.equal(saved.next_followup,null);
  const restarted=new LocalRepository(root),brief=outreachBrief(restarted.get(created.id),c,now);
  assert.equal(brief.existing_drafts[0].body,input.body);assert.equal(brief.existing_drafts[0].review,'pending_human_review');
  assert(brief.research_caveats.some(s=>/size.*secondary/i.test(s)));assert.equal(brief.send_enabled,false);
  assert.deepEqual(restarted.get(created.id),saved,'Read-only briefs preserve revision and history');
  const snapshot=await backup(restarted),destination=join(parent,'restored');restore(snapshot.path,destination,{dryRun:false});
  assert.deepEqual(new LocalRepository(destination).get(created.id),saved);
});

test('offline catalog origins can be admitted before any request without inventing web provenance',async t=>{
  const root=fs.mkdtempSync(join(tmpdir(),'hr-offline-origin-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
  const c=config();await initialize(root,c);const repo=new LocalRepository(root),opts={cwd:root,env:{...process.env,HR_OPS_ROOT:root}};
  await updateRun(repo,c,'catalog',{action:'configure',scope:{candidates:1,pages:2,directory_pages:0}});
  const candidate={name:'Fictional Labs',source_url:null,source_sequence:null,reason:'Selected offline from templates/portals.example.yml, tracked_companies. Not discovered by a web request.'};
  let admitted=runHr(['run','--run','catalog','--action','admit','--input','-'],{...opts,input:candidate});
  assert.equal(admitted.attempts.length,0);assert.equal(admitted.candidate_origins[0].late,false);assert.equal(admitted.scope_usage.candidate_count,1);
  const created=runHr(['discover','--run','catalog','--input','-'],{...opts,input:{prospects:[{name:'Fictional Labs',website:'https://fictional.example',icp:'startup',evidence:[evidence()]}]}});
  assert.equal(created.newly_discovered,1);assert.equal(created.prospects[0].discovery_source,undefined);
  assert.match(created.provenance_gaps[0].reason,/Origin recorded with no public discovery URL/);
  assert.equal(created.admission_gaps.length,0);
  await reserveResearch(repo,c,'catalog',{kind:'page',target:'https://fictional.example/about',company:'https://fictional.example',candidate_names:['Fictional Labs']},{now});
  admitted=runHr(['run','--run','catalog','--action','admit','--input','-'],{...opts,input:candidate});
  assert.equal(admitted.candidate_origins[0].late,false,'Original before-research admission must remain immutable');
  await assert.rejects(updateRun(repo,c,'catalog',{action:'admit',candidate:{...candidate,source_sequence:1}}),/immutable/);
  const check=runHr(['run','--run','catalog','--action','review'],opts).continuation_review;
  assert.deepEqual(check.candidates[0].attempt_sequences,[1]);
  assert.equal(check.candidates[0].origin.source_sequence,null);
});

test('offline-only candidates may be honestly deferred but cannot claim completed or exhausted research',async t=>{
  const root=fs.mkdtempSync(join(tmpdir(),'hr-offline-defer-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
  const c=config();await initialize(root,c);const repo=new LocalRepository(root),opts={cwd:root,env:{...process.env,HR_OPS_ROOT:root}};
  await updateRun(repo,c,'offline',{action:'configure',scope:{candidates:1,pages:2,directory_pages:0}});
  await updateRun(repo,c,'offline',{action:'admit',candidate:{name:'Unresearched',source_url:null,source_sequence:null,reason:'Local operator shortlist; original public origin is unknown.'}});
  const check=runHr(['run','--run','offline','--action','review'],opts).continuation_review;
  assert.deepEqual(check.candidates[0].attempt_sequences,[]);
  for(const decision of ['target_satisfied','budget_exhausted','no_useful_path'])
    await assert.rejects(updateRun(repo,c,'offline',{action:'complete',reason:'Fixture stopping',review:{token:check.token,candidates:[{name:'Unresearched',decision,reason:'No external research has occurred',attempt_sequences:[]}]}}),/must be explicitly deferred/);
  await updateRun(repo,c,'offline',{action:'complete',reason:'Offline selection only; live research deferred',review:{token:check.token,candidates:[{name:'Unresearched',decision:'deferred',reason:'No external research has occurred',attempt_sequences:[]}]}});
  assert.equal(researchBudget(repo,c,'offline').attempts.length,0);
  await updateRun(repo,c,'invalid-origin',{action:'configure',scope:{candidates:1,pages:2,directory_pages:0}});
  for(const candidate of [{name:'Bad',source_url:'https://source.example',source_sequence:null},{name:'Bad',source_url:null,source_sequence:null},{name:'Bad',source_url:null,reason:'Missing sequence'}])
    await assert.rejects(updateRun(repo,c,'invalid-origin',{action:'admit',candidate}),/Origin requires|origin reason/);
});
