# Code Review: whole-product HR-Ops audit

**Review Date:** 2026-10-10

**Reviewed Files:** `hr-ops.mjs`; all ten `lib/hr-ops/*.mjs` modules; shared HR skill and HR mode files; Codex/Claude/OpenCode entrypoints; package scripts; starter catalog; data contract and provenance; test/PR privacy workflows; current HR tests and validation reports. Inspected relevant retained provider, HTML extraction, scanner, portal configuration, seed, deduplication, locking and atomic-write components. Reviewed the baseline-to-working-tree change inventory. This is not a line-by-line security audit of every retained Career-Ops application or dependency.

**Revision:** committed base `452567a88050fbe2c7e82e9d826ed64f8fb5d1c9`, plus the pre-existing uncommitted readiness changes. No application fixes were made in this audit.

**Severity Summary:** 0 Critical, 3 High, 11 Minor, 0 Nit. Discovery breadth is a separate high-priority product improvement, not a runtime defect. Product and operating improvements are distinguished from runtime defects below.

## Evidence and scope

- Doctor passed on the main workspace: ten prospects, missing business email, sending disabled.
- Read-only main-state inspection found one currently qualifying recommendation, four stored drafts with zero current drafts under today's runtime/configuration, and zero interactions. This main root is separate from the isolated pilot roots; pilot drafts are not automatically promoted to operating data. No reconciliation or live prospect edits were performed by this audit.
- 109/109 tests passed: 102 HR tests and seven retained tracker/HTTP tests. These passing tests do not cover all findings below. Log: ignored `local/full-audit-tests.log`.
- Additional retained provider/transport checks: 19/19 Node test entries passed, including HTTP bounds/timeouts and Greenhouse/Ashby/Lever suites. Log: ignored `local/full-audit-providers.log`.
- Broader retained `test-all.mjs --quick` completed: **9,264 passed, 1 failed, 12 warnings**. The sole failure is M11, independently reproduced with exit code one from `validate-system-paths-coverage.mjs`. Log: ignored `local/full-audit-quick.log`. This is not an all-green repository baseline.
- The twelve suite warnings comprise missing candidate data, two passing tests close to their time limits, six upstream-maintainer-name matches, one unavailable locale test variant, and two opt-in live API/mint tests skipped. The name matches are retained upstream code/comments, not evidence that this audit exposed firm credentials. Quick mode and these skips do not establish complete live-integration, dashboard, visual or cross-client acceptance coverage.
- Final doctor remained healthy and `git diff --check` passed. Existing working-tree edits were preserved; the only new tracked-scope artifact from this audit is this report. Nothing was committed or pushed.
- Additional deterministic probes ran against fictional objects and an isolated root, never live prospect records. Source and results: ignored `local/full-audit/probes.mjs` and `results.json`.
- The retained portal template contains **138 companies and 39 search queries**, as parsed from YAML. Its first entries include Anthropic, OpenAI, ByteDance and DeepSeek. Much of its targeting concerns AI, visa sponsorship and European job searches.
- HR-Ops' catalog contains **six companies: three startups and three agencies**. One is an Ashby source; five are manual research tasks. It does not consume `portals.yml`. `starter_sources` defaults to false in the CLI configuration; the HR discovery mode explicitly requests `--starter`.
- Existing dated pilot reports support observations about research yield and operator behavior. This audit did not freshly verify companies or run new live Codex/Claude prospecting sessions.
- The tracked baseline comparison showed 100 changed files and no deleted tracked files. Untracked readiness documents/tests are additional changes. Useful Career-Ops capabilities were largely retained, not removed.

## Critical Issues

None confirmed within the reviewed scope. Approval records remain agent-writable audit records, not an independent permission system. That limitation is documented and does not become a security barrier merely because tests pass.

## High Priority Issues

### H1. LATAM qualification is company-wide rather than opening-specific

