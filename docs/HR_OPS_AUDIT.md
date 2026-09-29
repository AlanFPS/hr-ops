# HR-Ops transformation audit — September 28, 2026

**Historical audit — findings subsequently repaired.** The original verdict was that the architecture was appropriate but the implementation should not be signed off. The audit confirmed 12 implementation findings: two high-priority fixes and ten medium-priority correctness/reliability fixes, plus two inherited web dependency advisories. See [the repair and validation record](HR_OPS_REPAIRS.md) for their resolution. The original evidence and line references below describe the pre-repair implementation.

This was an audit, not a repair pass. Implementation files, staged changes and real prospect records were preserved. Reproduction programs, temporary synthetic workspaces, dependency results and logs are under ignored `local/audit/`. This report is the only added project documentation from the audit. Nothing was sent, no external CRM was written, and no OpenClaw installation occurred.

## Scope and change accounting

Compared against the original `5c97c24e092871cd6374c2122ee7f021d69d3d6e` baseline on `hr-ops-mvp`: **65 files changed: 26 additions, 39 modifications, zero deleted files; 1,020 inserted and 40 removed lines.** This count excludes this audit report. The implementation remains staged and uncommitted.

Reviewed the entire transformation diff, all new HR source/modules/tests/modes, agent entrypoints, workflow changes, provenance, storage contracts, documentation and the ten-company local pilot. Examined the retained helpers/providers used by the HR implementation. This is not a claim to have exhaustively re-reviewed every unchanged Career-Ops source line.

The complete file/status inventory and staged-diff fingerprint are in `local/audit/manifest.json`. A basic high-confidence credential-pattern scan of added lines found no matches; profile, prospect, generated Markdown and audit scratch data are ignored. GitHub repository metadata was rechecked during this audit: `AlanFPS/hr-ops` remains a fork whose parent/source are `career-ops-hq/career-ops`; upstream is active with default branch `main`. No upstream changes were applied. Evidence: `local/audit/upstream-verification.json`.

| Area | Changes and assessment |
|---|---|
| Runtime | Added `hr-ops.mjs` and four `lib/hr-ops/` modules; local deterministic interface is a suitable MVP boundary. Findings below concern implementation details. |
| Agent interface | Added shared HR skill, client metadata, Claude/OpenCode wrappers and eight HR mode files. HR defaults precede retained candidate instructions. Natural language and `codex exec` do not depend on slash commands or MCP. |
| Candidate tools | Preserved; implicit candidate skill invocation disabled. No CV/application/dashboard functionality was deleted. HR uses its own lifecycle and score instead of candidate A–F scoring. |
| Persistence | Domain IDs, JSON records, shared locks, atomic writes and optimistic revisions are appropriate for one local workspace. Historical reconstruction and record validation need repair. |
| Configuration | Added `hr_ops` user-profile configuration, separate ICP weights/ranges, cadence and freshness settings. No new runtime dependency or CRM vendor coupling. |
| Fork preservation | Original tag, upstream remote, machine-readable fork record and provenance guide retained. CLI updater apply/rollback is disabled in this fork. |
| CI | Added HR tests; guarded upstream-only bots, publishing and upgrade application. Two rewritten folded expressions are invalid. |
| Documentation/identity | HR README introduction, architecture/data-contract additions, Codex guide, operating guide, validation and future OpenClaw contract added. Original attribution and legacy reference material retained. Package/plugin version remains the documented upstream baseline. |
| Tests | Added 36 HR tests and a synthetic fixture; adjusted one legacy pipeline assertion and Windows updater test path comparison. Existing test coverage is useful but insufficient for sign-off. |

## Confirmed findings

Severity here is repair priority: P1 should be fixed before normal operational use or merge; P2 should be fixed before treating this MVP as reliable. No automatic-send capability was found.

### F01 — P1: two workflow conditions are invalid GitHub Actions expressions

**Location:** `.github/workflows/ledger-bot.yml:178` and `:267`; missing regression coverage in `tests/hr-ops/integration.test.mjs:59`.

The guard rewrite changed YAML `if: >` into `if: github.repository == 'career-ops-hq/career-ops' && (>)`. The `>` is now part of the expression. YAML parsing succeeds, so the existing workflow test passes, but Actions expression parsing fails. Disabling the job through a repository guard cannot rescue an invalid expression.

**Verification:** actionlint 1.7.12 reports exactly these two expression errors across the current workflows. The original versions of every changed workflow pass the same checker. This is introduced by the transformation, not inherited.

**Repair:** retain folded YAML syntax and put the repository condition inside the folded expression; add expression-aware workflow linting to validation.

