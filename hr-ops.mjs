#!/usr/bin/env node
import * as yaml from "js-yaml";
import {
  diagnostics,
  buildInfo,
  effectiveConfig,
  backup,
  restore,
  migrate,
  migrateInbox,
  operatingReport,
  exposureReport,
} from "./lib/hr-ops/maintenance.mjs";
import { updateRun } from "./lib/hr-ops/research-run.mjs";
import { readFileSync, existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { isMainModule } from "./lib/is-main-module.mjs";
import { requireRuntime } from "./lib/hr-ops/client.mjs";
import { inboxSummary } from './lib/hr-ops/inbox-state.mjs';
import {createWorkspace,configureWorkspace,readWorkspace} from './lib/hr-ops/workspace.mjs';
import {reportStatus,refreshReports} from './lib/hr-ops/reports.mjs';
import {discoveryExclusions,rankedSources} from './lib/hr-ops/discovery-context.mjs';
import {bindCandidateOrigin} from './lib/hr-ops/candidate-origins.mjs';
import {candidateKey} from './lib/hr-ops/run-scope.mjs';
import { saveExport } from "./lib/hr-ops/export-file.mjs";
import { writeFileAtomic } from "./tracker-utils.mjs";
import {
  LocalRepository,
  dataRoot,
  dataRootInfo,
  loadConfig,
  initialize,
  isInitialized,
  migrationState,
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
import {setupGuide,commandMenu} from './lib/hr-ops/entrypoints.mjs';
import {discoveryPlan} from './lib/hr-ops/discovery-plan.mjs';
import {discoveryFeeds,collectDiscoveryFeed} from './lib/hr-ops/discovery-feeds.mjs';
import {inventoryView,importInventory,reviewInventory} from './lib/hr-ops/inventory.mjs';
import {inventoryIdentityPacket,confirmInventoryIdentity} from './lib/hr-ops/inventory-identity.mjs';
import {PROJECT_ROOT} from './lib/hr-ops/store.mjs';
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
  menu                                HR command groups and natural-language entrypoints
  setup [--destination ABSOLUTE_DIR --input setup.json]  Guide or clean HR workspace creation
  init [--input firm-config.json]       Seed user configuration; preserve existing setup
  workspace create --destination ABSOLUTE_DIR --input setup.json
  workspace inspect|configure [--input identity.json]  Explicit workspace/account identity
  doctor [--recovery]                  Check all records; recovery returns labelled partial data
  config                              Effective HR settings with origins
  build                               Runtime, schema, revision and dirty state
  backup [--dry-run]                   Local consistent data snapshot
  restore BACKUP --destination DIR [--apply]  Verify and preview; apply only into absent DIR
  migrate [--apply]                    Preview schema upgrade; apply creates backup
  inbox-migrate [--apply]              Preview inbox upgrade; preserve reviews and back up
  report                              Research/source/outcome totals
  reports refresh [--dry-run]          Regenerate derived dossiers without record changes
  retention                           Read-only exposure inventory
  run --run ID --action inspect|review|complete|resume|configure|outcome|admit [--input payload.json]
  sources [--starter]                  Inspect configured/starter research sources
  inventory [list|queue] [--icp startup|agency|unknown] [--limit 100]
  inventory queue --scope new|refresh|all  New leads or existing prospect refresh briefs
  inventory import|review --input FILE --revision N [--dry-run]  Unqualified lead intake/review
  inventory assist --input FILE       Read-only identity, cached evidence and ATS-link review packet
  inventory confirm --input FILE --revision N [--dry-run]  Capture-backed company identity review
  discover [--starter] [--run ID] [--input prospects.json] [--icp both|agency|startup] [--limit 10]
  discover --plan [--icp both|agency|startup]  Reusable sources, seeds, controls and exclusions
  discover --feed remotive|hackernews|remoteok|himalayas|speedrun|by-recruiting|bedrock-talent --run ID [--refresh]  Budgeted inventory leads
  budget --run ID [--input attempt.json]  Inspect/reserve search or page budget
  capture --run ID --input source.json   Budgeted public GET with retrieval timestamp
  research <company> [--input research.json --revision N]
  qualify <company>                   Deterministic evidence-based evaluation
  contacts <company>                  Ranked, verified contacts
  outreach [company | --top 3] [--input draft.json --revision N]
  pipeline [--icp agency|startup]      Current pipeline and next research gaps
  status <company> [--markdown]        Full dossier, history and evidence
  followups [--due today|YYYY-MM-DD] [--with-inbox]   Due contacts and optional inbox coverage
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
    "with-inbox",
    "new-only",
    "plan",
    "refresh",
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
    "feed",
    "scope",
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
function completionInput(value) {
  keys(value,['reason','review'],'run completion');
  return value;
}
function input(path) {
  let decoded;
  try { decoded = new TextDecoder('utf-8', {fatal:true,ignoreBOM:true}).decode(readFileSync(path === '-' ? 0 : path)); }
  catch(error) { throw new Error(`Input must be readable UTF-8 JSON: ${error.message}`); }
  return JSON.parse(decoded.replace(/^\uFEFF/, ''));
}
function summary(result) {
  if (Array.isArray(result.companies)) return result.companies.map(c =>
    `${c.id} | ${c.name} | ${c.icp} | ${c.identity_status} | ${c.state} | ${c.queue_blocker ?? c.queue_task}${c.refresh ? ' | '+c.refresh.reasons.join(', ') : ''}`
  ).join('\n') || 'No matching inventory tasks.';
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
export async function main(args = process.argv.slice(2)) {
  const { command, selector, options: o } = parse(args);
  assert(!o.plan||command==='discover','--plan requires discover');
  assert(!o.scope||(command==='inventory'&&selector==='queue'),'--scope requires inventory queue');
  assert(!o.feed||command==='discover','--feed requires discover');
  assert(!o.refresh||(command==='discover'&&o.feed),'--refresh requires discover --feed');
  assert(!(o.plan&&(o.feed||o.input)),'--plan cannot be combined with --feed or --input');
  assert(!(o.feed&&(o.starter||o.input)),'--feed cannot be combined with --starter or --input');
  assert(!(selector&&(o.plan||o.feed)),'Discovery plans and feeds do not accept a company selector');
  assert(
    !o.output || (command === "export" && !o.summary && !o["dry-run"]),
    "--output requires export without --summary or --dry-run",
  );
  if (command === "help" || o.help) {
    console.log(HELP);
    return;
  }
  if(['setup','menu'].includes(command)){
    const allowed=command==='setup'?['input','destination','dry-run','json','summary']:['json','summary','dry-run'];
    for(const key of Object.keys(o))assert(allowed.includes(key),`--${key} is not supported by ${command}`);
  }
  if(command==='inventory'){
    for(const key of Object.keys(o))assert(['json','summary','dry-run','icp','limit','input','revision','scope'].includes(key),`--${key} is not supported by inventory`);
    assert(['list','queue','import','review','assist','confirm'].includes(selector??'list'),'Use inventory list, queue, import, review, assist or confirm');
    const usesInput=['import','review','confirm','assist'].includes(selector);
    assert(usesInput?!!o.input&&!o.icp&&!o.limit:!o.input&&!o.revision,'Inventory import/review/assist/confirm require --input; list/queue use filters only');
    if(selector==='assist')assert(!o.revision&&!o['dry-run'],'Identity assistance is read-only and does not accept --revision or --dry-run');
  }
  const root = dataRoot(),
    repo = new LocalRepository(root);
  const c = ['setup','menu'].includes(command)||(command==='workspace'&&selector==='create')?null:loadConfig(root);
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
  if(command==='menu'){assert(!selector,'menu has no selector');result=commandMenu(PROJECT_ROOT);}
  else if(command==='setup'){
    assert(!selector,'setup uses --destination and --input, not a selector');
    if(o.input||o.destination){assert(o.input&&o.destination,'--input and --destination required');result={...await createWorkspace(o.destination,input(o.input),{dryRun}),code_root:PROJECT_ROOT,selection_instruction:'Set HR_OPS_ROOT to root explicitly; run the AI client in code_root. Creation does not select the workspace.',next_command:['node','hr-ops.mjs','doctor']};}
    else result=setupGuide(PROJECT_ROOT);
  }
  else if(command==='workspace'){
    if(selector==='create'){assert(o.input&&o.destination,'--input and --destination required');result=await createWorkspace(o.destination,input(o.input),{dryRun});}
    else if(selector==='configure'){assert(o.input,'--input required');result=await configureWorkspace(repo,input(o.input),{dryRun});}
    else {assert(selector==='inspect','Use workspace create, inspect or configure');result={...dataRootInfo(),workspace:readWorkspace(repo),selected:true};}
  }
  else if(command==='inventory'){
    if(selector==='import'||selector==='review')result=await (selector==='import'?importInventory:reviewInventory)(repo,c,input(o.input),mutationOpts());
    else if(selector==='assist')result=inventoryIdentityPacket(repo,c,input(o.input),{now});
    else if(selector==='confirm')result=await confirmInventoryIdentity(repo,c,input(o.input),mutationOpts());
    else result=inventoryView(repo,c,{now,queue:selector==='queue',scope:o.scope??'new',icp:o.icp??'both',limit:o.limit?integer(o.limit,'--limit'):1000});
  }
  else if (command === "build") result = buildInfo();
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
  else if (command === "inbox-migrate") result = await migrateInbox(repo,{dryRun:!o.apply||dryRun});
  else if (command === "report") result = operatingReport(repo, c, now);
  else if (command === "reports") {assert(selector==='refresh','Use reports refresh');result=await refreshReports(repo,c,{now,dryRun});}
  else if (command === "retention") result = exposureReport(repo);
  else if (command === "run")
    result = await updateRun(
      repo,
      c,
      o.run,
      { action: o.action ?? "inspect", ...(o.input ? (o.action==='outcome'?{outcome:input(o.input)}:o.action==='admit'?{candidate:input(o.input)}:o.action==='complete'?completionInput(input(o.input)):{scope: input(o.input)}) : {}) },
      { dryRun },
    );
  else if (command === "init")
    result = await initialize(root, o.input ? input(o.input) : {}, { dryRun });
  else if (command === "doctor") {
    const diagnostic = diagnostics(repo);
    const records = diagnostic.records;
    const sourceErrors = inspectSources(c, { now }).diagnostics;
    const errors = [...diagnostic.errors];
    try {
      if (migrationState(repo)?.status === 'applying')
        errors.push({file: 'migration-v2.json', error: 'Interrupted migration; resume migrate before writing'});
    } catch (error) {
      errors.push({file: 'migration-v2.json', error: error.message});
    }
    result = {
      ok:
        existsSync(join(root, "config/profile.yml")) &&
        records.every(
          (p) => Array.isArray(p.history) && Array.isArray(p.evidence),
        ),
      root,
      root_selection:dataRootInfo(),
      workspace:diagnostic.errors.some(e=>e.file==='workspace.json')?null:readWorkspace(repo),
      workspace_warning:existsSync(join(repo.dir,'workspace.json'))?null:'Workspace identity is unconfigured; browser operations require explicit configuration',
      build: buildInfo(),
      errors,
      partial: errors.length > 0,
      ...(o.recovery ? { healthy_records: records } : {}),
      migration_needed: records
        .filter((p) => p.schema_version < 2)
        .map((p) => p.id),
      prospects: records.length,
      research_runs: diagnostic.research_runs,
      source_errors: sourceErrors,
      initialized: isInitialized(root),
      missing_firm_fields: ["name", "sender_name", "email"].filter(
        (k) => !c.firm[k],
      ),
      send_enabled: false,
      reports:records.map(p=>reportStatus(repo,p,c,now)),
    };
    if (!result.initialized || sourceErrors.length || errors.length)
      result.ok = false;
    const account=!!result.workspace?.linkedin_profile_url;
    result.readiness={
      research:{state:result.ok?'ready':'invalid_state',missing_configuration:result.initialized?[]:['profile']},
      personal_profile_inbox:{state:!result.ok?'invalid_state':!account?'missing_configuration':'unvalidated',missing_configuration:account?[]:['workspace.linkedin_profile_url'],migration_needed:errors.some(e=>e.file==='inbox/state.json')?null:inboxSummary(repo).migration_needed,unvalidated_behavior:['Real-account business import remains a supervised setup check']},
      human_operated_sending:{state:!result.ok?'invalid_state':!account||!c.firm.sender_name?'missing_configuration':'unvalidated',missing_configuration:[...(!account?['workspace.linkedin_profile_url']:[]),...(!c.firm.sender_name?['firm.sender_name']:[])],unvalidated_behavior:['Exact-message approval and supervised account validation required for each send']},
      page_messaging:{state:'unsupported'},
    };
    if (!result.ok) process.exitCode = 1;
  } else if (command === "sources") {
    result = o.catalog
      ? (()=>{const catalog=sourceCatalog();return {...catalog,feeds:rankedSources(repo,c,discoveryFeeds(c),now),directories:rankedSources(repo,c,catalog.directories,now),
        recommended_sources:rankedSources(repo,c,effectiveSources(c,{starter:true,now}),now)};})()
      : rankedSources(repo,c,effectiveSources(c, {
          starter: o.starter || c.discovery.starter_sources,
          now,
        }),now);
  } else if (command === "budget") {
    result = o.input
      ? await reserveResearch(repo, c, o.run, input(o.input), { dryRun, now })
      : researchBudget(repo, c, o.run);
  } else if (command === "capture") {
    assert(o.input, "--input required");
    result = await captureSource(repo, c, o.run, input(o.input), { dryRun });
  } else if (command === "discover" && o.plan) {
    result=discoveryPlan(repo,c,{icp:o.icp??'both',now});
  } else if (command === "discover" && o.feed) {
    result=await collectDiscoveryFeed(repo,c,{id:o.feed,run:o.run,limit:o.limit?integer(o.limit,'--limit'):c.discovery.limit,icp:o.icp??'both',dryRun,refresh:!!o.refresh,now});
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
      const originLedger=o.run?researchBudget(repo,c,o.run):null;
      const existing=repo.list();
      payload.prospects=payload.prospects.map(p=>existing.some(old=>old.domains.includes(domain(p.website)))?p:bindCandidateOrigin(p,originLedger));
      payload.prospects.forEach((p) => blankProspect(p, now));
      const rows = [],
        seen = new Set();
      const exclusions=discoveryExclusions(repo);
      for (const p of payload.prospects) {
        if(exclusions.some(e=>e.domain===domain(p.website)&&(o['new-only']||e.reason==='catalog_control')))continue;
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
        exclusions,
        newly_discovered:rows.filter(p=>p.created).length,
        refreshed_existing:rows.filter(p=>!p.created).length,
        completion_note:'Identity import is not completed demand research.',
        provenance_gaps:rows.filter(p=>!p.discovery_source).map(p=>({id:p.id,reason:originLedger?.candidate_origins?.some(o=>candidateKey(o.name)===candidateKey(p.name))
          ? 'Origin recorded with no public discovery URL; inspect candidate_origins for the offline or unknown source explanation.'
          : 'Discovery origin not recorded. Supply discovery_source on new imports; do not infer it from later research.'})),
        candidate_origins:originLedger?.candidate_origins??[],
        admission_gaps:originLedger?rows.filter(p=>p.created).flatMap(p=>{
          const origin=originLedger.candidate_origins?.find(o=>candidateKey(o.name)===candidateKey(p.name));
          return !origin?[{id:p.id,reason:'No candidate origin recorded at admission'}]:origin.late?[{id:p.id,reason:'Origin recorded after candidate research began'}]:[];
        }):[],
      };
    } else
      result = await discoverSources(repo, c, {
        icp: o.icp ?? "both",
        limit: o.limit ? integer(o.limit, "--limit") : c.discovery.limit,
        dryRun,
        now,
        starter: o.starter || c.discovery.starter_sources,
        run: o.run,
        newOnly:!!o['new-only'],
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
  } else if (command === "followups") {
    result = dueFollowups(
      repo.list(),
      c,
      o.due && o.due !== "today" ? o.due : localDate(now, c.timezone),
    );
    if(o['with-inbox'])result={due:result,inbox:inboxSummary(repo)};
  } else if (command === "record") {
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
  if (command === "discover" && o.run && !dryRun && !o.plan && !o.feed)
    await updateRun(repo, c, o.run, {
      action: "link",
      prospects: (result.prospects ?? []).map((p) => p.id),
    });
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
