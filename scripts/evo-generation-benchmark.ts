#!/usr/bin/env tsx
import { existsSync, readFileSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";
import { Client } from "pg";

import type { ColdStartCard, GenerationTrace } from "@cold-start/core";
import { providerBudgetRegistry } from "../packages/providers/src/provider-budget";

type GoldenCompany = {
  name: string;
  domain: string;
  category: string;
};

type RunRow = {
  domain: string;
  mode: "basics" | "analysis";
  status: string;
  started_at: Date;
  completed_at: Date | null;
  cost_usd: string | null;
  trace_json: GenerationTrace | null;
};

type CardRow = {
  domain: string;
  card_json: ColdStartCard;
};

type EndpointStats = {
  wastedMs: number;
  slowNoFactCount: number;
  totalEstimatedCostUsd: number;
  budgetedNoFactTimeoutMs: number;
  budgetedNoFactCostUsd: number;
};

type BenchmarkSummary = {
  domains: number;
  cards: number;
  completeBasics: number;
  completeAnalysis: number;
  firstUsableP50Ms: number | null;
  firstUsableP90Ms: number | null;
  firstUsableSampleCount: number;
  contactsP50Ms: number | null;
  contactsP90Ms: number | null;
  avgRunCostUsd: number | null;
  maxRunCostUsd: number | null;
  medianCitations: number | null;
  missingCoreFieldCount: number;
  providerFailureCount: number;
  wastedProviderMs: number;
  slowNoFactEndpointCount: number;
  budgetedNoFactTimeoutMs: number;
  budgetedNoFactCostUsd: number;
  emailCoverage: number | null;
  uiCompleteCount: number;
};

const DEFAULT_LIMIT = 12;
const DEFAULT_MIN_SCORE = 25;

function argValue(name: string) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function hasArg(name: string) {
  return process.argv.includes(name);
}

function loadEnvFile(path: string) {
  if (!existsSync(path)) {
    return;
  }

  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    const match = line.match(/^([A-Z0-9_]+)\s*=\s*(.*)$/);
    if (!match || process.env[match[1]]) {
      continue;
    }

    process.env[match[1]] = match[2].trim().replace(/^['"]|['"]$/g, "");
  }
}

function loadEnv() {
  const explicit = argValue("--env-file");
  if (explicit) {
    loadEnvFile(resolve(process.cwd(), explicit));
  }
  loadEnvFile(resolve(process.cwd(), ".env.production.migrate.local"));
  if (!process.env.DATABASE_URL) {
    loadEnvFile(resolve(process.cwd(), ".env.local"));
  }
}

function readGoldenCompanies() {
  const seedPath = resolve(process.cwd(), "eval/golden-companies.seed.json");
  const rows = JSON.parse(readFileSync(seedPath, "utf8")) as GoldenCompany[];
  const limit = Math.max(1, Math.min(rows.length, Number(argValue("--limit") ?? DEFAULT_LIMIT) || DEFAULT_LIMIT));
  return rows.slice(0, limit);
}

function percentile(values: number[], pct: number) {
  const sorted = values.filter((value) => Number.isFinite(value)).sort((left, right) => left - right);
  if (sorted.length === 0) {
    return null;
  }

  const index = Math.min(sorted.length - 1, Math.ceil((pct / 100) * sorted.length) - 1);
  return sorted[index] ?? null;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function milestone(run: RunRow, name: keyof NonNullable<GenerationTrace["milestones"]>) {
  const value = run.trace_json?.milestones?.[name];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function runCostUsd(run: RunRow) {
  const agentcashCost = run.trace_json?.costUsdAgentcash ?? run.trace_json?.providers?.stableenrich?.walletDeltaUsd;
  const anthropicCost = run.trace_json?.costUsdAnthropic ?? run.trace_json?.llm?.totalEstimatedCostUsd;
  // Direct Exa bills the Exa account directly; traces older than the field report 0.
  const directExaCost = run.trace_json?.providers?.directExa?.estimatedCostUsd ?? 0;
  if (typeof agentcashCost === "number" && Number.isFinite(agentcashCost)) {
    return Number((agentcashCost + (anthropicCost ?? 0) + directExaCost).toFixed(6));
  }

  if (run.cost_usd !== null) {
    const parsed = Number(run.cost_usd);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }

  const llmCost = run.trace_json?.llm?.totalEstimatedCostUsd;
  return typeof llmCost === "number" && Number.isFinite(llmCost) ? llmCost : null;
}

function people(card: ColdStartCard | null) {
  if (!card) {
    return [];
  }

  return [
    ...(card.team.founders.value ?? []),
    ...(card.team.keyExecs.value ?? [])
  ];
}

function emailCount(card: ColdStartCard | null) {
  return people(card).filter((person) => Boolean(person.email)).length;
}

function hasSummary(card: ColdStartCard | null) {
  return Boolean(
    card?.identity.oneLiner.value ||
      card?.identity.description?.value?.shortDescription ||
      card?.identity.description?.value?.concept
  );
}

function missingCoreFields(card: ColdStartCard | null) {
  if (!card) {
    return ["card"];
  }

  const missing: string[] = [];
  if (!card.identity.name.value) {
    missing.push("identity.name");
  }
  if (!hasSummary(card)) {
    missing.push("identity.summary");
  }
  if (!card.funding.totalRaisedUsd.value && !card.funding.lastRound.value) {
    missing.push("funding");
  }
  if ((card.team.founders.value ?? []).length === 0 && (card.team.keyExecs.value ?? []).length === 0) {
    missing.push("team");
  }
  if (card.citations.length === 0) {
    missing.push("citations");
  }
  return missing;
}

function endpointStats(runs: RunRow[]): EndpointStats {
  let wastedMs = 0;
  let slowNoFactCount = 0;
  let totalEstimatedCostUsd = 0;
  let budgetedNoFactTimeoutMs = 0;
  let budgetedNoFactCostUsd = 0;

  for (const run of runs) {
    for (const endpoint of run.trace_json?.providers?.stableenrich?.endpoints ?? []) {
      totalEstimatedCostUsd += endpoint.estimatedCostUsd ?? 0;
      if (endpoint.status !== "ok") {
        continue;
      }
      if (endpoint.factCount === 0) {
        const budget = providerBudgetRegistry.stableenrich[endpoint.name as keyof typeof providerBudgetRegistry.stableenrich];
        wastedMs += endpoint.durationMs ?? 0;
        budgetedNoFactTimeoutMs += budget?.timeoutMs ?? endpoint.durationMs ?? 0;
        budgetedNoFactCostUsd += budget?.estimatedCostUsd ?? endpoint.estimatedCostUsd ?? 0;
        if ((endpoint.durationMs ?? 0) > 10_000) {
          slowNoFactCount += 1;
        }
      }
    }
  }

  return { wastedMs, slowNoFactCount, totalEstimatedCostUsd, budgetedNoFactTimeoutMs, budgetedNoFactCostUsd };
}

async function latestRuns(client: Client, domains: string[]) {
  const result = await client.query<RunRow>(latestProfileRunsQuery(domains));
  return result.rows;
}

export function latestProfileRunsQuery(domains: string[]) {
  return {
    text: `select distinct on (domain, mode)
            domain, mode, status, started_at, completed_at, cost_usd, trace_json
       from generation_runs
       where domain = any($1)
         and job_kind = mode::text
         and job_kind in ('basics', 'analysis')
       order by domain, mode, started_at desc`,
    values: [domains]
  };
}

async function latestCards(client: Client, domains: string[]) {
  const result = await client.query<CardRow>(
    `select domain, card_json
       from cards
       where domain = any($1)`,
    [domains]
  );
  return new Map(result.rows.map((row) => [row.domain, row.card_json]));
}

function summarize(input: { domains: string[]; runs: RunRow[]; cards: Map<string, ColdStartCard> }): BenchmarkSummary {
  const cards = input.domains.map((domain) => input.cards.get(domain) ?? null);
  const basicsRuns = input.runs.filter((run) => run.mode === "basics");
  const analysisRuns = input.runs.filter((run) => run.mode === "analysis");
  const completeBasics = basicsRuns.filter((run) => run.status === "complete").length;
  const completeAnalysis = analysisRuns.filter((run) => run.status === "complete").length;
  const costs = input.runs.flatMap((run) => {
    const cost = runCostUsd(run);
    return cost === null ? [] : [cost];
  });
  // First-usable latency must measure only runs that actually reached a usable card. A run with no
  // firstUsableCardMs milestone (failed, reused, or stranded when trace persistence failed) has no
  // first-usable latency; folding its full duration in conflates failures with slow first usable and
  // inflates the gate's tail. Mirrors the contactsReady treatment just below.
  const firstUsable = basicsRuns.flatMap((run) => {
    const value = milestone(run, "firstUsableCardMs");
    return value === null ? [] : [value];
  });
  const contactsReady = basicsRuns.flatMap((run) => {
    const value = milestone(run, "contactsReadyMs");
    return value === null ? [] : [value];
  });
  const citations = cards.map((card) => card?.citations.length ?? 0);
  const missingCoreFieldCount = cards.reduce((sum, card) => sum + missingCoreFields(card).length, 0);
  const providerFailureCount = input.runs.reduce((sum, run) => sum + (run.trace_json?.providers?.stableenrich?.failureCount ?? 0), 0);
  const endpoint = endpointStats(input.runs);
  const peopleTotal = cards.reduce((sum, card) => sum + people(card).length, 0);
  const emailTotal = cards.reduce((sum, card) => sum + emailCount(card), 0);

  return {
    domains: input.domains.length,
    cards: cards.filter(Boolean).length,
    completeBasics,
    completeAnalysis,
    firstUsableP50Ms: percentile(firstUsable, 50),
    firstUsableP90Ms: percentile(firstUsable, 90),
    firstUsableSampleCount: firstUsable.length,
    contactsP50Ms: percentile(contactsReady, 50),
    contactsP90Ms: percentile(contactsReady, 90),
    avgRunCostUsd: costs.length > 0 ? costs.reduce((sum, cost) => sum + cost, 0) / costs.length : null,
    maxRunCostUsd: costs.length > 0 ? Math.max(...costs) : null,
    medianCitations: percentile(citations, 50),
    missingCoreFieldCount,
    providerFailureCount,
    wastedProviderMs: endpoint.wastedMs,
    slowNoFactEndpointCount: endpoint.slowNoFactCount,
    budgetedNoFactTimeoutMs: endpoint.budgetedNoFactTimeoutMs,
    budgetedNoFactCostUsd: Number(endpoint.budgetedNoFactCostUsd.toFixed(4)),
    emailCoverage: peopleTotal > 0 ? emailTotal / peopleTotal : null,
    uiCompleteCount: cards.filter((card) => Boolean(card?.identity.name.value) && hasSummary(card) && (card?.citations.length ?? 0) > 0).length
  };
}

function score(summary: BenchmarkSummary) {
  const firstUsable = summary.firstUsableP90Ms === null ? 0 : clamp(1 - summary.firstUsableP90Ms / 45_000, 0, 1);
  const contacts = summary.contactsP90Ms === null ? 0.4 : clamp(1 - summary.contactsP90Ms / 90_000, 0, 1);
  const cost = summary.avgRunCostUsd === null ? 0.5 : clamp(1 - summary.avgRunCostUsd / 1.0, 0, 1);
  const waste = clamp(1 - summary.wastedProviderMs / 120_000, 0, 1);
  const budgetedWaste = 240_000 / (240_000 + summary.budgetedNoFactTimeoutMs);
  const budgetedCostWaste = 0.3 / (0.3 + summary.budgetedNoFactCostUsd);
  const coverage = summary.domains === 0 ? 0 : clamp(summary.uiCompleteCount / summary.domains, 0, 1);
  const citations = clamp((summary.medianCitations ?? 0) / 4, 0, 1);
  const providerReliability = clamp(1 - summary.providerFailureCount / Math.max(1, summary.domains * 10), 0, 1);
  const corePenalty = Math.min(15, summary.missingCoreFieldCount * 2);
  const slowEndpointPenalty = Math.min(5, summary.slowNoFactEndpointCount);

  return Number(
    (
      30 * firstUsable +
      12 * contacts +
      12 * cost +
      10 * waste +
      18 * budgetedWaste +
      8 * budgetedCostWaste +
      15 * coverage +
      8 * citations +
      5 * providerReliability -
      corePenalty -
      slowEndpointPenalty
    ).toFixed(4)
  );
}

async function writeEvoResult(payload: unknown) {
  const resultPath = process.env.EVO_RESULT_PATH;
  if (resultPath) {
    await writeFile(resultPath, `${JSON.stringify(payload, null, 2)}\n`);
  }
}

async function main() {
  loadEnv();
  const databaseUrl = process.env.DATABASE_URL?.trim();
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is empty. Pass --env-file or configure evo env with DATABASE_URL.");
  }

  const companies = readGoldenCompanies();
  const domains = companies.map((company) => company.domain);
  const client = new Client({ connectionString: databaseUrl });
  await client.connect();

  try {
    const [runs, cards] = await Promise.all([
      latestRuns(client, domains),
      latestCards(client, domains)
    ]);
    const summary = summarize({ domains, runs, cards });
    const benchmarkScore = score(summary);
    const result = {
      score: benchmarkScore,
      metric: "cold_start_generation_speed_cost_quality",
      direction: "max",
      summary
    };
    await writeEvoResult(result);

    if (hasArg("--json") || process.env.EVO_RESULT_PATH) {
      console.log(JSON.stringify(result, null, 2));
    } else {
      console.log(`score: ${benchmarkScore}`);
      console.log(JSON.stringify(summary, null, 2));
    }

    const minScore = Number(argValue("--min-score") ?? DEFAULT_MIN_SCORE);
    if (hasArg("--gate") && (!Number.isFinite(minScore) || benchmarkScore < minScore)) {
      throw new Error(`generation benchmark score ${benchmarkScore} is below gate ${minScore}`);
    }
  } finally {
    await client.end();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}