### F02 — P1: opt-outs are hidden in the human-facing draft handoff

**Locations:** `lib/hr-ops/operations.mjs:12`, `:65`, `:76`.

Create a ready draft, then record a human-reported opt-out. The prospect remains `OUTREACH_READY`, the existing draft is still considered current, and its Markdown dossier displays the message with `stale: false` and no suppression/opt-out warning. `status --markdown`, exports and generated reports use this renderer. The operator instructions explicitly use Markdown status, so this is a realistic handoff path.

New draft creation and the due queue correctly respect suppression; the defect is the existing draft/readiness presentation. A human could send an apparently usable draft without seeing the recorded opt-out.

**Repair:** distinguish retained historical drafts from currently actionable drafts; prominently show suppression, holds and closed states in every dossier/export, and make readiness/review reflect those controls. Preserve the actual draft/history for audit purposes.

### F03 — P2: contact ranking produces both false positives and false negatives

**Location:** `lib/hr-ops/model.mjs:85`.

The unanchored `/cto/` expression matches the letters inside **Director**. A startup's `Director of Marketing` receives priority 3 with the explanation “Owns engineering hiring needs.” Conversely, `Vice President of Engineering` is classified as `other`. In the real pilot, hatch I.T.'s `VP of Software Recruiting` is also ranked `other`.

This affects both outreach recipient selection and the access component of the score.

**Repair:** normalize titles, match bounded role names and appropriate functions, recognize spelled-out and abbreviated equivalents, and test unrelated directors, assistants, engineering leaders and agency recruiting leaders.

### F04 — P2: explicit follow-up overrides are not honored consistently

**Locations:** `lib/hr-ops/operations.mjs:60`, `:61`, `:73`.

Two reproduced cases:

- A sent event with `next_followup: null` schedules a default reminder because nullish coalescing treats null as omission.
- After a reply, a subsequent human-reported sent event with an explicit follow-up date stores that date but leaves status `REPLIED`; the due queue silently excludes it forever. A date supplied on a reply is discarded outright.

Stopping automatic reminders after replies is correct. Silently accepting an explicit schedule that can never surface is not. The operating guide currently promises date overrides through reported events.

**Repair:** distinguish an omitted override from explicit null; model explicitly requested follow-ups separately from automatic cold-outreach cadence, or reject unsupported schedules with a clear error. Keep reply/opt-out stop rules intact.

### F05 — P2: top outreach selection includes prospects whose drafts cannot be saved

**Locations:** `lib/hr-ops/operations.mjs:13`, `:39`; `hr-ops.mjs:58`.

`outreachBrief()` marks qualified `CONTACTED`, `REPLIED`, `MEETING` and `OPPORTUNITY` prospects unblocked. Consequently `outreach --top N` can select them ahead of eligible new prospects. Saving an initial draft for the selected company then fails with `Initial outreach requires an early prospect state`; follow-up drafts are also prohibited for several of those states.

**Repair:** make selection and saving share purpose-specific eligibility, including an available current contact; keep initial outreach and due follow-up selection consistent.

### F06 — P2: research history cannot reconstruct earlier qualification decisions

**Locations:** `lib/hr-ops/model.mjs:69`; `lib/hr-ops/store.mjs:25`; `lib/hr-ops/operations.mjs:3`.

Research overwrites facts and opening/contact rows. The history stores a status, generic score/coverage reason and references to qualifying openings, but no research patch, prior fact values, score dimensions or configuration snapshot. Replacing a service-fit hypothesis removes the original interpretation from the entire record even though its original qualification event remains. Immutable source snippets alone cannot recover that mapping or the old scoring configuration.

**Verification:** an isolated prospect qualified with `ORIGINAL-SERVICE-HYPOTHESIS`; replacing it left no occurrence of that rationale anywhere in canonical JSON. Both history entries only said `QUALIFIED: 90/100; evidence coverage 100%` and referenced the same jobs.

**Repair:** retain versioned research/score snapshots or append-only patches sufficient to reconstruct each material decision, including all decision evidence and configuration identity/content.

### F07 — P2: rescanning overwrites reviewed job classifications

**Locations:** `lib/hr-ops/discovery.mjs:25`, `:28`; `lib/hr-ops/model.mjs:73`.

A generic `Software Engineer` posting manually reviewed and classified as backend is replaced with `role_family: other` on the next provider scan. The scanner derives family from title alone and immediately persists/rescores the replacement. This can demote qualification and invalidate drafts even though the role did not change.

**Verification:** an isolated Greenhouse response with the same URL changed the persisted family from `backend` to `other`.

