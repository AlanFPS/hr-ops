# HR-Ops local operating edition

This release retains the shared skill, mode router, public ATS readers, filesystem lock and atomic writes. It does not install MCP, OpenClaw, a CRM or a sending service. The optional [interactive Playwright adapter](HR_OPS_LINKEDIN.md) requires a human at the terminal for each LinkedIn direct message. Natural-language Codex/Claude prompts and `codex exec` use the same local research contracts; unattended sending is unsupported. Legacy candidate tools remain available only by explicit request; their company lists and candidate guardrails do not determine HR targeting.

## Admission and ranking

Schema 2 separates the current evaluation tier from commercial lifecycle. Scores rank prospects; they are not conversion probabilities. QUALIFIED retains configured thresholds (65 points, 60% coverage by default). PROVISIONAL ignores those thresholds and stays RESEARCHING until a genuine interaction advances the lifecycle.

| Tier | Required evidence |
|---|---|
| Qualified startup | Current attributable engineering demand, an eligible opening, U.S. market presence, supported service-fit hypothesis, threshold and coverage |
| Provisional startup | Current relevant demand, an opening with supported possible or eligible LATAM scope, U.S. market presence and supported service-fit hypothesis |
| Qualified agency | Technology recruiting/ICP fit, LATAM-serviceable client engineering demand or explicit current LATAM engineering delivery request, U.S. market presence, service hypothesis, threshold and coverage |
| Provisional agency | Verified technology recruiting, current client engineering demand, U.S. market presence and evidence-backed delivery-partner hypothesis |

All tiers respect suppression, holds, current blockers, targeting restrictions and confirmed wholly out-of-range size. Unknown size stays unknown. A sourced `[min,max]` range is supported; partial overlap earns partial fit, not invented exact headcount. Employee counts cannot substitute for recruiter counts. U.S. presence describes market fit, not necessarily headquarters.

Agency U.S.-only client jobs can support exploratory partner research but never count as LATAM-serviceable. Partner appetite may remain unknown; a published partner request is not required for provisional admission. Qualified agencies may use an evidenced `latam_delivery_request` without manufacturing vacancy counts. Startups cannot qualify from a company-wide remote policy while their actual relevant roles are restricted.

Every reviewed opening has `eligibility: {status,evidence,rationale,geography}`. Status is eligible, possible, restricted or unknown. Unknown has an empty evidence array; other values require supporting references and text. Eligibility describes observed hiring scope, not legal certification or universal candidate availability. Current relevant, confirmed eligible and potentially eligible counts remain separate. Possible eligibility earns partial LATAM credit; unknown/restricted earn none.

Explicit reviewed duplicate groups take precedence, then provider/board requisition identity, posting identity and normalized URL. Posting IDs remain separately stored. Matching titles with different identities are flagged for review, not automatically merged. Preserve URL aliases. A source's IDs are evidence of identity, not a promise that every posting is a separate hire.

Unresolved same-title postings alone cannot earn the multiple-vacancy scoring bonus. Different supported requisitions on the same board, reviewed distinct groups or distinct role titles support that bonus. Every alias across the compared groups must support distinction; adding a known duplicate cannot increase credit. Reported opening counts retain unresolved records and carry an identity-review gap until research resolves them.

Relevant contacts and supplier authority are separate. Secondary commercial contacts remain visible with partial access credit; a current observed supplier_authority fact can support confirmed authority. A strong functional title can earn full access credit as a role heuristic while supplier authority stays unverified. Reading an old announcement again does not renew authority. Verify title-based heuristics rather than assuming every senior person purchases services.

## Provider and research contracts

Greenhouse, Ashby and Lever retain their legacy array interfaces, with additive identity fields. HR collection validates raw expected payloads and pagination diagnostics. Failure, malformed payloads and partial pagination are not complete empty boards. Captures retain bounded descriptions (20,000 characters each), timestamps and hashes. The capture reader limits successful response text to 2 MB; it cannot render JavaScript.

Complete-board disappearance marks affected reviewed openings `reconciliation_needed` and removes them from current demand. It preserves original evidence and history, and does not close jobs automatically or suspend unrelated boards. Collected claims remain unreviewed until interpreted research is imported.

`templates/hr-ops-sources.json` separates acquisition seeds, directories/query recipes, services-only research references and controls. Seven acquisition seeds are currently included; twenty is an expansion target, not a gate. Existing LATAM specialist/overlap controls are outside default seeds. Do not copy the retained candidate-oriented portal list into acquisition targets. Configure `hr_ops.discovery.sources` and `queries.agency` / `queries.startup`; inspect `sources --catalog`.

