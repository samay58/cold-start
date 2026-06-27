#!/usr/bin/env tsx
// Read-only first-usable latency measurement over recent REAL-traffic basics runs.
//
// Why this exists instead of optimize:generation / evo-generation-benchmark: those sample the
// golden eval set (distinct-on per golden domain), which is a tiny, noisy population for latency
// (only ~10-18 domains have recent basics runs, and several are degenerate near-zero test rows with
// no LLM calls). First-usable latency must be measured over recent real production traffic.
//
// Methodology:
// - Population: basics runs (job_kind = mode = 'basics') in the recent window, real traffic, all domains.
// - firstUsableCardMs is milestone-only: a run that never recorded the milestone never produced a
//   usable card, so it has no first-usable latency and is excluded (not folded in via run duration).
// - Split by whether the seed cleared the public-profile gate (firstUsable == seedCardMs, the fast
//   path) vs seed-missed (first usable waited for the extract_full LLM).
// - Decompose into compute (fetch-sources + generate-card on the critical path) and the residual
//   non-compute overhead (Inngest dispatch/retry/queue). The lifecycle fix targets that overhead, so
//   re-running this after a deploy shows whether the dispatch tail collapsed.
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";
import { Client } from "pg";

import type { GenerationTrace } from "@cold-start/core";

type RunRow = {
  id: string;
  domain: string;
  status: string;
  started_at: Date;
  completed_at: Date | null;
  trace_json: GenerationTrace | null;
};

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

function parseSinceDays(input: string | undefined, fallbackDays: number) {
  const relative = input?.match(/^(\d+)d$/i);
  const days = relative ? Number(relative[1]) : Number(input);
  return Number.isFinite(days) && days > 0 ? days : fallbackDays;
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
  const seconds = value / 1000;
  return seconds < 60 ? `${seconds.toFixed(1)}s` : `${Math.floor(seconds / 60)}m ${String(Math.round(seconds % 60)).padStart(2, "0")}s`;
}

