import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { writeFileAtomic } from "../../tracker-utils.mjs";
import greenhouse from "../../providers/greenhouse.mjs";
import ashby from "../../providers/ashby.mjs";
import lever from "../../providers/lever.mjs";
import { makeHttpCtx } from "../../providers/_http.mjs";
import { assert, hash, url, applyResearch,domain } from "./model.mjs";
import {discoveryExclusions,rankedSources} from './discovery-context.mjs';
import {failureCategory} from './research-outcomes.mjs';
import { qualify } from "./operations.mjs";
import { inspectSources, sourceCatalog } from "./sources.mjs";
import { reserveResearch, researchBudget, updateRun } from "./research-run.mjs";

const PROVIDERS = { greenhouse, ashby, lever };
export function discoveryQueries(icp = "both", config) {
  assert(["both", "agency", "startup"].includes(icp), "Invalid ICP");
  if (
    config &&
    ["agency", "startup"].some((k) => config.discovery.queries[k].length)
  )
    return ["agency", "startup"]
      .filter((k) => icp === "both" || k === icp)
      .flatMap((k) =>
        config.discovery.queries[k].length
          ? config.discovery.queries[k]
          : discoveryQueries(k),
      );
  return ["agency", "startup"]
    .filter((k) => icp === "both" || icp === k)
    .flatMap((k) => sourceCatalog().queries[k]);
}
export async function discoverSources(
  repo,
  c,
  {
    icp = "both",
    limit = c.discovery.limit,
    dryRun = false,
    now = new Date(),
    ctx = makeHttpCtx(),
    starter = c.discovery.starter_sources,
    run,
    newOnly=false,
  } = {},
) {
  discoveryQueries(icp, c);
  assert(
    Number.isInteger(limit) && limit > 0 && limit <= c.discovery.max_candidates,
    "Limit outside configured candidate budget",
  );
  const result = {
    created: 0,
    existing: 0,
    prospects: [],
    diagnostics: [],
    research_tasks: [],
    needs_agent_research: true,
    search_queries: discoveryQueries(icp, c),
    limits: { ...c.discovery, limit, starter_sources: starter },
    send_enabled: false,
    network_reads_allowed: !(dryRun && run),
    exclusions:discoveryExclusions(repo),
  };
  const inspected = inspectSources(c, { starter, now, icp });
  const diagnostics=inspected.diagnostics;
  const sources=rankedSources(repo,c,inspected.sources,now).filter(s=>!result.exclusions.some(e=>e.domain===domain(s.website)&&(newOnly||e.reason==='catalog_control')));
  result.diagnostics.push(...diagnostics);
  if (run) researchBudget(repo, c, run); // validate even a network-free preview
  if (icp === "both") sources.sort((a, b) => a.icp.localeCompare(b.icp));
  const agency = sources.filter((s) => s.icp === "agency"),
    startup = sources.filter((s) => s.icp === "startup");
  const balanced = [];
  while (agency.length || startup.length) {
    if (agency.length) balanced.push(agency.shift());
    if (startup.length) balanced.push(startup.shift());
  }
  for (const source of balanced.slice(0, limit)) {
    const collectionSequences=[];
    try {
      if (source.identity_stale || source.provider === "manual") {
        result.research_tasks.push({
          name: source.name,
          website: source.website,
          icp: source.icp,
          careers_url: source.careers_url,
          notes: source.notes ?? null,
          identity_evidence: source.identity_evidence,
          requires_identity_refresh: source.identity_stale,
        });
        result.diagnostics.push({
          company: source.name,
          status: source.identity_stale
            ? "identity-stale"
            : "agent-research-required",
        });
        continue;
      }
      if (dryRun && run) {
        result.research_tasks.push({
          name: source.name,
          website: source.website,
          icp: source.icp,
          provider: source.provider,
          careers_url: source.careers_url,
          requires_live_collection: true,
        });
        result.diagnostics.push({
          company: source.name,
          status: "preview",
          reason:
            "Budgeted previews make no network requests; run without --dry-run to collect and reserve attempts",
        });
        continue;
      }
      assert(
        PROVIDERS[source.provider],
        "Only built-in greenhouse/ashby/lever public readers are enabled",
      );
      assert(
        source.identity_evidence,
        "Company-to-board identity evidence required",
      );
      url(source.website);
      const entry = {
        name: source.name,
        careers_url: source.careers_url,
        api: source.api,
      };
      const budgetedCtx = run
        ? {
            ...ctx,
            fetchJson: async (target, options) => {
              const receipt=await reserveResearch(
                repo,
                c,
                run,
                { kind: "page", company: source.website, target,
                  attribution:{source_id:source.website,icp:source.icp},
                  ...(researchBudget(repo,c,run).scope ? {candidate_names:[source.name]} : {}) },
                { dryRun, now: new Date() },
              );
              if(!new URL(target).pathname.endsWith('/offices'))collectionSequences.push(receipt.reservation.sequence);
              let value;
              try{value=await ctx.fetchJson(target,options);}
              catch(error){await updateRun(repo,c,run,{action:'outcome',outcome:{sequence:receipt.reservation.sequence,category:failureCategory(error),prospect_ids:[],note:String(error.message).slice(0,2000)}});throw error;}
              await updateRun(repo,c,run,{action:'outcome',outcome:{sequence:receipt.reservation.sequence,category:'read_ok',prospect_ids:[],note:'Provider response received; collection completeness and semantic review are evaluated separately.'}});
              return value;
            },
          }
        : ctx;
      let payloadValid = false,
        paginationComplete = true, rawCount = null;
      const readCtx = {
        ...budgetedCtx,
        fetchJson: async (target, options) => {
          const payload = await budgetedCtx.fetchJson(target, options);
          if (!new URL(target).pathname.endsWith("/offices")) {
            const list = source.provider === "lever" ? payload : payload?.jobs;
            assert(
              Array.isArray(list),
              "Invalid board payload; completeness unknown",
            );
            assert(
              list.every((j) => j && typeof j === "object"),
              "Malformed posting in board payload",
            );
            rawCount = list.length;
            const targetUrl = new URL(target);
            if ([...targetUrl.searchParams.keys()].some(k=>!['content','mode'].includes(k))) paginationComplete=false;
            const total = payload?.meta?.total ?? payload?.total;
            if (Number.isFinite(total) && total !== list.length) paginationComplete=false;
            if (
              payload?.truncated ||
              payload?.hasMore ||
              payload?.has_more ||
              payload?.next ||
              payload?.nextCursor ||
              payload?.next_cursor ||
              payload?.links?.next
            )
              paginationComplete = false;
            payloadValid = true;
          }
          return payload;
        },
      };
      const jobs = await PROVIDERS[source.provider].fetch(entry, readCtx);
      const complete =
        payloadValid &&
        paginationComplete &&
        rawCount === jobs.length &&
        jobs.every(
          (j) =>
            typeof j.url === "string" &&
            j.url &&
            typeof j.title === "string" &&
            j.title,
        );
      const board = source.api ?? source.careers_url;
      if(run&&!dryRun)for(const sequence of collectionSequences)await updateRun(repo,c,run,{action:'outcome',outcome:{sequence,category:!complete?'partial_collection':jobs.length?'read_ok':'empty_board',prospect_ids:[],note:'Board collection diagnostic only; role interpretation and demand attribution remain unreviewed.'}});
      const captureContent = JSON.stringify(
        jobs.map((j) => ({
          ...j,
          description: (j.description ?? "").slice(0, 20000),
        })),
      );
      const captureId = hash(JSON.stringify({board,observed_at:now.toISOString(),content:captureContent}));
      if (!dryRun) {
        mkdirSync(join(repo.dir, "captures"), { recursive: true });
        writeFileAtomic(
          join(repo.dir, "captures", captureId + ".json"),
          JSON.stringify(
            {
              content_sha256: hash(captureContent),
              url: board,
              observed_at: now.toISOString(),
              description_limit: 20000,
              jobs: JSON.parse(captureContent),
            },
            null,
            2,
          ) + "\n",
        );
      }
      const candidates = jobs.filter((j) =>
        new RegExp(c.discovery.role_pattern, "i").test(j.title),
      );
      const identity = {
        name: source.name,
        website: source.website,
        icp: source.icp,
        evidence: [source.identity_evidence],
      };
      const evidence = [],
        openings = [];
      for (const j of candidates.slice(0, 100)) {
        const id = "job-" + hash(JSON.stringify([board, j.url, j.posting_id,
          j.requisition_id, j.title, j.location, now.toISOString()])).slice(0, 16);
        evidence.push({
          id,
          url: j.url,
          excerpt: `${j.title}; ${j.location || "Location not stated"}`,
          observed_at: now.toISOString(),
          source_type: "primary",
          excerpt_kind: "summary",
          retrieval_precision: "approximate",
        });
        openings.push({
          title: j.title,
          provider: source.provider,
          board,
          ...(j.posting_id ? { posting_id: j.posting_id } : {}),
          ...(j.requisition_id ? { requisition_id: j.requisition_id } : {}),
          capture: captureId,
          url: j.url,
          location: j.location ?? "",
          status: "open",
          role_family: /full[ -]?stack/i.test(j.title)
            ? "fullstack"
            : /back[ -]?end|api engineer/i.test(j.title)
              ? "backend"
              : "other",
          hiring_for:
            source.icp === "agency" ? (source.hiring_for ?? "unknown") : "self",
          verified_at: now.toISOString(),
          evidence: [id],
          ...(j.postedAt
            ? { posted_at: new Date(j.postedAt).toISOString() }
            : {}),
        });
      }
      // Collection never supplies a LATAM eligibility judgment or an invented headcount.
      const collect = (p) => {
        applyResearch(p, { evidence, openings }, now, { collected: true });
        p.collection.complete = !!complete;
        p.collection.board = board;
        p.collection.capture = captureId;
        if (complete) {
          for (const o of p.openings)
            if (
              o.board === board &&
              o.reviewed !== false &&
              !jobs.some((j) => o.posting_id
                ? j.posting_id === o.posting_id
                : [o.url, ...(o.aliases ?? [])].includes(j.url) &&
                  o.title.trim().toLowerCase() === j.title.trim().toLowerCase() &&
                  (o.location ?? '').trim().toLowerCase() === (j.location ?? '').trim().toLowerCase())
            ) {
              o.reconciliation_needed = true;
              o.reconciliation_at = now.toISOString();
            }
        }
        return qualify(p, c, now);
      };
      // Identical preparation/validation in preview and commit. Real discovery
      // and collection form one transaction against the latest locked state.
      const { prospect, created,report_warning } = await repo.discover(identity, {
        dryRun,
        now,
        prepare: collect,
      });
      if(run && !dryRun) await updateRun(repo,c,run,{action:"link",prospects:[prospect.id],capture:captureId});
      result[created ? "created" : "existing"]++;
      result.prospects.push({
        id: prospect.id,
        name: source.name,
        revision: prospect.revision,
        research_input: { evidence, openings },
        requires_role_review: true,
        ...(report_warning?{report_warning}:{}),
      });
      result.diagnostics.push({
        company: source.name,
        status: jobs.length ? "reachable" : "empty",
        jobs: jobs.length,
        complete,
        collection_diagnostic:!complete?'partial_collection':jobs.length?'read_ok':'verified_empty_board',
        relevant: candidates.length,
        truncated: candidates.length > 100,
      });
    } catch (error) {
      if(run&&!dryRun&&/payload|posting in board/.test(error.message))for(const sequence of collectionSequences)await updateRun(repo,c,run,{action:'outcome',outcome:{sequence,category:'partial_collection',prospect_ids:[],note:'Malformed board response; cannot establish complete empty inventory.'}});
      result.diagnostics.push({
        company: source.name,
        status:
          error.code === "HR_OPS_BUDGET_EXHAUSTED"
            ? "budget-exhausted"
            : "error",
        error: error.message,
        collection_diagnostic:/payload|posting in board/.test(error.message)?'partial_collection':failureCategory(error),
      });
    }
  }
  result.partial =
    result.prospects.length < limit ||
    result.diagnostics.some((d) =>
      ["error", "budget-exhausted"].includes(d.status),
    );
  result.newly_discovered=result.created;result.refreshed_existing=result.existing;
  result.stopping_reason=result.diagnostics.some(d=>d.status==='budget-exhausted')?'request_or_candidate_budget_exhausted':balanced.length>limit?'per_operation_candidate_limit':'available_sources_exhausted';
  result.completion_note='Persisted identities and collected role titles are not completed discovery. Review attributable demand, geography and service fit before reporting matches.';
  return result;
}
