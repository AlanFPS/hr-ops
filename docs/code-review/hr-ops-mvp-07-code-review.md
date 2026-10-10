# Code Review: Independent operating-fix publication review

**Reviewed Files:** `hr-ops.mjs`, `lib/hr-ops/{client,claim-numbers,export-file,model,operations,research-run,validation}.mjs`, the reused atomic-file writer, `scripts/hr-ops-acceptance.ps1`, `tests/hr-ops/{fixtures,operating-fixes.test}.mjs`, changed shared/outreach modes, and operating-check documentation.

**Review Date:** 2026-10-10.

**Severity Summary:** Second pass identified **0 Critical, 0 High, 2 Minor, 0 Nit additional findings**, both resolved during review. First-pass M1 is also resolved. Combined review history: three Minor findings; **zero remaining confirmed findings in scope**.

**Method:** Independent `code-audit-second` review required by the user-invoked `~/.cursor/commands/audit.md`. This is limited to the pending operating-fixes patch. No live prospect records, credentials or implementation files were modified by this reviewer. Reproductions use synthetic disposable state.

## Critical Issues

None confirmed.

## High Priority Issues

None confirmed. No path escape or canonical-data overwrite was demonstrated. Existing symlink rejection and lexical traversal rejection were inspected; they are not an independent security sandbox against another process with filesystem access.

## Minor Issues

### M2 — Unawaited fixture initialization blocks a synchronous CLI child (resolved)

- **Location:** `tests/hr-ops/operating-fixes.test.mjs:14–18` and its dependent test setup.
- **Severity:** MINOR; test infrastructure defect, resolved during review.
- **Problem:** The fixture originally called asynchronous `initialize` without awaiting it. Initialization acquired the workspace lock, then deferred its body/release to a microtask. A test immediately calling the synchronous subprocess helper blocked that parent's microtask while the child waited for the parent's lock. Earlier tests only avoided failure because an intervening `await` happened to yield before a valid mutation. The new text-runner test reproduced a deterministic 30-second timeout.
- **Example:**
  ```js
  function isolated(t) {
    initialize(root, c); // original unawaited call
    return { root, opts };
  }
  // Later in a synchronous test:
  runHrText(['discover', '--input', '-', '--summary'], discovery);
  ```
- **Fix:** Make fixture initialization async, await `initialize`, and await the fixture in every dependent test. This change is now applied.
- **Verification:** The independent pre-fix run completed with five passes and one lock-timeout failure; after the fix the six-test focused suite completed with **6 passes, 0 failures** in approximately 3.2 seconds.
- **Prevention:** Await all asynchronous fixture setup before exposing resources, especially before `spawnSync`. Keep the valid mutating subprocess case, which catches a lock-owning setup promise more reliably than read-only or preflight-failing commands.

### M3 — Concurrent export directory creation can reject a valid export (resolved)

- **Location:** `lib/hr-ops/export-file.mjs:14–18` before repair; corrected directory-creation/type-check path now at lines 14–28.
- **Severity:** MINOR; resolved during review.
- **Problem:** Export checks directory existence and then calls `mkdirSync` without handling another legitimate exporter creating the same directory between those operations. Two initial exports into the same root can cause one to fail with `EEXIST`. The atomic final-file writer prevents torn files, but does not cover directory preparation. This is a recoverable concurrency failure, not data corruption or a demonstrated path escape.
- **Example:**
  ```js
  if (existsSync(path)) {
    // validate component
  } else if (index < parts.length - 1) mkdirSync(path);
  ```
  The isolated probe inserts a legitimate directory creation after the existence check. The export then fails with `EEXIST` for `local`, and no requested export is written.
- **Fix:** The applied repair handles only `ENOENT` from the initial `lstat`, tolerates `EEXIST` on creation, then rechecks the winner using `lstatSync`. Existing and concurrently created entries share the same directory/file/link checks; no blind recursive creation was introduced.
- **Verification:** The new deterministic regression confirms that a concurrent directory creator succeeds and a competing file is rejected without modifying it. An additional independent Windows junction-race probe confirmed rejection with the redirected directory unchanged. Existing traversal and exact-export-content tests also pass.
- **Prevention:** Include directory preparation in concurrency regression coverage rather than testing only the atomic final rename. Treat filesystem existence checks as observations that can become stale.

## Nits

None reported.

## First-pass finding and retained behavior

First-pass **M1 is resolved**: `runHr` rejects textual output modes before dispatch, while `runHrText` returns text and still checks subprocess errors/nonzero exits. The regression confirms no discovery write occurs on a JSON-runner mismatch, and checks actual Markdown, CSV, help and JSON export receipts.

The review found no additional confirmed defect in the URL-number or recruiting-pain changes. HTTP(S) destinations are excluded from numeric evidence matching while numerical prose and Markdown labels remain subject to checks. Historical positive pain without a supported basis remains structurally readable and earns no current need points; new positive-pain imports require the explicit basis/rationale. Historical score snapshots remain historical rather than being silently rewritten.

The launcher explicitly describes data isolation rather than a filesystem security boundary, pins the Node executable and user-data roots, and rejects a nonempty acceptance workspace. No AI client was launched by this review. Semantic sender/recipient attribution remains a procedural review requirement rather than an asserted deterministic capability.

## Summary

The final independent focused rerun passes **7 tests, 0 failures**, including the M1/M2 corrections and M3 concurrency regression. All three findings from reviews 06/07 are closed. The original export-race reproduction and the successful post-fix junction rejection probe are retained under ignored `local/audit/operating-fixes-review/second/{export-race,export-race-fixed}.mjs`; the original script intentionally demonstrates pre-fix behavior and is not a post-fix acceptance test. `git diff --check` passed on the reviewed patch. This report does not claim a fresh live-company acceptance run, external delivery verification or a complete retained-upstream audit.
