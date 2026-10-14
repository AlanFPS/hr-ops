import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { performance } from "node:perf_hooks";
import { prospect, config, now } from "../tests/hr-ops/fixtures.mjs";
import { hash, scoreProspect } from "../lib/hr-ops/model.mjs";
import { LocalRepository } from "../lib/hr-ops/store.mjs";

const results = [];
for (const [count, historyCount] of [
  [100, 25],
  [1000, 50],
]) {
  const root = mkdtempSync(join(tmpdir(), "hr-benchmark-")),
    repo = new LocalRepository(root);
  try {
    mkdirSync(repo.records, { recursive: true });
    let bytes = 0;
    for (let n = 0; n < count; n++) {
      const p = prospect();
      p.name = `Benchmark ${n}`;
      p.website = `https://benchmark-${n}.example`;
      p.domains = [`benchmark-${n}.example`];
      p.id = hash(p.domains[0]).slice(0, 16);
      p.revision = historyCount;
      const { history, ...snapshot } = structuredClone(p);
      p.history = Array.from({ length: historyCount }, (_, i) => ({
        id: hash(`${p.id}:${i}`).slice(0, 16),
        at: now.toISOString(),
        action: "research",
        from: "RESEARCHING",
        to: "RESEARCHING",
        reason: "Synthetic representative history",
        evidence: ["site"],
        before: snapshot,
        after: snapshot,
      }));
      const data = JSON.stringify(p);
      bytes += Buffer.byteLength(data);
      writeFileSync(join(repo.records, p.id + ".json"), data);
    }
    const start = performance.now(),
      records = repo.list(),
      read = performance.now();
    records.map((p) => scoreProspect(p, config(), now));
    const end = performance.now();
    results.push({
      count,
      history_per_record: historyCount,
      megabytes: Math.round(bytes / 1e6),
      read_validate_ms: Math.round(read - start),
      score_ms: Math.round(end - read),
    });
    console.log(JSON.stringify(results.at(-1)));
  } finally {
    rmSync(root, { recursive: true, force: true, maxRetries: 5 });
  }
}
