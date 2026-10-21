# Reusing Career-Ops discovery sources

Reviewed locally on 2026-10-19 UTC. The retained `templates/portals.example.yml` contains 39 configured search recipes, 138 tracked company entries and 25 job-board entries, including disabled examples. These are configuration counts, not 202 verified websites or qualified prospects. The complete upstream-derived inventory is already in this checkout; no GitHub download was necessary. Preserve legacy configuration and its original meaning.

HR-Ops can use these sources to identify employers. A job listing is a research lead, not evidence that a company will buy recruiting services. Use the HR catalog's backend/full-stack recipes, then verify the canonical employer, current first-party role, company size, hiring countries, relevant contact and service-fit hypothesis. Keep supplier appetite and recruiting pain unknown unless supported.

## Source assessment

| Retained source family | HR use | Limits |
|---|---|---|
| Greenhouse, Ashby, Lever, Workable searches | Discover employers advertising backend/full-stack work; follow official company links to confirm tenant ownership | ATS identity, structured Remote and separate posting IDs do not prove ownership, LATAM eligibility or distinct hires |
| Wellfound | Startup/company discovery; public role pages expose team-size bands, company location and advertised hiring geography | Bands are approximate and can be stale. Fresh index snippets can point to a removed role. Do not log in, apply or infer ownership from a matching name |
| YC Jobs and company directory | Discover funded small employers, founders and location-specific jobs | Current YC and official-company inventories can disagree. Confirm the actual primary vacancy; generic visa metadata can conflict with role country text |
| We Work Remotely, Remotive, Working Nomads, RemoteOK, Himalayas | Discover named employers and remote engineering demand; use available role/location/size fields | Worldwide tags may conflict with the role body. Aggregators include enterprises, consultancies, competing LATAM suppliers and expired jobs |
| TrueUp, Remote Rocketship | Additional employer and role discovery | Reconfirm freshness, ownership and hiring geography; no live access certification from this review |
| HN Who's Hiring, Python.org Jobs | Find smaller engineering employers and their official careers links | Use current dated posts, not an old monthly thread. An employer-authored post still needs current role/identity verification |
| Insight Partners portfolio jobs | U.S. portfolio employer discovery | Filter company size and current role geography. VC investment does not establish need or willingness to use an agency |
| b2venture, Cherry, Atomico, Earlybird, Speedinvest, HV Capital, Point Nine, Founderful portfolios | Conditional discovery of companies with verified U.S. market presence | Many entries are outside the initial geography; fund location and funding alone do not establish company fit |
| AI-jobs, FwdDeploy, DevRelX, DevRel Job Board, EU Data Jobs | Secondary routes when an actual backend/full-stack role is present | Specialist titles and DevRel/ML/data-only roles are outside the initial specialization unless the role body supports the target work |
| EU Remote Jobs, Manfred, Tecnoempleo, JobFluent, Welcome to the Jungle, Jooble Spain | Conditional employer discovery | Do not inherit Spain/EU targeting or assume an employer accepts LATAM because it offers remote work |
| SolidJobs IT, JustJoin.it, NoFluffJobs, joinup.ch, Invest Ottawa | Conditional engineering/company discovery | Regional focus may limit U.S. client yield. Canada-only employers or listings do not establish the initial U.S. market criterion |
| SolidJobs engineering, marketing, sales, HR, logistics, finance and other categories | Retained examples, outside the default backend/full-stack acquisition search | Select software work only when relevant; these categories are not additional startup lists |
| Kariyer, Yenibiris, Secretcv, Isin Olsun, Jobstreet Indonesia, Glints Indonesia | Low priority under the current U.S. ICP | Regional hiring does not establish U.S. presence, cross-border hiring or service fit |
| Telegram job channels | Optional unverified leads, disabled in the retained template | Identity, freshness and permission require review. No automatic channel scraping |
| LinkedIn search recipe | Company-published profile references and human research only within the existing workflow | This catalog does not authorize profile scraping, automated connections or messaging |
| 138 tracked company boards | A reusable pool of employers to screen, including Resend, Clerk and WorkOS | The list includes large enterprises and companies outside the target market. Do not import it wholesale or regard legacy enabled flags as HR qualification |

## Catalog additions and verification limits

HR now exposes the retained RemoteOK and Himalayas public readers in addition to Remotive/HN through `discover --feed ID --run ID`. Their bounded, unverified employer observations connect directly to inventory with capture/request provenance and possible-duplicate review links. See [reader contracts and limitations](HR_OPS_SETUP_AND_DISCOVERY.md#selected-retained-feed-readers). Company ATS readers help research a known tenant; they do not themselves discover an unknown employer population. Broader portfolio readers with paging, POST requests or internal retries need explicit request-budget adaptation before use, so this release does not silently enable them.

[Resend's official careers page](https://resend.com/careers) was checked on 2026-10-19 and added as a manual seed with dated identity evidence. Its backend listing described Americas time zones, which does not establish a permitted-country list or supplier demand. Reverify the listing before use. Catalog admission makes a reusable research task, not a qualified prospect or approved recipient.

The table above is a structural assessment of the retained configuration. It is not live certification of every source. A fresh search-index result can point to a removed vacancy, and an HTTP success can contain only navigation or unrelated roles. Retain the exact attempted URL, transport diagnostic and actual role evidence separately. A readable company page cannot support a claim about a different URL's HTTP failure.

Blocked public reads must not be retried through another reader to bypass restrictions. Search results remain discovery aids; they do not establish current role bodies or a complete inventory. Dated access observations and company-specific watch decisions belong in the private research ledger and shortlist, where they can be refreshed without publishing campaign state in shared documentation.

## Operating rules

- Keep the two ICPs separate. An agency's client placement is not its internal vacancy; a recruiting marketplace or LATAM delivery competitor is not automatically a partner prospect.
- Use a persistent HR research ledger, one stable candidate name and canonical company identity across domains. Count failed pages and redirects. Never create a second run to reset an allowance.
- Record whether selection came from a catalog, a search result or a directory. Local catalog selection is not new external discovery. Retain late admission flags instead of backdating them.
- Attribute demand outcomes to the reservation that actually supplied the reviewed vacancy, not the last page visited. Batched search responses can limit per-query attribution; disclose that uncertainty instead of assigning unverified yield to individual recipes. Historical corrections are appended; unresolved annotations do not erase earlier reported demand.
- Preserve disabled user overrides. The additional HR search recipes are manual tasks, not a universal scraper or a promise that all sources support size filters.
- Do not reuse candidate onboarding, applications, CV claims, visa filters or permissive missing-location behavior as positive client evidence. HR qualification, evidence thresholds and human communication boundaries remain unchanged.

Private shortlists, source-level observations, captures and budget receipts live under the resolved HR data root. Keep campaign artifacts in private data or ignored local directories. This guide contains reusable source-selection guidance only.
