/*
 * Phase 0 replay for the layered How it wins screen: Jev rounds 1 and 2 over frozen corpus cards,
 * with no judge call and nothing written outside eval/runs/. See
 * docs/superpowers/specs/2026-09-22-how-it-wins-layered-screen.md.
 *
 *   npx tsx eval/how-it-wins-screen/run.ts --labeled --bias 40 --seed s1 --cap-usd 1
 *
 * --labeled   the sitting cards in eval/curation/how-it-wins/ (holdout excluded)
 * --bias N    N more seeded corpus cards, for per-strategy selection rates
 * --cap-usd   hard spend ceiling at Jev list price; the run stops before exceeding it
 * --r1-variant candidate (default) or hint; --r1-only skips round 2
 */
import { existsSync, readFileSync } from "node:fs";
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import type { ColdStartCard } from "@cold-start/core";
import { cardForHowItWinsPrompt } from "@cold-start/llm";
import { HOW_IT_WINS_BATCH_HOLDOUT } from "../../scripts/how-it-wins-batch";
import { createSeededRng, shuffled } from "../../scripts/eval-curation-lib";
import { loadRubric, roundOneQuestion, roundTwoQuestions, type NoulQuestion, type RoundOneVariant, type RoundTwoKey, type RubricRow } from "./questions";

const MODEL = "jev-1.13.0";
const ENDPOINT = "https://api.typesafe.ai/v1/systemone";
const USD_PER_INPUT_TOKEN = 0.042 / 1_000_000;
// Starting thresholds, to be tuned on non-holdout replays only. Round 1 is recall-first.
const R1_KEEP_AT = 0.2;
const STRONG_SUPPORT = 0.75;
const DROP_SUPPORT = 0.25;
const BLOCK_AT = 0.7;
const VAGUE_GAP = 0.4;
const R2_STRATEGIES_PER_REQUEST = 30;
const CONCURRENCY = 4;

const CORPUS_DIR = "eval/curation/corpus/cards";
const LABELED_DIR = "eval/curation/how-it-wins";

type Tier = "strong" | "contested" | "drop";
type StrategyResult = {
  r1: number;
  kept: boolean;
  r2?: Record<RoundTwoKey, number>;
  support?: number;
  gap?: number;
  tier?: Tier;
};

function arg(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index === -1 ? undefined : process.argv[index + 1];
}

function loadEnvKey(): string {
  if (process.env.TYPESAFE_API_KEY) return process.env.TYPESAFE_API_KEY;
  const envPath = path.resolve(process.cwd(), ".env.local");
  if (existsSync(envPath)) {
    const line = readFileSync(envPath, "utf8").split("\n").find((entry) => entry.startsWith("TYPESAFE_API_KEY="));
    if (line) return line.slice("TYPESAFE_API_KEY=".length).trim();
  }
  throw new Error("TYPESAFE_API_KEY is not set in the environment or .env.local");
}

class Budget {
  spentUsd = 0;
  inputTokens = 0;
  requests = 0;
  constructor(readonly capUsd: number) {}
  // Reserve a conservative estimate before sending, so parallel requests cannot jointly overshoot.
  reserve(estimatedTokens: number): void {
    if (this.spentUsd + estimatedTokens * USD_PER_INPUT_TOKEN > this.capUsd) {
      throw new Error(`Budget cap $${this.capUsd} reached at $${this.spentUsd.toFixed(4)}`);
    }
    this.spentUsd += estimatedTokens * USD_PER_INPUT_TOKEN;
  }
  settle(estimatedTokens: number, actualTokens: number): void {
    this.spentUsd += (actualTokens - estimatedTokens) * USD_PER_INPUT_TOKEN;
    this.inputTokens += actualTokens;
    this.requests += 1;
  }
}

