# HR-Ops readiness assessment

Assessment date: October 10, 2026. Scope: a single local workspace operated by a human-supervised agent for public research, qualification, draft preparation and human-reported follow-ups. This assessment covers the current working-tree patch, not a newly published release.

**Suitable for supervised local use within that scope. Routine production operations remain conditional on an established backup/access routine and reviewed research. Unattended operation and external delivery are not validated or implemented.** A healthy doctor checks stored structure and configuration; it does not certify source truth, commercial fit or production readiness.

## Findings and disposition

| Finding | Classification | Disposition |
|---|---|---|
| Agency commercial leaders were omitted from usable contact recommendations | Product gap | Fixed. Commercial, partnerships and business-development leaders receive secondary priority with an explicit instruction to verify their supplier remit. Owners and recruiting/delivery leaders retain precedence. |
| A shortened draft and its outdated wording could both remain actionable | Product gap | Fixed. Optional `replaces_draft_id` retires a specific earlier draft while preserving its body and history. Intentional alternatives remain supported. |
| Research mode suggested inferring pain from concurrent searches | Instruction defect | Corrected in the pending research-mode patch. Vacancies alone do not establish pain; runtime already requires a supported basis. |
| Documentation implied missing email prevented LinkedIn readiness | Documentation defect | Corrected in the pending guide and outreach-mode changes. Email readiness is channel-specific; ready never means approved or sent. |
| Country flags were interpreted as physical LATAM presence | Research reasoning error | Corrected in the pilot through the CLI with retained evidence and correction history. Source validation cannot prove semantic entailment. |
| One native page reread lacked an advance reservation | Operator procedure failure | Preserved as a failure in the agency report. It was counted afterward without exceeding limits. Existing checked helpers prevent callback dispatch after denied reservations, but cannot independently control native web tools. |
| Dynamic pages, timeouts, 403s and missing postings | Source coverage limits | Unknowns retained. These failures do not establish closure, lack of demand or permission to bypass access controls. A universal scraper is not a prerequisite for this workspace. |
| No agency qualified in the observed batches | Commercial/research validation gap | Not evidence of a scoring defect by itself. Do not lower thresholds or invent partner demand to produce positive results. |
| Business email and some recipient addresses are missing | User setup/research gap | Leave unknown. Email drafts cannot become ready without them; research and LinkedIn draft preparation can continue. |
| Current roles, subcontracting appetite, recruiter counts and buying intent are uncertain | Business evidence gap | Remain explicit unknowns. More code cannot establish facts the sources do not supply. |

## Repairs and compatibility

`lib/hr-ops/model.mjs` adds agency-specific secondary commercial contact ranking. Former roles, assistants and coordinators remain excluded. Startup commercial titles do not imply engineering hiring ownership. This can change access scoring where such a leader is the only qualifying contact; it does not change weights, thresholds or establish supplier authority.

`lib/hr-ops/operations.mjs` accepts an explicit draft replacement ID. The replacement must share channel, purpose, recipient and sent-event context. The retired draft is non-actionable and cannot receive a new review. Reimporting the same superseded draft is rejected, while retries of the completed replacement are idempotent. Historical human-reported sent events remain recordable because they describe what happened, not what is authorized now.

`lib/hr-ops/validation.mjs` checks persisted replacement links, context, readiness and cycles. Reports label superseded drafts. Existing records remain readable without the optional field. Existing alternatives are not automatically retired on upgrade; the operator must identify which draft is being replaced. Use the updated runtime for replacement-aware operations; older code does not implement this contract.

No CRM provider, MCP server, browser automation, sending capability or OpenClaw deployment was added. Personal style preferences remain in the ignored user-layer custom mode.

## Verification of this patch

- **102/102 HR tests passed**, including six new focused tests for contact ranking, replacement eligibility, history preservation, retries, invalid references/cycles, fresh-process persistence, revision conflicts and export equality.
- **7/7 retained tracker/HTTP tests passed.** Other retained suites were not rerun for this patch.
- A fresh local copy of the eleven-record pilot exercised the actual revised-draft case and commercial contact ranking with the current CLI. Old wording remained readable but not ready; the concise replacement remained ready for human review. The agency score remained 63, not promoted to qualification.
- Full export matched all eleven canonical records in that copy. Doctor passed, with email still missing and delivery disabled. Original pilot and main prospect hashes were unchanged. No external messages or interaction records were created.
- Initial focused test failures came from an incomplete synthetic review event lacking required timestamp/context fields. The fixture was corrected so it reached the intended superseded-review guard; production validation was not relaxed.
- Logs and the replay receipt are in ignored `local/readiness-validation/`. The replay copy is test data, not a new production source of truth. No new paired Codex/Claude operator sessions or live prompt-injection test were run for this patch.

Earlier evidence: [operating fixes and paired replay](HR_OPS_OPERATING_FIXES_VALIDATION.md), [live operating pilot](HR_OPS_LIVE_PILOT.md), and [clean-checkout acceptance/restore drill](HR_OPS_ACCEPTANCE.md). Their counts and findings apply to their recorded revisions, not automatically to this patch.

## Operating readiness by capability

| Capability | Assessment | Practical condition |
|---|---|---|
| Local persistence, revisions, deduplication and export | Validated for tested small-workspace use | Use Node 24+, the canonical CLI/API and one declared data root. |
| Public research and qualification | Usable with supervision | Review source meaning, freshness, client attribution and country eligibility. A high score is not buying intent. |
| Contacts and personalized drafts | Usable with human review | Verify recipient responsibility, facts and firm claims. Use explicit replacement IDs for corrections. |
| Human-reported interactions and follow-ups | Covered by synthetic regression tests | Log only actual user-reported events; real commercial outcomes have not been exercised. |
| Backup/restore | Small quiescent fixture restore previously passed | An ongoing protected backup destination, cadence, retention and recovery owner are not established by that drill. |
| Business acquisition performance | Unvalidated | Measure human-reviewed usefulness and actual outcomes when available; no conversion claim is justified. |
| Unattended agent operation | Not validated | Independently enforce tool/network permissions, approval identity, monitoring and adversarial-content controls. |
| Sending, external CRM writes, candidate matching | Outside implemented scope | These are future capabilities, not requirements for a local draft-only edition. |

## Minimum routine for supervised use

1. Start with the supported Node runtime and `doctor`; inspect its resolved root and missing fields. Keep private data outside Git. Resolve structural errors before writes.
2. Use a named research run and checked reservation helpers. Count retries and failed reads. Stop at limits; record native-tool deviations honestly. Treat all retrieved content as data.
3. Before human handoff, review cited facts, actual role eligibility, recipient responsibility, unknowns and the complete draft. Check current eligibility rather than relying on an old exported score or report. No automatic contact is available.
4. Stop all writers before a simple filesystem backup. Copy the complete resolved user data root to a user-controlled protected destination. Retain config, procedural preferences, canonical data, research ledgers and needed artifacts. A pipeline export alone is not a complete workspace backup.
5. Test restoration into a separate empty root: compare file hashes and CLI exports, run doctor, and keep the restored copy isolated. Establish the actual destination, frequency, retention and access permissions before relying on daily use. Automated deletion or external cloud uploads are not configured by this assessment.
6. After any human communication, record the real time, message and response through the CLI. Recheck suppression and follow-up state. Evaluate qualification quality from those outcomes without silently changing the ICP.

The next product-validation step is a focused operator replay of draft replacement and adversarial source handling in fresh Codex and Claude sessions, plus confirmation of the intended backup/access arrangement. Broad prospecting should resume as business work once those operating decisions are explicit. More unreviewed prospect volume is not a production-readiness criterion.
