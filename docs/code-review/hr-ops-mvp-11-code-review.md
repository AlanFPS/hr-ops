# Acceptance repair audit, 2026-10-15

The isolated acceptance of `a4ad3f923783e1befaab41cae2975d99106dea41` exposed a shared-URL opening overwrite and Windows launcher failure. This patch fixes those defects and clarifies the procedural findings without changing operating prospect data.

| Finding | Repair | Verification |
|---|---|---|
| Separate roles sharing a careers URL overwrite each other | Posting-scoped identity, explicit saved IDs for updates, descriptive fallback for manual listings | Shared-page import and reimport, independent eligibility, persistence and alias tests |
| Shared URL also collapses demand grouping | Separate record identity from supported requisition/duplicate grouping | Common requisition counts once; distinct requisitions count separately; ambiguous locations receive no multiple-demand bonus |
| Provider evidence IDs collide on shared URLs | Include board, posting/requisition, title and location in evidence identity | Real provider-contract fixture with two roles on one URL |
| A surviving URL hides a missing posting in reconciliation | Prefer posting identity when available; conservative title-and-URL fallback otherwise | Only the absent posting requires reconciliation; no automatic closure |
| PowerShell 5 aborts on native stderr warnings | Scope relaxed native error handling to the client invocation, retain actual exit status | Codex/Claude stubs emit warnings and exit both zero and seven |
| PowerShell 5 mangles BOM-less UTF-8 prompts | Explicit UTF-8 prompt decoding, pipe encoding and transcript output | Accented input and output round-trip through actual Windows PowerShell |
| Location-only evidence interpreted as a restriction | Explain unknown versus affirmative restrictions in research mode | Unknown-eligibility admission regression plus focused client evidence replay |
| Custom CLI wrapper bypasses prescribed helper | Explicit helper usage example and prohibition on replacement wrappers | Existing helper failure tests plus inspection of isolated client scripts |
| Discovery stops below target with budget unused | Check verified demand by ICP; continue useful reads or report concrete stopping reason | Focused client completion scenarios; no claim of code-enforced native research policy |

Local HR validation: 154 tests passed, including 12 new tests. Windows-only launcher subprocess tests are intentionally skipped on other platforms. One retained regression now verifies that reviewed rows remain identical while a newly observed provider identity stays separate and unreviewed; the old assertion incorrectly assumed URL equality proved identity.

A final edge case showed that a requisition without posting IDs must group demand without merging listing records: otherwise conflicting geography-specific eligibility is lost. The fallback identity now retains those rows independently; the requisition still groups their score conservatively. The broad quick suite also exposed an unrelated expired July 2026 fixture in the legacy funding redirect test. Its mock article date now stays within the current window; date-window tests retain fixed clocks and the redirect assertions are unchanged. The first broad run recorded 9275 passes, one failure and ten warnings before this fixture correction. Early client runs against the intermediate repair commit were stopped and preserved, then replaced by fresh runs against the complete patch.

Historical IDs and snapshots are preserved. Roles lost by the old overwrite cannot be recovered without source evidence. Operators must reimport supported missing roles through the research API using expected revisions. Correcting a manual listing's title, location, employer, URL or attribution requires its saved opening ID. Adding provider metadata also uses that saved ID.

Fresh-client acceptance artifacts are local and excluded from Git. Both clients must test the same committed revision, compare incoming roles against persisted roles, retain exact build/runtime records, and distinguish source replay from live discovery. Passing focused checks does not retrospectively satisfy the earlier ten-prospect discovery target or establish production certification.
