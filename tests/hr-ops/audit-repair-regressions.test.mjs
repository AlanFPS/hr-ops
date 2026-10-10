import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { config, evidence } from './fixtures.mjs';
import { LocalRepository, initialize } from '../../lib/hr-ops/store.mjs';
import { captureSource, researchBudget, reserveResearch } from '../../lib/hr-ops/research-run.mjs';
import { discoverSources } from '../../lib/hr-ops/discovery.mjs';
import { inspectSources } from '../../lib/hr-ops/sources.mjs';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
function repo(t) {
  const root = mkdtempSync(join(tmpdir(), 'hr-audit-repairs-'));
  t.after(() => rmSync(root, { recursive: true, force: true, maxRetries: 5 }));
  return new LocalRepository(root);
}
const data = { company: 'https://fictional.example', url: 'https://fictional.example/team', excerpt: 'Alex Doe CTO', excerpt_kind: 'quote', source_type: 'primary' };
function source(provider = 'greenhouse', icp = 'startup') {
  return { name: 'Fictional', website: data.company, icp, provider,
    ...(provider === 'greenhouse' ? { api: 'https://boards-api.greenhouse.io/v1/boards/fictional/jobs' } : {}),
    ...(provider === 'ashby' ? { careers_url: 'https://jobs.ashbyhq.com/fictional' } : {}),
    identity_evidence: evidence('identity', 'Fictional company links this board', new Date().toISOString()),
  };
}

test('H1 capture bounds HTTP errors through its actual default transport', async t => {
  t.mock.method(globalThis, 'fetch', async () => new Response('x'.repeat(6_000_000), { status: 503 }));
  const r = repo(t), c = config();
  await assert.rejects(() => captureSource(r, c, 'bounded', data), e => e.status === 503 && e.body.length === 8192);
  assert.equal(researchBudget(r, c, 'bounded').attempts.length, 1);
});

test('H1 capture still flags possible truncation after UTF-8 tail and BOM removal', async t => {
  const r = repo(t), c = config();
  let body;
  t.mock.method(globalThis, 'fetch', async () => new Response(body));
  for (body of ['x'.repeat(1_999_999) + 'é', '\ufeff' + 'x'.repeat(2_000_000), '\ufeff' + 'x'.repeat(1_999_994) + '😀']) {
    const captured = await captureSource(r, c, 'truncation', { company: data.company, url: data.url });
    assert.equal(captured.possibly_truncated, true);
    assert.ok(Buffer.byteLength(captured.content) < 2_000_000);
  }
  body = 'A complete short page';
  assert.equal((await captureSource(r, c, 'truncation', { company: data.company, url: data.url })).possibly_truncated, false);
});

test('M2 invalid capture inputs reject before preview, quota reservation or network access', async t => {
  const r = repo(t), c = config();
  c.discovery.pages_per_company = 1;
  let calls = 0;
  const opts = { fetchText: async () => { calls++; return 'Alex Doe CTO'; } };
  const invalid = [
    { ...data, excerpt_kind: 'typo' }, { ...data, excerpt_kind: undefined },
    { ...data, source_type: undefined }, { ...data, source_type: 'invented' },
    { ...data, excerpt: ' ' }, { ...data, excerpt: 'x'.repeat(4001), excerpt_kind: 'summary' },
    ...[false, null, '', '2026-02-30T00:00:00Z', new Date(Date.now() + 86400000).toISOString()].map(published_at => ({ ...data, published_at })),
    { ...data, excerpt: undefined },
  ];
  for (const input of invalid) for (const dryRun of [true, false]) {
    await assert.rejects(() => captureSource(r, c, 'validation', input, { ...opts, dryRun }));
  }
  assert.equal(calls, 0);
  assert.equal(existsSync(join(r.dir, 'research-runs')), false);
  assert.equal((await captureSource(r, c, 'validation', data, { ...opts, dryRun: true })).fetched, false);
  assert.equal((await captureSource(r, c, 'validation', data, opts)).fetched, true);
  assert.equal(calls, 1);
  assert.equal(researchBudget(r, c, 'validation').attempts.length, 1);
});

test('M3 returned quotes are exactly the plain text checked against the capture', async t => {
  const r = repo(t), c = config();
  const opts = { fetchText: async () => '<h1>Alex Doe CTO</h1>' };
  for (const [index, excerpt] of [
    '<style>Invented claim</style>Alex Doe CTO',
    '<script>Invented claim</script>Alex Doe CTO',
    '<b>Alex</b> Doe CTO',
  ].entries()) await assert.rejects(() => captureSource(r, c, 'bad-quote-' + index, { ...data, excerpt }, opts), /does not occur/);
  const result = await captureSource(r, c, 'quote', { ...data, excerpt: ' Alex\n Doe   CTO ' }, opts);
  assert.equal(result.evidence.excerpt, 'Alex Doe CTO');
  assert.ok(result.content.includes(result.evidence.excerpt));
  const literal = await captureSource(r, c, 'literal', { ...data, excerpt: 'Map<T> & API' }, { fetchText: async () => '<p>Map&lt;T&gt; &amp; API</p>' });
  assert.equal(literal.evidence.excerpt, literal.content);
  assert.equal(researchBudget(r, c, 'bad-quote-0').attempts.length, 1);
});

