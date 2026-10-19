# Research controls and starter sources

The shared HR-Ops modes load these procedures for Codex and Claude alike. They do not require MCP, slash commands or OpenClaw.

## Starter catalog

`templates/hr-ops-sources.json` separates acquisition seeds, directories/query recipes, research references and acceptance controls. It contains nine acquisition seeds after the October 18, 2026 local-date pilot (capture timestamps are October 19 UTC); counts are not a release gate. River and Socket use ATS readers; other entries return manual tasks. BY Recruiting and Right Fit Advisors were added after reading official boards and attributable full-stack client roles. Their known LATAM reach does not establish a need for another supplier. Recruiter counts and partner appetite still require research, and similar postings must not become invented hire counts. Recruiting from Scratch is an overlap control outside default acquisition seeds. Metabase and Socket have dated primary ownership evidence. Cadre publishes no job list and is retained only as a services research reference, outside vacancy-discovery seeds. Inclusion never establishes qualification. Identity evidence older than freshness.facts produces a refresh task. `sources --catalog` shows all categories.

Inspect `node hr-ops.mjs sources --starter`. Use `discover --starter --run ID --limit 6` per invocation or set `hr_ops.discovery.starter_sources: true`. The setting defaults to false so upgrading an existing workspace does not silently add network sources. The shared discovery mode explicitly uses the catalog unless the user restricts sources. User entries in `hr_ops.discovery.sources` override catalog entries by canonical domain, including `enabled: false`:

```yaml
hr_ops:
  discovery:
    starter_sources: true
    sources:
      - website: https://river.com
        enabled: false
```

Merge these keys into the existing profile; do not replace firm configuration. New/custom entries use the complete source schema in the operating guide, with `provider: manual` for unsupported sites. Do not personalize the shipped template. Manual tasks are not persisted as discovered prospects until the agent verifies/imports identity. Counts distinguish collected prospects from pending tasks.

`doctor` validates enabled source configuration and reports named `source_errors` with a failing exit status. Discovery isolates invalid entries in its diagnostics and continues valid sources; an invalid source in an excluded ICP does not block the requested ICP. Supported API entries need a resolvable, trusted `api` or `careers_url`. Disabled entries need only a valid website and `enabled: false`.

## Research run ledger

Choose one run ID per research batch and reuse it on resume. Before a native web search reserve this input with `node hr-ops.mjs budget --run ID --input FILE`:

```json
{"kind":"query","target":"US startup backend remote jobs"}
```

Before a native page fetch reserve:

```json
{"kind":"page","company":"https://example.com","target":"https://example.com/careers"}
```

Each attempt, including retries, failures, ATS reads and secondary pages, counts. Limits are pinned when the run first reserves an attempt. Stop at exhaustion, retain unknowns and report partial results. Do not create new run IDs to evade limits. `budget --run ID` inspects reservations without writing. The ledger uses the existing workspace lock and atomic file writer. Preserve it with workspace backups.

`capture` and `discover --run ID` reserve their own page/API attempts; do not reserve twice. A denied reservation is not retried, including during optional provider enrichment, and discovery reports `budget-exhausted` with `partial: true`. Other sources can still return results within their own budgets. `discover` without `--run` retains previous behavior for compatibility.

Capture dry runs validate the complete input without fetching or writing. `discover --run ID --dry-run` validates sources and any existing ledger, performs no network requests or writes, and returns pending collection tasks with `preview` diagnostics and `network_reads_allowed: false`; it cannot propose collected openings without fetching them. Only legacy discovery previews **without** `--run` still read public boards without persisting records. Native search/browser tools are outside the ledger's technical control, and an agent with filesystem access could bypass it. This is an audited workflow limit, not independent runtime enforcement.

## Capture

`node hr-ops.mjs capture --run ID --input FILE` accepts:

```json
{"company":"https://example.com","url":"https://example.com/team"}
```

It returns normalized public text, a content hash and the actual completion timestamp. To generate evidence, supply `excerpt`, `excerpt_kind` (`quote` or `summary`) and `source_type` (`primary` or `secondary`), with optional `published_at`. Metadata without an excerpt is rejected. Invalid static inputs fail before a reservation or request, in both preview and commit.

Quotes are plain text: only whitespace is normalized, and the exact returned excerpt must occur in normalized captured text. Do not put HTML markup or encoded entities in a quotation; use the decoded visible text. Summaries require semantic review. Import evidence through `research`, never directly into prospect JSON. Captures persist under `data/hr-ops/captures/` with hashes and timestamps, linked to runs. Captured claims remain unreviewed. ATS descriptions are bounded at 20,000 characters per posting; posting IDs remain separate from requisition IDs. Text extraction is simple, reads at most 2,000,000 successful-response bytes, does not render JavaScript and rejects redirects (review the destination separately). HTTP errors retain a diagnostic excerpt from at most 8,192 body bytes. Both paths cancel the remaining stream. It uses public HTTPS GETs and existing network guards, without authentication or LinkedIn access. A failed fetch or post-fetch quote mismatch consumes its reservation.

For native tools, record retrieval time at the request. If unavailable, label the estimate `retrieval_precision: approximate`. Use `excerpt_kind: summary` for tool summaries. Preserve source publication date separately when available, especially for contact-role evidence. Primary/secondary describe provenance, not certainty or permission. Legacy evidence without metadata remains readable and explicitly unspecified.

`possibly_truncated` is conservative within six decoded bytes of the capture cap, accounting for a removed UTF-8 BOM and an incomplete final character. A near-limit flag does not prove that more content existed; it prevents treating a clipped page as complete.

## Interpretation

Scores prioritize further exploration. Weighted signal coverage includes supported hypotheses and is not a measure of certainty. An agency needs current client engineering demand, technology focus, U.S. market fit and a supported partner hypothesis for PROVISIONAL exploratory admission. Partnership appetite can remain unknown. Do not imply demonstrated buying intent, cost savings or recruiting pain without evidence.

Read explicit supplier/no-agency policies and record them as observed blockers. Existing international hiring may reduce the value of our offer. For agencies, LATAM operations establish overlap but not necessarily specialization. Missing evidence of specialization or providers is unknown, not observed false. Referral commissions do not establish demand for subcontracted delivery. Keep these distinctions in the dossier and drafts.

## Completion and resume

Use `run --run ID --action complete` when finished and `--action resume` to continue. Resume preserves attempts and pinned budgets. Queries are per run, pages per company per run, and max_candidates per discovery operation. Imports with --run link unique prospect IDs. `report` summarizes reserved effort; native-tool adherence remains procedural.

Reservations and captures support optional source/query attribution. Append interpretation outcomes against actual reservation sequences so reports distinguish access failures, reviewed demand and unresolved gaps. A successful fetch is not a demand match. See [research attribution](HR_OPS_INBOX.md#research-attribution) for payloads and outcome categories.
