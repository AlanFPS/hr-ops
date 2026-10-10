# Code Review: Independent verification of acceptance-audit repairs

**Reviewed Files:** `providers/_http.mjs`, `providers/greenhouse.mjs`, relevant provider URL-detection interfaces, `lib/hr-ops/research-run.mjs`, `lib/hr-ops/sources.mjs`, `lib/hr-ops/discovery.mjs`, the doctor changes in `hr-ops.mjs`, `tests/hr-ops/audit-repair-regressions.test.mjs`, `tests/providers/http-body-bounds.test.mjs`, the response mock adaptation in `test-all.mjs` section 54, and related operating-documentation changes.

**Review Date:** October 9, 2026 (October 10 UTC).

**Severity Summary:** **0 Critical, 0 High, 0 Minor, 0 Nit remaining confirmed findings in the five-fix scope.**

**Method:** Independent second review required by the user's `~/.cursor/commands/audit.md`, following the repair of the findings recorded in reviews [03](hr-ops-mvp-03-code-review.md) and [04](hr-ops-mvp-04-code-review.md). Inspected the implementation and its failure boundaries, reviewed the regression coverage, and independently reran both new test files. This closes the five identified defects; it is not a fresh certification of the entire retained codebase or live agent behavior.

## Critical Issues

None confirmed.

## High Priority Issues

None remaining in scope. **H1 is closed:** the shared stream reader at `providers/_http.mjs:20` slices retained chunks to the requested byte bound, cancels the stream, and keeps consumption inside the request timeout. Non-success responses use the bounded 8 KiB diagnostic prefix at `providers/_http.mjs:81`. Ordinary successful `fetchText`/`fetchJson` retain their full-response semantics. The actual default capture transport regression and oversized-chunk, cancellation, timeout and UTF-8 boundary tests pass.

## Minor Issues

No remaining confirmed Minor issue in scope.

| Prior finding | Repair inspected | Independent verification |
|---|---|---|
| M1: previews bypass allowance; enrichment hides quota denial | `lib/hr-ops/discovery.mjs:76` makes budgeted previews network-free. `ResearchBudgetError` is explicitly nonretryable; Greenhouse propagates policy denials at `providers/greenhouse.mjs:181`. Discovery returns `budget-exhausted` and partial results. | Repeated previews perform no fetch/write; a one-page Greenhouse limit denies offices enrichment with a structured diagnostic; Ashby does not retry a denied reservation. |
| M2: invalid capture metadata spends quota and passes preview | Static evidence validation at `lib/hr-ops/research-run.mjs:79` precedes reservation and retrieval. Explicit falsy publication values are validated, and metadata without an excerpt is rejected. | Invalid quote kind, source type, empty/oversized excerpt and malformed/future publication dates fail in both preview and commit with zero fetches and no ledger creation. A corrected valid capture retains its allowance. |
| M3: checked quote returns unchecked text | Quote input receives whitespace normalization only; the same plain-text string is matched against captured content and stored as evidence. HTML extraction is applied only to the source document. | Invented script/style passages and markup-bearing pseudoquotes fail; whitespace-normalized quotes and literal angle-bracket text from decoded source entities return exactly the checked text. Actual quote-match failures still count as attempts. |
| M4: unrelated invalid source blocks valid collection | `inspectSources` at `lib/hr-ops/sources.mjs:12` separates merging, ICP selection and per-entry validation/diagnostics. Doctor reports `source_errors` at `hr-ops.mjs:142`. | Unsupported providers, malformed identity evidence, missing provider URLs and malformed websites do not block the valid selected ICP; mixed results retain source diagnostics; doctor fails for bad enabled sources while minimal disabled overrides remain valid. |

The adopted behavior is coherent with the documented compatibility boundary: provider discovery without a run ID retains its previous public-read preview behavior; `--run ID --dry-run` produces tasks without doing research. Invalid capture requests do not consume attempts, while actual retrieval failures and quote mismatches still do. Configuration diagnostics do not silently enable or repair an invalid source.

## Nits

None reported.

## Summary

All five prior findings are closed by the inspected repairs and focused regression evidence. The independent final rerun completed **18 tests: 18 passed, 0 failed** across the nine HR audit regressions and nine HTTP body-bound tests. The parent run's broader HR/provider/syntax checks are supporting evidence; this reviewer did not duplicate the retained quick suite running concurrently.

The retained suite initially exposed a mock mismatch in section 54: its handcrafted response implemented only `text()`, while native fetch responses expose the body stream required by bounded reading. The fixture now uses `new Response(...)`, preserving the existing assertions rather than weakening the production bound. The added short-HTTP-429 regression independently confirms that diagnostic text below the cap remains byte-for-byte intact and does not leak into the error message. The fixture adaptation itself changed no production code; the earlier interrupted broad-run log remains retained separately.

A final UTF-8 boundary check reproduced a false completeness signal: decoding can discard a three-byte BOM and up to three incomplete trailing bytes, leaving decoded text below the cap even when the reader stopped at that cap. The reviewed follow-up uses one `CAPTURE_MAX_BYTES` constant and marks decoded sizes within six bytes of the cap as `possibly_truncated`. This deliberately conservative indication preserves the string helper's existing decoding behavior. The added regression passes for a split two-byte character, a BOM, and a combined BOM/split four-byte character; a complete short page remains unflagged. This late edge case is closed and is included in the final 18-test result.

The tests cover the previously missing cross-path cases, including shared transport consumption, multi-request providers, retry policy, preview accounting, source failure isolation and doctor behavior. No implementation or live prospect data was changed by this reviewer, and no external request or outreach was performed.

The bounded capture helper remains a simple text extractor, not a browser or semantic verifier. Native research-tool budget compliance, live prompt-injection resistance, and full Codex/Claude client acceptance remain outside this focused repair verification. These existing scope limits do not reopen the five corrected findings.
