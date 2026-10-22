# Bounded startup and agency discovery

These adapters extend the existing shared skill, CLI, research ledger, bounded captures and inventory. No MCP, new search service, database, candidate applications or delivery channel is added. Scores, qualification thresholds and approval rules are unchanged.

## Commands and scope

Configure a research run through `run --action configure` before collection. Each command below reserves one directory/page attempt before dispatch, never retries or paginates automatically, and reports partial coverage:

```text
node hr-ops.mjs discover --feed speedrun --icp startup --run RUN_ID
node hr-ops.mjs discover --feed by-recruiting --icp agency --run RUN_ID
```

Preview with `--dry-run`. Repeat within the active run to reuse the hash-checked cache. `--refresh` requests one new budgeted read. Existing candidate, page, directory, host-restriction and per-operation limits remain binding. Collection creates no prospects, drafts, interactions or qualified leads. Both `verified_new_prospects` and `qualified_prospects` remain zero. Use the normal revision-checked research path after identity and evidence review.

### Speedrun

The retained Career-Ops provider exports an additive one-page primitive. Its original scanner pagination/retry behavior is unchanged. The HR path reads page zero only and uses attribution `source=hr-ops`. It keeps canonical publisher role links, posting IDs, company slugs and bounded metadata. Posting IDs are not requisition or hire identities. Search responses normally omit full descriptions; the linked role still requires a separately budgeted role-body/currentness check.

Configure `hr_ops.discovery.feeds` in the private profile. Supported filters are `q`, `scope`, `fn`, `wp`, `size`, `stage` and `portfolio`. Values are strings, up to 120 characters. No endpoint, page, credentials or arbitrary parameter is accepted:

```yaml
hr_ops:
  discovery:
    feeds:
      - id: speedrun
        enabled: true
        filters:
          q: backend
          scope: portfolio
          wp: remote
```

Default scope is explicitly `portfolio`, covering the wider a16z portfolio. Use `speedrun` for that subset, or explicitly select `everywhere` for the broader universe when available. Nothing automatically widens scope. A conflicting response scope fails closed; absent response scope remains unverified in the raw response. Filters may be feature-gated by the publisher, so requested filters alone never prove returned size or workplace characteristics. Inspect live facet vocabulary in the raw capture identified by `facets_capture_id` before choosing size/stage values. Returned labels can be absent and are unverified publisher classifications, not primary employee counts.

Changing filters has a distinct cached request within the same run. It spends another directory/page allowance. Inventory retains both observations for review, rather than merging identical names. An aggregator company-profile URL is never promoted to an official employer domain. Masked/stealth rows are not acquisition identities and are not deanonymized. The existing role filter and exclusions still apply.

Missing/invalid pagination metadata, malformed rows, retention bounds or additional pages keep coverage partial. A short page is not automatically exhaustive. Raw facets and reported scope remain inspectable under the linked raw capture; the reader makes no complete-market claim. Portfolio recruiting support is a possible incremental-fit objection, not proof of no supplier appetite.

