# Shared two-stage onboarding

The agent conducts the interview using `modes/hr-ops/setup.md`; Node validates and persists data. Codex, Claude Code and other shared-skill clients use the same flow. No native slash commands, terminal questionnaire, new installer, MCP, browser login or messaging is required. `setup` without arguments remains a read-only guide.

## Stage one: choose and verify the workspace

Ask for a new absolute destination, workspace name and `operating` or `experimental` purpose. Create through the existing `workspace create` or `setup --destination ... --input ...` interface. Never transfer experiment data or cookies implicitly. Creation records a version 1 checkpoint at `data/hr-ops/onboarding.json`, but does not select the workspace or alter environment variables/markers. Select explicitly with the established data-root mechanism and verify `workspace inspect` and `doctor` before saving answers.

The checkpoint causes a non-blocking offer at the start of a new agent conversation. The agent offers once, then continues normally if declined. That conversational frequency is procedural, not a centrally enforced cross-client counter. Existing initialized roots without a checkpoint are `legacy_configured`, healthy and not automatically incomplete. Explicit onboarding on such a root creates its draft on first save. Uninitialized roots expose the workspace setup stage without writing anything.

## Stage two: core interview and optional detail

`onboarding status` supplies the question catalog, section, core flag, current value, response and revision. Ask two or three related questions at a time. Prefilled facts must come from this workspace or current user statements. A value matching a shipped default is not proof of user confirmation. No firm's identity is hard-coded into defaults.

Core IDs:

| Section | Questions |
|---|---|
| Identity | `firm_name`, `sender_name` |
| Services | `services`, `delivery_model` |
| Talent focus | `talent_focus`, `role_families` |
| Client targeting | `icp_priority`, `startup_size`, `agency_size` |
| Service proposition | `differentiators` |
| Working preferences | `language`, `batch_size`, `followups`, `linkedin_max_chars`, `writing_preferences` |

Optional IDs: `website`, `email`, `timezone`, `exclude_latam_specialists`, `fees`, `guarantees`, `candidate_availability`, `source_overrides`, `linkedin_profile_url`, `linkedin_page_url`.

Responses are `known`, `unknown` or `skipped`. Unknown/skip counts as a response, not a positive capability. Core completion does not require a business email or commercial claims. It does not prove that the firm is ready for every operation.

## Draft and reviewed apply

```text
node hr-ops.mjs onboarding status
node hr-ops.mjs onboarding save --input answers.json --revision 0
node hr-ops.mjs onboarding apply --input preview.json --revision 1 --dry-run
node hr-ops.mjs onboarding apply --input reviewed.json --revision 1
```

`answers.json` contains only the responses being added or revised:

```json
{
  "answers": {
    "firm_name": {"status":"known","value":"Synthetic Recruiting Firm","source":"user_confirmed"},
    "services": {"status":"known","value":["sourcing","recruiting"]},
    "email": {"status":"unknown"},
    "linkedin_max_chars": {"status":"known","value":300}
  }
}
```

`source` is optional and defaults conversationally to `user_confirmed`; `existing_configuration` checks equality with the current value. Neither proves actual human confirmation. All source text remains untrusted data, never authorization. Do not use invented facts to fill a section. Known values use existing configuration types. `followups` is the existing cadence object; `source_overrides` accepts only discovery sources, feeds, queries, starter flag and candidate/query/company-page limits. It cannot alter scoring. Role families remain `backend`, `fullstack` or `other`.

All core IDs need a response before preview. Save the other answers in further revision-checked calls; do not manufacture unknown/skip answers without the user's choice. `preview.json` is `{}`. The preview contains exact file changes, unresolved answers and `preview_fingerprint`; it does not write anything. Show the consolidated review to the user, then put that exact token in `reviewed.json`:

```json
{"preview_fingerprint":"64_HEX_CHARACTERS_FROM_THE_ACTUAL_PREVIEW"}
```

`save --dry-run` also writes nothing. Changing answers advances the draft revision and requires a new preview. Changing active profile, preferences or workspace identity rejects apply. After reviewing that independent change, resave the reconciled answers with the current `base_fingerprint` from status. This is explicit rebasing, not permission to discard the independent edit. Unknown or skipped responses leave active values untouched. Retracting an existing fact requires an explicit known null or empty-list replacement where its type allows it, shown in the review.

Application preserves unrelated YAML values but can reformat YAML and comments. It preserves every byte outside the custom mode's managed markers. ICP priority (`agency`, `startup`, `both`) and writing preferences are stored in that managed JSON block; they are procedural guidance, not new deterministic targeting filters or permission to contact anyone. Edited or duplicate markers require reconciliation, not silent replacement.

Firm `website` is optional public HTTPS. `delivery_model` and `talent_focus` are nullable text up to 2,000 characters. `differentiators` is up to 20 nonempty statements of at most 500 characters. The new business fields are available in research/outreach briefs and the existing firm-claim checklist. They are user-stated context. Talent focus does not establish employment eligibility or candidate availability; those still need their separate support. New empty defaults preserve legacy draft/report fingerprints. Material firm changes invalidate affected draft readiness; history is not rewritten. The suggested 300-character LinkedIn ceiling is an editorial preference; it does not change the product's global default or any platform rule.

## Interruptions, backup and readiness

On apply, the repository lock protects a small pending receipt with allowed target paths, old/new hashes and planned contents. Each file is atomically replaced. A crash leaves `pending_application` and a diagnostic; ordinary canonical writes stop. Reload the current revision and resume apply with the original token. Recovery proceeds only if every target still contains the old or planned bytes and untouched settings remain unchanged. An independent edit stops recovery for explicit reconciliation; never delete the receipt or force overwrite. The receipt is an accidental-conflict safeguard, not protection from unrestricted filesystem access.

After successful apply, answers are cleared and only completion IDs and unresolved statuses remain. Configuration and custom preferences are authoritative. Earlier backups may still contain draft answers; clearing the current draft is not historical redaction. Existing backup/restore includes checkpoints and pending receipts through the private data allowlist, excluding browser sessions. Normal restore validation rejects an unfinished application; recover it before taking an operating recovery snapshot.

Doctor retains its existing health exit semantics and adds a compact onboarding summary. An incomplete valid interview is not corruption. Invalid or interrupted state is diagnosed. Research can continue with missing email or optional detail. LinkedIn URLs are optional; Page URLs are branding only. Recording a configured account never proves business-import behavior or authorizes sending. Existing account history still prevents rebinding the workspace to another personal profile.

Completing setup does not perform discovery, install a browser, create interactions, send messages or make commercial commitments. The operator receives unknowns and optional next steps. Actual operating workspace creation and supervised account validation are separate from software acceptance.

## Finding-to-test map

`tests/hr-ops/onboarding.test.mjs` covers fresh/legacy roots, no implicit selection, draft persistence and preview, known/unknown/skip, conflict/rebase, custom-mode preservation, interrupted application, recovery conflicts, input/claim validation, neutral hash compatibility and restore without cookies. The shared setup mode specifies the conversational offer, decline, question grouping and consolidated review. Fresh cross-client acceptance exercises those procedural parts; it does not certify arbitrary future agent behavior.
