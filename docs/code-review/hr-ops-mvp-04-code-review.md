# Code Review: Independent second review of acceptance repairs

**Repair status:** All combined findings are addressed by the [repair record](hr-ops-mvp-03-04-fixes.md), with independent closure in [review 05](hr-ops-mvp-05-code-review.md). The original findings remain below as history.

**Reviewed Files:** Uncommitted acceptance changes relative to `a69bb5beaf8e78ddeb2ac3a794965d0ee165be9c`: `hr-ops.mjs`, `lib/hr-ops/{model,operations,discovery,research-run,sources}.mjs`, the repository/configuration interfaces they call, `providers/_http.mjs`, `tests/hr-ops/acceptance-repairs.test.mjs`, `docs/HR_OPS_RESEARCH.md`, and first-pass report/reproduction artifacts. This review focuses on the recent changes, not a fresh audit of all retained Career-Ops code.

**Review Date:** October 9, 2026 (October 10 UTC).

**Severity Summary:** **0 Critical, 0 High, 1 Minor, 0 Nit additional findings**. The four first-pass findings are confirmed. Combined and deduplicated: **0 Critical, 1 High, 4 Minor, 0 Nit**.

**Method:** This is the independent `code-audit-second` handoff required by the user's `~/.cursor/commands/audit.md`. Inspected the changed paths, reran the first review's isolated reproductions in a separate directory, and independently reproduced the source-isolation issue below. No implementation or live prospect data was modified. No real external request was required.

## Critical Issues

None confirmed.

## High Priority Issues

No additional High issue. **First-pass H1 is confirmed:** capture requests a 2,000,000-byte limit but an HTTP 503 mock response retains all 6,000,000 bytes in the thrown error. `providers/_http.mjs:54` consumes the error body before the bounded successful-response consumer. The reused transport behavior predates the changes, but the new general-purpose capture path exposes it to arbitrary research pages. The first report appropriately distinguishes this from DNS/redirect safety; no separate SSRF claim is made.

The exact example, fix, verification and prevention guidance is in [review 03, H1](hr-ops-mvp-03-code-review.md#h1--captures-response-size-limit-does-not-apply-to-http-errors).

## Minor Issues

### M4 — One invalid source blocks discovery for unrelated, valid sources

- **Location:** `lib/hr-ops/discovery.mjs:57`, before the per-source error boundary at `lib/hr-ops/discovery.mjs:68`; eager validation in `lib/hr-ops/sources.mjs:14–17`; configuration's sources-array check at `lib/hr-ops/model.mjs:253`.
- **Severity:** MINOR.
- **Problem:** `effectiveSources` validates every enabled source before `discoverSources` applies the requested ICP filter or enters its per-source `try` block. A malformed startup source therefore aborts an agency-only discovery, suppressing otherwise valid agency research tasks and producing no partial-result diagnostics. This regresses the previous per-entry discovery isolation. The same configuration passes initialization, `loadConfig` and `doctor`, so the problem is not reported at the advertised health-check boundary either. No prospect data is corrupted, and correcting the source restores operation, which limits severity.
- **Example:**
  ```js
  // discovery.mjs — eager validation runs before the requested ICP filter
  const sources = effectiveSources(c, { starter, now }).filter(
    (s) => icp === "both" || s.icp === icp,
  );
  // sources.mjs — throws for any enabled entry
  assert(["greenhouse", "ashby", "lever", "manual"].includes(s.provider),
    "Unsupported source provider");
  ```
  A valid `agency.example` source with `provider: "manual"`, alongside an unrelated `startup.example` entry with `provider: "unsupported"`, makes `discoverSources(..., { icp: "agency", limit: 1 })` throw `Unsupported source provider`. Removing only the startup entry returns the valid agency research task. The original mixed configuration produces `doctor.ok: true`.
- **Fix:** Separate catalog merging/selection from per-source validation. Validate selected entries inside the existing per-source error boundary, returning named source diagnostics and `partial: true` for invalid selected entries while continuing valid ones. An invalid excluded ICP should not block the requested ICP. Add a shared source-config validation/reporting path to `doctor` so enabled malformed entries are visible before collection. Preserve override-by-domain semantics and the intentionally minimal `{website, enabled: false}` shape.
- **Verification:** Configure one valid agency entry and one invalid startup entry; agency-only discovery must return the agency result. With both ICPs selected, retain valid results plus a structured error identifying the bad source. Repeat for malformed identity evidence and required provider fields. Confirm `doctor` surfaces the malformed enabled source, while a valid disabled override remains accepted and no network request is made for an excluded/invalid source.
- **Prevention:** Exercise mixed valid/invalid configuration and excluded-ICP cases in source integration tests, including both structured diagnostics and health-check output. Keep failure-isolation boundaries around validation as well as network calls.

### Confirmation of first-pass Minor findings

All three existing Minor findings were reproduced without changing their count or severity:

- **M1:** A Greenhouse dry run made two actual mocked requests under a one-page allowance and persisted zero attempts. The committed run made one request but returned `partial: false` and `reachable` after its offices enrichment was denied. Its stderr warning does not supply the promised structured partial-result signal.
- **M2:** Invalid `excerpt_kind: "typo"` was accepted by preview, fetched once before failing on commit, consumed the only allowance, and blocked the corrected request.
- **M3:** A returned checked quotation retained an invented `<style>...</style>` passage absent from the captured text, because only the transformed temporary string was checked.

Their concrete examples and fix/verification/prevention guidance remain in [review 03](hr-ops-mvp-03-code-review.md#minor-issues). None was contested by this second review.

## Nits

None reported.

## Summary

The second review confirms the first pass and adds one source-configuration failure-isolation regression. Prioritize the transport error-body bound, then repair budget accounting/diagnostics, static capture validation, quote integrity and source error isolation. Contact-role ambiguity and domain spelling edge cases were examined but are not counted as additional findings without a stronger demonstrated impact in this scope.

Isolated second-pass scripts/results are retained under ignored `local/audit/recent-fixes-20261009/second/`: `probe.mjs`, `results.json`, `first-pass-repro.mjs` and `repro-results.json`. The new probe preserves its synthetic initialized workspace for reproducing the passing doctor result. Only these ignored audit artifacts and this review file were written by the second reviewer.

The parent review's fresh 80-test HR result and 767-module syntax result are supporting evidence; this reviewer did not duplicate the retained quick suite. The parent subsequently completed that run: 9,254 passed, zero failed, 10 baseline warnings. Live prompt-injection resistance and full Codex/Claude client acceptance flows remain outside this code audit's exercised coverage. Sending remains disabled, and no repair is claimed by this report.
