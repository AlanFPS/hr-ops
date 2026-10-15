import test from "node:test";
import assert from "node:assert/strict";
import {
  mkdtempSync,
  rmSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
  existsSync,
} from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";
import {
  prospect,
  config,
  draft,
  auth,
  now,
  input,
  payload,
  fact,
} from "./fixtures.mjs";
import {
  scoreProspect,
  applyResearch,
  mergeConfig,
  DEFAULTS,
  hash,
} from "../../lib/hr-ops/model.mjs";
import {
  saveDraft,
  recordInteraction,
  dueFollowups,
  research,
} from "../../lib/hr-ops/operations.mjs";
import { LocalRepository, initialize } from "../../lib/hr-ops/store.mjs";
import {
  diagnostics,
  backup,
  verifyBackup,
  restore,
  migrate,
} from "../../lib/hr-ops/maintenance.mjs";
import {
  reserveResearch,
  updateRun,
  sourceText,
} from "../../lib/hr-ops/research-run.mjs";
import { discoverSources } from "../../lib/hr-ops/discovery.mjs";

function temporary(t) {
  const root = mkdtempSync(join(tmpdir(), "hr-local-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  return root;
}
function event(kind, extra = {}) {
  return {
    id: kind,
    kind,
    at: now.toISOString(),
    authorization: auth(),
    reason: "User reported actual event",
    ...extra,
  };
}
const unknown = () => ({ value: null, confidence: "unknown", evidence: [] });

test("H1 company-wide LATAM policy cannot qualify restricted engineering roles", () => {
  const p = prospect();
  for (const o of p.openings)
    o.eligibility = {
      status: "restricted",
      evidence: ["site"],
      rationale: "US employment only",
      geography: "United States",
    };
  assert.equal(scoreProspect(p, config(), now).tier, "RESEARCHING");
  assert.equal(scoreProspect(p, config(), now).eligible_opening_count, 0);
  assert.throws(() => saveDraft(p, draft(p), config(), now), /qualify/);
});
test("provisional startup uses evidence gates below 65, without becoming qualified", () => {
  const p = prospect(),
    c = config();
  p.openings = p.openings.slice(0, 1);
  p.facts.recruiting_pain = unknown();
  p.openings[0].eligibility.status = "possible";
  const s = scoreProspect(p, c, now);
  assert.equal(s.tier, "PROVISIONAL");
  assert.ok(s.total < 65);
  saveDraft(p, { ...draft(p), intent: "exploratory" }, c, now);
  assert.equal(p.status, "RESEARCHING");
  assert.equal(p.drafts[0].intent, "exploratory");
  p.openings[0].eligibility = { status: "unknown", evidence: [] };
  assert.equal(scoreProspect(p, c, now).tier, "RESEARCHING");
});
test("agency restricted client vacancies support exploration, not eligible demand", () => {
  const p = prospect(),
    c = config();
  p.icp = "agency";
  p.facts.tech_focus = fact(true);
  p.facts.recruiter_count = fact([5, 15]);
  p.facts.latam_compatibility = unknown();
  for (const o of p.openings) {
    o.hiring_for = "client";
    o.eligibility = {
      status: "restricted",
      evidence: ["site"],
      rationale: "US-only current client vacancy",
      geography: "US",
    };
  }
  const s = scoreProspect(p, c, now);
  assert.equal(s.tier, "PROVISIONAL");
  assert.equal(s.eligible_opening_count, 0);
  p.facts.latam_specialist = fact(true);
  assert.equal(scoreProspect(p, c, now).tier, "DISQUALIFIED");
});
test("H2 same requisition across URLs counts once; distinct identical titles remain separate", () => {
  const p = prospect(),
    c = config();
  for (const o of p.openings)
    Object.assign(o, {
      title: "Backend Engineer",
      provider: "greenhouse",
      board: "example",
      requisition_id: "ENG-1",
    });
  assert.equal(scoreProspect(p, c, now).opening_count, 1);
  p.openings[1].requisition_id = "ENG-2";
  assert.equal(scoreProspect(p, c, now).opening_count, 2);
  p.openings[1].duplicate_group = "reviewed-one";
  p.openings[0].duplicate_group = "reviewed-one";
  assert.equal(scoreProspect(p, c, now).opening_count, 1);
});
test("M3 commercial fallback is partial access until supplier authority is evidenced", () => {
  const p = prospect(),
    c = config();
  p.icp = "agency";
  p.contacts[0].title = "Commercial Director";
  assert.equal(scoreProspect(p, c, now).dimensions.access.level, 0.5);
  p.contacts[0].supplier_authority = fact("confirmed");
  assert.equal(scoreProspect(p, c, now).dimensions.access.level, 1);
});
test("size ranges do not invent headcount and wholly out-of-range evidence blocks both tiers", () => {
  const p = prospect(),
    c = config();
  p.facts.employee_count = fact([40, 80]);
  assert.equal(scoreProspect(p, c, now).dimensions.fit.level, 1);
  p.facts.employee_count = fact([200, 400]);
  assert.equal(scoreProspect(p, c, now).dimensions.fit.level, 0.5);
  p.facts.employee_count = fact([1000, 2000]);
  assert.equal(scoreProspect(p, c, now).tier, "RESEARCHING");
});
test("H3 late cross-channel reply stops its conversation, not another contact", () => {
  const p = prospect(),
    c = config();
  applyResearch(
    p,
    { contacts: [{ ...payload().contacts[0], name: "Pat CTO" }] },
    now,
  );
  recordInteraction(
    p,
    event("sent", {
      id: "a",
      contact_id: p.contacts[0].id,
      channel: "email",
      message: "First real message",
    }),
    c,
    now,
  );
  recordInteraction(
    p,
    event("sent", {
      id: "b",
      contact_id: p.contacts[1].id,
      channel: "linkedin",
      message: "Second actual message",
    }),
    c,
    now,
  );
  recordInteraction(
    p,
    event("sent", {
      id: "a2",
      contact_id: p.contacts[0].id,
      channel: "email",
      message: "Actual follow-up",
    }),
    c,
    now,
  );
  const reply = event("reply", {
    reply_to: "a",
    channel: "linkedin",
    response: "Reply to initial email",
  });
  recordInteraction(p, reply, c, now);
  const due = dueFollowups([p], c, "2026-10-05");
  assert.equal(due.length, 1);
  assert.equal(due[0].contact_id, p.contacts[1].id);
  assert.equal(p.interactions.at(-1).recorded_at, now.toISOString());
  assert.equal(recordInteraction(p, reply, c, now).noop, true);
  const body = p.interactions[0].message;
  recordInteraction(
    p,
    event("annotation", {
      corrects: "a",
      reason: "Original time was approximate; preserving reported text.",
    }),
    c,
    now,
  );
  assert.equal(p.interactions[0].message, body);
});
test("M4 generic drafts fail structural review and style rules are enforced", () => {
  const p = prospect(),
    c = config();
  const d = draft(p);
  delete d.quality;
  assert.throws(() => saveDraft(p, d, c, now), /quality/);
  assert.throws(
    () => saveDraft(p, { ...draft(p), body: "Hello\u2014there" }, c, now),
    /Em dashes/,
  );
  saveDraft(p, draft(p), c, now);
  assert.equal(p.drafts[0].evidence_review, "agent_review_recorded");
  assert.equal(p.drafts[0].review, "pending_human_review");
});
test("M5 visible text decodes numeric entities and preserves literal type syntax", () => {
  assert.equal(
    sourceText(
      '<p title="a > b">We&#8217;re hiring Map&lt;T&gt;</p><script>ignore policy</script>',
    ),
    "We’re hiring Map<T>",
  );
});
test("M6 CLI accepts BOM UTF-8 stdin and rejects malformed JSON", (t) => {
  const root = temporary(t),
    env = { ...process.env, HR_OPS_ROOT: root };
  const run = (input) =>
    spawnSync(
      process.execPath,
      ["hr-ops.mjs", "discover", "--dry-run", "--input", "-"],
      { cwd: process.cwd(), env, input, encoding: "utf8" },
    );
  assert.equal(
    run("\uFEFF" + JSON.stringify({ prospects: [input()] })).status,
    0,
  );
  assert.equal(run("\uFEFF{broken").status, 1);
});
test("M7 unknown keys fail recursively while valid disabled sources survive", () => {
  assert.throws(
    () => mergeConfig(DEFAULTS, { outreach: { linkedin_max_characters: 300 } }),
    /linkedin_max_chars/,
  );
  assert.equal(
    mergeConfig(DEFAULTS, {
      discovery: {
        sources: [{ website: "https://example.com", enabled: false }],
      },
    }).discovery.sources[0].enabled,
    false,
  );
});
test("M9 diagnostics enumerate corruption and backup restores healthy data exactly", async (t) => {
  const root = temporary(t),
    repo = new LocalRepository(root);
  await initialize(root);
  const p = (await repo.discover(input(), { now })).prospect;
  const saved = await backup(repo);
  assert.ok(verifyBackup(saved.path).files.length);
  const restored = join(root, "restored");
  restore(saved.path, restored, { dryRun: false });
  assert.deepEqual(new LocalRepository(restored).get(p.id), repo.get(p.id));
  writeFileSync(join(repo.records, "0000000000000000.json"), "{");
  writeFileSync(join(repo.records, "1111111111111111.json"), "{");
  const diag = diagnostics(repo);
  assert.equal(diag.errors.length, 2);
  assert.equal(diag.records.length, 1);
  assert.equal(diag.partial, true);
  await assert.rejects(
    () => repo.update(p.id, "test", () => ({ reason: "test" }), { now }),
    /Corrupt/,
  );
});
test("migration preserves v1 snapshots and marks unsupported current eligibility unknown", async (t) => {
  const root = temporary(t),
    repo = new LocalRepository(root),
    c = config();
  await initialize(root);
  const p = prospect();
  p.schema_version = 1;
  p.revision = 1;
  delete p.facts.latam_delivery_request;
  for (const o of p.openings) delete o.eligibility;
  const { history, ...snapshot } = structuredClone(p);
  p.history = [
    {
      id: hash("legacy").slice(0, 16),
      at: now.toISOString(),
      action: "legacy",
      from: null,
      to: p.status,
      reason: "Original decision",
      evidence: [],
      after: snapshot,
    },
  ];
  mkdirSync(repo.records, { recursive: true });
  writeFileSync(join(repo.records, p.id + ".json"), JSON.stringify(p));
  const before = JSON.stringify(p.history[0]);
  assert.equal((await migrate(repo, c, { now })).pending.length, 1);
  const result = await migrate(repo, c, { dryRun: false, now });
  assert.equal(result.migrated, 1);
  const current = repo.get(p.id);
  assert.equal(current.schema_version, 2);
  assert.equal(current.openings[0].eligibility.status, "unknown");
  assert.equal(JSON.stringify(current.history[0]), before);
  assert.equal(
    (await migrate(repo, c, { dryRun: false, now })).unchanged,
    true,
  );
});
test("research run completion/resume preserves attempts and links unique prospects", async (t) => {
  const repo = new LocalRepository(temporary(t)),
    c = config();
  await reserveResearch(repo, c, "run", {
    kind: "query",
    target: "engineering agencies",
  });
  await updateRun(repo, c, "run", {
    action: "link",
    prospects: ["one", "one"],
  });
  await updateRun(repo, c, "run", { action: "complete" });
  await assert.rejects(
    () => reserveResearch(repo, c, "run", { kind: "query", target: "another" }),
    /complete/,
  );
  const resumed = await updateRun(repo, c, "run", { action: "resume" });
  assert.equal(resumed.attempts.length, 1);
  assert.equal(resumed.unique_prospects, 1);
});
test("M1/M2 provider capture preserves descriptions; complete disappearance suspends only its board", async (t) => {
  const repo = new LocalRepository(temporary(t)),
    c = config();
  c.discovery.sources = [
    {
      name: "Fictional Labs",
      website: "https://fictional.example",
      icp: "startup",
      provider: "greenhouse",
      careers_url: "https://job-boards.greenhouse.io/fictional",
      api: "https://boards-api.greenhouse.io/v1/boards/fictional/jobs",
      identity_evidence: input().evidence[0],
    },
  ];
  const ctx = {
    fetchJson: async () => ({
      jobs: [
        {
          id: 12,
          requisition_id: "ENG-1",
          title: "Backend Engineer",
          absolute_url: "https://fictional.example/jobs/12",
          content: "Remote contractor work in Argentina",
          location: { name: "Remote" },
        },
      ],
    }),
  };
  const first = await discoverSources(repo, c, { limit: 1, now, ctx });
  assert.equal(first.created, 1, JSON.stringify(first.diagnostics));
  let p = repo.get(first.prospects[0].id);
  const o = p.openings[0];
  assert.equal(o.requisition_id, "ENG-1");
  assert.ok(
    readFileSync(
      join(repo.dir, "captures", o.capture + ".json"),
      "utf8",
    ).includes("Argentina"),
  );
  await repo.update(
    p.id,
    "research",
    (x) =>
      research(
        x,
        {
          openings: [
            {
              ...o,
              eligibility: {
                status: "eligible",
                geography: "Argentina",
                rationale: "Role allows Argentina",
                evidence: o.evidence,
              },
            },
          ],
        },
        c,
        now,
      ),
    { now },
  );
  const partial = await discoverSources(repo, c, {
    limit: 1,
    now,
    ctx: { fetchJson: async () => ({ jobs: [], hasMore: true }) },
  });
  assert.equal(repo.get(p.id).openings[0].reconciliation_needed, false);
  await discoverSources(repo, c, {
    limit: 1,
    now,
    ctx: { fetchJson: async () => ({ jobs: [] }) },
  });
  assert.equal(repo.get(p.id).openings[0].reconciliation_needed, true);
  const malformed = await discoverSources(repo, c, {
    limit: 1,
    now,
    ctx: { fetchJson: async () => ({ error: "bad shape" }) },
  });
  assert.equal(malformed.diagnostics[0].status, "error");
});

test("unattributed historical reply pauses automatic reminders for review", () => {
  const p = prospect(),
    c = config();
  recordInteraction(
    p,
    event("sent", {
      contact_id: p.contacts[0].id,
      channel: "email",
      message: "Actual sent message",
    }),
    c,
    now,
  );
  p.interactions.push({
    id: "legacy-reply",
    kind: "reply",
    at: now.toISOString(),
    response: "Legacy unattributed reply",
  });
  assert.equal(dueFollowups([p], c, "2026-10-05").length, 0);
});
test("backup tampering is rejected before restore creates a destination", async (t) => {
  const root = temporary(t),
    repo = new LocalRepository(root);
  await initialize(root);
  const saved = await backup(repo),
    manifest = verifyBackup(saved.path);
  writeFileSync(join(saved.path, manifest.files[0].path), "tampered");
  const destination = join(root, "restore-tampered");
  assert.throws(
    () => restore(saved.path, destination, { dryRun: false }),
    /checksum/,
  );
  assert.equal(existsSync(destination), false);
});


test('agency qualification also requires supported technology recruiting focus',()=>{
 const p=prospect(),c=config();p.icp='agency';p.facts.recruiter_count=fact(10);
 for(const o of p.openings)o.hiring_for='client';
 assert.equal(scoreProspect(p,c,now).tier,'RESEARCHING');
 p.facts.tech_focus=fact(true);assert.equal(scoreProspect(p,c,now).tier,'QUALIFIED');
});


test('malformed Greenhouse entries cannot become a complete empty collection',async t=>{
 const repo=new LocalRepository(temporary(t)),c=config();
 c.discovery.sources=[{name:'Fictional Labs',website:'https://fictional.example',icp:'startup',provider:'greenhouse',careers_url:'https://job-boards.greenhouse.io/fictional',identity_evidence:input().evidence[0]}];
 const result=await discoverSources(repo,c,{limit:1,now,ctx:{fetchJson:async()=>({jobs:[{title:'Backend Engineer',id:1}]})}});
 assert.equal(result.diagnostics[0].complete,false);
 assert.equal(repo.get(result.prospects[0].id).collection.complete,false);
});


test('UTF-8 decoder rejects invalid byte sequences instead of saving replacement characters',t=>{
 const root=temporary(t),env={...process.env,HR_OPS_ROOT:root};
 const bytes=Buffer.concat([Buffer.from('{"prospects":[{"name":"'),Buffer.from([0xff]),Buffer.from('"}]}')]);
 const r=spawnSync(process.execPath,['hr-ops.mjs','discover','--input','-'],{env,input:bytes,encoding:'utf8'});
 assert.equal(r.status,1);assert.match(r.stderr,/UTF-8/);assert.equal(existsSync(join(root,'data/hr-ops/prospects')),false);
});
test('restore validates research ledgers in addition to record checksums',async t=>{
 const root=temporary(t),repo=new LocalRepository(root);await initialize(root);
 mkdirSync(join(repo.dir,'research-runs'),{recursive:true});
 writeFileSync(join(repo.dir,'research-runs','invalid.json'),JSON.stringify({schema_version:1,run:'invalid',limits:{queries:0,pages_per_company:6},attempts:[]}));
 const saved=await backup(repo);
 assert.throws(()=>restore(saved.path,join(root,'restored-invalid'),{dryRun:false}),/research limits/);
});


test('backup refuses nested checkouts inside its data allowlist',async t=>{
 const root=temporary(t),repo=new LocalRepository(root);await initialize(root);
 mkdirSync(join(repo.dir,'nested-repository','.git'),{recursive:true});
 await assert.rejects(()=>backup(repo),/nested checkout/);
});


test('stronger eligible evidence cannot remove provisional admission below qualified thresholds',()=>{
 const p=prospect(),c=config();p.openings=p.openings.slice(0,1);p.facts.employee_count=unknown();p.facts.recruiting_pain=unknown();
 p.openings[0].eligibility.status='possible';assert.equal(scoreProspect(p,c,now).tier,'PROVISIONAL');
 p.openings[0].eligibility.status='eligible';const s=scoreProspect(p,c,now);assert.ok(s.total<65);assert.equal(s.tier,'PROVISIONAL');
 saveDraft(p,{...draft(p),intent:'exploratory'},c,now);assert.equal(p.status,'RESEARCHING');
 p.openings[0].eligibility.status='restricted';assert.equal(scoreProspect(p,c,now).tier,'RESEARCHING');
});


test('explicit agency delivery requests use current-demand freshness without fictional vacancies',()=>{
 const p=prospect(),c=config();p.icp='agency';p.openings=[];p.facts.tech_focus=fact(true);p.facts.recruiter_count=fact(10);p.facts.latam_delivery_request=fact(true);p.contacts[0].title='Founder';p.evidence[0].excerpt=p.evidence[0].excerpt.replace('Alex Doe CTO','Alex Doe Founder');
 assert.equal(scoreProspect(p,c,now).tier,'QUALIFIED');assert.equal(scoreProspect(p,c,now).opening_count,0);
 p.evidence.push({...p.evidence[0],id:'old-request',observed_at:new Date(now.getTime()-45*86400000).toISOString()});
 p.facts.latam_delivery_request.evidence=['old-request'];assert.equal(scoreProspect(p,c,now).tier,'RESEARCHING');
});


test('backups omit the live lock directory and restored data is immediately writable',async t=>{
 const root=temporary(t),repo=new LocalRepository(root);await initialize(root);
 await repo.discover(input(),{now});
 const saved=await backup(repo);const manifest=verifyBackup(saved.path);
 assert.ok(manifest.files.every(f=>!f.path.includes('workspace.lock')));
 const destination=join(root,'writable-restore');restore(saved.path,destination,{dryRun:false});
 assert.equal(existsSync(join(destination,'data/hr-ops/workspace.lock')),false);
 const restored=new LocalRepository(destination);await restored.discover({...input(),name:'Second Fixture',website:'https://second.example'},{now});
 assert.equal(restored.list().length,2);
});
