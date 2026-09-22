/*
 * Replays the production How it wins screen (packages/llm/src/how-it-wins-screen.ts) over frozen
 * corpus cards. No judge call; output goes to eval/runs/ only. See
 * docs/superpowers/specs/2026-09-22-how-it-wins-layered-screen.md.
 *
 *   npx tsx eval/how-it-wins-screen/run.ts --labeled --bias 40 --seed s1 --cap-usd 1
 *
 * --labeled   the sitting cards in eval/curation/how-it-wins/ (holdout excluded)
 * --bias N    N more seeded corpus cards; --bias 400 covers the whole non-holdout corpus
 * --cap-usd   hard spend ceiling at Jev list price, at most 5; the run stops before exceeding it
 */
import { existsSync, readFileSync } from "node:fs";
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { coldStartCardSchema } from "@cold-start/core";
import {
  HOW_IT_WINS_SCREEN_MODEL,
  HOW_IT_WINS_SCREEN_THRESHOLDS,
  HOW_IT_WINS_SCREEN_VERSION,
  createJevAsk,
  loadHowItWinsJudgeRules,
  screenHowItWins,
  type JevAsk
} from "@cold-start/llm";
import { HOW_IT_WINS_BATCH_HOLDOUT } from "../../scripts/how-it-wins-batch";
import { createSeededRng, shuffled } from "../../scripts/eval-curation-lib";

const USD_PER_INPUT_TOKEN = 0.042 / 1_000_000;
const CONCURRENCY = 4;
const CORPUS_DIR = "eval/curation/corpus/cards";
const LABELED_DIR = "eval/curation/how-it-wins";

function arg(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index === -1 ? undefined : process.argv[index + 1];
}

function loadApiKey(): string {
  if (process.env.TYPESAFE_API_KEY) return process.env.TYPESAFE_API_KEY;
  const envPath = path.resolve(process.cwd(), ".env.local");
  const line = existsSync(envPath)
    ? readFileSync(envPath, "utf8").split("\n").find((entry) => entry.startsWith("TYPESAFE_API_KEY="))
    : undefined;
  if (!line) throw new Error("TYPESAFE_API_KEY is not set in the environment or .env.local");
  return line.slice("TYPESAFE_API_KEY=".length).trim();
}

// Wraps the production client with a spend cap. Each request reserves a conservative estimate
// first, so parallel requests cannot jointly overshoot.
function cappedAsk(ask: JevAsk, capUsd: number) {
  const spend = { usd: 0, inputTokens: 0, requests: 0 };
  const wrapped: JevAsk = async (state, questions) => {
    const estimate = Math.ceil(JSON.stringify({ state, questions }).length / 3) * USD_PER_INPUT_TOKEN;
    if (spend.usd + estimate > capUsd) throw new Error(`budget cap $${capUsd} reached at $${spend.usd.toFixed(4)}`);
    spend.usd += estimate;
    spend.requests += 1;
    const reply = await ask(state, questions);
    spend.usd += reply.inputTokens * USD_PER_INPUT_TOKEN - estimate;
    spend.inputTokens += reply.inputTokens;
    return reply;
  };
  return { ask: wrapped, spend };
}

// Every strategy id named anywhere in either arm's read: running, the pair, and next.
function labeledStrategies(record: unknown, validIds: Set<string>): string[] {
  const found = new Set<string>();
  const walk = (value: unknown, keyName = ""): void => {
    if (typeof value === "string" && (keyName === "strategy" || keyName === "strategies") && validIds.has(value)) found.add(value);
    else if (Array.isArray(value)) value.forEach((item) => walk(item, keyName));
    else if (value && typeof value === "object") for (const [k, v] of Object.entries(value)) walk(v, k);
  };
  const arms = (record as { arms?: Record<string, { read?: unknown }> }).arms ?? {};
  for (const arm of Object.values(arms)) walk(arm.read);
  return [...found].sort();
}

async function runPool<T, R>(items: T[], worker: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, items.length) }, async () => {
    while (next < items.length) {
      const index = next++;
      out[index] = await worker(items[index]!);
    }
  }));
  return out;
}

function percentile(values: number[], p: number): number {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted.length === 0 ? 0 : sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))]!;
}

