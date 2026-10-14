import test from "node:test";
import assert from "node:assert/strict";
import {
  mkdtempSync,
  mkdirSync,
  rmSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync, fork } from "node:child_process";
import { once } from "node:events";
import * as yaml from "js-yaml";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  now,
  prospect,
  config,
  input,
  payload,
  evidence,
  draft,
  auth,
} from "./fixtures.mjs";
import {
  applyResearch,
  scoreProspect,
  rankedContacts,
  stamp,
} from "../../lib/hr-ops/model.mjs";
import {
  qualify,
  research,
  saveDraft,
  recordInteraction,
  draftCurrent,
} from "../../lib/hr-ops/operations.mjs";
import {
  LocalRepository,
  initialize,
  loadConfig,
} from "../../lib/hr-ops/store.mjs";
import { discoverSources } from "../../lib/hr-ops/discovery.mjs";
import { main } from "../../hr-ops.mjs";

const ROOT = fileURLToPath(new URL("../../", import.meta.url));
function temp(t) {
  const root = mkdtempSync(join(tmpdir(), "hr-review-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  return root;
}
const event = (kind, extra = {}) => ({
  id: kind,
  kind,
  at: now.toISOString(),
  authorization: auth(),
  reason: "Synthetic human instruction",
  ...extra,
});
const sent = (p, extra = {}) =>
  event("sent", {
    contact_id: p.contacts[0].id,
    channel: "linkedin",
    message: "Human-reported initial message",
    ...extra,
  });
const sourceConfig = () => ({
  ...config(),
  discovery: {
    ...config().discovery,
    sources: [
      {
        ...input(),
        provider: "greenhouse",
        api: "https://boards-api.greenhouse.io/v1/boards/fictional/jobs",
        identity_evidence: evidence(),
      },
    ],
  },
});

test("H1 unreviewed demand cannot qualify or support drafts; research enables it", () => {
  const p = prospect(),
    c = config();
  p.openings = [];
  applyResearch(p, { openings: payload().openings }, now, { collected: true });
  qualify(p, c, now);
  assert.equal(p.score.opening_count, 0);
  assert.equal(p.status, "RESEARCHING");
  assert.throws(() => saveDraft(p, draft(p), c, now), /qualify/);
  research(p, { openings: payload().openings }, c, now);
  saveDraft(p, draft(p), c, now);
  assert.equal(p.status, "OUTREACH_READY");
  delete p.openings[0].reviewed; // pre-flag legacy records retain their established policy
  assert.equal(scoreProspect(p, c, now).opening_count, 2);
});

test("H2 report publisher reloads under lock after an intervening hold", async (t) => {
  const root = temp(t),
    repo = new LocalRepository(root),
    c = config();
  await initialize(root, c);
  const p = (await repo.discover(input(), { now })).prospect;
  await repo.update(p.id, "research", (x) => research(x, payload(), c, now), {
    now,
  });
  await repo.update(p.id, "draft", (x) => saveDraft(x, draft(x), c, now), {
    now,
  });
  const priorRoot = process.env.HR_OPS_ROOT,
    originalUpdate = LocalRepository.prototype.update,
    originalLog = console.log;
  let interposed = false;
  process.env.HR_OPS_ROOT = root;
  console.log = () => {};
  LocalRepository.prototype.update = async function (...args) {
    const committed = await originalUpdate.apply(this, args);
    if (args[1] === "qualify" && !interposed) {
      interposed = true;
      const file = join(root, "event.json");
      writeFileSync(file, JSON.stringify(event("hold")));
      await main([
        "record",
        p.id,
        "--input",
        file,
        "--revision",
        String(committed.prospect.revision),
      ]);
    }
    return committed;
  };
  try {
    await main(["qualify", p.id]);
  } finally {
    LocalRepository.prototype.update = originalUpdate;
    console.log = originalLog;
    if (priorRoot === undefined) delete process.env.HR_OPS_ROOT;
    else process.env.HR_OPS_ROOT = priorRoot;
  }
  const current = repo.get(p.id),
    md = readFileSync(join(root, "reports/hr-ops", p.id + ".md"), "utf8");
  assert.equal(current.hold, true);
  assert.match(md, /DO NOT CONTACT/);
  assert.doesNotMatch(md, /actionable: true/);
  assert.ok(md.includes(`Revision: ${current.revision}`));
});

test("H2 a delayed publisher cannot overwrite another process opt-out", async (t) => {
  const root = temp(t),
    repo = new LocalRepository(root),
    c = config();
  await initialize(root, c);
  const p = (await repo.discover(input(), { now })).prospect;
  await repo.update(p.id, "research", (x) => research(x, payload(), c, now), {
    now,
  });
  await repo.update(p.id, "draft", (x) => saveDraft(x, draft(x), c, now), {
    now,
  });
  const worker = join(root, "publisher.mjs");
  writeFileSync(
    worker,
    `import {LocalRepository} from ${JSON.stringify(pathToFileURL(join(ROOT, "lib/hr-ops/store.mjs")).href)};
    import {main} from ${JSON.stringify(pathToFileURL(join(ROOT, "hr-ops.mjs")).href)};
    const update=LocalRepository.prototype.update;
    LocalRepository.prototype.update=async function(...args){const r=await update.apply(this,args);const resume=new Promise(resolve=>process.once('message',resolve));process.send('committed');await resume;return r;};
    try{await main(['qualify',${JSON.stringify(p.id)}]);}finally{process.disconnect();}`,
  );
  const child = fork(worker, [], {
    execPath: process.execPath,
    execArgv: [],
    env: { ...process.env, HR_OPS_ROOT: root },
    stdio: ["ignore", "pipe", "pipe", "ipc"],
  });
  t.after(() => {
    if (child.exitCode === null) child.kill();
  });
  let stderr = "";
  child.stderr.on("data", (s) => (stderr += s));
  child.stdout.resume();
  const finished = once(child, "exit");
  assert.equal((await once(child, "message"))[0], "committed");
  const file = join(root, "optout.json");
  writeFileSync(file, JSON.stringify(event("optout")));
  const other = spawnSync(
    process.execPath,
    [
      join(ROOT, "hr-ops.mjs"),
      "record",
      p.id,
      "--input",
      file,
      "--revision",
      String(repo.get(p.id).revision),
    ],
    { env: { ...process.env, HR_OPS_ROOT: root }, encoding: "utf8" },
  );
  assert.equal(other.status, 0, other.stderr);
  child.send("publish");
  assert.equal((await finished)[0], 0, stderr);
  const md = readFileSync(join(root, "reports/hr-ops", p.id + ".md"), "utf8");
  assert.match(md, /DO NOT CONTACT/);
  assert.match(md, /Suppressed: true/);
  assert.ok(md.includes(`Revision: ${repo.get(p.id).revision}`));
});

test("M1 provider preview and commit reject invalid optional dates without creating a record", async (t) => {
  const repo = new LocalRepository(temp(t)),
    c = sourceConfig();
  const ctx = {
    fetchJson: async () => ({
      jobs: [
        {
          id: 1,
          title: "Backend Engineer",
          absolute_url: "https://fictional.example/jobs/1",
          location: { name: "New York" },
          first_published: "2099-01-01T12:00:00Z",
        },
      ],
    }),
  };
  const dry = await discoverSources(repo, c, { now, ctx, dryRun: true });
  const real = await discoverSources(repo, c, { now, ctx });
  assert.equal(dry.diagnostics[0].status, "error");
  assert.equal(real.diagnostics[0].error, dry.diagnostics[0].error);
  assert.equal(repo.list().length, 0);
});

test("M1 collection transactions preserve reviewed research under concurrent discovery", async (t) => {
  const repo = new LocalRepository(temp(t)),
    c = sourceConfig();
  const p = (await repo.discover(input(), { now })).prospect;
  await repo.update(p.id, "research", (x) => research(x, payload(), c, now), {
    now,
  });
  const original = repo.get(p.id).openings;
  const ctx = {
    fetchJson: async () => ({
      jobs: [
        {
          id: 1,
          title: "Software Engineer",
          absolute_url: original[0].url,
          location: { name: "New York" },
        },
      ],
    }),
  };
  const results = await Promise.all(
    [1, 2].map(() => discoverSources(repo, c, { now, ctx })),
  );
  assert.ok(
    results.every(
      (r) =>
        r.existing === 1 && !r.diagnostics.some((d) => d.status === "error"),
    ),
  );
  assert.equal(repo.list().length, 1);
  assert.equal(repo.get(p.id).revision, 4);
  assert.deepEqual(repo.get(p.id).openings, original);
  const before = readFileSync(join(repo.records, p.id + ".json"), "utf8");
  await assert.rejects(
    () =>
      repo.discover(input(), {
        now,
        prepare(x) {
          x.facts = null;
        },
      }),
    /facts/,
  );
  assert.equal(
    readFileSync(join(repo.records, p.id + ".json"), "utf8"),
    before,
  );
});

test("M1 preparation no-op still creates a new identity but preserves existing revisions", async (t) => {
  const repo = new LocalRepository(temp(t));
  const prepare = () => ({ noop: true });
  const first = await repo.discover(input(), { now, prepare });
  assert.equal(first.created, true);
  assert.equal(first.unchanged, false);
  assert.equal(repo.get(first.prospect.id).revision, 1);
  const retry = await repo.discover(input(), { now, prepare });
  assert.equal(retry.created, false);
  assert.equal(retry.unchanged, true);
  assert.equal(repo.get(first.prospect.id).revision, 1);
});

test("M2 follow-ups bind to their contact even when another contact is messaged", () => {
  const p = prospect(),
    c = config();
  applyResearch(
    p,
    {
      contacts: [
        {
          ...payload().contacts[0],
          name: "Pat Example",
          title: "Head of Engineering",
        },
      ],
    },
    now,
  );
  recordInteraction(p, sent(p), c, now);
  assert.throws(
    () =>
      saveDraft(
        p,
        { ...draft(p), purpose: "followup", contact_id: p.contacts[1].id },
        c,
        now,
      ),
    /recipient|contact/i,
  );
  saveDraft(p, { ...draft(p), purpose: "followup" }, c, now);
  assert.equal(p.drafts[0].reply_to, "sent");
  assert.equal(draftCurrent(p.drafts[0], p, c, now), true);
  recordInteraction(
    p,
    sent(p, { id: "sent2", contact_id: p.contacts[1].id }),
    c,
    now,
  );
  assert.equal(draftCurrent(p.drafts[0], p, c, now), true);
});

test("M3 historical replies cannot cancel newer cadence or commercial reminders", () => {
  const p = prospect(),
    c = config();
  recordInteraction(p, sent(p), c, now);
  const unchanged = structuredClone(p);
  assert.throws(
    () =>
      recordInteraction(
        p,
        event("reply", {
          at: "2026-09-24T12:00:00Z",
          response: "Older history",
        }),
        c,
        now,
      ),
    /Backdated|prior contact/,
  );
  assert.deepEqual(p, unchanged);
  recordInteraction(p, event("reply", { response: "Thanks" }), c, now);
  recordInteraction(
    p,
    event("meeting", {
      at: "2026-09-25T13:00:00Z",
      next_followup: "2026-10-02",
    }),
    c,
    new Date("2026-09-25T14:00:00Z"),
  );
  recordInteraction(p, event("reply", {id:"older-reply",response:"Delayed earlier reply"}), c, new Date("2026-09-25T14:00:00Z"));
  assert.equal(p.interactions.at(-1).response, "Delayed earlier reply");
  assert.equal(p.next_followup, "2026-10-02");
});

test("M2/M3 persisted reply binding remains idempotent after later contact", async (t) => {
  const repo = new LocalRepository(temp(t)),
    c = config();
  const p = (await repo.discover(input(), { now })).prospect;
  await repo.update(p.id, "research", (x) => research(x, payload(), c, now), {
    now,
  });
  await repo.update(
    p.id,
    "sent",
    (x) => recordInteraction(x, sent(x), c, now),
    { now },
  );
  const reply = event("reply", {
    response: "Please follow up",
    next_followup: "2026-10-02",
  });
  await repo.update(p.id, "reply", (x) => recordInteraction(x, reply, c, now), {
    now,
  });
  let current = repo.get(p.id);
  assert.equal(current.interactions.at(-1).reply_to, "sent");
  await repo.update(
    p.id,
    "draft",
    (x) => saveDraft(x, { ...draft(x), purpose: "followup" }, c, now),
    { now },
  );
  assert.equal(repo.get(p.id).drafts.at(-1).reply_to, "sent");
  await repo.update(
    p.id,
    "sent",
    (x) => recordInteraction(x, sent(x, { id: "sent2" }), c, now),
    { now },
  );
  current = repo.get(p.id);
  const retry = await repo.update(
    p.id,
    "reply",
    (x) => recordInteraction(x, reply, c, now),
    { now, expectedRevision: current.revision },
  );
  assert.equal(retry.unchanged, true);
  assert.equal(repo.get(p.id).revision, current.revision);
});

test("M4 reordered evidence is identical but changed evidence stays immutable", () => {
  const p = prospect();
  applyResearch(
    p,
    { evidence: [Object.fromEntries(Object.entries(p.evidence[0]).reverse())] },
    now,
  );
  assert.equal(p.evidence.length, 1);
  assert.throws(
    () =>
      applyResearch(
        p,
        { evidence: [{ ...p.evidence[0], excerpt: "Changed" }] },
        now,
      ),
    /immutable/,
  );
});

test("M5 alias collisions fail atomically through the repository API, including dry runs", async (t) => {
  const repo = new LocalRepository(temp(t)),
    c = config();
  const a = (await repo.discover(input(), { now })).prospect;
  const b = (
    await repo.discover(
      { ...input(), name: "Other", website: "https://other.example" },
      { now },
    )
  ).prospect;
  for (const dryRun of [true, false])
    await assert.rejects(
      () =>
        repo.update(
          a.id,
          "alias",
          (p) =>
            recordInteraction(p, event("alias", { target: b.website }), c, now),
          { now, dryRun, expectedRevision: a.revision },
        ),
      /domain|alias/i,
    );
  assert.equal(repo.get(a.id).revision, a.revision);
  assert.equal(repo.get("other.example").id, b.id);
});

test("M5 simultaneous aliases have exactly one owner and doctor detects preexisting collisions", async (t) => {
  const repo = new LocalRepository(temp(t)),
    c = config();
  const a = (await repo.discover(input(), { now })).prospect;
  const b = (
    await repo.discover(
      { ...input(), name: "Other", website: "https://other.example" },
      { now },
    )
  ).prospect;
  const results = await Promise.allSettled(
    [a, b].map((p) =>
      repo.update(
        p.id,
        "alias",
        (x) =>
          recordInteraction(
            x,
            event("alias", { target: "https://shared.example" }),
            c,
            now,
          ),
        { now, expectedRevision: p.revision },
      ),
    ),
  );
  assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
  // Deliberate corruption of an isolated fixture to exercise the read/doctor boundary.
  const rows = repo.list();
  const other = rows.find((p) => !p.domains.includes("shared.example"));
  other.domains.push("shared.example");
  writeFileSync(join(repo.records, other.id + ".json"), JSON.stringify(other));
  assert.throws(() => repo.list(), /domain|alias/i);
});

test("M6 title context separates actual leadership from owner/partner tokens and former roles", () => {
  const p = prospect(),
    c = config();
  for (const icp of ["startup", "agency"]) {
    p.icp = icp;
    for (const title of [
      "Product Owner",
      "HR Business Partner",
      "Talent Partner",
      "Former CTO",
      "Former Founder",
      "Executive Assistant to the CTO",
      "Assistant to VP of Recruiting",
      "ex-CTO",
    ]) {
      p.contacts[0].title = title;
      assert.equal(
        rankedContacts(p, c, now)[0].relevance,
        "other",
        `${icp}: ${title}`,
      );
    }
  }
  p.icp = "startup";
  for (const title of [
    "Assistant Vice President of Engineering",
    "CTO",
    "VP of Engineering",
  ]) {
    p.contacts[0].title = title;
    assert.equal(rankedContacts(p, c, now)[0].priority, 3, title);
  }
  p.icp = "agency";
  for (const title of ["Owner", "Managing Partner", "Founder", "Co-owner"]) {
    p.contacts[0].title = title;
    assert.equal(rankedContacts(p, c, now)[0].priority, 3, title);
  }
  p.contacts[0].title = "Former CTO";
  assert.equal(rankedContacts(p, c, now)[0].current, false);
});

test("M7 CLI acceptance remains valid with a clock beyond original fixture freshness", (t) => {
  const root = temp(t),
    clock = join(root, "clock.mjs");
  writeFileSync(
    clock,
    `const D=Date;globalThis.Date=class extends D{constructor(...a){super(...(a.length?a:['2027-03-01T12:00:00Z']));}static now(){return D.parse('2027-03-01T12:00:00Z');}};`,
  );
  const env = {
    ...process.env,
    NODE_OPTIONS: `--import=${pathToFileURL(clock).href}`,
  };
  delete env.NODE_TEST_CONTEXT;
  const run = spawnSync(
    process.execPath,
    [
      "--test",
      "--test-name-pattern=CLI workflow persists",
      join(ROOT, "tests/hr-ops/integration.test.mjs"),
    ],
    { cwd: ROOT, env, encoding: "utf8" },
  );
  assert.equal(run.status, 0, run.stdout + run.stderr);
  assert.match(run.stdout, /CLI workflow persists/);
});

test("M8 init preserves values in alternate YAML encodings and validates exact output in dry runs", async (t) => {
  for (const initial of [
    "{}\n",
    "{candidate: {name: Existing User}}\n",
    "# keep comment\ncandidate:\n  name: Existing User\n...\n",
    "# keep comment\ncandidate:\n  name: Existing User\n",
  ]) {
    const root = temp(t);
    mkdirSync(join(root, "config"));
    const path = join(root, "config/profile.yml");
    writeFileSync(path, initial);
    await initialize(root, config(), { dryRun: true });
    assert.equal(readFileSync(path, "utf8"), initial);
    await initialize(root, config());
    assert.equal(loadConfig(root).firm.name, config().firm.name);
    const output = readFileSync(path, "utf8");
    if (initial.includes("Existing User"))
      assert.deepEqual(yaml.load(output).candidate, { name: "Existing User" });
    if (initial.includes("# keep comment"))
      assert.ok(output.includes("# keep comment"));
  }
});

test("M9 timestamps require real calendar dates and retain valid offsets/leap days", () => {
  for (const at of [
    "2026-02-30T12:00:00Z",
    "2026-02-29T12:00:00Z",
    "2026-04-31T12:00:00Z",
    "2026-01-01T24:00:00Z",
  ])
    assert.throws(() => stamp(at, now), /timestamp|calendar|ISO/i, at);
  assert.equal(
    stamp("2024-02-29T23:30:00-03:00", now),
    "2024-03-01T02:30:00.000Z",
  );
  assert.equal(
    stamp("2026-01-01T00:30:00+02:00", now),
    "2025-12-31T22:30:00.000Z",
  );
  assert.equal(
    stamp("2026-01-01T00:30+02:00", now),
    "2025-12-31T22:30:00.000Z",
  );
});

test("M9 invalid timestamps cannot enter canonical evidence or interactions", async (t) => {
  const repo = new LocalRepository(temp(t)),
    c = config();
  const p = (await repo.discover(input(), { now })).prospect;
  for (const apply of [
    (x) =>
      research(
        x,
        {
          evidence: [
            evidence("invalid", "Invalid date", "2026-02-30T12:00:00Z"),
          ],
        },
        c,
        now,
      ),
    (x) =>
      recordInteraction(
        x,
        event("hold", { at: "2026-02-30T12:00:00Z" }),
        c,
        now,
      ),
  ]) {
    await assert.rejects(
      () => repo.update(p.id, "invalid", apply, { now, expectedRevision: 1 }),
      /timestamp|calendar|ISO/i,
    );
    assert.equal(repo.get(p.id).revision, 1);
  }
});