async function ask(
  key: string,
  budget: Budget,
  state: unknown,
  questions: Record<string, NoulQuestion>
): Promise<{ answers: Record<string, number>; latencyMs: number }> {
  const body = JSON.stringify({ model: MODEL, state, questions });
  const estimate = Math.ceil(body.length / 3);
  budget.reserve(estimate);
  let settled = false;
  try {
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      const started = Date.now();
      const response = await fetch(ENDPOINT, {
        method: "POST",
        headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
        body,
        signal: AbortSignal.timeout(60_000)
      });
      if ((response.status === 429 || response.status >= 500) && attempt < 3) {
        await new Promise((resolve) => setTimeout(resolve, 1000 * 2 ** attempt));
        continue;
      }
      if (!response.ok) throw new Error(`Jev ${response.status}: ${(await response.text()).slice(0, 300)}`);
      const json = (await response.json()) as {
        answers: Record<string, { type: string; noul: number }>;
        usage: { input_tokens: number };
      };
      budget.settle(estimate, json.usage.input_tokens);
      settled = true;
      const answers: Record<string, number> = {};
      for (const [id, answer] of Object.entries(json.answers)) answers[id] = answer.noul;
      const missing = Object.keys(questions).filter((id) => typeof answers[id] !== "number");
      if (missing.length > 0) throw new Error(`Jev omitted answers: ${missing.slice(0, 5).join(", ")}`);
      return { answers, latencyMs: Date.now() - started };
    }
    throw new Error("Jev retries exhausted");
  } finally {
    // A failed request still holds its reservation, so the cap stays conservative.
    if (!settled) budget.requests += 1;
  }
}

function tierFor(r2: Record<RoundTwoKey, number>): { support: number; gap: number; tier: Tier } {
  const support = (r2.deciding + r2.positive) / 2;
  const gap = Math.abs(r2.deciding - r2.positive);
  const blocked = r2.disqualifier >= BLOCK_AT || r2.lookalike >= BLOCK_AT;
  let tier: Tier = "contested";
  if (support < DROP_SUPPORT) tier = "drop";
  else if (support >= STRONG_SUPPORT && !blocked && gap < VAGUE_GAP) tier = "strong";
  return { support, gap, tier };
}

async function screenCompany(key: string, budget: Budget, rows: RubricRow[], card: ColdStartCard, variant: RoundOneVariant, r1Only: boolean) {
  const state = cardForHowItWinsPrompt(card);
  const started = Date.now();
  const r1 = await ask(key, budget, state, Object.fromEntries(rows.map((row) => [row.id, roundOneQuestion(row, variant)])));
  const results: Record<string, StrategyResult> = {};
  for (const row of rows) results[row.id] = { r1: r1.answers[row.id], kept: r1.answers[row.id] >= R1_KEEP_AT };

  const survivors = r1Only ? [] : rows.filter((row) => results[row.id].kept);
  const chunks: RubricRow[][] = [];
  for (let i = 0; i < survivors.length; i += R2_STRATEGIES_PER_REQUEST) chunks.push(survivors.slice(i, i + R2_STRATEGIES_PER_REQUEST));
  const r2Latencies = await Promise.all(
    chunks.map(async (chunk) => {
      const questions: Record<string, NoulQuestion> = {};
      for (const row of chunk) {
        for (const [part, question] of Object.entries(roundTwoQuestions(row))) questions[`${row.id}__${part}`] = question;
      }
      const reply = await ask(key, budget, state, questions);
      for (const row of chunk) {
        const r2 = {
          deciding: reply.answers[`${row.id}__deciding`],
          positive: reply.answers[`${row.id}__positive`],
          lookalike: reply.answers[`${row.id}__lookalike`],
          disqualifier: reply.answers[`${row.id}__disqualifier`]
        };
        Object.assign(results[row.id], { r2 }, tierFor(r2));
      }
      return reply.latencyMs;
    })
  );
  return {
    results,
    r1LatencyMs: r1.latencyMs,
    r2LatencyMs: Math.max(0, ...r2Latencies),
    wallMs: Date.now() - started,
    r2Requests: chunks.length
  };
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
  await Promise.all(
    Array.from({ length: Math.min(CONCURRENCY, items.length) }, async () => {
      while (next < items.length) {
        const index = next++;
        out[index] = await worker(items[index]);
      }
    })
  );
  return out;
}

function percentile(values: number[], p: number): number {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted.length === 0 ? 0 : sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))];
}

