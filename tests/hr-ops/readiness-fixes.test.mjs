import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync,readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {prospect,config,now,draft,auth,input,payload} from './fixtures.mjs';
import {rankedContacts} from '../../lib/hr-ops/model.mjs';
import {saveDraft,draftCurrent,recordInteraction,dossier} from '../../lib/hr-ops/operations.mjs';
import {validateProspect} from '../../lib/hr-ops/validation.mjs';
import {initialize} from '../../lib/hr-ops/store.mjs';
import {runHr} from '../../lib/hr-ops/client.mjs';

test('agency commercial leaders are secondary partnership contacts, never startup engineering owners',()=>{
 const p=prospect(),c=config();p.icp='agency';
 for(const title of ['Commercial Director','Head of Partnerships','VP Business Development']){
  p.contacts[0].title=title;
  const person=rankedContacts(p,c,now)[0];
  assert.equal(person.priority,1);assert.equal(person.relevance,'decision-maker');assert.match(person.reason,/verify.*remit/);
 }
 for(const title of ['Former Commercial Director','Assistant to Commercial Director','Partnerships Coordinator','Commercial Analyst']){
  p.contacts[0].title=title;assert.equal(rankedContacts(p,c,now)[0].relevance,'other');
 }
 p.icp='startup';p.contacts[0].title='Commercial Director';assert.equal(rankedContacts(p,c,now)[0].relevance,'other');
});

test('explicit draft replacement preserves history and prevents review or reactivation of old wording',()=>{
 const p=prospect(),c=config(),original=draft(p);saveDraft(p,original,c,now);
 const old=p.drafts[0];const body=old.body;
 const updated={...original,body:original.body+' Thanks.',replaces_draft_id:old.id};
 saveDraft(p,updated,c,now);
 assert.equal(p.drafts.length,2);assert.equal(old.body,body);assert.equal(old.ready,false);
 assert.equal(old.superseded_by,p.drafts[1].id);assert.equal(draftCurrent(old,p,c,now),false);
 assert.equal(draftCurrent(p.drafts[1],p,c,now),true);
 assert.match(dossier(p,c,now),/superseded by/);
 assert.throws(()=>recordInteraction(p,{id:'old-review',kind:'review',at:now.toISOString(),reason:'Review this historical fixture draft',draft_id:old.id,content_hash:old.content_hash,authorization:auth()},c,now),/current exact draft/);
 assert.throws(()=>saveDraft(p,original,c,now),/Superseded wording/);
 const before=structuredClone(p);assert.deepEqual(saveDraft(p,updated,c,now),{noop:true});assert.deepEqual(p,before);
 assert.doesNotThrow(()=>validateProspect(p,now));
});

test('intentional alternatives stay active; an existing alternative can explicitly replace another',()=>{
 const p=prospect(),c=config(),first=draft(p);saveDraft(p,first,c,now);
 const old=p.drafts[0];const other={...first,body:first.body+' Thank you.'};saveDraft(p,other,c,now);
 assert(p.drafts.every(d=>draftCurrent(d,p,c,now)));
 const existingId=p.drafts[1].id;
 saveDraft(p,{...other,replaces_draft_id:old.id},c,now);
 assert.equal(p.drafts.length,2);assert.equal(old.superseded_by,existingId);
 assert.doesNotThrow(()=>validateProspect(p,now));
});

test('invalid replacement targets fail before mutation and persisted cycles are rejected',()=>{
 const p=prospect(),c=config(),first=draft(p);saveDraft(p,first,c,now);
 const old=p.drafts[0];
 for(const bad of [
  {...first,replaces_draft_id:'missing'},
  {...first,replaces_draft_id:old.id},
  {...first,channel:'email',subject:'Hiring',body:first.body+' Thanks.',replaces_draft_id:old.id},
 ]){const before=structuredClone(p);assert.throws(()=>saveDraft(p,bad,c,now),/Replacement/);assert.deepEqual(p,before);}
 saveDraft(p,{...first,body:first.body+' Thanks.',replaces_draft_id:old.id},c,now);
 const bad=structuredClone(p);bad.drafts[1].superseded_by=old.id;bad.drafts[1].stale=true;bad.drafts[1].ready=false;
 assert.throws(()=>validateProspect(bad,now),/cycle/);
 const missing=structuredClone(p);missing.drafts[0].superseded_by='0000000000000000';assert.throws(()=>validateProspect(missing,now),/missing replacement/);
});

test('replacement chain survives research refresh without resurrecting superseded wording',()=>{
 const p=prospect(),c=config(),first=draft(p);saveDraft(p,first,c,now);
 const a=p.drafts[0];const second={...first,body:first.body+' Thanks.'};saveDraft(p,{...second,replaces_draft_id:a.id},c,now);
 const b=p.drafts[1];const third={...first,body:first.body+' Many thanks.'};saveDraft(p,{...third,replaces_draft_id:b.id},c,now);
 for(const d of p.drafts)d.stale=true;
 saveDraft(p,third,c,now);assert.equal(p.drafts.length,3);
 assert.equal(p.drafts.filter(d=>draftCurrent(d,p,c,now)).length,1);
 assert.throws(()=>saveDraft(p,{...first,body:first.body+' Another option.',replaces_draft_id:a.id},c,now),/already superseded/);
 assert.doesNotThrow(()=>validateProspect(p,now));
});

test('CLI replacement persists across processes with revision checks and full export',async t=>{
 const root=mkdtempSync(join(tmpdir(),'hr-readiness-'));
 t.after(()=>rmSync(root,{recursive:true,force:true}));
 await initialize(root,config());
 const options={cwd:root,env:{...process.env,HR_OPS_ROOT:root}};
 const call=(args,data)=>runHr(args,{...options,input:data});
 const live=new Date().toISOString();
 const seed=input();seed.evidence[0].observed_at=live;
 call(['discover','--input','-'],{prospects:[seed]});
 let p=call(['status',seed.name]);const research=payload();
 for(const row of [...research.openings,...research.contacts])row.verified_at=live;
 call(['research',p.id,'--revision',String(p.revision),'--input','-'],research);
 p=call(['status',p.id]);const first=draft(p);call(['outreach',p.id,'--revision',String(p.revision),'--input','-'],first);
 p=call(['status',p.id]);const beforeRevision=p.revision;
 const replacement={...first,body:first.body+' Thanks.',replaces_draft_id:p.drafts[0].id};
 call(['outreach',p.id,'--revision',String(p.revision),'--input','-'],replacement);
 p=call(['status',p.id]);assert.equal(p.drafts.length,2);assert.equal(p.drafts[0].ready,false);
 const canonicalPath=join(root,'data/hr-ops/prospects',p.id+'.json');const before=readFileSync(canonicalPath,'utf8');
 assert.throws(()=>call(['outreach',p.id,'--revision',String(beforeRevision),'--input','-'],replacement),/revision/i);
 assert.equal(readFileSync(canonicalPath,'utf8'),before);
 assert.deepEqual(call(['export'])[0],JSON.parse(before));assert.equal(call(['doctor']).ok,true);
 assert.equal(p.interactions.length,0);
});