Use one research ledger per batch. Queries are per run, pages per company per run, and max_candidates per discovery operation. Failed attempts consume reservations. Resume never resets budgets. Captures and imported prospect IDs link to the run; the summary counts unique prospects. Native agent-tool adherence remains procedural.

## Drafts and conversations

Use the complete draft payload in HR_OPS.md. PROVISIONAL requires exploratory intent and a current relevant contact. It cannot claim verified pain, eligibility or buying intent. Inspect existing current drafts before creating alternatives. Replacement chains retain old wording and make it non-actionable.

The claims checklist requires a sourced signal and supported service hypothesis, recipient rationale and useful next step. Short LinkedIn text may keep recipient rationale in review metadata. Structural completeness, recorded agent evidence review and recorded human review are distinct. Material edits require a new draft/review. These checks cannot prove semantic truth.

CUP Latam's editorial preference is one or two short LinkedIn sentences within a configurable 300-character ceiling. This is not a LinkedIn platform rule. New authored messages reject em dashes; original quotations and historical messages are preserved.

Conversations default to one per contact across channels. Follow-up drafts reference that contact's latest sent message; replies can reference any valid earlier sent message. Events preserve occurrence (`at`) and entry (`recorded_at`) time. Late replies pause their conversation without rewriting commercial history. Other contacts remain visible for operator engagement review. Ambiguous legacy attribution pauses automatic reminders.

Append `annotation` events referencing `corrects` for corrections. Use explicit `schedule` events for reminder changes, with a contacted recipient and date/null. Reminder overrides follow occurrence time, with entry order breaking ties, so a late-entered older message cannot replace a newer schedule. Holds, suppression and closed stages override all reminders; commercial meeting/opportunity stages stop automatic reminders. No event is permission to send. Genuine user authorization references remain required for consequential records.

## Commands

Prefix these with `node hr-ops.mjs`:

| Command | Purpose |
|---|---|
| `build` | HR release identity, schema, Git revision, dirty state, runtime |
| `config` | Effective HR values with profile/default origins |
| `pipeline --tier PROVISIONAL --icp agency` | Filter current evaluation tier separately from status |
| `pipeline --gaps` / `--stale` / `--current-drafts` | Work queues; current-drafts means complete current drafts |
| `run --run ID` | Inspect attempts and unique prospects |
| `run --run ID --action review` | Inspect per-candidate continuation allowance and gaps |
| `run --run ID --action complete --input stop.json` / `resume` | Finish/resume without resetting budgets; scoped completion requires the review in `docs/HR_OPS_RESEARCH_REVIEW.md` |
| `report` | Source yield, research gaps/effort, noncurrent openings, openings outside targeting, recorded outcomes |
| `retention` | Exposure inventory, including historical copies |
| `doctor` | Enumerate record failures; fail when unhealthy |
| `export --recovery` | Explicitly partial healthy-record JSON export |
| `backup` | Local manifest-based consistent snapshot |
| `restore BACKUP --destination NEW_DIR` | Verify and preview an isolated restore |
| `restore BACKUP --destination NEW_DIR --apply` | Restore into an absent directory and validate |
| `migrate` / `migrate --apply` | Preview/apply backed-up schema migration |

The report's `records_with_noncurrent_openings` counts records with closed, stale, unreviewed, unreconciled or insufficiently verified openings. It does not assert that every such role is closed. `records_with_openings_outside_target` separately counts reviewed role-family or known client/self mismatches. Unreviewed classifications and unknown hiring attribution do not establish a targeting mismatch. A current non-target role belongs only in the latter; a stale non-target role may appear in both. These are reporting counts, not changes to demand scoring.

File/stdin JSON strips one leading UTF-8 BOM; invalid JSON and unsupported encodings fail. HR configuration keys are validated recursively, including source variants. Legitimate non-HR profile keys remain untouched; disabled sources can be minimal website/enabled overrides. A typo is an error, not a silently ignored setting.

## Migration, backup and recovery

Version 1 records remain readable. Writes require version 2. Historical snapshots are validated with their own schema requirements. Migration upgrades current state, preserving IDs, sources, snapshots, draft chains and commercial status. Missing eligibility becomes unknown; affected drafts become stale. It does not invent historical reasoning or import pilot data.

1. Stop external writers, inspect `doctor`, `build` and `migrate`.
2. Test migration on an isolated copy first. `migrate --apply` creates a backup and validates all staged records before touching originals.
3. Migration uses a journal. Interrupted application blocks ordinary writes; rerun the same migration to finish pending records. Keep the original backup until verification.
4. Run doctor, inspect changed tiers and drafts, and perform a restore drill into a fresh absent directory.
5. Never replace the operating root automatically. Review restored data before an explicit root switch.

