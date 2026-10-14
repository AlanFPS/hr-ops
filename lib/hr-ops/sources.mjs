import { readFileSync } from "node:fs";
import {
  assert,
  domain,
  fresh,
  validateEvidence,
  url,
  text,
} from "./model.mjs";
import greenhouse from "../../providers/greenhouse.mjs";
import ashby from "../../providers/ashby.mjs";
import lever from "../../providers/lever.mjs";

const PROVIDERS = { greenhouse, ashby, lever };

export function sourceCatalog() {
  return JSON.parse(
    readFileSync(
      new URL("../../templates/hr-ops-sources.json", import.meta.url),
      "utf8",
    ),
  );
}
export function starterSources() {
  return JSON.parse(
    readFileSync(
      new URL("../../templates/hr-ops-sources.json", import.meta.url),
      "utf8",
    ),
  ).sources;
}
export function inspectSources(
  c,
  {
    starter = c.discovery.starter_sources,
    now = new Date(),
    icp = "both",
  } = {},
) {
  assert(
    ["both", "agency", "startup"].includes(icp),
    "Invalid source ICP filter",
  );
  // User entries replace catalog entries by canonical domain, including disabled entries.
  // Malformed domains get their own entry so they cannot abort other sources.
  const entries = new Map();
  for (const source of [
    ...(starter ? starterSources() : []),
    ...c.discovery.sources,
  ]) {
    let key;
    try {
      key = domain(source?.website);
    } catch {
      key = Symbol("invalid source");
    }
    entries.set(key, source);
  }
  const sources = [],
    diagnostics = [];
  for (const [index, s] of [...entries.values()].entries()) {
    // An unrelated ICP cannot block the selected one. Unknown ICPs still need
    // diagnostics, rather than silently disappearing through the filter.
    if (
      icp !== "both" &&
      ["agency", "startup"].includes(s?.icp) &&
      s.icp !== icp &&
      s.enabled !== false
    )
      continue;
    try {
      assert(
        s && typeof s === "object" && !Array.isArray(s),
        "Source must be an object",
      );
      domain(s.website);
      if (s.enabled !== undefined)
        assert(
          typeof s.enabled === "boolean",
          "Source enabled must be boolean",
        );
      if (s.enabled === false) continue; // minimal domain-only override is valid
      text(s.name, "source name", 160);
      assert(["agency", "startup"].includes(s.icp), "Invalid source ICP");
      assert(
        ["greenhouse", "ashby", "lever", "manual"].includes(s.provider),
        "Unsupported source provider",
      );
      if (s.careers_url !== undefined) url(s.careers_url);
      if (s.api !== undefined) url(s.api);
      if (s.provider !== "manual")
        assert(
          PROVIDERS[s.provider].detect(s),
          "Cannot resolve a trusted provider URL from source api/careers_url",
        );
      validateEvidence(s.identity_evidence, now);
      sources.push({
        ...s,
        identity_stale: !fresh(
          s.identity_evidence.observed_at,
          c.freshness.facts,
          now,
        ),
      });
    } catch (error) {
      diagnostics.push({
        company: typeof s?.name === "string" ? s.name : `Source ${index + 1}`,
        website: typeof s?.website === "string" ? s.website : null,
        status: "error",
        error: error.message,
      });
    }
  }
  return { sources, diagnostics };
}

export function effectiveSources(c, options = {}) {
  const result = inspectSources(c, options);
  assert(
    result.diagnostics.length === 0,
    result.diagnostics.map((d) => `${d.company}: ${d.error}`).join("; "),
  );
  return result.sources;
}
