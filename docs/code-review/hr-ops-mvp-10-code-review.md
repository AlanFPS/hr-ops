# Code Review: Independent local-edition second review

**Reviewed Files**: `lib/hr-ops/model.mjs`, `lib/hr-ops/discovery.mjs`, `lib/hr-ops/sources.mjs`, `lib/hr-ops/operations.mjs`, `lib/hr-ops/conversations.mjs`, `lib/hr-ops/validation.mjs`, relevant `lib/hr-ops/store.mjs` paths, `hr-ops.mjs`, `providers/greenhouse.mjs`, `providers/ashby.mjs`, `providers/lever.mjs`, `tests/hr-ops/local-edition.test.mjs`, `tests/hr-ops/fixtures.mjs`, `.github/workflows/hr.yml`, `.github/workflows/test.yml`, `.github/copilot-instructions.md`, `package.json`, `docs/HR_OPS.md`, `docs/HR_OPS_LOCAL_EDITION.md`.

**Review Date**: 2026-10-14

**Severity Summary**: 0 remaining Critical, High, Minor or Nit findings in this review's scope. The resolved follow-ups below document 1 High (existing review08 H2), 1 Minor and 1 Nit.

Scope: independent second review required by the user-invoked `~/.cursor/commands/audit.md`, primarily the changes from `452567a8` to `682f4c94`. The primary reviewer concurrently owns fixes for backup containment, recovery alias collisions, ledger metadata, contact authority labels, migration recovery and reminder chronology. This report does not independently certify those repairs beyond the closure checks documented below. No implementation or operating data was edited by this reviewer.

## Critical Issues

None additionally confirmed within this review's scope.

## High Priority Issues

None additionally confirmed within this review's scope.

## Minor Issues

None additionally confirmed within this review's scope.

## Nits

### N1. Research documentation still excludes supported count ranges

- **Location**: `docs/HR_OPS.md:136`; compare `lib/hr-ops/model.mjs:412` and the admission section of `docs/HR_OPS_LOCAL_EDITION.md`.
- **Severity**: NIT.
- **Problem**: The main payload documentation says counts must be integers and approximate ranges belong in `company_size`, although schema 2 deliberately supports sourced inclusive ranges in `employee_count` and `recruiter_count`. Following the old instruction loses structured evidence used by the new scoring logic.
- **Example**: `employee_count: {value: [40, 80], confidence: "observed", evidence: ["site"]}` is supported, but the main documentation redirects this information to a text field.
- **Fix**: Explain that these two count fields accept a nonnegative integer or inclusive `[min,max]` range; reserve `company_size` for qualitative context. Preserve explicit unknowns when neither is evidenced.
- **Verification**: Compare the updated sentence with `validateFact()` and the passing size-range regression in `tests/hr-ops/local-edition.test.mjs`.
- **Prevention**: Include the primary payload reference whenever a schema change updates supplemental release documentation.

## Summary

No additional production defect was confirmed beyond the primary reviewer's separately assigned areas. Per-opening scope gates, monotonic provisional admission, explicit requisition/group deduplication, retained provider descriptions, complete-versus-partial disappearance handling, per-contact reply binding, draft quality/intent requirements and the dedicated CI triggers match the documented contracts examined here. Title heuristics, source interpretation and the semantic truth of outreach remain operator responsibilities as documented.

The independent focused run using Node 24.21.0 passed all **25 tests** in `tests/hr-ops/local-edition.test.mjs`. An earlier run exposed a test fixture still linking placeholder ID `abc` after the primary reviewer's new ledger validation. The primary reviewer replaced it with a discovered prospect ID, and the rerun passed. That resolved fixture mismatch is not counted as another product finding. No network request or real prospect mutation was performed by this review.

Broader regression runs and final verification of the concurrent primary repairs remain the primary reviewer's responsibility. This report is a scoped review, not a production-readiness certification.

## Repair-review addendum

The primary reviewer subsequently requested independent inspection of the pending repair diff, including backup containment, conflict recovery, migration journals, ledger validation, doctor diagnostics, authority evidence and reminder chronology. Reviewed the implementation diff and ran `tests/hr-ops/local-edition-audit.test.mjs` together with `tests/hr-ops/local-edition.test.mjs`: **35/35 passed** using Node 24.21.0.

The manifest path rejection, exclusion of every alias-conflict participant, optional legacy ledger metadata, title-versus-authority distinction and chronological override selection match their intended fixes. Ordinary old ledgers remain accepted because the new metadata fields are optional. No additional compatibility defect was confirmed in these areas. One remaining restore integration defect was independently reproduced:

### M1. Restore success omits migration-journal validation

