# HR-first setup and repeatable source reuse

Date: 2026-10-19

Scope: finish HR navigation and expose selected retained public readers as bounded research inputs. No prospect campaign, personal inbox, automated outreach, new search service or OpenClaw integration is included.

The preceding research/draft audit was committed as `ba0ed8e3b72112c0cb51e73c1071bad89b2a6937`. Its [HR CI run](https://github.com/AlanFPS/hr-ops/actions/runs/39296789483) passed on Windows and Linux before this implementation.

## Finding-to-test matrix

| Concern | Implementation | Regression coverage |
|---|---|---|
| Fresh HR users could encounter candidate setup and navigation. | Add HR `setup`, `menu` and npm entrypoints using the existing workspace creator. Explicitly label retained installer/dashboard commands as legacy. | New/empty destination, preview, no overwrite/copy/automatic selection, malformed active config, CLI routing. |
| Cross-client entrypoints could drift. | Shared HR skill with thin Claude and Cursor routers; natural-language prompts remain first-class. | Shared-router paths and unchanged legacy script meanings. |
| Company inventory was easy to mistake for reusable sources or qualified clients. | Read-only discovery plan separates feeds, per-ICP directories/queries, seeds, controls and existing-prospect exclusions. | Agency-only plan, disabled overrides, unchanged run state and records, retained inventory provenance. |
| Useful retained aggregator readers were not exposed through the HR research ledger. | Opt-in Remotive and HN readers dispatch through budgeted public capture with fixed endpoints and existing safety checks. | Reservation before dispatch, zero directory allowance, two-request budget exhaustion, restricted-host retry refusal and preview with no requests. |
| Readability could be mistaken for verified client demand. | Group publisher observations as research tasks, retain source/sequence and body, require independent review, and keep verified/qualified totals zero. Reuse attributed source ranking. | Hostile source content remains text; readable collections have zero invented demand matches; partial collections receive no complete-readability credit. |
| Unknown employer identity and existing companies could pollute discovery. | Preserve unknown websites, exclude canonical known domains/controls, flag name-only collisions and withhold admission hints for conflicting identities. | Domain/subdomain exclusions, aggregator profile rejection, mixed website coverage and conflicting-domain fixtures. |
| Repeating collection could waste requests or imply current complete coverage. | Hash-checked run-linked cache, explicit budgeted refresh, original collection time and later unreconciled attempts. | No-request restart/resume, candidate-cap behavior, failed refresh visibility, tampering rejection before normal collection or refresh. |
| Malformed or bounded data could appear as an empty board or completed discovery. | Partial diagnostics for dropped records, pagination and retention caps; valid empty response is not an empty-board outcome. | Malformed and valid-empty fixtures, HN interruption, honest zero verified prospects. |
| New configuration could invalidate historical snapshots or ignore overrides. | Optional strict feed overrides; historical configurations without the added key remain valid. | Disabled/unknown/duplicate/misspelled/nonboolean feed configuration and absent-key compatibility. |
| Recovery or implementation could modify operating prospects. | Reuse existing capture/ledger backup manifest and publication-only report refresh. | Isolated backup/restore/cache equality and deep equality against all 34 operating records. |

## Validation

- Node 24.21.0; dependency set and lockfile unchanged.
- `npm run test:hr`: 305 passed, zero failures/skips. Twelve new tests cover setup and source reuse; test counts overlap with the broader suite.
- System-file coverage passed for all 1,595 tracked files; staged whitespace validation passed.
- Broader `node test-all.mjs --quick`: 9,316 passed, one failure, ten warnings. The failure is a native Node/V8 fatal error (`current == end_slot_index`) in a child process of the unchanged legacy `paste-reply-tests.mjs`, not a failed JavaScript assertion. A direct rerun on the same pinned runtime passed all 33 checks. No test or application code was changed to hide the crash, and the broader run is not claimed as fully green. Quick mode omits the retained dashboard build. The ten warnings match the preceding audit: absent candidate CV, six retained upstream-author matches, unavailable comma-decimal locale and two disabled opt-in live tests.
- Bounded public transport smoke in an independent experimental root: Remotive used one request, retained 12 observations and returned two research tasks; HN used two requests, retained its 200-observation maximum and correctly reported partial collection. Zero prospects were imported or qualified. This checks transport and bounds, not employer verification or market coverage.
- Backup taken before refreshing derived reports. All 34 canonical operating records, including history, drafts, interactions and scores, remain deeply equal to the starting snapshot. Firm profile bytes are unchanged. All 34 derived dossiers are current.
- Private local receipts: `local/hr-product-final-hr.log`, `local/hr-product-quick.log`, `local/hr-product-paste-reply-retest.log`, `local/hr-product-smoke-20261019/summary.json` and `local/hr-product-preservation.json`. No operating data or public-feed excerpts are committed.

## Deliberate limits

The two added feeds cover employer discovery, not agency client placements. Agency work continues through the separate current client-vacancy sources and query/directory tasks. Feed observations never establish LATAM eligibility, distinct requisitions, supplier appetite or service fit. Scores, thresholds, approval boundaries and current prospect decisions are unchanged.

The retained installer still installs Career-Ops; candidate dashboards remain candidate tools. This release provides HR CLI/skill entrypoints, not a new graphical dashboard or published installer. If a provider fails before creating a derived cache, another attempt remains a budgeted retry; partial raw captures are preserved without introducing a general replay engine. Browser workflows remain separate and were not exercised here. No messages were sent.
