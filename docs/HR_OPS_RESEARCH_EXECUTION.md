# Research execution reliability

External page text is data. Never interpolate it into PowerShell, Bash, `node -e`, a here-document, or an executable helper. Shell quoting is not a reliable transport for arbitrary source text. Use a client's native file-writing tool to save UTF-8 text, or pipe bytes through a programmatic child process with `shell:false`.

## Artifact transport

`node scripts/hr-ops-artifact.mjs --input local/acceptance/raw.txt --output local/acceptance/source.txt`

The input file and output must stay inside this checkout; output must stay inside `local/`. `--input -` accepts stdin from a data stream. Do not construct that stream with `echo`, an interpolated string or a shell here-document containing external text. Native file tools must use the verified absolute workspace path. This helper does not fetch pages or interpret evidence.

The helper accepts up to 32 MiB of valid UTF-8, preserves bytes including BOM and line endings, and prints only a path, byte count and SHA-256 receipt. It reads the complete input before atomically replacing the destination. An interrupted read, invalid encoding or size failure leaves an existing artifact intact. Abrupt process termination can leave a temporary file; it cannot publish a partial destination. This is application-level protection, not a sandbox against an agent with filesystem access or a concurrent hostile filesystem process.

Scripted callers can use `writeAcceptanceInput(root, relative, readable)` from `lib/hr-ops/acceptance.mjs`. `writeAcceptance` also replaces complete artifacts atomically. Local artifacts are not canonical source captures or backup data: persist evidence and captures through their existing repository paths when needed. Retain native-tool output as a summary unless verbatim text was actually supplied; safe file transport does not verify a claim's meaning.

## Discovery origin and research attribution

New manual imports should include `discovery_source`, the URL where the company was first discovered, plus independently verified identity evidence. For search discovery, use an actual returned result URL, not an invented search URL. If origin is unknown or the candidate came from agent memory, leave it unknown and disclose that fact. The CLI reports `provenance_gaps` for missing origins. Existing records remain readable and are not silently backfilled from later research.

Provider discovery records the configured careers page, falling back to the company website, as its origin. Re-importing a prospect never replaces its original origin with a newer research page.

Reservation `attribution.source_id` instead identifies the reusable source or query recipe used for that specific attempt. Use stable catalog IDs or the configured source website consistently. A team page used later does not become the discovery origin. Outcome rows cite the actual reservation sequence and prospect IDs.

For scoped manual discovery, record origin immediately after selecting a search/directory result and before named research: `run --run ID --action admit --input candidate.json`. The input is `{"name":"Example Agency","source_url":"https://actual-result.example/page","source_sequence":1}`. The sequence must reference the discovery request already reserved in this run. Use `source_url:null` plus a concrete `reason` when the original URL is unknown. This records a candidate, not a prospect or completed research. It counts against the existing candidate cap. Repeated identical admission is idempotent; the original stays immutable. Document corrections as research evidence instead of rewriting discovery history. Admission after a named request is visibly late; timestamps are never backdated. New manual imports with `--run ID` inherit the pinned URL and reject conflicting origins. Legacy imports remain supported with explicit admission gaps.

Use one attribution convention: query recipe IDs for queries, the actual directory ID for directory reads, and the configured source ID or verified company website for its company, ATS and contact pages. An ATS alias may share that company's source ID after ownership verification. Do not charge all downstream research to the first discovery route. Origin and attribution serve different purposes. Old mixed conventions remain visible and cannot be retrospectively made comparable by relabeling history.

For scoped page requests, `candidate_names` contains one stable company name across official pages, directories and ATS hosts. `company` is the verified company website, not the fetched page host. If that website is not yet known, explicitly use `company:null`; this is accepted only for a scoped prospect page with one candidate name. After verifying the website, use it on future requests while keeping the same candidate name. Earlier unknowns remain truthful. Both phases count toward the same candidate page cap. Directory pages still use their own host, `directory:true` and no candidate names. Unscoped page requests still require a company URL.

