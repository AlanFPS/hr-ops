---
name: hr-ops
description: Discover and evaluate U.S. recruiting clients for a LATAM recruiting firm, research hiring needs, identify contacts, draft outreach, and maintain prospect follow-ups. Use for HR-Ops modes and client-acquisition requests.
license: MIT
---

# HR-Ops shared router

Find the project root by walking upward from this skill to the directory containing `hr-ops.mjs` and `AGENTS.md`. Execute commands there, even when the session starts in a subdirectory. Resolve user data through `lib/hr-ops/store.mjs`; do not assume it lives beside code.

Read the root instructions, `modes/hr-ops/_shared.md`, the user `config/profile.yml` HR-Ops block and user custom mode if present. Load only the relevant mode below. Use configured output language (English by default).

| Request | Mode |
|---|---|
| Set up an HR workspace / show available operations | `modes/hr-ops/setup.md` |
| Find/evaluate N clients, startups or agencies | `modes/hr-ops/discover.md`, then `pipeline.md` |
| Research named prospects / strongest prospects | `modes/hr-ops/research.md` |
| Qualify / explain a score | `modes/hr-ops/qualify.md` |
| Find decision makers | `modes/hr-ops/contacts.md` |
| Prepare outreach / top N drafts | `modes/hr-ops/outreach.md` |
| Explicitly request assisted LinkedIn sending | `modes/hr-ops/linkedin-send.md` |
| Check LinkedIn inbox / import actual replies | `modes/hr-ops/inbox.md` |
| Who needs a follow-up / log a reply | `modes/hr-ops/followups.md` |
| Show pipeline or company status | `modes/hr-ops/pipeline.md` |

In Codex, use ordinary prompts or `codex exec --sandbox workspace-write "Use HR-Ops to research the strongest prospects"`. In clients with slash commands, `/hr-ops research <company>` maps to exactly the same mode. Do not install MCP or another AI client to operate this workspace.

The Node CLI performs deterministic collection, validation and persistence. Research/outreach without input return work briefs: **you must do the research or drafting**, then import the result. Do not stop after displaying a brief when the user asked for the complete task. Use `node hr-ops.mjs --help` and `docs/HR_OPS.md` for exact schemas. A prompt to find/evaluate clients authorizes internal discovery → research → qualification → contacts → draft preparation; never external contact.

No delegation is required. Use public information and the current client's search tools. If search is unavailable, use configured public sources and report the coverage limitation; do not pretend a seed list is broad discovery. Unknown facts remain unknown. Never invent approval references, contact details, inventory or commercial terms.

For repeatable discovery, inspect `sources --starter`; catalog companies still need independent qualification. Follow the shared research-run budget procedure and preserve quote/summary, retrieval precision and publication dates. A score and weighted signal coverage do not establish buying intent. Check no-agency policies and existing LATAM coverage before drafting.

Use `discover --plan --icp both` to distinguish reusable sources, seeds, controls and pipeline exclusions. Selected retained public feed readers are available through `discover --feed remotive|hackernews --run ID` after configuring a scoped run. They produce cached unverified employer leads, not prospects or qualifying evidence. Use the separate agency source/query plan for attributable client vacancies. Finish independent research before reporting a discovery target as achieved.
