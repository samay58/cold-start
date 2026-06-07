#!/usr/bin/env tsx
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";
import { Client } from "pg";

import type { ColdStartCard, GenerationTrace } from "@cold-start/core";

type GoldenCompany = {
  name: string;
  domain: string;
  category: string;
};

type RunRow = {
  domain: string;
  mode: "basics" | "analysis";
  job_kind: string;
  status: string;
  started_at: Date;
  completed_at: Date | null;
  trace_json: GenerationTrace | null;
};

type CardRow = {
  domain: string;
  card_json: ColdStartCard;
};

type Variant = {
  id: string;
  goal: string;
  test: string;
  risk: string;
};

const VARIANTS: Variant[] = [
  {
    id: "profile-seed-before-llm",
    goal: "Cut first usable sidebar latency by using provider facts before extraction.",
    test: "Compare firstUsableCardMs against total basics duration for the golden set.",
    risk: "Seed card must keep citations and cannot invent a company summary."
  },
  {
    id: "contacts-before-heavy-profile",
    goal: "Make work emails land before block enrichment and analysis.",
    test: "Compare contactsReadyMs and email coverage against basics completion time.",
    risk: "Do not skip Apollo org verification or Hunter verification to win speed."
  },
  {
    id: "cap-slow-source-fanout",
    goal: "Reduce fetch-sources tail latency by stopping endpoints that do not add cited facts.",
    test: "Rank provider endpoint duration against applied fact count and citation count.",
    risk: "Reject if citation count or source diversity drops."
  },
  {
    id: "analysis-background-only",
    goal: "Keep investor synthesis from blocking sidebar usefulness.",
    test: "Confirm analysisReadyMs exists only on analysis runs and first usable basics stays under target.",
    risk: "Reject if extension analysis returns stale synthesis without a visible running state."
  }
];

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
  loadEnvFile(resolve(process.cwd(), ".env.production.migrate.local"));
  if (!process.env.DATABASE_URL) {
    loadEnvFile(resolve(process.cwd(), ".env.local"));
  }
}

function argValue(name: string) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function hasArg(name: string) {
  return process.argv.includes(name);
}

