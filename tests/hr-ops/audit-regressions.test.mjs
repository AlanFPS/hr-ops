import test from "node:test";
import assert from "node:assert/strict";
import {
  mkdtempSync,
  rmSync,
  readFileSync,
  writeFileSync,
  existsSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import * as yaml from "js-yaml";
import {
  now,
  prospect,
  config,
  input,
  payload,
  draft,
  auth,
  fact,
  evidence,
} from "./fixtures.mjs";
import {
  rankedContacts,
  applyResearch,
  scoreProspect,
} from "../../lib/hr-ops/model.mjs";
import {
  qualify,
  recordInteraction,
  dueFollowups,
  outreachBrief,
  saveDraft,
  draftCurrent,
  dossier,
  research,
} from "../../lib/hr-ops/operations.mjs";
import { LocalRepository, initialize } from "../../lib/hr-ops/store.mjs";
import { discoverSources } from "../../lib/hr-ops/discovery.mjs";

const ROOT = fileURLToPath(new URL("../../", import.meta.url));
function temp(t) {
  const root = mkdtempSync(join(tmpdir(), "hr-repair-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  return root;
}
const sent = (p, id = "sent", extra = {}) => ({
  id,
  kind: "sent",
  at: now.toISOString(),
  authorization: auth(),
  contact_id: p.contacts[0].id,
  channel: "linkedin",
  message: "Actual human-reported message",
  ...extra,
});
const event = (kind, extra = {}) => ({
  id: kind,
  kind,
  at: now.toISOString(),
  authorization: auth(),
  reason: "Explicit test user instruction",
  ...extra,
});
const cli = (root, args, data) =>
  spawnSync(process.execPath, [join(ROOT, "hr-ops.mjs"), ...args], {
    env: { ...process.env, HR_OPS_ROOT: root },
    input: data === undefined ? undefined : JSON.stringify(data),
    encoding: "utf8",
  });

test("F01 folded workflow guards preserve the event predicates", () => {
  const workflow = yaml.load(
    readFileSync(join(ROOT, ".github/workflows/ledger-bot.yml"), "utf8"),
  );
  for (const name of ["sign-pr", "confirm-first"]) {
    const condition = workflow.jobs[name].if;
    assert.ok(!condition.includes("(>)"));
    assert.match(
      condition,
      /github\.repository == 'career-ops-hq\/career-ops'/,
    );
    assert.match(
      condition,
      /github\.event_name == '(?:issue_comment|discussion_comment)'/,
    );
  }
});
test("F02 suppression, hold and closure remove draft actionability and warn the human", () => {
  for (const kind of ["optout", "hold", "lost"]) {
    const p = prospect(),
      c = config();
    saveDraft(p, draft(p), c, now);
    const original = p.drafts[0].body;
    recordInteraction(p, event(kind), c, now);
    assert.equal(draftCurrent(p.drafts[0], p, c, now), false, kind);
    assert.notEqual(p.status, "OUTREACH_READY");
    const output = dossier(p, c, now);
    assert.match(output, /DO NOT CONTACT/);
    assert.ok(output.includes(original));
    assert.throws(
      () =>
        recordInteraction(
          p,
          event("review", {
            draft_id: p.drafts[0].id,
            content_hash: p.drafts[0].content_hash,
          }),
          c,
          now,
        ),
      /current exact draft/,
    );
  }
});
test("F03 title matching respects function and spelled-out executive roles", () => {
  const p = prospect(),
    c = config();
  for (const title of [
    "Director of Marketing",
    "Executive Assistant to the CTO",
    "Recruiting Coordinator",
  ]) {
    p.contacts[0].title = title;
    assert.equal(rankedContacts(p, c, now)[0].relevance, "other", title);
  }
  for (const title of [
    "Vice President of Engineering",
    "VP of Engineering",
    "CTO",
    "Head of Engineering",
    "Director of Engineering",
  ]) {
    p.contacts[0].title = title;
    assert.equal(rankedContacts(p, c, now)[0].priority, 3, title);
  }
  p.icp = "agency";
  p.contacts[0].title = "VP of Software Recruiting";
  assert.equal(rankedContacts(p, c, now)[0].priority, 2);
  p.contacts[0].title = "Director of Marketing";
  assert.equal(rankedContacts(p, c, now)[0].relevance, "other");
});
test("F04 explicit null cancels cadence; a reply stops automatic follow-ups", () => {
  const p = prospect(),
    c = config();
  recordInteraction(p, sent(p, "sent", { next_followup: null }), c, now);
  assert.equal(p.next_followup, null);
  assert.deepEqual(dueFollowups([p], c, "2026-10-02"), []);
  recordInteraction(p, sent(p, "sent2"), c, now);
  recordInteraction(p, event("reply", { response: "Thank you" }), c, now);
  assert.equal(p.next_followup, null);
  assert.deepEqual(dueFollowups([p], c, "2026-10-20"), []);
});
test("F04 an explicit requested follow-up after a reply surfaces without losing commercial status", () => {
  for (const overrideOn of ["reply", "sent"]) {
    const p = prospect(),
      c = config();
    recordInteraction(p, sent(p), c, now);
    recordInteraction(
      p,
      event("reply", {
        response: "Please follow up next week",
        ...(overrideOn === "reply" ? { next_followup: "2026-10-02" } : {}),
      }),
      c,
      now,
    );
    if (overrideOn === "sent")
      recordInteraction(
        p,
        sent(p, "sent2", { next_followup: "2026-10-02" }),
        c,
        now,
      );
    assert.equal(p.status, "REPLIED");
    assert.equal(dueFollowups([p], c, "2026-10-02").length, 1);
    saveDraft(p, { ...draft(p), purpose: "followup" }, c, now);
    recordInteraction(p, event("optout"), c, now);
    assert.deepEqual(dueFollowups([p], c, "2026-10-02"), []);
  }
});
test("F05 initial briefs and draft saves share lifecycle and contact eligibility", () => {
  for (const status of [
    "CONTACTED",
    "REPLIED",
    "MEETING",
    "OPPORTUNITY",
    "CLIENT",
    "LOST",
    "DISQUALIFIED",
  ]) {
    const p = prospect(),
      c = config();
    p.status = status;
    assert.equal(outreachBrief(p, c, now).blocked, true, status);
    assert.throws(() => saveDraft(p, draft(p), c, now));
  }
  const p = prospect(),
    c = config();
  p.contacts = [];
  assert.equal(outreachBrief(p, c, now).blocked, true);
});
test("F06 revisions preserve old hypotheses and decision configuration without recursive history", async (t) => {
  const repo = new LocalRepository(temp(t)),
    c = config();
  const { prospect: p } = await repo.discover(input(), { now });
  const first = payload();
  first.facts.service_fit = fact("ORIGINAL-SERVICE-HYPOTHESIS", "inferred");
  await repo.update(p.id, "research", (x) => research(x, first, c, now), {
    now,
    expectedRevision: 1,
  });
  const oldHash = repo.get(p.id).score.config_hash;
  c.scoring.qualify = 95;
  await repo.update(
    p.id,
    "research",
    (x) =>
      research(
        x,
        { facts: { service_fit: fact("REPLACEMENT-HYPOTHESIS", "inferred") } },
        c,
        now,
      ),
    { now, expectedRevision: 2 },
  );
  const final = repo.get(p.id),
    prior = final.history.at(-2),
    latest = final.history.at(-1);
  assert.equal(
    prior.after.facts.service_fit.value,
    "ORIGINAL-SERVICE-HYPOTHESIS",
  );
  assert.equal(
    latest.before.facts.service_fit.value,
    "ORIGINAL-SERVICE-HYPOTHESIS",
  );
  assert.equal(prior.decision.score.config_hash, oldHash);
  assert.equal(prior.decision.config.scoring.qualify, 65);
  assert.equal(latest.decision.config.scoring.qualify, 95);
  assert.equal(prior.after.history, undefined);
});
function sourceConfig() {
  const c = config();
  c.discovery.sources = [
    {
      ...input(),
      provider: "greenhouse",
      api: "https://boards-api.greenhouse.io/v1/boards/fictional/jobs",
      identity_evidence: evidence(),
    },
  ];
  return c;
}
const response = (
  url = "https://fictional.example/jobs/1",
  title = "Software Engineer",
) => ({
  fetchJson: async () => ({
    jobs: [
      {
        id: 1,
        title,
        absolute_url: url,
        location: { name: "Remote US" },
        content: "Build our backend APIs",
      },
    ],
  }),
});
test("F07 collection preserves reviewed classification and verification while retaining new observations", async (t) => {
  const repo = new LocalRepository(temp(t)),
    c = sourceConfig();
  const { prospect: p } = await repo.discover(input(), { now });
  const first = payload();
  first.openings = first.openings.slice(0, 1);
  first.openings[0].title = "Software Engineer";
  await repo.update(p.id, "research", (x) => research(x, first, c, now), {
    now,
  });
  const original = repo.get(p.id).openings[0];
  const later = new Date(+now + 86400000);
  await discoverSources(repo, c, { now: later, ctx: response() });
  const after = repo.get(p.id);
  assert.deepEqual(after.openings[0], original);
  assert.equal(after.collection.openings[0].role_family, "other");
  assert.equal(after.collection.at, later.toISOString());
});
test("F08 invalid options cannot mutate imports; ICP and unique-company limits are respected", async (t) => {
  const root = temp(t);
  await initialize(root, config());
  const entries = [
    input(),
    { ...input(), name: "Second", website: "https://second.example" },
    {
      ...input(),
      name: "Agency",
      website: "https://agency.example",
      icp: "agency",
    },
  ];
  for (const args of [
    ["--icp", "typo"],
    ["--limit", "bogus"],
    ["--limit", "0"],
  ]) {
    const r = cli(root, ["discover", "--input", "-", ...args], {
      prospects: entries,
    });
    assert.equal(r.status, 1);
    assert.equal(new LocalRepository(root).list().length, 0);
  }
  const r = cli(
    root,
    ["discover", "--input", "-", "--icp", "startup", "--limit", "1"],
    { prospects: entries },
  );
  assert.equal(r.status, 0, r.stderr);
  assert.equal(JSON.parse(r.stdout).prospects.length, 1);
  assert.equal(new LocalRepository(root).list().length, 1);
});
test("F09 init dry-run validates input and never creates a data directory", (t) => {
  const root = join(temp(t), "new");
  const invalid = { scoring: { qualify: 999 } };
  assert.equal(
    cli(root, ["init", "--input", "-", "--dry-run"], invalid).status,
    1,
  );
  assert.equal(existsSync(root), false);
  assert.equal(
    cli(root, ["init", "--input", "-", "--dry-run"], config()).status,
    0,
  );
  assert.equal(existsSync(root), false);
});
test("F09 collection dry-run validates exactly the same openings and does not create records", async (t) => {
  const root = join(temp(t), "new"),
    repo = new LocalRepository(root),
    c = sourceConfig(),
    ctx = response("http://fictional.example/jobs/1", "Backend Engineer");
  const dry = await discoverSources(repo, c, { now, ctx, dryRun: true });
  assert.equal(existsSync(root), false);
  const real = await discoverSources(repo, c, { now, ctx });
  assert.equal(dry.diagnostics[0].status, "error");
  assert.equal(real.diagnostics[0].error, dry.diagnostics[0].error);
  assert.equal(repo.list().length, 0);
});
test("F10 descriptive facts reject non-text values and negative fit can block qualification", () => {
  for (const value of [false, "", {}, []])
    assert.throws(
      () =>
        applyResearch(prospect(), { facts: { service_fit: fact(value) } }, now),
      /service_fit/,
    );
  const p = prospect();
  applyResearch(
    p,
    {
      blockers: [
        {
          text: "Company explicitly excludes external recruiting suppliers",
          confidence: "observed",
          evidence: ["site"],
        },
      ],
    },
    now,
  );
  assert.equal(scoreProspect(p, config(), now).recommendation, "DISQUALIFIED");
});
test("F11 invalid writes are atomic and doctor identifies corrupt persisted fields", async (t) => {
  const root = temp(t),
    repo = new LocalRepository(root);
  await initialize(root, config());
  const { prospect: p } = await repo.discover(input(), { now });
  await assert.rejects(
    () =>
      repo.update(p.id, "invalid", (x) => {
        delete x.facts;
      }),
    /facts/,
  );
  assert.equal(repo.get(p.id).revision, 1);
  // Deliberate on-disk corruption in an isolated fixture, never the user's workspace.
  const file = join(repo.records, p.id + ".json"),
    broken = repo.get(p.id);
  delete broken.facts;
  writeFileSync(file, JSON.stringify(broken));
  const health = cli(root, ["doctor"]);
  assert.equal(health.status, 1);
  assert.match(health.stderr, /facts/);
  assert.match(health.stderr, new RegExp(p.id));
});
test("F12 interaction retry identity ignores nested object key order but rejects changed content", () => {
  const p = prospect(),
    c = config(),
    first = sent(p);
  recordInteraction(p, first, c, now);
  const reordered = Object.fromEntries(Object.entries(first).reverse());
  reordered.authorization = Object.fromEntries(
    Object.entries(first.authorization).reverse(),
  );
  assert.equal(recordInteraction(p, reordered, c, now).noop, true);
  assert.equal(p.interactions.length, 1);
  assert.throws(
    () => recordInteraction(p, { ...reordered, message: "different" }, c, now),
    /Idempotency/,
  );
});

test("mixed-state CLI handoff selects initial prospects, surfaces requested follow-ups and exports opt-outs", async (t) => {
  const root = temp(t);
  await initialize(root, config());
  const run = (args, data) => {
    const r = cli(root, args, data);
    assert.equal(r.status, 0, r.stderr);
    return JSON.parse(r.stdout);
  };
  const freshAt = new Date().toISOString();
  for (const name of [
    "Ready",
    "Contacted",
    "Replied",
    "OptedOut",
    "Held",
    "Stale",
  ]) {
    const identity = {
      ...input(),
      name,
      website: `https://${name.toLowerCase()}.example`,
      evidence: [{ ...evidence(), observed_at: freshAt }],
    };
    let p = run(["discover", "--input", "-"], { prospects: [identity] })
      .prospects[0];
    const patch = payload();
    patch.openings.forEach((o) => (o.verified_at = freshAt));
    patch.contacts.forEach((c) => (c.verified_at = freshAt));
    p = run(
      ["research", p.id, "--input", "-", "--revision", String(p.revision)],
      patch,
    ).prospect;
    const record = (e) => {
      p = run(
        ["record", p.id, "--input", "-", "--revision", String(p.revision)],
        e,
      ).prospect;
    };
    if (["Contacted", "Replied", "OptedOut"].includes(name))
      record(sent(p, "sent", { at: freshAt }));
    if (name === "Replied")
      record(
        event("reply", {
          at: freshAt,
          response: "Please follow up",
          next_followup: "2026-10-02",
        }),
      );
    if (name === "OptedOut") record(event("optout", { at: freshAt }));
    if (name === "Held") record(event("hold", { at: freshAt }));
    if (name === "Stale")
      run(
        ["research", p.id, "--input", "-", "--revision", String(p.revision)],
        {
          facts: {
            latam_compatibility: {
              value: null,
              confidence: "unknown",
              evidence: [],
            },
          },
        },
      );
  }
  const briefs = run(["outreach", "--top", "3"]);
  assert.deepEqual(
    briefs.map((x) => x.company),
    ["Ready"],
  );
  const due = run(["followups", "--due", "2099-01-01"]);
  assert.deepEqual(due.map((x) => x.company).sort(), ["Contacted", "Replied"]);
  const rows = run(["export"]);
  assert.equal(rows.length, 6);
  assert.equal(rows.find((p) => p.name === "OptedOut").suppressed, true);
  const md = cli(root, ["status", "OptedOut", "--markdown"]);
  assert.match(md.stdout, /DO NOT CONTACT/);
  const csv = cli(root, ["export", "--format", "csv"]);
  assert.match(csv.stdout, /score,suppressed,hold/);
  assert.match(csv.stdout, /"OptedOut"[^\n]+"true","false"/);
  const ready = rows.find((p) => p.name === "Ready");
  const saved = run(
    [
      "outreach",
      ready.id,
      "--input",
      "-",
      "--revision",
      String(ready.revision),
    ],
    draft(ready),
  );
  assert.equal(saved.prospect.status, "OUTREACH_READY");
  assert.equal(saved.prospect.interactions.length, 0);
});

test("doctor validates YAML structure rather than finding an hr_ops comment", async (t) => {
  const root = temp(t);
  await initialize(root, config());
  const file = join(root, "config/profile.yml");
  writeFileSync(file, "# hr_ops: not initialized\ncandidate: {}\n");
  const uninitialized = cli(root, ["doctor"]);
  assert.equal(uninitialized.status, 1);
  assert.equal(JSON.parse(uninitialized.stdout).initialized, false);
  writeFileSync(file, "hr_ops: []\n");
  const malformed = cli(root, ["doctor"]);
  assert.equal(malformed.status, 1);
  assert.match(malformed.stderr, /hr_ops configuration/);
});

test("a human reopening permits fresh research without repeating the authorization", () => {
  const p = prospect(),
    c = config();
  research(
    p,
    {
      blockers: [
        {
          text: "Prior restriction requires review",
          confidence: "observed",
          evidence: ["site"],
        },
      ],
    },
    c,
    now,
  );
  assert.equal(p.status, "DISQUALIFIED");
  recordInteraction(p, event("reopen"), c, now);
  assert.equal(p.status, "RESEARCHING");
  assert.equal(p.score.recommendation, "DISQUALIFIED");
  research(p, { blockers: [] }, c, now);
  assert.equal(p.status, "CONTACT_IDENTIFIED");
});
