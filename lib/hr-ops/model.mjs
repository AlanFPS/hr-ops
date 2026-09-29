import { createHash } from "node:crypto";
import { isIP } from "node:net";
import { isBlockedAddress } from "../../providers/_ip-guard.mjs";
import { normalizeUrl } from "../../url-key.mjs";

export const VERSION = 1;
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
];
export const DEFAULTS = {
  schema_version: VERSION,
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
    sources: [],
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
    .update(typeof value === "string" ? value : JSON.stringify(value))
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
export function mergeConfig(base, extra) {
  const result = structuredClone(base);
  for (const [key, value] of Object.entries(extra ?? {})) {
    assert(
      !["__proto__", "constructor", "prototype"].includes(key),
      "Unsafe configuration key",
    );
    result[key] =
      value && typeof value === "object" && !Array.isArray(value)
        ? mergeConfig(result[key] ?? {}, value)
        : value;
  }
  return result;
}
export function validateConfig(c) {
  assert(c.schema_version === VERSION, "Unsupported config schema");
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
  keys(e, ["id", "url", "excerpt", "observed_at", "source_type"], "evidence");
  text(e.id, "evidence.id", 120);
  url(e.url);
  text(e.excerpt, "evidence.excerpt", 4000);
  stamp(e.observed_at, now);
  assert(
    ["primary", "secondary"].includes(e.source_type),
    "Evidence source_type must be primary or secondary",
  );
}
export function validateFact(f, evidence, label) {
  keys(f, ["value", "confidence", "evidence"], "fact");
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
      Number.isInteger(f.value) && f.value >= 0,
      `${label}: use an integer or unknown`,
    );
  if (
    ["us_market", "tech_focus", "latam_specialist"].includes(label) &&
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
      "latam_compatibility",
      "recruiting_pain",
    ].includes(label)
  )
    text(f.value, label);
}
export function blankProspect(input, now = new Date()) {
  keys(input, ["name", "website", "icp", "evidence"], "prospect");
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
    const key = normalizeUrl(opening.url);
    const old = p.openings.find((o) => normalizeUrl(o.url) === key);
    const row = {
      ...opening,
      id: old?.id ?? hash(key).slice(0, 16),
      reviewed: !collected,
    };
    observations.push(row);
    // Legacy rows have no flag and are conservatively treated as reviewed.
    if (collected && old && old.reviewed !== false) continue;
    p.openings = p.openings.filter((o) => o.id !== row.id);
    p.openings.push(row);
  }
  for (const contact of input.contacts ?? []) {
    keys(
      contact,
      ["id", "name", "title", "url", "email", "verified_at", "evidence"],
      "contact",
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
  const small =
    supported(p, p.facts.employee_count, c.freshness.facts, now) &&
    p.facts.employee_count.value <= 30;
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
        /\b(founder|ceo|chief executive officer|managing partner|founding partner|business owner|company owner)\b/.test(
          title,
        ) ||
        /^(?:co )?owner$/.test(title) ||
        title === "partner" ||
        title === "president";
      const leader = /\b(vp|svp|evp|vice president|head|director|lead)\b/.test(
        title,
      );
      const recruiting = /\b(recruiting|recruitment|talent|delivery)\b/.test(
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
            ? "Founder likely owns hiring in a small team"
            : "Executive relevance; prefer a verified functional hiring owner";
        }
      }
      const valid =
        !former &&
        fresh(person.verified_at, c.freshness.contacts, now) &&
        person.evidence.every((id) =>
          p.evidence.some(
            (e) =>
              e.id === id && fresh(e.observed_at, c.freshness.contacts, now),
          ),
        );
      return {
        ...person,
        relevance: priority ? "decision-maker" : "other",
        priority,
        reason,
        current: valid,
      };
    })
    .sort(
      (a, b) =>
        Number(b.current) - Number(a.current) ||
        b.priority - a.priority ||
        a.name.localeCompare(b.name),
    );
}
export function scoreProspect(p, c, now = new Date()) {
  const f = p.facts;
  const known = (k) => supported(p, f[k], c.freshness.facts, now);
  const observed = (k) => known(k) && f[k].confidence === "observed";
  const openings = p.openings.filter(
    (o) =>
      o.status === "open" &&
      o.reviewed !== false &&
      c.icps[p.icp].role_families.includes(o.role_family) &&
      fresh(o.verified_at, c.freshness.openings, now) &&
      o.evidence.every((id) =>
        p.evidence.some(
          (e) => e.id === id && fresh(e.observed_at, c.freshness.openings, now),
        ),
      ) &&
      (p.icp === "agency"
        ? o.hiring_for === "client"
        : o.hiring_for === "self"),
  );
  const sizeKey = p.icp === "agency" ? "recruiter_count" : "employee_count";
  const range =
    c.icps[p.icp][p.icp === "agency" ? "recruiter_range" : "employee_range"];
  const fit =
    observed("us_market") && f.us_market.value === true
      ? observed(sizeKey)
        ? f[sizeKey].value >= range[0] && f[sizeKey].value <= range[1]
          ? 1
          : 0.5
        : 0.5
      : 0;
  const latam = known("latam_compatibility")
    ? { yes: 1, possible: 0.5, restricted: 0 }[f.latam_compatibility.value]
    : 0;
  const serviceFit =
    known("service_fit") &&
    typeof f.service_fit.value === "string" &&
    f.service_fit.value.trim().length > 0;
  const need =
    serviceFit && known("recruiting_pain")
      ? { none: 0, mixed: 0.5, strong: 1 }[f.recruiting_pain.value]
      : 0;
  const access = rankedContacts(p, c, now).filter(
    (x) => x.current && x.relevance === "decision-maker",
  );
  const levels = {
    demand: openings.length >= 2 ? 1 : openings.length ? 0.5 : 0,
    fit,
    latam: Math.min(latam, observed("latam_compatibility") ? 1 : 0.5),
    need: Math.min(need, observed("recruiting_pain") ? 1 : 0.5),
    access: access.length ? 1 : 0,
  };
  const coverage = {
    demand: openings.length > 0,
    fit: observed("us_market") && observed(sizeKey),
    latam: known("latam_compatibility"),
    need: !!serviceFit && known("recruiting_pain"),
    access: access.length > 0,
  };
  const weights = c.icps[p.icp].weights;
  const dimensions = Object.fromEntries(
    Object.keys(weights).map((k) => [
      k,
      {
        level: levels[k],
        points: weights[k] * levels[k],
        weight: weights[k],
        known: !!coverage[k],
      },
    ]),
  );
  const total = Math.round(
    Object.values(dimensions).reduce((n, d) => n + d.points, 0),
  );
  const evidenceCoverage = Object.values(dimensions).reduce(
    (n, d) => n + (d.known ? d.weight : 0),
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
  if (observed("us_market") && f.us_market.value === false)
    hard.push("Outside the configured U.S. client market");
  if (
    p.icp === "agency" &&
    c.icps.agency.exclude_latam_specialists &&
    observed("latam_specialist") &&
    f.latam_specialist.value === true
  )
    hard.push("Already specializes in LATAM recruiting");
  const gaps = [];
  if (!openings.length)
    gaps.push("Current attributable backend/full-stack demand not verified");
  if (!observed("us_market") || f.us_market.value !== true)
    gaps.push("U.S. client market not verified");
  if (!latam) gaps.push("LATAM compatibility unknown or restricted");
  if (!serviceFit) gaps.push("Supported service-fit hypothesis missing");
  if (total < c.scoring.qualify) gaps.push("Below provisional score threshold");
  if (evidenceCoverage < c.scoring.coverage)
    gaps.push("Insufficient evidence coverage");
  if (
    observed(sizeKey) &&
    (f[sizeKey].value < range[0] || f[sizeKey].value > range[1])
  )
    gaps.push(
      "Outside configured ICP size range; review targeting before qualification",
    );
  return {
    total,
    coverage: evidenceCoverage,
    dimensions,
    opening_count: openings.length,
    opening_ids: openings.map((o) => o.id),
    recommendation: hard.length
      ? "DISQUALIFIED"
      : gaps.length
        ? "RESEARCHING"
        : "QUALIFIED",
    gaps,
    blockers: hard,
    scored_at: now.toISOString(),
    config_hash: hash(c),
    heuristic: true,
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
