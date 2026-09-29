import {
  assert,
  text,
  keys,
  hash,
  canonical,
  stamp,
  fresh,
  validDay,
  EARLY,
  STATES,
  applyResearch,
  scoreProspect,
  rankedContacts,
  localDate,
  addDays,
  supported,
  url,
} from "./model.mjs";

const CLOSED = ["CLIENT", "LOST", "DISQUALIFIED"];
const FOLLOWUP_STATES = ["CONTACTED", "REPLIED", "MEETING", "OPPORTUNITY"];
const lastSent = (p) => p.interactions.filter((e) => e.kind === "sent").at(-1);
function currentFollowupTarget(d, p) {
  const prior = lastSent(p);
  return (
    d.purpose !== "followup" ||
    !!(prior && d.reply_to === prior.id && d.contact_id === prior.contact_id)
  );
}
export function followupScheduled(p, c) {
  if (
    p.suppressed ||
    p.hold ||
    !FOLLOWUP_STATES.includes(p.status) ||
    !p.next_followup
  )
    return false;
  const attempts = p.interactions.filter((e) => e.kind === "sent").length;
  return (
    attempts > 0 &&
    (p.followup_mode === "manual" ||
      (p.status === "CONTACTED" && attempts <= c.followups.max_followups))
  );
}
export function outreachEligibility(
  p,
  c,
  now = new Date(),
  purpose = "initial",
) {
  const reasons = [];
  if (p.suppressed) reasons.push("Opt-out: DO NOT CONTACT");
  if (p.hold) reasons.push("On hold: DO NOT CONTACT");
  if (CLOSED.includes(p.status))
    reasons.push(`Closed (${p.status}): DO NOT CONTACT`);
  if (purpose === "initial" && !EARLY.includes(p.status))
    reasons.push("Initial outreach requires an early prospect state");
  if (purpose === "followup" && !followupScheduled(p, c))
    reasons.push(
      "Cannot follow up without unanswered contact or an explicitly requested follow-up",
    );
  if (scoreProspect(p, c, now).recommendation !== "QUALIFIED")
    reasons.push("Current research does not qualify this prospect");
  if (
    !rankedContacts(p, c, now).some(
      (x) => x.current && x.relevance === "decision-maker",
    )
  )
    reasons.push("A current relevant contact is required");
  return { blocked: reasons.length > 0, reasons };
}

