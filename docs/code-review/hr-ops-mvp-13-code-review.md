# Code Review: source ranking, contact research and draft review

Review date: 2026-10-19. Base revision: `11566e69b0903a3cecfd2999a6075fa905e70767`. Scope: the recent source-ranking/contact-research changes from `227011ad` through the base, their draft-review dependencies, callers, tests, mode instructions and saved pilot evidence. Severity summary: **0 Critical, 1 High, 5 Minor, 0 Nit**. All six confirmed findings are fixed in this patch.

Reviewed files include `lib/hr-ops/discovery-context.mjs`, `run-review.mjs`, `research-outcomes.mjs`, `research-run.mjs`, `operations.mjs`, `draft-review.mjs`, `validation.mjs`, their model/store/CLI consumers, source configuration, pilot summaries, relevant modes and research documentation. Repairs retain local JSON, the existing shared skill, source catalogs, qualification thresholds, score weights, expected revisions and no-send boundaries. No dependency or schema migration is required for the optional checklist metadata.

## High priority

### H1. An unrelated selected opening could conceal an unsupported hiring signal

- **Location:** `lib/hr-ops/draft-review.mjs:21`, `draftReviewIssues()`.
- **Problem:** Checking that `quality.opening_ids` contained current demand did not bind the observed signal to those openings. A message could cite only a closed role while selecting another current role to pass validation.
- **Example:** Select current opening A, cite only the distinct evidence for closed opening B in `signal_claim`, then save a structurally ready draft.
- **Fix:** Require the observed signal claim to cite a selected opening's evidence, role-verification evidence or currency-verification evidence. Every selected opening also needs an observed citation. Preserve the existing explicit agency delivery-request exception.
- **Verification:** `selected openings must support observed draft signals and cannot hide an unselected closed role` rejects the mismatch and accepts the correctly linked citation. Existing single-opening, shared-client, quantity and delivery-request cases remain covered.
- **Prevention:** Exercise adversarial combinations of individually valid fields. Citation linkage is structural, not proof that the sentence follows from its source; agent and human semantic review remain necessary.

## Minor issues

### M1. Reference URLs contaminated source performance across logical sources

- **Location:** `lib/hr-ops/discovery-context.mjs:13`, `rankedSources()`.
- **Problem:** Aggregating every explicit URL alias could attribute one source's history to another. Shared aliases also earned duplicate credit.
- **Example:** Query recipe `agency-query` links to `https://agency.example`, which is also the canonical key of the company source. The recipe inherited the company's page attempts and became a mixed source.
- **Fix:** Give canonical keys precedence. Include a noncanonical alias only when uniquely owned. Expose accepted and ignored aliases in `priority_basis`; retain original ledger history.
- **Verification:** `source reference URLs cannot absorb another source key or share ambiguous attribution` checks separate query/page history and denies duplicate shared-alias credit. Existing ICP separation, readability and request-group tests pass.
- **Prevention:** Test overlapping source configurations and preserve the distinction between a result reference and an attribution identity. Historical yield remains guidance, never qualification or buying intent.

### M2. Shared discovery outcomes assigned another company's dossier and allowance

- **Location:** `lib/hr-ops/run-review.mjs:6`, `continuationReview()`.
- **Problem:** Every prospect linked to a shared query appeared under every named candidate. Origin-only queries with no candidate names could lose their dossiers instead.
- **Example:** Alpha exhausts its page allowance, Beta has two pages left, and a shared query reports both prospects. Both rows previously showed both dossiers with that row's allowance.
- **Fix:** Include immutable origin sequences, then attach a dossier only to one matching admitted candidate through its normalized name or verified company domain on named page attempts. Missing or ambiguous bindings remain explicit `unmatched_prospect_ids`, without contact-page advice.
- **Verification:** `batch-query and shared-origin outcomes bind each dossier only to its own candidate allowance` covers different budgets, origin-only queries, verified renamed companies and unmatched records. The ambiguous-binding regression checks that two candidate matches receive no borrowed dossier.
- **Prevention:** Test multi-company query results and identity ambiguity, not only one-prospect requests. Matching does not merge candidate identities or reallocate actual ledger budgets.

### M3. Unspecified historical excerpt provenance passed the primary-quote exception

