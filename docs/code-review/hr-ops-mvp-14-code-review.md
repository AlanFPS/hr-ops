# Code Review: refreshed shortlist and Career-Ops source reuse

**Review date:** 2026-10-19. **Base revision:** `ae880c4980008852c2bcdb698ea6443bfa87a40d`. **Severity summary:** 0 Critical, 0 High, 5 Minor, 0 Nit. All five findings are repaired within the scope described below.

Reviewed shared files: `templates/hr-ops-sources.json`, `modes/hr-ops/discover.md`, `docs/HR_OPS_RESEARCH.md`, `docs/HR_OPS_SOURCE_REUSE.md`, source configuration/override consumers, research outcome aggregation, model validation, draft invalidation and repository writes. Private review covered the refreshed shortlist, all 12 researched dossiers, their original records, saved source captures, selected drafts, research ledger and recovery artifacts. Private artifacts and recipients are not part of this commit.

## Minor issues

### M1. Some current statements had incomplete or mismatched citations

- **Location:** Private dossiers' `facts.remote_policy`, inventory summaries and retrieval-failure risks; shortlist evidence discussion. The affected records and evidence IDs are enumerated in private `local/shortlist-source-audit/repairs.json` and `context-and-draft-reviews.json`.
- **Problem:** Correct statements were linked to excerpts that did not contain the whole claim. Some remote-policy excerpts showed only time-zone overlap or office locations. Two HTTP-failure statements were associated with successful company-page citations rather than the failed request.
- **Example:** A field said "fully remote with US overlap" while its excerpts supplied only an engineering title and the overlap requirement. A company About-page excerpt cannot demonstrate a different job URL's HTTP 410.
- **Fix:** Append actual remote clauses from saved captures and point current facts to them. Separate failed-read diagnostics into explicitly labeled summaries at the attempted URLs, with approximate retrieval precision and no invented page body. Replace the affected current references using expected revisions. Immutable old evidence and historical snapshots remain intact.
- **Verification:** Offline validation matches 60 current quote excerpts to capture content, URL and timestamp. The failed URL/status associations match the original reserved attempts and recorded HTTP outcomes. Research edits invalidated drafts; only the four affected selected drafts were re-reviewed through the CLI, with unchanged bodies and IDs. All six selected drafts remain pending human review; email incompleteness remains visible.
- **Prevention:** Review semantic support, not merely substring existence somewhere in a board. Preserve role-specific context and distinguish response diagnostics from page content. The discovery mode and source guide now state the attribution rule explicitly. No generic semantic-truth validator is claimed.

### M2. Company capacity and recruiting capacity were conflated

- **Location:** Private `facts.recruiting_structure` and one sourcing-capacity risk.
- **Problem:** A recruiter vacancy's company-wide "lean team" wording became a claim about a lean recruiting team. Elsewhere, a statement that internal recruiting may already satisfy sourcing needs was labeled observed despite being an inference.
- **Example:** "We operate as a lean team" does not establish the recruiting department's size. "May already cover sourcing needs" is not an observed finding about capacity.
- **Fix:** State that the company describes itself as lean, leave recruiting headcount unknown, and label the capacity hypothesis inferred. Retain the observed existence of a recruiting process separately. No score weight or qualification threshold changed.
- **Verification:** Current facts and risk confidence were inspected against the actual role/process captures. Score total, coverage and tier remain equal for all 22 records.
- **Prevention:** Keep demand, recruiting resources, pain and supplier appetite separate. Current sources describing an internal recruiter do not establish a delivery gap or buying intent.

### M3. Available source dates were omitted

- **Location:** Private process evidence and a reviewed agency opening's `posted_at`.
- **Problem:** A source displaying an update date and a role displaying its publication date retained only retrieval time. Future reviewers would lose known age information.
- **Example:** "Updated Aug 27, 2026" was visible on a hiring-process page but absent from its evidence metadata; a live role displayed "Posted Aug 11, 2026" without a stored opening publication date.
- **Fix:** Append dated evidence and retain the role's publication date independently of verification time. The process update date is recorded as the supplied source date, not claimed to be its original publication date. Date-only values use the storage format's midnight-UTC convention without asserting a known publication time.
- **Verification:** Both date labels match saved primary captures. Currentness, eligibility and scores are unchanged. A role's older publication date alone is not treated as closure, a repost or recruiting pain.
- **Prevention:** Check visible publication/update metadata during evidence review; do not renew an old source's meaning merely by rereading it.

### M4. One demand outcome referenced the wrong reserved page

