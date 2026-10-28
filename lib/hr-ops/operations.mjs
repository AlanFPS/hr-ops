import {
  conversations,
  conversationId,
  refreshFollowupSummary,
} from "./conversations.mjs";
import { proseNumbers, claimProse } from "./claim-numbers.mjs";
import {draftReviewIssues} from './draft-review.mjs';
import { validateOrigin } from './inbox-state.mjs';
import {
  assert,
  text,
  keys,
  hash,
  firmFingerprint,
  canonical,
  stamp,
  fresh,
  validDay,
  EARLY,
  STATES,
  LINKEDIN_SEND_METHODS,
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
const lastSent = (p, contact) =>
  p.interactions
    .filter((e) => e.kind === "sent" && (!contact || e.contact_id === contact))
    .sort((a, b) => Date.parse(a.at) - Date.parse(b.at))
    .at(-1);
function currentFollowupTarget(d, p) {
  const prior = lastSent(p, d.contact_id);
  return (
    d.purpose !== "followup" ||
    !!(prior && d.reply_to === prior.id && d.contact_id === prior.contact_id)
  );
}
export function followupScheduled(p, c, contact) {
  return conversations(p, c).some(
    (x) => (!contact || x.contact_id === contact) && x.next_followup,
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
  if (
    !["QUALIFIED", "PROVISIONAL"].includes(
      scoreProspect(p, c, now).recommendation,
    )
  )
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
    p.status =
      p.score.recommendation === "PROVISIONAL"
        ? "RESEARCHING"
        : p.score.recommendation;
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
// Only standalone qualification may skip a write. Research must still persist
// changed evidence even when its resulting score stays the same.
export function requalify(p, c, now = new Date()) {
  const comparable = () => {
    const score = p.score ? { ...p.score } : null;
    if (score) delete score.scored_at;
    return JSON.stringify(canonical({ status: p.status, score }));
  };
  const before = comparable();
  const result = qualify(p, c, now);
  return before === comparable() ? { noop: true } : result;
}
// Advisory allocation only: the run ledger remains the authority for requests.
export function recipientIdentityNeedsReview(person,quality={}) {
  return quality.recipient_identity==='needs_review'||
    (quality.recipient_identity!=='verified'&&!/\S+\s+\S+/u.test(person.name.trim()));
}
export function researchNextStep(p, c, now = new Date(), pagesRemaining = null) {
  assert(pagesRemaining===null||(Number.isSafeInteger(pagesRemaining)&&pagesRemaining>=0),'pagesRemaining must be null or a nonnegative integer');
  const score = scoreProspect(p, c, now);
  const contacts = rankedContacts(p, c, now).filter(x=>x.current && x.relevance==='decision-maker');
  const eligibility = outreachEligibility(p,c,now);
  const stopped = p.suppressed || p.hold || CLOSED.includes(p.status) || score.blockers.length>0;
  const engaged=!EARLY.includes(p.status);
  const promising = ['PROVISIONAL','QUALIFIED'].includes(score.tier);
  const currentDrafts = p.drafts.filter(d=>d.purpose==='initial'&&draftCurrent(d,p,c,now));
  const identityGaps=contacts.filter(person=>
    (recipientIdentityNeedsReview(person)||p.drafts.some(d=>d.purpose==='initial'&&d.contact_id===person.id&&!d.superseded_by&&d.quality?.recipient_identity==='needs_review'))&&
    !currentDrafts.some(d=>d.contact_id===person.id&&d.quality?.recipient_identity==='verified')).map(person=>person.id);
  const contactNeeded = !stopped&&!engaged&&promising&&(contacts.length===0||identityGaps.length===contacts.length);
  return {advisory:true,purpose:'initial', pages_remaining:pagesRemaining,
    suggested_contact_pages:contactNeeded?Math.min(2,pagesRemaining??c.discovery.pages_per_company):0,
    current_relevant_contacts:contacts.length, draft_eligible:!eligibility.blocked,
    recipient_identity_review:identityGaps,
    draft_blockers:eligibility.reasons, current_drafts:currentDrafts.length,
    next_step:stopped?'review_restrictions':engaged?'review_conversation':contactNeeded?(contacts.length?'verify_contact_identity':'verify_contact'):!eligibility.blocked?(currentDrafts.length?'review_existing_drafts':'prepare_draft'):'resolve_research_gaps',
    note:'Keep up to two of the existing company page allowance for a current official team or leadership source once admission is supported. Reuse captures first. This is not an extra budget, a hard reservation, verified supplier authority or permission to send.'};
}
// Advisory source/recipient limitations, kept separate from the scoring rubric.
// Reading briefs must not turn a reported estimate or a title into stronger evidence.
export function researchCaveats(p, c, now = new Date()) {
  const caveats = [];
  const size = p.facts[p.icp === 'agency' ? 'recruiter_count' : 'employee_count'];
  if (supported(p, size, c.freshness.facts, now) && size.evidence.every(id =>
    p.evidence.find(e => e.id === id)?.source_type === 'secondary'))
    caveats.push('Reported size relies only on secondary sources; this is not company-confirmed headcount. Review source age and provenance before relying on the range.');
  const contacts = rankedContacts(p, c, now).filter(x => x.current && x.relevance === 'decision-maker');
  if (contacts.length && contacts.every(x => x.priority <= 1 && x.authority_level !== 'confirmed'))
    caveats.push('Only executive or secondary contacts are verified; a functional hiring or delivery owner remains unidentified.');
  if (contacts.length && contacts.every(x => x.authority_level === 'unverified'))
    caveats.push('Supplier authority remains unverified; contact relevance and research qualification do not establish buying intent.');
  if (p.openings.some(o => (o.requisition_id || o.posting_id) && !o.board))
    caveats.push('Some posting or requisition identifiers lack board scope; verify and retain the official board before using these IDs for vacancy deduplication or exact counts.');
  return caveats;
}

export function researchTasks(p, c, now = new Date()) {
  return {
    firm: c.firm,
    prospect_id: p.id,
    revision: p.revision,
    company: p.name,
    icp: p.icp,
    website: p.website,
    latest_collection: p.collection ?? null,
    conversation_review: conversations(p,c).some(x=>x.review_required) ? "Unattributed historical reply: review required; automatic reminders paused" : null,
    unreviewed_openings: p.openings
      .filter((o) => o.reviewed === false)
      .map((o) => o.id),
    opening_verification_gaps: scoreProspect(p,c,now).opening_verification_gaps,
    needs_agent_research: true,
    next_action: researchNextStep(p,c,now),
    research_caveats: researchCaveats(p,c,now),
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
      "Reuse referenced captures before requesting another page; record source/query attribution and outcomes in this run",
      "Verify U.S. market and company identity from its website",
      "Agency tech_focus means evidenced technology recruiting, not exclusive specialization. A verified IT practice plus client software searches may support true; other recruiting practices do not establish false. Keep unknown when unsupported",
      "opening.verification.market requires role-specific location or hiring-policy evidence. Generic US benefits, company offices, currency and headquarters do not establish a US opening; leave unknown",
      "Use observed result/link URLs or supported provider endpoints for an officially verified tenant; never invent paths. Do not retry hosts marked access_restricted or switch readers to bypass them",
      "Confirm the official website links to the board; do not infer ownership from a similar ATS slug",
      "Read current engineering openings and verify attribution, location restrictions, backend/full-stack relevance",
      "Record opening.verification for readable role content, official ownership, hiring attribution and primary currentness; unknown or conflicting checks earn no demand credit",
      "A readable title/list page is not a role description. Resolve conflicting secondary listings against complete current primary boards before counting demand",
      "Separate client vacancies from the agency's own jobs and remote policy; scope restrictions to the cited role",
      "Check supplier/no-agency policies; keep partner appetite unknown unless explicitly supported",
      "Research size, recruiting resources, partners, LATAM presence and a specific service-fit hypothesis",
      "Team locations establish presence only, not direct employment, contractor arrangements, supplier use or role eligibility. Preserve the engagement model as unknown unless a source explicitly supports it",
      "Similar titles, clients and locations neither prove distinct requisitions nor prove duplicates. Keep overlap unresolved without supported requisition identity or a reviewed duplicate group",
      "Find a currently relevant decision maker on a public company page; never guess email",
    ],
    limits: c.discovery,
    input_contract: "docs/HR_OPS.md#research-input",
  };
}
export function draftCurrent(d, p, c, now = new Date()) {
  return (
    !!d.quality &&
    d.quality.agent_reviewed === true &&
    draftReviewIssues(d,p,c,now).length === 0 &&
    d.intent ===
      (scoreProspect(p, c, now).tier === "PROVISIONAL"
        ? "exploratory"
        : "qualified") &&
    !d.superseded_by &&
    !outreachEligibility(p, c, now, d.purpose).blocked &&
    currentFollowupTarget(d, p) &&
    (d.purpose !== "followup" || followupScheduled(p, c, d.contact_id)) &&
    (d.channel !== "linkedin" ||
      [...d.body].length <= c.outreach.linkedin_max_chars) &&
    rankedContacts(p, c, now).some(
      (x) =>
        x.id === d.contact_id && x.current && x.relevance === "decision-maker" &&
        !recipientIdentityNeedsReview(x,d.quality),
    ) &&
    !d.stale &&
    d.firm_hash === firmFingerprint(c.firm) &&
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
    research_caveats: researchCaveats(p,c,now),
    existing_drafts: p.drafts.map((d) => {
      const current = draftCurrent(d, p, c, now);
      return {
        id: d.id,
        channel: d.channel,
        purpose: d.purpose,
        contact_id: d.contact_id,
        subject: d.subject ?? null,
        body: d.body,
        review: d.review,
        missing: [...d.missing],
        prepared_for_review: d.ready && current,
        send_enabled: false,
        current,
        superseded_by: d.superseded_by ?? null,
      };
    }),
    intent: s.tier === "PROVISIONAL" ? "exploratory" : "qualified",
    contacts: contacts.filter(
      (x) => x.current && x.relevance === "decision-maker",
    ),
    facts: p.facts,
    evidence: p.evidence,
    openings: p.openings.filter((o) => s.opening_ids.includes(o.id)),
    review_guidance: ['Select quality.opening_ids for every opening mentioned; review the whole message against those roles',
      'Different posting IDs and titles do not prove distinct hires; avoid exact vacancy counts without supported requisitions',
      'Multiple confidential agency searches do not establish one shared client; ask about either search or future partnerships',
      'Office geography is not hiring-country eligibility. Team locations are not proof of direct employment or supplier use',
      'Possible posting overlap remains unknown, not confirmed duplicate hires. Check source meaning, not just citation presence'],
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
    quality: d.quality ?? null,
    intent: d.intent ?? null,
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
      "replaces_draft_id",
      "quality",
      "intent",
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
    ["QUALIFIED", "PROVISIONAL"].includes(
      scoreProspect(p, c, now).recommendation,
    ),
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
    const prior = lastSent(p, input.contact_id);
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
  assert(
    !/[\u2014]/.test(body + (input.subject ?? "")),
    "Em dashes are not permitted in newly authored outreach",
  );
  const tier = scoreProspect(p, c, now).tier;
  assert(
    input.intent === (tier === "PROVISIONAL" ? "exploratory" : "qualified"),
    "Draft intent must match current qualification tier",
  );
  keys(
    input.quality,
    [
      "signal_claim",
      "hypothesis_claim",
      "recipient_rationale",
      "recipient_identity",
      "next_step",
      "agent_reviewed",
      "opening_ids",
    ],
    "draft.quality",
  );
  const q = input.quality;
  if(q.recipient_identity!==undefined)assert(['verified','needs_review'].includes(q.recipient_identity),'Invalid recipient identity review');
  text(q.recipient_rationale, "recipient rationale");
  text(q.next_step, "next step");
  assert(body.includes(q.next_step), "Next step must occur in draft");
  assert(
    q.agent_reviewed === true,
    "Agent must review the complete draft against its sources",
  );
  assert(
    input.claims?.some(
      (cl) => cl.kind === "observed" && cl.text === q.signal_claim,
    ),
    "Observed prospect signal required",
  );
  assert(
    input.claims?.some(
      (cl) => cl.kind === "hypothesis" && cl.text === q.hypothesis_claim,
    ),
    "Supported service hypothesis required",
  );
  if (input.purpose === "followup")
    assert(
      followupScheduled(p, c, input.contact_id),
      "No follow-up due for this conversation",
    );
  if (input.channel === "email") text(input.subject, "subject", 160);
  // A LinkedIn subject is only used by InMail.
  else if (input.subject !== undefined) text(input.subject, "InMail subject", 200);
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
          "delivery_model",
          "talent_focus",
          "differentiators",
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
    if (pattern.test(claimProse(combined))) {
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
  for (const number of proseNumbers(combined))
    assert(
      input.claims.some(
        (cl) =>
          proseNumbers(cl.text).includes(number) &&
          (cl.kind === "firm" ||
            cl.evidence.some((id) =>
              proseNumbers(
                p.evidence.find((e) => e.id === id)?.excerpt ?? "",
              ).includes(number),
            )),
      ),
      "Numeric draft claim lacks matching evidence",
    );
  const reviewIssues=draftReviewIssues(input,p,c,now);
  assert(reviewIssues.length===0,reviewIssues.join('; '));
  const identity = draftIdentity({ ...input, body });
  const duplicates = p.drafts.filter((d) => draftIdentity(d) === identity);
  const id = duplicates[0]?.id ?? identity.slice(0, 16);
  assert(
    !duplicates.some((d) => d.superseded_by),
    "Superseded wording cannot be reactivated; prepare a new revision",
  );
  const replaced =
    input.replaces_draft_id === undefined
      ? null
      : p.drafts.find((d) => d.id === input.replaces_draft_id);
  if (input.replaces_draft_id !== undefined) {
    assert(
      replaced && replaced.id !== id,
      "Replacement requires a different existing draft",
    );
    assert(
      replaced.channel === input.channel &&
        replaced.purpose === input.purpose &&
        replaced.contact_id === input.contact_id &&
        (replaced.reply_to ?? null) === (input.reply_to ?? null),
      "Replacement must match channel, purpose, recipient and sent interaction",
    );
    assert(
      !replaced.superseded_by || replaced.superseded_by === id,
      "Draft already superseded by another revision",
    );
  }
  if (
    duplicates.length === 1 &&
    draftCurrent(duplicates[0], p, c, now) &&
    (!replaced || replaced.superseded_by === id)
  )
    return { noop: true };
  const missing = [];
  if(recipientIdentityNeedsReview(person,q))missing.push('recipient identity review');
  if (!c.firm.name) missing.push("firm.name");
  if (!c.firm.sender_name) missing.push("firm.sender_name");
  if (input.channel === "email" && !c.firm.email) missing.push("firm.email");
  if (input.channel === "email" && !person.email)
    missing.push("public recipient email");
  const { replaces_draft_id, ...draftInput } = input;
  const d = {
    ...draftInput,
    body,
    id,
    content_hash: hash(combined),
    firm_hash: firmFingerprint(c.firm),
    created_at: now.toISOString(),
    stale: false,
    ready: missing.length === 0,
    structurally_complete: true,
    evidence_review: "agent_review_recorded",
    missing,
    review: "pending_human_review",
    send_enabled: false,
  };
  p.drafts = p.drafts.filter((x) => !duplicates.includes(x));
  p.drafts.push(d);
  if (replaced) {
    replaced.superseded_by = id;
    replaced.stale = true;
    replaced.ready = false;
  }
  const decision = qualify(p, c, now);
  return {
    ...decision,
    reason: replaced
      ? `Draft replaces ${replaced.id}; history retained; nothing sent`
      : "Draft saved for human review; nothing sent",
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
  const copy = structuredClone(p);
  const result = recordEvent(copy, input, c, now);
  if (!result.noop) Object.assign(p, copy);
  return result;
}
function recordEvent(p, input, c, now) {
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
      "corrects",
      "origin",
      "method",
    ],
    "interaction",
  );
  text(input.id, "interaction.id", 120);
  const at = stamp(input.at, now);
  if(input.origin!==undefined)validateOrigin(input.origin);
  const request = { ...input, at };
  const old = p.interactions.find((e) => e.id === input.id);
  if (old) {
    if (old.request_hash)
      assert(
        old.request_hash === hash(canonical(request)),
        "Idempotency key reused with different content",
      );
    else {
      const { input_hash, recorded_at, conversation_id, ...stored } = old;
      if (input.kind === "reply" && !request.reply_to && stored.reply_to)
        request.reply_to = stored.reply_to;
      assert(
        hash(canonical(stored)) === hash(canonical(request)),
        "Idempotency key reused with different content",
      );
    }
    return { noop: true };
  }
  const auth = authorization(input.authorization);
  if (input.method !== undefined)
    assert(
      input.kind === "sent" && input.channel === "linkedin" && LINKEDIN_SEND_METHODS.includes(input.method),
      "Only LinkedIn sent events take a method: message, connection_request or inmail",
    );
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
      "annotation",
      "schedule",
    ].includes(input.kind),
    "Unsupported interaction kind",
  );
  text(
    input.reason ?? input.message ?? input.response ?? input.target,
    "interaction context",
  );
  if (input.evidence)
    for (const id of input.evidence)
      assert(
        p.evidence.some((e) => e.id === id),
        "Missing interaction evidence",
      );
  const event = {
    ...input,
    at,
    recorded_at: now.toISOString(),
    request_hash: hash(canonical(request)),
  };
  if (input.reply_to !== undefined)
    assert(
      input.kind === "reply",
      "Only replies can reference a prior sent interaction",
    );
  if (input.contact_id !== undefined)
    assert(
      p.contacts.some((x) => x.id === input.contact_id),
      "Known contact required",
    );
  if (input.kind === "sent") {
    assert(
      p.contacts.some((x) => x.id === input.contact_id),
      "Known contact required",
    );
    assert(["email", "linkedin"].includes(input.channel), "Channel required");
    text(input.message, "exact sent message");
    if (input.draft_id) {
      const d = p.drafts.find((x) => x.id === input.draft_id);
      assert(
        d &&
          d.body === input.message &&
          d.content_hash === input.content_hash &&
          d.contact_id === input.contact_id &&
          d.channel === input.channel,
        "Sent record does not match the exact draft",
      );
    }
    if (EARLY.includes(p.status) && !p.suppressed && !p.hold)
      p.status = "CONTACTED";
  } else if (input.kind === "reply") {
    text(input.response, "response");
    const sent = p.interactions.filter(
      (e) =>
        e.kind === "sent" &&
        Date.parse(e.at) <= Date.parse(at) &&
        (!input.contact_id || e.contact_id === input.contact_id),
    );
    const prior = input.reply_to
      ? sent.find((e) => e.id === input.reply_to)
      : new Set(sent.map((e) => e.contact_id)).size === 1
        ? sent.sort((a, b) => Date.parse(a.at) - Date.parse(b.at)).at(-1)
        : null;
    assert(
      prior,
      "Reply requires unambiguous prior contact and a valid sent event; supply reply_to",
    );
    event.reply_to = prior.id;
    event.contact_id = prior.contact_id;
    if (input.channel)
      assert(
        ["email", "linkedin"].includes(input.channel),
        "Invalid reply channel",
      );
    if (p.status === "CONTACTED") p.status = "REPLIED";
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
  } else if (["lost", "disqualified"].includes(input.kind)) {
    text(input.reason, "Disposition reason");
    p.status = input.kind.toUpperCase();
  } else if (input.kind === "optout") p.suppressed = true;
  else if (input.kind === "hold") p.hold = true;
  else if (input.kind === "resume") {
    assert(!p.suppressed, "Opt-out cannot be cleared by resume");
    p.hold = false;
  } else if (input.kind === "reopen") {
    assert(!p.suppressed, "Opt-out remains binding");
    assert(
      ["LOST", "DISQUALIFIED"].includes(p.status),
      "Only closed prospects can be reopened",
    );
    p.status = "RESEARCHING";
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
  } else if (input.kind === "annotation") {
    text(input.reason, "Correction reason");
    assert(
      p.interactions.some((e) => e.id === input.corrects),
      "Correction requires an original event",
    );
  } else if (input.kind === "schedule") {
    assert(
      input.contact_id && Object.hasOwn(input, "next_followup"),
      "Schedule requires contact and explicit date or null",
    );
    assert(
      p.interactions.some(
        (e) => e.kind === "sent" && e.contact_id === input.contact_id,
      ),
      "Schedule requires a previously contacted recipient",
    );
  }
  if (!event.contact_id && Object.hasOwn(input, "next_followup")) {
    const contacts = [
      ...new Set(
        p.interactions
          .filter((e) => e.kind === "sent")
          .map((e) => e.contact_id),
      ),
    ];
    if (contacts.length === 1) event.contact_id = contacts[0];
  }
  if (event.contact_id)
    event.conversation_id = conversationId(p, event.contact_id);
  if (Object.hasOwn(input, "next_followup")) {
    assert(
      ["sent", "reply", "meeting", "opportunity", "schedule"].includes(
        input.kind,
      ),
      "This event does not support a follow-up override",
    );
    assert(
      !p.suppressed && !p.hold && !CLOSED.includes(p.status),
      "Cannot schedule through a suppressed, held or closed prospect",
    );
    assert(event.contact_id, "Follow-up override requires a contact");
    if (input.next_followup !== null) validDay(input.next_followup);
  }
  event.input_hash = hash(
    canonical(
      Object.fromEntries(
        Object.entries(event).filter(
          ([k]) =>
            !["recorded_at", "request_hash", "conversation_id"].includes(k),
        ),
      ),
    ),
  );
  p.interactions.push(event);
  if (!["review", "annotation", "alias"].includes(input.kind))
    for (const d of p.drafts) {
      if (
        !event.contact_id ||
        d.contact_id === event.contact_id ||
        [
          "meeting",
          "opportunity",
          "client",
          "hold",
          "resume",
          "optout",
          "lost",
          "disqualified",
          "reopen",
        ].includes(input.kind)
      ) {
        d.stale = true;
        d.ready = false;
      }
    }
  refreshFollowupSummary(p, c);
  const decision = qualify(p, c, now);
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
    .flatMap((p) =>
      conversations(p, c)
        .filter((x) => x.next_followup && x.next_followup <= day)
        .map((x) => ({
          id: p.id,
          company: p.name,
          revision: p.revision,
          status: p.status,
          conversation_id: x.id,
          contact_id: x.contact_id,
          due: x.next_followup,
          schedule: x.mode,
          attempts: x.attempts,
          last_contact: x.last_contact,
          engagement_review: p.status === "REPLIED",
          needs_agent_draft: true,
          send_enabled: false,
        })),
    )
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
    `Status: ${p.status} | ICP: ${p.icp} | Score: ${s.total}/100 | Weighted signal coverage: ${s.coverage}%`,
    `Revision: ${p.revision}`,
    `Recommendation: ${s.recommendation} (heuristic, not a conversion probability)`,
    "Coverage includes supported hypotheses; it is not factual certainty. Qualification permits further exploration, not a claim of buying intent or willingness to use an agency.",
    `Website: ${p.website}`,
    `Researched: ${p.researched_at ?? "Unknown"}`,
    "",
    controls
      ? "**DO NOT CONTACT - retained drafts are historical, not actionable.**"
      : "All outreach remains draft-only; a human sends.",
    `Suppressed: ${p.suppressed} | Hold: ${p.hold} | Closed: ${CLOSED.includes(p.status)}`,
    `Attempts: ${p.interactions.filter((e) => e.kind === "sent").length} | Next follow-up: ${p.next_followup ?? "None"} (${p.followup_mode ?? "automatic"})`,
    "",
    "## Interaction history",
    ...p.interactions.map(
      (e) =>
        `- ${e.at} - ${e.kind}: ${e.reason ?? e.message ?? e.response ?? e.target ?? ""}${e.response ? ` Response: ${e.response}` : ""}`,
    ),
    "",
    "## Dossier",
  ];
  for (const [key, f] of Object.entries(p.facts))
    lines.push(
      `- ${key}: ${f.confidence === "unknown" ? "Unknown" : `${['employee_count','recruiter_count'].includes(key) && Array.isArray(f.value) ? f.value.join('–') : f.value} (${f.confidence}; ${(f.evidence ?? []).join(", ")})`}`,
    );
  lines.push(
    "",
    "## Score",
    ...Object.entries(s.dimensions).map(
      ([k, d]) =>
        `- ${k}: ${d.points}/${d.weight}${d.known ? "" : " - incomplete evidence"}`,
    ),
    "",
    "## Gaps and risks",
    ...researchCaveats(p,c,now).map(x=>`- REVIEW: ${x}`),
    ...s.gaps.map((x) => `- ${x}`),
    ...s.opening_verification_gaps.map(x=>`- Opening ${x.id}: ${x.reasons.join('; ')}`),
    ...s.blockers.map((x) => `- BLOCKER: ${x}`),
    ...p.risks.map(
      (x) => `- ${x.text} (${x.confidence}; ${x.evidence.join(", ")})`,
    ),
    "",
    "## Openings",
    ...p.openings.map(
      (o) =>
        `- [${o.title}](${o.url}) - ${o.status}; hiring for ${o.hiring_for}; reviewed at ${o.verified_at}; demand credited: ${s.opening_ids.includes(o.id)}`,
    ),
    "",
    "## Contacts",
    ...rankedContacts(p, c, now).map(
      (x) =>
        `- [${x.name}](${x.url}), ${x.title} - ${x.relevance}; ${x.current ? "current" : "needs verification"}; ${x.reason}; supplier authority: ${x.authority_level}; ${x.verification_note}`,
    ),
    "",
    "## Drafts - human sends",
    "Draft readiness and agent evidence review do not record human approval or authorize sending.",
    ...p.drafts.map(
      (d) =>
        `\n### ${d.channel} / ${d.purpose}${d.superseded_by ? ` (superseded by ${d.superseded_by})` : ""}\n${d.subject ?? ""}\n\n${d.body}\n\nReview: ${d.review}; missing: ${d.missing.join(", ") || "none"}; stale: ${!draftCurrent(d, p, c, now)}; actionable: ${d.ready && draftCurrent(d, p, c, now)}`,
    ),
    "",
    "## Evidence",
    ...p.evidence.map(
      (e) =>
        `- ${e.id}: [${e.source_type} source](${e.url}), retrieved ${e.observed_at} (${e.retrieval_precision ?? "legacy precision unspecified"}); published ${e.published_at ?? "unknown / undated"}; ${e.excerpt_kind ?? "legacy excerpt type unspecified"}\n  ${e.excerpt_kind === "quote" ? "> " : "Summary/excerpt: "}${e.excerpt.replace(/\n/g, " ")}`,
    ),
  );
  return lines.join("\n") + "\n";
}
