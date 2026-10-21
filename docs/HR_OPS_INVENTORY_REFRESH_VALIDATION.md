# Inventory refresh and agency source validation

This release extends the existing local inventory queue and shared skill. It does not introduce a scheduler, parallel queue, CRM, new scoring policy or external messaging.

## Changes and limits

- The inventory/readers checkpoint is `aa6be0c8`. Its audit corrected the exact-retention-limit metadata case and added a regression without changing provider implementations.
- `inventory queue --scope refresh` projects actionable research work from saved prospects. `--scope new` remains the default; `all` combines both. Existing pipeline IDs, restrictions, suppression and revision checks remain binding.
- Research refresh reuses current briefs, before/after research snapshots and Career-Ops' pure liveness classifier on matching descriptions in hash-validated structured board captures. It spends no requests and performs no writes. Manual whole-page text is not classified as a single role. Live verification still uses existing run/budget/capture/research APIs.
- Meaningful stored opening, fact and contact changes are reported separately from evidence age. They are not independent proof of a market change or a candidate requirement disappearing.
- One agency source, HIRECLOUT's first-party jobs board, and two agency query recipes were added. Restricted U.S. client vacancies remain restricted. Role age, service fit, recruiter count, LATAM coverage and supplier appetite require further research. No arbitrary manual-site scraper was enabled.

## Finding-to-test matrix

| Failure | Verification |
|---|---|
| Metadata makes an exactly retained feed appear truncated | `expanded-readers.test.mjs`: exactly 200 RemoteOK jobs plus metadata, and a genuinely truncated 201-job case |
| Refresh creates duplicate prospects or another state database | `research-refresh.test.mjs`: read-only scopes, unchanged canonical bytes and no inventory file creation |
| Holds, suppression, exclusions or targeting restrictions are bypassed | Refresh exclusion cases cover holds, closed states, supported blockers, source disables, controls and confirmed out-of-range size; unknown, stale and overlapping size remain reviewable |
| Stored changes become fictional market events | Snapshot comparisons retain baseline history IDs and do not replay later commercial actions; timestamp-only rechecks produce no meaningful change |
| Another role or whole board produces a liveness decision | Matching structured-role capture only; wrong-role and whole-page fixtures yield no signal; corrupt hashes fail closed |
| Partial feed absence closes a vacancy | Partial Himalayas fixture leaves prospect bytes and reconciliation flags unchanged |
| Refresh loses state after restart or restore | CLI scope/revision checks and backup/restore equality without an additional queue file |
| Services, internal jobs or restricted roles become eligible agency demand | `agency-sources.test.mjs`: internal jobs earn no demand yield; restricted client roles remain ineligible for qualified LATAM demand |
| New defaults override user configuration | Agency manual tasks, explicit disables and ICP-specific query overrides; no network dispatch from manual sources |

## Reproduction

Use Node 24 and the repository lockfile. Commands run fixtures in isolated temporary roots, with no LinkedIn or external delivery:

```text
npm ci --ignore-scripts
npm run test:hr
node test-all.mjs --quick
node validate-system-paths-coverage.mjs
git diff --check
```

The new tests are `tests/hr-ops/research-refresh.test.mjs` and `tests/hr-ops/agency-sources.test.mjs`. Existing inventory, feed, retained provider and liveness regressions remain included. Browser fixtures require the existing explicit Chromium installation; the production research path does not install a browser.

Validation completed using Node v24.21.0: the final broader quick run exited 0 with 9,333 passed, zero failed and ten reviewed warnings. All 355 HR checks passed within that run, including eleven refresh and three agency-source cases. Manifest coverage passed for all 1,610 tracked paths. The ten warnings concern absent legacy candidate data, six retained upstream-name detections, an unavailable comma-decimal locale and two explicitly opt-in H1B live/mint checks. No assertion, timeout or source restriction was weakened to obtain these results.

Private validation receipts are in `local/`: `inventory-reader-audit-tests.log`, `refresh-agency-targeted.log`, `refresh-agency-hr-suite.log`, `inventory-refresh-agency-quick.log` and `refresh-agency-final-validation.json`. These paths are not portable release evidence; reproduce the tracked tests for another machine. The operating root's 34 prospect files were byte-compared against the earlier inventory acceptance baseline and remain unchanged.

## Bounded source check

