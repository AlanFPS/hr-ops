# Code Review: HR-Ops transformation and audit repairs

**Repair status (2026-09-29)**: All findings in this historical review and its second pass have been addressed. See [the repair record and verification results](hr-ops-mvp-review-fixes.md). The original findings below are retained as audit history.

**Reviewed Files**: The working-tree transformation against `5c97c24e092871cd6374c2122ee7f021d69d3d6e`, including staged additions and unstaged repairs: `hr-ops.mjs`; all five `lib/hr-ops/*.mjs` modules; all `tests/hr-ops/*.mjs`; shared HR skill, client wrappers/manifests and `modes/hr-ops/`; root instructions, README, data/architecture/Codex/OpenClaw/provenance/validation/repair documentation; changed GitHub workflows; `package.json`, `web/package.json`, `web/package-lock.json`; `test-all.mjs`, `lib/mjs-files.mjs`, `update-system.mjs`, `updater-migration-tests.mjs`, `.gitignore`, `.hr-ops-fork.json` and attribution metadata. Also inspected the reused provider, locking and atomic-write interfaces. This is a change-focused review, not a fresh line-by-line audit of every retained legacy subsystem.

**Review Date**: 2026-09-28 (America/Buenos_Aires)

**Severity Summary**: 0 Critical, 2 High, 7 Minor, 0 Nit

**Second-pass result**: The [independent review](hr-ops-mvp-02-code-review.md) confirmed these nine findings and added M8 (YAML initialization) and M9 (calendar validation). The combined, deduplicated total is **0 Critical, 2 High, 9 Minor, 0 Nit**.

**Method**: Applied `~/.cursor/commands/audit.md`: correctness, security boundaries, runtime validation, concurrency, performance and architecture. Every finding below was reproduced locally using synthetic data. No production prospect was edited and no external communication occurred. The required independent second pass is recorded separately in `hr-ops-mvp-02-code-review.md`.

## Critical Issues

None confirmed. Approval JSON is explicitly documented as an audit record rather than a security boundary; the absence of cryptographic approval enforcement is not mislabeled as a new MVP vulnerability. There is no sending or external CRM write implementation.

## High Priority Issues

### H1 — Collection-only openings can qualify a prospect and support actionable drafts

- **Location**: `lib/hr-ops/model.mjs:601`; collection metadata at `lib/hr-ops/model.mjs:452`.
- **Severity**: HIGH
- **Problem**: Collection sets `reviewed: false`, but scoring never checks that flag. A prospect with previously researched firm facts and contacts can regain qualifying demand solely from title-classified scanner rows, before the instructed role review. All downstream eligibility gates trust this score. The repair preserves reviewed rows but does not enforce the review boundary for newly collected rows.
- **Example**:
  ```js
  const openings = p.openings.filter(o =>
    o.status === 'open' &&
    c.icps[p.icp].role_families.includes(o.role_family) && /* freshness etc. */
  ); // no check of o.reviewed
  ```
  An isolated record with only `reviewed: false` openings scored 90, became `OUTREACH_READY`, and returned `draftCurrent: true` after draft saving.
- **Fix**: Exclude explicitly unreviewed observations from qualifying demand and outreach-supporting openings. Preserve the documented legacy-row policy deliberately (`reviewed !== false`, or an explicit migration), while requiring new collected roles to pass research before contributing. Expose unreviewed demand as a research task, not qualification evidence.
- **Verification**: Discover a new backend/full-stack role on an otherwise researched prospect. Confirm collection alone cannot qualify or authorize a current draft; explicit reviewed research can. Cover a returning prospect whose prior reviewed vacancies expired.
- **Prevention**: Test the complete collection → scoring → draft eligibility path, including every provenance flag; current scanner tests assert counts without asserting the review gate.

### H2 — Concurrent report publication can remove a newer hold warning