- **Location**: `lib/hr-ops/maintenance.mjs`, `restore()`, immediately after constructing `restoredRepo` and before returning `restored: true`.
- **Severity**: MINOR.
- **Problem**: The new canonical journal validation is used by doctor, writes and migration, but restore only checks configuration, research ledgers and prospect records. A checksum-valid backup with an invalid migration journal is therefore reported successfully restored even though normal writes immediately fail. This undermines the restore validation result; the isolated copy itself remains preserved.
- **Example**: In a synthetic initialized root, save `migration-v2.json` as `{"status":"broken","backup":"missing","ids":[]}`, create a backup and restore it into an absent directory. The independently executed probe returned `{"restored":true,"writeError":"Invalid migration status"}` when `assertWritable()` was called on the restored repository. All files were temporary and removed afterward.
- **Fix**: Run `migrationState(restoredRepo)` before reporting restore success. An invalid journal must fail validation; a valid interrupted journal should either be explicitly reported as requiring migration recovery or rejected as not ready for use. Do not silently suggest that an interrupted restore is immediately writable.
- **Verification**: Add restore regressions for malformed, valid complete and valid applying migration journals. Check that malformed journals cannot yield an unqualified successful restore and that healthy restores remain writable.
- **Prevention**: Share operational-state validation across doctor and restore, or keep a regression matrix covering every metadata file that can block ordinary writes.

The finding was sent to the primary reviewer before finalization so it can be repaired and retested. No source or operating data was edited by the second reviewer.

### H2 follow-up. Unresolved posting identities still earn the multiple-vacancy bonus

- **Location**: `lib/hr-ops/model.mjs`, `scoreProspect()`, creation of opening groups, `levels.demand` and `duplicate_candidates`.
- **Severity**: HIGH, incomplete closure of review08 H2.
- **Problem**: Explicit requisition/group deduplication works, but different posting IDs with the same title remain ambiguous. The scorer reports both as duplicate candidates while still granting full multi-vacancy demand. The accepted H2 fix calls for distinct verified requisitions; separate posting identities are insufficient to establish separate hires. This can change the qualification tier, not merely the displayed count.
- **Example**: An independent in-memory probe used two reviewed `Backend Engineer` postings on one board, posting IDs `1` and `2`, Argentina/Colombia locations and separate URLs, without requisition IDs or reviewed groups. The cited source explicitly described one vacancy advertised in multiple locations. Employee count and recruiting pain remained unknown. With one posting the score was **58**, coverage **65**, tier **PROVISIONAL**. Adding the second yielded **73**, coverage **65**, tier **QUALIFIED**, with both records present in `duplicate_candidates`.
- **Fix**: Preserve the records and their uncertain identity. Withhold the multiple-vacancy bonus if it depends entirely on an unresolved duplicate-candidate cluster. Permit distinct supported requisition identities or explicit reviewed evidence of separate vacancies to resolve that uncertainty. Do not equate matching titles with duplicates or automatically merge them.
- **Verification**: Cover the one-vacancy/multiple-posting example, two genuinely distinct same-title requisitions, explicit reviewed groups and an unresolved cluster alongside an independently established second vacancy.
- **Prevention**: Distinguish posting count, verified vacancy count and count uncertainty in the scoring contract and regression fixtures.

This issue was reconsidered at the primary reviewer's explicit request after comparing the implementation to review08's accepted H2 remediation. The earlier assessment correctly found the implemented requisition grouping functional, but was too broad in describing H2 as closed. The additional probe demonstrates the remaining ambiguity path.

### Closure check after the first follow-up fixes

The restore fix now validates migration metadata and explicitly returns `writable`, `migration_status` and `migration_needed`. Malformed journals fail, valid applying journals remain visibly non-writable, and current healthy restores report writable. **M1 is closed.** Ordinary repository reads now also reject per-record links, consistently with diagnostics. The focused suite passed **39/39** tests, including migration resume, journal restore and actual link rejection on this host.

The first H2 follow-up fix withholds the bonus for two ambiguous same-title postings and preserves explicit distinct requisitions/groups. One independently reproduced edge remained: group A contains `Backend Engineer`, and ungrouped posting B also has that title. Adding a known duplicate alias to A with title `Full-stack Engineer` raises demand from half to full, despite preserving the same two opening groups and the same unresolved duplicate candidates. The score changes from 58/PROVISIONAL to 73/QUALIFIED. The `group.some(a => other.some(...))` comparison accepts any differing alias title as evidence of a second vacancy. Group-level distinction must remain conservative across all aliases, or use explicit reviewed group-level identity evidence. Adding a known duplicate must not increase distinct-demand credit. This case was sent to the primary reviewer; H2 remains open until verified against it.

### Final closure verification

The final demand comparison requires distinction across every cross-group alias pair. The added regression verifies that a known duplicate alias does not raise demand credit, while a separately established different role still earns the multi-vacancy bonus. Explicit different requisitions and reviewed groups retain their credit, and shared requisitions still collapse to one group. **H2 is closed for the confirmed ambiguity paths.** Title-based distinction remains a heuristic requiring researcher judgment, not proof that every differently worded posting represents a separate hire.

The primary payload documentation now correctly describes integer or sourced inclusive count ranges. **N1 is closed.** Together with the verified restore repair, no findings from this second review remain open.

Final independent targeted run: **40/40 passed**, comprising 15 audit-repair tests and 25 local-edition tests, using Node 24.21.0. This includes the new grouped-alias regression, migration resume, restore readiness and record-link rejection. The reviewer edited only this report; broader retained checks, full HR validation and final operating readiness remain with the primary reviewer.