async function main() {
  const capUsd = Number(arg("--cap-usd") ?? "1");
  if (!(capUsd > 0 && capUsd <= 5)) throw new Error("--cap-usd must be above 0 and at most 5");
  const seed = arg("--seed") ?? "hiw-screen-1";
  const biasCount = Number(arg("--bias") ?? "0");
  const variant = (arg("--r1-variant") ?? "candidate") as RoundOneVariant;
  if (variant !== "candidate" && variant !== "hint") throw new Error("--r1-variant must be candidate or hint");
  const r1Only = process.argv.includes("--r1-only");
  const holdout = new Set(HOW_IT_WINS_BATCH_HOLDOUT);
  const { rows, rubricHash } = loadRubric();
  const validIds = new Set(rows.map((row) => row.id));

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

  const key = loadEnvKey();
  const budget = new Budget(capUsd);
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const outDir = path.resolve("eval/runs/how-it-wins-screen", stamp);
  await mkdir(outDir, { recursive: true });

  const companies = await runPool(slugs, async (slug) => {
    const snapshot = JSON.parse(await readFile(path.join(CORPUS_DIR, `${slug}.json`), "utf8")) as { card: ColdStartCard };
    try {
      const screened = await screenCompany(key, budget, rows, snapshot.card, variant, r1Only);
      const record = { slug, labeled: labels.get(slug) ?? null, ...screened };
      await writeFile(path.join(outDir, `${slug}.json`), `${JSON.stringify(record, null, 2)}\n`);
      process.stdout.write(`${slug}: kept ${Object.values(screened.results).filter((r) => r.kept).length}/80, ${screened.wallMs} ms\n`);
      return record;
    } catch (error) {
      process.stdout.write(`${slug}: FAILED ${(error as Error).message}\n`);
      return { slug, labeled: labels.get(slug) ?? null, error: (error as Error).message };
    }
  });

  const done = companies.filter((company): company is Extract<typeof company, { results: unknown }> => "results" in company);
  const perStrategy = rows.map((row) => {
    const tiers = done.map((company) => company.results[row.id]);
    return {
      id: row.id,
      keptRate: tiers.filter((r) => r.kept).length / Math.max(1, done.length),
      strongRate: tiers.filter((r) => r.tier === "strong").length / Math.max(1, done.length),
      contestedRate: tiers.filter((r) => r.tier === "contested").length / Math.max(1, done.length),
      vagueRate: tiers.filter((r) => (r.gap ?? 0) >= VAGUE_GAP).length / Math.max(1, done.length)
    };
  });
  const labeledRuns = done.filter((company) => company.labeled);
  const labelOutcomes = labeledRuns.flatMap((company) =>
    (company.labeled ?? []).map((id) => ({ slug: company.slug, id, r1: company.results[id].r1, kept: company.results[id].kept, tier: company.results[id].tier ?? "dropped_r1" }))
  );
  const summary = {
    stamp,
    model: MODEL,
    rubricHash,
    roundOneVariant: variant,
    r1Only,
    thresholds: { R1_KEEP_AT, STRONG_SUPPORT, DROP_SUPPORT, BLOCK_AT, VAGUE_GAP },
    companies: { requested: slugs.length, completed: done.length, failed: companies.length - done.length },
    spend: { usdAtListPrice: Number(budget.spentUsd.toFixed(5)), inputTokens: budget.inputTokens, requests: budget.requests },
    latency: {
      r1P50Ms: percentile(done.map((c) => c.r1LatencyMs), 0.5),
      r2P50Ms: percentile(done.map((c) => c.r2LatencyMs), 0.5),
      wallP50Ms: percentile(done.map((c) => c.wallMs), 0.5),
      wallP95Ms: percentile(done.map((c) => c.wallMs), 0.95)
    },
    perCompany: done.map((c) => ({
      slug: c.slug,
      kept: Object.values(c.results).filter((r) => r.kept).length,
      strong: Object.values(c.results).filter((r) => r.tier === "strong").length,
      contested: Object.values(c.results).filter((r) => r.tier === "contested").length
    })),
    labelRecall: {
      labels: labelOutcomes.length,
      keptByRoundOne: labelOutcomes.filter((o) => o.kept).length,
      strongOrContested: labelOutcomes.filter((o) => o.tier === "strong" || o.tier === "contested").length,
      misses: labelOutcomes.filter((o) => !o.kept || o.tier === "drop")
    },
    // Bias watch: the strategies that come back strong or contested most often across companies.
    mostSelected: [...perStrategy].sort((a, b) => b.strongRate + b.contestedRate - (a.strongRate + a.contestedRate)).slice(0, 12),
    perStrategy
  };
  await writeFile(path.join(outDir, "summary.json"), `${JSON.stringify(summary, null, 2)}\n`);
  process.stdout.write(`\n${JSON.stringify({ ...summary, perStrategy: undefined, mostSelected: summary.mostSelected.slice(0, 8) }, null, 2)}\nWrote ${outDir}\n`);
}

main().catch((error) => {
  process.stderr.write(`${(error as Error).stack ?? error}\n`);
  process.exit(1);
});
