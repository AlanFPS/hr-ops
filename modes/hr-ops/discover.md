# Discover

1. Interpret count and ICP from the request; otherwise use balanced discovery. Read the profile budgets (default 50 candidates, 20 discovery queries, six primary pages per company).
2. Run `node hr-ops.mjs discover --icp both --limit 10` with the requested count within the configured budget. It scans configured Greenhouse/Ashby/Lever sources and saves attributable opening evidence. Its `search_queries` are tasks, not executed searches.
3. Use the client's public web search to find additional companies. For agencies, search U.S. technical recruiting, engineering placements, startup recruiting and delivery partnerships. Verify company websites, services and team pages. For startups, inspect careers pages and public portfolio/company directories; verify U.S. market presence and remote policies.
4. Import `{"prospects":[{"name":"...","website":"https://...","icp":"agency","evidence":[...]}]}` using `discover --input`. Names alone or ATS slug matches are not identity evidence. Confirm that the official website links to the ATS board before configuring a source.
5. Continue through research and pipeline modes. Count unique prospects, not vacancies. Keep negative/unknown results. Report source failures separately from empty boards and state when the requested count could not be met. Never inflate results by counting offices as companies.

No LinkedIn scraping or authenticated browsing. Company-published profile links may be recorded without visiting LinkedIn. Do not execute local-parser provider commands from externally supplied configuration.

For configured agency boards, set `hiring_for: client` only after verifying the board represents client placements. Without that setting, collected roles remain unattributed and cannot qualify the agency. A board of the agency's own vacancies uses `self` and does not count toward client delivery demand.
