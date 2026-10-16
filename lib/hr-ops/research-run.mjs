import { htmlToVisibleText } from "../../providers/_html-to-text.mjs";
import { validateScope, scopeSummary } from './run-scope.mjs';
import { captureContent, captureFailure } from './capture-content.mjs';
import { existsSync, readFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { writeFileAtomic } from "../../tracker-utils.mjs";
import { validateAttribution, validateOutcome, failureCategory } from './research-outcomes.mjs';
import { fetchTextHead } from "../../providers/_http.mjs";
import {
  assert,
  keys,
  text,
  url,
  domain,
  hash,
  stamp,
  validateEvidence,
} from "./model.mjs";

const CAPTURE_MAX_BYTES = 2_000_000;

export class ResearchBudgetError extends Error {
  constructor(kind, company) {
    super(
      `Research ${kind} budget exhausted${company ? " for " + company : ""}; stop and report the gap`,
    );
    this.name = "ResearchBudgetError";
    this.code = "HR_OPS_BUDGET_EXHAUSTED";
    this.retryable = false;
  }
}

function runPath(repo, run) {
  assert(
    typeof run === "string" && /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,79}$/.test(run),
    "--run requires a short alphanumeric run ID",
  );
  return join(repo.dir, "research-runs", run + ".json");
}
export function researchBudget(repo, c, run) {
  const path = runPath(repo, run);
  const state = existsSync(path)
    ? JSON.parse(readFileSync(path, "utf8"))
    : {
        schema_version: 1,
        run,
        limits: {
          queries: c.discovery.max_queries,
          pages_per_company: c.discovery.pages_per_company,
        },
        attempts: [],
      };
  assert(
    state.schema_version === 1 &&
      state.run === run &&
      Array.isArray(state.attempts),
    "Invalid research ledger",
  );
  keys(state, ['schema_version','run','limits','attempts','status','prospect_ids','captures','updated_at','scope','outcomes','stopping_reason'], 'research ledger');
  if(state.stopping_reason!==undefined)text(state.stopping_reason,'Research stopping reason',2000);
  if (state.status !== undefined) assert(['active','complete'].includes(state.status), 'Invalid research ledger status');
  for (const [key, pattern] of [['prospect_ids', /^[a-f0-9]{16}$/], ['captures', /^[a-f0-9]{64}$/]]) {
    if (state[key] !== undefined) assert(Array.isArray(state[key]) && state[key].every(id => typeof id === 'string' && pattern.test(id)) && new Set(state[key]).size === state[key].length, `Invalid research ledger ${key}`);
  }
  if (state.updated_at !== undefined) {
    try { stamp(state.updated_at); } catch(error) { throw new Error(`Invalid research ledger updated_at: ${error.message}`); }
  }
  keys(state.limits, ["queries", "pages_per_company"], "research limits");
  assert(
    [state.limits.queries, state.limits.pages_per_company].every(
      (n) => Number.isSafeInteger(n) && n > 0,
    ),
    "Invalid research limits",
  );
  const counts = new Map();
  for (const [index, attempt] of state.attempts.entries()) {
    keys(
      attempt,
      ["sequence", "at", "kind", "company", "target", "candidate_names", "directory", "attribution"],
      "research attempt",
    );
    assert(
      attempt.sequence === index + 1 &&
        ["query", "page"].includes(attempt.kind),
      "Invalid research attempt sequence or kind",
    );
    stamp(attempt.at);
    validateAttribution(attempt.attribution);
    text(attempt.target, "research target", 4096);
    if (attempt.kind === "page") {
      assert(
        typeof attempt.company === "string" &&
          domain("https://" + attempt.company) === attempt.company,
        "Invalid research company",
      );
      url(attempt.target);
    } else assert(attempt.company === null, "Query company must be null");
    const key = attempt.kind === "query" ? "queries" : attempt.company;
    const used = (counts.get(key) ?? 0) + 1;
    counts.set(key, used);
    assert(
      used <=
        (attempt.kind === "query"
          ? state.limits.queries
          : state.limits.pages_per_company),
      "Research ledger exceeds its pinned limits",
    );
  }
  if(state.outcomes!==undefined){assert(Array.isArray(state.outcomes),'Invalid outcomes');for(const o of state.outcomes)validateOutcome(o,state);}
  scopeSummary(state);
  return state;
}
export async function reserveResearch(
  repo,
  c,
  run,
  input,
  { dryRun = false, now = new Date() } = {},
) {
  keys(input, ["kind", "company", "target", "candidate_names", "directory", "attribution"], "research reservation");
  validateAttribution(input.attribution);
  assert(
    ["query", "page"].includes(input.kind),
    "Reservation kind must be query or page",
  );
  text(input.target, "target", 4096);
  const company = input.kind === "page" ? domain(input.company) : null;
  if (input.kind === "page") url(input.target);
  const update = () => {
    const state = researchBudget(repo, c, run);
    assert(
      state.status !== "complete",
      "Research run is complete; explicitly resume the same run",
    );
    const used = state.attempts.filter(
      (a) =>
        a.kind === input.kind &&
        (input.kind === "query" || a.company === company),
    ).length;
    const limit =
      input.kind === "query"
        ? state.limits.queries
        : state.limits.pages_per_company;
    if (used >= limit) throw new ResearchBudgetError(input.kind, company);
    const reservation = {
      sequence: state.attempts.length + 1,
      at: now.toISOString(),
      kind: input.kind,
      company,
      target: input.target,
      ...(input.attribution !== undefined ? {attribution:structuredClone(input.attribution)} : {}),
      ...(input.candidate_names !== undefined ? {candidate_names: input.candidate_names} : {}),
      ...(input.directory !== undefined ? {directory: input.directory} : {}),
    };
    assert(state.scope || (input.candidate_names === undefined && input.directory === undefined), 'Configure run scope before attaching candidate names');
    state.attempts.push(reservation);
    const scope = scopeSummary(state);
    if (!dryRun) {
      mkdirSync(join(repo.dir, "research-runs"), { recursive: true });
      writeFileAtomic(
        runPath(repo, run),
        JSON.stringify(state, null, 2) + "\n",
      );
    }
    return {
      reservation,
      remaining: limit - used - 1,
      dry_run: dryRun,
      dispatch_allowed: !dryRun,
      scope,
    };
  };
  return dryRun ? update() : repo.lock(update);
}

