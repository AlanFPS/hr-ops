# HR-Ops in Codex

Start Codex in the repository root. Codex reads `AGENTS.md` and discovers `.agents/skills/hr-ops/SKILL.md`. Root `CODEX.md` is retained as a compatibility pointer, not a prerequisite for automatic instruction loading. The same HR modes are used by Claude Code.

```bash
node hr-ops.mjs doctor
codex
codex exec --sandbox workspace-write "Use HR-Ops to find and evaluate 10 U.S. clients hiring backend/full-stack engineers"
```

Ask: “Research the five strongest prospects”, “Why did we qualify Acme?”, “Prepare outreach for the top 3”, or “Who needs a follow-up today?”. The agent must carry tasks through research and saved drafts, not stop at CLI briefs. Configure public search permissions appropriate to your Codex runtime. No MCP server is used; native Codex slash commands are not assumed.

Read [the operating guide](HR_OPS.md) for setup and payloads. The core CLI never sends or makes external CRM writes. The optional [LinkedIn adapter](HR_OPS_LINKEDIN.md) runs in a human-operated terminal or, on the user's send instruction, unattended with `--authorization`; Codex must never invent that instruction, log in or handle credentials. Missing firm identity and unknown evidence remain visible. Candidate onboarding and Career-Ops auto-updates do not apply to HR-Ops work.

For a new data root, use `node hr-ops.mjs setup` for the guide and `node hr-ops.mjs menu` for HR command groups. Keep Codex in the code checkout and explicitly select the created root with `HR_OPS_ROOT`. `discover --plan --icp both` separates reusable feeds, agency query/directory routes, company seeds and exclusions. Budgeted feed collection returns unverified research tasks, never automatic prospect qualification. See [HR setup and source discovery](HR_OPS_SETUP_AND_DISCOVERY.md) for scope configuration, cached resume and limits.

## Retained legacy Codex guide

The following applies only when explicitly requesting Career-Ops candidate tools.

# Codex Guide

Career-ops supports Codex through the same shared router used by the other CLI integrations.

## How Codex maps to career-ops

- `AGENTS.md` is the shared instruction source.
- Root `CODEX.md` is the thin Codex wrapper that imports `AGENTS.md`.
- This file is the human-facing guide for running career-ops workflows from Codex.

## Interactive Codex

Start Codex in the repository root:

```bash
cd career-ops
codex
```

Codex may not expose a native `/career-ops` slash command. When it does not, ask for the same workflow in plain language:

```text
Evaluate this JD with career-ops auto-pipeline: https://company.com/jobs/123
Run the career-ops scan mode and summarize new matches.
Run the career-ops pipeline mode for data/pipeline.md.
Run the career-ops pdf mode for the latest evaluated role.
Run the career-ops email mode for the latest evaluated role. Draft only; never sends, submits, or clicks.
Run the career-ops tracker mode and summarize the current statuses.
```

## One-shot workers

For single commands or batch workers, use `codex exec`:

```bash
codex exec "Evaluate this JD with career-ops auto-pipeline: https://company.com/jobs/123"
codex exec "Run career-ops scan mode in this repo and summarize new matches."
codex exec "Run career-ops pipeline mode for data/pipeline.md."
codex exec "Run career-ops pdf mode for the latest evaluated role."
codex exec "Run career-ops email mode for the latest evaluated role. Draft only; do not send, submit, or click anything."
codex exec "Run career-ops tracker mode and summarize the current statuses."
```

## Notes

- If your Codex environment exposes slash commands, the shared `/career-ops` router semantics still apply.
- If it does not, use the same mode names through prompts or `codex exec`.
- Browser-heavy flows such as `scan`, `pipeline`, and `apply` still depend on Playwright browser tools being available in the active agent setup.