- **Location:** `lib/hr-ops/model.mjs:654`, `:684`; opening schema around `:438`.
- **Type:** qualification model gap.
- **Problem:** the score counts relevant openings and independently reads company-level `latam_compatibility`. Openings have location text but no structured eligibility decision. A company can hire internationally for some roles while every backend vacancy is U.S.-only.
- **Example:** the isolated probe set both opening locations to `United States only; US employment authorization required`, retained positive company compatibility, and received `QUALIFIED`, 80/100. The scorer does not inspect those restrictions. A conscientious operator can avoid this through manual assessment/blockers, but the schema does not express the distinction reliably.
- **Fix:** add sourced per-opening eligibility (`eligible`, `possible`, `restricted`, `unknown`) and restriction rationale. Separate total relevant demand from demand plausibly serviceable from LATAM. Require at least one usable opening or an explicitly supported alternative partnership case. Keep company policy as context.
- **Verification:** mixed-country companies, U.S.-only engineering with international non-engineering roles, contractors, citizenship restrictions and unknown eligibility.
- **Prevention:** make role eligibility a required research field and show its contribution in the score explanation; never infer eligibility from the word remote.

### H2. Multiple posting URLs can inflate vacancy demand

- **Location:** `lib/hr-ops/model.mjs:480`, `:654`, `:698`.
- **Type:** qualification correctness.
- **Problem:** opening identity is normalized URL. Demand receives full credit for two URLs, even when they advertise one requisition in two locations or mirror the same role. Company deduplication works, but vacancy deduplication is weaker.
- **Example:** one backend role scored 65; adding a second URL with the same title and another location raised the score to 80 and counted two vacancies. This probe demonstrates the absence of requisition identity, not that all similarly titled openings are duplicates.
- **Fix:** retain provider/requisition identifiers and explicit duplicate groups. Use distinct verified requisitions for demand. Suggest uncertain duplicate clusters for review rather than collapsing genuinely separate jobs solely by title.
- **Verification:** one requisition across cities/providers, reposted URLs, tracking parameters and two genuinely separate identical-title requisitions.
- **Prevention:** reuse Career-Ops' job identity and repost analysis concepts at the adapter boundary, with HR-specific tests.

### H3. Normal replies to earlier messages or other contacts cannot be logged

- **Location:** `lib/hr-ops/operations.mjs:24`, `:562`; `modes/hr-ops/followups.md`.
- **Type:** operating model limitation with no supported correction path.
- **Problem:** all conversations share the prospect's latest sent event and one follow-up date. A reply must reference that latest event. The program can log multiple contacts but cannot represent their normal overlapping conversations. Even one person can reply to an earlier message after a follow-up.
- **Example:** record a message to the CTO, then one to the founder; a real CTO reply referencing the CTO's message is rejected with `Reply must reference the latest sent interaction; older history needs explicit correction`. The independent reviewer also reproduced rejection with just one contact replying to the initial message after a follow-up. No correction command implements that advice.
- **Fix:** introduce conversation identity, validate replies against any applicable prior event, and derive cadence per conversation. Preserve a prospect-wide hold/opt-out policy and aggregate commercial status conservatively. Alternatively explicitly enforce a single conversation until this is supported, while still allowing truthful late replies.
- **Verification:** two contacts, two channels, late replies, replies to earlier messages and idempotent replays. Verify that one reply does not corrupt another contact's reminder.
- **Prevention:** realistic chronological interaction fixtures instead of only linear single-contact sequences.

## Minor Issues

### M1. Collection discards useful descriptions already returned by providers

- **Location:** `lib/hr-ops/discovery.mjs:113`; retained `providers/greenhouse.mjs`, `ashby.mjs`, `lever.mjs`.
- **Problem/example:** providers return job descriptions, but HR stores only title/location excerpts and URL metadata. The agent must refetch descriptions to determine stack, contracting terms and geography, consuming a tight six-page budget and sometimes hitting blocked pages.
- **Fix:** retain bounded source excerpts or a separate capture linked to provider endpoint, retrieval time and hash. Preserve unreviewed status until semantic review. Do not store unbounded scraped documents in every history snapshot.
- **Verification:** an inline ATS description reaches the research brief without a second request; missing descriptions remain explicit unknowns.
- **Prevention:** test provider-to-HR information preservation, not just collection counts.