- **Location**: `hr-ops.mjs:103`, `hr-ops.mjs:331`; transaction boundary in `lib/hr-ops/store.mjs:187`.
- **Severity**: HIGH
- **Problem**: Canonical mutations are locked, but Markdown publication occurs after releasing the lock using the returned snapshot. Writer A can commit, writer B can then record a hold/opt-out and publish its warning, and A can finally overwrite the report with its older actionable draft. Atomic rename prevents torn files but not out-of-order versions. The human-facing handoff becomes unsafe even though canonical JSON remains correct.
- **Example**:
  ```js
  result = await repo.update(/* ... */); // transaction releases lock
  // another process may commit and publish here
  publish(repo, result.prospect, c);     // uses old state
  ```
  A deterministic scheduling probe left canonical revision 5 with `hold: true`, while its saved Markdown had no `DO NOT CONTACT` warning and displayed `actionable: true`.
- **Fix**: Serialize publication with canonical updates using the same workspace lock. Reload the latest record under that lock before rendering/writing, or publish within the transaction. A revision check outside the lock is insufficient. Include the rendered revision in reports and retain the current report-failure warning behavior.
- **Verification**: Force A to pause after commit; let B apply hold/opt-out; resume A. The final saved report must reflect B or a later revision and must never restore actionability. Repeat with multiple processes.
- **Prevention**: Cover derived artifacts in concurrency tests; creation deduplication and JSON revision tests alone do not exercise this race.

## Minor Issues

### M1 — Provider dry runs omit persisted validation and failures can leave a new record

- **Location**: `lib/hr-ops/discovery.mjs:125`; persisted opening checks in `lib/hr-ops/validation.mjs:156`.
- **Severity**: MINOR
- **Problem**: Preview calls `collect(proposed)` without the full `validateProspect` used on a real update. A validly formatted but future `posted_at` passes preview, while real execution first creates the company and then fails its update. This contradicts the documented dry-run parity and no-write-on-invalid-prospect guarantees. The leftover record contains only the discovery identity; researched data is not lost.
- **Example**:
  ```js
  collect(proposed); // no validateProspect(proposed, now)
  const found = await repo.discover(identity, { now });
  prospect = (await repo.update(found.prospect.id, 'collect-openings', collect, options)).prospect;
  ```
  A Greenhouse fixture with `first_published: '2099-01-01T12:00:00Z'` returned one successful dry-run prospect. Real execution reported a future-timestamp error but retained one `DISCOVERED` record at revision 1.
- **Fix**: Run the same full validation on the prospective record before either creation or update. Prefer a single locked discover-and-collect operation so validation and revision failures cannot leave a half-completed prospect operation. Decide explicitly whether future publication dates should be rejected or retained as anomalous non-verification metadata.
- **Verification**: Compare dry-run and real outcomes for future publication dates, malformed optional opening fields and concurrent updates. Invalid input must not create a prospect under the stated contract.
- **Prevention**: Share a prepare/validate/commit path rather than duplicating a lighter preview path; include optional provider fields in failure fixtures.

### M2 — Follow-up drafts need no prior contact with their selected recipient

- **Location**: `lib/hr-ops/operations.mjs:51`, `lib/hr-ops/operations.mjs:225`.
- **Severity**: MINOR
- **Problem**: Scheduling is prospect-wide, and draft saving independently accepts any relevant contact at that company. After messaging person A, the system accepts a current follow-up addressed to previously uncontacted person B. This can lead to misleading continuation language and incorrect use of contact history. Human review and the no-send boundary limit the impact.
- **Example**:
  ```js
  if (purpose === 'followup' && !followupScheduled(p, c)) /* reject */;
  const person = rankedContacts(p, c, now).find(x => x.id === input.contact_id && /* ... */);
  // no association with a recorded sent interaction
  ```
  The probe saved an eligible follow-up with a different contact ID from the only sent event.
- **Fix**: Bind follow-up drafts to a prior sent interaction/conversation and verify the recipient. Model a deliberate handoff to another contact separately, rather than silently inheriting the first person's cadence and message.
- **Verification**: With two relevant contacts and only A contacted, reject a routine follow-up to B; accept a continuation to A. Test explicit authorized handoffs if supported.
- **Prevention**: Add multi-contact fixtures; current tests mostly exercise one decision maker per company.

