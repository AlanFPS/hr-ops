# Code Review: Audited HR-Ops local edition and repair verification

**Review Date**: 2026-10-14 (local workspace date)

**Baseline**: `682f4c946e0bb9bee201174f9ea195ded4a65d81`, branch `hr-ops-mvp`. Reviewed the local-edition changes after `452567a8`, then repaired confirmed defects in the working tree. This report does not claim a new committed release or fresh live client acceptance.

**Severity Summary**: 0 Critical, 4 High, 7 Minor, 1 Nit. All confirmed findings below are fixed. Independent review and closure evidence are in `hr-ops-mvp-10-code-review.md`.

**Reviewed Files**: `hr-ops.mjs`; `lib/hr-ops/{model,validation,store,operations,conversations,discovery,sources,research-run,maintenance}.mjs`; Greenhouse, Ashby and Lever providers; HR tests, fixtures and client acceptance artifacts; package manifest and lockfile; system-file coverage; HR and retained CI workflows; shared skill, client instructions, modes and operating documentation. Retained Career-Ops behavior was regression-tested, not exhaustively re-audited as a separate product.

## High priority issues

### H1. Backup path prefix checks allowed writes outside the declared data scope

- **Location**: `lib/hr-ops/maintenance.mjs`, `verifyBackup` and `restore`.
- **Problem**: A lexical allowlist followed by root containment did not enforce containment within the declared data subdirectory.
- **Example**: `data/hr-ops/../../.agents/hook.mjs` passed the `data/hr-ops/` prefix check while resolving to a workspace instruction/script location inside the new restore root.
- **Fix**: Reject noncanonical segments, separators, drive syntax and case-insensitive duplicate paths. Exact profile/custom files cannot have descendants. Validate the manifest file itself through the link-aware path guard.
- **Verification**: A checksummed synthetic manifest with that path now fails both verification and restore before the destination directory exists.
- **Prevention**: Validate canonical relative paths before allowlisting, and retain traversal and alias regression cases. Checksums detect damage; they do not establish trust.

### H2. Ambiguous posting identities could manufacture qualification

- **Location**: `lib/hr-ops/model.mjs`, `scoreProspect`. This closes the remaining part of the earlier review08 H2.
- **Problem**: The scorer warned about possible duplicates but still awarded full multiple-vacancy credit. Different posting IDs do not prove different hires.
- **Example**: Two reviewed Backend Engineer postings with different posting IDs and no distinct requisition evidence changed a synthetic prospect from 58/PROVISIONAL to 73/QUALIFIED. A differently titled known alias inside one duplicate group could also trigger the bonus without increasing the number of hires.
- **Fix**: Retain the separate records and uncertainty gap. Award the bonus only when two groups have supported distinction across every alias pair, using distinct role titles, supported distinct requisitions on the same board, or reviewed distinct groups. Explicitly distinct identities clear duplicate warnings. Known aliases cannot manufacture distinction.
- **Verification**: Tests cover the threshold crossing, same-requisition collapse, distinct reviewed groups, known-alias invariance and a genuinely independent role alongside ambiguous postings. The independent reviewer reproduced and then verified both failure paths.
- **Prevention**: Keep ambiguity visible in counts and test scoring invariants, especially that adding a known duplicate cannot increase demand credit. Agents must still review the semantic truth of role/requisition evidence.

### H3. Recovery export included conflicting identities as healthy records

- **Location**: `lib/hr-ops/maintenance.mjs`, `diagnostics`.
- **Problem**: Both records sharing a domain remained in the healthy-record export, even though normal repository reads rejected them.
- **Example**: Two valid records claimed `one.example`; the recovery response listed both under healthy records and only reported one participant as faulty.
- **Fix**: Enumerate every conflicting participant and exclude all of them from the explicitly partial healthy export. Preserve unrelated healthy records without choosing an arbitrary identity winner.
- **Verification**: A three-record fixture with two conflicting owners exports only the independent record and reports both conflicts. Normal reads remain fail-closed.
- **Prevention**: Apply cross-record invariants to recovery output as well as ordinary reads. Never replace operating data from a partial export without reconciliation.

### H4. Interrupted migration resumed without its verified recovery baseline

