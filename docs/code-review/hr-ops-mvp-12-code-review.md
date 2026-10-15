# Code Review: live pilot repairs

Review date: 2026-10-15. Reviewed model/research-run changes, new scope/capture/acceptance helpers, launcher, modes, source catalog and regression tests. Based on the user's Cursor audit procedure. Initial pilot findings: 0 critical, 1 high and 4 minor addressed. Independent second review completed, with 2 additional high and 3 minor findings fixed and verified below. No confirmed findings remain open in this review scope.

| Finding | Problem and example | Fix and prevention | Verification |
|---|---|---|---|
| High: unreviewed imports | `reviewed: !collected` overwrote explicit false. An open but unreviewed role could receive demand credit. | Preserve explicit false; preserve pending reconciliation until deliberate review. No historical or operating data rewritten. | Regression imports open false rows, confirms zero demand, then explicitly reviews them. Existing review fixtures now say true deliberately. |
| Minor: scope accounting | Named company searches were omitted from page-only candidate lists; domain aliases split budgets. | Optional scope pinned before requests, candidate_names on queries and pages, shared name budget across domains, total/directory caps, resume continuity. Semantic identity and honest native-tool declarations remain procedural. | Rejection before dispatch, failed reads charged, alias cap, immutable scope, dry run and legacy compatibility tests. |
| Minor: capture limits | HTML decoding damaged JSON; links were lost; redirects surfaced as generic fetch errors. | Preserve valid JSON, bounded public HTTPS link metadata, manual redirect diagnostics without automatic following, DNS/timeout classification. | JSON/entity, unsafe URL, link cap, redirect and counted-failure tests. Retained transport tests remain applicable. |
| Minor: acceptance isolation/counts | Child shells lost temp overrides; stray helper path; reports conflated U.S. fit and demand and misread draft chains. | Test subprocess owns TEMP/TMP/TMPDIR; checked relative artifact paths reject escapes/junctions; canonical summary distinguishes U.S. fit, blockers and current drafts. | Traversal/symlink tests, child os.tmpdir test, summary fixture, fresh client pilot. Helpers do not sandbox arbitrary native tools. |
| Minor: research/draft quality | Guessed paths, weak agency sources, first-name-only contact and mechanical recipient rationale. | Verified ASA/TechServe public directory starting points; prefer captured official links; named-source accounting; keep rationale in metadata and require recipient identity clarification before human use. | Public directory pages checked 2026-10-15; fresh live pilot assesses actual yield. No quota or threshold relaxation. |

