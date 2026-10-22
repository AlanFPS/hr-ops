import {
  readFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  realpathSync,
  lstatSync,
} from "node:fs";
import { resolve, join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import * as yaml from "js-yaml";
import { getCareerOpsRoot } from "../../path-resolver.mjs";
import { withPipelineLock } from "../../pipeline-lock.mjs";
import { writeFileAtomic } from "../../tracker-utils.mjs";
import {
  DEFAULTS,
  VERSION,
  assert,
  validateConfig,
  mergeConfig,
  blankProspect,
  domain,
  hash,
  canonical,
  keys,
  text,
} from "./model.mjs";
import { validateProspect } from "./validation.mjs";
import { readInbox } from './inbox-state.mjs';
import { readWorkspace } from './workspace.mjs';
import {publishDossier} from './reports.mjs';
import {readOnboarding} from './onboarding.mjs';

function snapshot(p) {
  const { history, ...state } = structuredClone(p);
  return state;
}

function uniqueDomains(records) {
  const seen = new Set();
  for (const p of records)
    for (const d of p.domains) {
      assert(
        !seen.has(d),
        `Domain alias ${d} belongs to multiple prospects; reviewed reconciliation required`,
      );
      seen.add(d);
    }
}

async function prepareUpdate(p, action, fn, now) {
  assert(
    p.schema_version === VERSION,
    "Migration required: run migrate --dry-run, then migrate --apply",
  );
  const before = structuredClone(p);
  const result = await fn(p);
  if (result?.noop) return { prospect: before, unchanged: true };
  assert(p.id === before.id, "Prospect identity cannot change during update");
  p.revision++;
  p.updated_at = now.toISOString();
  p.history.push({
    id: hash(`${p.id}:${p.revision}`).slice(0, 16),
    at: now.toISOString(),
    action,
    from: before.status,
    to: p.status,
    reason: result?.reason ?? action,
    evidence: result?.evidence ?? [],
    authorization: result?.authorization ?? null,
    before: snapshot(before),
    after: snapshot(p),
    ...(result?.decision ? { decision: structuredClone(result.decision) } : {}),
  });
  validateProspect(p, now);
  return { prospect: p };
}

export const PROJECT_ROOT = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../..",
);
export function migrationState(repo) {
  const path = join(repo.dir, "migration-v2.json");
  if (!existsSync(path)) return null;
  const state = JSON.parse(readFileSync(path, "utf8"));
  keys(state, ["status", "backup", "ids"], "migration journal");
  assert(["applying", "complete"].includes(state.status), "Invalid migration status");
  text(state.backup, "migration backup");
  assert(Array.isArray(state.ids) && state.ids.every(id => typeof id === 'string' && /^[a-f0-9]{16}$/.test(id)) && new Set(state.ids).size === state.ids.length, "Invalid migration IDs");
  return state;
}
export function dataRoot() {
  const env =
    process.env.HR_OPS_ROOT?.trim() || process.env.HR_OPS_DATA_DIR?.trim();
  if (env) return resolve(PROJECT_ROOT, env);
  const marker = join(PROJECT_ROOT, ".hr-ops-data");
  if (existsSync(marker))
    return resolve(PROJECT_ROOT, readFileSync(marker, "utf8").trim());
  return getCareerOpsRoot();
}
export function dataRootInfo(){
 const root=dataRoot();let origin='repository default';
 const hr=['HR_OPS_ROOT','HR_OPS_DATA_DIR'].find(k=>process.env[k]?.trim());
 const legacy=['CAREER_OPS_ROOT','CAREER_OPS_DATA_DIR'].find(k=>process.env[k]?.trim());
 if(hr)origin=hr;else if(existsSync(join(PROJECT_ROOT,'.hr-ops-data')))origin='.hr-ops-data';
 else if(legacy)origin=legacy;else if(existsSync(join(PROJECT_ROOT,'.career-ops-data'))&&readFileSync(join(PROJECT_ROOT,'.career-ops-data'),'utf8').trim())origin='.career-ops-data';
 return {root,origin,overrides_present:['HR_OPS_ROOT','HR_OPS_DATA_DIR','CAREER_OPS_ROOT','CAREER_OPS_DATA_DIR'].filter(k=>process.env[k]?.trim())};
}
export function loadConfig(root = dataRoot()) {
  const path = join(root, "config/profile.yml");
  let profile = {};
  try {
    profile = yaml.load(readFileSync(path, "utf8")) ?? {};
  } catch (e) {
    if (e.code !== "ENOENT") throw e;
  }
  assert(
    profile && typeof profile === "object" && !Array.isArray(profile),
    "Invalid profile YAML",
  );
  if (Object.hasOwn(profile, "hr_ops"))
    assert(
      profile.hr_ops &&
        typeof profile.hr_ops === "object" &&
        !Array.isArray(profile.hr_ops),
      "Invalid hr_ops configuration object",
    );
  return validateConfig(mergeConfig(DEFAULTS, profile.hr_ops ?? {}));
}
export function isInitialized(root = dataRoot()) {
  const path = join(root, "config/profile.yml");
  if (!existsSync(path)) return false;
  const profile = yaml.load(readFileSync(path, "utf8"));
  return (
    !!profile?.hr_ops &&
    typeof profile.hr_ops === "object" &&
    !Array.isArray(profile.hr_ops)
  );
}
export async function initialize(
  root = dataRoot(),
  input = {},
  { dryRun = false } = {},
) {
  const run = () => {
    const path = join(root, "config/profile.yml");
    let profile = {};
    if (existsSync(path)) profile = yaml.load(readFileSync(path, "utf8")) ?? {};
    assert(
      profile && typeof profile === "object" && !Array.isArray(profile),
      "Invalid profile",
    );
    if (Object.hasOwn(profile, "hr_ops")) {
      loadConfig(root);
      return {
        initialized: false,
        root,
        dry_run: dryRun,
        reason: "Existing HR-Ops configuration preserved",
      };
    }
    assert(
      input && typeof input === "object" && !Array.isArray(input),
      "Invalid HR configuration",
    );
    const c = validateConfig(mergeConfig(DEFAULTS, input));
    const old = existsSync(path) ? readFileSync(path, "utf8") : "";
    const merged = { ...profile, hr_ops: c };
    // Preserve ordinary block-YAML comments. Flow mappings and explicit document
    // endings require reserialization; validate the exact output before any write.
    let output =
      old.trimEnd() +
      "\n" +
      yaml.dump({ hr_ops: c }, { lineWidth: 110, noRefs: true });
    const equivalent = (value) =>
      JSON.stringify(canonical(value)) === JSON.stringify(canonical(merged));
    try {
      assert(
        equivalent(yaml.load(output)),
        "Profile append changed existing values",
      );
    } catch {
      const comments = old.split(/\r?\n/).filter((line) => /^\s*#/.test(line));
      output =
        (comments.length ? comments.join("\n") + "\n" : "") +
        yaml.dump(merged, { lineWidth: 110, noRefs: true });
    }
    assert(
      equivalent(yaml.load(output)),
      "Generated profile did not preserve existing values",
    );
    if (!dryRun) {
      mkdirSync(dirname(path), { recursive: true });
      writeFileAtomic(path, output);
    }
    return { initialized: true, root, dry_run: dryRun };
  };
  return dryRun ? run() : new LocalRepository(root).lock(run);
}
export class LocalRepository {
  constructor(root = dataRoot()) {
    this.root = resolve(root);
    this.dir = join(this.root, "data/hr-ops");
    this.records = join(this.dir, "prospects");
  }
  async lock(fn) {
    mkdirSync(this.records, { recursive: true });
    const canonical = realpathSync(this.dir);
    return withPipelineLock(join(canonical, "workspace"), fn, {
      timeoutMs: 30000,
    });
  }
  list() {
    if (!existsSync(this.records)) return [];
    const records = readdirSync(this.records)
      .filter((f) => f.endsWith(".json"))
      .map((f) => {
        try {
          assert(/^[a-f0-9]{16}\.json$/.test(f), "Invalid prospect filename");
          assert(!lstatSync(join(this.records, f)).isSymbolicLink(), "Prospect file cannot be a link");
          const p = JSON.parse(readFileSync(join(this.records, f), "utf8"));
          assert(p.id === f.slice(0, -5), "Mismatched prospect ID");
          return validateProspect(p);
        } catch (error) {
          throw new Error(`Corrupt prospect ${f}: ${error.message}`);
        }
      });
    uniqueDomains(records);
    return records;
  }
  get(selector) {
    const key = String(selector).toLowerCase();
    const matches = this.list().filter(
      (p) =>
        p.id === key || p.name.toLowerCase() === key || p.domains.includes(key),
    );
    assert(
      matches.length === 1,
      matches.length ? "Ambiguous prospect; use ID" : "Prospect not found",
    );
    return matches[0];
  }
  #save(p,now) {
    validateProspect(p);
    writeFileAtomic(
      join(this.records, `${p.id}.json`),
      JSON.stringify(p, null, 2) + "\n",
    );
    try{return publishDossier(this,p,loadConfig(this.root),now);}
    catch(error){return `Canonical record preserved; derived report failed: ${error.message}`;}
  }
  assertWritable() {
    assert(!readOnboarding(this)?.pending,'Interrupted onboarding application; resume onboarding apply before writing');
    readWorkspace(this);
    readInbox(this);
    const state = migrationState(this);
    if (state)
      assert(
        state.status === "complete",
        "Interrupted migration; resume migrate before writing",
      );
  }
  async discover(input, { dryRun = false, now = new Date(), prepare } = {}) {
    const candidate = blankProspect(input, now);
    const run = async () => {
      this.assertWritable();
      const records = this.list();
      const old = records.find((p) =>
        p.domains.includes(domain(input.website)),
      );
      if (old && !prepare) return { created: false, prospect: old };
      if (!old) {
        candidate.revision = 1;
        candidate.history.push({
          id: hash(candidate.id + now.toISOString()).slice(0, 16),
          at: now.toISOString(),
          action: "discover",
          from: null,
          to: "DISCOVERED",
          reason: "Verified discovery input",
          evidence: input.evidence.map((e) => e.id),
          after: snapshot(candidate),
        });
      }
      const prepared = prepare
        ? await prepareUpdate(
            old ?? candidate,
            "collect-openings",
            prepare,
            now,
          )
        : { prospect: candidate };
      const p = prepared.prospect;
      validateProspect(p, now);
      uniqueDomains([...records.filter((x) => x.id !== p.id), p]);
      // Discovery and collection commit together: no half-created prospect.
      const warning=!dryRun && (!old || !prepared.unchanged)?this.#save(p,now):null;
      return {
        ...prepared,
        ...(warning?{report_warning:warning}:{}),
        unchanged: !!old && !!prepared.unchanged,
        created: !old,
        dry_run: dryRun,
      };
    };
    return dryRun ? run() : this.lock(run);
  }
  async update(
    selector,
    action,
    fn,
    { expectedRevision, dryRun = false, now = new Date() } = {},
  ) {
    const run = async () => {
      this.assertWritable();
      const p = this.get(selector);
      if (expectedRevision !== undefined)
        assert(
          p.revision === expectedRevision,
          "Revision conflict; reload before retry",
        );
      const result = await prepareUpdate(p, action, fn, now);
      if (result.unchanged) return result;
      uniqueDomains([...this.list().filter((x) => x.id !== p.id), p]);
      const warning=!dryRun?this.#save(p,now):null;
      return { ...result, dry_run: dryRun,...(warning?{report_warning:warning}:{}) };
    };
    return dryRun ? run() : this.lock(run);
  }
}