function readGoldenCompanies() {
  const path = resolve(process.cwd(), "eval/golden-companies.seed.json");
  const rows = JSON.parse(readFileSync(path, "utf8")) as GoldenCompany[];
  const limit = Math.max(1, Math.min(rows.length, Number(argValue("--limit") ?? rows.length) || rows.length));
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

function formatMs(value: number | null) {
  if (value === null) {
    return "-";
  }

  const seconds = Math.round(value / 1000);
  if (seconds < 60) {
    return `${seconds}s`;
  }

  return `${Math.floor(seconds / 60)}m ${String(seconds % 60).padStart(2, "0")}s`;
}

function runDurationMs(run: RunRow) {
  const end = run.completed_at ?? new Date();
  return Math.max(0, end.getTime() - run.started_at.getTime());
}

function milestone(run: RunRow, name: keyof NonNullable<GenerationTrace["milestones"]>) {
  return run.trace_json?.milestones?.[name] ?? null;
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
  if (!card) {
    return false;
  }

  return Boolean(
    card.identity.oneLiner.value ||
      card.identity.description?.value?.shortDescription ||
      card.identity.description?.value?.concept
  );
}

async function latestRuns(client: Client, domains: string[]) {
  const result = await client.query<RunRow>(latestOptimizerRunsQuery(domains));
  return result.rows;
}

export function latestOptimizerRunsQuery(domains: readonly string[]) {
  return {
    text: `select distinct on (domain, mode)
            domain, mode, job_kind, status, started_at, completed_at, trace_json
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

function endpointStats(runs: RunRow[]) {
  const byName = new Map<string, { durations: number[]; factCount: number; sourceCount: number }>();
  for (const run of runs) {
    for (const endpoint of run.trace_json?.providers?.stableenrich?.endpoints ?? []) {
      const current = byName.get(endpoint.name) ?? { durations: [], factCount: 0, sourceCount: 0 };
      if (endpoint.durationMs !== undefined) {
        current.durations.push(endpoint.durationMs);
      }
      current.factCount += endpoint.factCount;
      current.sourceCount += endpoint.sourceCount;
      byName.set(endpoint.name, current);
    }
  }

  return Array.from(byName.entries())
    .map(([name, stats]) => ({
      name,
      p50: percentile(stats.durations, 50),
      p90: percentile(stats.durations, 90),
      factCount: stats.factCount,
      sourceCount: stats.sourceCount
    }))
    .sort((left, right) => (right.p90 ?? 0) - (left.p90 ?? 0));
}

function variantScore(variant: Variant, input: {
  firstUsableP90: number | null;
  contactsP90: number | null;
  emailCoverage: number;
  medianCitations: number | null;
  slowEndpointCount: number;
}) {
  let score = 0;
  const blockers: string[] = [];

  if (variant.id === "profile-seed-before-llm" && (input.firstUsableP90 === null || input.firstUsableP90 > 30_000)) {
    score += 5;
  }
  if (variant.id === "contacts-before-heavy-profile" && (input.contactsP90 === null || input.contactsP90 > 60_000 || input.emailCoverage < 0.35)) {
    score += 5;
  }
  if (variant.id === "cap-slow-source-fanout" && input.slowEndpointCount > 0) {
    score += 3 + input.slowEndpointCount;
  }
  if (variant.id === "analysis-background-only" && (input.firstUsableP90 === null || input.firstUsableP90 > 30_000)) {
    score += 2;
  }

  if ((input.medianCitations ?? 0) < 3) {
    blockers.push("blocked until median citation count is at least 3");
  }
  if (variant.id.includes("contacts") && input.emailCoverage < 0.11) {
    blockers.push("blocked because email coverage is below the May 19 baseline");
  }

  return { ...variant, score, blockers };
}

function printTable(rows: Array<Record<string, string>>, headers: string[]) {
  const widths = Object.fromEntries(
    headers.map((header) => [header, Math.max(header.length, ...rows.map((row) => row[header]?.length ?? 0))])
  ) as Record<string, number>;

  console.log(headers.map((header) => header.padEnd(widths[header] ?? header.length)).join("  "));
  console.log(headers.map((header) => "-".repeat(widths[header] ?? header.length)).join("  "));
  for (const row of rows) {
    console.log(headers.map((header) => (row[header] ?? "").padEnd(widths[header] ?? header.length)).join("  "));
  }
}

async function main() {
  loadEnv();
  const databaseUrl = process.env.DATABASE_URL?.trim();
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is empty. Set it, or create .env.production.migrate.local.");
  }

  const companies = readGoldenCompanies();
  const domains = companies.map((company) => company.domain);
  const client = new Client({ connectionString: databaseUrl });
  await client.connect();
  try {
    const runs = await latestRuns(client, domains);
    const cards = await latestCards(client, domains);
    const basicsRuns = runs.filter((run) => run.mode === "basics");
    const analysisRuns = runs.filter((run) => run.mode === "analysis");
    const cardsList = domains.map((domain) => cards.get(domain) ?? null);
    const peopleTotal = cardsList.reduce((sum, card) => sum + people(card).length, 0);
    const emailTotal = cardsList.reduce((sum, card) => sum + emailCount(card), 0);
    const emailCoverage = peopleTotal > 0 ? emailTotal / peopleTotal : 0;
    const citationCounts = cardsList.map((card) => card?.citations.length ?? 0);
    const firstUsable = basicsRuns.map((run) => milestone(run, "firstUsableCardMs") ?? runDurationMs(run));
    const contactsReady = basicsRuns.flatMap((run) => {
      const value = milestone(run, "contactsReadyMs");
      return value === null ? [] : [value];
    });
    const slowEndpoints = endpointStats(runs).filter((endpoint) => (endpoint.p90 ?? 0) > 10_000 && endpoint.factCount === 0);
    const metricSummary = {
      firstUsableP50: percentile(firstUsable, 50),
      firstUsableP90: percentile(firstUsable, 90),
      contactsP50: percentile(contactsReady, 50),
      contactsP90: percentile(contactsReady, 90),
      basicsP50: percentile(basicsRuns.map(runDurationMs), 50),
      basicsP90: percentile(basicsRuns.map(runDurationMs), 90),
      analysisP50: percentile(analysisRuns.map(runDurationMs), 50),
      analysisP90: percentile(analysisRuns.map(runDurationMs), 90),
      medianCitations: percentile(citationCounts, 50),
      emailCoverage,
      peopleTotal,
      emailTotal,
      uiCompleteCount: cardsList.filter((card) => Boolean(card?.identity.name.value) && hasSummary(card) && (card?.citations.length ?? 0) > 0).length
    };
    const rankedVariants = VARIANTS
      .map((variant) =>
        variantScore(variant, {
          firstUsableP90: metricSummary.firstUsableP90,
          contactsP90: metricSummary.contactsP90,
          emailCoverage,
          medianCitations: metricSummary.medianCitations,
          slowEndpointCount: slowEndpoints.length
        })
      )
      .sort((left, right) => right.score - left.score);

    if (hasArg("--json")) {
      console.log(JSON.stringify({ metricSummary, slowEndpoints, rankedVariants }, null, 2));
      return;
    }

    console.log("Cold Start optimizer");
    console.log(`golden companies: ${companies.length}`);
    console.log("");
    printTable(
      [
        {
          lane: "first usable",
          p50: formatMs(metricSummary.firstUsableP50),
          p90: formatMs(metricSummary.firstUsableP90),
          target: "15s p50, 30s p90"
        },
        {
          lane: "contacts",
          p50: formatMs(metricSummary.contactsP50),
          p90: formatMs(metricSummary.contactsP90),
          target: "30s p50, 60s p90"
        },
        {
          lane: "basics total",
          p50: formatMs(metricSummary.basicsP50),
          p90: formatMs(metricSummary.basicsP90),
          target: "background after first usable"
        },
        {
          lane: "analysis total",
          p50: formatMs(metricSummary.analysisP50),
          p90: formatMs(metricSummary.analysisP90),
          target: "never blocks sidebar"
        }
      ],
      ["lane", "p50", "p90", "target"]
    );
    console.log("");
    console.log(`emails: ${metricSummary.emailTotal}/${metricSummary.peopleTotal} people (${Math.round(emailCoverage * 100)}%)`);
    console.log(`median citations: ${metricSummary.medianCitations ?? "-"}`);
    console.log(`ui complete: ${metricSummary.uiCompleteCount}/${companies.length}`);

    const endpointRows = endpointStats(runs).slice(0, 8).map((endpoint) => ({
      endpoint: endpoint.name,
      p50: formatMs(endpoint.p50),
      p90: formatMs(endpoint.p90),
      facts: String(endpoint.factCount),
      sources: String(endpoint.sourceCount)
    }));
    if (endpointRows.length > 0) {
      console.log("");
      console.log("slowest provider endpoints");
      printTable(endpointRows, ["endpoint", "p50", "p90", "facts", "sources"]);
    }

    console.log("");
    console.log("next variants");
    printTable(
      rankedVariants.map((variant) => ({
        variant: variant.id,
        score: String(variant.score),
        status: variant.blockers.length > 0 ? variant.blockers.join("; ") : "ready",
        test: variant.test
      })),
      ["variant", "score", "status", "test"]
    );
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
