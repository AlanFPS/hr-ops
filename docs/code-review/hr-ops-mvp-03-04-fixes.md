# Acceptance audit repairs

This records the repairs to the five findings in [review 03](hr-ops-mvp-03-code-review.md) and [independent review 04](hr-ops-mvp-04-code-review.md). The original reports remain audit history. No prospect data migration or external communication is part of these repairs.

| Finding | Resulting behavior |
|---|---|
| H1: unbounded capture error bodies | The shared HTTP helper retains at most 8,192 input bytes for error diagnostics. Bounded successful reads slice the final chunk, cancel unread data and avoid inventing a replacement character at a cut UTF-8 boundary. Capture retains its 2,000,000-byte successful-read limit. Status, Retry-After, Location and ordinary successful text/JSON behavior remain intact. |
| M1: budget accounting and diagnostics | `discover --run ID --dry-run` performs no network requests or writes and returns pending collection tasks. Actual quota denials carry a non-retryable policy error; Greenhouse enrichment propagates it, and discovery reports `budget-exhausted` with `partial: true`. The existing preview behavior without a run ID remains available and documented. |
| M2: invalid capture inputs consume quota | Capture validates all supplied evidence metadata before reserving or fetching, in preview and commit. Metadata requires an excerpt. Actual failed requests and post-fetch quote mismatches still consume their attempts. |
| M3: quote mismatch | The requested quote is plain text, with only whitespace normalized. The exact returned excerpt is the string checked against captured content. HTML stripping cannot remove unsupported content just for validation and then restore it in evidence. |
| M4: malformed source aborts unrelated discovery | Source inspection merges domain overrides, filters the selected ICP and validates entries independently. Valid sources continue alongside named errors. Doctor returns `source_errors` and a nonzero exit for invalid configured sources. Minimal disabled-domain overrides remain valid. API sources must resolve to a trusted supported provider URL. |

The source/preview contract and capture constraints are documented in [research controls](../HR_OPS_RESEARCH.md), the operating guide and the future operator contract. No new dependency, delivery channel, CRM integration or OpenClaw component was introduced.

## Regression evidence

- `npm run test:hr`: **89 passed, zero failures**, including nine new end-to-end/API cases in `tests/hr-ops/audit-repair-regressions.test.mjs`.
- `tests/providers/http-body-bounds.test.mjs`: **9 passed, zero failures**, including oversized successful/error bodies, intact short diagnostics, stream cancellation, split UTF-8, unsupported body-reader rejection, timeout, empty bodies and preserved ordinary reader behavior.
- Targeted retained HTTP tests: **19 passed**; Greenhouse tests: **41 passed**. These include continued best-effort handling of ordinary optional-enrichment failures.
- Syntax validation: **769 modules passed**. Retained `node test-all.mjs --quick`: **9,258 passed, zero failures, 10 warnings**. Both new regression files ran successfully in this broad run, including the late UTF-8 case. This quick suite excludes the dashboard build.
- [Independent closure review 05](hr-ops-mvp-05-code-review.md) confirmed all five fixes and independently reran the 18 new tests successfully; no remaining confirmed defect in this scope.
- Data integrity: all 14 original acceptance record hashes match. Main records retain the earlier PostHog/RFS revisions and outcomes; the other eight match pre-acceptance-repair snapshots. No interaction changes; PostHog outreach remains blocked. Doctor is healthy with no source errors, and `git diff --check` passes.
- Local logs are under ignored `local/audit/recent-fixes-20261009/repairs/`.

The initial broad run exposed an old section-54 test mock that implemented only `text()`, without a response stream. It was stopped after diagnosis. That fixture now returns a native `Response`, retaining its existing status/message/body/header assertions and exercising the bounded reader used in production. A dedicated regression also verifies that short error diagnostics survive intact. The original failed-run log is preserved as `retained-quick-before-fixture-update.log`; the final broad run starts from the updated fixture. No unbounded production fallback was reintroduced to accommodate the mock.

Final verification also exposed a truncation-indicator edge case: decoding can remove a three-byte BOM and up to three incomplete UTF-8 tail bytes. Capture now conservatively flags content within six decoded bytes of its cap as possibly truncated. This correction and its regression were added while the broad suite was running; the final 89-test HR run and independent 18-test focused run both exercised the corrected code.

The ten broad-suite warnings were reviewed: one missing legacy candidate-data check, six upstream-author name heuristics in unchanged GitHub automation files, one unavailable comma-decimal locale (static checks ran), and two opt-in H1B live API/token-mint tests skipped. They are the same warning categories as the preceding acceptance-repair run; no HR repair failure is hidden in this count. No external token minting or live API check was enabled for this repair verification.

The deterministic tests use isolated repositories and mocked network responses. They do not replace a live Codex/Claude workflow acceptance run or exercise model-level prompt-injection resistance. Approval and messaging boundaries are unchanged.