Primary sources for added directory metadata: [ASA directory](https://americanstaffing.net/asa-member-directory/) and [TechServe directory](https://techservealliance.org/collaborate/member-directory/). These establish discovery starting points only, not member qualification or guaranteed machine-readable results.

Final local regression result: 167/167 HR tests pass on Node 24.21.0. The broader quick suite passed 9,282 checks with zero failures and 10 warnings: absent legacy CV data, six retained upstream-name heuristics, unavailable comma-decimal locale, and two opt-in live H1B checks. Final staged manifest validation and committed-build client acceptance follow. Historical warnings were not hidden or disabled. Historical pilot reports remain unchanged; final acceptance evidence will be saved locally. Business email, protected backup arrangements and commercial outcomes remain separate operating prerequisites.

## Independent second review

Reviewed 2026-10-15 under the user-invoked Cursor audit procedure. Scope included the tracked repair diff and new `acceptance.mjs`, `capture-content.mjs`, `run-scope.mjs`, pilot launcher and regression tests. The second reviewer used synthetic temporary repositories and mocked transports, performed no external communication or real prospect writes, and edited only this review report. The following findings are additional review findings, separate from the initial pilot observations above.

### S-H1. Scoped ATS discovery omitted required candidate declarations

- **Severity**: HIGH; fixed and verified.
- **Location**: `lib/hr-ops/discovery.mjs`, provider `fetchJson` budget wrapper.
- **Problem/example**: A configured Greenhouse source in a pinned scoped run failed before its first request because the wrapper supplied only kind/company/target. Independent reproduction returned zero transport calls, zero attempts and `Scoped requests require candidate_names`.
- **Fix**: Attach the configured source name to provider reservations when the run has a scope, including optional enrichment requests. Preserve legacy unscoped payloads.
- **Verification**: End-to-end scoped Greenhouse regression reaches the mocked provider, records candidate names and persists only unreviewed collection results.
- **Prevention**: Exercise actual discovery callers whenever the reservation payload contract changes.

### S-H2. Dangling artifact links bypassed workspace containment

- **Severity**: HIGH; fixed and verified.
- **Location**: `lib/hr-ops/acceptance.mjs`, `acceptancePath()`.
- **Problem/example**: `existsSync()` follows links, so a dangling file link appeared absent. A synthetic `root/artifact.json` pointing at an absent sibling `outside/new.json` passed both checks, and `writeAcceptance()` created the outside target.
- **Fix**: Probe entry existence with `lstatSync()`, then reject unresolved/dangling links or resolved paths outside the workspace before writing.
- **Verification**: The regression covers an escaping junction and a dangling file link, verifies rejection, and confirms no outside target is created. It passed on this host without skipping link checks.
- **Prevention**: Include dangling links when testing filesystem containment. These helpers remain checks for ordinary artifacts, not an OS sandbox against arbitrary agent tools or hostile concurrent filesystem mutation.

### S-M1. Malformed scope values silently disabled scoped validation

- **Severity**: MINOR; fixed and verified.
- **Location**: `lib/hr-ops/run-scope.mjs`, scope absence check.
- **Problem/example**: `if (!state.scope)` treated persisted `scope:false` as a legacy ledger. An independent synthetic probe then obtained `dispatch_allowed:true` for an undeclared query. This was corrupt-state fail-open behavior, not a security boundary against a filesystem owner.
- **Fix**: Only an absent scope property selects legacy behavior; validate every explicitly present value.
- **Verification**: Persisted null, false, zero, empty string and malformed objects reject without dispatch. A legitimately absent scope remains compatible.
- **Prevention**: Distinguish optional-field absence from invalid falsy values in persisted schema validation.

### S-M2. Optional provider enrichment swallowed scoped quota errors

- **Severity**: MINOR; fixed and verified.
- **Location**: `lib/hr-ops/run-scope.mjs`, error classification consumed by provider wrappers.
- **Problem/example**: In a one-page scoped Greenhouse run, the jobs request succeeded and the offices reservation failed. A generic Error was swallowed by best-effort enrichment, yielding `partial:false`, `complete:true` and `reachable`; the denial appeared only on stderr. No extra network request occurred, but structured policy reporting was wrong.
- **Fix**: Mark scope validation failures nonretryable. Use `HR_OPS_BUDGET_EXHAUSTED` for exhausted scope and `HR_OPS_SCOPE_INVALID` for malformed scope/request declarations.
- **Verification**: The regression makes exactly one transport call, persists no prospect after denied enrichment and returns a structured budget-exhausted diagnostic. Retained policy-denial regressions also pass.
- **Prevention**: Test quota policy through optional provider calls and retry wrappers, not only the reservation helper.

### S-M3. Missing redirect headers fabricated a destination

- **Severity**: MINOR; fixed and verified.
- **Location**: `lib/hr-ops/capture-content.mjs`, `captureFailure()` redirect handling.
- **Problem/example**: `new URL(error.location, source)` coerced native missing-header `null` into `https://example.com/null`; undefined became `/undefined`, and an empty value suggested retrying the source itself. These were invented research paths presented as redirect destinations.
- **Fix**: Require a nonempty string Location before resolving and validating it. Otherwise retain the unavailable/unsafe diagnostic without suggesting an invented destination.
- **Verification**: Add null, undefined and empty-header cases to the redirect regression; real relative redirects must still resolve, unsafe credentialed targets must stay undisclosed, and no second request may dispatch automatically.
- **Prevention**: Validate optional HTTP metadata before URL-constructor coercion.

Final independent focused verification: **21/21 passed**, combining 12 live-pilot repair tests with 9 retained audit-repair regressions. The final redirect guard accepts only nonempty string headers; null, undefined, empty and whitespace-only headers retain the unavailable/unsafe diagnostic. All five second-review findings are closed. Full-suite and fresh-client live-pilot evidence remain with the primary reviewer; these synthetic checks do not establish commercial yield or universal containment.

CI follow-up: Windows runner TEMP used an 8.3 alias while the helper returned its canonical full path. The test now resolves both paths before comparing identity. No containment behavior was weakened. Linux CI passed on the original patch; the corrected assertion and full matrix are rerun on the follow-up commit. The first two pilot processes were stopped during setup and retained as interrupted artifacts; fresh sessions will use the follow-up commit.