- **Location**: `lib/hr-ops/maintenance.mjs`, `migrate`; `lib/hr-ops/store.mjs`, `migrationState`.
- **Problem**: Resume trusted the journal's backup string and could replace its complete ID set with only the records still pending.
- **Example**: An applying journal pointed to a missing backup. Resume could continue writes; after partial progress, the journal could lose the already-migrated record IDs.
- **Fix**: Validate journal structure, verify the original backup before resuming, require every journaled record to remain present and reject unexpected pending records. Preserve the full original ID set and backup reference through completion.
- **Verification**: Missing backup and missing-record cases fail without changing records. A partial two-record migration resumes, retains both IDs and the original backup, then repeats as a no-op.
- **Prevention**: Treat recovery prerequisites as invariants before writes, and test interrupted states explicitly.

## Minor issues

### M1. Research ledger lifecycle and linked metadata were insufficiently validated

- **Location**: `lib/hr-ops/research-run.mjs`, `researchBudget` and `updateRun`.
- **Problem**: Attempt/budget validation omitted status, timestamps and linked identity arrays.
- **Example**: `status: "completed"`, `prospect_ids: "abc"` or duplicate malformed capture identifiers could reach resume/report behavior.
- **Fix**: Validate known ledger keys, active/complete status, timestamps and unique well-formed IDs. Validate new linkage input before creating or changing a ledger. Older ledgers may still omit additive metadata.
- **Verification**: Regression cases reject invalid status, dates, IDs and duplicates. Invalid linkage leaves no new ledger behind. The older linkage test now uses a real discovered ID instead of the placeholder `one`.
- **Prevention**: Validate persisted and incoming representations at the same boundary; use realistic identities in fixtures.

### M2. Doctor stopped at the first ledger failure and missed interrupted migration

- **Location**: `hr-ops.mjs`, doctor command.
- **Problem**: One corrupt ledger threw before a complete report could be returned, and an applying migration journal could still look healthy.
- **Example**: Two malformed ledgers plus an interrupted migration did not produce the three actionable failures together.
- **Fix**: Aggregate record, ledger and journal errors in structured output, set `partial`, and exit nonzero when unhealthy.
- **Verification**: The combined fixture reports all three errors. The previous stderr-only test now checks the structured stdout error and unchanged failure exit code.
- **Prevention**: Keep diagnostic paths exhaustive while preserving fail-closed operating writes.

### M3. Contact relevance was presented as verified supplier authority

- **Location**: `lib/hr-ops/model.mjs`, `rankedContacts` and access scoring.
- **Problem**: A senior title alone returned `authority_level: confirmed`. Reading an old authority announcement today could renew that authority despite its publication age.
- **Example**: An evidenced CTO role had confirmed supplier authority without supplier-remit evidence; a 2025 announcement fetched in September 2026 could also appear current.
- **Fix**: Leave authority unverified unless supported by current observed evidence. Apply publication freshness as well as retrieval freshness. Keep functional contact access as a separate role heuristic; secondary contacts receive partial access unless current evidence supports authority.
- **Verification**: Tests distinguish current CTO relevance from buying authority and reject stale authority evidence for a commercial contact.
- **Prevention**: Keep role relevance and verified commercial remit separate in labels, evidence and scoring explanations.

### M4. Late-entered history could replace a newer reminder schedule

- **Location**: `lib/hr-ops/conversations.mjs`.
- **Problem**: Reminder overrides were selected in append order rather than event occurrence order.
- **Example**: A September 24 override for October 5 was replaced by a later-entered September 21 message carrying a September 26 reminder.
- **Fix**: Select overrides and reply cancellation in event chronology, retaining append order only as the equal-time tiebreaker. Do not rewrite event history.
- **Verification**: A historical send and reply cannot replace/cancel the later explicit schedule. Existing cross-channel and late-reply tests remain passing.
- **Prevention**: Test event-time and recording-time differences explicitly for every derived interaction view.

### M5. Backup included stale-lock recovery guards

- **Location**: `lib/hr-ops/maintenance.mjs`, transient path filtering.
- **Problem**: `workspace.lock` was excluded, but its sibling recovery guard was not.
- **Example**: `workspace.lock.recover/owner.json` could be copied into a new operating root and interfere with subsequent lock recovery.
- **Fix**: Exclude both lock directories during inventory and skip them when restoring older manifests.
- **Verification**: A synthetic recovery guard is absent from the verified backup manifest.
- **Prevention**: Keep temporary lock lifecycle artifacts out of the durable data contract.

