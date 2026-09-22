/*
 * Scores a screen run against the current judge's all-80 verdicts, cached by
 * scripts/how-it-wins-batch.ts in eval/curation/how-it-wins-batch/_judgments/.
 *
 *   npx tsx eval/how-it-wins-screen/score.ts --run <screen run dir>
 *
 * Shortlists use the percentile the screen computed from the committed calibration table.
 */
import { existsSync } from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { howItWinsJudgmentSchema, type ColdStartCard } from "@cold-start/core";
import { loadHowItWinsJudgeRules } from "@cold-start/llm";
import { HOW_IT_WINS_JUDGMENT_CACHE_DIR, judgmentCacheKeyForCard } from "../../scripts/how-it-wins-eval-shared";

type Screened = {
  slug: string;
  strategies: Record<string, { roundOne: number; support: number; percentile: number }>;
  shortlistIds: string[];
};

const LIVE = new Set(["current", "not_yet", "open_question"]);

function arg(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index === -1 ? undefined : process.argv[index + 1];
}

async function loadRun(dir: string): Promise<Screened[]> {
  const files = (await readdir(dir)).filter((name) => name.endsWith(".json") && name !== "summary.json");
  const runs = await Promise.all(files.map(async (name) => JSON.parse(await readFile(path.join(dir, name), "utf8")) as Screened & { error?: string }));
  return runs.filter((run) => run.strategies);
}

async function main() {
  const runDir = arg("--run");
  if (!runDir) throw new Error("--run <screen run dir> is required");
  const runs = await loadRun(path.resolve(runDir));
  const rules = loadHowItWinsJudgeRules();

  const rows: Array<{ slug: string; id: string; disposition: string; r1: number; support: number; pct: number; shortlisted: boolean }> = [];
  const judged: string[] = [];
  for (const run of runs) {
    const snapshot = JSON.parse(await readFile(path.resolve("eval/curation/corpus/cards", `${run.slug}.json`), "utf8")) as { card: ColdStartCard };
    let file: string;
    try {
      file = path.join(HOW_IT_WINS_JUDGMENT_CACHE_DIR, judgmentCacheKeyForCard(snapshot.card, rules, true));
    } catch {
      // Cards that fail the card schema can never reach the judge, so they have no verdict to compare.
      continue;
    }
    if (!existsSync(file)) continue;
    judged.push(run.slug);
    const judgment = howItWinsJudgmentSchema.parse(JSON.parse(await readFile(file, "utf8")));
    for (const evaluation of judgment.strategyEvaluations) {
      const result = run.strategies[evaluation.strategyId]!;
      rows.push({
        slug: run.slug,
        id: evaluation.strategyId,
        disposition: evaluation.disposition,
        r1: result.roundOne,
        support: result.support,
        pct: result.percentile,
        shortlisted: run.shortlistIds.includes(evaluation.strategyId)
      });
    }
  }
  if (judged.length === 0) throw new Error("No cached judge verdicts match this run's companies");

  const live = rows.filter((row) => LIVE.has(row.disposition));
  const count = (predicate: (row: (typeof rows)[number]) => boolean, set = live) => set.filter(predicate).length;
  process.stdout.write(`Judged companies: ${judged.length} (${judged.join(", ")})\n`);
  process.stdout.write(`Judge dispositions: ${["current", "not_yet", "open_question"].map((d) => `${d} ${count((r) => r.disposition === d, rows)}`).join(", ")}\n\n`);

  process.stdout.write("Round 1 recall of live strategies (current, not_yet, open_question) by keep threshold:\n");
  for (const threshold of [0.05, 0.1, 0.15, 0.2, 0.3]) {
    const kept = rows.filter((row) => row.r1 >= threshold).length / judged.length;
    const current = rows.filter((row) => row.disposition === "current");
    process.stdout.write(
      `  p>=${threshold}: live ${count((row) => row.r1 >= threshold)}/${live.length}, current ${count((row) => row.r1 >= threshold, current)}/${current.length}, mean kept ${kept.toFixed(1)}\n`
    );
  }

  const shortlist = (slug: string, size: number, key: "support" | "pct") =>
    new Set(rows.filter((row) => row.slug === slug).sort((a, b) => (b[key] ?? 0) - (a[key] ?? 0)).slice(0, size).map((row) => row.id));
  process.stdout.write("\nShortlist recall by size (live strategies inside the top N):\n");
  for (const size of [12, 16, 20, 25, 30]) {
    const byKey = (key: "support" | "pct") => {
      let hit = 0;
      for (const slug of judged) {
        const list = shortlist(slug, size, key);
        hit += live.filter((row) => row.slug === slug && list.has(row.id)).length;
      }
      return `${hit}/${live.length}`;
    };
    process.stdout.write(`  top ${size}: raw support ${byKey("support")}, calibrated ${byKey("pct")}\n`);
  }
  process.stdout.write(`  screen's own shortlist: ${count((row) => row.shortlisted)}/${live.length} live, current ${count((row) => row.shortlisted, rows.filter((r) => r.disposition === "current"))}/${rows.filter((r) => r.disposition === "current").length}\n`);

  const misses = live.filter((row) => row.r1 < 0.2).sort((a, b) => a.r1 - b.r1);
  process.stdout.write(`\nLive strategies round 1 would drop at p<0.2 (${misses.length}):\n`);
  for (const row of misses) process.stdout.write(`  ${row.slug} ${row.id} ${row.disposition} r1=${row.r1.toFixed(2)}\n`);

  const frequency = new Map<string, number>();
  for (const row of rows.filter((r) => r.disposition === "current")) frequency.set(row.id, (frequency.get(row.id) ?? 0) + 1);
  process.stdout.write(`\nJudge's current labels by frequency: ${[...frequency].sort((a, b) => b[1] - a[1]).map(([id, n]) => `${id} ${n}`).join(", ")}\n`);
}

main().catch((error) => {
  process.stderr.write(`${(error as Error).stack ?? error}\n`);
  process.exit(1);
});
