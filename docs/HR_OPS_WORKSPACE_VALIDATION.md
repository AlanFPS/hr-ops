# Operating reliability verification map

The primary regression file is `tests/hr-ops/reliability.test.mjs`. It creates temporary isolated roots and never uses LinkedIn or sends messages.

| Finding / requirement | Verification |
|---|---|
| Clean initialization and root precedence | Two-workspace isolation, explicit config only, unchanged selection, conflicting environment override tests |
| Account binding and cookies | Wrong-account rejection, history rebinding rejection, metadata equality after restore, cookies absent |
| Folder starvation and oversized threads | Bounded folder driver, deferred Focused thread, Other inspection, resume with original window and cumulative counts |
| Timestamp ambiguity | Local-calendar weekday cases, same-weekday and missing-time rejection; retained DST tests |
| Review instability and personal exclusions | Dismissal across timestamp improvement, reversible exclusion, no implicit prospect creation |
| Legacy inbox state | Preview leaves state untouched, backup-first apply preserves reviews and invalidates old coverage, repeated apply is a no-op |
| Stale dossiers and API writes | Revision/configuration/time detection, refresh without revision changes, failed report write preserves canonical state |
| Repeated discovery and source quality | Canonical aliases and catalog controls excluded; readable source yield ranking; existing services-only, wrong-board and agency-internal-hiring regressions |
| Failure categories and honest budgets | Redirect/HTTP/JavaScript-shell diagnostics, no inferred demand, useful admitted-candidate checks after candidate cap |
| Connected operating flow | Fresh workspace, research/contact/draft, simulated outgoing history and reply, reminder changes, restart, repeated import, revision conflict, opt-out, hostile message text, backup/restore equality and untouched second workspace |

Retain the full HR suite, including intercepted Playwright account/layout/pagination/history fixtures and qualification/restriction tests. Browser fixtures intercept requests and never contact LinkedIn. CI explicitly installs Chromium and runs the suite on Windows and Linux with Node 24.

Release procedure: run `npm run test:hr`, affected provider/path/locking regressions, syntax and `node validate-system-paths-coverage.mjs`; commit the complete patch; run fresh isolated Codex and Claude sessions against that same commit; preserve runtime, transcripts, reports, pipeline exports, budgets and exit receipts under each workspace's private `local/acceptance` directory. Public pilots target ten prospects across both ICPs with 20 candidates, 20 queries, 80 pages, eight directory pages and six pages per company. Report verified new demand, qualification, unknowns and source yield separately. A target shortfall is a coverage result, not a fabricated pass.

Compare private operating-data hashes before and after acceptance. Verify restore contents and absence of cookies/cross-root writes. Validate final-revision Windows/Linux CI in `AlanFPS/hr-ops`, not upstream. These tests do not certify universal prompt-injection resistance, LinkedIn UI stability, legal eligibility or commercial demand.