async function main() {
  const capUsd = Number(arg("--cap-usd") ?? "1");
  if (!(capUsd > 0 && capUsd <= 5)) throw new Error("--cap-usd must be above 0 and at most 5");
  const seed = arg("--seed") ?? "hiw-screen-1";
  const biasCount = Number(arg("--bias") ?? "0");
  const holdout = new Set(HOW_IT_WINS_BATCH_HOLDOUT);
  const rules = loadHowItWinsJudgeRules();
  const validIds = new Set<string>(rules.strategyRubric.map((row) => row.strategyId));

  const labels = new Map<string, string[]>();
  if (process.argv.includes("--labeled")) {
    for (const file of (await readdir(LABELED_DIR)).filter((name) => name.endsWith(".json") && name !== "index.json")) {
      const slug = file.replace(/\.json$/, "");
      if (holdout.has(slug)) continue;
      labels.set(slug, labeledStrategies(JSON.parse(await readFile(path.join(LABELED_DIR, file), "utf8")), validIds));
    }
  }
  const corpusSlugs = (await readdir(CORPUS_DIR)).filter((name) => name.endsWith(".json")).map((name) => name.replace(/\.json$/, ""));
  const biasSlugs = shuffled(corpusSlugs.filter((slug) => !holdout.has(slug) && !labels.has(slug)), createSeededRng(seed)).slice(0, biasCount);
  const slugs = [...labels.keys(), ...biasSlugs];
  if (slugs.length === 0) throw new Error("Nothing to run: pass --labeled and/or --bias N");

  const { ask, spend } = cappedAsk(createJevAsk({ apiKey: loadApiKey(), timeoutMs: 60_000 }), capUsd);
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const outDir = path.resolve("eval/runs/how-it-wins-screen", stamp);
  await mkdir(outDir, { recursive: true });

  const outcomes = await runPool(slugs, async (slug) => {
    const snapshot = JSON.parse(await readFile(path.join(CORPUS_DIR, `${slug}.json`), "utf8")) as { card: unknown };
    const parsed = coldStartCardSchema.safeParse(snapshot.card);
    // Production only ever screens a card that parses, so the replay skips the rest.
    if (!parsed.success) return { slug, skipped: "card fails coldStartCardSchema" as const };
    try {
      const screen = await screenHowItWins({ card: parsed.data, rules, ask });
      const labeled = labels.get(slug) ?? null;
      await writeFile(path.join(outDir, `${slug}.json`), `${JSON.stringify({ slug, labeled, ...screen }, null, 2)}\n`);
      process.stdout.write(`${slug}: kept ${screen.keptIds.length}/80, shortlist ${screen.shortlistIds.length}, ${screen.latencyMs} ms\n`);
      return { slug, screen, labeled };
    } catch (error) {
      process.stdout.write(`${slug}: FAILED ${(error as Error).message}\n`);
      return { slug, failed: (error as Error).message };
    }
  });

  const done = outcomes.filter((o): o is Extract<typeof o, { screen: unknown }> => "screen" in o);
  const ids = rules.strategyRubric.map((row) => row.strategyId);
  const perStrategy = ids.map((id) => ({
    id,
    keptRate: done.filter((o) => o.screen.keptIds.includes(id)).length / Math.max(1, done.length),
    shortlistRate: done.filter((o) => o.screen.shortlistIds.includes(id)).length / Math.max(1, done.length)
  }));
  const labelOutcomes = done.flatMap((o) => (o.labeled ?? []).map((id) => ({
    kept: (o.screen.keptIds as string[]).includes(id),
    shortlisted: (o.screen.shortlistIds as string[]).includes(id)
  })));
  const summary = {
    stamp,
    version: HOW_IT_WINS_SCREEN_VERSION,
    model: HOW_IT_WINS_SCREEN_MODEL,
    thresholds: HOW_IT_WINS_SCREEN_THRESHOLDS,
    companies: {
      requested: slugs.length,
      completed: done.length,
      skipped: outcomes.filter((o) => "skipped" in o).length,
      failed: outcomes.filter((o) => "failed" in o).length
    },
    spend: { usdAtListPrice: Number(spend.usd.toFixed(5)), inputTokens: spend.inputTokens, requests: spend.requests },
    latency: {
      p50Ms: percentile(done.map((o) => o.screen.latencyMs), 0.5),
      p95Ms: percentile(done.map((o) => o.screen.latencyMs), 0.95)
    },
    keptMedian: percentile(done.map((o) => o.screen.keptIds.length), 0.5),
    labelRecall: labels.size > 0 ? {
      labels: labelOutcomes.length,
      kept: labelOutcomes.filter((o) => o.kept).length,
      shortlisted: labelOutcomes.filter((o) => o.shortlisted).length
    } : null,
    // Bias watch: strategies that reach the shortlist most often across companies.
    mostShortlisted: [...perStrategy].sort((a, b) => b.shortlistRate - a.shortlistRate).slice(0, 12),
    perStrategy
  };
  await writeFile(path.join(outDir, "summary.json"), `${JSON.stringify(summary, null, 2)}\n`);
  process.stdout.write(`\n${JSON.stringify({ ...summary, perStrategy: undefined }, null, 2)}\nWrote ${outDir}\n`);
}

main().catch((error) => {
  process.stderr.write(`${(error as Error).stack ?? error}\n`);
  process.exit(1);
});
