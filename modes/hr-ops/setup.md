# HR setup and command navigation

Use `node hr-ops.mjs menu` for the HR command groups and `node hr-ops.mjs setup` for the read-only setup guide. Both work before a valid profile exists. Do not run the retained Career-Ops installer or candidate onboarding for HR setup.

For a new workspace, obtain an explicit absolute destination, workspace name and experimental/operating purpose. Read `templates/hr-ops-setup.example.json` and supply only confirmed firm facts and requested preferences. Use `setup --destination ... --input ...` or the equivalent `workspace create`. The destination must be new or empty. Existing data, inbox state, profile facts and cookies must never be copied implicitly. Use `--dry-run` to inspect without writes when useful.

Creation does not select a workspace. Select explicitly through the existing HR data-root mechanism, keep the agent in the code checkout, then run `workspace inspect` and `doctor`. Missing business email does not block research or LinkedIn drafts. No browser installation, MCP server, native Codex slash commands or other AI client is required for research. Codex, Claude Code and clients using the shared skill follow the same modes. OpenClaw remains uninstalled.

The retained dashboards and scaffolder are explicitly legacy candidate tools. Preserve their meaning and upstream provenance. For HR operation use the menu, CLI pipeline and dossiers. Browser inbox and sending are separate explicitly invoked human-operated workflows; setup and source collection authorize neither.
