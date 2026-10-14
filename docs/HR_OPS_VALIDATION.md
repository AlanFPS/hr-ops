# HR-Ops validation

Current working-tree assessment: [readiness and focused repairs](HR_OPS_READINESS.md). The latest patch passes 102 HR tests and 7 retained tracker/HTTP tests, plus a copied-pilot replay. It adds explicit draft replacement and secondary agency commercial contacts. Historical client-session results below do not validate this later patch automatically.

Latest: [October 10 live operating pilot](HR_OPS_LIVE_PILOT.md) records a fresh isolated Codex run: 18 operating checks and 96 HR tests passed, with partial live research coverage and no external communications. The [operating fixes validation](HR_OPS_OPERATING_FIXES_VALIDATION.md) records the preceding controlled checks and corrected Claude outreach replay. Neither is production certification. The [October 9–10 paired acceptance rerun](HR_OPS_ACCEPTANCE_RERUN.md) and [October 9 operating acceptance repairs](HR_OPS_ACCEPTANCE_REPAIRS.md) remain historical records of earlier findings and repairs. Earlier pilot tables below are historical; in particular, the main PostHog record is now disqualified under its no-agency policy.

The transformation started from an installed, tested Career-Ops baseline. See [UPSTREAM.md](UPSTREAM.md) for the original results and preserved revisions. Tests never sent outreach or wrote to an external CRM.

The [September 29 clean-checkout acceptance record](HR_OPS_ACCEPTANCE.md) covers the pushed commit, installation, empty-workspace behavior, regression checks and a fictional backup/restore drill. It distinguishes those checks from the remaining operating-client validation.

## Automated verification

- `npm run test:hr`: 70 passing tests after both repair passes (36 original tests plus 34 regression/acceptance tests), also passing under a future clock. Synthetic fixtures are isolated from real prospect state. See [the latest repair record](code-review/hr-ops-mvp-review-fixes.md), [the first repair record](HR_OPS_REPAIRS.md), and [the historical audit](HR_OPS_AUDIT.md).
- Coverage includes explainable scores, vacancy-only rejection, agency/client attribution, role-specific geography, size overrides, stale evidence, invented fields, immutable evidence, public email provenance, duplicate postings/companies/drafts, cross-process creation locks, revision conflicts, atomic failure handling, dry runs, end-to-end CLI persistence/export, draft review hashes, firm configuration changes, follow-up cadence, replies/holds/opt-outs, commercial lifecycle gates and disabled sending/updating.
- The live persistence check also caught JSON-property-order-dependent draft IDs. Draft identity now normalizes supported fields, and a regression test confirms reordered imports are idempotent.
- The pre-existing standalone Windows updater test failure was fixed by resolving both paths before comparing repository roots. Its suite now passes 373 checks. In an HR fork, it expects the stronger fork refusal; retained upstream fixtures still exercise confirmation logic.
- Plugin mirrors, project identity and YAML workflow guards are tested. Expression-aware actionlint now checks the workflows too; YAML parsing alone missed the two repaired folded-condition errors. HR modes are excluded from the legacy translated-candidate-pipeline assertion rather than falsely wired to candidate extraction.
- The upstream release-upgrade CI job is guarded in the fork because applying Career-Ops over HR-Ops is intentionally disabled. The engine regression tests remain in the retained core suite; the HR suite tests the fork refusal explicitly.

Pre-audit retained suite: `node test-all.mjs --quick` passed **9,245 checks, zero failures**, with the same 10 baseline warnings (including absent candidate user data and upstream-author-name heuristics). That HR-only run passed **36 tests**, and syntax checking passed **761 modules**. Those results were insufficient for sign-off: the independent audit subsequently found the now-repaired edge cases. The post-repair HR, retained and web results are in [HR_OPS_REPAIRS.md](HR_OPS_REPAIRS.md). Original logs remain in `local/hr-regression-final.log`, `local/hr-tests-final.log` and `local/hr-lint-final.log`.

## Real-company pilot — September 28, 2026

Ten public companies were researched, balanced five agencies/five direct prospects. Search results led to official company pages and current role pages; open Ashby boards were also exercised through the reused providers. These are dated research observations, not claims of buying intent or permanent eligibility. The full evidence, uncertainty and draft checklists live in the local ignored dossiers. A fresh clone has no private pilot pipeline.

