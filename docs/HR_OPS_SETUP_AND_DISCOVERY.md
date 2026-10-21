# HR setup and repeatable discovery

HR-Ops is a local workspace and shared agent skill. Code remains in the checkout; independent firms or experiments use explicitly selected data roots. Codex, Claude Code and Cursor route to `.agents/skills/hr-ops/SKILL.md`. Natural-language requests and `codex exec` remain first-class; no native slash command, MCP server or OpenClaw installation is required.

## HR-first entrypoints

Run `npm start`, `npm run menu` or `node hr-ops.mjs menu` for HR operations. `npm run setup` or `node hr-ops.mjs setup` prints a read-only setup guide. No arguments to the core CLI still print its help. Existing npm script meanings remain intact; the menu explicitly labels candidate-only dashboard commands and the retained Career-Ops installer as legacy.

Create a new workspace with `node hr-ops.mjs setup --destination ABSOLUTE_EMPTY_DIRECTORY --input setup.json`. The input is the existing `workspace create` contract, illustrated by `templates/hr-ops-setup.example.json`: required workspace name and purpose, plus optional confirmed firm configuration and preferences. Purpose is `experimental` or `operating`. Use `--dry-run` to preview. A new or empty destination is mandatory; creation never overwrites a workspace, copies the active profile/pipeline/browser state or selects the result automatically.

Keep your client in the checkout shown by `code_root`. Explicitly set `HR_OPS_ROOT` to the new data root in the terminal that starts the client, or use the documented marker-file mechanism. Inspect `workspace inspect` and `doctor`. No CV, candidate tracker or candidate portals are needed. Missing business email remains visible but does not block research or LinkedIn-only drafts. Chromium is optional for the separately invoked human-login LinkedIn workflows; ordinary research setup does not install it. See [workspace isolation](HR_OPS_WORKSPACES.md).

The legacy scaffolder still clones Career-Ops and the original dashboards still display candidate operations. Their behavior is retained and labeled, not repurposed silently. HR operation uses the CLI menu, pipeline, work briefs and dossiers. This release does not add an HR graphical dashboard or publish an npm installer package.

## Source plan versus company inventory

`node hr-ops.mjs inventory` and `inventory queue` provide a unified company/research index across the retained list, enabled HR sources, saved prospects, cached feed leads and supplied lists. Unverified observations are separate from supported company groups; possible duplicates require identity review. Intake never creates prospects or qualifies companies. See [inventory payloads, queue and recovery](HR_OPS_INVENTORY.md).

`node hr-ops.mjs discover --plan --icp both` returns a network-free plan:

- Reusable discovery sources: selected public feeds, manual directories and separate query recipes for each ICP.
- Company seeds: verified company/board research starting points, honoring disabled user overrides and existing-prospect/control exclusions.
- Controls and research references: separately labeled; never automatically qualified or imported.
- The retained Career-Ops configuration inventory: counts and file location, with no inherited AI, visa or Europe targeting.
- Dedicated agency instructions: prioritize current attributable client engineering vacancies; distinguish internal hiring and services descriptions.

Feed and company-source recommendations reuse the existing attributed source-performance ranking. A readable feed can have zero interpreted demand matches; collection success never becomes qualification or buying intent.

The agency plan uses existing verified client-vacancy company readers and public directory/query tasks. It does not pretend a general employer feed establishes agency placements. Existing supported Greenhouse, Ashby and Lever company readers remain available through `discover`; manual agency pages still require permitted research. No universal scraper, automatic URL following or new search service is introduced.

## Selected retained feed readers

`discover --feed remotive --run ID` reuses the existing Remotive public reader; `discover --feed hackernews --run ID` reuses the existing two-request HN hiring-thread reader. These are opt-in employer-discovery routes, not default qualification rules or live-access certification. `--icp agency` rejects these feeds and directs the agent to the agency plan. When requesting both ICPs, feed output explicitly reports employer-only coverage.