The source investigation used a new experimental data root, four search queries and six page attempts, including unreadable and failed reads. The initial helper sent a nested scope payload that the CLI correctly rejected. The same unscoped ledger was retained, with procedural limits of four queries and twelve pages; attempts were never reset or migrated into another run. This is a procedural limit, not a claim of enforced scoped acceptance. The run was completed with zero prospects and zero communications.

The readable HIRECLOUT role establishes client attribution and a U.S. work-authorization restriction, not present LATAM eligibility. Its listing age remains a currentness gap. The root host returned 403 and was not retried; the separately readable jobs subdomain is first-party. NextDeavor remained unverified after thin home content and a JavaScript-only board. Artisanal Talent's search results were services/leadership-oriented, not verified client engineering vacancies. No seed-count target justified adding weak sources.

This was source validation and local deterministic acceptance. It was not a ten-prospect discovery pilot, fresh Codex/Claude client certification, live business-inbox validation or production certification. Existing business-email and protected-backup setup gaps are unaffected.

## Release acceptance observations, 2026-10-21

The complete inventory/refresh implementation at `7496ab91b2eabd22e25ec0630a822188dacccdbe` passed [Windows and Linux CI](https://github.com/AlanFPS/hr-ops/actions/runs/39676907368). Separate fresh Codex and Claude checkouts used that exact build, the same task prompt and dependency lockfile, Node v24.21.0, and empty pipelines. The first Claude launch failed authentication before testing; it was retained, and a new checkout/session was used after private human login.

| Live refresh run | HR fixtures | Companies | Pages / queries | Scope |
|---|---|---|---|---|
| Codex | 355 passed, zero skipped | Two startups, two agencies | 20 / 0 | Four catalog targets, two passes |
| Claude | 355 passed, zero skipped | Two startups, two agencies | 20 / 1 | Same targets and budgets; additional reviewed listings |

Each run had a 24-page, eight-query cap and six pages per candidate, including failed attempts and the unknown-to-verified identity phase. These were refresh tests, not broad discovery or verified outreach campaigns. Unchanged lists and additional research knowledge were distinguished from market changes. Different researched listings and contacts explain differing scores; equal scores were not a success criterion.

The final evidence review found and resolved these issues:

| Finding | Resolution and verification |
|---|---|
| A scoped receipt overstated company pages remaining after an earlier `company:null` request | The receipt now uses the combined candidate count. The existing unknown-company regression checks receipts, and the added six-page case checks dry runs, restart, independent candidates, rejected dispatch and unchanged query/unscoped semantics. Budget enforcement already rejected the excess page; the fix changes the receipt, not the cap or ledger schema. |
| River's U.S. offices and Americas/Europe role scope were treated as confirmed U.S. role eligibility | Corrected to unknown using revision-checked research, preserving the opening ID and source history. The original interpretation and correction remain inspectable. |
| Resend team locations were described as direct employment | Replaced with the observed team locations; engagement model and supplier appetite remain unknown. The original native output was retained. |
| Dynamic status timestamps made response equality look like a state change | Repeated controls compare canonical exports, revisions and record bytes. No-op qualification and rejected stale revisions do not mutate records. |
| A restore could verify an old snapshot without proving it contains the final ledger | The host audit compares every backup manifest hash with both the restored files and final operating files, including the completed research ledger. |

The corrected live workspaces each pass twelve independent structural/integrity checks. Each final backup restores all 30 manifest files, including 19 captures and its ledger, without browser sessions. After the host research corrections, qualification no-ops and stale-revision rejection were rechecked. The operating checkout's original 34 prospect files remain byte-identical. No messages, drafts, approvals or interaction events were created in either real-company test pipeline.

The receipt regression file passed all 22 checks, and the updated full HR suite passed all 356 with zero failures or skips. Subsequent committed-build acceptance must identify its own revision: the earlier live requests above did not exercise the follow-up receipt correction. Fresh affected-path sessions use the same new committed revision, run the full fixture suite and independently check the six-page receipt sequence and denied seventh dispatch, without additional public requests. Private receipts and prompts are under `local/release-*`; each isolated workspace retains `local/acceptance/`, including original native reports, reviewed artifacts and transcripts. These local paths are inspection conveniences, not portable evidence by themselves; reproduce the tracked tests and inspect each run's build metadata.

Source interpretation still requires review. A passing schema or fixture suite does not validate buying intent, exact employment arrangements, every contact-title variant or unattended research accuracy. Some manager/sales titles remain visible without recognized leadership relevance; supplier authority is unverified. Missing business email, operating-account configuration, real business-inbox validation and protected off-device backups remain separate operating requirements.
