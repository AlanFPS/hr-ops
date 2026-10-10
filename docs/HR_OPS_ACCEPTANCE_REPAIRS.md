# Operating acceptance repairs — October 9, 2026

These changes follow the completed Codex and Claude acceptance runs on revision `a69bb5beaf8e78ddeb2ac3a794965d0ee165be9c`. They are working-tree changes, not a new release or production certification. The original two workspaces and their reports remain historical evidence. Their 14 canonical prospect files retain their original SHA-256 hashes.

## Changes

- Contact ranking recognizes People/HR leadership, COOs and Managing Directors while retaining former-role, assistant and unrelated-owner exclusions. Secondary evidence without a publication date no longer establishes current employment; dated evidence must be recent as well as recently retrieved. Undated primary team pages remain usable, with uncertainty disclosed.
- Evidence can retain quote/summary type, exact/approximate retrieval precision and publication time. Historical records remain readable without invented metadata. Capture verifies quote occurrence in normalized fetched text, not semantic entailment.
- A persistent, locked research-run ledger enforces reservations for queries and page/API attempts. Capture and opted-in API discovery reserve their own attempts; native research tools require the agent to reserve before use. Failures/retries count, and the shared workflow stops at exhaustion. This cannot constrain an agent that bypasses the helper or controls the filesystem.
- A configurable six-company starter catalog distinguishes one supported API source from five agent-led sites. Catalog identity freshness and user domain overrides are enforced. Inclusion never means qualification. See [research controls](HR_OPS_RESEARCH.md).
- Discovery reports the effective requested limit and starter flag. Pipeline summaries omit the empty trailing field. Repeating standalone qualification preserves the revision when the decision/configuration is unchanged; new research, relevant aging and configuration changes remain auditable.
- Shared modes require explicit no-agency checks, caution against unsupported negative LATAM-specialist claims, and distinguish referral programs from delivery partnerships. Dossiers explain that weighted signal coverage includes hypotheses and does not establish buying intent.
- The shared skill passes the Skill Creator validator after removing the pre-existing client-specific `argument-hint` frontmatter key. Natural-language and optional client slash entrypoints remain available.

## Research reconciliation

The main pipeline changed only for PostHog and Recruiting from Scratch, using repository updates with expected revisions. No interaction or authorization event was added.

| Workspace/prospect | Reviewed result |
|---|---|
| Main / PostHog | `DISQUALIFIED`, 58 points, revision 13. Freshly captured [official hiring policy](https://posthog.com/handbook/people/hiring-process) explicitly rejects external recruiting agencies. Both old drafts are stale; outreach is blocked. The former positive service-fit/pain assumptions were revised. |
| Main / Recruiting from Scratch | Remains `RESEARCHING`, 38 points, revision 7. Its [official partnership page](https://www.recruitingfromscratch.com/partnership-program) establishes existing LATAM coverage. Specialization and recruiting pain remain unknown; incremental delivery value is a hypothesis. |
| Reviewed copy of Claude / Perry Street | 68 → 58; now `RESEARCHING` because the saved secondary contact evidence cannot establish a current decision maker. Refresh contact evidence before drafting. |
| Reviewed copy of Claude / Runpod | 48 → 38; remains `RESEARCHING`. Saved secondary contact evidence no longer establishes currency. U.S.-only role concerns remain. |
| Reviewed copy of Claude / River | Remains 68 and provisionally qualified; Director of People now ranks as relevant. Another relevant contact already supplied the access points, so ranking improvement does not add points. |
| Reviewed copy of Claude / RFS, Redfish, KORE1 | Unsupported observed `latam_specialist: false` changed to unknown. RFS's competition objection is labeled inferred. RFS remains provisionally qualified at 83 on that run's stronger role evidence; unknown specialization is not equivalent to observed specialization and does not trigger the configured exclusion. Delivery-partner demand remains unverified. |

The reviewed copy is separate from the original Claude run. It demonstrates the corrections without rewriting the experiment. Different research inventories explain the main RFS score of 38 versus the reviewed Claude score of 83; these are not scores for identical dossiers. Historical drafts require review/refresh under the new configuration and evidence rules; this work did not send or approve any draft.

## Focused live checks

- Fresh PostHog and RFS page captures succeeded with exact retrieval timestamps and short verified quotations; each consumed one reserved page attempt.
- River's public API returned eight jobs and one title-filter candidate. The candidate remained unreviewed and the prospect stayed in research. This checks collection, not role eligibility or qualification.
- Repeating starter discovery reused the same River prospect; the isolated workspace contained one record. Five manual source tasks remained separate from collected-prospect counts. Both API attempts were recorded within budget.
- Read-only rescoring of all 14 original records and contact ranking comparisons completed. Both original workspaces remained unchanged. Only the two intended main records changed; the other eight main records matched their prior snapshots.

## Verification and limits

- HR regression suite: **80 passed, zero failed**, including ten acceptance-repair tests covering contact age/roles, provenance persistence, no-op qualification, aging/configuration changes, budget concurrency/exhaustion/corruption, capture failures/quotes, stale source identities, deduplication and CLI summaries.
- Repository syntax: **767 modules passed**. Shared skill validation passed.
- Retained `test-all.mjs --quick`: **9,254 passed, zero failed, 10 known warnings** (including absent legacy candidate data and upstream-author heuristics). This run excludes dashboard build; unchanged dashboard/web/visual suites were not rerun here. The final ledger-corruption and LinkedIn trailing-dot guard edits were covered by the subsequent 80-test HR run and syntax rechecks; the broad retained run was not restarted after those small edits.
- The deterministic capture test retains a malicious instruction as inert source content and verifies no prospect mutation. **A live prompt-injection exercise through both operating clients remains NOT EXERCISED.** This test is not evidence of complete model/runtime resistance.

Artifacts are local, ignored user data under `local/acceptance/2026-10-09-repairs/`: captures, before snapshots, original hashes, live collection/repeat results, contact/decision comparisons, the separate `claude-reviewed/` and `starter-workspace/` roots, and test logs. The [original clean-checkout report](HR_OPS_ACCEPTANCE.md) and its test counts describe an earlier gate.

Before routine operating use, verify actual firm services and sender identity, refresh contacts, and review a small supervised batch for evidence quality and useful personalization. Before unattended operation, validate both client workflows with the new research procedure, exercise injected-page behavior and enforce independent permissions, backups and monitoring. OpenClaw and delivery integrations remain uninstalled and unimplemented.
