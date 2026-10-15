import {
  existsSync,
  readFileSync,
  readdirSync,
  lstatSync,
  mkdirSync,
  copyFileSync,
} from "node:fs";
import { join, resolve, dirname, relative, isAbsolute } from "node:path";
import { execFileSync } from "node:child_process";
import { writeFileAtomic } from "../../tracker-utils.mjs";
import {
  assert,
  hash,
  VERSION,
  FIELDS,
  scoreProspect,
  DEFAULTS,
} from "./model.mjs";
import { validateProspect } from "./validation.mjs";
import { LocalRepository, loadConfig, PROJECT_ROOT, migrationState } from "./store.mjs";
import { isNestedCheckout } from "../../lib/mjs-files.mjs";
import { researchBudget } from "./research-run.mjs";
import { qualify } from "./operations.mjs";

export function diagnostics(repo) {
  const records = [],
    errors = [],
    owners = new Map();
  if (existsSync(repo.records))
    for (const file of readdirSync(repo.records).filter((f) =>
      f.endsWith(".json"),
    )) {
      try {
        assert(/^[a-f0-9]{16}\.json$/.test(file), "Invalid prospect filename");
        const path = join(repo.records, file);
        assert(
          !lstatSync(path).isSymbolicLink(),
          "Prospect must not be a link",
        );
        const p = validateProspect(JSON.parse(readFileSync(path, "utf8")));
        assert(p.id === file.slice(0, -5), "Mismatched prospect ID");
        records.push(p);
        for (const d of p.domains) owners.set(d, [...(owners.get(d) ?? []), p.id]);
      } catch (e) {
        errors.push({ file, error: e.message });
      }
    }
  const conflicted = new Set();
  for (const [domain, ids] of owners) if (ids.length > 1) {
    for (const id of ids) {
      conflicted.add(id);
      errors.push({file: `${id}.json`, error: `Domain ${domain} belongs to conflicting prospects: ${ids.join(', ')}`});
    }
  }
  return { ok: !errors.length, partial: !!errors.length, records: records.filter(p => !conflicted.has(p.id)), errors };
}

