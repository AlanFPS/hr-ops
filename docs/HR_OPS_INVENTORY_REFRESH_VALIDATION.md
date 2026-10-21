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
