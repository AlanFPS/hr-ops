import greenhouse from "../../providers/greenhouse.mjs";
import ashby from "../../providers/ashby.mjs";
import lever from "../../providers/lever.mjs";
import { makeHttpCtx } from "../../providers/_http.mjs";
import { assert, hash, url, applyResearch } from "./model.mjs";
import { qualify } from "./operations.mjs";
import { inspectSources } from "./sources.mjs";
import { reserveResearch, researchBudget } from "./research-run.mjs";

const PROVIDERS = { greenhouse, ashby, lever };
export function discoveryQueries(icp = "both") {
  assert(["both", "agency", "startup"].includes(icp), "Invalid ICP");
  return [
    ...(icp !== "startup"
      ? [
          "US technical recruiting firm backend full stack startup recruiting team",
          "US engineering recruitment agency delivery partnerships founder",
        ]
      : []),
    ...(icp !== "agency"
      ? [
          "US startup backend full stack engineer remote worldwide careers",
          "US startup engineering careers Latin America contractors",
        ]
      : []),
  ];
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
  } = {},
) {
  discoveryQueries(icp);
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
    search_queries: discoveryQueries(icp),
    limits: { ...c.discovery, limit, starter_sources: starter },
    send_enabled: false,
    network_reads_allowed: !(dryRun && run),
  };
  const { sources, diagnostics } = inspectSources(c, { starter, now, icp });
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
    try {
      if (source.identity_stale || source.provider === "manual") {
        result.research_tasks.push({ name: source.name, website: source.website, icp: source.icp, careers_url: source.careers_url, notes: source.notes ?? null, identity_evidence: source.identity_evidence, requires_identity_refresh: source.identity_stale });
        result.diagnostics.push({ company: source.name, status: source.identity_stale ? "identity-stale" : "agent-research-required" });
        continue;
      }
      if (dryRun && run) {
        result.research_tasks.push({ name: source.name, website: source.website, icp: source.icp, provider: source.provider, careers_url: source.careers_url, requires_live_collection: true });
        result.diagnostics.push({ company: source.name, status: "preview", reason: "Budgeted previews make no network requests; run without --dry-run to collect and reserve attempts" });
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
      const budgetedCtx = run ? { ...ctx, fetchJson: async (target, options) => {
        await reserveResearch(repo, c, run, { kind: "page", company: source.website, target }, { dryRun, now: new Date() });
        return ctx.fetchJson(target, options);
      } } : ctx;
      const jobs = await PROVIDERS[source.provider].fetch(entry, budgetedCtx);
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
        const id = "job-" + hash(j.url + now.toISOString()).slice(0, 16);
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
        return qualify(p, c, now);
      };
      // Identical preparation/validation in preview and commit. Real discovery
      // and collection form one transaction against the latest locked state.
      const { prospect, created } = await repo.discover(identity, {
        dryRun,
        now,
        prepare: collect,
      });
      result[created ? "created" : "existing"]++;
      result.prospects.push({
        id: prospect.id,
        name: source.name,
        revision: prospect.revision,
        research_input: { evidence, openings },
        requires_role_review: true,
      });
      result.diagnostics.push({
        company: source.name,
        status: jobs.length ? "reachable" : "empty",
        jobs: jobs.length,
        relevant: candidates.length,
        truncated: candidates.length > 100,
      });
    } catch (error) {
      result.diagnostics.push({
        company: source.name,
        status: error.code === "HR_OPS_BUDGET_EXHAUSTED" ? "budget-exhausted" : "error",
        error: error.message,
      });
    }
  }
  result.partial =
    result.prospects.length < limit ||
    result.diagnostics.some((d) => ["error", "budget-exhausted"].includes(d.status));
  return result;
}