export function qualify(p, c, now = new Date()) {
  p.score = scoreProspect(p, c, now);
  if (EARLY.includes(p.status)) {
    p.status = p.score.recommendation;
    if (
      p.status === "QUALIFIED" &&
      rankedContacts(p, c, now).some(
        (x) => x.current && x.relevance === "decision-maker",
      )
    )
      p.status = "CONTACT_IDENTIFIED";
    if (
      p.status === "CONTACT_IDENTIFIED" &&
      p.drafts.some((d) => !d.stale && draftCurrent(d, p, c, now) && d.ready)
    )
      p.status = "OUTREACH_READY";
  }
  const evidence = [
    ...new Set(
      [
        ...Object.values(p.facts),
        ...p.openings,
        ...p.contacts,
        ...p.risks,
        ...p.blockers,
      ].flatMap((x) => x.evidence ?? []),
    ),
  ];
  return {
    reason: `${p.score.recommendation}: ${p.score.total}/100; evidence coverage ${p.score.coverage}%`,
    evidence,
    decision: { score: structuredClone(p.score), config: structuredClone(c) },
  };
}
export function research(p, input, c, now = new Date()) {
  applyResearch(p, input, now);
  for (const d of p.drafts) d.stale = true;
  if (p.status === "DISCOVERED") p.status = "RESEARCHING";
  return qualify(p, c, now);
}
export function researchTasks(p, c, now = new Date()) {
  return {
    prospect_id: p.id,
    revision: p.revision,
    company: p.name,
    icp: p.icp,
    website: p.website,
    latest_collection: p.collection ?? null,
    unreviewed_openings: p.openings
      .filter((o) => o.reviewed === false)
      .map((o) => o.id),
    needs_agent_research: true,
    unknown_fields: Object.entries(p.facts)
      .filter(([, v]) => v.confidence === "unknown")
      .map(([k]) => k),
    stale_fields: Object.entries(p.facts)
      .filter(
        ([, v]) =>
          v.confidence !== "unknown" &&
          !supported(p, v, c.freshness.facts, now),
      )
      .map(([k]) => k),
    score: scoreProspect(p, c, now),
    tasks: [
      "Verify U.S. market and company identity from its website",
      "Read current engineering openings and verify attribution, location restrictions, backend/full-stack relevance",
      "Research size, recruiting resources, partners, LATAM presence and a specific service-fit hypothesis",
      "Find a currently relevant decision maker on a public company page; never guess email",
    ],
    limits: c.discovery,
    input_contract: "docs/HR_OPS.md#research-input",
  };
}
export function draftCurrent(d, p, c, now = new Date()) {
  return (
    !outreachEligibility(p, c, now, d.purpose).blocked &&
    currentFollowupTarget(d, p) &&
    rankedContacts(p, c, now).some(
      (x) =>
        x.id === d.contact_id && x.current && x.relevance === "decision-maker",
    ) &&
    !d.stale &&
    d.firm_hash === hash(c.firm) &&
    fresh(d.created_at, c.freshness.openings, now) &&
    d.claims.every(
      (cl) =>
        cl.kind === "firm" ||
        cl.evidence.every((id) =>
          p.evidence.some(
            (e) =>
              e.id === id && fresh(e.observed_at, c.freshness.openings, now),
          ),
        ),
    )
  );
}
export function outreachBrief(p, c, now = new Date()) {
  const s = scoreProspect(p, c, now);
  const contacts = rankedContacts(p, c, now);
  const eligibility = outreachEligibility(p, c, now);
  return {
    prospect_id: p.id,
    revision: p.revision,
    company: p.name,
    blocked: eligibility.blocked,
    reason: eligibility.reasons.join("; ") || null,
    needs_agent_draft: true,
    score: s,
    contacts: contacts.filter(
      (x) => x.current && x.relevance === "decision-maker",
    ),
    facts: p.facts,
    evidence: p.evidence,
    openings: p.openings.filter((o) => s.opening_ids.includes(o.id)),
    risks: p.risks,
    firm: c.firm,
    limits: c.outreach,
    send_enabled: false,
    required:
      "A verified signal, why this person, a service-fit hypothesis, one useful question. Cite every factual claim in the draft claims array. Missing firm identity stays visible.",
  };
}
function draftIdentity(d) {
  return hash({
    channel: d.channel,
    purpose: d.purpose,
    contact_id: d.contact_id,
    reply_to: d.reply_to ?? null,
    subject: d.subject ?? null,
    body: d.body.trim(),
    claims: d.claims.map((cl) => ({
      text: cl.text,
      kind: cl.kind,
      evidence: cl.evidence ?? [],
      firm_field: cl.firm_field ?? null,
    })),
  });
}
export function saveDraft(p, input, c, now = new Date()) {
  keys(
    input,
    [
      "channel",
      "contact_id",
      "subject",
      "body",
      "claims",
      "purpose",
      "reply_to",
    ],
    "draft",
  );
  const eligibility = outreachEligibility(p, c, now, input.purpose);
  assert(!eligibility.blocked, eligibility.reasons.join("; "));
  assert(
    !p.suppressed &&
      !p.hold &&
      !["CLIENT", "LOST", "DISQUALIFIED"].includes(p.status),
    "Prospect is suppressed, held or closed",
  );
  assert(
    scoreProspect(p, c, now).recommendation === "QUALIFIED",
    "Current research does not qualify this prospect",
  );
  assert(
    ["email", "linkedin"].includes(input.channel),
    "Channel must be email or linkedin",
  );
  assert(
    ["initial", "followup"].includes(input.purpose),
    "Draft purpose required",
  );
  const person = rankedContacts(p, c, now).find(
    (x) =>
      x.id === input.contact_id &&
      x.current &&
      x.relevance === "decision-maker",
  );
  assert(person, "A current relevant contact is required");
  if (input.purpose === "followup") {
    const prior = lastSent(p);
    assert(
      prior && prior.contact_id === input.contact_id,
      "Follow-up recipient must match the last actual contact",
    );
    assert(
      input.reply_to === undefined || input.reply_to === prior.id,
      "Follow-up must reference the latest sent interaction",
    );
    input = { ...input, reply_to: prior.id };
  } else
    assert(
      input.reply_to === undefined,
      "Initial outreach cannot reference prior contact",
    );
  const body = text(input.body, "body", 5000);
  if (input.channel === "email") text(input.subject, "subject", 160);
  const limit =
    input.purpose === "followup"
      ? c.outreach.followup_max_words
      : c.outreach.email_max_words;
  if (input.channel === "linkedin")
    assert(
      [...body].length <= c.outreach.linkedin_max_chars,
      "LinkedIn draft exceeds configured limit",
    );
  else
    assert(
      body.split(/\s+/).length <= limit,
      "Email draft exceeds configured word limit",
    );
  assert(
    Array.isArray(input.claims) && input.claims.length > 0,
    "Draft must include its claim/evidence checklist",
  );
  for (const claim of input.claims) {
    keys(claim, ["text", "kind", "evidence", "firm_field"], "claim");
    text(claim.text, "claim.text");
    assert(
      body.includes(claim.text) || (input.subject ?? "").includes(claim.text),
      "Claim must occur verbatim in the draft",
    );
    assert(
      ["observed", "hypothesis", "firm"].includes(claim.kind),
      "Invalid claim kind",
    );
    if (claim.kind === "firm") {
      assert(
        [
          "services",
          "fees",
          "guarantees",
          "candidate_availability",
          "name",
          "sender_name",
        ].includes(claim.firm_field),
        "Unknown firm claim field",
      );
      assert(
        c.firm[claim.firm_field] !== null &&
          c.firm[claim.firm_field] !== undefined &&
          c.firm[claim.firm_field]?.length !== 0,
        "Firm claim is not configured",
      );
    } else {
      assert(
        Array.isArray(claim.evidence) && claim.evidence.length > 0,
        "External claims need citations",
      );
      for (const id of claim.evidence)
        assert(
          p.evidence.some(
            (e) =>
              e.id === id && fresh(e.observed_at, c.freshness.openings, now),
          ),
          `Draft evidence missing or stale: ${id}`,
        );
    }
  }
  const combined = [input.subject ?? "", body].join(" ");
  for (const pattern of [
    /\bguarantee(?:d|s)?\b/i,
    /\b\d+\s*%|\$\s*\d|\bfee(?:s)?\b/i,
    /\b(?:candidates?|engineers?)\s+(?:ready|available)|\bavailable\s+(?:candidates?|engineers?)\b/i,
  ]) {
    if (pattern.test(combined)) {
      const field = pattern.source.includes("guarantee")
        ? "guarantees"
        : pattern.source.includes("fee")
          ? "fees"
          : "candidate_availability";
      assert(
        c.firm[field] != null &&
          input.claims.some(
            (cl) => cl.kind === "firm" && cl.firm_field === field,
          ),
        `Unconfirmed commercial claim: ${field}`,
      );
    }
  }
  for (const number of combined.match(/\b\d+(?:[.,]\d+)*\b/g) ?? [])
    assert(
      input.claims.some(
        (cl) =>
          cl.text.includes(number) &&
          (cl.kind === "firm" ||
            cl.evidence.some((id) =>
              p.evidence.find((e) => e.id === id)?.excerpt.includes(number),
            )),
      ),
      "Numeric draft claim lacks matching evidence",
    );
  const identity = draftIdentity({ ...input, body });
  const duplicates = p.drafts.filter((d) => draftIdentity(d) === identity);
  const id = duplicates[0]?.id ?? identity.slice(0, 16);
  if (duplicates.length === 1 && draftCurrent(duplicates[0], p, c, now))
    return { noop: true };
  const missing = [];
  if (!c.firm.name) missing.push("firm.name");
  if (!c.firm.sender_name) missing.push("firm.sender_name");
  if (input.channel === "email" && !c.firm.email) missing.push("firm.email");
  if (input.channel === "email" && !person.email)
    missing.push("public recipient email");
  const d = {
    ...input,
    body,
    id,
    content_hash: hash(combined),
    firm_hash: hash(c.firm),
    created_at: now.toISOString(),
    stale: false,
    ready: missing.length === 0,
    missing,
    review: "pending_human_review",
    send_enabled: false,
  };
  p.drafts = p.drafts.filter((x) => !duplicates.includes(x));
  p.drafts.push(d);
  const decision = qualify(p, c, now);
  return {
    ...decision,
    reason: "Draft saved for human review; nothing sent",
    evidence: input.claims.flatMap((x) => x.evidence ?? []),
  };
}
function authorization(value) {
  keys(value, ["actor", "reference", "statement"], "authorization");
  assert(
    value.actor === "human",
    "Requires a human instruction, not autonomous authorization",
  );
  text(value.reference, "human instruction reference", 500);
  text(value.statement, "human instruction statement", 2000);
  return value;
}
export function recordInteraction(p, input, c, now = new Date()) {
  keys(
    input,
    [
      "id",
      "kind",
      "at",
      "authorization",
      "draft_id",
      "content_hash",
      "contact_id",
      "channel",
      "message",
      "response",
      "next_followup",
      "reason",
      "evidence",
      "target",
      "reply_to",
    ],
    "interaction",
  );
  text(input.id, "interaction.id", 120);
  const normalized = { ...input, at: stamp(input.at, now) };
  const existing = p.interactions.find((e) => e.id === input.id);
  if (existing) {
    // Recompute legacy identity from stored content; old hashes depended on key order.
    const { input_hash, ...stored } = existing;
    if (
      input.kind === "reply" &&
      input.reply_to === undefined &&
      stored.reply_to !== undefined
    )
      normalized.reply_to = stored.reply_to;
    assert(
      hash(canonical(stored)) === hash(canonical(normalized)),
      "Idempotency key reused with different content",
    );
    return { noop: true };
  }
  const auth = authorization(input.authorization);
  const at = stamp(input.at, now);
  assert(
    input.reply_to === undefined || input.kind === "reply",
    "Only replies can reference a prior sent interaction",
  );
  let replyTo;
  assert(
    [
      "sent",
      "reply",
      "meeting",
      "opportunity",
      "client",
      "lost",
      "disqualified",
      "reopen",
      "hold",
      "resume",
      "optout",
      "review",
      "alias",
    ].includes(input.kind),
    "Unsupported interaction kind",
  );
  text(
    input.reason ?? input.message ?? input.response ?? input.target,
    "interaction context",
  );
  const override = Object.hasOwn(input, "next_followup");
  if (override) {
    assert(
      ["sent", "reply", "meeting", "opportunity"].includes(input.kind),
      "This event does not support a follow-up override",
    );
    if (input.next_followup !== null) validDay(input.next_followup);
    assert(
      !p.suppressed && !p.hold && !CLOSED.includes(p.status),
      "Cannot schedule through a suppressed, held or closed prospect",
    );
  }
  if (input.kind === "sent") {
    assert(
      !p.suppressed &&
        !p.hold &&
        !["CLIENT", "LOST", "DISQUALIFIED"].includes(p.status),
      "Contact cannot be recorded through a suppressed/closed prospect; correct the state first",
    );
    assert(["email", "linkedin"].includes(input.channel), "Channel required");
    assert(
      p.contacts.some((x) => x.id === input.contact_id),
      "Known contact required",
    );
    text(input.message, "exact sent message");
    if (input.draft_id) {
      const draft = p.drafts.find((d) => d.id === input.draft_id);
      assert(
        draft &&
          draft.body === input.message &&
          draft.content_hash === input.content_hash &&
          draft.contact_id === input.contact_id &&
          draft.channel === input.channel,
        "Sent record does not match the exact draft",
      );
    }
    const sent = p.interactions.filter((x) => x.kind === "sent");
    assert(
      !sent.length ||
        Date.parse(at) >= Math.max(...sent.map((x) => Date.parse(x.at))),
      "Backdated sent event needs explicit history correction, not automatic cadence",
    );
    if (EARLY.includes(p.status)) p.status = "CONTACTED";
    p.next_followup =
      p.status === "CONTACTED" && sent.length < c.followups.max_followups
        ? addDays(
            localDate(at, c.timezone),
            sent.length ? c.followups.subsequent_days : c.followups.first_days,
          )
        : null;
    p.followup_mode = p.next_followup ? "automatic" : null;
  } else if (input.kind === "reply") {
    text(input.response, "response");
    const prior = lastSent(p);
    assert(prior, "Reply requires prior contact");
    assert(
      input.reply_to === undefined || input.reply_to === prior.id,
      "Reply must reference the latest sent interaction; older history needs explicit correction",
    );
    assert(
      input.contact_id === undefined || input.contact_id === prior.contact_id,
      "Reply recipient must match prior contact",
    );
    const cadenceEvents = p.interactions.filter((e) =>
      [
        "sent",
        "reply",
        "meeting",
        "opportunity",
        "client",
        "lost",
        "disqualified",
        "reopen",
        "hold",
        "resume",
        "optout",
      ].includes(e.kind),
    );
    assert(
      cadenceEvents.every((e) => Date.parse(at) >= Date.parse(e.at)),
      "Backdated reply needs explicit history correction; current reminders are preserved",
    );
    replyTo = prior.id;
    if (p.status === "CONTACTED") p.status = "REPLIED";
    p.next_followup = null;
  } else if (["meeting", "opportunity", "client"].includes(input.kind)) {
    const required = {
      meeting: ["CONTACTED", "REPLIED", "MEETING"],
      opportunity: ["MEETING", "OPPORTUNITY"],
      client: ["OPPORTUNITY", "CLIENT"],
    };
    assert(
      required[input.kind].includes(p.status),
      "Invalid commercial transition",
    );
    p.status = input.kind.toUpperCase();
    p.next_followup = null;
  } else if (["lost", "disqualified"].includes(input.kind)) {
    assert(input.reason, "Disposition requires reason");
    p.status = input.kind.toUpperCase();
    p.next_followup = null;
  } else if (input.kind === "optout") {
    p.suppressed = true;
    p.next_followup = null;
  } else if (input.kind === "hold") {
    p.hold = true;
  } else if (input.kind === "resume") {
    assert(!p.suppressed, "Opt-out cannot be cleared by resume");
    p.hold = false;
  } else if (input.kind === "reopen") {
    assert(!p.suppressed, "Opt-out remains binding");
    assert(
      ["LOST", "DISQUALIFIED"].includes(p.status),
      "Only closed prospects can be reopened",
    );
    p.status = "RESEARCHING";
    p.next_followup = null;
    for (const d of p.drafts) d.stale = true;
  } else if (input.kind === "review") {
    const d = p.drafts.find((x) => x.id === input.draft_id);
    assert(
      d && d.content_hash === input.content_hash && draftCurrent(d, p, c, now),
      "Review must bind to the current exact draft",
    );
    d.review = "human_review_recorded";
    d.review_authorization = auth;
  } else if (input.kind === "alias") {
    const alias = new URL(url(input.target)).hostname
      .toLowerCase()
      .replace(/^www\./, "");
    if (!p.domains.includes(alias)) p.domains.push(alias);
  }
  if (override) {
    p.next_followup = input.next_followup;
    p.followup_mode = p.next_followup ? "manual" : null;
  }
  if (!p.next_followup) p.followup_mode = null;
  if (
    [
      "optout",
      "hold",
      "lost",
      "disqualified",
      "client",
      "sent",
      "reply",
      "meeting",
      "opportunity",
    ].includes(input.kind)
  )
    for (const d of p.drafts) {
      d.stale = true;
      d.ready = false;
    }
  const recorded = { ...input, at, ...(replyTo ? { reply_to: replyTo } : {}) };
  p.interactions.push({ ...recorded, input_hash: hash(canonical(recorded)) });
  const decision = qualify(p, c, now);
  // Reopening authorizes a new research cycle, not immediate reapplication of
  // the old disposition. The next research/qualify operation resolves it.
  if (input.kind === "reopen") p.status = "RESEARCHING";
  return {
    ...decision,
    reason: input.reason ?? `Human-reported ${input.kind}`,
    authorization: auth,
    evidence: [...new Set([...decision.evidence, ...(input.evidence ?? [])])],
  };
}
export function dueFollowups(
  prospects,
  c,
  day = localDate(new Date(), c.timezone),
) {
  validDay(day);
  return prospects
    .filter((p) => followupScheduled(p, c) && p.next_followup <= day)
    .map((p) => ({
      id: p.id,
      company: p.name,
      revision: p.revision,
      status: p.status,
      due: p.next_followup,
      schedule: p.followup_mode ?? "automatic",
      attempts: p.interactions.filter((e) => e.kind === "sent").length,
      last_contact: lastSent(p),
      needs_agent_draft: true,
      send_enabled: false,
    }))
    .sort(
      (a, b) =>
        a.due.localeCompare(b.due) || a.company.localeCompare(b.company),
    );
}
export function dossier(p, c, now = new Date()) {
  const s = scoreProspect(p, c, now);
  const controls = p.suppressed || p.hold || CLOSED.includes(p.status);
  const lines = [
    `# ${p.name}`,
    ``,
    `Status: ${p.status} | ICP: ${p.icp} | Score: ${s.total}/100 | Evidence coverage: ${s.coverage}%`,
    `Revision: ${p.revision}`,
    `Recommendation: ${s.recommendation} (heuristic, not a conversion probability)`,
    `Website: ${p.website}`,
    `Researched: ${p.researched_at ?? "Unknown"}`,
    "",
    controls
      ? "**DO NOT CONTACT — retained drafts are historical, not actionable.**"
      : "All outreach remains draft-only; a human sends.",
    `Suppressed: ${p.suppressed} | Hold: ${p.hold} | Closed: ${CLOSED.includes(p.status)}`,
    `Attempts: ${p.interactions.filter((e) => e.kind === "sent").length} | Next follow-up: ${p.next_followup ?? "None"} (${p.followup_mode ?? "automatic"})`,
    "",
    "## Interaction history",
    ...p.interactions.map(
      (e) =>
        `- ${e.at} — ${e.kind}: ${e.reason ?? e.message ?? e.response ?? e.target ?? ""}${e.response ? ` Response: ${e.response}` : ""}`,
    ),
    "",
    "## Dossier",
  ];
  for (const [key, f] of Object.entries(p.facts))
    lines.push(
      `- ${key}: ${f.confidence === "unknown" ? "Unknown" : `${f.value} (${f.confidence}; ${(f.evidence ?? []).join(", ")})`}`,
    );
  lines.push(
    "",
    "## Score",
    ...Object.entries(s.dimensions).map(
      ([k, d]) =>
        `- ${k}: ${d.points}/${d.weight}${d.known ? "" : " — incomplete evidence"}`,
    ),
    "",
    "## Gaps and risks",
    ...s.gaps.map((x) => `- ${x}`),
    ...s.blockers.map((x) => `- BLOCKER: ${x}`),
    ...p.risks.map(
      (x) => `- ${x.text} (${x.confidence}; ${x.evidence.join(", ")})`,
    ),
    "",
    "## Openings",
    ...p.openings.map(
      (o) =>
        `- [${o.title}](${o.url}) — ${o.status}; hiring for ${o.hiring_for}; verified ${o.verified_at}`,
    ),
    "",
    "## Contacts",
    ...rankedContacts(p, c, now).map(
      (x) =>
        `- [${x.name}](${x.url}), ${x.title} — ${x.relevance}; ${x.current ? "current" : "stale"}`,
    ),
    "",
    "## Drafts — human sends",
    ...p.drafts.map(
      (d) =>
        `\n### ${d.channel} / ${d.purpose}\n${d.subject ?? ""}\n\n${d.body}\n\nReview: ${d.review}; missing: ${d.missing.join(", ") || "none"}; stale: ${!draftCurrent(d, p, c, now)}; actionable: ${d.ready && draftCurrent(d, p, c, now)}`,
    ),
    "",
    "## Evidence",
    ...p.evidence.map(
      (e) =>
        `- ${e.id}: [${e.source_type} source](${e.url}), observed ${e.observed_at}\n  > ${e.excerpt.replace(/\n/g, " ")}`,
    ),
  );
  return lines.join("\n") + "\n";
}
