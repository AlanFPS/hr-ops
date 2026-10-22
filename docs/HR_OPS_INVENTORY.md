# Unified company inventory

The inventory is a network-free research index, separate from the prospect pipeline. It reuses local JSON, the workspace data root and lock, revision-checked mutations, existing evidence validation, source overrides, validated feed captures and backup/restore diagnostics. No database, CRM, scraper or new qualification policy is added.

## Layers and identity

`node hr-ops.mjs inventory` combines:

| Layer | Interpretation |
|---|---|
| Pipeline | Canonical prospect identities and current evaluated tier; existing prospects are excluded from new-company research |
| HR sources | Enabled catalog seeds plus configured overrides, retaining identity evidence and staleness |
| Career-Ops | Retained company names/careers links; candidate scanner flags remain visible as metadata without controlling HR targeting |
| Feed captures | Cached, hash-validated observations matching current HR role patterns, with original run/capture/request provenance |
| Imported lists | User-supplied names, website claims, ICP hints and notes with source provenance; always unreviewed on import |

Supported feed readers are Remotive, HN Who is hiring, RemoteOK, Himalayas, Speedrun, BY Recruiting and Bedrock Talent. Successful collection links its exact `inventory_observation_ids` and `collection_capture_id`; no second import is required. Returned `inventory_matches` expose prior inventory work without promoting publisher claims or matching names into verified identities. Feed observations remain separate across captures with their original dates, so historical refreshes are not silently rewritten. A current observation's explicit queue exclusion is honored on cached replay. Other possible matches, including exclusions, require identity reconciliation before new-company research.

Use [assisted identity review](HR_OPS_IDENTITY_REVIEW.md) to inspect cached company evidence and exact ATS links together, then confirm reviewed primary captures through the existing revision-checked review. These commands add no automatic network reads, prospect imports or qualification changes.

Counts overlap. `supported_company_groups` counts groups joined on supported identity; `unresolved_lead_groups` counts unresolved observations, not unique employers. `groups_with_possible_matches` is a review workload, not a count of confirmed duplicates. Name and claimed-domain matches are flagged without merging. An imported claimed website never silently adopts a pipeline identity. Reviewed aliases may join supported identities, but cannot join two canonical prospects. Resolve canonical prospect conflicts separately.

Pipeline domain aliases remain authoritative and cannot be removed by an inventory review. Source disables and catalog controls remain binding for queue output. A group containing an excluded observation stays excluded until that decision is explicitly reversed. This is a research-list exclusion, not prospect suppression. Queue decisions cannot clear prospect holds, restrictions or suppression. A supported seed identity can be stale; identity support never verifies today's demand.

Only HR source/feed disables control this queue. Retained Career-Ops `enabled` values appear as `legacy_enabled` for context; a candidate scanner setting does not establish company suitability or prohibit independent HR research. No legacy title, visa, salary or geography filters are applied.

The projection updates when prospect records, source configuration or feed captures change. No synchronization job or snapshot copy is needed. Source observations are retained separately inside each supported group. Derived group IDs may change after an identity merge; review commands always target stable observation IDs. Pipeline revision/evidence-date changes alone do not change its observation ID. Reviews of removed sources remain in history and appear as `orphaned_review_ids` rather than being silently discarded.

## Commands

```text
node hr-ops.mjs inventory
node hr-ops.mjs inventory queue --icp unknown --limit 20
node hr-ops.mjs inventory queue --scope refresh --icp agency --limit 10
node hr-ops.mjs inventory queue --scope all --limit 20
node hr-ops.mjs inventory import --input leads.json --revision 0 --dry-run
node hr-ops.mjs inventory import --input leads.json --revision 0
node hr-ops.mjs inventory review --input review.json --revision 1
```

`--icp` supports `both` (all, including unknown), `startup`, `agency` and `unknown`. Hints are not verified classification. `--limit` is a display limit from 1 to 10,000, independent of research budgets. `matched`, `returned` and `truncated` make incomplete display explicit. Queue tasks distinguish identity review, identity research and demand research. `queued` items sort first, then high/normal/low priority and name. Priority is not an ICP score. Excluded/control/disabled/existing groups remain inspectable in the full inventory.

Import JSON:

```json
{
  "source": {
    "reference": "User-supplied hiring list, 2026-10-19",
    "url": "https://lists.example/companies",
    "observed_at": null
  },
  "companies": [
    {
      "name": "Example Labs",
      "website": "https://example-labs.example",
      "icp": "startup",
      "note": "Secondary list claims remote roles; counts, engineering demand and geography remain unverified."
    }
  ]
}
```

Only `name` is required per company. Source `reference` is required; absent source URL/time and company website/ICP/note default to null/unknown. No guessed dates or URLs are needed. Imports accept up to 1,000 rows atomically. Exact repeated content/provenance is idempotent, including repeated rows in one payload. Changed claims/provenance produce separate observations rather than overwriting history; inspect possible matches. UTF-8 with one BOM is supported by the core input reader.

Queue/exclusion review JSON:

