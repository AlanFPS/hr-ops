import {
  VERSION,
  FIELDS,
  STATES,
  assert,
  text,
  keys,
  stamp,
  validDay,
  url,
  domain,
  validateEvidence,
  validateFact,
  references,
  applyResearch,
} from "./model.mjs";

import { validateOrigin } from './inbox-state.mjs';
const ID = /^[a-f0-9]{16}$/;
const EVENTS = [
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
];
const array = (v, label) =>
  assert(Array.isArray(v), `${label}: expected array`);
function unique(rows, label) {
  array(rows, label);
  assert(
    rows.every((x) => x && typeof x === "object" && !Array.isArray(x)),
    `${label}: expected records`,
  );
  assert(
    new Set(rows.map((x) => x.id)).size === rows.length,
    `${label}: duplicate IDs`,
  );
}
function refs(ids, p, label, optional = false) {
  if (optional && Array.isArray(ids) && ids.length === 0) return;
  references(ids, p.evidence, label);
}
function authorization(value) {
  keys(value, ["actor", "reference", "statement"], "authorization");
  assert(value.actor === "human", "authorization.actor: expected human");
  text(value.reference, "authorization.reference", 500);
  text(value.statement, "authorization.statement", 2000);
}
function score(value) {
  if (value === null) return;
  assert(value && typeof value === "object", "score: expected object");
  for (const key of ["total", "coverage"])
    assert(
      Number.isFinite(value[key]) && value[key] >= 0 && value[key] <= 100,
      `score.${key}: invalid number`,
    );
  assert(
    ["RESEARCHING", "PROVISIONAL", "QUALIFIED", "DISQUALIFIED"].includes(
      value.recommendation,
    ),
    "score.recommendation: invalid state",
  );
  for (const key of ["gaps", "blockers", "opening_ids"])
    array(value[key], `score.${key}`);
  assert(
    value.dimensions && typeof value.dimensions === "object",
    "score.dimensions: expected object",
  );
  for (const key of ["demand", "fit", "latam", "need", "access"]) {
    const d = value.dimensions[key];
    assert(
      d &&
        ["level", "points", "weight"].every(
          (k) => Number.isFinite(d[k]) && d[k] >= 0,
        ) &&
        typeof d.known === "boolean",
      `score.dimensions.${key}: invalid dimension`,
    );
  }
}

