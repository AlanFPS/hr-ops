# Code Review: Independent HR-Ops second pass

**Repair status (2026-09-29)**: All combined findings have been addressed. See [the repair record and verification results](hr-ops-mvp-review-fixes.md). The original independent findings below are retained as audit history.

**Reviewed Files**: `hr-ops.mjs`, all five `lib/hr-ops/*.mjs` modules, `tests/hr-ops/fixtures.mjs`, shared HR skill and client wrapper references, `docs/HR_OPS.md`, changed portions of `.github/workflows/test.yml`, `.github/workflows/no-user-data.yml`, `.gitignore`, `test-all.mjs`, `lib/mjs-files.mjs`, `update-system.mjs`; reused `pipeline-lock.mjs` interface; first-pass report and its isolated reproductions. This independent second pass concentrated on the new domain implementation, validation and persistence boundaries; it does not claim a new line-by-line review of every retained Career-Ops subsystem.

**Review Date**: 2026-09-28 (America/Buenos_Aires)

**Severity Summary**: 0 Critical, 0 High, 2 Minor, 0 Nit **additional findings**. Combined with the confirmed first pass: **0 Critical, 2 High, 9 Minor, 0 Nit**; eleven distinct findings, without double counting.

**Method**: Performed the independent `code-audit-second` review required by `C:/Users/alan_/.cursor/commands/audit.md`. Read the implementation, cross-checked the first review, reran its eight behavioral reproductions, and wrote separate synthetic probes for additional cases. No production state or implementation was changed, and nothing was sent externally.

## Critical Issues

None confirmed.

## High Priority Issues

No additional High issues. Both first-pass High findings are confirmed:

- **H1, unreviewed collection qualifies prospects**: reproduced a score of 90, `OUTREACH_READY`, and `draftCurrent: true` with every opening explicitly `reviewed: false`.
- **H2, stale report publication removes hold warning**: reproduced canonical revision 5 with `hold: true` while its Markdown omitted the stop warning and displayed an actionable draft. This is a derived-report race, not corruption of the locked canonical JSON. High severity is appropriate because the report is the human handoff.