### M6. Restore did not validate the migration journal or state write readiness

- **Location**: `lib/hr-ops/maintenance.mjs`, `restore`.
- **Problem**: Restore could report success while ordinary writes immediately failed on an invalid migration status.
- **Example**: A checksummed backup containing `{status: "broken", backup: "missing", ids: []}` restored without a journal validation error.
- **Fix**: Validate the restored journal. Return explicit `writable`, `migration_status` and `migration_needed` for valid interrupted or older-schema data. Invalid copies remain isolated for diagnosis.
- **Verification**: Tests reject malformed journals, report nonwritable pending/legacy data and confirm current complete data is writable.
- **Prevention**: Recovery completion must report operational readiness separately from copying valid bytes.

### M7. Ordinary reads accepted record links rejected by diagnostics

- **Location**: `lib/hr-ops/store.mjs`, `LocalRepository.list`.
- **Problem**: The recovery path rejected symbolic record files, but normal reads and updates followed them.
- **Example**: A correctly named record symlink could refer to an external JSON file and pass the normal operating path despite doctor reporting it invalid.
- **Fix**: Reject per-record symbolic links before reading, matching diagnostics. This does not prohibit a configured data-root location.
- **Verification**: On this Windows host, a real file symlink was created successfully; reads and discovery writes rejected it, and the target remained unchanged. No symlink test was skipped.
- **Prevention**: Share fail-closed record invariants across diagnostics and ordinary operations. Filesystem access by an agent is still not a security sandbox.

## Nit

### N1. Size-range documentation contradicted the implemented contract

- **Location**: `docs/HR_OPS.md`, count/range payload guidance.
- **Problem**: Documentation said counts were integers only after sourced ranges had been added.
- **Example**: A valid `[10, 25]` employee or recruiter range appeared forbidden by the prose.
- **Fix**: Document integers or sourced inclusive ranges and preserve the employee/recruiter distinction.
- **Verification**: Reviewed against current validation and range regression tests. Updated local-edition guidance for all repaired behavior.
- **Prevention**: Review payload documentation whenever accepted schema forms change.

## Verification and limits

- HR suite: 142/142 tests passing, zero skips, on Node v24.21.0 and Windows. Includes 15 focused audit regression cases.
- Independent second review: 40/40 focused checks passing, including the repaired identity and restore edge cases.
- System manifest: 1,539 tracked files covered. New files in this repair are tests/review reports covered by the corresponding directory rules; untracked files are not included in that tracked-file count.
- Operating doctor: healthy, 10 prospects, no migration needed, no source errors, email still unconfigured. No operating prospect records or user configuration were changed by this audit.
- Integrity comparison against the pre-audit backup at revision `682f4c94`: all 14 backed-up HR data/configuration/preference files have unchanged SHA-256 hashes; the operating prospect count remains 10. Receipt: `local/edition-audit-data-integrity.json`.
- Broad quick suite: 9,272 checks passed, zero failures, 10 warnings. Warnings comprise one missing legacy CV-data check, six retained upstream-name attribution matches, one unavailable comma-decimal locale (static half ran), and two intentionally opt-in H1B live API/token tests. No warnings were suppressed or converted to passes. Provider and walker regressions are included in this suite; the audit tests passed again within it.
- Detailed command logs are under ignored `local/edition-audit-*`. The first concurrent syntax run captured a temporary legacy-test checkout that was deleted during checking, causing 323 missing-module failures. Its failed log is preserved as `edition-audit-syntax.log`; syntax was rerun after the broad suite stopped creating temporary fixtures. This was a harness overlap, not 323 invalid source files.
- Final standalone syntax validation: all 779 `.mjs` files passed. `git diff --check` passed. Neither the Linux CI matrix nor fresh Codex/Claude live discovery was rerun in this local audit.
- Synthetic recovery tests verify backup, isolated restore, migration resume and failure handling. This audit did not rerun both live client discovery sessions or send messages, record fictional operating interactions, commit or push.
- Native agent research semantics, independent runtime permissions, commercial calibration, business email and protected disaster recovery remain operating considerations. Passing these checks is not universal prompt-injection resistance or production certification.