### M2. New collection contradictions do not suspend earlier reviewed demand

- **Location:** `lib/hr-ops/model.mjs:489`; `lib/hr-ops/discovery.mjs:142`.
- **Problem/example:** a later successful empty board collection retained two prior reviewed openings and continued counting both. Keeping historical evidence is correct, and absence alone must not prove closure, but the contradiction is not promoted to an eligibility gap. Earlier demand can continue qualifying until its freshness window expires.
- **Fix:** add a reconciliation task and verification-needed marker when a complete attributable collection contradicts reviewed openings. Distinguish failed, partial and complete fetches. Preserve old observations; do not automatically close jobs on transient errors.
- **Verification:** disappeared job, empty board, incomplete pagination, failed fetch and reappearing job; outreach must expose unresolved contradictions.
- **Prevention:** explicit collection-completeness and reconciliation contracts.

### M3. New commercial-title fallback still earns full access credit

- **Location:** `lib/hr-ops/model.mjs:604`, `:694`.
- **Problem/example:** a Commercial Director described as needing supplier-remit verification receives priority one but still `decision-maker`, full 10 access points and full access coverage, just like a confirmed owner. The recent ranking fix improves visibility but overstates confidence in that contact.
- **Fix:** separate relevance, verified remit and accessibility. Keep the person visible as a secondary contact; reserve full credit for verified ownership and use partial/unknown scoring otherwise.
- **Verification:** confirmed agency founder, supplier-facing partnerships head, sales-only commercial director and former/assistant titles.
- **Prevention:** do not turn a ranking fallback into proof of buying authority.

### M4. Draft readiness does not enforce the promised personalization structure

- **Location:** `lib/hr-ops/operations.mjs:301`, `:411`.
- **Problem/example:** `Hello, we are Test Firm. Would you like to chat?` with only a firm-name claim saves as ready on a qualified prospect. Citation presence and numeric checks do not ensure a hiring signal, recipient relevance or a useful service hypothesis. Existing docs correctly require human semantic review, so this is not a claim that the validator guarantees truth.
- **Fix:** distinguish structurally complete, evidence-reviewed and human-approved states. Require an observed prospect signal and explicit hypothesis/recipient rationale, with a quality review checklist. Keep language natural; avoid brittle keyword-only gates. Apply the user's concise LinkedIn preference through configuration and mode instructions.
- **Verification:** generic drafts, unsupported paraphrases, misattributed numbers and genuinely concise personalized drafts.
- **Prevention:** reviewed positive/negative outreach examples and operator acceptance rubrics, not only schema tests.

### M5. Capture uses a weaker HTML decoder than the retained implementation

- **Location:** `lib/hr-ops/research-run.mjs:70`; `providers/_html-to-text.mjs`.
- **Problem/example:** `We&#8217;re hiring` stays encoded in capture; the retained helper decodes it. Exact quote matching can reject visible text. Capture's tag regex also has weaker handling of quoted attributes.
- **Fix:** reuse the tested entity/tag primitives with a capture-specific size limit; do not blindly inherit the provider helper's 4,000-character cap.
- **Verification:** numeric/named entities, quoted angle brackets, double encoding, scripts/styles and long documents with a valid quote near the end.
- **Prevention:** one shared extraction foundation with explicit consumer limits.

### M6. Windows UTF-8 BOM input fails JSON ingestion

- **Location:** `hr-ops.mjs:94`.
- **Problem/example:** `JSON.parse(readFileSync(..., 'utf8'))` rejects a leading BOM. This is produced by common Windows PowerShell 5 UTF-8 file-writing commands. The isolated `discover --input ... --dry-run` probe exited one for otherwise valid JSON.
- **Fix:** strip exactly one leading UTF-8 BOM before parsing file/stdin JSON; document UTF-8 encoding. Do not silently reinterpret arbitrary encodings.
- **Verification:** identical UTF-8 payloads with/without BOM and malformed JSON through file and stdin.
- **Prevention:** test the actual PowerShell versions used in onboarding.

