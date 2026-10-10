# Operating fixes and isolated validation — 2026-10-10

This is focused regression validation, not production certification or a repeat of live company discovery. No outreach was sent. The previous operating run and its failures remain preserved.

## Changes

1. `lib/hr-ops/client.mjs` adds a JSON CLI runner that throws on unsuccessful commands and a reservation-before-dispatch callback. Receipts explicitly distinguish real reservations from dry runs. Shared instructions prohibit dispatch after reservation failure and distinguish per-company page caps from the separate global query cap. Native research tools still depend on operator compliance.
2. Draft numerical checks ignore HTTP(S) link destinations, including UUIDs and query parameters. Numbers in prose and Markdown link labels still require support; URL digits in an excerpt cannot support a numerical claim. Commercial-claim checks also inspect prose rather than encoded URLs.
3. The CLI enforces Node >=24. The isolated acceptance launcher supplies an absolute verified executable to the agent and restricts Claude's Bash allowlist to it. Full `export --output local/exports/pipeline.json` writes directly with a runtime/count receipt, avoiding truncated tool output and hand copying. Output paths cannot target canonical prospect/config files. The launcher now directs test temporary files into the isolated workspace too.
4. Positive recruiting pain requires a cited basis and rationale beyond the vacancy: employer-reported difficulty, documented capacity gap, or explicit partner request. Inferences earn at most half need points. Historical unclassified pain remains readable but earns no need points/coverage. New imports without the required basis fail. Current scoring explains the basis; historical score snapshots remain historical.

The operator rerun also exposed a sender/recipient attribution error in Claude's draft. The outreach mode now requires reading complete sentences in the sender's voice before persistence. Source substrings do not establish who is making a claim. Test counts must not prevent correcting known false content. This is a workflow check, not a general semantic validator.

## Automated checks

- 94/94 HR tests passed in the main checkout and each initial isolated client workspace, including five new focused tests.
- 16/16 retained tracker/HTTP tests passed in the main checkout.
- 773 JavaScript modules passed syntax checks. The PowerShell launcher parsed successfully.
- The actual installed Node 20.10.0 was rejected with the expected Node >=24 error.
- Main doctor remained healthy. Independent SHA-256 comparisons confirmed all ten original prospect records unchanged.

Logs and verification receipts: `local/operating-fixes/` (ignored user-local artifacts).

## Paired fresh sessions

Both clones started at `85dcbf2e2f710cb46ac5439f24ceb9c637bdd88c` plus the same uncommitted implementation snapshot. Each retained `local/acceptance/code-snapshot.json` records changed-file hashes. This avoids claiming an uncommitted patch is represented by the base revision alone. Parent verification checked the snapshot files, unexpected Git changes, default configuration, canonical records and complete exports. Documentation was subsequently clarified; the outreach-mode correction and launcher temp-directory change were replayed separately below.

Root: `C:\cdng\hr-ops-operating-20261010-011617`, with independent `codex` and `claude` directories. Each has a saved prompt, transcript, runtime receipt, test outputs, payloads, report and full export.

| Check | Codex | Claude initial run |
|---|---|---|
| Actual shell Node 24.21.0 | PASS | PASS |
| Invalid/exhausted reservation does not dispatch | PASS | PASS |
| Separate query allowed after six-page cap | PASS | PASS |
| Vacancy-only pain unknown; supported inferred capacity gap gets half need points | PASS | PASS |
| UUID links accepted; unsupported numerical prose rejected without mutation | PASS | PASS |
| Full export equals canonical records in a fresh process | PASS | PASS |
| Sender/recipient role attribution | PASS | FAIL, retained for audit |

Both independently scored Fixture A at 65 (need 0, coverage 80%) and Fixture B at 75 (need 10, coverage 100%). Each saved two incomplete review drafts, with zero interactions or approvals and sending disabled. These fixtures were supplied quotations with invented companies and `.example` URLs; no pages were read. Reservation callbacks only incremented counters. They do not establish live research compliance or source quality.

Sessions: Codex `01a12407-27ab-7ce3-a263-dbcfd816a1f1`; Claude `de2b4bda-c6d9-4203-bf14-170e41577a12`.

Claude recovered from an initially denied compound `cd` command by using the permitted absolute Node invocation. It also tried the JSON-only `runHr` helper with Markdown output; this failed visibly and it recovered using a checked raw-output subprocess, without duplicating research. The helper's JSON contract is now explicit in replay guidance. The initial Claude test helpers used ordinary OS temporary directories, cleaned by the tests; the updated launcher pins TEMP/TMP inside the fresh workspace. These are data-isolated runs, not security sandboxes.

## Targeted content replay

The first Claude run wrote "I'm reaching out as CTO of Fixture A Labs", falsely attributing the recipient's role to the sender. Its own review reported the failure but incorrectly treated the two-draft fixture target as a reason not to correct it. Those drafts are failed test artifacts and must not be used.

A new Claude workspace at `C:\cdng\hr-ops-outreach-replay-20261010-012615\claude` replayed only the affected outreach/runtime/export checks with the corrected mode. Session `d51f7a0b-46aa-40cd-b42b-be47ffd71b9d` completed successfully. The supplied fixture-seeding harness created the qualification inputs; the agent independently drafted and reviewed the messages. This narrower replay does not replace the original independent pain assessments.

All targeted replay checks passed. The persisted messages say "given your role as CTO at Fixture A Labs" / "given your role as CTO at Fixture B Labs", attributing the role to the recipient. Parent inspection confirmed the complete sentences, not merely matching substrings. Both exact UUID links survived; unsupported numerical prose was rejected without changing revision or draft count. A fresh-process full export matched canonical records. Final state: two prospects, two incomplete pending-review drafts, zero interactions/approvals, healthy doctor, sending disabled. Snapshot/configuration and seeding-harness hashes remained unchanged. Evidence: that workspace's `local/acceptance/results.md`, `content-review.md`, `step4-results.json`, `step5-verify.json`, and the parent's `local/operating-fixes/outreach-host-verification.json`.

The initial failed run remains preserved and is not relabeled PASS. No formal semantic guarantee follows from the successful replay; human review remains necessary.

## Final publication review

The follow-up review using the Cursor audit instructions closed three additional Minor findings: the JSON helper now rejects text modes before dispatch and exposes `runHrText`; asynchronous test initialization is awaited; and concurrent export-directory creation tolerates `EEXIST` only after revalidating the winner's type. The independent reviewer confirmed all three repairs, including a Windows junction-race rejection probe. See [review 06](code-review/hr-ops-mvp-06-code-review.md) and [review 07](code-review/hr-ops-mvp-07-code-review.md).

The final patch passes **96 HR tests**, including seven focused operating regressions, and **16 retained tracker/HTTP tests**. The earlier 94-test client runs remain evidence for their recorded snapshots; no claim is made that those historical sessions executed the later helper/concurrency repairs. Those repairs were exercised by fresh isolated test fixtures and the independent review. All ten original prospect hashes remain unchanged; doctor remains healthy. Logs: `local/operating-fixes/publication/`.

## Remaining limits

No live discovery, primary-page entailment, prompt-injection behavior, external delivery or CRM integration was exercised in these controlled replays. The stricter pain rubric can lower current recommendations for older prospects; refresh genuine evidence rather than relabeling old sources to recover points. Native tool budgets and natural-language truth still require operator/human review. All output remains draft-only.
