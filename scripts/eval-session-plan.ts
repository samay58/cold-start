import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { buildSessionPlan, type PoolEntry } from "./eval-curation-lib";

function arg(flag: string): string | undefined {
  const i = process.argv.indexOf(flag);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function main() {
  const poolPath = arg("--pool") ?? path.join("eval", "curation", "pool.json");
  const seed = arg("--seed");
  if (!seed) throw new Error("--seed is required; the seed pins group composition for resumable sittings");
  const pool = JSON.parse(await readFile(poolPath, "utf8")) as { entries: PoolEntry[] };
  const plan = buildSessionPlan(pool.entries, seed);
  const outPath = path.join(path.dirname(poolPath), "session-plan.json");
  await writeFile(outPath, JSON.stringify(plan, null, 2));
  console.log(`wrote ${plan.rounds.length} rounds to ${outPath}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