export function buildInfo() {
  let revision = null,
    dirty = null;
  try {
    revision = execFileSync("git", ["rev-parse", "HEAD"], {
      cwd: PROJECT_ROOT,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
    dirty = !!execFileSync("git", ["status", "--porcelain"], {
      cwd: PROJECT_ROOT,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    /* Exported source trees need no Git installation. */
  }
  return {
    release: "hr-ops-local-2",
    schema_version: VERSION,
    revision,
    dirty,
    node: process.version,
    send_enabled: false,
    delivery_scope: "core_cli",
    optional_linkedin_delivery: "human_operated_terminal_only",
  };
}

export function effectiveConfig(c, raw = {}, path = "hr_ops") {
  return Object.fromEntries(
    Object.entries(c).map(([k, v]) => [
      k,
      v && typeof v === "object" && !Array.isArray(v)
        ? effectiveConfig(v, raw?.[k] ?? {}, `${path}.${k}`)
        : {
            value: v,
            origin: Object.hasOwn(raw ?? {}, k) ? "profile" : "default",
          },
    ]),
  );
}

// Backups are allowlisted data copies. Never walk arbitrary user-root content.
const DATA_PATHS = [
  "config/profile.yml",
  "modes/_custom.md",
  "data/hr-ops",
  "reports/hr-ops",
];
function transientPath(path) {
  return path.split(/[\\/]/).some(part=>/^workspace\.lock(?:\.recover)?$/i.test(part) || /\.tmp(?:\.|$)/i.test(part));
}
function inventory(root) {
  const rows = [];
  function walk(absolute) {
    const path = relative(root, absolute);
    if (transientPath(path)) return;
    const stat = lstatSync(absolute);
    assert(!stat.isSymbolicLink(), `Backup refuses link: ${path}`);
    if (stat.isDirectory()) {
      if (!isNestedCheckout(absolute)) {
        for (const name of readdirSync(absolute).sort()) walk(join(absolute, name));
      } else throw new Error(`Backup refuses nested checkout: ${path}`);
    } else {
      // Transient locking files are not user data and cannot be restored.
      if (
        /(?:^workspace\.lock|\.tmp(?:\.|$))/i.test(path.split(/[\\/]/).at(-1))
      )
        return;
      const bytes = readFileSync(absolute);
      rows.push({
        path: path.replaceAll("\\", "/"),
        bytes: bytes.length,
        sha256: hash(bytes),
      });
    }
  }
  for (const path of DATA_PATHS) if (existsSync(join(root, path))) walk(join(root,path));
  return rows;
}
function safeChild(root, target) {
  const path = resolve(root, target),
    rel = relative(root, path);
  assert(
    rel && !rel.startsWith("..") && !isAbsolute(rel),
    "Path must stay inside the selected directory",
  );
  let current = resolve(root);
  assert(
    !existsSync(current) || !lstatSync(current).isSymbolicLink(),
    "Root cannot be a link",
  );
  for (const part of rel.split(/[\\/]/)) {
    current = join(current, part);
    if (existsSync(current))
      assert(!lstatSync(current).isSymbolicLink(), "Path cannot contain links");
  }
  return path;
}
async function snapshot(repo, label = "backup") {
  const files = inventory(repo.root);
  const id = `${label}-${new Date().toISOString().replace(/[:.]/g, "-")}-${hash(JSON.stringify(files) + Math.random()).slice(0, 8)}`;
  const dest = safeChild(repo.root, join("local", "hr-ops-backups", id));
  assert(!existsSync(dest), "Backup already exists");
  for (const f of files) {
    const to = safeChild(dest, f.path);
    mkdirSync(dirname(to), { recursive: true });
    copyFileSync(join(repo.root, f.path), to);
  }
  const after = inventory(repo.root);
  assert(
    JSON.stringify(files) === JSON.stringify(after),
    "Data changed during backup; incomplete copy retained without a valid manifest",
  );
  const manifest = {
    format: 1,
    created_at: new Date().toISOString(),
    build: buildInfo(),
    files,
  };
  mkdirSync(dest, { recursive: true });
  writeFileAtomic(
    join(dest, "manifest.json"),
    JSON.stringify(manifest, null, 2) + "\n",
  );
  verifyBackup(dest);
  return {
    path: dest,
    files: files.length,
    local_only: true,
    disaster_recovery: false,
  };
}
export async function backup(repo, { dryRun = false } = {}) {
  return dryRun
    ? { dry_run: true, files: inventory(repo.root) }
    : repo.lock(() => snapshot(repo));
}
export function verifyBackup(path) {
  const root = resolve(path);
  const m = JSON.parse(readFileSync(safeChild(root, "manifest.json"), "utf8"));
  assert(m.format === 1 && Array.isArray(m.files), "Invalid backup manifest");
  const seen = new Set();
  for (const f of m.files) {
    assert(
      f && typeof f.path === "string" &&
        !/[\\:\0]/.test(f.path) &&
        f.path.split('/').every(part => part && part !== '.' && part !== '..' && !/[. ]$/.test(part)) &&
        DATA_PATHS.some((p) => ['data/hr-ops', 'reports/hr-ops'].includes(p)
          ? f.path.startsWith(p + "/")
          : f.path === p),
      "Unexpected or noncanonical backup path",
    );
    assert(!seen.has(f.path.toLowerCase()), "Duplicate backup path");
    seen.add(f.path.toLowerCase());
    const source = safeChild(root, f.path),
      bytes = readFileSync(source);
    assert(
      bytes.length === f.bytes && hash(bytes) === f.sha256,
      `Backup checksum mismatch: ${f.path}`,
    );
  }
  return m;
}
export function restore(path, destination, { dryRun = true } = {}) {
  const m = verifyBackup(path),
    root = resolve(destination);
  assert(!existsSync(root), "Restore requires a new, absent directory");
  // Check existing ancestors too, including junctions on Windows.
  let cursor = dirname(root);
  while (cursor !== dirname(cursor)) {
    if (existsSync(cursor))
      assert(!lstatSync(cursor).isSymbolicLink(), "Restore ancestor is a link");
    cursor = dirname(cursor);
  }
  if (dryRun)
    return { dry_run: true, destination: root, files: m.files.length };
  mkdirSync(root, { recursive: true });
  for (const f of m.files) {
    if (transientPath(f.path)) continue;
    const to = safeChild(root, f.path);
    mkdirSync(dirname(to), { recursive: true });
    copyFileSync(safeChild(resolve(path), f.path), to);
  }
  const restoredConfig = loadConfig(root), restoredRepo = new LocalRepository(root);
  const migration = migrationState(restoredRepo);
  const runDir = join(restoredRepo.dir,'research-runs');
  if(existsSync(runDir)) for(const file of readdirSync(runDir).filter(f=>f.endsWith('.json'))) researchBudget(restoredRepo,restoredConfig,file.slice(0,-5));
  const result = diagnostics(restoredRepo);
  assert(
    result.ok,
    "Restored data failed validation; retained isolated for diagnosis",
  );
  return {
    restored: true,
    destination: root,
    prospects: result.records.length,
    writable: migration?.status !== 'applying' && result.records.every(p => p.schema_version === VERSION),
    migration_status: migration?.status ?? null,
    migration_needed: result.records.filter(p => p.schema_version < VERSION).map(p => p.id),
    operating_root_changed: false,
  };
}

export async function migrate(
  repo,
  c,
  { dryRun = true, now = new Date() } = {},
) {
  const perform = async () => {
    const records = repo.list();
    const journal = join(repo.dir, "migration-v2.json");
    const interrupted = migrationState(repo);
    if (interrupted?.status === 'applying') verifyBackup(interrupted.backup);
    const pending = records.filter((p) => p.schema_version < VERSION);
    if (interrupted?.status === 'applying') {
      assert(interrupted.ids.every(id => records.some(p => p.id === id)), 'Interrupted migration record missing; reconcile against the original backup');
      assert(pending.every(p => interrupted.ids.includes(p.id)), 'Unexpected pending record outside the interrupted migration');
    }
    const staged = pending.map((original) => {
      const p = structuredClone(original);
      p.schema_version = VERSION;
      for (const field of FIELDS)
        p.facts[field] ??= { value: null, confidence: "unknown", evidence: [] };
      for (const o of p.openings)
        o.eligibility ??= { status: "unknown", evidence: [] };
      for (const d of p.drafts) {
        d.stale = true;
        d.ready = false;
      }
      const decision = qualify(p, c, now);
      const { history: oldHistory, ...before } = original;
      p.revision++;
      p.updated_at = now.toISOString();
      const { history, ...after } = structuredClone(p);
      p.history.push({
        id: hash(`${p.id}:${p.revision}`).slice(0, 16),
        at: now.toISOString(),
        action: "migrate-v2",
        from: original.status,
        to: p.status,
        reason:
          "Explicit schema upgrade; unknown eligibility and stale drafts require research",
        evidence: [],
        authorization: null,
        before,
        after,
        decision: decision.decision,
      });
      validateProspect(p, now);
      return p;
    });
    if (!dryRun && !staged.length && interrupted?.status === "applying")
      writeFileAtomic(
        journal,
        JSON.stringify({ ...interrupted, status: "complete" }, null, 2),
      );
    if (dryRun || !staged.length)
      return {
        dry_run: dryRun,
        pending: staged.map((p) => ({
          id: p.id,
          revision: p.revision,
          tier: p.score.tier,
          reasons: ["Absent opening eligibility becomes unknown", "Existing draft readiness invalidated", ...p.score.gaps],
        })),
        unchanged: !staged.length,
      };
    const saved =
      interrupted?.status === "applying"
        ? { path: interrupted.backup }
        : await snapshot(repo, "pre-migration");
    writeFileAtomic(
      journal,
      JSON.stringify(
        {
          status: "applying",
          backup: saved.path,
          ids: interrupted?.status === 'applying' ? interrupted.ids : staged.map((p) => p.id),
        },
        null,
        2,
      ),
    );
    for (const p of staged)
      writeFileAtomic(
        join(repo.records, p.id + ".json"),
        JSON.stringify(p, null, 2) + "\n",
      );
    writeFileAtomic(
      journal,
      JSON.stringify(
        {
          status: "complete",
          backup: saved.path,
          ids: interrupted?.status === 'applying' ? interrupted.ids : staged.map((p) => p.id),
        },
        null,
        2,
      ),
    );
    return { migrated: staged.length, backup: saved.path };
  };
  return dryRun ? perform() : repo.lock(perform);
}

export function operatingReport(repo, c, now = new Date()) {
  const records = repo.list(),
    tiers = {},
    reasons = {},
    sources = {},
    outcomes = {};
  let stale = 0;
  for (const p of records) {
    const score = scoreProspect(p, c, now);
    tiers[score.tier] = (tiers[score.tier] ?? 0) + 1;
    for (const reason of score.gaps)
      reasons[reason] = (reasons[reason] ?? 0) + 1;
    if (p.openings.some((o) => !score.opening_ids.includes(o.id))) stale++;
    const source = p.discovery_source ?? p.collection?.board ?? "unattributed";
    sources[source] ??= { prospects: 0, qualified: 0, provisional: 0 };
    sources[source].prospects++;
    if (score.tier === "QUALIFIED") sources[source].qualified++;
    if (score.tier === "PROVISIONAL") sources[source].provisional++;
    for (const kind of new Set(p.interactions.map((e) => e.kind)))
      outcomes[kind] = (outcomes[kind] ?? 0) + 1;
  }
  const runDir = join(repo.dir, "research-runs");
  const runs = existsSync(runDir)
    ? readdirSync(runDir)
        .filter((f) => f.endsWith(".json"))
        .map((f) => {
          const r = researchBudget(repo, c, f.slice(0, -5));
          return {
            run: r.run,
            status: r.status ?? "active",
            queries: r.attempts.filter((a) => a.kind === "query").length,
            page_attempts: r.attempts.filter((a) => a.kind === "page").length,
            unique_prospects: (r.prospect_ids ?? []).length,
            captures: (r.captures ?? []).length,
          };
        })
    : [];
  return {
    research_effort: runs,
    effort_note:
      "Attempts include failures. Native tools require operator reservations; elapsed time and monetary cost are not measured.",
    as_of: now.toISOString(),
    prospects: records.length,
    tiers,
    research_gaps: reasons,
    records_with_noncurrent_openings: stale,
    sources,
    outcomes_by_prospect: outcomes,
    conversion_probability: null,
  };
}
export function exposureReport(repo) {
  const records = repo.list();
  return {
    prospects: records.length,
    contacts: records.reduce((s, p) => s + p.contacts.length, 0),
    historical_snapshots: records.reduce(
      (s, p) =>
        s +
        p.history.reduce(
          (n, h) => n + Number(!!h.before) + Number(!!h.after),
          0,
        ),
      0,
    ),
    files: inventory(repo.root).map((f) => ({ path: f.path, bytes: f.bytes })),
    deletes_nothing: true,
    retained_copies: [
      "history snapshots",
      "captures",
      "reports",
      "exports",
      "backups",
    ],
    procedure:
      "Review all copies and suppression needs with the data owner before deletion; no automatic purge is implemented.",
  };
}
