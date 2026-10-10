# Code Review: Operating-fix publication review

**Reviewed Files:** `hr-ops.mjs`, `lib/hr-ops/{client,claim-numbers,export-file,model,operations,research-run}.mjs`, `scripts/hr-ops-acceptance.ps1`, `tests/hr-ops/{fixtures,operating-fixes.test}.mjs`, shared/outreach modes and operating-check documentation.

**Review Date:** 2026-10-10.

**Severity Summary:** Initial review: 0 Critical, 0 High, 1 Minor, 0 Nit. M1 is resolved; independent [review 07](hr-ops-mvp-07-code-review.md) confirmed closure and resolved two additional Minor findings. Zero confirmed findings remain in this scope.

## Critical Issues

None confirmed.

## High Priority Issues

None confirmed. A Windows trailing-space traversal hypothesis was tested only inside a disposable local fixture. Node created literal path components; the expected outside file was absent. This is not reported as a confirmed escape.

## Minor Issues

### M1 — JSON helper discovers an output-mode mismatch after executing the command (resolved)

- **Location:** `lib/hr-ops/client.mjs`, `runHr`.
- **Severity:** MINOR.
- **Problem:** The helper unconditionally calls `JSON.parse(result.stdout)` after the CLI succeeds. The prior Claude run encountered this with `status --markdown`. With a mutating command such as `discover --summary`, a post-command parse error can obscure a successful write and encourage an unnecessary retry.
- **Example:** `runHr(['discover', '--input', '-', '--summary'], { input: payload })` dispatches before discovering that the requested output is not JSON.
- **Fix:** Provide a checked text-output runner for Markdown/CSV/help, and reject incompatible output modes in the JSON runner before invoking the CLI. Preserve status/error checks for both runners.
- **Verification:** Assert that a JSON-runner call using non-JSON output fails before prospect creation, and that the text runner returns actual Markdown/CSV while still throwing on CLI failure. Continue testing JSON export receipts.
- **Prevention:** Keep output modes explicit at the shared client boundary; add regression coverage whenever a new textual CLI format is introduced.
- **Resolution:** `runHr` now rejects textual output modes before dispatch. `runHrText` returns raw stdout while preserving checked exit behavior. The regression verifies a rejected JSON/text mismatch creates no prospect, exercises Markdown/CSV/help, and confirms that file exports still return JSON receipts.

## Nits

None reported.

## Summary

The four original fixes and the outreach attribution workflow are implemented and backed by the isolated runs recorded in `docs/HR_OPS_OPERATING_FIXES_VALIDATION.md`. This final publication review checks the pending patch and its contracts, not all retained upstream code or unexercised live behavior. M1 and the independent review's M2/M3 are resolved; the final focused suite passes seven tests. No prospect data was modified by this review.