Contract checked against the [publisher REST documentation](https://speedrun-talent-network.com/developers) and [OpenAPI schema](https://speedrun-talent-network.com/api/v1/openapi.json) on 2026-10-21. Future API drift must produce diagnostics, not invented results. Local captures support research and recovery; do not rehost publisher listings.

### BY Recruiting

The narrow reader uses the existing visible-text and link extractor on the [official careers board](https://www.byrecruiting.com/careers), checked on 2026-10-21. It requires the observed board heading, partner-opportunity attribution, explicit count and recognizable role cards. Services-only pages, changed layouts or missing cards fail unresolved, never as a complete empty board. Count mismatches and link truncation remain partial. Only an explicit recognized zero-position board can yield a complete empty response, which still does not establish client fit.

Only same-origin `/jobs/NUMBER` links are retained. Descriptions are bounded visible card excerpts, not role bodies. Country restrictions remain in that text for interpretation. Every role has `hiring_for: unreviewed`, unknown client identity and unknown supplier appetite in provider metadata. A current role-body read must establish client versus internal hiring, engineering relevance, permitted countries and currentness. Distinct cards do not prove distinct clients or hires.

The agency is the lead, never its confidential client labels. Existing agencies appear under exclusions with captured relevant observations and a refresh instruction. They are not counted as new companies. Inventory observations use the agency ICP and remain unverified until identity review. New-company queue membership is not completed discovery.

The last canonical-domain source override wins, including `enabled: false`; a feed-specific disable also prevents requests. Existing catalog notes and controls are preserved. The adapter does not reinterpret restricted U.S. jobs as LATAM-serviceable or infer willingness to partner. BY Recruiting's existing international coverage requires an incremental-fit hypothesis. One board is not broad agency-market coverage.

An earlier board read on the same company domain already consumes its existing domain cap. Reservation receipts and continuation guidance now account for that constraint as well as candidate/total caps. `pages_used` still counts candidate pages separately from directory reads. Guidance considers remaining known routes without hiding a usable route when another domain is exhausted. Enforcement and saved budget semantics are unchanged.

## Evidence judgment packet

```text
node scripts/hr-ops-judgment.mjs
node scripts/hr-ops-judgment.mjs --reference
```

The default packet hides reference answers. Have a client or human record an independent judgment for each source/claim pair first, then compare the reference and retain disagreements. Identify observed facts, hypotheses, unsupported assertions, unknown fields and truthful alternative wording. Cases are synthetic reproductions of release-acceptance errors, not new claims about real companies. They cover office versus hiring geography, team location versus employment/supplier arrangements, uncertain posting overlap and restricted agency demand.

The packet is not an automated semantic truth grader or a general policy engine. Deterministic tests exercise the software after conservative interpretation: U.S. opening counts remain separate from company market fit, provisional admission cannot become qualified, unknown partner fields stay unknown, and exact hire/shared-client claims trigger existing draft checks. Merely citing these fixtures does not prove that a future agent will interpret every source correctly. Natural-language truthfulness remains an operator review responsibility.

An official careers page may link directly to one ATS posting instead of the board index. Record that exact outbound URL in ownership evidence and retain the matching parent board and posting ID. That link supports the individual opening only; it does not establish ownership of sibling postings. The validator accepts this combination without requiring deletion of board metadata, while rejecting unrelated board domains, tenant paths and sibling posting links.

Research and outreach briefs now repeat these specific distinctions, using the existing task/checklist fields. No second claim schema or historical data rewrite is introduced. Original snapshots, quotations and experimental prospect data remain intact.

## Finding-to-test matrix

| Risk | Regression or check |
|---|---|
| Implicit widening, pagination or hidden requests | One reserved request, explicit scope mismatch, partial totals and no retries |
| Endpoint/config injection or cache conflation | Strict filter keys, explicit query caches and original-query replay |
| Publisher labels promoted to facts | Unknown canonical domain, retained metadata and zero prospect/qualification writes |
| Stealth identity inference | Masked rows excluded from acquisition tasks/inventory |
| Services/anonymous clients become agency demand | Observed board layout required; one agency lead, unreviewed roles and unknown supplier appetite |
| Existing companies or overrides bypassed | Existing-agency refresh result, canonical disabled overrides and no dispatch at cap |
| Evidence lost after restart/recovery | Cache replay and backup/restore with both new reader contracts |
| Acceptance interpretation mistakes recur | Independent packet plus corrected-field qualification and existing draft-review regressions |

Tests: `tests/hr-ops/discovery-adapters.test.mjs`, `tests/hr-ops/judgment-benchmark.test.mjs`, existing HR feed/research/draft tests and retained `tests/providers/a16z-speedrun-talent.test.mjs`. Run the complete HR suite before release. Offline fixtures never contact LinkedIn or submit anything. Public smoke results validate only the observed bounded sources, not acquisition yield or supplier intent.

## Implementation validation

Local Node 24.21.0 validation passed 369 HR tests, the 34 retained Speedrun assertions and 53 focused accounting/research checks. The manifest validator passed for tracked files; all six new paths were independently checked against declared system/user paths. The independent judgment packet has not yet been evaluated by fresh Codex and Claude sessions. No cross-client semantic certification is claimed.

The broader `test-all.mjs --quick` run completed with exit code zero: 9,339 passed, zero failed and 10 reviewed warnings. Those warnings cover missing legacy CV setup, six retained upstream-attribution matches, one unavailable comma-decimal locale and two opt-in H1B API/mint tests. Mock provider-failure messages are expected regression output, not additional runner failures. No warnings or skipped checks were removed to obtain this result.

A separate empty data root performed three budgeted public requests on 2026-10-22 UTC: Speedrun returned HTTP 503 without an automatic retry; the BY Recruiting board retained 193 cards with partial coverage; one linked backend-focused full-stack body was readable but specified hybrid San Francisco work. This was a reader smoke check, not a prospecting quota. Speedrun successful live collection remains unvalidated on this patch despite passing deterministic contract tests. The pinned directory allowance was exhausted, so no replacement run was created to evade it.

The agency cache replay spent zero requests. The run was completed with explicit deferred work, then backed up and restored into a separate directory with manifest validation and file equality. Zero prospects, drafts or interactions were created; no messages were sent. All 34 operating prospect files matched the earlier baseline byte for byte, and doctor remained healthy. Private evidence is summarized in `local/discovery-milestone-smoke-summary.json`; raw captures and the original failed attempt remain under the isolated root named in that receipt. These private artifacts are not shipped in Git.

The public smoke preceded the final allowance-display correction. The subsequent quota regressions and full HR suite validate that correction without additional public requests or rewriting the original receipt.
