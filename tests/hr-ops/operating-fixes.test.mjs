import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, readFileSync, existsSync } from 'node:fs';
import fs from 'node:fs';
import { syncBuiltinESMExports } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { LocalRepository, initialize } from '../../lib/hr-ops/store.mjs';
import { runHr, runHrText, withReservation, requireRuntime } from '../../lib/hr-ops/client.mjs';
import { researchBudget, reserveResearch } from '../../lib/hr-ops/research-run.mjs';
import { proseNumbers } from '../../lib/hr-ops/claim-numbers.mjs';
import { saveExport } from '../../lib/hr-ops/export-file.mjs';
import { scoreProspect, applyResearch, validateFact } from '../../lib/hr-ops/model.mjs';
import { saveDraft } from '../../lib/hr-ops/operations.mjs';
import { prospect, config, now, draft, fact, input } from './fixtures.mjs';

async function isolated(t) {
  const root = mkdtempSync(join(tmpdir(), 'hr-operating-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const c = config(); c.discovery.pages_per_company = 1; c.discovery.max_queries = 1;
  await initialize(root, c);
  return { root, c, repo: new LocalRepository(root), opts: { env: { ...process.env, HR_OPS_ROOT: root }, cwd: root } };
}

test('client stops dispatch on malformed, exhausted and failed CLI reservations; queries have a separate cap', async t => {
  const { repo, c, opts } = await isolated(t);
  let calls = 0;
  const dispatch = () => ++calls;
  const page = { kind: 'page', company: 'https://fictional.example', target: 'https://fictional.example/jobs' };
  await assert.rejects(withReservation('operating', { ...page, target: 'https://fictional.example (linked board)' }, dispatch, opts), /Invalid URL/);
  assert.equal(calls, 0);
  const success = await withReservation('operating', page, dispatch, opts);
  assert.equal(success.receipt.dispatch_allowed, true);
  assert.equal(calls, 1);
  await assert.rejects(withReservation('operating', page, dispatch, opts), /budget exhausted/);
  assert.equal(calls, 1);
  await withReservation('operating', { kind: 'query', target: 'Fictional Labs careers' }, dispatch, opts);
  await assert.rejects(withReservation('operating', { kind: 'query', target: 'repeat' }, dispatch, opts), /budget exhausted/);
  assert.equal(calls, 2);
  assert.equal(researchBudget(repo, c, 'operating').attempts.length, 2);
  const preview = await reserveResearch(repo, c, 'preview', page, { dryRun: true });
  assert.equal(preview.dispatch_allowed, false);
  assert.equal(researchBudget(repo, c, 'preview').attempts.length, 0);
  assert.throws(() => runHr(['unsupported'], opts), /exited 1/);
});

test('ATS UUIDs and query digits are references; numerical prose and link labels still need evidence', () => {
  const p = prospect(), c = config(), d = draft(p);
  const link = 'https://jobs.ashbyhq.com/river/610f652b-bdb9-4d82-9973-680babe16a07?ref=123%20abc';
  d.body += ` Source: ${link}`;
  assert.doesNotThrow(() => saveDraft(p, d, c, now));
  assert.throws(() => saveDraft(p, { ...d, body: d.body + ' Our fee is 10%.' }, c, now), /Unconfirmed commercial claim/);
  assert.deepEqual(proseNumbers(`[42 vacancies](${link}). 17 roles`), ['42', '17']);
  const bad = { ...d, body: d.body + ' You have 9973 vacancies.', claims: [...d.claims, { text: '9973 vacancies', kind: 'observed', evidence: ['site'] }] };
  assert.throws(() => saveDraft(p, bad, c, now), /Numeric draft/);
  p.evidence[0].excerpt += ' Link: ' + link;
  assert.throws(() => saveDraft(p, bad, c, now), /Numeric draft/); // URL is not proof of quantity
  p.evidence[0].excerpt += ' There are 9973 vacancies.';
  assert.throws(() => saveDraft(p, bad, c, now), /explicit primary count quote/); // unknown provenance is not a quotation
  p.evidence[0].excerpt_kind = 'quote';
  assert.doesNotThrow(() => saveDraft(p, bad, c, now));
  assert.deepEqual(proseNumbers('https://[9973 invalid 42'), ['9973', '42']);
});

test('positive pain needs an explicit basis; historical vacancy-only pain is readable but scores zero', () => {
  const p = prospect(), c = config();
  const supported = scoreProspect(p, c, now);
  assert.equal(supported.dimensions.need.points, 10);
  p.facts.recruiting_pain = fact('mixed', 'inferred');
  assert.doesNotThrow(() => validateFact(p.facts.recruiting_pain, p.evidence, 'recruiting_pain'));
  const unsupported = scoreProspect(p, c, now);
  assert.equal(unsupported.dimensions.need.points, 0);
  assert.equal(unsupported.dimensions.need.known, false);
  assert.equal(unsupported.pain_assessment.basis, 'unknown');
  assert.throws(() => applyResearch(p, { facts: { recruiting_pain: fact('mixed', 'inferred') } }, now), /requires a cited basis/);
  assert.throws(() => applyResearch(p, { facts: { recruiting_pain: { ...fact('mixed', 'inferred'), basis: 'specialist_vacancy', rationale: 'A specialist job is advertised' } } }, now), /Invalid recruiting pain basis/);
  p.facts.recruiting_pain = fact(null, 'unknown'); p.facts.recruiting_pain.evidence = [];
  assert.equal(scoreProspect(p, c, now).total, unsupported.total);
  p.facts.recruiting_pain = fact('none');
  assert.equal(scoreProspect(p, c, now).dimensions.need.points, 0);
});

test('full export is written directly and reloads exactly; invalid output cannot mutate prospect state', async t => {
  const { root, repo, opts } = await isolated(t);
  await repo.discover(input(), { now });
  const receipt = runHr(['export', '--output', 'local/exports/pipeline.json'], opts);
  assert.equal(receipt.records, 1);
  assert.equal(receipt.executable, process.execPath);
  assert.deepEqual(JSON.parse(readFileSync(receipt.saved, 'utf8')), repo.list());
  assert.deepEqual(runHr(['export'], opts), repo.list());
  assert.throws(() => runHr(['export', '--output', 'data/hr-ops/prospects/oops.json'], opts), /local\/exports/);
  assert.throws(() => runHr(['export', '--output', 'local/exports/../../config/profile.yml'], opts), /local\/exports/);
  assert.throws(() => runHr(['init', '--output', 'local/exports/oops.json'], opts), /requires export/);
  assert.equal(existsSync(join(root, 'local/exports/oops.json')), false);
});

test('unsupported runtimes fail loudly', () => {
  assert.throws(() => requireRuntime('20.10.0'), /requires Node >=24/);
  assert.doesNotThrow(() => requireRuntime('24.21.0'));
});

test('JSON helper rejects text modes before mutation; checked text runner supports actual CLI formats', async t => {
  const { repo, opts } = await isolated(t);
  const discovery = { ...opts, input: { prospects: [input()] } };
  assert.throws(() => runHr(['discover', '--input', '-', '--summary'], discovery), /requires JSON output/);
  assert.equal(repo.list().length, 0);
  for (const args of [[], ['help'], ['--help'], ['pipeline', '--summary'], ['status', 'Fictional Labs', '--markdown'], ['export', '--format', 'csv']])
    assert.throws(() => runHr(args, opts), /use runHrText/);
  assert.match(runHrText(['discover', '--input', '-', '--summary'], discovery), /Fictional Labs/);
  assert.equal(repo.list().length, 1);
  assert.match(runHrText(['status', 'Fictional Labs', '--markdown'], opts), /Fictional Labs/);
  assert.match(runHrText(['export', '--format', 'csv'], opts), /id,company,website/);
  assert.match(runHrText(['help'], opts), /Usage:/);
  assert.throws(() => runHrText(['unsupported'], opts), /exited 1/);
  const receipt = runHr(['export', '--format', 'csv', '--output', 'local/exports/prospects.csv'], opts);
  assert.equal(receipt.records, 1);
  assert.match(readFileSync(receipt.saved, 'utf8'), /Fictional Labs/);
});

test('concurrent export directory creation succeeds, but an incompatible winner is rejected', async t => {
  for (const winner of ['directory', 'file']) {
    const { root } = await isolated(t);
    const competingPath = join(root, 'local', 'exports');
    const originalMkdir = fs.mkdirSync;
    let injected = false;
    fs.mkdirSync = (path, ...args) => {
      if (path === competingPath && !injected) {
        injected = true;
        if (winner === 'directory') originalMkdir(path, ...args);
        else fs.writeFileSync(path, 'competing file');
      }
      return originalMkdir(path, ...args);
    };
    syncBuiltinESMExports();
    try {
      if (winner === 'directory') {
        const path = saveExport(root, 'local/exports/prospects.json', '[]\n');
        assert.equal(readFileSync(path, 'utf8'), '[]\n');
      } else {
        assert.throws(() => saveExport(root, 'local/exports/prospects.json', '[]\n'), /incompatible file types/);
        assert.equal(readFileSync(competingPath, 'utf8'), 'competing file');
      }
      assert.equal(injected, true);
    } finally {
      fs.mkdirSync = originalMkdir;
      syncBuiltinESMExports();
    }
  }
});
