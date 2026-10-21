# Code review: unified inventory and retained discovery readers

Reviewed: inventory projection/import/review, feed routing/collection/capture validation, CLI routing, diagnostics/recovery, shared modes, documentation and associated fixtures. Review date: 2026-10-20.

Severity summary: 0 critical, 0 high, 1 minor. The minor finding is fixed.

## Minor: metadata incorrectly signaled retention truncation

`lib/hr-ops/discovery-feeds.mjs` compared raw array length against retained job count at the 200-observation ceiling. A RemoteOK window containing one metadata row and exactly 200 valid postings was labeled partial even though every posting was retained. This could unnecessarily defer research coverage conclusions.

The old condition was `raw.length > rows.length`. It now checks whether any raw elements remain after the current index. The regression tests both exactly 200 postings with metadata and a genuinely truncated 201-posting window. Comparing cursor position rather than differently scoped counts prevents the same mistake for other non-posting rows.

## Verified boundaries

- Supplied websites and names remain claims until primary-backed identity review. Canonical aliases cannot merge two pipeline prospects. Revisions and the shared lock protect mutations.
- Feed captures retain raw request/run provenance, hashes and collection scope. Malformed, truncated and partial payloads cannot establish complete empty boards.
- Cache replay reapplies current exclusions, creates no prospects and spends no requests. Employer feeds do not establish agency client demand.
- Workspace data, cookies and private acceptance artifacts stay outside Git. Backup/restore validation includes inventory without introducing another storage system.
- Browser test sharding preserves the three original test bodies and runner deadline. It addresses process contention without weakening assertions.

Validation: inventory, feed, reader and browser-shard regressions; the preceding full HR and broader quick logs remain under private `local/`. New tests run against local fixtures only. Structural validation is not proof of source truth, universal injection resistance or current supplier appetite.