**Repair:** separate collected observations from reviewed classification, or preserve reviewed fields until a material content change is reconciled. A `requires_role_review` output flag should not silently destroy the prior review.

### F08 — P2: discovery import validates options after writing and ignores its limit

**Location:** `hr-ops.mjs:50`.

`discover --input - --icp typo` persists a valid prospect, then exits 1 with `Invalid ICP`. The `--icp` value is checked only when generating queries after the write loop. `discover --input - --limit 1` also imports/returns both entries in a two-prospect payload. Valid ICP filters are not applied to imported entries either.

This is distinct from the intentionally documented incremental batch behavior: command-level invalid input should be rejected before mutation, and accepted budget/filter options must have defined behavior.

**Repair:** validate command options before mutations; enforce import options or explicitly reject incompatible combinations. Add assertions about state after option-validation failures.

### F09 — P2: dry runs do not execute equivalent validation

**Locations:** `hr-ops.mjs:47`; `lib/hr-ops/discovery.mjs:28`.

`init --dry-run --input -` accepts `scoring.qualify: 999`; the real operation rejects it. Provider discovery dry runs skip the research validation path entirely: a posting with an HTTP URL is reported reachable in dry-run but rejected in the real scan. The guide says dry runs validate proposed mutations.

**Repair:** run the same configuration/research validation against an in-memory prospective record, changing only whether the final state is committed.

### F10 — P2: a non-text service-fit value can satisfy qualification

**Locations:** `lib/hr-ops/model.mjs:51`, `:108`, `:116`.

The fact validator allows `service_fit.value: false` with observed evidence. Scoring treats the field's presence as a supported explanation. With zero recruiting pain, the reproduced company still qualifies at 80/100. An empty string or arbitrary object is also not excluded by the text-field schema.

This is a structural input defect, separate from the documented limitation that a validator cannot prove natural-language claims.

**Repair:** validate descriptive fact fields as substantive strings or explicit unknowns, and represent negative service fit distinctly enough that it cannot satisfy the qualification prerequisite.

### F11 — P2: doctor can report healthy state that the next pipeline command cannot read

**Locations:** `lib/hr-ops/store.mjs:17`; `hr-ops.mjs:48`.

Repository loading checks schema version, ID and revision; doctor additionally checks only history/evidence arrays. An isolated record with its facts removed still returns `ok: true`, while `pipeline` immediately crashes reading `us_market`. Invalid states and malformed nested records are similarly outside the health check.

The corruption was injected only into a synthetic workspace through the repository API; no real prospect was altered.

**Repair:** share a complete persisted-record validator between repository reads/writes and doctor. Report the specific damaged record and field without pretending the workspace is healthy.

### F12 — P2: interaction idempotency depends on JSON property order

**Location:** `lib/hr-ops/operations.mjs:50`.

Interaction identity hashes raw `JSON.stringify(input)`. Replaying the same event ID and identical values with reordered JSON keys throws `Idempotency key reused with different content`. The equivalent draft issue was fixed, but event records still exhibit it. Agents and future adapters routinely serialize object keys differently.

**Repair:** canonicalize supported interaction fields, including nested authorization, before hashing. Preserve rejection of genuinely different content under an existing event ID.

## Inherited dependency findings

`npm audit --omit=dev --json` reports **zero root runtime advisories** and **two web runtime advisories**. The web manifest/lockfile are unchanged by this transformation, and HR-Ops does not start or depend on the web dashboard.

