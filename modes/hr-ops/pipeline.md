# Pipeline and status

For an overview run `pipeline --summary`; for a company run `status COMPANY --markdown`. Explain current state separately from the current qualification recommendation and disclose missing/stale evidence.

For a complete prospecting request, process discovered prospects through research, qualification and verified contact identification. Prepare outreach drafts for the strongest qualified prospects (default top three), leaving them for human review. Continue actual research after commands return task briefs; do not treat the briefs as completed work.

Resolve ambiguous names by stable ID. Honor suppression and holds. Use domain aliases only on explicit user instruction with supporting identity evidence; automatic fuzzy merges are forbidden. Export through `export --format json|csv|markdown`; these are local stdout exports, not a CRM sync. No candidate database or matching workflow is implemented yet; opening/prospect IDs provide the future linkage.