### M3 — Backdated replies can erase a later contact's reminder

- **Location**: `lib/hr-ops/operations.mjs:481`.
- **Severity**: MINOR
- **Problem**: A reply requires any sent event but is not checked against its timestamp. Recording a reply older than all contact history changes `CONTACTED` to `REPLIED` and clears the current reminder. Sent events have a chronology guard; replies do not. Late entry of historical information can therefore change current workflow incorrectly.
- **Example**:
  ```js
  assert(p.interactions.some(x => x.kind === 'sent'), 'Reply requires prior contact');
  if (p.status === 'CONTACTED') p.status = 'REPLIED';
  p.next_followup = null;
  ```
  A September 24 reply entered after a September 25 sent event removed the September 30 reminder.
- **Fix**: Link replies to the relevant prior interaction and enforce temporal consistency. Reject impossible history or provide an explicit historical-correction path that recomputes state chronologically without clearing newer unrelated reminders.
- **Verification**: Cover replies before first contact, delayed entry after a newer sent event, and valid replies that should stop the relevant cadence.
- **Prevention**: Define temporal invariants for every lifecycle event, not only `sent`.

### M4 — Evidence equality depends on JSON property order

- **Location**: `lib/hr-ops/model.mjs:395`.
- **Severity**: MINOR
- **Problem**: Immutable evidence is compared with ordinary `JSON.stringify`. A semantically identical source object reserialized with reordered fields is rejected as a mutation. This unnecessarily breaks research imports and encourages duplicate evidence IDs.
- **Example**:
  ```js
  JSON.stringify(byId.get(e.id)) === JSON.stringify(e)
  ```
  Reversing the property order of the existing `site` evidence produced `Evidence site is immutable; use a new ID` without changing any value.
- **Fix**: Compare canonicalized validated evidence objects using the existing `canonical` helper. Keep meaningful excerpt, URL, source-type and observation-time changes immutable.
- **Verification**: Reordered identical evidence is accepted; changed text or retrieval time under the same ID is still rejected.
- **Prevention**: Apply consistent structural identity rules to evidence as well as drafts and interaction retries.

### M5 — Repository API permits aliases already owned by another prospect

- **Location**: `lib/hr-ops/operations.mjs:531`, `lib/hr-ops/store.mjs:187`; CLI-only protection in `hr-ops.mjs`'s `record` branch.
- **Severity**: MINOR
- **Problem**: The CLI checks cross-prospect alias ownership, but the documented repository API does not. `repo.update(... recordInteraction(... kind: 'alias'))` can assign an existing company's domain to a second record. Both remain structurally valid, domain selection becomes ambiguous, and rediscovery chooses the first matching record. This undermines the reusable adapter contract.
- **Example**:
  ```js
  if (!p.domains.includes(alias)) p.domains.push(alias);
  // LocalRepository.update validates each record, not cross-record ownership.
  ```
  The API probe assigned `other.example` to both records; `repo.get('other.example')` then failed as ambiguous.
- **Fix**: Enforce domain uniqueness inside the repository transaction for every write that changes domains. Keep the CLI's useful error but do not make it the only invariant check. Detect pre-existing collisions in doctor and require a reviewed merge to resolve them.
- **Verification**: Run the collision case through both CLI and repository API and assert unchanged records/revisions. Test racing alias assignments.
- **Prevention**: Put persistence invariants in the repository layer and run shared adapter conformance tests.

### M6 — Owner/partner tokens still overstate contact authority

- **Location**: `lib/hr-ops/model.mjs:537`.
- **Severity**: MINOR
- **Problem**: Bare `owner` and `partner` tokens classify Product Owners and HR Business Partners as executives. Conversely, blanket rejection of `assistant` excludes Assistant Vice Presidents. The stated authority explanations are stronger than these titles support; irrelevant contacts can receive access points and draft eligibility.
- **Example**:
  ```js
  const assistant = /\b(assistant|coordinator|intern)\b/.test(title);
  const executive = /\b(founder|partner|owner|ceo|chief executive)\b/.test(title);
  ```
  The probe labeled Product Owner and HR Business Partner `decision-maker`; Assistant Vice President of Engineering was `other`.