```json
{
  "observation_id": "COPY_24_HEX_OBSERVATION_ID",
  "state": "queued",
  "priority": "high",
  "reason": "Prioritize official identity and country-scope checks."
}
```

Identity review adds an `identity` object with `website`, `aliases` (HTTPS websites, default is not implicit) and nonempty `evidence` using the existing evidence schema. Evidence must be primary with `excerpt_kind` and `retrieval_precision`; it must actually support the employer and every alias. Shared ATS/feed/social hosts cannot be canonical company domains. The validator checks structure and domain conflicts, not semantic truth. `identity: null` revokes the inventory identity without deleting the observation or prior review. All mutations require the current global inventory revision; reload/reconcile on conflict. Preview returns the proposed revision and writes nothing.

## Research handoff and boundaries

`inventory queue --scope new|refresh|all` extends this same queue. Default `new` preserves new-company behavior. Refresh tasks use saved prospects and existing research briefs to show stale facts/openings/contacts, reconciliation flags, verification and country-scope gaps, draft/contact next steps and supplier/service-fit checks. They expose the current prospect revision for the normal research API. No queue database, background requests or extra budget is introduced. Queue summaries describe the full projection; `matched` describes the selected scope and ICP.

Refresh tasks skip suppression, holds, closed commercial states, inventory exclusions, controls, disabled domains, supported blockers and confirmed out-of-range size. Unknown size stays unknown. A current explicit agency delivery request can establish the demand basis without fictional vacancies; inferred or stale requests cannot. Existing identities cannot become new companies through `--scope all`. Operator priority applies first; within a priority, reconciliation and stale/liveness review precede other gaps.

`refresh.recorded_changes` compares before/after openings, fact values/confidence and contact identity/remit in the latest recorded research or collection write, even after a later non-research action. It reports stored additions, meaningful changes and removals by record ID and fact key. These are not verified market changes or distinct requisitions. A rechecked timestamp alone does not count as a changed role. Historical snapshots are never rewritten or replayed.

For a validated structured board capture, HR-Ops reuses Career-Ops' `classifyLiveness` on only the matching role description. Whole pages/boards, unrelated jobs and feed omissions are not inputs. Manual-page captures still require the existing research review; they do not produce this classifier signal. Signals retain capture time/staleness and remain advisory. A captured expiry phrase requests review and never closes an opening. Partial collections and absent feed rows never establish closure. Refresh through existing budget/capture/research commands, preserving restrictions and history. Queue reads make no writes and spend no requests.

Ask an agent: "Import this company list into HR-Ops inventory, check possible duplicates, then show the highest-priority research tasks." Natural-language requests and `codex exec` use the same `modes/hr-ops/inventory.md`; optional slash wrappers need no separate implementation.

Research continues through existing run admission, budgets, source capture and prospect APIs. Inventory does not reserve candidates, spend requests, claim completion, or relax qualification. Supplier appetite remains unknown until evidenced. User-list role counts never become reviewed openings or exact hire counts. Feed roles retain publisher geography without declaring LATAM eligibility. No sending is supported.

## Persistence, recovery and verification

Only supplied observations and appended review snapshots are stored in `{DATA_ROOT}/data/hr-ops/inventory.json` (schema 1). Existing workspaces need no migration; an absent file means revision 0. No data is copied across workspaces. Shared seeds/legacy entries remain code-owned; user lists and review decisions remain private and gitignored.

The existing locked backup manifest automatically includes this file; restore validates it through doctor diagnostics. Retention reports include the file and history exposure. Browser cookies remain excluded under the existing backup contract. Corrupt state fails inventory reads/writes and is reported as `inventory.json`; imports never overwrite it as a repair. Back up/restore with the existing reviewed procedure. Inventory history and exports can retain old observations after a current decision changes.

`tests/hr-ops/inventory.test.mjs` covers projection purity, provenance, hostile supplied text, replay, strict schemas, revisions, domain/alias merging, name/website ambiguities, canonical prospect conflicts, queue exclusion/reversal, source controls, identity revocation, feed provenance, workspace isolation, backup/restore equality, corruption and BOM/CLI behavior. All fixtures are local; tests perform no external communication.

| Failure to prevent | Verification |
|---|---|
| A supplied list becomes qualified prospects | Import/replay checks zero prospect creation and unresolved identity; hostile note remains inert text |
| Similar names or publisher websites silently merge companies | Separate unresolved groups and possible matches; explicit primary-backed identity/alias review |
| An alias merges two saved prospects | Atomic rejection before inventory persistence |
| Queueing rewrites identity evidence or loses a revocation | Source-preservation test plus revoke/queue sequence |
| A prospect revision loses inventory decisions | Research update preserves observation ID and appended review |
| Concurrent intake overwrites another list | Two writers with the same expected revision yield one success and one conflict |
| Exclusion clears suppression or bypasses disabled sources | Existing prospect remains unchanged; controls/disables/exclusions block queue output |
| Cache data loses request provenance or becomes current demand | Retained run/capture/sequence/geography with no qualification or identity promotion |
| Workspace data leaks or corruption is overwritten | Independent roots, restore equality, exposure listing, diagnostic failure and corrupt-restore rejection |
