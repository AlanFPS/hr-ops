# HR-Ops review fixes — 2026-09-29

This repair pass addresses all eleven findings from the [Cursor-method review](hr-ops-mvp-01-code-review.md) and its [independent second pass](hr-ops-mvp-02-code-review.md). The historical reports remain available with their original reproductions and severity assessments. The implementation retains the local shared-skill architecture, draft-only boundary and existing upstream attribution.

| Finding | Implemented repair |
|---|---|
| H1 — unreviewed demand | Scoring excludes explicitly unreviewed openings. Research briefs list pending role IDs; actual research enables qualification. Legacy rows retain their documented treatment. |
| H2 — report write race | Publication acquires the workspace lock and reloads current state/configuration. Reports include their canonical revision. Both deterministic interleaving and separate-process tests preserve newer hold/opt-out warnings. |
| M1 — dry-run/commit mismatch | Collection and company creation use one prepared, fully validated transaction. Invalid provider metadata cannot leave a new identity behind; concurrent collection preserves reviewed research. |
| M2 — wrong follow-up recipient | Follow-ups require the latest actual recipient and retain a `reply_to` event reference. Older or unbound drafts cannot silently become current continuations. |
| M3 — backdated replies | Replies bind to prior contact and reject chronology that would overwrite newer cadence state. Generated bindings do not break idempotent retries after later contact. |
| M4 — evidence property order | Immutable evidence compares canonical object content; reordered keys are accepted while changed values still fail. |
| M5 — alias collisions | Repository transactions enforce unique domain ownership. Reads/doctor detect prior collisions, and raw persistence is private. Concurrent alias attempts cannot acquire the same domain. |
| M6 — title context | Ranking distinguishes business ownership/managing partnerships from product ownership/HR partner roles, recognizes Assistant Vice President rank, and excludes assistants-to and explicitly former/departed roles. |
| M7 — expiring acceptance test | CLI acceptance evidence uses the execution date. A regression executes the real subprocess test under a future clock, with nested-test context cleared so the test actually runs. |
| M8 — YAML initialization | The exact proposed YAML is parsed and checked against preserved values before atomic writing. Alternative valid encodings are safely normalized when necessary. |
| M9 — impossible dates | Timestamp validation checks real calendar/time/offset components before UTC normalization, including leap years and date-crossing offsets. Invalid evidence/events leave revisions unchanged. |

Seventeen new regression tests are in `tests/hr-ops/review-regressions.test.mjs`. Existing scanner expectations now require role review, and CLI acceptance fixtures remain fresh independently of calendar date. The initial reproductions failed before the fixes; the future-clock test harness was corrected to execute its nested test rather than silently skipping it.

## Verification

| Check | Result |
|---|---|
| HR tests | 70 passed, zero failures |
| HR tests with November 2026 clock | 70 passed, zero failures; nested acceptance also exercises March 2027 |
| Syntax | 764 modules passed; the two subsequently edited modules also passed targeted syntax checks |
| Retained quick regression suite | 9,249 checks passed, one failed, 10 existing warnings; the sole failure was fixed and its complete 12-test suite passed on targeted rerun |
| Live state | Doctor passes; ten prospect files match the pre-repair SHA-256 hashes |
| Whitespace/conflict check | `git diff HEAD --check` clean |

Logs are retained locally in ignored `local/cursor-audit/fix-*.log`. No web dependencies or legacy implementation were changed in this pass; the preceding web build/typecheck/test results remain historical evidence rather than claimed new runs. No outreach, external CRM write, OpenClaw installation, staging, commit or push occurred.

The retained filesystem-walker convention test initially interpreted `Map.get()` in the new domain-uniqueness helper as a recursive call to the repository's `get()` method. A set expresses the required uniqueness invariant directly and removes that ambiguity. The checker was not weakened or exempted. `node test-all.mjs --only mjs-files` subsequently passed its complete 12-test suite. The 9,249 other checks were not needlessly rerun; the final HR current/future-clock runs include the corrected helper. See `fix-core.log` and `fix-core-rerun.log` for the exact sequence.

## Operational details

Saved reports are point-in-time artifacts. `status --markdown` renders current state; existing saved reports are not mass-rewritten during this maintenance pass. Direct repository users should also render from canonical state rather than treating a saved report as a lock or authorization.

Legacy follow-up drafts without `reply_to` must be regenerated; historical records remain readable. The MVP still uses one active follow-up context per prospect. Historical corrections and switching recipients are explicit planning tasks, not silently rewritten conversation history. An old reply is rejected rather than allowed to cancel newer reminders.

When uncommon YAML formatting requires reserialization, existing values and standalone comments are preserved, while formatting and inline comments may change. Normal block profiles retain their original text. No existing live configuration was rewritten by this repair.

Source entailment and contact authority still need researcher review; title heuristics cannot establish a person's actual purchasing authority. Approval records remain audit records, and future autonomous runtimes still require independent enforcement of external-action permissions.
