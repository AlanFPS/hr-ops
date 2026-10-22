import { createHash } from "node:crypto";
import { isIP } from "node:net";
import { isBlockedAddress } from "../../providers/_ip-guard.mjs";
import { normalizeUrl } from "../../url-key.mjs";
import {DISCOVERY_FEED_IDS,validateFeedFilters} from './feed-contract.mjs';

export const VERSION = 2;
export const CONFIG_VERSION = 1;
export const STATES = [
  "DISCOVERED",
  "RESEARCHING",
  "QUALIFIED",
  "CONTACT_IDENTIFIED",
  "OUTREACH_READY",
  "CONTACTED",
  "REPLIED",
  "MEETING",
  "OPPORTUNITY",
  "CLIENT",
  "LOST",
  "DISQUALIFIED",
];
export const EARLY = STATES.slice(0, 5);
export const FIELDS = [
  "industry",
  "company_size",
  "employee_count",
  "recruiter_count",
  "location",
  "us_market",
  "tech_focus",
  "remote_policy",
  "funding_growth",
  "recruiting_structure",
  "recruiting_partners",
  "latam_presence",
  "latam_compatibility",
  "latam_specialist",
  "service_fit",
  "recruiting_pain",
  "latam_delivery_request",
];
export const DEFAULTS = {
  schema_version: CONFIG_VERSION,
  language: "en",
  timezone: "America/Buenos_Aires",
  firm: {
    name: null,
    sender_name: null,
    email: null,
    services: [],
    fees: null,
    guarantees: null,
    candidate_availability: null,
  },
  icps: {
    startup: {
      employee_range: [5, 250],
      role_families: ["backend", "fullstack"],
      weights: { demand: 30, fit: 15, latam: 25, need: 20, access: 10 },
    },
    agency: {
      recruiter_range: [2, 50],
      role_families: ["backend", "fullstack"],
      exclude_latam_specialists: true,
      weights: { demand: 25, fit: 25, latam: 30, need: 10, access: 10 },
    },
  },
  scoring: { qualify: 65, coverage: 60 },
  freshness: { openings: 30, contacts: 90, facts: 180 },
  discovery: {
    limit: 10,
    max_candidates: 50,
    max_queries: 20,
    pages_per_company: 6,
    starter_sources: false,
    sources: [],
    feeds: [],
    queries: { agency: [], startup: [] },
    role_pattern:
      "backend|back.end|full.stack|software engineer|product engineer|api engineer",
  },
  followups: { first_days: 5, subsequent_days: 7, max_followups: 2 },
  outreach: {
    linkedin_max_chars: 700,
    email_max_words: 140,
    followup_max_words: 90,
  },
};
export function assert(condition, message) {
  if (!condition) throw new Error(message);
}
export function text(value, label, max = 10000) {
  assert(
    typeof value === "string" && value.trim() && value.length <= max,
    `${label}: expected nonempty text (max ${max})`,
  );
  return value.trim();
}
export function keys(value, allowed, label) {
  assert(
    value && typeof value === "object" && !Array.isArray(value),
    `${label}: expected object`,
  );
  for (const k of Object.keys(value))
    assert(allowed.includes(k), `${label}: unsupported field ${k}`);
}
export function stamp(value, now = new Date()) {
  const parts =
    typeof value === "string" &&
    value.match(
      /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?(Z|[+-]\d{2}:\d{2})$/,
    );
  assert(parts, "Expected ISO timestamp with time and timezone");
  const [, year, month, day, hour, minute, second = "0", offset] = parts;
  const leap = +year % 4 === 0 && (+year % 100 !== 0 || +year % 400 === 0);
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  assert(
    +month >= 1 &&
      +month <= 12 &&
      +day >= 1 &&
      +day <= days[+month - 1] &&
      +hour < 24 &&
      +minute < 60 &&
      +second < 60 &&
      (offset === "Z" || (+offset.slice(1, 3) < 24 && +offset.slice(4) < 60)) &&
      Number.isFinite(Date.parse(value)),
    "Invalid calendar timestamp",
  );
  assert(
    Date.parse(value) <= +now + 60000,
    "Future evidence/events are not accepted",
  );
  return new Date(value).toISOString();
}
export function url(value) {
  const u = new URL(text(value, "URL", 4096));
  assert(
    u.protocol === "https:" && !u.username && !u.password,
    "Only public HTTPS URLs without credentials are accepted",
  );
  const host = u.hostname.replace(/^\[|\]$/g, "");
  assert(
    host.includes(".") &&
      !/\.(local|internal|localhost)$/.test(host) &&
      host !== "localhost" &&
      (!isIP(host) || !isBlockedAddress(host)),
    "Public host required",
  );
  return u.href;
}
export function domain(value) {
  return new URL(url(value)).hostname.toLowerCase().replace(/^www\./, "");
}
export function hash(value) {
  return createHash("sha256")
    .update(
      typeof value === "string" || Buffer.isBuffer(value)
        ? value
        : JSON.stringify(value),
    )
    .digest("hex");
}
export function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((k) => [k, canonical(value[k])]),
    );
  return value;
}
export function validDay(value) {
  assert(
    typeof value === "string" &&
      /^\d{4}-\d{2}-\d{2}$/.test(value) &&
      Number.isFinite(Date.parse(value + "T12:00:00Z")) &&
      new Date(value + "T12:00:00Z").toISOString().slice(0, 10) === value,
    "Invalid follow-up date",
  );
  return value;
}
export function fresh(at, days, now = new Date()) {
  const age = (+now - Date.parse(at)) / 86400000;
  return Number.isFinite(age) && age >= -1 / 1440 && age <= days;
}
export function mergeConfig(base, extra, path = "hr_ops") {
  const result = structuredClone(base);
  for (const [key, value] of Object.entries(extra ?? {})) {
    assert(
      !["__proto__", "constructor", "prototype"].includes(key),
      "Unsafe configuration key",
    );
    assert(
      Object.hasOwn(base, key),
      `${path}.${key}: unknown configuration key; allowed: ${Object.keys(base).join(", ")}`,
    );
    result[key] =
      value && typeof value === "object" && !Array.isArray(value)
        ? mergeConfig(result[key] ?? {}, value, `${path}.${key}`)
        : value;
  }
  return result;
}
export function validateConfig(c) {
  assert(c.schema_version === CONFIG_VERSION, "Unsupported config schema");
  mergeConfig(DEFAULTS, c);
  assert(c.discovery.feeds===undefined||Array.isArray(c.discovery.feeds),'discovery.feeds must be an array');
  const feedIds=new Set();
  for(const feed of c.discovery.feeds??[]){
    keys(feed,['id','enabled','filters'],'discovery feed');
    validateFeedFilters(feed.id,feed.filters);
    assert(DISCOVERY_FEED_IDS.includes(feed.id),'Unknown discovery feed id');
    assert(!feedIds.has(feed.id),'Duplicate discovery feed id');feedIds.add(feed.id);
    assert(feed.enabled===undefined||typeof feed.enabled==='boolean','discovery feed enabled must be boolean');
  }
  for (const type of ["agency", "startup"]) {
    assert(
      Array.isArray(c.discovery.queries[type]) &&
        c.discovery.queries[type].every(
          (q) => typeof q === "string" && q.trim(),
        ),
      "Invalid discovery query recipes",
    );
  }
  for (const source of c.discovery.sources)
    keys(
      source,
      [
        "name",
        "website",
        "icp",
        "provider",
        "careers_url",
        "api",
        "identity_evidence",
        "notes",
        "enabled",
        "hiring_for",
        "category",
      ],
      "source",
    );
  new Intl.DateTimeFormat("en", { timeZone: c.timezone });
  for (const type of ["startup", "agency"]) {
    const w = c.icps[type].weights;
    assert(
      Object.keys(w).length === 5 &&
        ["demand", "fit", "latam", "need", "access"].every(
          (k) => Number.isFinite(w[k]) && w[k] >= 0,
        ),
      "Invalid scoring weights",
    );
    assert(
      Object.values(w).reduce((a, b) => a + b, 0) === 100,
      "Weights must sum to 100",
    );
    const range =
      c.icps[type][type === "startup" ? "employee_range" : "recruiter_range"];
    assert(
      Array.isArray(range) &&
        range.length === 2 &&
        range.every((n) => Number.isInteger(n) && n >= 0) &&
        range[0] <= range[1],
      "Invalid ICP size range",
    );
  }
  for (const [key, value] of Object.entries(c.freshness))
    assert(Number.isInteger(value) && value > 0, `Invalid freshness ${key}`);
  for (const [key, value] of Object.entries(c.followups))
    assert(Number.isInteger(value) && value >= 0, `Invalid cadence ${key}`);
  for (const k of ["qualify", "coverage"])
    assert(
      Number.isFinite(c.scoring[k]) && c.scoring[k] >= 0 && c.scoring[k] <= 100,
      `Invalid ${k} threshold`,
    );
  for (const k of [
    "limit",
    "max_candidates",
    "max_queries",
    "pages_per_company",
  ])
    assert(
      Number.isInteger(c.discovery[k]) && c.discovery[k] > 0,
      `Invalid discovery ${k}`,
    );
  assert(
    Array.isArray(c.firm.services) &&
      c.firm.services.every((s) =>
        [
          "sourcing",
          "recruiting",
          "staffing",
          "payroll",
          "employment",
        ].includes(s),
      ),
    "Invalid service list",
  );
  for (const key of ["name", "sender_name", "email"])
    if (c.firm[key] !== null) text(c.firm[key], `firm.${key}`, 500);
  assert(Array.isArray(c.discovery.sources), "Sources must be an array");
  assert(
    typeof c.discovery.starter_sources === "boolean",
    "Invalid starter_sources flag",
  );
  new RegExp(c.discovery.role_pattern, "i");
  for (const type of ["agency", "startup"])
    assert(
      Array.isArray(c.icps[type].role_families) &&
        c.icps[type].role_families.length > 0 &&
        c.icps[type].role_families.every((r) =>
          ["backend", "fullstack", "other"].includes(r),
        ),
      "Invalid ICP role families",
    );
  assert(
    typeof c.icps.agency.exclude_latam_specialists === "boolean",
    "Invalid LATAM specialist exclusion",
  );
  for (const value of Object.values(c.outreach))
    assert(Number.isInteger(value) && value > 0, "Invalid outreach limit");
  return c;
}
export function references(ids, evidence, label) {
  assert(
    Array.isArray(ids) && ids.length > 0,
    `${label}: source references required`,
  );
  for (const id of ids)
    assert(
      evidence.some((e) => e.id === id),
      `${label}: missing evidence ${id}`,
    );
}
export function validateEvidence(e, now) {
  keys(
    e,
    [
      "id",
      "url",
      "excerpt",
      "observed_at",
      "source_type",
      "excerpt_kind",
      "published_at",
      "retrieval_precision",
    ],
    "evidence",
  );
  text(e.id, "evidence.id", 120);
  url(e.url);
  text(e.excerpt, "evidence.excerpt", 4000);
  stamp(e.observed_at, now);
  if (e.published_at !== undefined) {
    stamp(e.published_at, now);
    assert(
      Date.parse(e.published_at) <= Date.parse(e.observed_at),
      "Publication cannot follow retrieval",
    );
  }
  if (e.excerpt_kind !== undefined)
    assert(
      ["quote", "summary"].includes(e.excerpt_kind),
      "Invalid excerpt_kind",
    );
  if (e.retrieval_precision !== undefined)
    assert(
      ["exact", "approximate"].includes(e.retrieval_precision),
      "Invalid retrieval_precision",
    );
  assert(
    ["primary", "secondary"].includes(e.source_type),
    "Evidence source_type must be primary or secondary",
  );
}
export function validateFact(f, evidence, label) {
  keys(
    f,
    [
      "value",
      "confidence",
      "evidence",
      ...(label === "recruiting_pain" ? ["basis", "rationale"] : []),
    ],
    "fact",
  );
  if (
    label === "recruiting_pain" &&
    (f.basis !== undefined || f.rationale !== undefined)
  ) {
    assert(
      [
        "employer_reported_difficulty",
        "documented_capacity_gap",
        "explicit_partner_request",
      ].includes(f.basis),
      "Invalid recruiting pain basis; a vacancy alone is not recruiting pain",
    );
    text(f.rationale, "recruiting pain rationale");
    assert(
      ["mixed", "strong"].includes(f.value) && f.confidence !== "unknown",
      "Pain basis requires positive, supported pain",
    );
  }
  assert(
    ["observed", "inferred", "unknown"].includes(f.confidence),
    "Invalid confidence",
  );
  if (f.confidence === "unknown")
    assert(
      f.value === null && (!f.evidence || f.evidence.length === 0),
      "Unknown facts must have null value and no evidence",
    );
  else {
    assert(
      f.value !== null && f.value !== undefined,
      `${label}: missing value`,
    );
    references(f.evidence, evidence, label);
  }
  if (["employee_count", "recruiter_count"].includes(label) && f.value !== null)
    assert(
      (Number.isInteger(f.value) && f.value >= 0) ||
        (Array.isArray(f.value) &&
          f.value.length === 2 &&
          f.value.every((n) => Number.isInteger(n) && n >= 0) &&
          f.value[0] <= f.value[1]),
      `${label}: use an integer, inclusive [min,max] range, or unknown`,
    );
  if (
    [
      "us_market",
      "tech_focus",
      "latam_specialist",
      "latam_delivery_request",
    ].includes(label) &&
    f.value !== null
  )
    assert(typeof f.value === "boolean", `${label}: use boolean or unknown`);
  if (label === "latam_compatibility" && f.value !== null)
    assert(
      ["yes", "possible", "restricted"].includes(f.value),
      "Invalid LATAM compatibility",
    );
  if (label === "recruiting_pain" && f.value !== null)
    assert(
      ["none", "mixed", "strong"].includes(f.value),
      "Invalid recruiting pain",
    );
  if (
    f.confidence !== "unknown" &&
    ![
      "employee_count",
      "recruiter_count",
      "us_market",
      "tech_focus",
      "latam_specialist",
      "latam_delivery_request",
      "latam_compatibility",
      "recruiting_pain",
    ].includes(label)
  )
    text(f.value, label);
}
export function blankProspect(input, now = new Date()) {
  keys(
    input,
    ["name", "website", "icp", "evidence", "discovery_source"],
    "prospect",
  );
  text(input.name, "name", 160);
  assert(
    ["startup", "agency"].includes(input.icp),
    "ICP must be startup or agency",
  );
  const d = domain(input.website);
  assert(
    Array.isArray(input.evidence) && input.evidence.length > 0,
    "Discovery requires identity evidence",
  );
  input.evidence.forEach((e) => validateEvidence(e, now));
  assert(
    new Set(input.evidence.map((e) => e.id)).size === input.evidence.length,
    "Duplicate evidence IDs",
  );
  return {
    ...(input.discovery_source
      ? { discovery_source: url(input.discovery_source) }
      : {}),
    schema_version: VERSION,
    id: hash(d).slice(0, 16),
    revision: 0,
    name: input.name.trim(),
    website: url(input.website),
    domains: [d],
    icp: input.icp,
    status: "DISCOVERED",
    created_at: now.toISOString(),
    updated_at: now.toISOString(),
    evidence: input.evidence,
    facts: Object.fromEntries(
      FIELDS.map((k) => [
        k,
        { value: null, confidence: "unknown", evidence: [] },
      ]),
    ),
    openings: [],
    contacts: [],
    risks: [],
    blockers: [],
    drafts: [],
    interactions: [],
    history: [],
    score: null,
    suppressed: false,
    hold: false,
    next_followup: null,
  };
}
export function applyResearch(
  p,
  input,
  now = new Date(),
  { collected = false } = {},
) {
  keys(
    input,
    ["evidence", "facts", "openings", "contacts", "risks", "blockers"],
    "research",
  );
  const byId = new Map(p.evidence.map((e) => [e.id, e]));
  for (const e of input.evidence ?? []) {
    validateEvidence(e, now);
    if (byId.has(e.id))
      assert(
        JSON.stringify(canonical(byId.get(e.id))) ===
          JSON.stringify(canonical(e)),
        `Evidence ${e.id} is immutable; use a new ID`,
      );
    byId.set(e.id, e);
  }
  p.evidence = [...byId.values()];
  for (const [key, f] of Object.entries(input.facts ?? {})) {
    assert(FIELDS.includes(key), `Unknown dossier field ${key}`);
    validateFact(f, p.evidence, key);
    if (key === "recruiting_pain" && ["mixed", "strong"].includes(f.value))
      assert(
        f.basis && f.rationale,
        "Positive recruiting pain requires a cited basis and rationale beyond the vacancy itself",
      );
    p.facts[key] = f;
  }
  const observations = [];
  for (const opening of input.openings ?? []) {
    keys(
      opening,
      [
        "id",
        "title",
        "url",
        "role_family",
        "status",
        "verified_at",
        "posted_at",
        "evidence",
        "hiring_for",
        "location",
        "employer",
        "reviewed",
        "eligibility",
        "provider",
        "board",
        "posting_id",
        "requisition_id",
        "duplicate_group",
        "aliases",
        "capture",
        "reconciliation_needed",
        "reconciliation_at",
        "verification",
      ],
      "opening",
    );
    text(opening.title, "opening.title", 400);
    url(opening.url);
    stamp(opening.verified_at, now);
    references(opening.evidence, p.evidence, "opening");
    assert(
      ["backend", "fullstack", "other"].includes(opening.role_family),
      "Invalid role_family",
    );
    assert(
      ["open", "closed", "unknown"].includes(opening.status),
      "Invalid opening status",
    );
    assert(
      ["self", "client", "unknown"].includes(opening.hiring_for),
      "Invalid hiring_for",
    );
    if (opening.reviewed !== undefined)
      assert(
        typeof opening.reviewed === "boolean",
        "opening.reviewed: expected boolean",
      );
    validateOpeningDetails(opening, p.evidence, now);
    validateOpeningVerification(opening, p);
    if (opening.id !== undefined)
      assert(/^[a-f0-9]{16}$/.test(opening.id), "opening.id: invalid ID");
    const key = openingIdentity(opening);
    const matches = p.openings.filter((o) =>
      opening.id ? o.id === opening.id : openingIdentity(o) === key,
    );
    assert(matches.length <= 1, "Ambiguous opening identity; supply the saved opening.id");
    const old = matches[0];
    const id = old?.id ?? opening.id ?? hash(key).slice(0, 16);
    assert(!p.openings.some((o) => o.id === id && o !== old), "Opening ID collision");
    const aliases = [...new Set([...(old?.aliases ?? []), ...(opening.aliases ?? []),
      ...(old && normalizeUrl(old.url) !== normalizeUrl(opening.url) ? [old.url] : []),
    ])];
    const row = {
      ...old,
      ...opening,
      id,
      ...(aliases.length ? { aliases } : {}),
      reviewed: collected ? false : (opening.reviewed ?? true),
      verification: collected ? undefined : opening.verification,
      eligibility: opening.eligibility ?? { status: "unknown", evidence: [] },
      // A boolean review cannot clear a complete-board contradiction. Require
      // explicit currentness evidence at least as recent as that collection.
      reconciliation_needed: !!old?.reconciliation_needed,
      reconciliation_at: old?.reconciliation_at,
    };
    if (opening.verification?.currency?.status === 'conflicting') {
      row.reconciliation_needed = true;
      row.reconciliation_at = new Date(Math.max(old?.reconciliation_at?Date.parse(old.reconciliation_at):0,
        ...opening.verification.currency.evidence.map(id=>Date.parse(byId.get(id).observed_at)))).toISOString();
    }
    if (old?.reconciliation_needed && !collected && opening.reviewed === true &&
        opening.verification?.currency?.status === 'confirmed' &&
        openingVerificationGaps(row,p,{freshness:{openings:Infinity}},now).length === 0 &&
        opening.verification.currency.evidence.every(id => Date.parse(byId.get(id).observed_at) >=
          Date.parse(old.reconciliation_at ?? p.collection?.at ?? old.verified_at)))
      row.reconciliation_needed = false;
    observations.push(row);
    // Collection never renews an operator's evidence review.
    if (collected && old && old.reviewed !== false) continue;
    p.openings = p.openings.filter((o) => o.id !== row.id);
    p.openings.push(row);
  }
  for (const contact of input.contacts ?? []) {
    keys(
      contact,
      [
        "id",
        "name",
        "title",
        "url",
        "email",
        "verified_at",
        "evidence",
        "supplier_authority",
      ],
      "contact",
    );
    if (contact.supplier_authority !== undefined)
      validateFact(
        contact.supplier_authority,
        p.evidence,
        "supplier_authority",
      );
    if (contact.supplier_authority?.value != null)
      assert(
        ["confirmed", "unverified", "not_relevant"].includes(
          contact.supplier_authority.value,
        ),
        "Invalid supplier authority",
      );
    text(contact.name, "contact.name", 180);
    text(contact.title, "contact.title", 200);
    url(contact.url);
    stamp(contact.verified_at, now);
    references(contact.evidence, p.evidence, "contact");
    if (contact.email) {
      assert(/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contact.email), "Invalid email");
      assert(
        contact.evidence.some((id) =>
          p.evidence
            .find((e) => e.id === id)
            .excerpt.toLowerCase()
            .includes(contact.email.toLowerCase()),
        ),
        "Email must appear in its cited public evidence",
      );
    }
    const old = p.contacts.find(
      (c) => c.name.toLowerCase() === contact.name.toLowerCase(),
    );
    const row = {
      ...contact,
      id: old?.id ?? hash(contact.name.toLowerCase() + p.id).slice(0, 16),
    };
    p.contacts = p.contacts.filter((c) => c.id !== row.id);
    p.contacts.push(row);
  }
  for (const field of ["risks", "blockers"])
    if (input[field]) {
      assert(Array.isArray(input[field]), `${field} must be an array`);
      for (const item of input[field]) {
        keys(item, ["text", "evidence", "confidence"], field);
        text(item.text, field);
        references(item.evidence, p.evidence, field);
        assert(
          ["observed", "inferred"].includes(item.confidence),
          "Invalid risk confidence",
        );
        if (field === "blockers")
          assert(
            item.confidence === "observed",
            "Blockers require observed evidence",
          );
      }
      p[field] = input[field];
    }
  if (collected)
    p.collection = { at: now.toISOString(), openings: observations };
  else p.researched_at = now.toISOString();
  return p;
}
export function supported(p, fact, days, now) {
  return (
    fact &&
    fact.confidence !== "unknown" &&
    fact.evidence?.length &&
    fact.evidence.every((id) =>
      p.evidence.some((e) => e.id === id && fresh(e.observed_at, days, now)),
    )
  );
}
export function rankedContacts(p, c, now = new Date()) {
  const currentEvidence = (ids) => ids.every((id) => p.evidence.some((e) =>
    e.id === id && fresh(e.observed_at, c.freshness.contacts, now) &&
    (e.published_at
      ? fresh(e.published_at, c.freshness.contacts, now)
      : e.source_type === "primary"),
  ));
  const small =
    supported(p, p.facts.employee_count, c.freshness.facts, now) &&
    (Array.isArray(p.facts.employee_count.value)
      ? p.facts.employee_count.value[1]
      : p.facts.employee_count.value) <= 30;
  return p.contacts
    .map((person) => {
      const title = person.title
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, " ")
        .trim();
      const former = /\b(former|previous|retired|departed|ex)\b/.test(title);
      // Assistant vice president is a leadership rank, unlike assistant to a VP.
      const assistant =
        /\b(coordinator|intern)\b/.test(title) ||
        /\bassistant\b/.test(
          title.replace(/\bassistant vice president\b/g, "vice president"),
        );
      const executive =
        /\b(founder|cofounder|ceo|coo|chief executive officer|chief operating officer|managing director|managing partner|founding partner|business owner|company owner)\b/.test(
          title,
        ) ||
        /^(?:co )?owner$/.test(title) ||
        title === "partner" ||
        title === "president";
      const leader = /\b(vp|svp|evp|vice president|head|director|lead)\b/.test(
        title,
      );
      const recruiting =
        /\b(recruiting|recruitment|talent|delivery|people|human resources)\b/.test(
          title,
        );
      let priority = 0,
        reason = "Role relevance not established";
      if (!assistant && !former && p.icp === "agency") {
        if (executive) {
          priority = 3;
          reason = "Can evaluate a recruiting delivery partnership";
        } else if (leader && recruiting) {
          priority = 2;
          reason = "Responsible for recruiting or delivery operations";
        } else if (
          leader &&
          /\b(commercial|partnerships|business development)\b/.test(title)
        ) {
          priority = 1;
          reason =
            "Potential commercial partnership contact; verify supplier or delivery-partner remit";
        }
      } else if (!assistant && !former) {
        if (
          /\b(cto|chief technology)\b/.test(title) ||
          (leader && /\bengineering\b/.test(title))
        ) {
          priority = 3;
          reason = "Owns engineering hiring needs";
        } else if (leader && recruiting) {
          priority = 2;
          reason = "Owns recruiting process and suppliers";
        } else if (executive) {
          priority = small ? 3 : 1;
          reason = small
            ? "Executive likely owns hiring in a small team"
            : "Executive relevance; prefer a verified functional hiring owner";
        }
      }
      const valid =
        !former &&
        fresh(person.verified_at, c.freshness.contacts, now) &&
        currentEvidence(person.evidence);
      const explicitAuthority =
        supported(p, person.supplier_authority, c.freshness.contacts, now) &&
        person.supplier_authority.confidence === "observed" &&
        currentEvidence(person.supplier_authority.evidence);
      const authority_level = explicitAuthority
        ? person.supplier_authority.value
        : "unverified";
      return {
        ...person,
        authority_level,
        relevance:
          priority && authority_level !== "not_relevant"
            ? "decision-maker"
            : "other",
        priority,
        reason,
        current: valid,
        verification_note: valid
          ? "Recent role evidence; verify again before human contact"
          : "Role is former, stale, or lacks dated secondary-source corroboration; verify on a current company page",
      };
    })
    .sort(
      (a, b) =>
        Number(b.current) - Number(a.current) ||
        b.priority - a.priority ||
        a.name.localeCompare(b.name),
    );
}
export function validateOpeningDetails(o, evidence, now = new Date()) {
  if(o.reconciliation_at!==undefined)stamp(o.reconciliation_at,now);
  for (const k of [
    "provider",
    "board",
    "posting_id",
    "requisition_id",
    "duplicate_group",
    "capture",
  ])
    if (o[k] !== undefined) text(o[k], `opening.${k}`, 500);
  if (o.capture !== undefined)
    assert(/^[a-f0-9]{64}$/.test(o.capture), "Invalid capture reference");
  if (o.reconciliation_needed !== undefined)
    assert(
      typeof o.reconciliation_needed === "boolean",
      "Invalid reconciliation marker",
    );
  if (o.aliases !== undefined) {
    assert(Array.isArray(o.aliases), "aliases must be an array");
    o.aliases.forEach(url);
  }
  if (o.eligibility !== undefined) {
    keys(
      o.eligibility,
      ["status", "evidence", "rationale", "geography"],
      "eligibility",
    );
    const e = o.eligibility;
    assert(
      ["eligible", "possible", "restricted", "unknown"].includes(e.status),
      "Invalid opening eligibility",
    );
    if (e.status === "unknown")
      assert(
        Array.isArray(e.evidence) && !e.evidence.length,
        "Unknown eligibility has no supporting evidence",
      );
    else {
      references(e.evidence, evidence, "eligibility");
      text(e.rationale, "eligibility rationale");
      text(e.geography, "eligibility geography");
    }
  }
}

