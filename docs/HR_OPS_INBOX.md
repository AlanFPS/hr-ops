# LinkedIn inbox and research consistency

The inbox reader uses the existing local Playwright browser profile. A human signs in privately; the reader then checks visible conversations without sending. It is an explicitly requested extension to the original draft-only workspace. Like the existing browser sender, it is not a LinkedIn-approved API integration. UI changes can stop it.

## Invocation

Natural language: `Check LinkedIn replies and update HR-Ops.` The shared skill loads the inbox mode. CLI templates, using Node 24:

```powershell
node hr-ops-linkedin.mjs inbox --sender-profile-url YOUR_PROFILE_URL --authorization-reference ACTUAL_USER_INSTRUCTION_REFERENCE
node hr-ops-linkedin.mjs inbox --sender-profile-url YOUR_PROFILE_URL --authorization-reference ACTUAL_USER_INSTRUCTION_REFERENCE --resume RUN_ID
node hr-ops-linkedin.mjs inbox-review
node hr-ops.mjs followups --with-inbox
```

The caller supplies the real instruction reference, not a fabricated approval. Login happens in the visible browser. The CLI waits up to five minutes for human login and verifies the own-profile redirect. An existing private session can be reused. No agent answers human sender prompts; the separate inbox flow has no Send step.

The default window begins 30 days before the first run. `--since YYYY-MM-DD` pins an alternative UTC start. `--limit` and `--message-limit` can lower the per-invocation defaults of 100 conversations and 1,000 messages. Resume preserves the original window and account. Completed runs are historical checkpoints; start a new run to check new messages. Reading may mark conversations as read. Coverage includes Focused and Other, never archived/spam. Partial reads never establish absence of replies.

## Records and review

Private state lives in `{DATA_ROOT}/data/hr-ops/inbox/state.json`. It contains run coverage, hashed observed-message identities, pending review items and explicitly reviewed profile bindings. Imported messages remain canonical prospect interactions with optional `origin` metadata: method, run, thread URL, observed message ID, collection timestamp, timestamp precision, content hash and sender profile URL. Import authorization does not mean the user personally verified every message, and a historical outgoing observation is not a new send approval.

Known contacts match by profile URLs or reviewed aliases. A known person still needs HR business context: a recorded HR sent interaction, exact saved-draft match, or explicit reviewed business binding. Unknown conversations retain only review identity metadata. Personal message bodies are not retained for unknown people. Group chats are review-only.

Visible full dates or unambiguous day headings plus clock time establish occurrence time. Minute timestamps retain `minute` precision; missing time and ambiguous DST times stay unknown. The code does not decode opaque IDs into guessed timestamps. Without a stable message ID, automatic deduplication requires an exact timestamp and a unique match. Changed messages, ambiguous matches and missing outbound context remain pending.

For known business conversations, the reader can scroll the observed history container up to five times to establish the window boundary. A stalled or unsupported history view stays explicitly incomplete. Very large conversations can exceed one invocation's message bound and require operator review; this release does not silently truncate them into complete coverage. Unknown contacts retain identity-only questions, not their personal message history.

`inbox-review --id REVIEW_ID` displays the retained detail for one review, including relevant message text when available. `inbox-review --input FILE` accepts:

```json
{"id":"REVIEW_ID","action":"resolve","reason":"Actual checked identity and business context","prospect_id":"EXISTING_ID","contact_id":"EXISTING_CONTACT_ID","authorization":{"actor":"human","reference":"actual instruction","statement":"actual scope authorized by the user"}}
```

Identity resolution creates a reviewed alias and schedules a rescan; it never creates a prospect or contact. To resolve a missing occurrence time, supply `at` with the actual user-reported ISO timestamp instead of prospect/contact fields. To discard an unrelated item, use `action: discard` and a reason. Discard removes retained message/name/profile fields from the current review item, but cannot erase exports or backups. Edited historical messages need an explicit annotation through the existing `record` API, not a replacement of the old message.

Clear whole-message opt-outs create suppression. Potential opt-outs create holds and review items. These limited patterns do not prove semantic intent; review ambiguous language. Meeting, opportunity, client and commitment updates remain human decisions. No automatic inbox polling or scheduling is installed.

If an incoming opt-out cannot be imported because its time or identity within a known business thread is ambiguous, a new internal hold is recorded at collection time. The original message stays in review with its unknown occurrence time. Recollection never rewrites the original suppression event, and later genuine outbound context can resolve the pending reply without duplicating that event.

Inbox state is included in existing backup, restore, diagnostics and exposure inventory. Browser cookies remain excluded. Corrupt inbox state blocks ordinary writes. A successful restore validates the inbox data before it can replace an operating root.

## Research attribution

Research reservations and captures optionally accept `attribution: {source_id, icp, query_recipe?}`. ICP is `agency`, `startup` or `both`. Source IDs describe the actual source or query family; old attempts remain unattributed.

Record interpretations with `run --run ID --action outcome --input FILE`:

```json
{"sequence":1,"category":"demand_match","prospect_ids":["EXISTING_ID"],"note":"Evidence supports a current client engineering search; LATAM eligibility remains unknown."}
```

Categories: `read_ok`, `access_failure`, `empty_board`, `demand_match`, `no_demand`, `unresolved`. Outcomes append to actual reservations without resetting budgets. A successful fetch is not verified demand; failed/partial boards are not empty boards. Native search results require explicit outcome recording. `report` groups attempts, failures, distinct reported demand, current evaluations and gaps by source and declared ICP. It is not a conversion estimate.

Services-only company references are retained in the catalog's `research_references`, outside default acquisition seeds. Verify official board links, client attribution, country scope and supplier policy before drafting. Scores and qualification thresholds are unchanged.