// Checks persisted structure, not current freshness/eligibility. Historical records
// remain readable after evidence expires or a firm changes its configuration.
export function validateProspect(
  p,
  now = new Date(),
  { snapshot = false } = {},
) {
  assert(
    p && typeof p === "object" && !Array.isArray(p),
    "prospect: expected object",
  );
  assert(
    [1, VERSION].includes(p.schema_version),
    "Unsupported prospect schema",
  );
  assert(ID.test(p.id), "id: invalid prospect ID");
  assert(
    Number.isInteger(p.revision) && p.revision >= 0,
    "revision: invalid number",
  );
  text(p.name, "name", 160);
  url(p.website);
  if (p.discovery_source !== undefined) url(p.discovery_source);
  assert(["startup", "agency"].includes(p.icp), "icp: invalid value");
  assert(STATES.includes(p.status), "status: invalid state");
  array(p.domains, "domains");
  assert(
    p.domains.length > 0 &&
      p.domains.every(
        (d) => typeof d === "string" && domain("https://" + d) === d,
      ),
    "domains: invalid canonical domain",
  );
  assert(
    new Set(p.domains).size === p.domains.length,
    "domains: duplicate aliases",
  );
  assert(
    p.domains.includes(domain(p.website)),
    "domains: missing website domain",
  );
  for (const key of ["created_at", "updated_at"]) stamp(p[key], now);
  if (p.researched_at !== undefined) stamp(p.researched_at, now);
  for (const key of ["suppressed", "hold"])
    assert(typeof p[key] === "boolean", `${key}: expected boolean`);
  if (p.next_followup !== null) validDay(p.next_followup);
  if (p.followup_mode !== undefined)
    assert(
      [null, "manual", "automatic"].includes(p.followup_mode),
      "followup_mode: invalid mode",
    );
  unique(p.evidence, "evidence");
  assert(p.evidence.length > 0, "evidence: identity evidence required");
  p.evidence.forEach((e) => validateEvidence(e, now));
  keys(p.facts, FIELDS, "facts");
  for (const key of FIELDS.filter(
    (k) => p.schema_version !== 1 || k !== "latam_delivery_request",
  )) {
    assert(Object.hasOwn(p.facts, key), `facts.${key}: missing field`);
    validateFact(p.facts[key], p.evidence, key);
  }
  for (const key of ["openings", "contacts", "drafts", "interactions"])
    unique(p[key], key);
  for (const key of ["risks", "blockers"]) array(p[key], key);
  // Reuse ingestion validation, stripping only system-owned opening metadata.
  const shadow = structuredClone(p);
  const validateRows = (rows) =>
    rows.map(({ reviewed, ...row }) => {
      assert(ID.test(row.id), "opening.id: invalid ID");
      if (reviewed !== undefined)
        assert(
          typeof reviewed === "boolean",
          "opening.reviewed: expected boolean",
        );
      if (row.posted_at !== undefined) stamp(row.posted_at, now);
      for (const key of ["location", "employer"])
        if (row[key] !== undefined)
          assert(typeof row[key] === "string", `opening.${key}: expected text`);
      return row;
    });
  p.contacts.forEach((person) =>
    assert(ID.test(person.id), "contact.id: invalid ID"),
  );
  applyResearch(
    shadow,
    {
      openings: validateRows(p.openings),
      contacts: p.contacts,
      risks: p.risks,
      blockers: p.blockers,
    },
    now,
  );
  if (p.collection !== undefined) {
    stamp(p.collection.at, now);
    unique(p.collection.openings, "collection.openings");
    applyResearch(
      shadow,
      { openings: validateRows(p.collection.openings) },
      now,
    );
  }
  for (const d of p.drafts) {
    assert(ID.test(d.id), "draft.id: invalid ID");
    if (d.superseded_by !== undefined) {
      const seen = new Set([d.id]);
      let cursor = d;
      while (cursor.superseded_by !== undefined) {
        const next = p.drafts.find((x) => x.id === cursor.superseded_by);
        assert(
          next && !seen.has(next.id),
          "draft.superseded_by: missing replacement or cycle",
        );
        assert(
          next.channel === cursor.channel &&
            next.purpose === cursor.purpose &&
            next.contact_id === cursor.contact_id &&
            (next.reply_to ?? null) === (cursor.reply_to ?? null),
          "draft.superseded_by: mismatched draft context",
        );
        assert(
          cursor.stale === true && cursor.ready === false,
          "Superseded drafts must be stale and not ready",
        );
        seen.add(next.id);
        cursor = next;
      }
    }
    assert(
      ["email", "linkedin"].includes(d.channel) &&
        ["initial", "followup"].includes(d.purpose),
      "draft: invalid channel/purpose",
    );
    assert(
      p.contacts.some((c) => c.id === d.contact_id),
      "draft.contact_id: missing contact",
    );
    if (d.reply_to !== undefined) {
      const sent = p.interactions.find(
        (e) => e.id === d.reply_to && e.kind === "sent",
      );
      assert(
        d.purpose === "followup" && sent && sent.contact_id === d.contact_id,
        "draft.reply_to: missing sent interaction or mismatched recipient",
      );
    }
    if (d.quality !== undefined) {
      keys(
        d.quality,
        [
          "signal_claim",
          "hypothesis_claim",
          "recipient_rationale",
          "next_step",
          "agent_reviewed",
          "opening_ids",
        ],
        "draft quality",
      );
      for (const k of [
        "signal_claim",
        "hypothesis_claim",
        "recipient_rationale",
        "next_step",
      ])
        text(d.quality[k], `draft quality ${k}`);
      assert(d.quality.agent_reviewed === true, "Invalid agent review");
      if(d.quality.opening_ids!==undefined){
        assert(Array.isArray(d.quality.opening_ids)&&d.quality.opening_ids.length>0&&new Set(d.quality.opening_ids).size===d.quality.opening_ids.length,'Invalid draft opening selection');
        assert(d.quality.opening_ids.every(id=>p.openings.some(o=>o.id===id)),'Draft opening reference missing');
      }
      assert(
        ["qualified", "exploratory"].includes(d.intent),
        "Invalid draft intent",
      );
    }
    text(d.body, "draft.body", 5000);
    if (d.channel === "email") text(d.subject, "draft.subject", 160);
    stamp(d.created_at, now);
    text(d.content_hash, "draft.content_hash");
    text(d.firm_hash, "draft.firm_hash");
    for (const key of ["stale", "ready"])
      assert(typeof d[key] === "boolean", `draft.${key}: expected boolean`);
    assert(d.send_enabled === false, "draft.send_enabled must remain false");
    assert(
      ["pending_human_review", "human_review_recorded"].includes(d.review),
      "draft.review: invalid state",
    );
    array(d.missing, "draft.missing");
    array(d.claims, "draft.claims");
    assert(d.claims.length > 0, "draft.claims: required");
    for (const cl of d.claims) {
      text(cl.text, "claim.text");
      assert(
        ["observed", "inferred", "hypothesis", "firm"].includes(cl.kind),
        "claim.kind: invalid value",
      );
      if (cl.kind === "firm")
        assert(
          [
            "services",
            "fees",
            "guarantees",
            "candidate_availability",
            "name",
            "sender_name",
          ].includes(cl.firm_field),
          "claim.firm_field: invalid field",
        );
      else refs(cl.evidence, p, "claim.evidence");
    }
    if (d.review_authorization) authorization(d.review_authorization);
  }
  for (const e of p.interactions) {
    if(e.origin!==undefined)validateOrigin(e.origin);
    text(e.id, "interaction.id", 120);
    assert(EVENTS.includes(e.kind), "interaction.kind: invalid event");
    stamp(e.at, now);
    if (e.recorded_at !== undefined) stamp(e.recorded_at, now);
    if (e.conversation_id !== undefined)
      assert(ID.test(e.conversation_id), "Invalid conversation ID");
    if (e.kind === "annotation")
      assert(
        p.interactions.some((x) => x.id === e.corrects && x.id !== e.id),
        "Annotation target missing",
      );
    authorization(e.authorization);
    text(e.input_hash, "interaction.input_hash");
    if (e.evidence !== undefined)
      refs(e.evidence, p, "interaction.evidence", true);
    if (e.next_followup !== undefined && e.next_followup !== null)
      validDay(e.next_followup);
    if (e.kind === "sent") {
      text(e.message, "interaction.message");
      assert(
        ["email", "linkedin"].includes(e.channel),
        "interaction.channel: invalid channel",
      );
      assert(
        p.contacts.some((c) => c.id === e.contact_id),
        "interaction.contact_id: missing contact",
      );
    }
    if (e.kind === "reply") text(e.response, "interaction.response");
    if (e.reply_to !== undefined) {
      const sent = p.interactions.find(
        (x) => x.id === e.reply_to && x.kind === "sent",
      );
      assert(
        e.kind === "reply" &&
          sent &&
          Date.parse(sent.at) <= Date.parse(e.at) &&
          (e.contact_id === undefined || e.contact_id === sent.contact_id),
        "interaction.reply_to: invalid prior contact",
      );
    }
    if (e.draft_id !== undefined)
      assert(
        p.drafts.some((d) => d.id === e.draft_id),
        "interaction.draft_id: missing draft",
      );
  }
  score(p.score);
  if (!snapshot) {
    unique(p.history, "history");
    for (const h of p.history) {
      assert(ID.test(h.id), "history.id: invalid ID");
      stamp(h.at, now);
      text(h.action, "history.action");
      text(h.reason, "history.reason");
      assert(
        (h.from === null || STATES.includes(h.from)) && STATES.includes(h.to),
        "history: invalid transition state",
      );
      refs(h.evidence, p, "history.evidence", true);
      if (h.authorization) authorization(h.authorization);
      for (const field of ["before", "after"])
        if (h[field]) {
          assert(
            !Object.hasOwn(h[field], "history"),
            "history snapshots must not recursively contain history",
          );
          assert(h[field].id === p.id, "history snapshot: mismatched prospect");
          validateProspect(h[field], now, { snapshot: true });
        }
      if (h.decision) {
        score(h.decision.score);
        assert(
          h.decision.config && typeof h.decision.config === "object",
          "history.decision.config: missing configuration",
        );
      }
    }
  }
  return p;
}