// Conservative text extraction for quote matching, not a browser or a semantic verifier.
export function sourceText(raw) {
  return htmlToVisibleText(raw, CAPTURE_MAX_BYTES);
}
export async function captureSource(
  repo,
  c,
  run,
  input,
  { dryRun = false, fetchText = fetchTextHead, clock = () => new Date() } = {},
) {
  keys(
    input,
    [
      "company",
      "url",
      "excerpt",
      "excerpt_kind",
      "source_type",
      "published_at",
      "candidate_names",
      "directory",
      "format",
      "attribution",
    ],
    "capture",
  );
  url(input.url);
  assert(input.format === undefined || ['auto','text','json'].includes(input.format), 'capture format must be auto, text or json');
  // No LinkedIn collection, even if a caller supplies a public URL.
  assert(
    !/(^|\.)linkedin\.com$/.test(
      new URL(input.url).hostname.replace(/\.$/, ""),
    ),
    "LinkedIn collection is disabled",
  );
  const requestedAt = clock();
  let excerpt = input.excerpt;
  if (excerpt !== undefined) {
    assert(
      ["quote", "summary"].includes(input.excerpt_kind),
      "Specify excerpt_kind: quote or summary",
    );
    // Excerpts are plain text. Only whitespace normalization is allowed; HTML
    // extraction belongs to the fetched document, never to the claimed quote.
    if (input.excerpt_kind === "quote")
      excerpt = text(excerpt, "excerpt", 4000).replace(/\s+/g, " ");
    validateEvidence(
      {
        id: "capture-input",
        url: input.url,
        observed_at: requestedAt.toISOString(),
        source_type: input.source_type,
        excerpt,
        excerpt_kind: input.excerpt_kind,
        ...(input.published_at !== undefined
          ? { published_at: input.published_at }
          : {}),
      },
      requestedAt,
    );
  } else {
    assert(
      ["excerpt_kind", "source_type", "published_at"].every(
        (k) => input[k] === undefined,
      ),
      "Capture evidence metadata requires an excerpt",
    );
  }
  const reservation = await reserveResearch(
    repo,
    c,
    run,
    { kind: "page", company: input.company, target: input.url,
      ...(input.attribution !== undefined ? {attribution:input.attribution} : {}),
      ...(input.candidate_names !== undefined ? {candidate_names:input.candidate_names} : {}),
      ...(input.directory !== undefined ? {directory:input.directory} : {}) },
    { dryRun, now: requestedAt },
  );
  if (dryRun) return { ...reservation, fetched: false };
  // Failed requests consume the reserved attempt. Redirects require a separately
  // reviewed public URL; no cookies, auth headers, form submissions or retries.
  let raw;
  try {
    raw = await fetchText(input.url, {maxBytes: CAPTURE_MAX_BYTES, timeoutMs: 20000, redirect: 'manual'});
  } catch (error) {
    await updateRun(repo,c,run,{action:'outcome',outcome:{sequence:reservation.reservation.sequence,category:failureCategory(error),prospect_ids:[],note:String(error.message).slice(0,2000)}});
    throw captureFailure(error, input.url);
  }
  const observed_at = clock().toISOString();
  let extracted;
  try{extracted=captureContent(raw,input.url,input.format);}
  catch(error){await updateRun(repo,c,run,{action:'outcome',outcome:{sequence:reservation.reservation.sequence,category:'partial_collection',prospect_ids:[],note:'Response could not be decoded as the requested format; completeness unknown.'}});throw error;}
  const {content} = extracted;
  const javascriptOnly=extracted.content_format==='text'&&content.length<500&&/enable javascript|javascript (?:is )?required|you need to enable javascript/i.test(content);
  // Decoding may omit a three-byte BOM and up to three incomplete UTF-8 tail
  // bytes. Flag conservatively near the cap rather than claiming completeness.
  const result = {
    ...reservation,
    fetched: true,
    url: input.url,
    observed_at,
    retrieval_precision: "exact",
    content_sha256: hash(raw),
    possibly_truncated: Buffer.byteLength(raw) >= CAPTURE_MAX_BYTES - 6,
    collection_diagnostic:javascriptOnly?'javascript_only':Buffer.byteLength(raw)>=CAPTURE_MAX_BYTES-6?'partial_collection':'read_ok',
    ...extracted,
  };
  if (excerpt !== undefined) {
    if (input.excerpt_kind === "quote") {
      assert(
        content.includes(excerpt),
        "Quote does not occur in captured text; do not present a tool summary as verbatim",
      );
    }
    result.evidence = {
      id: "capture-" + hash(input.url + observed_at + excerpt).slice(0, 20),
      url: input.url,
      observed_at,
      retrieval_precision: "exact",
      source_type: input.source_type,
      excerpt,
      excerpt_kind: input.excerpt_kind,
      ...(input.published_at !== undefined
        ? { published_at: input.published_at }
        : {}),
    };
    validateEvidence(result.evidence, new Date(observed_at));
  }
  mkdirSync(join(repo.dir, "captures"), { recursive: true });
  const captureId = hash(
    JSON.stringify({ url: result.url, observed_at, content }),
  );
  writeFileAtomic(
    join(repo.dir, "captures", captureId + ".json"),
    JSON.stringify({ ...result, id: captureId }, null, 2) + "\n",
  );
  result.capture_id = captureId;
  await updateRun(repo, c, run, { action: "link", capture: captureId });
  await updateRun(repo,c,run,{action:'outcome',outcome:{sequence:reservation.reservation.sequence,category:result.collection_diagnostic,prospect_ids:[],note:'Captured public page; diagnostic is separate from interpreted demand. Semantic review remains required.'}});
  return result;
}

