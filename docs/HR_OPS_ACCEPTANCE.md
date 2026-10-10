# Clean-checkout acceptance — September 29, 2026

## Scope

The first operational-validation gate started from a fresh clone of the pushed `hr-ops-mvp` branch at `a69bb5beaf8e78ddeb2ac3a794965d0ee165be9c`. No workspace configuration, prospects or `node_modules` were copied into it. The host's installed toolchain and ordinary caches were reused; this was not a clean-machine or cross-platform certification.

Environment: Windows 11 (build 22631), Node 24.21.0, Go 1.27.1, Git 2.50.1; Git checkout line endings configured as `input`. Go differs from the CI workflow's requested 1.26 series. Linux/macOS, the separate web application and legacy CV visual checks were not rerun in this gate.

## Results

| Check | Result |
|---|---|
| Fresh `npm install --ignore-scripts` | Passed; six packages installed, zero vulnerabilities reported by npm at installation time |
| Empty workspace startup | Doctor correctly reported uninitialized; init then doctor passed with zero prospects and visible missing firm/sender/email fields |
| Empty discovery | Returned research tasks, zero invented prospects, `partial: true` and `send_enabled: false` |
| HR tests | 70 passed, zero failures |
| Syntax | 764 modules passed |
| Retained quick suite on the exact pushed commit | 9,249 passed, two failed, ten warnings; both failures were the audit-document paths described below |
| Go dashboard | All test-bearing packages passed |
| Fictional backup/restore | Three files restored byte-for-byte; export matched, doctor passed, rediscovery created no duplicate |
| Live prospect data | All ten files matched the pre-repair SHA-256 baseline |

Fresh root dependency resolution was `@google/generative-ai@0.24.1`, `dotenv@17.4.2`, `js-yaml@5.4.2` and `playwright@1.63.0`. The root lockfile remains ignored under the retained repository policy; these exact resolved versions are evidence for this run, not a promise that future installs will resolve identically.

## Findings corrected locally

The pushed audit reports contained two machine-specific Cursor command paths. The retained absolute-path gate checks tracked files, so these were missed while the reports were untracked in earlier runs. Both now use `~/.cursor/commands/audit.md`; the unchanged gate's search/filter reports zero matches. This is a documentation repair, not an exception added to the check.

A fresh clone does not inherit the original workspace's `upstream` remote, and the local `hr-ops-baseline-1.33.0` tag was not present. The actual baseline commit is available in cloned history. [UPSTREAM.md](UPSTREAM.md) now explains remote setup and uses the full baseline commit in its comparison examples.

These corrections are working-tree changes after the tested commit. They do not retroactively make the original commit's failing checks pass and have not been pushed as part of this acceptance run.

The complete quick run finished with only those two failures. After applying the two path corrections to the clone, rerunning the unchanged absolute-path search/filter passed with zero matches. The full suite was not repeated after these text-only changes; this is a full-run result plus a targeted successful recheck, not a claim of an uninterrupted all-green run. The original clone had no tracked or untracked changes before applying the corrections (initialized user files are ignored).

Run logs, environment metadata and the recovery harness/result are retained locally under ignored `local/acceptance/2026-09-29-a69bb5be/`. The temporary clone location is recorded in ignored `local/acceptance-root.txt`. No source-code changes, live-data changes, new commit or push were made during this gate.

## Recovery drill limits

The drill created one explicitly fictional prospect, its sourced fixture research, firm configuration and one draft through the CLI in a separate data root. With no writer running, it copied that root, moved the original aside, restored the copy and compared every file hash and the CLI export. There were zero interaction records and no external communication. An initial harness assertion used the collection response shape for an identity import; correcting it to inspect `prospects[].created` allowed the completed drill to pass without product changes.

This proves a small, quiescent local copy can be restored. It does not validate a scheduled backup service, crash-time consistency, encryption, retention, off-machine disaster recovery or a recovery-time service objective. A real backup procedure must cover the complete resolved user data root and keep writers stopped during a simple directory copy.

## Next gate: operating-client acceptance

Historical plan: both operating-client runs have since completed. See [October 9 repairs and rechecks](HR_OPS_ACCEPTANCE_REPAIRS.md) for results and remaining gaps; the proposed gate below is retained as the original test plan.

Run the same bounded task through Codex and Claude Code in isolated data roots with the shared HR skill: discover and evaluate a small balanced sample, research the strongest prospects and prepare up to three eligible drafts. Retain prompts, tool results, canonical exports and human review notes. Count completed researched records and usable drafts, not merely generated work briefs.

Review source support and dates, job geography, ICP fit, unknowns, contact relevance and personalization. Include an ineligible company, duplicate input and an instruction embedded in external content. Confirm that the client neither follows that embedded instruction nor sends anything through another tool. Fewer than three drafts is correct when fewer prospects qualify. The existing ten-company pilot remains useful evidence but does not replace this paired client acceptance.

Before real operating use, supply actual firm/sender identity, define the supported client/platform and workload, and establish the backup, access and source-refresh routine. Agency qualification still needs additional real-world validation: the existing pilot produced no qualified agency prospects. OpenClaw and external delivery remain outside this edition's implemented scope.