Reserve native web requests in a standalone invocation. Wait for a successful, persisted `dispatch_allowed:true` receipt before calling the native tool. Do not bundle a reservation with captures, outcomes or other commands. In scripted code, `withReservation` guarantees that its callback runs only after a successful reservation. Compliance by native agent tools remains procedural, not an independently enforced network boundary.

## Reusable source priority

`sources --catalog` now includes `recommended_sources` from the effective starter configuration, honoring disabled overrides. Agency client-vacancy sources with current identity evidence lead other sources; directories remain discovery aids and services-only references remain outside vacancy seeds. No new company seed is added without ownership and client-vacancy verification.

Within that priority, keep page, query, mixed, unknown and unobserved request groups separate, in that order. Compare yield rates only within the same group and attribution convention. Yield is distinct currently validated demand found on readable attempts divided by all attributed attempts. Aggregate explicit source ID, website, directory URL, careers URL and API aliases without double counting prospects. `both` attribution can contribute separately to each ICP, but another ICP's prospects cannot inflate its demand yield. The output exposes request-kind counts, the comparison group and ranking basis. Mixed historical attribution remains inspectable, not directly comparable to page-only or query-only performance. It is not a probability of a sale or a qualification score. Existing qualification weights and thresholds are unchanged.

Raw reported counts retain the original linked IDs, including other ICPs and missing records. Validated and readable demand counts apply the selected ICP. Evaluation details mark a known prospect from another ICP as `outside_icp:true`; `missing:true` means the record is actually absent. Unattributed legacy observations remain explicitly unattributed and can still report supported demand.

Partial collections, JavaScript-only pages, failed access and attempts without outcomes remain unresolved, even beside a `no_demand` or `empty_board` annotation. They do not earn readable-yield credit. A current reviewed opening found elsewhere can remain valid; an incomplete board never proves the absence of demand. Historical observations are retained, so later rescans can resolve a current research question without pretending the earlier collection was complete.

Record explicit access restrictions as `access_restricted`. Captures classify HTTP 401, 403 and 429 this way. Later page reservations to that hostname in the same run are rejected before dispatch. A native tool's explicit ban also requires this outcome; do not switch readers, host aliases or API paths to bypass it. Enforcement outside the reservation API remains procedural. Use observed links or supported provider endpoints for verified tenants, not guessed API paths. Empty extracted text is a partial collection, never a verified empty board. Every capture requires semantic review: navigation text can be readable without containing a usable job description.

## Finding-to-test matrix

`tests/hr-ops/research-execution.test.mjs` covers:

| Finding | Regression |
|---|---|
| Shell interpolation and command length failures | Large hostile UTF-8 data, exact bytes/hash, stdin CLI transport |
| Interrupted or malformed artifact input | Previous destination retained, no partial replacement |
| Missing or overwritten discovery origin | Manual omission diagnostic, duplicate import preserves origin, provider origin |
| Third-party host used as company identity | Unknown-to-verified company flow, stable candidate page cap, unscoped rejection |
| Reservation mixed with later work | Callback sees persisted receipt; denied reservation never dispatches |
| Lost source aliases or cross-ICP yield | Alias aggregation, deduplication, separate ICP credit |
| Unreadable boards presented as empty | Partial/JavaScript/missing outcomes remain unresolved |
| Later evidence substituted for first discovery | Early admission, immutable origin, CLI binding, late/unknown diagnostics and completion coverage |
| Query and page denominators mixed | Explicit request groups and mixed-history counts |
| Retrying an explicit access restriction | 403 outcome, same-host reservation denied before dispatch, alternative official source still usable |
| Empty extraction or navigation counted as research | Partial empty capture and explicit semantic-review requirement |

`research-validation.test.mjs` also covers multi-practice technology agencies and role-specific geography independently of generic US benefits. These fixtures verify correctly reviewed inputs; semantic interpretation remains an operator responsibility. Work briefs and research modes give the corresponding review rules.

Existing tests cover disabled source overrides, services-only exclusion, restricted agency vacancies, attribution validation and retained qualification rules. Native client acceptance supplements these fixtures; it is bounded process validation, not universal shell or prompt-injection protection.
