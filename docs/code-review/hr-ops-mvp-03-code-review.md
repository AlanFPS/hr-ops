# Code Review: Acceptance repairs and research controls

**Repair status:** All findings below are addressed by the [repair record](hr-ops-mvp-03-04-fixes.md), with independent closure in [review 05](hr-ops-mvp-05-code-review.md). The original findings and audit-time results remain below as history.

**Review Date:** October 9, 2026 (October 10 UTC)

**Scope:** Working-tree acceptance repairs relative to `a69bb5beaf8e78ddeb2ac3a794965d0ee165be9c`. This is an audit, not a repair or production certification. Existing unrelated documentation edits were preserved. Review procedure: the user's `~/.cursor/commands/audit.md`; an independent second review follows this review.

**Reviewed Files:** `hr-ops.mjs`; `lib/hr-ops/{model,operations,discovery,research-run,sources,store,validation}.mjs`; relevant `providers/{_http,greenhouse,ashby,lever}.mjs` paths; `tests/hr-ops/acceptance-repairs.test.mjs` and fixtures; `templates/hr-ops-sources.json`; shared HR skill and changed modes; `README.md`, `DATA_CONTRACT.md`, `OPENCLAW_INTEGRATION.md`, `docs/HR_OPS*.md`; upstream/review document diffs; ignored acceptance repair scripts, snapshots, captures and results.

**Severity Summary:** 0 Critical, 1 High, 3 Minor, 0 Nit. Budget findings below have two separately reproduced manifestations.

**Independent review:** [Review 04](hr-ops-mvp-04-code-review.md) confirmed these findings and added M4, a source-validation failure-isolation regression. Combined totals: **0 Critical, 1 High, 4 Minor, 0 Nit**.

## Critical Issues

None confirmed in this review.

## High Priority Issues

### H1 — Capture's response-size limit does not apply to HTTP errors

- **Location:** `lib/hr-ops/research-run.mjs:74`; `providers/_http.mjs:54–55`.
- **Severity:** HIGH.
- **Problem:** The new general-purpose capture command requests a 2 MB bounded read, but its inherited HTTP transport fully buffers non-success bodies before the bounded consumer runs. A public endpoint returning a large error body can consume substantially more memory than the advertised capture limit. The 20-second timeout is not a byte limit. This transport behavior predates the repair; the newly added capture command exposes it for arbitrary research pages.
- **Example:**

  ```js
  // captureSource
  await fetchText(url, { maxBytes: 2_000_000, timeoutMs: 20000, redirect: "error" });
  // fetchInContext, before the bounded consumer:
  if (!res.ok) {
    const responseText = await res.text().catch(() => '');
  }
  ```

- **Verification:** An isolated mock response with status 503 and a 6,000,000-byte body reached `error.body` in full. No real network endpoint was contacted. Existing successful-body reads also retain whole stream chunks, so the fix should bound the final chunk as well.
- **Fix:** Introduce a shared byte-bounded body reader that slices the final chunk and cancels the reader. Apply a small diagnostic-body cap to non-2xx responses before creating the HTTP error; honor the caller's capture cap on success. Preserve status and retry classification, without attaching the full body. Do not silently redefine every ordinary `fetchText` caller's success semantics.
- **Prevention:** Add transport tests covering oversized successful and error streams, one oversized chunk, multibyte text, cancellation, and timeout. Assert stored error-body size as well as returned capture size.

## Minor Issues

### M1 — Provider discovery does not consistently honor or report research limits

- **Location:** `lib/hr-ops/discovery.mjs:89–93,157,170`; `lib/hr-ops/research-run.mjs:49–55`; `providers/greenhouse.mjs:178–184`.
- **Severity:** MINOR.
- **Problem:** There are two related integration gaps. In a dry run, each actual provider request checks the same unchanged ledger, allowing multiple network requests through a one-request allowance. In a real run, Greenhouse catches a denied office lookup as an optional enrichment failure; discovery returns `reachable` and `partial: false`, even though the budget explicitly stopped part of the collection. The live request limit itself holds in the latter case. Role review remains mandatory, so this does not automatically qualify a prospect.
- **Example:**

  ```js
  await reserveResearch(repo, c, run, attempt, { dryRun });
  return ctx.fetchJson(target, options); // real fetch even during preview
  // Greenhouse catches reservation errors as well as ordinary HTTP errors.
  ```

- **Verification:** An isolated Greenhouse board with one backend job located only as `Remote` triggers jobs plus offices requests. With `pages_per_company: 1`, preview made two requests and wrote zero attempts. The committed path made only one request but returned `partial: false` and `reachable`; only stderr disclosed the denied enrichment.
- **Fix:** Decide the preview contract explicitly: either make budgeted previews network-free, or enforce and account for real network attempts. If durable writes must remain forbidden, at least maintain a shared in-memory allowance for every request/retry in that invocation and disclose that usage. Introduce a typed budget-exhaustion error and ensure discovery emits a structured budget diagnostic and `partial: true` even when a provider treats enrichment as optional. Avoid retrying policy errors.
- **Prevention:** Test multi-request providers and retrying providers with one remaining attempt, in both preview and commit modes. Assert fetch counts, ledger counts, and JSON diagnostics, not only process success.

