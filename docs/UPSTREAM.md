# Career-Ops provenance and transformation baseline

This is the HR-Ops fork at `https://github.com/AlanFPS/hr-ops`, derived from `https://github.com/career-ops-hq/career-ops`. GitHub's fork parent/source metadata was checked before implementation. Upstream is the current Career-Ops project; this checkout intentionally starts from an older preserved release.

- Original clean baseline: `5c97c24e092871cd6374c2122ee7f021d69d3d6e`, Career-Ops 1.33.0.
- Preservation tag: `hr-ops-baseline-1.33.0`.
- Implementation branch: `hr-ops-mvp`.
- Upstream snapshot fetched September 25, 2026: `a0de5cf95b650413fb9ffd5b78e547652967763a`, 111 commits ahead, release 1.34.0. This is a dated observation, not a claim that upstream will remain at that revision.
- Git remote `upstream` retains the Career-Ops URL. `.hr-ops-fork.json` preserves machine-readable provenance. MIT license and original attribution remain.

The original README, AGENTS legacy section, modes, providers, CV/application tools and cross-client integration were inspected before transformation. Codex already operated directly through `AGENTS.md`, `.agents/skills/career-ops/SKILL.md`, natural-language prompts and `codex exec`; Claude Code used the same router via its skill integration. No MCP integration was necessary.

## Baseline before source edits

Dependencies were installed with lifecycle scripts disabled, then required verification tools installed explicitly into ignored local directories. Node 24, Go, Chromium and PDF extraction tooling were used for the retained test suites.

| Check | Baseline result |
|---|---|
| Root syntax check | 753 modules passed |
| `node test-all.mjs --quick` | 9,235 passed, 0 failed, 10 warnings |
| Go dashboard `go test ./...` | Passed |
| Web tests | 584 passed, 8 skipped |
| Web typecheck and build | Passed |
| CV visual checks | All 4 passed after installing missing PDF extraction tool |
| Pipeline health check | Exit 0 |
| Upgrade PR gate / canary / local paths | All green after fetching historical tags |
| Standalone updater migration tests | 369 passed, 1 pre-existing Windows cwd path-comparison failure |

The standalone updater failure was diagnosed as a Windows slash mismatch in a test fixture's repository-root check. It was not an HR-Ops regression. Candidate doctor correctly reported missing user CV/profile in an isolated empty data root; software development did not invoke candidate onboarding. Detailed local baseline logs are in ignored `local/baseline/`.

## Plan implemented

1. Preserve the upstream baseline, architecture and clean health-check results.
2. Add a small deterministic HR domain layer over the existing file/lock/provider abstractions, replacing candidate scoring and lifecycle in the default workflow.
3. Add shared HR modes and client entrypoints, with natural-language research and draft execution alongside the CLI.
4. Add evidence, revisions, explainable scoring, human-reported interaction history and a draft-only boundary.
5. Validate with synthetic regression tests and a balanced real-company pilot; document limitations and future CRM/OpenClaw contracts.

## Selective upstream updates

```bash
git fetch upstream --tags
git log --oneline hr-ops-baseline-1.33.0..upstream/main
git diff hr-ops-baseline-1.33.0 upstream/main -- providers/ pipeline-lock.mjs tracker-utils.mjs
```

Review useful commits on a separate branch and selectively port/cherry-pick them, resolving HR-specific behavior explicitly. Re-run HR and relevant retained tests. Do not merge all upstream instructions over the HR workflow. The old updater's `apply` and `rollback` entrypoints are disabled when the fork marker exists. Its `check` returns `fork-preserved`. Upstream-specific release/publishing and community bots are guarded to run only in the upstream repository. Retained package version 1.33.0 records the underlying Career-Ops baseline; HR-Ops is an MVP, not an upstream release.