### M7. Configuration typos silently preserve the wrong behavior

- **Location:** `lib/hr-ops/model.mjs:177`, `:193`.
- **Problem/example:** `outreach.linkedin_max_characters: 120` is accepted as an extra positive number while effective `linkedin_max_chars` remains 700. Unknown keys are merged rather than rejected.
- **Fix:** validate known configuration keys recursively, with an explicit extension namespace if needed; reject unknown keys with a useful suggestion. Add an effective-config inspection command.
- **Verification:** typo cases for outreach, cadence, ICP and freshness; legitimate existing configs still load.
- **Prevention:** schema-driven configuration examples and validation.

### M8. Retained candidate surfaces still dominate installation and navigation

- **Location:** `package.json` scripts/postinstall; root legacy documentation; `.github/copilot-instructions.md:3`; `OPENCODE.md:5`; retained dashboards and translations.
- **Problem/example:** `npm run scan`, `find`, `tracker`, `verify` and dashboard commands remain candidate tools. Plain `npm install` attempts Chromium setup although HR does not need it. Copilot's task taxonomy still describes job search and repository development, without HR operations. OpenCode's compatibility file still points at the legacy `doctor.mjs`. Main HR docs do give the correct `--ignore-scripts` instructions and Codex/Claude routing is present. The legacy skill explicitly disables automatic invocation where supported; this finding does not claim that candidate onboarding currently runs during normal HR use.
- **Fix:** add unmistakable HR script names and a short legacy index; mark unsupported legacy UI/translations clearly, update client-specific guidance, and make optional browser installation explicit. Preserve the baseline and legacy code until selective extraction is justified.
- **Verification:** clean install, natural-language HR routing in supported clients, npm help and documentation link checks. No CV request or candidate tracker write should occur in an HR workflow.
- **Prevention:** a small cross-client entrypoint contract test and HR-first documentation navigation.

### M9. One damaged prospect blocks access to healthy records

- **Location:** `lib/hr-ops/store.mjs:185`, `:203`.
- **Problem/example:** `get()` calls `list()`, which validates every record and throws on the first corrupt JSON. A single damaged prospect therefore prevents even read-only status/export of unrelated healthy prospects. Fail-closed writes are prudent; recovery diagnostics and safe partial reads are missing.
- **Fix:** retain strict mutation checks, but add read-only diagnostics listing all failures, a clearly labelled healthy-record export and an explicit reviewed repair/restore procedure. Never silently skip corruption in ordinary pipeline output.
- **Verification:** corrupt one file in an isolated copy, inspect/export a healthy record through recovery mode, and restore the damaged file from backup without losing history.
- **Prevention:** routine protected backups and tested recovery drills. Do not treat Git ignore rules as backups.

### M10. Direct pushes without a matching open PR do not trigger HR tests

- **Location:** `.github/workflows/test.yml:3`.
- **Type:** verification coverage gap.
- **Problem:** the workflow runs for PRs targeting `main` and merge groups, not standalone pushes or manual dispatch. Direct pushes to `hr-ops-mvp` without a matching open PR do not invoke its HR test job. With such a PR open, a push can trigger the PR synchronize event. A locally passing test run is not evidence that the pushed revision received this CI check. PR-only CI can be a valid policy; the gap is relying on direct-push operation without an equivalent gate.
- **Example:** there is a `npm run test:hr` step, but no push trigger for the actual development branch.
- **Fix:** provide a dedicated HR workflow for intended push/PR branches and manual dispatch, using Node 24 and deterministic installation. Keep appropriate retained tests separate from expensive candidate dashboard/CV jobs.
- **Verification:** inspect a successful run attached to the exact pushed commit, including an intentionally failing branch test during workflow validation.
- **Prevention:** define required checks and the branch/release workflow explicitly. Do not infer remote branch protection settings from local YAML.

### M11. The retained system-file coverage gate currently fails