- **Fix**: Match whole role patterns and context: distinguish business ownership/managing partnerships from product ownership or HR partner roles, and assistant-to relationships from executive rank modifiers. Keep uncertain authority explicitly unestablished or permit an evidence-backed role override.
- **Verification**: Add startup and agency title matrices covering these examples, genuine owners/managing partners and executive assistants.
- **Prevention**: Expand false-positive and false-negative tests whenever changing title heuristics; do not equate a keyword with verified authority.

### M7 — CLI acceptance test expires with the calendar

- **Location**: `tests/hr-ops/integration.test.mjs:37`; fixed evidence clock in `tests/hr-ops/fixtures.mjs:2`.
- **Severity**: MINOR
- **Problem**: The CLI subprocess uses real wall-clock time but imports September 25, 2026 fixture evidence and expects qualification. Once its 30-day freshness window expires, healthy production behavior breaks CI. This is a test defect, not a production freshness defect.
- **Example**:
  ```js
  export const now = new Date('2026-09-25T12:00:00Z');
  // CLI integration spawns the real CLI, then expects CONTACT_IDENTIFIED.
  ```
  With a test-only clock advanced to November 1, the same suite produced 52 passes and one failure: `RESEARCHING` instead of `CONTACT_IDENTIFIED`.
- **Fix**: Generate CLI integration evidence relative to the subprocess execution date, or inject a consistent test clock into both parent and child. Preserve fixed clocks for explicit expiry tests. Do not loosen production freshness validation.
- **Verification**: Run unchanged tests under current, November 2026 and later test clocks; all acceptance tests should pass, while targeted expiration tests still reject stale evidence.
- **Prevention**: Keep fixture clocks and process clocks aligned and include a future-clock test job or equivalent deterministic clock abstraction.

## Nits

None reported; the review prioritizes behavioral defects over formatting preferences.

## Summary

The local shared-skill architecture, preserved upstream provenance, no-send boundary, canonical JSON locking, revision checks and explicit unknowns remain sound choices. No deletions of retained Career-Ops functionality were found. The recent repairs improved the system, but the green regression suite did not cover the cross-path failures above. Prioritize the review gate and report publication race before treating prepared dossiers as reliable handoffs.

Fresh checks in this review: **53/53 HR tests passed**, actionlint clean, `git diff HEAD --check` clean; eight isolated behavior probes reproduced H1/H2 and M1–M6. A ninth, future-clock probe reproduced M7. Reproduction scripts and outputs are retained under ignored `local/cursor-audit/` (`probes.mjs`, `probe-results.json`, `hr-tests.log`, `future-clock.mjs`, `future-tests.log`). They use isolated fictional records and do not send anything.

The immediately preceding repair's retained logs show 9,248 core checks passed with 10 existing warnings, 584 web tests passed with 8 skipped, web typecheck/build passed, 763 syntax checks passed, and zero runtime dependency advisories at that run. Those lengthy suites were **not rerun in this audit**; they are supporting prior evidence, not new results. No source repair was made during this audit.

Performance review found repeated full-pipeline reads and full-history snapshot validation. A small local synthetic benchmark with 30 revisions per company produced approximately 452 KB per record; listing 50 companies took 418 ms and fetching one by ID took 304 ms because it reads the entire pipeline. This documents the current cost without claiming a production capacity limit; results and harness are in `local/cursor-audit/performance.json` and `performance.mjs`. The documented snapshot storage tradeoff remains appropriate to monitor as evidence/history grows.

Doctor passed, and SHA-256 checks confirmed all ten real prospect files remain unchanged from the repair baseline. Live commercial fit, natural-language research quality, independent approval enforcement for a future runtime, and end-to-end operation by an installed autonomous client remain outside deterministic test coverage.