The allowlisted backup manifest covers config/profile.yml, modes/_custom.md, data/hr-ops (records, ledgers, captures and migration journal) and reports/hr-ops. Code, dependencies, credentials outside those files, arbitrary local exports and backup directories are excluded. Do not put credentials in the profile; the entire profile is backed up. Inventory any required extra artifacts separately. Snapshots hold the workspace writer lock and compare hashes before/after copying to detect configuration changes. Restore verifies checksums and containment before copying, then validates records, configuration, research ledgers and the migration journal. Invalid journals fail validation. Valid interrupted migrations or older schemas are restored with `writable: false` and migration details; inspect and complete recovery before switching the operating root.

Local backups under local/hr-ops-backups are a convenience, not disaster recovery. Configure a protected destination, access permissions and a backup routine separately. No encryption or automatic off-device backup is claimed.

If records are corrupt, doctor enumerates failures and recovery export clearly labels partial results. Ordinary writes remain fail-closed. Preserve the originals and backups while investigating; do not make a partial export the operating database without reconciliation.

## Retention and reviewed redaction procedure

Run retention and inventory copies in current records, before/after snapshots, captures, generated reports, local exports, acceptance workspaces and backups. Agree the purpose, retention period and deletion scope with the data owner. Preserve necessary suppression information under the agreed policy so deletion does not cause renewed contact. Stop writers, take a protected recovery copy when appropriate, perform the reviewed removal across selected copies, and verify both exposure and doctor afterward. Record what remains in protected/offline backups. Deleting a current record alone does not erase historical copies. No automatic historical rewriting or legal-retention policy is implemented.

## Enforcement and limits

Code enforces schemas, references, revisions, identity checks, suppression, coarse admission, message lengths and draft structures. Agents/operators must check source meaning, hiring scope, contact remit, hypotheses, commercial truth, native-tool budgets and genuine approval provenance. Local approval JSON is an audit record, not a security boundary against filesystem access. Future autonomous runtimes require independent permissions. The core CLI has no delivery or external CRM API; the optional LinkedIn adapter remains a separate human-operated workflow.

Firm email is still unconfigured. Protected disaster recovery and commercial calibration remain operating requirements, separate from software defects. No tests prove commercial success or universal prompt-injection resistance.

## Verification matrix

| Finding | Implemented check |
|---|---|
| H1 | Per-opening eligible/possible/restricted/unknown gates; company policy cannot qualify restricted roles |
| H2 | Requisition deduplication; same-title distinct roles retained |
| H3 | Late cross-channel replies, independent contacts, ambiguous legacy pause, annotations |
| M1 | Descriptions and provider identity retained in captures |
| M2 | Complete versus partial/malformed board reconciliation |
| M3 | Partial commercial access and supported supplier authority |
| M4 | Required quality metadata, intent, current drafts and style rules |
| M5 | Shared visible HTML extraction, numeric entities and literal type syntax |
| M6 | BOM stdin and malformed-input rejection |
| M7 | Recursive config validation and disabled-source compatibility |
| M8 | HR entrypoints, aliases, optional browser installation |
| M9 | Corruption enumeration, partial export, backup/restore, tamper rejection, migration |
| M10 | Dedicated Node 24 Windows/Linux HR workflow with push/PR/manual triggers |
| M11 | Acceptance and benchmark launcher manifest entries |

The local edition HR suite currently passes 127 tests. Retained Greenhouse/Ashby/Lever harnesses pass 41/32/27 assertions. Final broader and isolated client evidence will be recorded in the release validation report; these statements do not claim those runs are already complete.

Measured on this Windows workspace with Node 24.21.0: 100 generated prospects with 25 history entries each used 17 MB and loaded/validated in 441 ms; 1,000 with 50 history entries used 331 MB and took 7,078 ms. Scoring took 4/27 ms. Run scripts/hr-ops-benchmark.mjs to reproduce synthetic workloads. Full-record validation makes larger writes slower too. JSON remains appropriate for the current small workload; these measurements are a scaling limitation, not a throughput guarantee.

Supported eligible scope also satisfies the provisional eligibility gate when qualified score/coverage thresholds are not met. Stronger evidence cannot remove exploratory admission. Unknown and restricted scope remain ineligible for that path.

Explicit LATAM delivery requests use the configured opening freshness window, rather than the longer general company-fact window. They contribute no fictional vacancies.

Backups exclude temporary workspace.lock and workspace.lock.recover directories. Restore also skips those transient paths in older manifests. Manifests reject traversal, path aliases and files outside the declared data scope before copying. An interrupted migration can resume only with its verified original backup and all journaled records present. Doctor enumerates record, ledger and migration errors; recovery export excludes every participant in a conflicting domain identity rather than choosing a winner.