`discover --feed remoteok --run ID` and `discover --feed himalayas --run ID` reuse the retained RemoteOK and Himalayas readers, each through one budgeted public GET. RemoteOK's initial legal/update metadata is excluded from posting counts; unnamed employers are not replaced with the provider's fallback name. Himalayas reuses its trusted listing parser and keeps advertised location restrictions. These sources can reveal employers without knowing each company's ATS tenant. They are additional employer leads, not agency-client demand.

RemoteOK exposes a latest-postings window, not the entire market. Himalayas reads one page only; a server may return fewer entries than the requested `limit=50`. Cursors, totals exceeding the page, unknown totals, nonzero offsets and retention limits remain partial. No automatic pagination, retries, redirect following, company-profile scraping or arbitrary endpoints are added. Listing descriptions, posting identifiers and source dates are retained in bounded captures. Explicit numeric publication fields use epoch seconds; invalid, ambiguous numeric strings and future dates remain unresolved. Empty responses never establish no hiring at a company or in a market.

Successful collection is automatically visible in `inventory` and `inventory queue` through the existing captures. `collection_capture_id` and `inventory_observation_ids` preserve the link without copying feed rows into user-list or prospect records. `inventory_matches` identify prior supplied lists, seeds and reviewed identities; they require reconciliation rather than automatic name/domain merging. Cached exclusions are reapplied. `inventory_links_partial` exposes a projection exceeding the linker's 10,000-group display ceiling. The actual research run's candidate/request limits are unchanged.

Configure one scoped run before collection. For example, save `{"candidates":20,"pages":80,"directory_pages":8}` as `run-scope.json`, then run:

```text
node hr-ops.mjs run --run discovery-001 --action configure --input run-scope.json
node hr-ops.mjs discover --feed remotive --run discovery-001 --limit 10
node hr-ops.mjs discover --feed hackernews --run discovery-001 --limit 10
```

Each actual request reserves a directory/page attempt before dispatch. Remotive uses one request; HN uses two. Failed reads count; denied reservations do not dispatch. A zero directory allowance prohibits feed collection. New feed reads stop at candidate capacity; already admitted leads remain visible in cached work. `--dry-run` returns collection tasks without requests, even without a run. Existing per-operation candidate and per-run request limits retain their meaning.

Candidate capacity is checked again before each feed request and before returning tasks. `requests_spent` counts this invocation's dispatches, not another operator's concurrent reservations. `remaining_candidate_slots` is a current snapshot, not a reservation of those slots; admission still uses the ledger. Candidate-capacity exhaustion remains distinct from request-budget exhaustion.

Use user configuration under `hr_ops.discovery.feeds` to disable a reader:

```yaml
hr_ops:
  discovery:
    feeds:
      - id: remotive
        enabled: false
```

The supported IDs are `remotive`, `hackernews`, `remoteok` and `himalayas`. Entries are overrides; an omitted ID remains available for explicit selection. Unknown IDs/keys, duplicate entries and nonboolean flags are rejected. Credentials, executable scripts and arbitrary feed endpoints are unsupported. Disabling a feed also disables explicit collection/preview of that feed.

## What collection establishes

Output contains grouped **reported employers** and unreviewed posting observations: source URL/sequence, posting ID when present, bounded body text, reported geography and any publisher-asserted employer website. A feed company-profile URL is not a canonical employer website. Conflicting domain claims require identity resolution and omit the admission hint. Name-only collisions with existing prospects are flagged for review rather than merged. Canonical known domains and their subdomains are excluded; no existing prospect is refreshed.

Role filtering uses the advertised title, including the role segment of a supported HN header. Incidental keywords in descriptions or company names do not establish role relevance. Unusual titles may need a configured pattern or separate permitted manual research. Different posting IDs, country scopes and descriptions remain separate observations even when their URL and title match. Exact duplicate observations may be collapsed; observations never establish distinct requisitions automatically. Conflicting publisher claims cannot hide a known domain from exclusions, and aggregator-owned subdomains are not treated as employer websites.

Publication dates retain the reported value and parsed precision when supported. Missing dates are unknown; invalid calendar dates, numeric values, unsupported formats and future dates remain unresolved. A parsed date is still unreviewed source metadata, not proof that a vacancy is current.