- **Location:** `update-system.mjs:252`; `scripts/hr-ops-acceptance.ps1`; `test-all.mjs:1865`.
- **Problem/example:** the broader quick suite reports `SYSTEM_PATHS coverage gap` for the tracked acceptance launcher. The system manifest names three other scripts but does not classify this one. This is a real failing repository check, even though the focused HR suites pass. The disabled upstream updater means this is not evidence that an active HR update lost the file.
- **Fix:** classify the launcher in the system-file manifest, or deliberately replace the inherited manifest contract with an HR-specific equivalent that still covers every tracked system/user file. Do not disable the gate to conceal the mismatch.
- **Verification:** run `node validate-system-paths-coverage.mjs` and the retained quick suite on the exact resulting revision.
- **Prevention:** require manifest coverage when adding a tracked launcher or tool, and run it in the HR CI job.

## Nits

None tracked. Formatting issues do not take priority over qualification and operating behavior.

## Acquisition product priority

### P1. Default discovery is too narrow for repeatable acquisition

- **Location:** `templates/hr-ops-sources.json`; `lib/hr-ops/discovery.mjs:11`; `modes/hr-ops/discover.md:3`.
- **Type:** product coverage gap, not a false claim that the CLI implements web search.
- **Problem:** six repeatedly reused research targets, five manual readers, and four fixed query suggestions leave broad discovery mostly to each agent's improvisation. Current source entries mix useful examples with overlap/restriction cases. They are valid research targets, but not a representative acquisition source strategy. Prior live batches did not validate agency commercial demand.
- **Example:** the shipped catalog cannot itself supply ten distinct companies. A bare fresh-config CLI discovery returns tasks without scanning any configured boards. The shared skill correctly continues with native search; the CLI alone is not the complete workflow.
- **Fix:** separate source directories/search recipes from company seeds and acceptance controls. Add configurable queries, source categories, ownership verification, last-check dates, source health, unique yield and reasons for rejection. Expand verified HR-appropriate sources, particularly agencies without established LATAM specialization. Reuse vetted VC portfolio/ATS discovery primitives through an HR adapter that outputs identities for research, never auto-qualified leads.
- **Verification:** fresh batches excluding previous companies, balanced by requested ICP, with unique researched count, evidence coverage, usable signal yield, failures and cost recorded. Do not require arbitrary positive qualification rates.
- **Prevention:** maintain source provenance and measure acquisition usefulness; do not transplant Career-Ops' 138-company list or candidate filters wholesale.

## What should be retained or adapted from Career-Ops

| Component | Assessment |
|---|---|
| Shared skill, small mode files, natural-language CLI use | Keep. Appropriate for Codex, Claude and a future operator. No MCP or native Codex slash commands are needed. |
| Public ATS readers, URL normalization, atomic writes and locks | Keep. Add HR adapters and contract tests where their data crosses into prospect scoring. |
| Provenance marker, upstream remote/history, disabled automatic updater | Keep. Selectively port useful changes after review. No whole-project rewrite is warranted. |
| VC/ATS discovery, company identity checks, vacancy dedup and liveness | Adapt. Good acquisition inputs, but their candidate filters and writes must not leak into HR state. |
| `scan.mjs` geography helpers | Adapt the restriction-detection ideas in `buildCountryEligibilityFilter` and `buildLocationFilter`. Replace the single candidate-country assumption with sourced eligibility for the firm's target talent locations. Do not equate a passed text filter with confirmed cross-border employment capability. |
| Funding/repost/company-history analytics | Adapt cautiously as dated evidence and prioritization context. Funding or reposting alone does not establish pain or willingness to buy. |
| Existing portal company list | Reference material only. Its 138 companies and 39 queries are not a ready HR ICP list. Reverify identities and selectively curate suitable entries. |
| Candidate scoring, CV tailoring, salary negotiation, application lifecycle | Keep isolated as legacy. They are not the buyer evaluation or recruiting-firm operating model. |
| Candidate dashboards, candidate analytics and translations | Do not present as HR features. An HR read-only dashboard is a separate optional task. |

## Product and operational work beyond the defects