- **Location:** `lib/hr-ops/draft-review.mjs:35`, exact-count evidence check.
- **Problem:** `excerpt_kind !== 'summary'` treated missing metadata as proof of a direct quotation.
- **Example:** An old primary excerpt with no `excerpt_kind` could justify an exact vacancy count simply because its prose contained the number.
- **Fix:** The quotation exception now requires `excerpt_kind === 'quote'`, alongside the existing primary-source requirement. Historical evidence remains readable.
- **Verification:** The explicit-primary-count test rejects both summaries and unspecified provenance. The retained ATS UUID/numeric-prose test now checks rejection first, then supplies explicit quote metadata for its positive quotation case. Distinct supported requisition counting still works independently.
- **Prevention:** Require affirmative evidence for exceptions; absence of a negative label is not positive provenance. Do not relabel actual historical data without recovering its source text.

### M4. Incomplete or explicitly ambiguous recipients could be ready for use

- **Location:** `lib/hr-ops/operations.mjs:136`, `:224`, `:543`; `lib/hr-ops/validation.mjs:261`.
- **Problem:** Modes required identity clarification for a first-name-only contact, but draft readiness and current-use checks did not represent that gap.
- **Example:** A current team listing naming only Alex as CTO produced a ready LinkedIn draft without resolving which person to contact.
- **Fix:** Add optional `quality.recipient_identity: needs_review|verified` to the existing checklist. Single-token names default to review; an explicitly ambiguous full name also needs review. Save research drafts with a visible missing field, keep them noncurrent for human use, and expose identity work in research progress. A sourced review may confirm a legitimate mononym without fabricating a surname. Preserve old records and replacement chains.
- **Verification:** Identity regressions cover incomplete names, historical ready flags, sourced mononym review, replacement, invalid enum values and explicitly ambiguous full names. A current verified replacement resolves the queue.
- **Prevention:** Keep research-draft storage separate from actionability. Multiple name words do not prove unique identity. `verified` records agent evidence review, not human approval or proof of supplier authority; inspect its cited contact source and rationale.

### M5. Initial research progress counted follow-ups and misreported active conversations

- **Location:** `lib/hr-ops/operations.mjs:140`, `researchNextStep()`.
- **Problem:** Current follow-up drafts inflated the initial-outreach count, and every post-outreach lifecycle stage was classified as a restriction.
- **Example:** A contacted prospect with one current follow-up but no current initial draft reported a saved initial draft and `review_restrictions` despite having no hold or suppression.
- **Fix:** Mark progress `purpose: initial`, count only initial drafts and suggest `review_conversation` for engaged stages. Actual holds, suppression, closed stages and current blockers retain restriction precedence. Validate the optional remaining-page allowance and preserve its cap.
- **Verification:** `initial research progress distinguishes active conversations and ignores follow-up draft counts` creates synthetic isolated history and a genuine current follow-up fixture, verifies the separate count, and checks hold precedence.
- **Prevention:** Exercise purpose and lifecycle independently. This is advisory initial-research guidance, not a replacement for conversation/reminder rules.

## Verification and independent review

- Six failures were reproduced before repair in the focused suite, including the modified exact-count assertion. Final full suite: **283/283 passed, zero failures or skips**, Node **24.21.0**. The first broad run correctly exposed the older quotation fixture; its replacement explicitly tests both unknown and affirmative provenance rather than weakening the guard.
- Under the user-invoked Cursor audit procedure, the independent `code_audit_second` reviewer inspected all six findings and final ambiguity refinements. Its final focused run passed **48/48** across research-review, research-execution and research-consistency. It found no additional actionable defect and made no source or operating-data changes.
- Offline replay read the two previous committed-build acceptance exports using the new implementation at fixed `2026-10-19T03:00:00Z`. All **11 records** validated; score totals and tiers stayed equal; all **four unsuperseded drafts** remained current with no draft-review issues. The preserved superseded draft was not reactivated. Pipeline, ledger and configuration input hashes stayed unchanged. This is regression replay, not new live discovery or renewed source verification.
- Local reproducible artifacts: `local/source-contact-audit/full-tests-final.log`, `replay.mjs`, `replay.json`, `syntax.log` and `private-guard.json`. Local artifacts are intentionally ignored and may contain private research references. The tracked tests are the portable verification evidence.

The release also checks the system manifest, repository syntax, whitespace and operating-data hashes before commit, then verifies Windows/Linux HR CI after push. No operating prospects, reports, preferences, interaction history or browser sessions are migrated or refreshed by this patch. No messages are sent. Final command receipts and CI identity are reported in the release response.

## Remaining boundaries

No open confirmed defect remains within this reviewed patch. Semantic truth, source ownership and unique recipient identity still require actual evidence review. Native-tool budget compliance is procedural outside the reservation API. Source history is not a forecast of sales yield. This audit does not establish production certification, live business-account validation or protected off-device recovery. Pre-existing missing business email, browser workspace configuration and stale operating dossiers were not silently repaired or treated as new regressions.