Their code examples, fixes, verification and prevention guidance remain in [the first review](hr-ops-mvp-01-code-review.md#high-priority-issues).

## Minor Issues

### M8 — Initialization can turn a valid existing YAML profile into an unreadable profile

- **Location**: `lib/hr-ops/store.mjs:104` and `lib/hr-ops/store.mjs:109`.
- **Severity**: MINOR.
- **Problem**: `initialize` parses the existing profile successfully but then appends a block mapping to its raw text. Appending is not valid for every YAML representation of a mapping. An existing `{}` or flow-style mapping cannot be followed by another mapping at the same document root. A valid profile ending with the YAML end-of-document marker `...` becomes a multi-document stream, which `yaml.load` rejects. Initialization reports success after writing this unreadable configuration; subsequent HR-Ops commands fail before reaching their command handler. Existing content is still present and manually recoverable, so this is not classified as irrecoverable data loss.
- **Example**:
  ```js
  const old = existsSync(path)
    ? readFileSync(path, "utf8").trimEnd() + "\n"
    : "";
  writeFileAtomic(path,
    old + yaml.dump({ hr_ops: c }, { lineWidth: 110, noRefs: true }));
  ```
  With a preexisting valid `config/profile.yml` containing `{}`, initialization returns `initialized: true`, but loading the resulting `{}\nhr_ops: ...` fails with `end of the stream or a document separator is expected`. The valid input `name: Existing User\n...\n` similarly becomes a stream rejected as multiple documents.
- **Fix**: Construct one YAML mapping containing the parsed existing keys plus `hr_ops`, then serialize it atomically. If preserving comments/formatting is required, use a document-aware editing approach rather than raw concatenation. At minimum parse and validate the complete proposed output before writing, and safely reject unsupported formatting without changing the original file. Keep existing user fields and existing HR configuration intact.
- **Verification**: Initialize profiles represented as `{}`, a populated flow mapping, an ordinary block mapping, and a block mapping ending in `...`. Each must either produce a loadable single-document profile preserving every original field or fail before writing. Assert `doctor` succeeds after every reported successful initialization; check dry-run and real behavior agree.
- **Prevention**: Include valid alternative YAML serializations in configuration tests and validate the exact serialized result, not just the independently parsed input and newly generated subtree.

### M9 — Timestamp validation silently accepts impossible calendar dates

- **Location**: `lib/hr-ops/model.mjs:102` through `lib/hr-ops/model.mjs:114`.
- **Severity**: MINOR.
- **Problem**: `stamp` treats successful `Date.parse` as calendar validation. JavaScript normalizes some invalid calendar dates instead of rejecting them. Consequently a typo such as February 30 can enter cited evidence or be silently rewritten into a different event date. `recordInteraction` persists the normalized value, while evidence validation checks but does not replace the original timestamp, creating inconsistent treatment of the same invalid date. This undermines the exact chronology and freshness metadata the model is intended to retain.
- **Example**:
  ```js
  Number.isFinite(Date.parse(value)) // true for 2026-02-30T12:00:00Z
  return new Date(value).toISOString();
  // Returns 2026-03-02T12:00:00.000Z rather than rejecting February 30.
  ```
- **Fix**: Parse an explicit supported ISO timestamp grammar, validate the original year/month/day and time/offset components against real calendar bounds, then normalize valid values to UTC. Validate the original local calendar components before UTC conversion so legitimate timezone offsets that cross a date boundary remain accepted. Reuse the calendar-roundtrip principle already present in `validDay`.
- **Verification**: Reject February 30, non-leap-year February 29 and April 31 for evidence, interactions and persisted records; accept leap-year February 29 and valid offset timestamps crossing UTC midnight. Ensure invalid mutation input leaves the prior record and revision unchanged.
- **Prevention**: Share one strict timestamp validator across ingestion and persisted validation, with calendar-boundary and offset fixtures rather than only malformed-string and future-date tests.

### First-pass Minor findings: confirmation and scope

The first-pass M1–M6 behavior probes were rerun successfully. M7 is confirmed by inspection of the fixed fixture date versus the subprocess's real clock and the first review's retained future-clock result; that clock-shifted suite was not rerun during this second pass. Fix, verification and prevention guidance for these seven issues remains in [the first review](hr-ops-mvp-01-code-review.md#minor-issues).

An additional title case strengthens **M6** without creating a separate finding: `Former CTO` is treated as a current decision maker and explained as `Owns engineering hiring needs`. The fresh verification date describes the page observation; it cannot establish that a explicitly former role is current. The M6 fix should also exclude former/departed role qualifiers or represent current employment independently, and its title matrix should test these cases. The synthetic probe and result are included below.

## Nits

None reported.

## Summary

The second review contests none of the nine first-pass findings and adds two reproducible input-handling defects. Prioritize the unreviewed-demand gate and serialized report publication, then fix the remaining lifecycle, identity and validation defects with focused regression tests. Approval records remain audit records; the documented no-send boundary and need for separately enforced future runtime permissions are not presented as newly discovered vulnerabilities.

Additional reproductions are retained in ignored `local/cursor-audit/second-probes.mjs` and `second-results.json`. They exercised two valid YAML encodings, one impossible timestamp and the former-executive ranking case against isolated synthetic fixtures. The first-pass `probes.mjs` also completed successfully on rerun. No new full legacy or web suite was run by this reviewer; the first review distinguishes its fresh HR checks from the immediately preceding repair's retained test logs.

Rejecting historical sends entered after a later opt-out is an MVP history-correction limitation, not an additional finding here: the conservative gate preserves suppression. No unsupported capacity or semantic-entailment guarantee is claimed, and no fix was implemented during this audit.
