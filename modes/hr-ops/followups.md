# Follow-ups and interaction records

Run `followups --due today`. For each due prospect inspect its last actual sent message and current dossier, refresh stale research and draft a concise follow-up with `purpose: followup`. Do not claim a reply or prior conversation that is not recorded. Saving the draft must not increment attempts or change the contact date.

If the user reports sending a message, log its exact text, channel, contact ID and timestamp through `record`, citing that user instruction. If it came from a stored draft, include the exact draft ID and content hash. Record replies, holds, opt-outs and commercial progress only from user-provided events; do not invent an approval reference.

The default schedule is five calendar days after first contact and seven after the first follow-up, with at most two follow-ups. Read actual configured timezone and cadence. Replies/closure/holds/suppression stop routine reminders. A reply is not a client agreement. Never clear an opt-out via resume or rediscovery.

An explicit human-requested date on a sent/reply/meeting/opportunity event creates a manual reminder, including after a reply, without resetting commercial status. Explicit `next_followup: null` cancels a reminder; omission does not mean null. Manual reminders still respect holds, closed states and opt-outs. Never invent a follow-up request or use the manual schedule to evade those controls.

Address the recipient of the latest actual sent event; saved follow-ups bind `reply_to` to that event. Do not reuse one person's conversation as a follow-up to another. New replies bind to the same prior contact. Backdated replies that precede newer cadence events require explicit history correction and are rejected without clearing reminders; do not change timestamps to force acceptance. Legacy unbound follow-up drafts must be regenerated.