| Company | ICP | Score | Result | Main finding |
|---|---|---:|---|---|
| Railway | Startup | 83 | CONTACT_IDENTIFIED | Product full-stack and scalability openings advertise remote anywhere; engineering owner identified |
| PostHog | Startup | 68 | CONTACT_IDENTIFIED | Full-stack product-engineer opening has LATAM-compatible timezones; company size and functional contact need confirmation |
| Inngest | Startup | 43 | RESEARCHING | The actual engineering posting requires U.S. residence despite worldwide language on the company page |
| Render | Startup | 28 | RESEARCHING | Advertised engineering locations restrict hiring to U.S./Canada; exact backend/full-stack classification remains unverified |
| Supabase | Startup | 83 | DISQUALIFIED | Current technical demand and global hiring, but approximately 400 people exceeds the default small-company target |
| hatch I.T. | Agency | 40 | RESEARCHING | A client full-stack mandate is verified; reviewed role is New York/hybrid |
| ART2HIRE | Agency | 40 | RESEARCHING | Backend client mandate is Europe-focused; U.S.-first sourcing and a LATAM delivery gap remain unverified |
| Recruiting from Scratch | Agency | 28 | RESEARCHING | Relevant agency and founder verified; embedded inventory did not expose usable individual vacancies in this pass |
| AC Lion | Agency | 23 | RESEARCHING | Digital/executive search is established, but no current backend/full-stack mandate was verified |
| Dot Connect | Agency | 10 | RESEARCHING | Founder and embedded recruiting verified; historical case studies are not current engineering demand |

Two qualified prospects are sufficient for a useful pilot; the rubric was not relaxed to manufacture a third. Their four drafts (email and LinkedIn for each) are saved for review. They remain `CONTACT_IDENTIFIED` because the firm's name/sender and public recipient email are missing. No named email address was guessed. No interaction was recorded; the follow-up queue is correctly empty.

Source examples: [Railway full-stack role](https://railway.com/careers/full-stack), [Railway team](https://railway.com/about), [PostHog product role](https://posthog.com/careers/product-engineer), [PostHog careers](https://posthog.com/careers), [Inngest role board](https://jobs.ashbyhq.com/inngest), [Supabase Auth role](https://jobs.ashbyhq.com/supabase/e569b7f7-fa8f-4139-86f6-4f52b456882d), [hatch client role](https://www.myhatchpad.com/job/senior-software-engineer-full-stack-2/), [ART2HIRE client role](https://www.careers-page.com/art2hire-openings/job/X988WX6R), [RFS official jobs page](https://www.recruitingfromscratch.com/jobs), [AC Lion team](https://aclion.com/about-us/), [Dot Connect](https://www.dotconnectllc.com/).

## Quality findings and corrections

- **Discovery:** ten unique companies persisted. Re-importing all ten identities in dry-run detected ten existing records, with no duplicates. This is a small workflow pilot, not a measurement of market-wide recall. Agency discovery produced no fully qualified leads; future searches should focus on verified remote client mandates and delivery-partner willingness rather than generic agency lists.
- **Attribution:** a company team page can list investors as well as employees. The pilot selected actual team leaders, not investor names. Agency jobs must explicitly identify client demand. The scanner now leaves agency jobs unattributed unless the configured board is verified as client placements.
- **Contacts:** current company-published names/titles are retained with sources. Functional engineering/talent owners rank ahead of founders at larger companies. PostHog's co-CEO is a fallback, visibly flagged; an appropriate talent owner remains a research task.
- **Evidence:** unknown headcount, partner use, contractor policy and recruiting resources remain unknown. “230+ people” was not converted into an exact count. Inngest's contradictory geography and Supabase's size demonstrate that an attractive score is not sufficient to qualify.
- **Outreach:** drafts cite real roles and the recipient's responsibility, frame service fit as a question, and avoid invented pain, savings, credentials, inventory or guarantees. Firm identity is not fabricated. Changed research/firm facts invalidate drafts.
- **Persistence:** a fresh repository instance reloaded all ten records, checked fact references, verified four current drafts and confirmed zero sent/reply/commercial events. Local outputs: `local/pilot-validation.json`, `local/pilot-collection.json`, and `reports/hr-ops/`.

## Remaining production work

Confirm firm/sender identity and commercial terms; verify the best prospects' exact size, relevant hiring owner and appetite for external sourcing. Calibrate weights against real human-reviewed outcomes. Establish backups, PII retention/access controls and source refresh procedures. Use a separately enforced approval/delivery boundary before any future external automation. The filesystem adapter is suitable for a small local workspace, not a distributed multi-tenant CRM. CRM API writes, candidate matching, sending and OpenClaw deployment are intentionally absent.
