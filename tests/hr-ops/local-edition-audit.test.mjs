import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, mkdirSync, readFileSync, writeFileSync, existsSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { LocalRepository, initialize } from '../../lib/hr-ops/store.mjs';
import { backup, verifyBackup, restore, diagnostics, migrate } from '../../lib/hr-ops/maintenance.mjs';
import { researchBudget, updateRun } from '../../lib/hr-ops/research-run.mjs';
import { rankedContacts, scoreProspect, hash } from '../../lib/hr-ops/model.mjs';
import { input, prospect, config, now, auth, evidence } from './fixtures.mjs';
import { recordInteraction, dueFollowups } from '../../lib/hr-ops/operations.mjs';

function root(t) {
  const dir = mkdtempSync(join(tmpdir(), 'hr-edition-audit-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  return dir;
}
function json(path, value) { mkdirSync(join(path, '..'), { recursive: true }); writeFileSync(path, JSON.stringify(value)); }

test('backup manifests reject traversal through an allowed prefix before restoring files', async t => {
  const dir = root(t), repo = new LocalRepository(dir);
  await initialize(dir);
  const b = await backup(repo);
  const file = join(b.path, '.agents/hook.mjs');
  mkdirSync(join(file, '..'), { recursive: true });
  writeFileSync(file, 'untrusted executable content');
  const m = JSON.parse(readFileSync(join(b.path, 'manifest.json')));
  const bytes = readFileSync(file);
  m.files.push({path:'data/hr-ops/../../.agents/hook.mjs',bytes:bytes.length,sha256:hash(bytes)});
  json(join(b.path, 'manifest.json'), m);
  assert.throws(() => verifyBackup(b.path), /canonical|backup path/i);
  assert.throws(() => restore(b.path, join(dir, 'restored'), {dryRun:false}), /canonical|backup path/i);
  assert.equal(existsSync(join(dir,'restored')), false);
  for (const invalid of ['data/hr-ops', 'reports/hr-ops', 'config/profile.yml/child', 'data/hr-ops/./record.json', 'data/hr-ops\\record.json']) {
    m.files.at(-1).path = invalid;
    json(join(b.path,'manifest.json'),m);
    assert.throws(() => verifyBackup(b.path), /canonical|backup path/i);
  }
});

test('recovery excludes every participant in a domain collision, retaining independent healthy records', async t => {
  const dir = root(t), repo = new LocalRepository(dir);
  for (const name of ['one','two','healthy']) await repo.discover({...input(), name, website:`https://${name}.example`}, {now});
  const one = repo.get('one'), two = repo.get('two');
  two.domains.push(one.domains[0]);
  json(join(repo.records, `${two.id}.json`), two);
  const report = diagnostics(repo);
  assert.equal(report.ok, false);
  assert.deepEqual(report.records.map(p => p.name), ['healthy']);
  assert.equal(report.errors.length, 2);
  assert.throws(() => repo.list(), /multiple prospects/);
});

test('research ledgers validate status, timestamps and unique linked identities', t => {
  const repo = new LocalRepository(root(t));
  const base = {schema_version:1,run:'audit',limits:{queries:20,pages_per_company:6},attempts:[]};
  for (const patch of [{status:'completed'}, {prospect_ids:'abc'}, {prospect_ids:['bad']}, {captures:['x']}, {captures:['a'.repeat(64),'a'.repeat(64)]}, {updated_at:'yesterday'}]) {
    json(join(repo.dir,'research-runs/audit.json'), {...base,...patch});
    assert.throws(() => researchBudget(repo, config(), 'audit'), /research|ledger/i);
  }
});

test('run linkage validates inputs before creating or changing a ledger', async t => {
  const repo = new LocalRepository(root(t));
  await assert.rejects(updateRun(repo, config(), 'audit', {action:'link',prospects:['bogus']}), /prospect|research/i);
  assert.equal(existsSync(join(repo.dir,'research-runs/audit.json')), false);
});

test('doctor enumerates ledger failures and an interrupted migration together', async t => {
  const dir = root(t), repo = new LocalRepository(dir);
  await initialize(dir);
  json(join(repo.dir,'research-runs/first.json'), {bad:true});
  json(join(repo.dir,'research-runs/second.json'), {bad:true});
  json(join(repo.dir,'migration-v2.json'), {status:'applying',backup:join(dir,'old-backup'),ids:['a'.repeat(16)]});
  const result = spawnSync(process.execPath, ['hr-ops.mjs','doctor'], {encoding:'utf8', env:{...process.env,HR_OPS_ROOT:dir}});
  assert.equal(result.status, 1);
  const report = JSON.parse(result.stdout);
  assert.equal(report.ok, false);
  assert.equal(report.errors.length, 3);
});

test('title relevance does not claim verified supplier authority', () => {
  const p = prospect(), c = config();
  assert.equal(rankedContacts(p,c,now)[0].authority_level, 'unverified');
  // A current CTO still provides strong functional access, not proven buying power.
  assert.equal(scoreProspect(p,c,now).dimensions.access.level, 1);
});

test('reading an old supplier-remit announcement does not renew that authority', () => {
  const p = prospect(), c = config();
  p.icp = 'agency';
  p.contacts[0].title = 'Commercial Director';
  p.evidence.push({...evidence('old-authority'),published_at:'2025-01-01T00:00:00Z'});
  p.contacts[0].supplier_authority = {value:'confirmed',confidence:'observed',evidence:['old-authority']};
  assert.equal(rankedContacts(p,c,now)[0].authority_level,'unverified');
  assert.equal(scoreProspect(p,c,now).dimensions.access.level,0.5);
});

test('late historical sends cannot replace a newer explicit reminder override', () => {
  const p = prospect(), c = config(), contact_id = p.contacts[0].id;
  const event = (id,kind,at,extra={}) => ({id,kind,at,contact_id,authorization:auth(),reason:'Synthetic user-reported history',...extra});
  recordInteraction(p,event('initial','sent','2026-09-20T12:00:00Z',{channel:'email',message:'Original message'}),c,now);
  recordInteraction(p,event('current-schedule','schedule','2026-09-24T12:00:00Z',{next_followup:'2026-10-05'}),c,now);
  recordInteraction(p,event('late-entered','sent','2026-09-21T12:00:00Z',{channel:'linkedin',message:'Historical follow-up',next_followup:'2026-09-26'}),c,now);
  assert.equal(dueFollowups([p],c,'2026-09-30').length,0);
  assert.equal(p.next_followup,'2026-10-05');
  recordInteraction(p,event('old-reply','reply','2026-09-22T12:00:00Z',{reply_to:'initial',response:'Historic reply'}),c,now);
  assert.equal(p.next_followup,'2026-10-05');
});

test('interrupted migration refuses an unavailable original backup before updating records', async t => {
  const repo = new LocalRepository(root(t));
  const {prospect:p} = await repo.discover(input(), {now});
  p.schema_version = 1;
  const record = join(repo.records, `${p.id}.json`);
  json(record, p);
  json(join(repo.dir,'migration-v2.json'), {status:'applying',backup:join(repo.root,'missing-backup'),ids:[p.id]});
  const before = readFileSync(record,'utf8');
  await assert.rejects(migrate(repo,config(),{dryRun:false,now}), /backup|ENOENT/);
  assert.equal(readFileSync(record,'utf8'),before);
});

test('backup omits stale-lock recovery guards as well as the writer lock', async t => {
  const repo = new LocalRepository(root(t));
  await initialize(repo.root);
  json(join(repo.dir,'workspace.lock.recover/owner.json'), {pid:123,token:'synthetic'});
  const b = await backup(repo);
  const manifest = verifyBackup(b.path);
  assert.equal(manifest.files.some(f => f.path.includes('workspace.lock')), false);
});

test('migration resume preserves its original backup and full journal across partial application', async t => {
  const repo = new LocalRepository(root(t));
  await initialize(repo.root);
  const records = [];
  for (const name of ['first','second']) {
    const {prospect:p} = await repo.discover({...input(),name,website:`https://${name}.example`},{now});
    p.schema_version = 1;
    json(join(repo.records,`${p.id}.json`),p);
    records.push(p);
  }
  const original = await backup(repo);
  const journal = join(repo.dir,'migration-v2.json');
  json(journal,{status:'applying',backup:original.path,ids:records.map(p=>p.id)});
  records[0].schema_version = 2; // simulate a completed first atomic write
  json(join(repo.records,`${records[0].id}.json`),records[0]);
  const result = await migrate(repo,config(),{dryRun:false,now});
  assert.equal(result.migrated,1);
  assert.equal(result.backup,original.path);
  assert.deepEqual(JSON.parse(readFileSync(journal)),{status:'complete',backup:original.path,ids:records.map(p=>p.id)});
  assert.equal((await migrate(repo,config(),{dryRun:false,now})).unchanged,true);
  json(journal,{status:'applying',backup:original.path,ids:[...records.map(p=>p.id),'f'.repeat(16)]});
  await assert.rejects(migrate(repo,config(),{dryRun:false,now}),/record missing/);
});

test('restore rejects malformed migration state and reports pending write readiness explicitly', async t => {
  const repo = new LocalRepository(root(t));
  await initialize(repo.root);
  const {prospect:p} = await repo.discover(input(), {now});
  const journal = join(repo.dir,'migration-v2.json');
  json(journal,{status:'broken',backup:'missing',ids:[]});
  const invalid = await backup(repo);
  assert.throws(() => restore(invalid.path,join(repo.root,'invalid-restore'),{dryRun:false}),/migration status/);
  json(journal,{status:'applying',backup:invalid.path,ids:[p.id]});
  const pending = await backup(repo);
  const pendingResult = restore(pending.path,join(repo.root,'pending-restore'),{dryRun:false});
  assert.equal(pendingResult.writable,false);
  assert.equal(pendingResult.migration_status,'applying');
  json(journal,{status:'complete',backup:invalid.path,ids:[p.id]});
  p.schema_version = 1;
  json(join(repo.records,`${p.id}.json`),p);
  const legacy = await backup(repo);
  const legacyResult = restore(legacy.path,join(repo.root,'legacy-restore'),{dryRun:false});
  assert.equal(legacyResult.writable,false);
  assert.deepEqual(legacyResult.migration_needed,[p.id]);
  p.schema_version = 2;
  json(join(repo.records,`${p.id}.json`),p);
  const current = await backup(repo);
  assert.equal(restore(current.path,join(repo.root,'current-restore'),{dryRun:false}).writable,true);
});

test('ordinary reads and writes reject per-record links consistently with recovery', async t => {
  const repo = new LocalRepository(root(t));
  const {prospect:p} = await repo.discover(input(),{now});
  const outside = join(repo.root,'outside.json'), path = join(repo.records,`${p.id}.json`);
  json(outside,p);
  rmSync(path);
  try { symlinkSync(outside,path,'file'); }
  catch (error) { if (error.code === 'EPERM') return t.skip('OS does not permit test symlinks'); throw error; }
  assert.equal(diagnostics(repo).ok,false);
  assert.throws(() => repo.list(),/link/);
  await assert.rejects(repo.discover({...input(),name:'Another',website:'https://another.example'},{now}),/link/);
  assert.deepEqual(JSON.parse(readFileSync(outside)),p);
});

test('ambiguous posting identities cannot manufacture a multi-vacancy qualification bonus', () => {
  const p = prospect(), c = config();
  p.facts.employee_count = {value:null,confidence:'unknown',evidence:[]};
  p.facts.recruiting_pain = {value:null,confidence:'unknown',evidence:[]};
  for (const [i,o] of p.openings.entries()) Object.assign(o,{title:'Backend Engineer',provider:'greenhouse',board:'fictional',posting_id:String(i+1)});
  const ambiguous = scoreProspect(p,c,now);
  assert.equal(ambiguous.opening_count,2); // Records retained without pretending they are verified separate hires.
  assert.equal(ambiguous.dimensions.demand.level,0.5);
  assert.equal(ambiguous.tier,'PROVISIONAL');
  assert.equal(ambiguous.duplicate_candidates.length,2);
  for (const [i,o] of p.openings.entries()) o.requisition_id = `req-${i}`;
  const distinct = scoreProspect(p,c,now);
  assert.equal(distinct.dimensions.demand.level,1);
  assert.equal(distinct.tier,'QUALIFIED');
  assert.equal(distinct.duplicate_candidates.length,0);
  p.openings[1].requisition_id = p.openings[0].requisition_id;
  assert.equal(scoreProspect(p,c,now).opening_count,1);
  for (const [i,o] of p.openings.entries()) { delete o.requisition_id; o.duplicate_group = `reviewed-${i}`; }
  assert.equal(scoreProspect(p,c,now).dimensions.demand.level,1);
});

test('a known duplicate alias cannot turn ambiguous postings into verified multiple demand', () => {
  const p = prospect(), c = config();
  for (const o of p.openings) o.title = 'Backend Engineer';
  p.openings[0].duplicate_group = 'known-hire';
  const before = scoreProspect(p,c,now);
  p.openings.push({...p.openings[0],id:'alias',title:'Full-stack Engineer',url:'https://fictional.example/jobs/alias'});
  const after = scoreProspect(p,c,now);
  assert.equal(after.opening_count,before.opening_count);
  assert.equal(after.dimensions.demand.level,0.5);
  assert.equal(after.total,before.total);
  p.openings.push({...p.openings[1],id:'distinct',title:'Backend Infrastructure Lead',url:'https://fictional.example/jobs/distinct'});
  assert.equal(scoreProspect(p,c,now).dimensions.demand.level,1);
});
