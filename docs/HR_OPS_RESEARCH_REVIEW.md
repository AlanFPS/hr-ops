# Research completion and draft review

This release addresses the remaining findings from the research-validation pilots. It preserves qualification weights, thresholds, local JSON storage, client independence and no-send boundaries. It does not promise a discovery quota or semantic truth from metadata.

## Complete a bounded run honestly

Before ending a scoped run, call:

```text
node hr-ops.mjs run --run ID --action review
```

`continuation_review` contains a token, remaining global allowance, every admitted candidate (including query-only names), per-candidate page/query allowance, linked prospect gaps and recorded diagnostics. This is read-only. Reaching candidate capacity prevents new identities; it does not prevent queries or pages for admitted candidates. Reaching the total page limit does not consume remaining queries.

Review actual captured links, failed reads and source alternatives for each candidate. If useful paths remain and the target is unmet, continue within the existing ledger. For example, a failed board read may justify a reserved native text read or an observed official board/API link; a named search may resolve a missing official identity. Do not guess a domain from an email address, invent an ATS tenant, bypass an access restriction or repeat a failure without a credible reason.

Then supply a concrete reason and the token with one decision per candidate:

```json
{
  "reason": "Target unmet; the remaining company has an inaccessible board and further work is deferred",
  "review": {
    "token": "COPY_THE_TOKEN_FROM_REVIEW",
    "candidates": [
      {
        "name": "Example Agency",
        "decision": "deferred",
        "reason": "Official board still needs a permitted text fallback; no readable role body is available yet",
        "attempt_sequences": [2, 4]
      }
    ]
  }
}
```

Use `run --run ID --action complete --input stop.json`. Supported decisions:

The JSON result of `run --action review` contains `continuation_review`; read the token and candidate rows from that object, not the top level. The ledger's other fields remain alongside it. A targeted run may configure `directory_pages: 0` to prohibit directory requests; candidate and total-page caps must remain positive. Invalid or out-of-scope reservations are rejected before dispatch without consuming an attempt. Failed network requests still consume their successful reservation. Existing positive directory budgets retain their meaning.

- `target_satisfied`: the candidate's contribution and remaining gaps are explained; this does not certify the whole discovery target.
- `no_useful_path`: explain the source-specific reason, not just the candidate cap.
- `budget_exhausted`: accepted only when that candidate has no page or query allowance.
- `deferred`: useful or unresolved work remains, and the run is stopping explicitly. Report the shortfall; do not call it exhaustive discovery.

For researched candidates, every decision references real attempts for that candidate. An explicitly recorded offline/unknown origin with null URL and sequence may be deferred before any attempt with `attempt_sequences: []`; it cannot claim completed research, no useful research path or budget exhaustion. A token becomes stale after a new request, interpretation, linked prospect revision, configuration change or UTC day change. Run review again before completion. Resume clears the current completion assessment and retains all budgets/attempts. Legacy completed ledgers without a review remain readable; new scoped completions require it. Unscoped legacy runs retain their interface.

Code validates completeness, token freshness, allowance and references. It does not prove that `no_useful_path` is a truthful judgment. Do not generate 20 boilerplate reasons to satisfy validation.

## Research selection and requests

Keep candidate selection balanced across requested ICPs while targeting useful sources. Review yields before spending all candidate slots. Search and directory failures warrant trying a different query recipe or source while allowance remains. Agent-known companies may be fallback leads, but label that origin in source attribution and report the selection bias. A familiar remote-first sample is not evidence of broad discovery success.

Use `withReservation` for scripted dispatch. For a native search/page tool, reserve with a standalone command and wait for its completed exit code zero and matching receipt. A running execution-session ID is not completion, even if a receipt has already appeared. Do not combine reservation and unrelated shell work. No local ledger independently controls native agent tools; report deviations.

The capture classifier now recognizes explicit job-list JavaScript gates even when a page has a long navigation/footer. Generic JavaScript job requirements or optional browser advice do not trigger that rule. Diagnostics remain heuristic and separate from actual role readability. Neither a failed fetch nor a JavaScript gate establishes an empty board.

## Review the actual openings in a draft

Every new draft includes `quality.opening_ids`, containing the saved IDs of all openings used in its signal. IDs must be unique and have current validated demand. An agency draft may use an empty array when its observed signal cites all evidence for a current explicit `latam_delivery_request`; do not manufacture openings for that path. The existing claims, recipient rationale and next-step checklist still apply.

The observed `signal_claim` must cite evidence belonging to a selected opening, and every selected opening needs an observed citation. Opening evidence, role-verification evidence and currency-verification evidence can establish this structural link. Selecting an unrelated current opening cannot rescue a claim supported only by a closed or unselected role. Citation overlap still does not establish semantic truth: read the actual message against the source.

For multiple agency searches, avoid singular shared-client wording such as "that client", "your client" or "the same client". Two confidential searches in one city do not establish one employer. Ask about "either search", use neutral plural wording, or select one opening and discuss only that opening. The code catches common English shared-client phrases; this is a narrow editorial safeguard, not a general language-understanding engine.

Separate posting IDs, titles and cities do not prove distinct hires. Exact numeric vacancy claims require distinct supported requisition IDs within their board/provider scopes, or an observed claim citing an explicit primary count quotation. Exact hire headcount requires the primary quotation, since one requisition need not equal one hire. An authored summary that counts postings is insufficient. Otherwise describe observed listings without an exact hire count. A repeated or broad evergreen posting may overlap more specific roles. Keep that uncertainty visible even when all role bodies are current.

The quotation exception requires `source_type: primary` and `excerpt_kind: quote`. A historical excerpt with unspecified provenance remains readable but does not prove an exact count. Do not relabel it to pass validation without recovering the actual source text through the normal evidence workflow.

Before recording agent review, verify the whole message, including pronouns, employer identity, role geography, sender credentials and implicit quantities. Do not attest review merely because save succeeds. Keep LinkedIn to one signal and one short question where possible, within the configured ceiling. No em dashes in authored prose.

Old drafts remain readable with their history intact, but drafts without the new opening selection are not current under this release. Replace them through `replaces_draft_id` when intentionally refreshing them. No operating drafts or pilot records are rewritten automatically. Human review and exact-message sending authorization remain separate.

## Finding-to-test map

`tests/hr-ops/research-review.test.mjs` covers:

| Finding | Regression |
|---|---|
| Candidate cap mistaken for all request exhaustion | Per-candidate continuation, query-only candidates and explicit deferral |
| Blanket or stale stopping review | Every candidate, own attempt references, stale request/outcome/revision/config tokens |
| Historical compatibility and malformed completion payloads | Legacy unscoped completion and rejected action override |
| Native reservation timing | Scripted dispatch occurs after successful persisted receipt; denied reservation never dispatches |
| Long JavaScript-only job pages | Explicit gate classification, plus readable JS job requirements and optional browser advice |
| One client inferred across confidential searches | Save rejection and a successful neutral replacement; single-opening case |
| Posting rows confused with exact hires | Different titles/IDs rejected as proof; distinct supported requisitions accepted |
| Historical drafts silently treated as newly reviewed | Old draft readability with current-review invalidation |

Live pilots must record actual target counts and failures, not promote metadata checks to a semantic pass. Test counts come from runner receipts, not counting `test()` declarations. Keep acceptance artifacts and original mistakes inspectable; correct draft errors through replacement chains.
