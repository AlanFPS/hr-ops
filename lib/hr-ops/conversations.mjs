import { hash, localDate, addDays } from "./model.mjs";

export const conversationId = (p, contact) =>
  hash(`${p.id}:${contact}`).slice(0, 16);

// A derived view over immutable events, not a second message store.
export function conversations(p, c) {
  const groups = new Map();
  const ambiguous = p.interactions.some(
    (e) =>
      e.kind === "reply" &&
      !e.contact_id &&
      !p.interactions.some(
        (prior) =>
          prior.kind === "sent" && prior.id === e.reply_to && prior.contact_id,
      ),
  );
  for (const e of p.interactions) {
    const prior =
      e.reply_to &&
      p.interactions.find((x) => x.id === e.reply_to && x.kind === "sent");
    const contact = e.contact_id ?? prior?.contact_id;
    if (!contact) continue;
    if (!groups.has(contact)) groups.set(contact, []);
    groups.get(contact).push(e);
  }
  return [...groups].map(([contact_id, events]) => {
    const chronological = events
      .map((e, i) => ({ e, i }))
      .sort((a, b) => Date.parse(a.e.at) - Date.parse(b.e.at) || a.i - b.i)
      .map((x) => x.e);
    const sent = chronological.filter((e) => e.kind === "sent");
    const last = sent.at(-1);
    const replied = events.some((e) => e.kind === "reply");
    const override = events
      .filter((e) => Object.hasOwn(e, "next_followup"))
      .at(-1);
    let due = null,
      mode = null;
    if (override) {
      due = override.next_followup;
      mode = due ? "manual" : null;
    } else if (
      !ambiguous &&
      last &&
      !replied &&
      sent.length <= c.followups.max_followups &&
      ["CONTACTED", "REPLIED"].includes(p.status)
    ) {
      due = addDays(
        localDate(last.at, c.timezone),
        sent.length === 1
          ? c.followups.first_days
          : c.followups.subsequent_days,
      );
      mode = "automatic";
    }
    // A later reply cancels an older manual reminder, unless the reply schedules one.
    const lastReplyIndex = events.findLastIndex((e) => e.kind === "reply");
    if (
      override &&
      lastReplyIndex > events.indexOf(override) &&
      Date.parse(events[lastReplyIndex].at) >= Date.parse(override.at)
    ) {
      due = null;
      mode = null;
    }
    if (
      p.suppressed ||
      p.hold ||
      ["CLIENT", "LOST", "DISQUALIFIED"].includes(p.status)
    ) {
      due = null;
      mode = null;
    }
    return {
      id: conversationId(p, contact_id),
      contact_id,
      last_contact: last ?? null,
      attempts: sent.length,
      replied,
      review_required: ambiguous,
      next_followup: due,
      mode,
    };
  });
}

export function refreshFollowupSummary(p, c) {
  const next = conversations(p, c)
    .filter((x) => x.next_followup)
    .sort((a, b) => a.next_followup.localeCompare(b.next_followup))[0];
  p.next_followup = next?.next_followup ?? null;
  p.followup_mode = next?.mode ?? null;
}
