# HR-Ops audit repairs

This records the first repair pass. The subsequent Cursor audit's eleven findings and their fixes are tracked in [the newer repair record](code-review/hr-ops-mvp-review-fixes.md), including the current 70-test HR result.

The twelve findings in [the original audit](HR_OPS_AUDIT.md) have been addressed, along with both inherited web dependency advisories. Changes preserve the local shared-skill architecture, upstream baseline, draft-only boundary and the real pilot records. No outreach was sent and no CRM was connected.

| Finding | Repair |
|---|---|
| F01 — workflow conditions | Restored folded YAML expressions; CI runs pinned actionlint 1.7.12 in addition to YAML tests. |
| F02 — hidden opt-outs | Shared draft eligibility respects suppression, hold and closed status; interaction changes invalidate readiness; Markdown warns `DO NOT CONTACT`, shows controls/history, and distinguishes actionable drafts. CSV includes suppression and hold. |
| F03 — contact ranking | Bounded, normalized titles distinguish job function and recognize spelled-out engineering executives and agency recruiting leaders; assistants and unrelated directors do not become decision makers. |
| F04 — follow-up overrides | Explicit null cancels; omitted dates use automatic cadence only while awaiting a reply; genuinely user-requested dates create manual reminders after replies or commercial progression without resetting status. Suppression still wins. |
| F05 — top outreach | Initial selection, save and current-draft checks use the same purpose-specific lifecycle/contact eligibility. |
| F06 — historical reasoning | Atomic events preserve nonrecursive before/after snapshots, full decision scores/configuration and all decision evidence references. |
| F07 — scan overwrite | Collected observations are retained separately; rescans preserve reviewed rows and their verification dates. Research briefs expose the latest collection for reconciliation. |
| F08 — import options | Validate options and input before writes; honor ICP filters and unique-company limits. |
| F09 — dry-run differences | Initialization and provider dry runs execute the real validation path against prospective state, without creating data directories. Invalid collected data is rejected before discovery writes. |
| F10 — fact types | Descriptive facts require nonempty text; unknowns remain explicit and negative observed service fit uses blockers. |
| F11 — health validation | Shared validation runs on persisted reads and writes, including nested records/snapshots. Doctor checks parsed configuration, reports corrupt filenames/fields, and does not accept an `hr_ops` comment as initialization. |
| F12 — event retries | Canonical object serialization and normalized timestamps make retries independent of key order, including nested authorization and legacy event content. Changed payloads still fail. |

The retained web dependency overrides now exclude the vulnerable versions of `sharp` and `baseline-browser-mapping`; the lockfile resolves **sharp 0.35.5** and **baseline-browser-mapping 2.11.26**. Node 24 is also reflected in the root package engine declaration, and HR source modules have been formatted for readable review.

Regression coverage lives in `tests/hr-ops/audit-regressions.test.mjs`. All fourteen initial regression tests failed against the audited implementation before fixes. Three additional acceptance/lifecycle tests were added during repair; all seventeen now pass alongside the original 36 HR tests. They include isolated CLI acceptance across ready, contacted, replied, opted-out, held and unqualified prospects, manual reminders, initial draft selection, exports and persistence. Production records are never used as mutation fixtures.

A follow-on lifecycle test also preserves reopening semantics: a human reopening starts a research cycle, so the old disqualification does not immediately prevent new research or require a second authorization.

## Validation

| Check | Result |
|---|---|
| HR tests | 53 passed, zero failures |
| Retained quick regression suite | 9,248 passed, zero failures, same 10 existing warnings |
| Web tests | 584 passed, 8 skipped, zero failures |
| Web TypeScript check and production build | Passed |
| Root syntax check | 763 modules passed in the serial run |
| Actionlint 1.7.12 | Clean after workflow repair |
| Runtime dependency audits | Zero known vulnerabilities in root and web |
| Live-data smoke check | Doctor, pipeline and top-outreach briefs succeed; all ten prospect files byte-for-byte unchanged |

The first syntax run raced the retained suite's temporary fixtures and was stopped; it is excluded from passing results. Syntax checking was rerun separately after those fixtures were cleaned up. Local repair logs are in ignored `local/audit/repair-*.log` and `repair-npm-*.json`.

## Limits that remain deliberate

Old decisions recorded before snapshot support cannot be reconstructed retroactively; no missing history was invented. The user-owned firm identity and recipient emails remain unconfirmed where previously missing. Commercial demand, agency partnership willingness and score calibration still require real human-reviewed outcomes. A fresh autonomous AI-client research run is not implied by deterministic CLI acceptance tests. OpenClaw installation, message delivery, external CRM writes and the candidate matching system remain outside this MVP.