- `web/package-lock.json:3456` locks `sharp` 0.35.3. The high-severity [sharp advisory](https://github.com/advisories/GHSA-rgj7-g3m4-5g8c) affects versions below 0.35.4 processing untrusted images. It describes potential code execution under particular Linux/libheif conditions; this audit did not demonstrate exploitability in this Windows workspace.
- `web/package-lock.json:1640` locks `baseline-browser-mapping` 2.10.38. The moderate [process-termination advisory](https://github.com/advisories/GHSA-w5vr-8v7q-w6rv) is fixed from 2.11.0. Reachability from a deployed dashboard request was not established here.

Both have fixes available. Update and retest the retained web application before deploying it; do not describe these as newly introduced HR runtime vulnerabilities.

## Verification and pilot assessment

| Check | Audit result |
|---|---|
| HR suite | 36 passed, zero failures |
| Root syntax check | 761 modules passed |
| Retained quick regression suite | 9,245 passed, zero failures, same 10 baseline warnings |
| `git diff --check HEAD` | Clean |
| Current workflows, actionlint 1.7.12 | Two expression failures, F01 |
| Original changed workflows, same actionlint | No findings |
| Independent isolated behavior probes | 14 reproduced problem cases, grouped into F02–F12 |
| Runtime dependency audit | Root: 0; retained web: 1 high, 1 moderate |
| Live state reload, evidence references, domain uniqueness, rediscovery | Ten records intact; no missing references/duplicate domains; all ten rediscover as existing |
| Live contact/outreach history | Four drafts; zero interactions; no sending |

Reproduction: `node local/audit/probes.mjs`. This deliberately reports confirmed undesirable behavior rather than being a passing product regression suite. It uses fictional fixtures and separate temporary data roots. Results: `local/audit/results.json`. Logs: `local/audit/hr-tests.log`, `lint.log`, `core-tests.log`, `actionlint.log`, `actionlint-baseline.log`, `npm-root.json`, `npm-web.json`. Live inspection details are private in `local/audit/live-state.json`.

The existing baseline logs also document passing Go/dashboard tests, web tests/typecheck/build and CV visual tests before transformation. Those unchanged component suites were not repeated in this audit; the web dependency advisories above are independent of their functional test results.

The real pilot remains five agencies and five direct prospects: two qualified, seven researching, one disqualified. Four channel-specific draft records exist, although each company's email and LinkedIn bodies are identical. The messages contain concrete hiring signals and a modest question, not fabricated savings or inventory. They remain unready because firm/sender information is missing; email drafts also lack a verified recipient email. This is appropriate uncertainty handling, not a reason to invent details.

The audit re-opened the primary sources behind the two drafted prospects. Railway's [full-stack role](https://railway.com/careers/full-stack), [scalability role](https://railway.com/careers/scalability) and [team page](https://railway.com/about) support the draft's role, remote-location and recipient-title claims. PostHog's [product-engineer role](https://posthog.com/careers/product-engineer) and [about page](https://posthog.com/about) support its role/timezone and co-CEO claims. These checks establish source support, not buying intent or willingness to use an agency. All ten persisted dossiers were inspected structurally; this audit did not redo every company's research from scratch.

Agency discovery yielded no qualified agency clients, so delivery-partner acquisition is not commercially validated. Unknown sourcing geography, actual recruiter count, current client mandates and partnership willingness remain substantial research gaps. The contact-ranking failure already affects one agency in the pilot. Qualification weights remain provisional.

## Requirement coverage and remaining limits

| Requirement | Assessment |
|---|---|
| Preserve upstream and useful abstractions | Met; original baseline tag/remote/attribution and retained tools verified |
| Local Codex/Claude shared architecture; no MCP requirement | Met structurally; current workspace exposes the HR skill |
| Fresh-client natural-language / headless end-to-end experience | Not independently acceptance-tested in a new Codex or Claude process |
| Configurable ICPs and explainable scores | Implemented; F03/F10 and lack of outcome calibration prevent unconditional sign-off |
| Evidence-backed research and explicit unknowns | Implemented; current sources retained, historical reasoning gap F06 |
| Contact relevance and personalized drafts | Implemented with real pilot drafts; F02/F03/F05 need repair |
| Reliable lifecycle and follow-ups | Implemented for basic paths; F04/F12 and presentation issues need repair |
| Duplicate detection, revisions, local persistence | Basic behavior passes; F07/F08/F09/F11 expose reliability gaps |
| Human approval and no external messaging | No HR delivery implementation found; policies explicit; F02 undermines human handoff visibility |
| CRM-independent storage and future candidates | Appropriate IDs/repository/export seams; candidate matching intentionally absent |
| Future OpenClaw | Contract supplied, no installation; operational correctness and independent enforcement still required |
| Documentation | Broad coverage; “valid workflow guards,” dry-run validation, follow-up overrides and auditability need qualification until fixes land |

The CLI returns work briefs for open-ended research and drafting; it does not run a search engine or LLM internally. This is appropriate for the requested local agent workspace, but the definition of done still depends on a search-capable operating agent actually completing those briefs. Static entrypoint tests and the manually exercised pilot do not prove every fresh-client workflow.

Additional maintenance observations: the new domain code is unusually compressed into long single-line functions, which makes review and future changes harder; Node 24 is documented while package engines still advertise `>=18`; inherited plugin author/owner metadata and baseline version should receive an explicit release-identity decision before publication. These are not counted as the confirmed correctness findings above.

Recommended repair order: F01/F02; then contact selection, qualification and follow-up behavior; then historical persistence, scan/import/dry-run validation and idempotency. Convert each reproduction into a failing regression test before fixing it. After repairs, run an isolated mixed-state acceptance exercise with qualified, contacted, replied, opted-out and stale prospects, plus one fresh-client natural-language workflow. Keep the live pilot and upstream history intact.
