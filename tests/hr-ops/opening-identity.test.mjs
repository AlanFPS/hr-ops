import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { blankProspect, applyResearch, scoreProspect, hash } from '../../lib/hr-ops/model.mjs';
import { LocalRepository } from '../../lib/hr-ops/store.mjs';
import { research } from '../../lib/hr-ops/operations.mjs';
import { discoverSources } from '../../lib/hr-ops/discovery.mjs';
import { input, payload, config, now } from './fixtures.mjs';

function shared() {
  const data = payload();
  data.openings.forEach(o => { o.url = 'https://fictional.example/careers'; });
  data.openings[0].title = 'Backend Engineer';
  data.openings[1].title = 'Full-stack Engineer';
  data.openings[1].role_family = 'fullstack';
  data.openings[1].eligibility = { status:'restricted', evidence:['site'], rationale:'U.S.-only role', geography:'US' };
  return data;
}

test('shared-page roles retain independent eligibility, stable IDs and persistence across repeat imports', async t => {
  const root = mkdtempSync(join(tmpdir(), 'hr-opening-identity-'));
  t.after(() => rmSync(root, { recursive:true, force:true }));
  const repo = new LocalRepository(root), c = config(), data = shared();
  const p = (await repo.discover(input(), {now})).prospect;
  await repo.update(p.id, 'research', x => research(x, data, c, now), {expectedRevision:1,now});
  const stored = new LocalRepository(root).get(p.id);
  assert.equal(stored.openings.length, 2);
  assert.equal(new Set(stored.openings.map(o => o.id)).size, 2);
  const score = scoreProspect(stored,c,now);
  assert.equal(score.opening_count,2);
  assert.equal(score.eligible_opening_count,1);
  assert.equal(score.dimensions.demand.level,1);
  await repo.update(p.id, 'research', x => research(x, data, c, now), {expectedRevision:stored.revision,now});
  assert.deepEqual(repo.get(p.id).openings, stored.openings);
});

test('saved opening IDs allow title, URL and metadata corrections without losing aliases or adjacent roles', () => {
  const p = applyResearch(blankProspect(input(),now),shared(),now);
  const original = structuredClone(p.openings[0]), sibling = structuredClone(p.openings[1]);
  const update = {...original,title:'Senior Backend Engineer',url:'https://fictional.example/job/new',provider:'manual',board:'official',posting_id:'p1'};
  applyResearch(p,{openings:[update]},now);
  assert.equal(p.openings.length,2);
  assert.deepEqual(p.openings.find(o => o.id === sibling.id),sibling);
  assert.equal(p.openings.find(o => o.id === original.id).title,update.title);
  assert.deepEqual(p.openings.find(o => o.id === original.id).aliases,[original.url]);
  delete update.id;
  applyResearch(p,{openings:[update]},now);
  assert.equal(p.openings.length,2);
  assert.equal(p.openings.find(o => o.posting_id === 'p1').id,original.id);
});

test('same-title location listings are retained but need reviewed requisitions for multiple-demand credit', () => {
  const data = shared();
  data.openings.forEach((o,i) => {o.title='Backend Engineer';o.location=i?'San Francisco':'New York';});
  const p = applyResearch(blankProspect(input(),now),data,now);
  let s = scoreProspect(p,config(),now);
  assert.equal(p.openings.length,2);
  assert.equal(s.opening_count,2);
  assert.equal(s.dimensions.demand.level,0.5);
  assert.equal(s.duplicate_candidates.length,2);
  p.openings.forEach((o,i) => Object.assign(o,{board:'official',provider:'manual',requisition_id:`req${i}`}));
  assert.equal(scoreProspect(p,config(),now).dimensions.demand.level,1);
  p.openings[1].requisition_id=p.openings[0].requisition_id;
  assert.equal(scoreProspect(p,config(),now).opening_count,1);
  assert.equal(scoreProspect(p,config(),now).eligible_opening_count,0);
  // Explicit separate records without supported hire identities remain
  // inspectable and ambiguous, even when their full descriptions are equal.
  const q=blankProspect(input(),now);
  applyResearch(q,{openings:[{...data.openings[0],id:'a'.repeat(16)},
    {...data.openings[0],id:'b'.repeat(16)}]},now);
  assert.equal(scoreProspect(q,config(),now).opening_count,2);
  assert.equal(scoreProspect(q,config(),now).duplicate_candidates.length,2);
});

