# Live operating pilot — October 10, 2026

The current runtime completed a fresh, isolated, Codex-operated public-research pilot. State controls passed; research coverage remains partial. This is not a new paired Claude/Codex acceptance run or production certification.

## Build and isolation

- Base: `452567a88050fbe2c7e82e9d826ed64f8fb5d1c9`, Node 24.21.0, dependencies installed with scripts disabled.
- Only the research-mode instruction was overlaid before the pilot: concurrent vacancies alone cannot establish recruiting pain. SHA-256: `6D66F71D1E49AB32EBF7A7A856C13AA9C7149CA133D221AF90BD036AF2343F85`.
- Runtime code matched the commit. Channel-specific readiness documentation was clarified after the pilot without changing behavior.
- A fresh data root began with no prospects and the authorized firm configuration. The original workspace's ten prospect hashes remained unchanged. Private identity, dossiers, contacts and messages remain outside Git.

## Results

Six starter companies (three agencies and three startups), one additional startup found through web search, and one enterprise exclusion control were persisted. One startup provisionally qualified, six leads remained researching and the control was disqualified. Two initial outreach variants were saved for the qualified prospect; no follow-up was fabricated.

The qualifying score was 80/100: demand 30, fit 15, LATAM compatibility 25, need 0, access 10. Recruiting pain remained unknown throughout the sample. A score establishes prioritization, not buying intent or supplier approval.

Three starter companies lacked a verified current target opening: failed role retrievals and a job-not-found response were retained as gaps, not converted into positive demand. The additional startup's indexed full-stack listing was absent from its current ATS; its available computer-vision data role was reviewed and classified outside the target families. A reviewed agency mandate was restricted to U.S. work and retained as client hiring rather than the agency's own hiring.

A semantic review corrected an overinterpretation of country flags on a team page: flags do not verify residence or employment jurisdiction. The physical-presence fact was changed to unknown through the CLI, with immutable evidence and an explicit correction retained. Qualification did not change because eligibility was independently supported by actual job descriptions. The research correction invalidated both drafts, which were regenerated through the revision-aware API. Role attribution and full-message meaning were reviewed separately from the automated claim checks.

## Verification

- **18/18 operating checks passed** after correcting two harness mistakes. Initial failures were retained locally: the script wrongly expected LinkedIn readiness to require email, and selected an export path outside the documented `local/exports/` directory. Application behavior was correct in both cases.
- **96/96 HR regression tests passed.** No runtime change was made in this pilot. Earlier retained-suite results are recorded in the [operating fixes validation](HR_OPS_OPERATING_FIXES_VALIDATION.md); they were not rerun here.
- Fresh-process persistence, domain deduplication, no-op qualification, stale revision rejection, unqualified-outreach refusal, contact publication freshness, geographic restrictions, attribution, enterprise exclusion and empty follow-ups passed.
- Full export was written directly by the CLI and deep-compared with all eight canonical records.
- **20/20 query reservations and 41 page/API attempts**; no company exceeded six page attempts. Failed requests and repeat extraction reads counted. Exhausted query and company-page checks dispatched zero callbacks and left the ledger unchanged. Native-tool compliance was manually reconciled; the ledger is not an independent permission boundary.
- Final doctor was healthy. Zero interaction or approval records, external messages, external CRM writes, purchases or commitments.

LinkedIn draft readiness requires firm/sender names but does not require email addresses. Email readiness additionally requires a firm email and an evidenced public recipient address. A prospect can therefore be `OUTREACH_READY` from a LinkedIn variant while its email variant remains incomplete. All drafts still require human review; the application cannot send them.

## Limits and local artifacts

This small, seed-heavy sample does not validate market recall, conversion, subcontracting demand or agency acquisition quality. Supplier appetite remains unverified. Live malicious prompt injection and real reply/commercial workflows were **not exercised**. One control's numerical workforce evidence is explicitly historical rather than a current headcount claim.

Native excerpts are short reviewed summaries with approximate request timestamps. Direct captures retain exact completion timestamps and content hashes. Publication dates were retained where available; an old founder article did not become current merely because it was fetched again. Undated primary team pages still require confirmation before human outreach.

The ignored coordinator `local/live-pilot/workspace.json` identifies the isolated checkout. Within that checkout:

- `local/acceptance/results.md`: private report, source inventory and research limitations.
- `local/acceptance/drafts.md`: reviewed wording for human consideration.
- `local/acceptance/checks.json`, `checks-initial.json`, `evidence-review.json`, `summary.json`, `doctor-final.json`: verification artifacts.
- `local/exports/pipeline.json`: complete CLI export.
- `data/hr-ops/prospects/` and `data/hr-ops/research-runs/live-20261010.json`: canonical records and persistent request ledger.

Next operational step: human review of the strongest prospect's incremental service fit and draft, followed by a separate focused agency discovery batch. Complete firm email configuration when available. Production operations still need outcome calibration, verified contact/supplier routes and established data-access, retention, refresh and backup procedures. This report grants no communication authorization.