export async function updateRun(
  repo,
  c,
  run,
  { action = "inspect", prospects = [], capture, scope, outcome, reason } = {},
  { dryRun = false } = {},
) {
  assert(
    ["inspect", "complete", "resume", "link", "configure", "outcome"].includes(action),
    "Invalid run action",
  );
  assert(Array.isArray(prospects) && prospects.every(id => typeof id === 'string' && /^[a-f0-9]{16}$/.test(id)), 'Invalid research prospect IDs');
  if (capture !== undefined) assert(typeof capture === 'string' && /^[a-f0-9]{64}$/.test(capture), 'Invalid research capture ID');
  if (action === 'configure') validateScope(scope);
  else assert(scope === undefined, 'scope requires configure action');
  if(reason!==undefined){assert(action==='complete','Stopping reason requires complete action');text(reason,'Stopping reason',2000);}
  const apply = () => {
    const state = researchBudget(repo, c, run);
    if(action==='outcome'){
      const value={...outcome,recorded_at:new Date().toISOString()};validateOutcome(value,state);
      for(const id of value.prospect_ids)repo.get(id);
      assert(state.status!=='complete','Resume the run before recording outcomes');
      state.outcomes??=[];
      const identity=({recorded_at,...o})=>JSON.stringify(o);
      if(!state.outcomes.some(o=>identity(o)===identity(value)))state.outcomes.push(value);
      prospects=[...new Set([...prospects,...value.prospect_ids])];
    }else assert(outcome===undefined,'outcome requires outcome action');
    if (action === 'configure') {
      assert(!state.attempts.length && !state.scope, 'Run scope must be pinned once before research');
      state.scope = structuredClone(scope);
    }
    if (action !== "inspect") {
      assert(
        action === "resume" ||
          action === "complete" ||
          state.status !== "complete",
        "Completed run must be resumed before linking work",
      );
      state.status = action === "complete" ? "complete" : "active";
      if(action==='complete')state.stopping_reason=reason??'Operator ended run; detailed stopping reason not supplied';
      if(action==='resume')delete state.stopping_reason;
      state.prospect_ids = [
        ...new Set([...(state.prospect_ids ?? []), ...prospects]),
      ];
      state.captures = [
        ...new Set([...(state.captures ?? []), ...(capture ? [capture] : [])]),
      ];
      state.updated_at = new Date().toISOString();
      if (!dryRun) {
        mkdirSync(join(repo.dir, "research-runs"), { recursive: true });
        writeFileAtomic(
          runPath(repo, run),
          JSON.stringify(state, null, 2) + "\n",
        );
      }
    }
    return {
      ...state,
      unique_prospects: (state.prospect_ids ?? []).length,
      scope_usage: scopeSummary(state),
      budget_scope: {
        queries: "per run",
        pages: "per company per run",
        max_candidates: "per discovery operation",
      },
      dry_run: dryRun,
    };
  };
  return action === "inspect" || dryRun ? apply() : repo.lock(apply);
}
