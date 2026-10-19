# Research and drafting exercise audit

Date: 2026-10-19

Scope: the retained company-catalog screening, one-prospect follow-up research and one LinkedIn draft. The purpose is system improvement, not further acquisition work. No public research, LinkedIn account access or external communications were needed for this audit.

## Findings and fixes

| ID | Repeatable weakness | Fix | Verification |
|---|---|---|---|
| R1 | Markdown interpolated an inclusive employee range as `51,200`, which looks like a large exact headcount. | Format employee and recruiter ranges as `51–200`; preserve scalar counts and explicit unknowns. | Range/scalar/unknown dossier regression. |
| R2 | A focused research run could not express zero directory reads; setup required an unused positive allowance. | Accept nonnegative `directory_pages`, keeping candidate and total-page bounds positive. Reject directory reservations before dispatch when the cap is zero. | CLI configure, denied reservation, completion and backup/restore equality. |
| R3 | An offline catalog origin required a request sequence, encouraging a later validation search to be referenced as the discovery source. | Permit explicit null URL and sequence with a required explanation before any request. Preserve candidate limits, immutability, late flags and numbered public origins. Offline-only work may finish only as deferred, never researched or exhausted. | Before-request admission/import, no fabricated URL, idempotency, immutable origins, completion restrictions and malformed origins. |
| R4 | Outreach briefs listed draft IDs but omitted exact wording, review status and missing fields. Agents had to make extra reads to inspect or compare existing messages. | Return existing bodies, subject, human-review state, missing fields and derived `prepared_for_review`, retaining current/replacement flags and `send_enabled: false`. | Current, superseded and stale drafts; qualification downgrade invalidates actionability; isolated repository restart and restore. |
| R5 | Secondary-only size estimates and executive fallback contacts were available in raw facts/risks but easy to overstate in generated reports and briefs. | Add advisory `research_caveats`; show contact-ranking rationale and supplier authority in dossiers. Explicitly separate prepared drafts, human review and sending permission. | Caveats surface consistently in research, outreach and Markdown without changing records or score results. Primary size evidence and functional contacts avoid the corresponding warnings. |
| R6 | Manual research retained provider/requisition IDs without their board scope. Existing exact-count guards remained conservative, but the omission was not prominent in work briefs. | Expose a board-scope caveat and update research guidance to retain verified scope alongside IDs. Do not infer board ownership or silently merge historical openings. | Unscoped IDs warn, scoped IDs remove that warning, and scores and records remain unchanged. |

Five initial regressions reproduced failures before the first patch. Eight final tests cover those fixes, offline provenance and a connected fixture scenario. Fixtures use fictional businesses and synthetic content exclusively.

The shared modes now distinguish inventory screening, live research, persisted records, relevant/eligible demand and qualification. They also direct system-improvement requests toward code/workflow fixes and regression tests instead of extending prospecting without a validation purpose. This is procedural guidance, not a new policy engine. The operating guide clarifies that review tokens are under `continuation_review`, not at the top level of a CLI response.

## Validation

- Baseline: `npm run test:hr`, 285 passed, zero failures/skips.
- Final HR suite: `npm run test:hr`, 293 passed, zero failures/skips, including eight new regressions.
- New fixture flow covers research, qualification, a concise draft, pending human review, expected-revision rejection, restart, backup/restore and zero interactions/reminders. A configured firm email is not required for the LinkedIn draft.
- System-file manifest coverage passed. New test and review-document paths are covered by the existing `tests/` and `docs/` prefixes.
- Broader retained `node test-all.mjs --quick`: 9,312 passed, zero failures, ten reviewed warnings, exit 0. The warnings match the previous audit: legacy CV checks without candidate data, six retained upstream-author name matches, unavailable comma-decimal locale coverage and two opt-in live vendor/token-mint tests not enabled. No paid/live checks were enabled to hide warnings. Quick mode omits the dashboard build; these checks are not production or live-source certification, and their counters are not added to the HR test count as distinct tests. The broader run also executed the final eight-test regression file successfully.
- Refreshed all 34 derived dossiers through `reports refresh` after a local backup. Doctor reports no record errors and all 34 dossiers current. Deep equality checks preserve all 34 canonical prospect records, history, scores, drafts and interactions; firm configuration is unchanged. Ten older missing-publication-metadata warnings were resolved by regenerating derived reports, without rewriting historical acceptance reports.
- Existing outreach remains pending human review and unsent. No approval, interaction or commercial state was invented. No operating research ledger was rewritten to retrofit the new offline-origin contract.

Local verification artifacts: `local/hr-research-draft-audit-baseline.log`, `local/hr-lessons-before.log`, `local/hr-research-draft-audit-final-tests.log`, `local/hr-research-draft-audit-quick.log` and `local/hr-research-draft-audit-verification.json`. These remain private and outside Git.

## Limits retained intentionally

Scoring weights, qualification thresholds and contact-ranking rules are unchanged. A reported size range may still be a targeting input; the system exposes its source limitation instead of claiming independent headcount verification. Advisory caveats do not prove source accuracy, supplier appetite, hiring ownership or semantic truth. Missing board scope remains a research task; no old IDs, source timestamps or historical decisions are manufactured. Existing sending and human-approval boundaries remain in force.

Changes are local for review; this request did not ask for a commit or push.