test('posting records remain separate on shared URLs while one supported requisition counts once', () => {
  const data=shared();
  data.openings.forEach((o,i) => Object.assign(o,{id:String(i+1).repeat(16),provider:'ashby',board:'official',posting_id:`post${i}`,requisition_id:'req'}));
  const p=applyResearch(blankProspect(input(),now),data,now);
  assert.equal(p.openings.length,2);
  assert.deepEqual(p.openings.map(o=>o.id),['1'.repeat(16),'2'.repeat(16)]);
  assert.equal(scoreProspect(p,config(),now).opening_count,1);
  const observed={...data.openings[0],title:'New collected title'}; delete observed.id;
  applyResearch(p,{openings:[observed]},now,{collected:true});
  assert.equal(p.openings.length,2);
  assert.equal(p.openings[0].title,'Backend Engineer');
  assert.equal(p.collection.openings[0].id,'1'.repeat(16));
});

test('legacy URL-derived IDs survive reimport and new siblings without rewriting historical snapshots', () => {
  const data=shared(),p=applyResearch(blankProspect(input(),now),{openings:[data.openings[0]]},now);
  const legacy=hash(data.openings[0].url).slice(0,16);
  p.openings[0].id=legacy;
  applyResearch(p,data,now);
  assert.equal(p.openings.length,2);
  assert.equal(p.openings.find(o=>o.title==='Backend Engineer').id,legacy);
  assert.throws(()=>applyResearch(p,{openings:[{...data.openings[0],id:'bad'}]},now),/invalid ID/);
});

test('location-only evidence stays unknown and cannot admit a startup for LATAM outreach', () => {
  const data=shared(); data.openings=data.openings.slice(0,1);
  data.openings[0].location='Vernon Hills, IL'; delete data.openings[0].eligibility;
  const p=applyResearch(blankProspect(input(),now),data,now);
  assert.equal(p.openings[0].eligibility.status,'unknown');
  assert.equal(scoreProspect(p,config(),now).tier,'RESEARCHING');
});

test('complete collections reconcile only the missing posting even when its URL survives', async t => {
  const root=mkdtempSync(join(tmpdir(),'hr-opening-reconcile-'));
  t.after(()=>rmSync(root,{recursive:true,force:true}));
  const repo=new LocalRepository(root),c=config();
  c.discovery.sources=[{name:'Fictional Labs',website:'https://fictional.example',icp:'startup',provider:'greenhouse',careers_url:'https://job-boards.greenhouse.io/fictional',api:'https://boards-api.greenhouse.io/v1/boards/fictional/jobs',identity_evidence:input().evidence[0]}];
  const jobs=[1,2].map(id=>({id,title:`Backend Engineer ${id}`,absolute_url:'https://fictional.example/careers',location:{name:'Remote'}}));
  const first=await discoverSources(repo,c,{now,ctx:{fetchJson:async()=>({jobs})}});
  assert.equal(first.created,1,JSON.stringify(first.diagnostics));
  let p=repo.list()[0]; assert.equal(p.openings.length,2);
  await repo.update(p.id,'research',x=>research(x,{openings:p.openings},c,now),{expectedRevision:p.revision,now});
  await discoverSources(repo,c,{now,ctx:{fetchJson:async()=>({jobs:[jobs[1]]})}});
  p=repo.get(p.id);
  assert.equal(p.openings.find(o=>o.posting_id==='1').reconciliation_needed,true);
  assert.equal(p.openings.find(o=>o.posting_id==='2').reconciliation_needed,false);
  assert.equal(p.openings.find(o=>o.posting_id==='1').status,'open');
});