// Additive evidence review: old records and snapshots remain readable, but
// absent checks cannot establish current demand. This validates recorded
// provenance and freshness, not the semantic truth of an agent's assertions.
export function validateOpeningVerification(o, p) {
  if (o.verification === undefined) return;
  keys(o.verification,['role','ownership','attribution','currency','market'],'opening.verification');
  const states = {role:['read','unreadable','unknown'],ownership:['verified','unverified','unknown'],
    attribution:['verified','unknown'],currency:['confirmed','conflicting','unknown'],market:['us','non_us','unknown']};
  for (const [key,v] of Object.entries(o.verification)) {
    keys(v,key==='ownership'?['status','evidence','rationale','method','url']:['status','evidence','rationale'],`verification.${key}`);
    assert(states[key].includes(v.status),`Invalid verification.${key} status`);
    assert(Array.isArray(v.evidence),`verification.${key}.evidence: expected array`);
    if(v.evidence.length) references(v.evidence,p.evidence,`verification.${key}`);
    if(v.rationale!==undefined)text(v.rationale,`verification.${key}.rationale`);
    if(key==='ownership' && v.method!==undefined)assert(['first_party','official_link'].includes(v.method),'Invalid ownership method');
    if(key==='ownership' && v.url!==undefined)url(v.url);
    if(v.status!=='unknown') {references(v.evidence,p.evidence,`verification.${key}`);text(v.rationale,`verification.${key}.rationale`);}
    if(key==='ownership' && v.status==='verified') {
      assert(['first_party','official_link'].includes(v.method),'Verified ownership requires first_party or official_link');
      const own = address => {const host=domain(address);return p.domains.some(d=>host===d||host.endsWith('.'+d));};
      assert(v.evidence.some(id=>{const e=p.evidence.find(e=>e.id===id);return e.source_type==='primary'&&own(e.url);}),
        'Ownership requires evidence from the official company website');
      if(v.method==='first_party') assert(own(o.url),'First-party ownership requires an opening on the company website');
      else {
        url(v.url);
        const scope=new URL(v.url),target=new URL(o.board && /^https:\/\//.test(o.board)?o.board:o.url);
        assert(scope.origin===target.origin && (target.pathname===scope.pathname || target.pathname.startsWith(scope.pathname.replace(/\/$/,'')+'/')),
          'Official link must identify this opening or its board, not another tenant');
        assert(v.evidence.some(id=>{const e=p.evidence.find(e=>e.id===id);return e.source_type==='primary'&&own(e.url)&&e.excerpt.includes(v.url);}),
          'Official-link evidence must retain the actual linked URL');
      }
    }
    if(key==='currency' && v.status==='confirmed') assert(v.evidence.some(id=>p.evidence.find(e=>e.id===id).source_type==='primary'),
      'Confirmed opening currency requires primary evidence');
  }
}
export function openingVerificationGaps(o,p,c,now=new Date()) {
  const gaps=[],v=o.verification;
  for(const [key,status] of Object.entries({role:'read',ownership:'verified',attribution:'verified',currency:'confirmed'})) {
    const check=v?.[key];
    if(check?.status!==status) gaps.push(`${key}: ${check?.status??'not recorded'}`);
    else if(!check.evidence?.length || !check.evidence.every(id=>p.evidence.some(e=>e.id===id&&fresh(e.observed_at,c.freshness.openings,now))))gaps.push(`${key}: stale or missing evidence`);
  }
  return gaps;
}
// Record identity is not vacancy identity. Multiple postings of one requisition
// remain inspectable records but share one demand group. A shared careers URL
// is only evidence location, never sufficient to identify a listing.
function openingIdentity(o) {
  if (o.posting_id && o.board)
    return JSON.stringify(["posting", o.provider ?? "manual", o.board, o.posting_id]);
  const normalized = (value) => (value ?? "").trim().replace(/\s+/g, " ").toLowerCase();
  return JSON.stringify(["listing", normalizeUrl(o.url), normalized(o.title),
    normalized(o.location), normalized(o.employer), o.hiring_for,
    o.provider ?? null, o.board ?? null, o.requisition_id ?? null]);
}
export function vacancyKey(o) {
  if (o.duplicate_group) return "group:" + o.duplicate_group;
  if (o.requisition_id && o.board)
    return `req:${o.provider ?? "manual"}:${o.board}:${o.requisition_id}`;
  if (o.posting_id && o.board)
    return `posting:${o.provider ?? "manual"}:${o.board}:${o.posting_id}`;
  return "listing:" + (o.id ?? openingIdentity(o));
}
export function scoreProspect(p, c, now = new Date()) {
  const f = p.facts;
  const known = (k) => supported(p, f[k], c.freshness.facts, now);
  const observed = (k) => known(k) && f[k].confidence === "observed";
  const evidenceFresh = (ids) =>
    ids?.length &&
    ids.every((id) =>
      p.evidence.some(
        (e) => e.id === id && fresh(e.observed_at, c.freshness.openings, now),
      ),
    );
  const rows = p.openings.filter(
    (o) =>
      o.status === "open" &&
      o.reviewed !== false &&
      !o.reconciliation_needed &&
      openingVerificationGaps(o,p,c,now).length === 0 &&
      c.icps[p.icp].role_families.includes(o.role_family) &&
      fresh(o.verified_at, c.freshness.openings, now) &&
      evidenceFresh(o.evidence) &&
      o.hiring_for === (p.icp === "agency" ? "client" : "self"),
  );
  const groups = new Map();
  for (const o of rows) {
    const k = vacancyKey(o);
    groups.set(k, [...(groups.get(k) ?? []), o]);
  }
  const openingGroups = [...groups.values()];
  // Different posting IDs do not prove separate hires. Keep ambiguous records
  // separate, but require distinct role titles or reviewed identities for the
  // multiple-vacancy bonus. Requisition IDs are only comparable within a board.
  const distinctDemand = (a, b) =>
    a.title.trim().toLowerCase() !== b.title.trim().toLowerCase() ||
    (a.duplicate_group && b.duplicate_group && a.duplicate_group !== b.duplicate_group) ||
    (a.requisition_id && b.requisition_id && a.board && a.board === b.board &&
      (a.provider ?? 'manual') === (b.provider ?? 'manual') && a.requisition_id !== b.requisition_id);
  const multipleDemand = openingGroups.some((group, i) =>
    openingGroups.some((other, j) =>
      i !== j && group.every((a) => other.every((b) => distinctDemand(a, b))),
    ),
  );
  const duplicateCandidates = rows
    .filter((o, i) => rows.some((other, j) =>
      i !== j && vacancyKey(other) !== vacancyKey(o) && !distinctDemand(o, other),
    ))
    .map((o) => o.id);
  const eligibility = (group) => {
    const states = group.map((o) =>
      evidenceFresh(o.eligibility?.evidence) ? o.eligibility.status : "unknown",
    );
    if (states.includes("restricted")) return "restricted";
    if (states.includes("eligible")) return "eligible";
    return states.includes("possible") ? "possible" : "unknown";
  };
  const eligible = openingGroups.filter((g) => eligibility(g) === "eligible");
  const possible = openingGroups.filter((g) => eligibility(g) === "possible");
  const sizeKey = p.icp === "agency" ? "recruiter_count" : "employee_count";
  const range =
    c.icps[p.icp][p.icp === "agency" ? "recruiter_range" : "employee_range"];
  const size = observed(sizeKey)
    ? Array.isArray(f[sizeKey].value)
      ? f[sizeKey].value
      : [f[sizeKey].value, f[sizeKey].value]
    : null;
  const outside = size && (size[1] < range[0] || size[0] > range[1]);
  const fits = size && size[0] >= range[0] && size[1] <= range[1];
  const us = observed("us_market") && f.us_market.value === true;
  const service = known("service_fit") && !!f.service_fit.value?.trim();
  const partnerRequest =
    p.icp === "agency" &&
    observed("latam_delivery_request") &&
    evidenceFresh(f.latam_delivery_request.evidence) &&
    f.latam_delivery_request.value === true;
  const pain =
    known("recruiting_pain") &&
    (f.recruiting_pain.value === "none" ||
      !!(f.recruiting_pain.basis && f.recruiting_pain.rationale));
  const contacts = rankedContacts(p, c, now).filter(
    (x) => x.current && x.relevance === "decision-maker",
  );
  // Functional access is a role heuristic, not proof of supplier buying authority.
  const access = contacts.some((x) => x.authority_level === "confirmed" || x.priority > 1)
    ? 1
    : contacts.length
      ? 0.5
      : 0;
  const levels = {
    demand: multipleDemand ? 1 : openingGroups.length ? 0.5 : 0,
    fit: us ? (fits ? 1 : 0.5) : 0,
    latam: eligible.length || partnerRequest ? 1 : possible.length ? 0.5 : 0,
    need:
      service && pain
        ? Math.min(
            { none: 0, mixed: 0.5, strong: 1 }[f.recruiting_pain.value],
            observed("recruiting_pain") ? 1 : 0.5,
          )
        : 0,
    access,
  };
  const coverage = {
    demand: !!openingGroups.length,
    fit: !!(us && size),
    latam: !!(eligible.length || possible.length || partnerRequest),
    need: !!(service && pain),
    access: access === 1,
  };
  const dimensions = Object.fromEntries(
    Object.entries(c.icps[p.icp].weights).map(([k, weight]) => [
      k,
      {
        level: levels[k],
        points: levels[k] * weight,
        weight,
        known: coverage[k],
      },
    ]),
  );
  const total = Math.round(
    Object.values(dimensions).reduce((s, d) => s + d.points, 0),
  );
  const evidenceCoverage = Object.values(dimensions).reduce(
    (s, d) => s + (d.known ? d.weight : 0),
    0,
  );
  const hard = p.blockers
    .filter(
      (b) =>
        b.confidence === "observed" &&
        b.evidence.every((id) =>
          p.evidence.some(
            (e) => e.id === id && fresh(e.observed_at, c.freshness.facts, now),
          ),
        ),
    )
    .map((b) => b.text);
  if (observed("us_market") && !f.us_market.value)
    hard.push("Outside the configured U.S. client market");
  if (
    p.icp === "agency" &&
    c.icps.agency.exclude_latam_specialists &&
    observed("latam_specialist") &&
    f.latam_specialist.value
  )
    hard.push("Already specializes in LATAM recruiting");
  const companyRestriction =
    p.icp === "startup" &&
    observed("latam_compatibility") &&
    f.latam_compatibility.value === "restricted";
  const technologyFit = p.icp !== "agency" || (observed("tech_focus") && f.tech_focus.value === true);
  const common =
    technologyFit &&
    us &&
    service &&
    !outside &&
    !hard.length &&
    !companyRestriction &&
    !p.hold &&
    !p.suppressed;
  const qualificationPath =
    (openingGroups.length > 0 && eligible.length > 0) || partnerRequest;
  const qualified =
    common &&
    qualificationPath &&
    total >= c.scoring.qualify &&
    evidenceCoverage >= c.scoring.coverage;
  const provisional =
    common &&
    openingGroups.length > 0 &&
    (p.icp === "agency"
      ? observed("tech_focus") && f.tech_focus.value === true
      : possible.length > 0 || eligible.length > 0);
  const tier = hard.length
    ? "DISQUALIFIED"
    : qualified
      ? "QUALIFIED"
      : provisional
        ? "PROVISIONAL"
        : "RESEARCHING";
  const gaps = [];
  const verificationGaps=p.openings.filter(o=>o.status==='open').map(o=>({id:o.id,reasons:[
    ...openingVerificationGaps(o,p,c,now),...(o.reconciliation_needed?['Opening currentness reconciliation required']:[])
  ]})).filter(o=>o.reasons.length);
  if(verificationGaps.length)gaps.push('Opening verification incomplete; inspect opening_verification_gaps');
  if (duplicateCandidates.length)
    gaps.push("Possible duplicate postings require identity review; counts may overstate distinct vacancies");
  if (!technologyFit) gaps.push("Technology recruiting focus not verified");
  if (!openingGroups.length)
    gaps.push("Current attributable backend/full-stack demand not verified");
  if (!us) gaps.push("U.S. client market not verified");
  if (!eligible.length && !partnerRequest)
    gaps.push("Confirmed LATAM-serviceable demand not verified");
  if (!service) gaps.push("Supported service-fit hypothesis missing");
  if (companyRestriction)
    gaps.push(
      "Company-wide restriction conflicts with LATAM eligibility; reconcile before outreach",
    );
  if (outside) gaps.push("Outside configured ICP size range");
  if (total < c.scoring.qualify)
    gaps.push("Below qualification score threshold");
  if (evidenceCoverage < c.scoring.coverage)
    gaps.push("Insufficient evidence coverage for qualification");
  if (p.hold || p.suppressed) gaps.push("On hold or suppressed");
  return {
    total,
    coverage: evidenceCoverage,
    dimensions,
    opening_count: openingGroups.length,
    eligible_opening_count: eligible.length,
    possible_opening_count: possible.length,
    opening_ids: rows.map((o) => o.id),
    opening_verification_gaps: verificationGaps,
    us_opening_count: openingGroups.filter(g=>g.some(o=>o.verification?.market?.status==='us'&&evidenceFresh(o.verification.market.evidence))).length,
    recommendation: tier,
    tier,
    gaps,
    blockers: hard,
    scored_at: now.toISOString(),
    config_hash: hash(c),
    heuristic: true,
    duplicate_candidates: duplicateCandidates,
    pain_assessment: pain
      ? {
          basis: f.recruiting_pain.basis ?? "reported_no_pain",
          rationale: f.recruiting_pain.rationale ?? null,
          evidence: f.recruiting_pain.evidence,
        }
      : {
          basis: "unknown",
          rationale: "Vacancies alone do not establish recruiting difficulty",
          evidence: [],
        },
  };
}
export function localDate(at, timezone) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(at));
}
export function addDays(day, n) {
  const d = new Date(`${day}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