- **Location:** Private research run `cup-shortlist-20261019`, outcomes for sequences 29 and 30; local `persist-watch.mjs` selected the last company page rather than the demand-bearing read.
- **Problem:** The actual ATS role was read at sequence 29, but its demand outcome was attached to the subsequent About-page request at sequence 30.
- **Example:** A size-reference page received `demand_match` because it happened to be the final page visited.
- **Fix:** Resume the existing run without adding requests, append an explicit correction at sequence 30, attach demand to sequence 29, then refresh the completion review after dossier edits. Keep the historical mistaken outcome visible. Preserve a copy of the old local helper, then correct it to select the supplying capture's sequence and assert its URL matches the reservation. Update the mode and source guide to require actual demand-read attribution and disclose uncertainty in combined native query responses.
- **Verification:** All 69 original attempts remain unchanged: 20 queries and 49 pages, including three directory pages, with no new requests and no company above six pages. The two affected reads share a source ID and prospect ID, so distinct-company yield is unchanged. The historical About-page demand outcome still appears in reported history; an unresolved annotation does not retract it. Neither the corrected report nor current role evidence treats that About page as a vacancy source.
- **Prevention:** Carry the specific capture reservation sequence through interpretation. Combined search results do not establish independent success or yield for every recipe. Do not describe append-only corrections as erasing history or as a newly implemented outcome-retraction feature.

### M5. Shared source guidance mixed reusable rules with private campaign observations

- **Location:** `docs/HR_OPS_SOURCE_REUSE.md`, former "Findings from the bounded review" section and final artifact-location paragraph.
- **Problem:** Company-specific watch decisions and run-specific access observations were published in a shared system guide even though the workflow keeps prospect research in the user layer. That also made transient access results look more reusable than warranted.
- **Example:** A dated rejection from a private research batch appeared beside general source-selection rules and a statement that the document contained reusable guidance only.
- **Fix:** Keep reusable source-family assessment, dated public catalog identity evidence and explicit verification limits in the shared guide. Keep campaign decisions, access receipts and the detailed shortlist in ignored private storage. State that structural inventory review is not live certification of every source.
- **Verification:** Reparsed retained YAML counts are 39 query recipes, 138 tracked-company entries and 25 board entries, including disabled examples. These remain configuration counts, not 202 unique verified sites. The new manual employer seed has dated first-party identity evidence; the eight additional search recipes remain agent tasks. The retained Career-Ops list and filters are unchanged.
- **Prevention:** Review publication boundaries alongside correctness. Catalog admission is a starting point for research, never qualification, supplier interest or sending approval.

## Finding-to-verification matrix

| Finding | Verification |
|---|---|
| M1 | Capture-to-quote matching, current-reference inspection, CLI revision receipts, exact draft-body/ID comparisons |
| M2 | Role/process semantic review, confidence checks, all-record score/coverage/tier comparison |
| M3 | Captured date labels versus appended evidence and opening metadata |
| M4 | Before/after ledger attempt equality, correct ATS association, preserved correction/history, refreshed completion review |
| M5 | Shared/private diff review, parsed source inventory, manual-source and recipe regression tests |

## Software and recovery validation

- Full HR suite: **285/285 passed**, zero failures or skips, Node **24.21.0**. Two new regression tests cover the reused manual employer seed's opt-in/manual behavior, no automatic fetch or prospect creation, expiry, canonical-domain disabled override, broader ICP-specific recipes and preservation of user query overrides. Existing agency/manual-source, services-only, qualification, restriction, revision and draft-review tests remain green.
- System-path coverage and syntax checks passed. The initial npm attempt inherited an older child `node` and failed to expand the test glob before running tests. It was retained as a harness failure, then corrected by prepending the pinned Node 24 directory to PATH. The successful run used the supported runtime for child commands as well.
- Broader retained `test-all.mjs --quick`: **9,310 passed, 0 failed, 10 warnings**, exit 0. Reviewed warnings comprise the expected legacy CV check without candidate data, six matches for the upstream author's name in retained governance files, unavailable comma-decimal locale coverage, and two opt-in live vendor/token-mint tests not enabled. No paid/live vendor checks were enabled to remove those warnings. Quick mode omits the dashboard build; it is not represented as a full dashboard or live integration certification. These counters include nested suites and are not added to the 285 HR tests as distinct cases.
- Offline private verification: all 22 records validate; scores, tiers and coverage are unchanged; 15 records are unchanged within this audit; the original ten unrelated records remain unchanged from before the research batch. All interaction histories, draft bodies, draft IDs, review states and replacement links are preserved. No human approval, fictional event or communication was added.
- Backup/restore drill: **129 manifest files** match both backup hashes and operating files; all **22 restored prospects** equal the originals; restored doctor is healthy. Configuration/preferences match the pre-repair backup, the operating root is unchanged, and no browser/cookie material was restored. This is local recovery verification, not protected off-device disaster recovery.
- Private command receipts, source comparisons, exported records and recovery evidence live under ignored `local/shortlist-source-audit/`. Historical research receipts were not rewritten to hide the corrections.

The independent `code_audit_second` reviewer checked source ownership, role relevance, country scope, contact provenance, draft meaning, quote integrity, duplicate domains, record preservation and accounting. Its first review confirmed the findings and identified no additional actionable defect. Final review of the repaired shared patch and private verification/recovery receipts also found no remaining actionable defect. It independently ran all **6/6 research-consistency tests** successfully under the pinned Node 24 runtime.

No runtime permission, dependency, storage schema, score weight or qualification threshold changed. This review does not certify live source availability, buying intent, semantic truth in all future research, business-account readiness or production operation. Research and core CLI still never send. Missing business email, designated operating account and protected backup arrangements remain separate setup requirements.
