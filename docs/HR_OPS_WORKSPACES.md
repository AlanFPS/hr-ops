# CUP Latam workspace reliability

Use Node 24 and the shared HR-Ops skill. Code stays in the checkout; each workspace has its own data root. These checks prevent accidental mixing, but do not isolate an agent that has unrestricted filesystem access.

## Create and select a clean workspace

Save an explicit UTF-8 JSON setup file, for example:

```json
{
  "name": "CUP Latam",
  "purpose": "operating",
  "config": {"firm": {"name": "CUP Latam", "sender_name": "Alan Parasole"}},
  "preferences": "No em dashes in newly authored prose. LinkedIn drafts should be extremely concise."
}
```

Then run `node hr-ops.mjs workspace create --destination ABSOLUTE_EMPTY_DIRECTORY --input setup.json`. `--dry-run` validates without creating anything. The destination must be new or empty. Creation uses shipped defaults and only the supplied configuration/preferences. It never copies the active profile, prospects, checkpoints, reviews or browser session. It does not select the destination.

Select explicitly with `HR_OPS_ROOT` in the current terminal, or a `.hr-ops-data` marker in the code checkout. Existing precedence is unchanged: `HR_OPS_ROOT`, `HR_OPS_DATA_DIR`, HR marker, retained Career-Ops root resolution, repository default. `workspace inspect` and `doctor` explain the selection and show workspace identity. Conflicting variables remain visible; the winning variable is named.

`workspace configure --input identity.json` accepts name, purpose, designated `linkedin_profile_url` and optional `linkedin_page_url`. Use an exact `https://www.linkedin.com/in/...` personal profile. A company Page (`https://www.linkedin.com/company/...`) is a branding reference only. Page messaging is unsupported. Do not guess either URL. Existing roots remain readable without identity metadata; browser commands require explicit configuration. Account history prevents rebinding a workspace to a different profile. Use another clean workspace instead.

Metadata lives in `data/hr-ops/workspace.json`. Cookies live only under `local/browser-profiles/hr-ops-linkedin`, outside the backup manifest. Backup/restore includes workspace identity, records, research ledgers, captures, inbox state, configuration, preferences and dossiers. Restore validates into a fresh directory and retains the workspace ID, but requires a new private browser login.

## Inbox migration and coverage

`node hr-ops.mjs inbox-migrate` previews the version 1 to version 2 upgrade. `inbox-migrate --apply` first creates a verified local backup, then atomically replaces inbox state. It preserves interactions, seen message identities and review resolutions. Old checkpoints remain in `legacy_coverage`; active coverage is unverified until a rescan of the original account and window succeeds. Repeating the migration is a no-op. Prospect history is not rewritten.

Focused and Other receive half the initial conversation/message allowance, then unused capacity can be borrowed. Odd one-item allowances alternate the starting folder between invocations. The global defaults remain 100 conversation observations and 1,000 message observations per invocation. Deferred large threads remain uncheckpointed and review-required. A thread larger than a full invocation is not silently truncated. Resume preserves the original start and end of the date window; start a new run for newer messages.

`last_invocation`, `invocations`, `folder_progress`, `observed_messages` and `unique_processed` distinguish observations, cumulative rereads and unique processed threads. Imported/reconciled event totals are separate. Checkpoints and progress are persisted during scanning; a read interrupted before its progress write is not a proven observation. Partial coverage never proves that there are no replies.

Full English weekday labels are resolved against the browser's local calendar only when unambiguous within the preceding week. A same-weekday label, missing clock time, unsupported label or ambiguous DST minute remains unknown. Improved parsing of a stable message ID does not recreate an unchanged identity review that was dismissed.

Review listing supports `--state pending|resolved|discarded|all`, `--reason TEXT` and `--business-match known|unknown|ambiguous`. The match filter describes identity linkage, not qualification or verified business context. `action: discard` dismisses the current review. `action: exclude` explicitly excludes that thread from HR triage; `action: include` reverses the exclusion for future scans. Both require the real human instruction in `authorization`, plus the review ID and reason. Exclusion does not suppress a prospect and never clears prospect suppression. Start a new scan after re-inclusion to revisit previously checkpointed activity.

## Current dossiers and readiness

Every canonical repository write attempts dossier publication under the same lock. Saved reports contain prospect revision, configuration fingerprint, generation time and a content hash. `doctor` reports missing/stale/failed dossiers, including changes caused by evidence aging. `reports refresh` regenerates them without changing records, revisions or historical decisions. `--dry-run` lists report status. A failed report write leaves the successful canonical record intact and returns a visible warning. Reports are derived, never the source of truth.

Doctor retains its health exit semantics. Capability readiness separately describes research, personal-profile inbox and human-operated sending as ready, missing configuration, invalid state or unvalidated. A configured account does not prove real business-import or delivery behavior. Missing business email does not block research or LinkedIn-only work. No configuration grants permission to send.

## Discovery continuity

`discover --new-only` excludes canonical domains, recorded aliases and catalog controls. Default discovery retains its existing refresh behavior. Both return exclusions and separate new-company and refreshed-company counts. The agent must use the exclusions in external searches too; native searches are not intercepted.

`sources --starter` ranks sources within each ICP using recorded distinct demand matches per readable attempt, with attributable agency client-vacancy sources ahead of directories. Unknown yield is unknown, not a quality guarantee. No unverified seeds are added merely to reach a count. Existing disabled overrides still win.

Collection diagnostics distinguish rejected redirects, HTTP failures, recognized JavaScript-only shells, partial collections and verified empty boards. The JavaScript-shell detector is conservative; other extraction failures require review. These labels never establish interpreted demand. Role-specific country restrictions and agency/client attribution remain necessary. Qualification weights and gates are unchanged.

The run ledger preserves per-operation candidate limits and per-run request limits. At the scoped candidate cap, use remaining requests on already admitted companies. `run --action inspect` exposes `scope_usage.next_action`; `run --action review` exposes per-candidate allowance and gaps. Complete a scoped run with `run --run ID --action complete --input stop.json`, including `reason` and the required `review` payload from [research completion review](HR_OPS_RESEARCH_REVIEW.md). Never count persisted identities as completed discovery or claim the candidate cap consumed remaining requests.

## Current handoff

Implementation validation uses isolated fixtures and public research only. Do not transfer experimental pipeline data into the real CUP Latam workspace. Real-account business-import validation remains a later supervised setup check because no suitable conversation exists yet. Business email and protected off-device backups remain separate operating tasks. Local snapshots alone are not disaster recovery. No CRM or OpenClaw integration is installed.

The connected fixture and finding-to-test map are in [operating reliability verification](HR_OPS_WORKSPACE_VALIDATION.md). Historical acceptance reports describe their own revisions and have not been rewritten.