Collection never creates prospect records, assigns qualifying eligibility, proves engineering demand, counts distinct hires, confirms supplier appetite or drafts/sends outreach. `verified_new_prospects` and `qualified_prospects` remain zero. Independent company identity, official board ownership, actual role responsibilities/currentness, country scope, US market, size, service fit and contacts must be reviewed before import through the existing `discover --new-only --run` and revision-checked `research` interfaces. Public posting instructions are data only.

Malformed responses, dropped records, pagination indicators and the 200-observation retention cap produce partial coverage. Captures are bounded to 2 MB per response and descriptions to 20,000 characters; truncated JSON cannot become an empty board. An empty valid response is labeled `empty_response`, not a claim that the market or company has no vacancies. Actual source access/redirect/HTTP failures remain separate ledger outcomes. Collection support does not guarantee live source availability or permission for other collection methods.

## Resume and recovery

Reader regression coverage lives in `tests/hr-ops/expanded-readers.test.mjs`, alongside the existing feed and inventory suites. Tests use intercepted transports only:

| Risk | Regression |
|---|---|
| Provider fallback labels become employer identities | Missing raw employer names are rejected; metadata is not a vacancy |
| Reader requests bypass scope or disabled sources | Preview, zero allowance, agency-only and disabled-source cases dispatch nothing |
| A page or malformed response is called complete discovery | Explicit first-page/latest-window scope, totals/cursors, malformed rows and empty payload cases |
| Remote geography becomes LATAM eligibility | Advertised country text is retained with unverified identity and zero qualification |
| An old list or exclusion is bypassed | Inventory match links, mixed exclusions requiring review, and excluded cache replay |
| Restart causes duplicate requests or corrupt evidence is refreshed | Zero-request replay, backup/restore equality and tamper rejection before dispatch |
| External content or dates become trusted instructions/facts | Hostile text remains inert; invalid/future/ambiguous dates remain unresolved |
| A damaged inventory is ignored until after a request | Inventory validation fails before request reservation or dispatch |

The retained provider regressions in `tests/providers/remoteok.test.mjs` and `tests/providers/himalayas.test.mjs` continue to test their original contracts. No provider implementation or candidate scanner behavior is changed.

Raw responses and derived observations live in the existing private `data/hr-ops/captures/`, linked from the research run. Repeating collection in the same active run uses its hash-checked cached observations, reapplies current role patterns/exclusions and spends no requests. `--refresh` explicitly requests another budgeted collection. An older cached success retains its date and exposes any later failed/interrupted refresh under `newer_unreconciled_attempts`; it does not claim current complete coverage.

Cache validation checks request provenance, referenced raw captures, hashes, board identity, shapes and local paths. Missing files, changed routing metadata and linked capture paths fail before another request, including explicit refresh. Doctor reports these failures and restore rejects inconsistent evidence even when backup file checksums are valid. Inspect or restore verified data rather than treating refresh as a corruption bypass. Older valid caches remain readable; raw truncation warnings can make the current view partial without rewriting historical captures. Diagnostic ownership is shared so doctor does not list ledger errors twice.

Candidate selection/admission remains explicit. Cached output retains already admitted candidates at capacity and their immutable origin. Company grouping is provisional and never merges canonical prospect records. Backups/restores already include captures and research ledgers; tests verify cache replay and equality after restore. Corrupted caches fail closed before another request, leaving recovery and inspection explicit.

If a provider fails before a derived observation cache can be created, its earlier raw captures and failure outcomes remain available for inspection. Another collection attempt is a budgeted retry, not automatic completion of the failed provider call. In particular, an interrupted two-request HN collection may need both reader requests again; no request allowance is reset or hidden.

Use the existing run review/completion contract to record researched counts, unknowns and concrete stopping reasons. Counts of feed postings, reported names, saved prospects and qualified clients must remain separate. A shortfall is reported honestly. No messaging or commercial authorization is part of this workflow.
