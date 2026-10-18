# Research validation

An opening earns current demand credit only when it is open, reviewed, fresh, attributable to the correct employer/client and has complete `verification` checks. This applies to both qualification and provisional admission. ICP weights, thresholds and country restrictions are unchanged. A successful fetch or a `reviewed: true` flag is insufficient.

## Opening payload

Add this object to each researched opening. Every evidence ID must exist in the prospect's evidence array. Use short role-body excerpts, not search snippets, list titles or generic service copy.

```json
{
  "verification": {
    "role": {
      "status": "read",
      "evidence": ["role-body"],
      "rationale": "The description assigns backend API development to this role."
    },
    "ownership": {
      "status": "verified",
      "method": "official_link",
      "url": "https://jobs.example/company",
      "evidence": ["official-careers-link"],
      "rationale": "The company careers page links to this board."
    },
    "attribution": {
      "status": "verified",
      "evidence": ["role-employer"],
      "rationale": "The role describes the company's own engineering team."
    },
    "currency": {
      "status": "confirmed",
      "evidence": ["current-primary-listing"],
      "rationale": "The current official board contains this opening."
    },
    "market": {
      "status": "us",
      "evidence": ["role-geography"],
      "rationale": "This opening explicitly includes the United States."
    }
  }
}
```

The example `ownership.url` must be the actual observed link and identify the opening or its `board`. Include that exact URL in the cited official-page excerpt or explicitly labeled source summary. A company logo, similar slug, identical content or search snippet is not an official ownership link. For a role published directly on the company website, use `method: first_party` and omit the linked URL. First-party evidence must come from the canonical company domain or its recorded aliases/subdomains. A provider hostname is not a company alias merely because it hosts its jobs.

Supported statuses:

| Check | Positive status | Incomplete or negative statuses |
|---|---|---|
| role | read | unreadable, unknown |
| ownership | verified | unverified, unknown |
| attribution | verified | unknown |
| currency | confirmed | conflicting, unknown |
| market (optional) | us | non_us, unknown |

Non-unknown checks require evidence and a rationale. Confirmed currency requires primary evidence. All four required checks must retain fresh evidence under the existing opening freshness window. A role body on a secondary source can support role interpretation, but it cannot by itself establish current official availability or board ownership. Missing checks and unknowns remain research tasks and earn no demand credit. Unsupported structures, unknown keys and missing references are rejected.

For agencies, read enough of the role to establish client hiring rather than the agency's internal vacancy. The client's identity may remain confidential. Generic staffing services and a title alone do not establish an attributable current client role. Restricted U.S.-only client roles may still support the existing provisional agency partnership path, but never establish LATAM-serviceable demand.

## Conflicts and interruptions

If an older/secondary listing disagrees with the current official board, record `currency.status: conflicting`, retain evidence from both sides and explain the conflict. This also sets a persistent reconciliation marker, which incomplete follow-on reviews cannot clear. Do not mark the role closed solely because it disappeared. An inaccessible, partial or malformed board cannot establish absence. A role confirmed closed should retain its history with opening status closed.

Complete provider collections continue to set `reconciliation_needed` only for affected missing openings. A boolean review cannot clear that marker. Explicit verified research with primary currency evidence at least as recent as the conflicting collection is required. Reuse the saved opening ID. Research imports without `verification` invalidate that opening's previous review checks rather than carrying them onto changed role content. Generic fact/contact research leaves untouched openings alone.

An error during research validation does not authorize a fallback write or a direct JSON edit. Reload on revision conflict and reconcile against the saved record. Use existing captures before another request.

## Reports, compatibility and acceptance

`score.opening_verification_gaps` and research briefs expose missing checks by opening ID. Demand, tiers, outreach eligibility and draft currency use the same gate. Saved dossiers are derived and may become stale after this release; use `reports refresh` when intentionally updating an operating workspace. No automatic rewrite of private data is performed.

Existing schema 1/2 records and historical snapshots remain readable. The metadata is additive; there is no manufactured migration evidence. Openings without checks lose current demand credit until revalidated. Historical scores, interactions and commercial lifecycle states are preserved. Previously generated drafts can become ineligible under current research rules even if their saved historical ready flag was true.

Pilot summaries retain `target_match` for observed U.S. company fit plus validated demand, separately reporting `us_opening_target_match` and counts of explicitly U.S.-located openings. A U.S.-market agency's Irish vacancy is not a U.S.-located opening. `market: us` is a geographic label, not LATAM eligibility, employment-law clearance or proof of buying intent. Unknown geography is never inferred from headquarters.

Source reports preserve `distinct_reported_demand_matches` as historical operator claims and add `distinct_validated_demand_matches` based on current records. Source ranking uses the validated count. A source-yield number does not certify the source or future results.

These checks enforce evidence structure, provenance constraints and freshness. An agent can still misread a source or falsely attest that a role was read. Human semantic review remains necessary. Native search calls remain subject to the existing procedural budget rule: wait for a successful matching reservation receipt before dispatch; do not dispatch while the reservation process is still running. Disclose deviations, source failures and target shortfalls honestly.

## Regression map

`tests/hr-ops/research-validation.test.mjs` covers missing historical checks, each incomplete gate, title-only agency boards, own-versus-client hiring, official-link/tenant validation, secondary-only currency, stale check evidence, complete-board reconciliation, omission invalidation, draft/history preservation, geographic acceptance counts and source-yield discounting. Existing provider, identity, qualification, recovery, browser and cross-client tests remain required. Tests use fictional data and never send.