1. **Commercial validation:** qualification currently means a plausible exploration target, not buying intent. Separate ICP fit, usable demand, evidence coverage and partner/buyer intent in presentation. Calibrate only after reviewed outcomes; do not lower thresholds to manufacture qualified agencies.
2. **Approximate size and ICP meaning:** keep recruiter count distinct from employee count. Add sourced ranges and overlap reasoning so directory estimates do not become invented exact integers. Unknown size is not automatically disqualifying in today's scorer. Clarify U.S. headquarters versus U.S. market presence: the current `us_market` boolean does not encode incorporation or headquarters. Several dossier fields, including `tech_focus`, partners, remote policy and growth, are descriptive context rather than separate numerical scoring dimensions.
3. **Workflow usability:** add filters for research gaps, active current drafts, source freshness and ICP; make `outreach --top` aware of existing drafts and replacements. Saved reports/exports are snapshots, not live eligibility views. Root preferences still need consistent application to generated dossier punctuation.
4. **Source operations:** add run completion/resume summaries and stable associations between runs, discovered companies and captures. Current candidate limit is per operation, while query/page budgets are per named run. Make that distinction explicit before claiming a globally enforced candidate cap.
5. **Recovery and privacy:** a small quiescent restore drill exists, but an operating backup destination, cadence, retention/access owner and deletion policy are not established. Historical snapshots retain contact data. Add reviewed retention/redaction that preserves necessary audit/suppression records; no automatic destructive purge.
6. **Scale:** every read validates all records and their full before/after histories; every mutation copies growing snapshots and configuration. Benchmark 100/1,000 prospects with realistic history before choosing an index or append-only history design. No measured performance failure is asserted here.
7. **Analytics:** add source-to-qualified yield, research cost, reasons for rejection, stale-data rates and later genuine reply/meeting/client outcomes. Career-Ops' candidate conversion analytics cannot be reused unchanged.
8. **Business setup:** firm name and sender are known; business email is still missing. That limits email readiness, not LinkedIn draft creation. Confirm actual commercial terms and delivery capabilities when needed; never invent inventory, guarantees or track record. No automatic sending is needed to make the local edition useful.
9. **Future integrations and releases:** local repository methods and stable IDs are a useful seam, not completed CRM adapters. Candidate screening/matching, placements, external CRM sync and OpenClaw installation remain intentionally unbuilt. Future autonomous execution requires independently enforced permissions and adversarial-source testing. Add an HR build/release identifier or capability manifest; the inherited package version describes the baseline and cannot distinguish newer draft-replacement behavior by itself. The root lockfile is ignored under inherited policy: establish a reproducible dependency manifest for HR releases rather than assuming later installs match tested versions.

## Overall assessment and sequence

HR-Ops is a functioning supervised research and drafting workspace, but it is not simply the mature Career-Ops product with labels changed. Buyer discovery, role eligibility and multi-contact sales history are different domain problems. Retained infrastructure is useful; inherited candidate features do not validate those new problems.

Recommended order: fix H1/H2/H3 and their negative fixtures; enable exact-commit CI; improve source breadth and preserve provider information; address configuration/Windows input and review-quality gaps; then run a fresh bounded cross-client acceptance batch that excludes familiar seeds and exercises late replies, conflicting evidence and adversarial content. Establish backups before routine reliance. Do not replace this with repeated research of the same six companies or premature sending automation.

## Independent second review

The `code_audit_second` reviewer independently reproduced H1, H2, H3 and M3, inspected draft replacement/persistence, and passed all six readiness-fix tests. Its fictional probes are in ignored `local/full-audit-second/`. No additional confirmed runtime defect was found in those recent fixes.

A follow-up independent check confirmed M11 with exit code one from the system-path coverage validator, and confirmed that the CLI exposes no event-correction command.

Reconciliation: source breadth was moved out of the defect severity count into product priorities; CI coverage was downgraded to Minor and corrected to acknowledge PR synchronize events. H2 now explicitly cites one requisition across two URLs, rather than assuming matching titles imply duplicates. Corruption rejection and retention of reviewed openings are described as conservative behavior needing better recovery/reconciliation interfaces, not permission to silently ignore damage or mark jobs closed.