function milestoneMs(run: RunRow, name: keyof NonNullable<GenerationTrace["milestones"]>) {
  const value = run.trace_json?.milestones?.[name];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function stepMs(run: RunRow, name: string) {
  const step = run.trace_json?.steps?.[name];
  return step && typeof step.durationMs === "number" ? step.durationMs : null;
}

function sum(...values: Array<number | null>) {
  return values.reduce((total: number, value) => total + (value ?? 0), 0);
}

function distribution(values: number[]) {
  return {
    n: values.length,
    p50: percentile(values, 50),
    p90: percentile(values, 90),
    p95: percentile(values, 95),
    max: values.length > 0 ? Math.max(...values) : null
  };
}

export function recentBasicsRunsQuery(sinceIso: string, limit: number) {
  return {
    text: `select id, domain, status, started_at, completed_at, trace_json
             from generation_runs
            where job_kind = 'basics' and mode = 'basics'
              and started_at >= $1
            order by started_at desc
            limit $2`,
    values: [sinceIso, limit]
  };
}

async function main() {
  loadEnv();
  const databaseUrl = process.env.DATABASE_URL?.trim();
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is empty. Run `set -a; source .env.production.migrate.local; set +a` first.");
  }

  const sinceDays = parseSinceDays(argValue("--since"), 14);
  const limit = Math.max(1, Math.min(5000, Number(argValue("--limit") ?? 500) || 500));
  // Physical floor: a real generation cannot fetch sources and store a usable card in well under a
  // second, so sub-floor milestones are degenerate seed/test rows. Default 1s; set 0 to keep all.
  const minMs = Math.max(0, Number(argValue("--min-ms") ?? 1000) || 0);
  const sinceIso = new Date(Date.now() - sinceDays * 86_400_000).toISOString();

  const client = new Client({ connectionString: databaseUrl });
  await client.connect();
  try {
    const { rows } = await client.query<RunRow>(recentBasicsRunsQuery(sinceIso, limit));

    const complete = rows.filter((run) => run.status === "complete");
    const running = rows.filter((run) => run.status === "running");
    const failed = rows.filter((run) => run.status === "failed");

    const usable = complete.filter((run) => {
      const value = milestoneMs(run, "firstUsableCardMs");
      return value !== null && value >= minMs;
    });
    const seedPassed = usable.filter((run) => milestoneMs(run, "seedCardMs") !== null);
    const seedMissed = usable.filter((run) => milestoneMs(run, "seedCardMs") === null);

    const firstUsable = usable.map((run) => milestoneMs(run, "firstUsableCardMs") as number);
    // Non-compute overhead = first-usable minus the critical-path compute that precedes the card store.
    // Seed-passed: plan + fetch + seed build. Seed-missed: also the extract_full generate-card step.
    const overhead = usable.map((run) => {
      const fu = milestoneMs(run, "firstUsableCardMs") as number;
      const base = sum(stepMs(run, "plan-research"), stepMs(run, "fetch-sources"), stepMs(run, "seed-profile-card"));
      const compute = milestoneMs(run, "seedCardMs") !== null ? base : base + (stepMs(run, "generate-card") ?? 0);
      return fu - compute;
    });

    const summary = {
      window: { sinceDays, sinceIso, limit, minMs },
      population: {
        basicsRuns: rows.length,
        complete: complete.length,
        running: running.length,
        failed: failed.length,
        reachedFirstUsable: usable.length
      },
      firstUsableMs: distribution(firstUsable),
      seedPassedFirstUsableMs: distribution(seedPassed.map((run) => milestoneMs(run, "firstUsableCardMs") as number)),
      seedMissedFirstUsableMs: distribution(seedMissed.map((run) => milestoneMs(run, "firstUsableCardMs") as number)),
      seedPassRate: usable.length > 0 ? seedPassed.length / usable.length : null,
      fetchSourcesMs: distribution(usable.map((run) => stepMs(run, "fetch-sources")).filter((value): value is number => value !== null)),
      generateCardMs: distribution(seedMissed.map((run) => stepMs(run, "generate-card")).filter((value): value is number => value !== null)),
      nonComputeOverheadMs: distribution(overhead),
      contactsReadyMs: distribution(usable.map((run) => milestoneMs(run, "contactsReadyMs")).filter((value): value is number => value !== null))
    };

    if (hasArg("--json")) {
      console.log(JSON.stringify(summary, null, 2));
      return;
    }

    console.log(`first-usable latency over real-traffic basics runs (last ${sinceDays}d, limit ${limit}, floor ${minMs}ms)`);
    console.log(`population: ${rows.length} basics runs (${complete.length} complete, ${running.length} running, ${failed.length} failed); ${usable.length} reached first usable`);
    console.log("");
    const lane = (label: string, dist: ReturnType<typeof distribution>) =>
      `${label.padEnd(26)} n=${String(dist.n).padStart(4)}  p50=${formatMs(dist.p50).padStart(8)}  p90=${formatMs(dist.p90).padStart(8)}  p95=${formatMs(dist.p95).padStart(8)}  max=${formatMs(dist.max).padStart(8)}`;
    console.log(lane("firstUsableCardMs", summary.firstUsableMs));
    console.log(lane("  seed-passed (fast path)", summary.seedPassedFirstUsableMs));
    console.log(lane("  seed-missed (extract)", summary.seedMissedFirstUsableMs));
    console.log(lane("fetch-sources (compute)", summary.fetchSourcesMs));
    console.log(lane("generate-card (seed-miss)", summary.generateCardMs));
    console.log(lane("non-compute overhead", summary.nonComputeOverheadMs));
    console.log(lane("contactsReadyMs", summary.contactsReadyMs));
    console.log("");
    console.log(`seed-pass rate: ${summary.seedPassRate === null ? "-" : `${Math.round(summary.seedPassRate * 100)}%`}`);
    if (summary.nonComputeOverheadMs.p90 !== null && summary.firstUsableMs.p90 !== null && summary.firstUsableMs.p90 > 0) {
      console.log(`p90 is ${Math.round((summary.nonComputeOverheadMs.p90 / summary.firstUsableMs.p90) * 100)}% non-compute (Inngest dispatch/retry overhead)`);
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
