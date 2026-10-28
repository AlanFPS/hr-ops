---
name: hr-ops
description: Discover and evaluate U.S. recruiting clients for a LATAM recruiting firm, research hiring needs, identify contacts, draft outreach, and maintain prospect follow-ups. Use for HR-Ops modes and client-acquisition requests.
license: MIT
---

# HR-Ops shared router

Find the project root by walking upward from this skill to the directory containing `hr-ops.mjs` and `AGENTS.md`. Execute commands there, even when the session starts in a subdirectory. Resolve user data through `lib/hr-ops/store.mjs`; do not assume it lives beside code.

Read the root instructions, `modes/hr-ops/_shared.md`, the user `config/profile.yml` HR-Ops block and user custom mode if present. Load only the relevant mode below. Use configured output language (English by default).

If the start-of-conversation doctor exposes `onboarding.offer: true`, offer `modes/hr-ops/setup.md` once, non-blockingly. The shared two-stage flow saves draft answers, previews one review summary and applies only its reviewed fingerprint. Unknown facts remain unknown; configured business context is user-stated, not verified credentials or hiring-country permission. Existing initialized workspaces without an onboarding checkpoint do not require re-onboarding.

For an interrupted onboarding apply with independent edits, use the setup mode's reviewed `onboarding reconcile` flow. It preserves current settings and archives the old receipt; reopened answers require a fresh consolidated apply review. Never remove a receipt or force an old plan over new settings.

| Request | Mode |
|---|---|
| Set up an HR workspace / show available operations | `modes/hr-ops/setup.md` |
| Inspect company inventory / import a list / queue new or refresh research | `modes/hr-ops/inventory.md` |
| Find/evaluate N clients, startups or agencies | `modes/hr-ops/discover.md`, then `pipeline.md` |
| Research named prospects / strongest prospects | `modes/hr-ops/research.md` |
| Qualify / explain a score | `modes/hr-ops/qualify.md` |
| Find decision makers | `modes/hr-ops/contacts.md` |
| Prepare outreach / top N drafts | `modes/hr-ops/outreach.md` |
| Send LinkedIn messages, connection requests or InMail on the user's instruction | `modes/hr-ops/linkedin-send.md` |
| Check LinkedIn inbox / import actual replies | `modes/hr-ops/inbox.md` |
| Who needs a follow-up / log a reply | `modes/hr-ops/followups.md` |
| Show pipeline or company status | `modes/hr-ops/pipeline.md` |

In Codex, use ordinary prompts or `codex exec --sandbox workspace-write "Use HR-Ops to research the strongest prospects"`. In clients with slash commands, `/hr-ops research <company>` maps to exactly the same mode. Do not install MCP or another AI client to operate this workspace.

The Node CLI performs deterministic collection, validation and persistence. Research/outreach without input return work briefs: **you must do the research or drafting**, then import the result. Do not stop after displaying a brief when the user asked for the complete task. Use `node hr-ops.mjs --help` and `docs/HR_OPS.md` for exact schemas. A prompt to find/evaluate clients authorizes internal discovery → research → qualification → contacts → draft preparation; never external contact.

No delegation is required. Use public information and the current client's search tools. If search is unavailable, use configured public sources and report the coverage limitation; do not pretend a seed list is broad discovery. Unknown facts remain unknown. Never invent approval references, contact details, inventory or commercial terms.

For assisted identity research, use `inventory assist --input FILE` to combine cached evidence, possible matches and exact ATS links. After source review, `inventory confirm --input FILE --revision N` writes a capture-backed identity through the existing inventory review. Read `docs/HR_OPS_IDENTITY_REVIEW.md`. The `bedrock-talent` agency feed adds one bounded public Ashby board with unreviewed role attribution; use agency queries for unfamiliar-company discovery. Identity support, role text and a qualified score are distinct from partner appetite or contact permission.

For repeatable discovery, inspect `sources --starter`; catalog companies still need independent qualification. Follow the shared research-run budget procedure and preserve quote/summary, retrieval precision and publication dates. A score and weighted signal coverage do not establish buying intent. Check no-agency policies and existing LATAM coverage before drafting.

Use `discover --plan --icp both` to distinguish reusable sources, seeds, controls and pipeline exclusions. Retained public feed readers are available through `discover --feed remotive|hackernews|remoteok|himalayas --run ID` after configuring a scoped run. They produce cached unverified employer leads linked to inventory, not prospects or qualifying evidence. Inspect `inventory_matches` and resolve duplicates before new-company research. RemoteOK covers its latest-postings window; Himalayas reads one bounded public page and does not follow cursors. Use the separate agency source/query plan for attributable client vacancies. Finish independent research before reporting a discovery target as achieved.

`discover --feed speedrun --run ID` adds one portfolio jobs page with explicit filters/scope; `discover --feed by-recruiting --icp agency --run ID` reads one official client-opportunity board. Follow `docs/HR_OPS_DISCOVERY_ADAPTERS.md`. Anonymous client labels never become employer identities, existing agencies remain refresh work and unreviewed listings cannot qualify prospects. For system validation, `scripts/hr-ops-judgment.mjs` emits an independent source/claim packet; compare `--reference` only after recording judgments. Office locations are not hiring eligibility, team locations are not employment/supplier arrangements, and similar postings prove neither distinct hires nor duplicates.