### M2 — Invalid capture metadata consumes quota and passes dry-run validation

- **Location:** `lib/hr-ops/research-run.mjs:70–90`.
- **Severity:** MINOR.
- **Problem:** Capture reserves and fetches before validating excerpt kind, source type, excerpt length and publication metadata. Its dry-run path returns before those validations altogether. A correctable input typo spends a scarce research attempt; at the limit, the corrected request cannot run under the original batch budget. Failed network attempts should count, but invalid requests can be rejected before attempting the network.
- **Example:**

  ```js
  const reservation = await reserveResearch(...);
  if (dryRun) return { ...reservation, fetched: false };
  const raw = await fetchText(...);
  assert(["quote", "summary"].includes(input.excerpt_kind), ...);
  ```

- **Verification:** With a one-page budget, `excerpt_kind: "typo"` succeeded in preview, fetched once and failed in commit, and then a valid retry was rejected as exhausted.
- **Fix:** Validate the complete static input shape and all provided metadata before reservation, including explicit invalid publication values rather than silently dropping falsy ones. Use that same validator for preview and commit. Keep quote-occurrence and response-dependent checks after retrieval, and keep charging actual failed fetches.
- **Prevention:** Table-driven invalid-payload tests should assert identical preview/commit rejection, zero fetches, and no ledger changes. Separately test that valid requests with network or quote-match failures do consume attempts.

### M3 — Quote verification checks normalized text but returns unchecked original text

- **Location:** `lib/hr-ops/research-run.mjs:81–87`.
- **Severity:** MINOR.
- **Problem:** `sourceText()` removes script/style contents and markup from the requested excerpt before matching, but the evidence object stores the original input. Consequently, text absent from the source can remain inside an excerpt labeled as a checked quotation. This is a quote-integrity defect, not evidence that page instructions execute or that semantic claim verification exists.
- **Example:**

  ```js
  const quote = sourceText(input.excerpt);
  assert(content.includes(quote), ...);
  result.evidence = { excerpt: input.excerpt, excerpt_kind: "quote", ... };
  ```

- **Verification:** Source text `Alex Doe CTO` accepted and returned the quote `<style>Invented claim that is absent from the source</style>Alex Doe CTO` unchanged.
- **Fix:** Define excerpts as plain text and normalize whitespace only for matching, or store exactly the normalized quote that was verified. Never discard non-whitespace text solely for validation and then restore it in the evidence. Distinguish source HTML extraction from excerpt validation.
- **Prevention:** Add tests with script/style blocks, ordinary markup, angle-bracket text and entities in input excerpts. Assert that every returned checked quote, not just a transformed temporary string, matches the captured content under the documented normalization.

## Nits

None recorded; this review prioritizes behavioral defects.

## Verification and retained behavior

- Current HR regression suite: **80 passed, 0 failed**. These passes do not cover the reproduced defects above.
- Current repository syntax check: **767 modules passed**.
- Fresh retained `test-all.mjs --quick` rerun: **9,254 passed, 0 failed, 10 warnings**, exit 0. Warnings match the earlier baseline: missing legacy CV data, six upstream-author heuristics, unavailable comma-decimal locale coverage, and two skipped H1B live/mint checks. Provider error messages from intentional failure fixtures are not additional suite failures. Quick mode excludes the dashboard build; this audit did not run dashboard/browser visual suites.
- Final doctor is healthy (10 prospects, one research run, sending disabled; firm name, sender and email remain unconfigured). `git diff --check` passes.
- Targeted probes reproduced every finding in isolated local repositories. No external request was needed for those probes. Scripts and JSON results: `local/audit/recent-fixes-20261009/{repro.mjs,repro-results.json}`. These are ignored local artifacts, not durable shipped regression tests.
- Integrity comparison independently verified all **14 original acceptance record hashes**; **8 of 10 main records** still equal their pre-repair snapshots. Only PostHog and Recruiting from Scratch differ. Interaction arrays are unchanged for all 10 records. PostHog's outreach brief remains blocked. The integrity harness initially expected an exception from the brief API; it was corrected to assert the API's actual `blocked` result before the check passed.
- Reviewed protections still hold in the tests: stale secondary contact evidence no longer renews roles; relevant People/agency leaders rank; standalone no-op qualification preserves revisions while research persists; concurrent real reservations cannot exceed the limit; corrupt ledgers fail closed; starter imports remain unreviewed; source identities expire; LinkedIn capture and redirects are rejected.
- Starter catalog scope is correctly documented as one API board plus five manual research tasks. Main and reviewed-copy RFS scores refer to different evidence inventories. Approval records remain audit records, and sending remains disabled.
- Live model prompt-injection resistance remains **NOT EXERCISED**. Native browser reservation adherence is a procedural control. The latest client workflows were not rerun end to end during this code audit. The audit checked retained capture artifacts, not fresh company facts on the public web.

## Summary

The acceptance repairs improve evidence handling, contact freshness, repeatable discovery and revision stability. Four remaining findings prevent an unqualified sign-off on the new capture and budget controls. Fix H1 first, then the three correctness gaps and add the regression cases above. No implementation or prospect-data repair was performed during this audit.
