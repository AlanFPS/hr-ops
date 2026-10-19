# Audit of HR-first setup and source reuse

Date: 2026-10-19

Baseline: `75312f1ee37236a5a9b3d10e20769eef197df9fd`. Scope includes HR setup/menu, source plans, public feed adapters, observations, exclusions, cached resume, diagnostics and recovery. No live prospecting or personal-account activity was required. Research, scoring and sending remain separate.

## Findings, fixes and regressions

All new regression cases live in `tests/hr-ops/setup-source-audit.test.mjs`.

| ID | Finding | Fix and verification |
|---|---|---|
| A1 | Permissive date parsing normalized impossible dates and numeric values into apparent publication dates. | Validate calendar/timezone/date-only formats; retain the reported value, precision and explicit unresolved/unknown status. Test rollover, numbers, future dates and a real leap day. |
| A2 | HN accepted an item response whose ID differed from the requested hiring story. | Check item identity on collection and cached raw evidence. Wrong-story responses produce no research tasks. |
| A3 | Awaited reads could return tasks against old candidate capacity; request counts included another operation's reservations. | Recheck scope before each read and task selection; count invocation-local dispatches. Concurrent query/admission fixtures verify counts, capacity and the distinction between candidate and request-budget exhaustion. |
| A4 | URL/title deduplication silently dropped posting variants with different IDs, descriptions or country restrictions. | Collapse exact observations only. Preserve conflicting variants without asserting distinct requisitions. |
| A5 | A derived cache could be replayed with missing or changed referenced raw captures; a missing cache could trigger another request. | Validate linked files, raw hashes and references before reuse or refresh. Missing/changed evidence fails without dispatch. |
| A6 | Cache request/row validation was incomplete, and capture directories could be filesystem links. | Validate endpoints, sequences, run attribution, raw payload scope, timestamps and row shapes. Reject linked paths, including dangling directory links, before requests. |
| A7 | Changing a cache's routing metadata could make the collector skip its hash check. | Check recognizable feed-cache identity/hash before feed selection. Mutated kind/feed IDs cannot trigger an implicit fresh read. |
| A8 | Doctor and restore did not validate the new feed evidence graph. File checksums alone could preserve an inconsistent graph. | Share ledger/capture diagnostics across doctor and restore. Verify a correctly checksummed backup of inconsistent data is rejected and retained in its isolated destination. Keep detailed restore errors; remove duplicate ledger enumeration. |
| A9 | Near-cap valid JSON could lose its truncation diagnostic. Malformed IDs were converted into strings such as `[object Object]`. | Propagate capture diagnostics; preserve unknown IDs and partial malformed fields. Older cached completeness is corrected in the current view without rewriting the capture. Normalize aggregator/LinkedIn host checks, including trailing dots and aggregator subdomains. |
| A10 | Incidental description or employer-name keywords could surface unrelated advertised roles. | Apply the configured pattern to the role title, using the role segment of supported HN headers. Account-executive fixtures mentioning backend engineers are excluded. Unusual titles remain a configurable/manual research limitation. |
| A11 | Plans, company collection and feeds disagreed on subdomain/trailing-dot exclusions. Conflicting publisher identities could hide a known domain. | Share domain-boundary matching; check each asserted website before provisional grouping. Preserve unknown conflicting identities with no admission hint. Test exact domains, aliases/subdomains, trailing dots, conflicts and unrelated suffixes. |
| A12 | Setup/menu silently accepted known flags they did not implement. | Reject unsupported command-specific options before workspace creation. Verify no destination is created on an invalid setup request. |

Eight initial test cases failed against the baseline. Follow-up negative cases exposed cache routing, malformed IDs, incidental role matches, incomplete recovery validation and conflicting-domain exclusions before their fixes. Existing regression failures during the implementation exposed duplicate doctor errors and loss of specific restore diagnostics; both were corrected without weakening those assertions.

## Verification

- Node 24.21.0. Dependencies and lockfile unchanged.
- Baseline HR suite: 305 passed, zero failures/skips.
- Expanded HR suite: 317 passed, zero failures/skips, including 12 new audit tests. Latest affected setup/source/recovery checks: 64 passed. Counts overlap and must not be added as independent coverage.
- Broader retained `node test-all.mjs --quick`: 9,320 passed, zero failures, ten reviewed warnings, exit 0. The retained `paste-reply` test passed in this run. Warnings concern the absent candidate CV, six retained upstream-author matches, unavailable comma-decimal locale and two opt-in live checks not enabled. No tests were weakened or skipped to manufacture a pass. Quick mode omits the candidate dashboard build; this is not production or live-source certification.
- Positive recovery remains covered by the retained feed restart/backup/restore test. New negative recovery verifies that valid backup file checksums do not establish referential evidence integrity. No operating root is replaced.
- Restored the previous real public-feed smoke captures into an isolated experimental root and replayed both collectors offline. Remotive reused 12 observations; HN reused 200 with partial collection preserved. Both spent zero requests and imported zero prospects. Every copied capture remained byte-identical. This validates compatibility with those actual payloads, not current source availability or employer qualification.
- System-file manifest coverage: all 1,598 tracked files covered. Staged whitespace checks passed.
- All 163 private operating data/configuration files remain byte-identical, including 34 prospect records, drafts, interactions and research ledgers. No operating migration, qualification, draft approval or report refresh was necessary.
- Private receipts are under `local/hr-setup-audit-*.log`, `local/hr-setup-audit-preserved.json` and `local/hr-setup-audit-replay.json`; no user data or source excerpts are included in this patch.

## Scope and remaining limits

Feed observations remain unreviewed leads. Neither a readable response nor a parsed publication date establishes role currency, hiring geography, client placement, service fit or supplier appetite. Agency discovery retains its separate attributable-client-demand routes. Scores, thresholds, contact ranking and suppression/sending rules are unchanged.

Current capacity is a snapshot, not a reservation: independent admission still validates the ledger. Hashes and path checks detect ordinary corruption/mistakes; they are not a security boundary against an agent with unrestricted filesystem access. Restore validates the copied data before operating-root selection; previews still check manifests without claiming a full semantic restore drill. No messaging, personal-inbox testing, MCP service or OpenClaw installation is introduced.
