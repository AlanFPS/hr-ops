# Follow-ups and interaction records

Run `followups --due today`. For each due prospect inspect its last actual sent message and current dossier, refresh stale research and draft a concise follow-up with `purpose: followup`. Do not claim a reply or prior conversation that is not recorded. Saving the draft must not increment attempts or change the contact date.

If the user reports sending a message, log its exact text, channel, contact ID and timestamp through `record`, citing that user instruction. If it came from a stored draft, include the exact draft ID and content hash. Record replies, holds, opt-outs and commercial progress only from user-provided events; do not invent an approval reference.

The default schedule is five calendar days after first contact and seven after the first follow-up, with at most two follow-ups. Read actual configured timezone and cadence. Replies/closure/holds/suppression stop routine reminders. A reply is not a client agreement. Never clear an opt-out via resume or rediscovery.

An explicit human-requested date on a sent/reply/meeting/opportunity event creates a manual reminder, including after a reply, without resetting commercial status. Explicit `next_followup: null` cancels a reminder; omission does not mean null. Manual reminders still respect holds, closed states and opt-outs. Never invent a follow-up request or use the manual schedule to evade those controls.

Use the latest actual sent event for the selected contact across channels. Replies may reference any valid earlier sent event, even before follow-ups. Preserve occurrence time; the CLI records entry time separately. Replies pause their conversation; other contacts remain visible for engagement review. Unattributed legacy replies pause automatic reminders. Commercial stages stop automatic cadence. Append corrections as annotations referencing the original event. Schedule overrides require actual prior contact and an explicit date or null. Never change timestamps to force acceptance. Regenerate legacy unbound drafts.