test('M1 budgeted discovery previews make no requests or writes, including on repeat', async t => {
  const r = repo(t), c = config();
  c.discovery.pages_per_company = 1;
  c.discovery.sources = [source()];
  const ctx = { fetchJson: async () => { assert.fail('Preview must not fetch'); } };
  for (let n = 0; n < 2; n++) {
    const result = await discoverSources(r, c, { run: 'preview', dryRun: true, limit: 1, ctx });
    assert.equal(result.network_reads_allowed, false);
    assert.equal(result.partial, true);
    assert.equal(result.research_tasks[0].requires_live_collection, true);
    assert.equal(result.diagnostics[0].status, 'preview');
  }
  assert.equal(existsSync(r.dir), false);
  await reserveResearch(r, c, 'preview', { kind: 'page', company: data.company, target: data.url });
  const path = join(r.dir, 'research-runs/preview.json'), before = readFileSync(path, 'utf8');
  await discoverSources(r, c, { run: 'preview', dryRun: true, limit: 1, ctx });
  assert.equal(readFileSync(path, 'utf8'), before);
  assert.equal(r.list().length, 0);
});

test('M1 Greenhouse enrichment cannot swallow a research budget denial', async t => {
  const r = repo(t), c = config();
  c.discovery.pages_per_company = 1;
  c.discovery.sources = [source()];
  let calls = 0;
  const ctx = { fetchJson: async () => { calls++; return { jobs: [{ id: 1, title: 'Backend Engineer', absolute_url: 'https://fictional.example/jobs/1', location: { name: 'Remote' } }] }; } };
  const result = await discoverSources(r, c, { run: 'greenhouse', limit: 1, ctx });
  assert.equal(calls, 1);
  assert.equal(researchBudget(r, c, 'greenhouse').attempts.length, 1);
  assert.equal(result.partial, true);
  assert.equal(result.diagnostics[0].status, 'budget-exhausted');
  assert.equal(r.list().length, 0);
});

test('M1 Ashby stops retrying when its next reservation is denied', async t => {
  const r = repo(t), c = config();
  c.discovery.pages_per_company = 1;
  c.discovery.sources = [source('ashby')];
  let calls = 0, sleeps = 0;
  const ctx = { fetchJson: async () => { calls++; throw Object.assign(new Error('HTTP 503'), { status: 503 }); }, sleep: async () => { sleeps++; } };
  const result = await discoverSources(r, c, { run: 'ashby', limit: 1, ctx });
  assert.equal(calls, 1);
  assert.equal(sleeps, 1); // one retry of the real 503, none of the quota denial
  assert.equal(researchBudget(r, c, 'ashby').attempts.length, 1);
  assert.equal(result.diagnostics[0].status, 'budget-exhausted');
});

test('M4 invalid sources are isolated and excluded ICPs cannot abort valid discovery', async t => {
  const r = repo(t), c = config();
  const valid = { ...source('manual', 'agency'), name: 'Valid Agency', website: 'https://agency.example' };
  const variants = [
    { ...source(), provider: 'unsupported' },
    { ...source(), identity_evidence: {} },
    { ...source(), api: undefined },
    { ...source(), website: 'not-a-url' },
  ];
  const ctx = { fetchJson: async () => { assert.fail('Invalid or manual sources must not fetch'); } };
  for (const invalid of variants) {
    c.discovery.sources = [valid, invalid];
    const agencies = await discoverSources(r, c, { icp: 'agency', limit: 1, ctx });
    assert.equal(agencies.research_tasks[0].name, 'Valid Agency');
    assert.equal(agencies.diagnostics.some(d => d.status === 'error'), false);
    const both = await discoverSources(r, c, { icp: 'both', limit: 2, ctx });
    assert.equal(both.research_tasks.length, 1);
    assert.equal(both.partial, true);
    assert.ok(both.diagnostics.some(d => d.company === 'Fictional' && d.status === 'error'));
  }
  c.discovery.sources = [valid, null];
  assert.equal(inspectSources(c).diagnostics.length, 1);
});

test('M4 doctor reports source errors while valid minimal disabled overrides remain healthy', async t => {
  const cli = root => spawnSync(process.execPath, [join(ROOT, 'hr-ops.mjs'), 'doctor'], { env: { ...process.env, HR_OPS_ROOT: root }, encoding: 'utf8' });
  const r = repo(t), c = config();
  c.discovery.sources = [{ ...source(), provider: 'unsupported' }];
  await initialize(r.root, c);
  const bad = cli(r.root);
  assert.equal(bad.status, 1, bad.stderr);
  const result = JSON.parse(bad.stdout);
  assert.equal(result.ok, false);
  assert.equal(result.source_errors[0].company, 'Fictional');
  const other = repo(t), good = config();
  good.discovery.starter_sources = true;
  good.discovery.sources = [{ website: 'https://www.river.com', enabled: false }];
  await initialize(other.root, good);
  const healthy = cli(other.root);
  assert.equal(healthy.status, 0, healthy.stderr);
  assert.deepEqual(JSON.parse(healthy.stdout).source_errors, []);
  assert.ok(inspectSources(good).sources.every(s => s.name !== 'River'));
});
