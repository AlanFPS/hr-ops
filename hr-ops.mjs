#!/usr/bin/env node
import * as yaml from "js-yaml";
import {
  diagnostics,
  buildInfo,
  effectiveConfig,
  backup,
  restore,
  migrate,
  operatingReport,
  exposureReport,
} from "./lib/hr-ops/maintenance.mjs";
import { updateRun } from "./lib/hr-ops/research-run.mjs";
import { readFileSync, existsSync, mkdirSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { isMainModule } from "./lib/is-main-module.mjs";
import { requireRuntime } from "./lib/hr-ops/client.mjs";
import { saveExport } from "./lib/hr-ops/export-file.mjs";
import { writeFileAtomic } from "./tracker-utils.mjs";
import {
  LocalRepository,
  dataRoot,
  loadConfig,
  initialize,
  isInitialized,
} from "./lib/hr-ops/store.mjs";
import {
  assert,
  keys,
  domain,
  blankProspect,
  rankedContacts,
  localDate,
  scoreProspect,
  fresh,
} from "./lib/hr-ops/model.mjs";
import {
  research,
  requalify,
  researchTasks,
  outreachBrief,
  saveDraft,
  recordInteraction,
  dueFollowups,
  dossier,
  draftCurrent,
} from "./lib/hr-ops/operations.mjs";
import { discoverSources, discoveryQueries } from "./lib/hr-ops/discovery.mjs";
import {
  effectiveSources,
  inspectSources,
  sourceCatalog,
} from "./lib/hr-ops/sources.mjs";
import {
  researchBudget,
  reserveResearch,
  captureSource,
} from "./lib/hr-ops/research-run.mjs";

const HELP = `HR-Ops - local recruiting client operations (draft-only)
Usage: node hr-ops.mjs <command> [company-or-id] [options]
  init [--input firm-config.json]       Seed user configuration; preserve existing setup
  doctor [--recovery]                  Check all records; recovery returns labelled partial data
  config                              Effective HR settings with origins
  build                               Runtime, schema, revision and dirty state
  backup [--dry-run]                   Local consistent data snapshot
  restore BACKUP --destination DIR [--apply]  Verify and preview; apply only into absent DIR
  migrate [--apply]                    Preview schema upgrade; apply creates backup
  report                              Research/source/outcome totals
  retention                           Read-only exposure inventory
  run --run ID --action inspect|complete|resume
  sources [--starter]                  Inspect configured/starter research sources
  discover [--starter] [--run ID] [--input prospects.json] [--icp both|agency|startup] [--limit 10]
  budget --run ID [--input attempt.json]  Inspect/reserve search or page budget
  capture --run ID --input source.json   Budgeted public GET with retrieval timestamp
  research <company> [--input research.json --revision N]
  qualify <company>                   Deterministic evidence-based evaluation
  contacts <company>                  Ranked, verified contacts
  outreach [company | --top 3] [--input draft.json --revision N]
  pipeline [--icp agency|startup]      Current pipeline and next research gaps
  status <company> [--markdown]        Full dossier, history and evidence
  followups [--due today|YYYY-MM-DD]   Due contacts; never records drafts as sent
  record <company> --input event.json --revision N
  export [--format json|csv|markdown] [--output local/exports/pipeline.json]
Options: --json (default), --summary, --dry-run, --help. --input - reads stdin.
research/outreach without input return tasks/briefs for your agent, not completed research/drafts.
No send, purchase, terms-acceptance or external CRM write capability exists.
See docs/HR_OPS.md for payloads and the shared skill for complete agent workflows.`;
function parse(args) {
  const options = {},
    pos = [];
  const flags = [
    "json",
    "summary",
    "dry-run",
    "markdown",
    "help",
    "starter",
    "apply",
    "recovery",
    "gaps",
    "stale",
    "current-drafts",
    "catalog",
  ];
  const values = [
    "input",
    "revision",
    "top",
    "due",
    "format",
    "icp",
    "limit",
    "run",
    "output",
    "action",
    "tier",
    "destination",
  ];
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (!a.startsWith("--")) {
      pos.push(a);
      continue;
    }
    const key = a.slice(2);
    assert(flags.includes(key) || values.includes(key), `Unknown option ${a}`);
    assert(options[key] === undefined, `Duplicate ${a}`);
    if (flags.includes(key)) options[key] = true;
    else {
      assert(
        args[i + 1] && !args[i + 1].startsWith("--"),
        `Missing value for ${a}`,
      );
      options[key] = args[++i];
    }
  }
  assert(pos.length <= 2, "Quote company names containing spaces");
  return { command: pos[0] ?? "help", selector: pos[1], options };
}
function integer(value, label) {
  assert(
    /^\d+$/.test(String(value)),
    `${label} requires a nonnegative integer`,
  );
  const n = Number(value);
  assert(Number.isSafeInteger(n), `Invalid ${label}`);
  return n;
}
function input(path) {
  let decoded;
  try { decoded = new TextDecoder('utf-8', {fatal:true,ignoreBOM:true}).decode(readFileSync(path === '-' ? 0 : path)); }
  catch(error) { throw new Error(`Input must be readable UTF-8 JSON: ${error.message}`); }
  return JSON.parse(decoded.replace(/^\uFEFF/, ''));
}
function summary(result) {
  const rows = Array.isArray(result) ? result : (result.prospects ?? null);
  if (rows)
    return (
      rows
        .map(
          (p) =>
            `${p.id ?? ""} | ${p.name ?? p.company ?? ""} | ${p.status ?? ""} | ${p.score?.total ?? ""}${p.due || p.next_followup ? ` | ${p.due ?? p.next_followup}` : ""}`,
        )
        .join("\n") || "No matching records."
    );
  return JSON.stringify(result, null, 2);
}
async function publish(repo, id) {
  return repo.lock(() => {
    const current = repo.get(id);
    const dir = join(repo.root, "reports/hr-ops");
    mkdirSync(dir, { recursive: true });
    writeFileAtomic(
      join(dir, `${id}.md`),
      dossier(current, loadConfig(repo.root)),
    );
  });
}
export async function main(args = process.argv.slice(2)) {
  const { command, selector, options: o } = parse(args);
  assert(
    !o.output || (command === "export" && !o.summary && !o["dry-run"]),
    "--output requires export without --summary or --dry-run",
  );
  if (command === "help" || o.help) {
    console.log(HELP);
    return;
  }
  const root = dataRoot(),
    repo = new LocalRepository(root);
  const c = loadConfig(root);
  const dryRun = !!o["dry-run"];
  const now = new Date();
  let result, exportRecordCount;
  const needSelector = () =>
    assert(selector, "Company or prospect ID required");
  const mutationOpts = () => ({
    dryRun,
    now,
    expectedRevision: integer(o.revision, "--revision"),
  });
  if (command === "build") result = buildInfo();
  else if (command === "config")
    result = effectiveConfig(
      c,
      existsSync(join(root, "config/profile.yml"))
        ? (yaml.load(readFileSync(join(root, "config/profile.yml"), "utf8"))
            ?.hr_ops ?? {})
        : {},
    );
  else if (command === "backup") result = await backup(repo, { dryRun });
  else if (command === "restore") {
    needSelector();
    assert(o.destination, "--destination required");
    result = restore(selector, o.destination, { dryRun: !o.apply || dryRun });
  } else if (command === "migrate")
    result = await migrate(repo, c, { dryRun: !o.apply || dryRun, now });
  else if (command === "report") result = operatingReport(repo, c, now);
  else if (command === "retention") result = exposureReport(repo);
  else if (command === "run")
    result = await updateRun(
      repo,
      c,
      o.run,
      { action: o.action ?? "inspect" },
      { dryRun },
    );
  else if (command === "init")
    result = await initialize(root, o.input ? input(o.input) : {}, { dryRun });
  else if (command === "doctor") {
    const diagnostic = diagnostics(repo);
    const records = diagnostic.records;
    const sourceErrors = inspectSources(c, { now }).diagnostics;
    const ledgerDir = join(repo.dir, "research-runs");
    const researchRuns = existsSync(ledgerDir)
      ? readdirSync(ledgerDir)
          .filter((f) => f.endsWith(".json"))
          .map((f) => researchBudget(repo, c, f.slice(0, -5)))
      : [];
    result = {
      ok:
        existsSync(join(root, "config/profile.yml")) &&
        records.every(
          (p) => Array.isArray(p.history) && Array.isArray(p.evidence),
        ),
      root,
      build: buildInfo(),
      errors: diagnostic.errors,
      partial: diagnostic.partial,
      ...(o.recovery ? { healthy_records: records } : {}),
      migration_needed: records
        .filter((p) => p.schema_version < 2)
        .map((p) => p.id),
      prospects: records.length,
      research_runs: researchRuns.length,
      source_errors: sourceErrors,
      initialized: isInitialized(root),
      missing_firm_fields: ["name", "sender_name", "email"].filter(
        (k) => !c.firm[k],
      ),
      send_enabled: false,
    };
    if (!result.initialized || sourceErrors.length || !diagnostic.ok)
      result.ok = false;
    if (!result.ok) process.exitCode = 1;
  } else if (command === "sources") {
    result = o.catalog
      ? sourceCatalog()
      : effectiveSources(c, {
          starter: o.starter || c.discovery.starter_sources,
          now,
        });
  } else if (command === "budget") {
    result = o.input
      ? await reserveResearch(repo, c, o.run, input(o.input), { dryRun, now })
      : researchBudget(repo, c, o.run);
  } else if (command === "capture") {
    assert(o.input, "--input required");
    result = await captureSource(repo, c, o.run, input(o.input), { dryRun });
  } else if (command === "discover") {
    if (o.run)
      assert(
        researchBudget(repo, c, o.run).status !== "complete",
        "Completed run must be explicitly resumed",
      );
    if (o.input) {
      const icp = o.icp ?? "both",
        queries = discoveryQueries(icp, c);
      const limit = o.limit
        ? integer(o.limit, "--limit")
        : c.discovery.max_candidates;
      assert(
        limit > 0 && limit <= c.discovery.max_candidates,
        "Limit outside configured candidate budget",
      );
      const payload = input(o.input);
      keys(payload, ["prospects"], "discovery input");
      assert(
        Array.isArray(payload.prospects) &&
          payload.prospects.length <= c.discovery.max_candidates,
        "Invalid candidate list or budget exceeded",
      );
      payload.prospects.forEach((p) => blankProspect(p, now));
      const rows = [],
        seen = new Set();
      for (const p of payload.prospects) {
        if ((icp !== "both" && p.icp !== icp) || seen.has(domain(p.website)))
          continue;
        if (rows.length >= limit) break;
        const r = await repo.discover(p, { dryRun, now });
        seen.add(domain(p.website));
        if (rows.some((row) => row.id === r.prospect.id)) continue;
        rows.push({ ...r.prospect, created: r.created });
      }
      result = {
        prospects: rows,
        needs_agent_research: true,
        search_queries: queries,
      };
    } else
      result = await discoverSources(repo, c, {
        icp: o.icp ?? "both",
        limit: o.limit ? integer(o.limit, "--limit") : c.discovery.limit,
        dryRun,
        now,
        starter: o.starter || c.discovery.starter_sources,
        run: o.run,
      });
  } else if (command === "pipeline") {
    if (o.icp) assert(["agency", "startup"].includes(o.icp), "Invalid ICP");
    result = repo
      .list()
      .filter((p) => !o.icp || p.icp === o.icp)
      .map((p) => ({
        id: p.id,
        revision: p.revision,
        name: p.name,
        icp: p.icp,
        status: p.status,
        suppressed: p.suppressed,
        hold: p.hold,
        score: scoreProspect(p, c, now),
        next_followup: p.next_followup,
        current_drafts: p.drafts
          .filter((d) => d.ready && draftCurrent(d, p, c, now))
          .map((d) => d.id),
        stale:
          researchTasks(p, c, now).stale_fields.length > 0 ||
          p.openings.some((o) => o.reconciliation_needed || (o.status === 'open' && (!fresh(o.verified_at,c.freshness.openings,now) || o.evidence.some(id=>!fresh(p.evidence.find(e=>e.id===id).observed_at,c.freshness.openings,now))))) ||
          rankedContacts(p,c,now).some(contact=>!contact.current),
      }))
      .filter(
        (p) =>
          (!o.tier || p.score.tier === o.tier) &&
          (!o.gaps || p.score.gaps.length) &&
          (!o.stale || p.stale) &&
          (!o["current-drafts"] || p.current_drafts.length),
      )
      .sort(
        (a, b) => b.score.total - a.score.total || a.name.localeCompare(b.name),
      );
  } else if (command === "status") {
    needSelector();
    const p = repo.get(selector);
    result = o.markdown
      ? dossier(p, c, now)
      : { ...p, current_score: scoreProspect(p, c, now) };
  } else if (command === "research") {
    needSelector();
    result = o.input
      ? await repo.update(
          selector,
          "research",
          (p) => research(p, input(o.input), c, now),
          mutationOpts(),
        )
      : researchTasks(repo.get(selector), c, now);
  } else if (command === "qualify") {
    needSelector();
    result = await repo.update(
      selector,
      "qualify",
      (p) => requalify(p, c, now),
      {
        dryRun,
        now,
      },
    );
  } else if (command === "contacts") {
    needSelector();
    result = rankedContacts(repo.get(selector), c, now);
  } else if (command === "outreach") {
    if (o.input) {
      needSelector();
      result = await repo.update(
        selector,
        "draft",
        (p) => saveDraft(p, input(o.input), c, now),
        mutationOpts(),
      );
    } else {
      let prospects;
      if (o.top) {
        assert(!selector, "Use company or --top, not both");
        const n = integer(o.top, "--top");
        assert(n > 0 && n <= 50, "--top must be 1..50");
        prospects = repo
          .list()
          .filter((p) => !outreachBrief(p, c, now).blocked)
          .sort(
            (a, b) =>
              scoreProspect(b, c, now).total - scoreProspect(a, c, now).total ||
              a.name.localeCompare(b.name),
          )
          .slice(0, n);
      } else {
        needSelector();
        prospects = [repo.get(selector)];
      }
      result = prospects.map((p) => outreachBrief(p, c, now));
    }
  } else if (command === "followups")
    result = dueFollowups(
      repo.list(),
      c,
      o.due && o.due !== "today" ? o.due : localDate(now, c.timezone),
    );
  else if (command === "record") {
    needSelector();
    assert(o.input, "--input required");
    const event = input(o.input);
    result = await repo.update(
      selector,
      "record-" + event.kind,
      (p) => {
        if (event.kind === "alias") {
          const target = new URL(event.target).hostname.replace(/^www\./, "");
          assert(
            !repo
              .list()
              .some(
                (other) => other.id !== p.id && other.domains.includes(target),
              ),
            "Alias belongs to another prospect; manual reviewed merge required",
          );
        }
        return recordInteraction(p, event, c, now);
      },
      mutationOpts(),
    );
  } else if (command === "export") {
    const recovery = o.recovery ? diagnostics(repo) : null;
    const all = recovery ? recovery.records : repo.list();
    exportRecordCount = all.length;
    const format = o.format ?? "json";
    assert(!o.recovery || format === "json", "Recovery export requires JSON to preserve partial-result diagnostics");
    assert(
      ["json", "csv", "markdown"].includes(format),
      "Unsupported export format",
    );
    const csv = (v) =>
      `"${String(v ?? "")
        .replace(/^[=+@-]/, "'$&")
        .replaceAll('"', '""')}"`;
    result =
      format === "markdown"
        ? all.map((p) => dossier(p, c, now)).join("\n---\n")
        : format === "csv"
          ? [
              "id,company,website,icp,status,score,suppressed,hold",
              ...all.map((p) =>
                [
                  p.id,
                  p.name,
                  p.website,
                  p.icp,
                  p.status,
                  scoreProspect(p, c, now).total,
                  p.suppressed,
                  p.hold,
                ]
                  .map(csv)
                  .join(","),
              ),
            ].join("\n")
          : recovery
            ? { ...recovery, partial: true, recovery_mode: true }
            : all;
  } else
    throw new Error(
      `Unsupported command ${command}. No external action is available. Use --help.`,
    );
  if (command === "discover" && o.run && !dryRun)
    await updateRun(repo, c, o.run, {
      action: "link",
      prospects: (result.prospects ?? []).map((p) => p.id),
    });
  if (result?.prospect && !dryRun && !result.unchanged) {
    try {
      await publish(repo, result.prospect.id);
    } catch (error) {
      result.report_warning = `Canonical record saved; derived report failed: ${error.message}`;
    }
  }
  const serialized =
    typeof result === "string"
      ? result
      : o.summary
        ? summary(result)
        : JSON.stringify(result, null, 2);
  if (o.output) {
    assert(
      command === "export" && !o.summary && !dryRun,
      "--output requires export without --summary or --dry-run",
    );
    const path = saveExport(root, o.output, serialized + "\n");
    console.log(
      JSON.stringify({
        saved: path,
        records: exportRecordCount,
        node: process.version,
        executable: process.execPath,
      }),
    );
  } else console.log(serialized);
}
if (isMainModule(import.meta.url))
  Promise.resolve()
    .then(() => {
      requireRuntime();
      return main();
    })
    .catch((error) => {
      console.error(JSON.stringify({ ok: false, error: error.message }));
      process.exitCode = 1;
    });
