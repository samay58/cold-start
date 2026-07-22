#!/usr/bin/env tsx
// Read-only analysis-latency baseline over prod `analysis` runs. This locks the latency baseline
// BEFORE any Phase 4 lever lands, so Phase 4's exit gate (p50 <= 60s, p90 <= 90s) has a trustworthy
// before/after comparison to measure against. Zero writes; SELECT only.
//
// Population: job_kind = 'analysis' AND status = 'complete'. Never bare mode = 'analysis' -- that
// column also carries fast `section:*` jobs (a different code path, seconds not minutes) and would
// understate latency.
//
// Mandatory artifact filter (verified 2026-07-20): two rows (`you`, `typefully`) were retired by a
// stuck-run repair pass and backfilled with a shared completed_at (2026-06-26), leaving an empty
// trace (`steps: {}`, no `milestones`, no `synthesis`). One of them wall-clocks at ~27 hours. Left
// in, either row alone poisons p90/max for the whole window. Excluded here: any row whose trace is
// missing, lacks `milestones`, lacks `synthesis`, or has an empty `steps` object. This is NOT the
// same as a synthesis-withheld row -- the evidence gate blocking synthesis still records
// `synthesis: { produced: false, ... }` with a populated, non-empty `steps` object, so those rows
// stay in the population; they just contribute nothing to the synthesize/verify decomposition.
//
// Step decomposition sources:
// - `trace.steps` gives coarse step timings: plan-research, fetch-sources, generate-card, and
//   (since the 2026-07-22 step split) synthesize-card and verify-synthesis as their own lanes.
// - `trace.llm.calls[].stage` still gives the per-call synthesis/verify decomposition; on runs
//   older than the split those calls happened inside the generate-card step.
// - `research_run_events` (type = 'generation.started') gives the one timestamp this system
//   records for when Inngest actually began processing a run. `generation_runs.started_at` is set
//   at *queue* time (the /api/generate route inserts the row with status "queued" and that insert's
//   defaultNow() becomes started_at; markGenerationRun never touches started_at when it later flips
//   the row to "running"), so started_at cannot answer "how long did dispatch take" on its own --
//   dispatch = generation.started event time minus started_at.
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";
import { Client } from "pg";

import type { GenerationTrace, GenerationTraceStep } from "@cold-start/core";

type RunRow = {
  id: string;
  slug: string;
  domain: string;
  status: string;
  started_at: Date;
  completed_at: Date | null;
  trace_json: GenerationTrace | null;
};

type StartedEventRow = {
  run_id: string;
  started_event_at: Date;
};

type ExclusionReason = "no-trace" | "missing-milestones" | "missing-synthesis" | "empty-steps";

// Task 5.3's ANALYSIS_SOURCE_REFRESH plan kind, read off the trace this run actually recorded
// (providers.stableenrich.analysisSourceRefresh). A run older than that flag (or a basics run,
// though this script's population is analysis-only) never wrote the field at all; it behaved
// exactly like "full" always did (the unconditional 13-probe fetch), so absent buckets with full.
type AnalysisSourceRefreshCohort = "full" | "targeted" | "skip";

type IncludedRun = {
  slug: string;
  wallMs: number | null;
  analysisReadyMs: number | null;
  dispatchMs: number | null;
  stepMs: Record<string, number>;
  llmStageMs: Record<string, number>;
  finalizeMs: number | null;
  cohort: AnalysisSourceRefreshCohort;
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

// Nearest-rank percentile: sort ascending, take index ceil(pct/100 * n) - 1. Matches
// measure-first-usable.ts so the two baselines are comparable on the same method.
function percentile(values: number[], pct: number) {
  const sorted = values.filter((value) => Number.isFinite(value)).sort((left, right) => left - right);
  if (sorted.length === 0) {
    return null;
  }
  const index = Math.min(sorted.length - 1, Math.ceil((pct / 100) * sorted.length) - 1);
  return sorted[index] ?? null;
}

function mean(values: number[]) {
  const finite = values.filter((value) => Number.isFinite(value));
  if (finite.length === 0) {
    return null;
  }
  return finite.reduce((sum, value) => sum + value, 0) / finite.length;
}

function formatMs(value: number | null) {
  if (value === null) {
    return "-";
  }
  const seconds = value / 1000;
  return seconds < 60 ? `${seconds.toFixed(1)}s` : `${Math.floor(seconds / 60)}m ${String(Math.round(seconds % 60)).padStart(2, "0")}s`;
}

function distribution(values: number[]) {
  return {
    n: values.length,
    p50: percentile(values, 50),
    p90: percentile(values, 90),
    max: values.length > 0 ? Math.max(...values) : null
  };
}

// Mean is the required statistic (brief: "mean per-step decomposition"), but the decomposition
// lanes turn out to be right-skewed by a handful of slow Inngest dispatches (a known pattern --
// see coldstart-first-usable-dispatch-bound), so p50 rides along too: it shows the typical case
// while mean keeps the tail visible, which is the more honest baseline for Phase 4 to target.
function meanLane(values: number[]) {
  return { n: values.length, mean: mean(values), p50: percentile(values, 50) };
}

export function analysisCompleteRunsQuery(sinceIso: string, limit: number) {
  return {
    text: `select id, slug, domain, status, started_at, completed_at, trace_json
             from generation_runs
            where job_kind = 'analysis' and status = 'complete'
              and started_at >= $1
            order by started_at desc
            limit $2`,
    values: [sinceIso, limit]
  };
}

export function generationStartedEventsQuery(runIds: string[]) {
  return {
    text: `select run_id, min(created_at) as started_event_at
             from research_run_events
            where run_id = any($1::text[]) and type = 'generation.started'
            group by run_id`,
    values: [runIds]
  };
}

function exclusionReasons(trace: GenerationTrace | null): ExclusionReason[] {
  if (!trace) {
    return ["no-trace"];
  }
  const reasons: ExclusionReason[] = [];
  if (typeof trace.milestones !== "object" || trace.milestones === null) {
    reasons.push("missing-milestones");
  }
  if (typeof trace.synthesis !== "object" || trace.synthesis === null) {
    reasons.push("missing-synthesis");
  }
  if (!trace.steps || Object.keys(trace.steps).length === 0) {
    reasons.push("empty-steps");
  }
  return reasons;
}

function finiteDurationMs(step: GenerationTraceStep | undefined) {
  const value = step?.durationMs;
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function buildIncludedRun(run: RunRow, startedEventAt: Date | undefined): IncludedRun {
  const trace = run.trace_json as GenerationTrace;
  const wallMs =
    run.completed_at !== null ? run.completed_at.getTime() - run.started_at.getTime() : null;
  const analysisReadyRaw = trace.milestones?.analysisReadyMs;
  const analysisReadyMs = typeof analysisReadyRaw === "number" && Number.isFinite(analysisReadyRaw) ? analysisReadyRaw : null;
  const dispatchMs = startedEventAt ? startedEventAt.getTime() - run.started_at.getTime() : null;

  const stepMs: Record<string, number> = {};
  let stepSum = 0;
  for (const [name, step] of Object.entries(trace.steps ?? {})) {
    const durationMs = finiteDurationMs(step);
    if (durationMs !== null) {
      stepMs[name] = durationMs;
      stepSum += durationMs;
    }
  }

  const llmStageMs: Record<string, number> = {};
  for (const call of trace.llm?.calls ?? []) {
    if (typeof call.durationMs === "number" && Number.isFinite(call.durationMs)) {
      llmStageMs[call.stage] = (llmStageMs[call.stage] ?? 0) + call.durationMs;
    }
  }

  // finalize = wall time not accounted for by dispatch or any top-level trace.steps entry: card
  // storage (upsert-card, record-card-evidence, record-research-sections, record-sources),
  // wallet-snapshot-after, and mark-generation-complete. Only computed when both anchors exist.
  const finalizeMs = wallMs !== null && dispatchMs !== null ? wallMs - dispatchMs - stepSum : null;
  const cohort: AnalysisSourceRefreshCohort = trace.providers?.stableenrich?.analysisSourceRefresh ?? "full";

  return { slug: run.slug, wallMs, analysisReadyMs, dispatchMs, stepMs, llmStageMs, finalizeMs, cohort };
}

function collectByKey(rows: IncludedRun[], pick: (row: IncludedRun) => Record<string, number>) {
  const byKey = new Map<string, number[]>();
  for (const row of rows) {
    for (const [key, value] of Object.entries(pick(row))) {
      const list = byKey.get(key) ?? [];
      list.push(value);
      byKey.set(key, list);
    }
  }
  return byKey;
}

function pad(value: string, width: number) {
  return value.length >= width ? `${value.slice(0, width - 1)}…` : value.padEnd(width);
}

// Everything downstream of the included-run population: wall/analysisReadyMs percentiles, the
// dispatch/finalize mean lanes, and the trace.steps/trace.llm.calls decomposition lanes. Shared by
// the combined view and each ANALYSIS_SOURCE_REFRESH cohort so the two report the same statistics
// on the same method, just over different row sets.
function cohortSummary(runs: IncludedRun[]) {
  const wallMsDist = distribution(runs.map((run) => run.wallMs).filter((value): value is number => value !== null));
  const analysisReadyDist = distribution(
    runs.map((run) => run.analysisReadyMs).filter((value): value is number => value !== null)
  );
  const dispatchLane = meanLane(runs.map((run) => run.dispatchMs).filter((value): value is number => value !== null));
  const finalizeLane = meanLane(runs.map((run) => run.finalizeMs).filter((value): value is number => value !== null));
  const stepsByKey = collectByKey(runs, (row) => row.stepMs);
  const llmStagesByKey = collectByKey(runs, (row) => row.llmStageMs);

  const stepLanes = [...stepsByKey.entries()]
    .map(([name, values]) => ({ label: `step: ${name}`, ...meanLane(values) }))
    .sort((left, right) => (right.mean ?? 0) - (left.mean ?? 0));
  const llmLanes = [...llmStagesByKey.entries()]
    .map(([stage, values]) => ({ label: `  llm: ${stage}`, ...meanLane(values) }))
    .sort((left, right) => (right.mean ?? 0) - (left.mean ?? 0));

  return {
    n: runs.length,
    wallMs: wallMsDist,
    analysisReadyMs: analysisReadyDist,
    decomposition: {
      dispatchQueuedToStarted: dispatchLane,
      steps: stepLanes.map(({ label, n, mean: meanValue, p50 }) => ({ label, n, mean: meanValue, p50 })),
      llmStages: llmLanes.map(({ label, n, mean: meanValue, p50 }) => ({ label, n, mean: meanValue, p50 })),
      finalize: finalizeLane
    }
  };
}

function printCohortSummary(title: string, summary: ReturnType<typeof cohortSummary>) {
  console.log(title);
  const percentileLane = (label: string, dist: ReturnType<typeof distribution>) =>
    `${pad(label, 26)} n=${String(dist.n).padStart(4)}  p50=${formatMs(dist.p50).padStart(8)}  p90=${formatMs(dist.p90).padStart(8)}  max=${formatMs(dist.max).padStart(8)}`;
  console.log(percentileLane("wall duration", summary.wallMs));
  console.log(percentileLane("analysisReadyMs", summary.analysisReadyMs));
  const meanLine = (label: string, lane: { n: number; mean: number | null; p50: number | null }) =>
    `${pad(label, 26)} n=${String(lane.n).padStart(4)}  mean=${formatMs(lane.mean).padStart(8)}  p50=${formatMs(lane.p50).padStart(8)}`;
  console.log(meanLine("dispatch (queued->started)", summary.decomposition.dispatchQueuedToStarted));
  for (const lane of summary.decomposition.steps) {
    console.log(meanLine(lane.label, lane));
  }
  for (const lane of summary.decomposition.llmStages) {
    console.log(meanLine(lane.label, lane));
  }
  console.log(meanLine("finalize (residual)", summary.decomposition.finalize));
  const stepSumLabel = summary.decomposition.steps.map((lane) => formatMs(lane.mean)).join(" + ");
  console.log(
    `sum check: dispatch(${formatMs(summary.decomposition.dispatchQueuedToStarted.mean)}) + [${stepSumLabel}] + finalize(${formatMs(summary.decomposition.finalize.mean)}) should land near mean wall duration`
  );
  console.log("");
}

const ANALYSIS_SOURCE_REFRESH_COHORTS: AnalysisSourceRefreshCohort[] = ["full", "targeted", "skip"];

async function main() {
  loadEnv();
  const databaseUrl = process.env.DATABASE_URL?.trim();
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is empty. Run `set -a; source .env.production.migrate.local; set +a` first.");
  }

  const sinceDays = parseSinceDays(argValue("--since"), 30);
  const limit = Math.max(1, Math.min(5000, Number(argValue("--limit") ?? 500) || 500));
  const sinceIso = new Date(Date.now() - sinceDays * 86_400_000).toISOString();

  const client = new Client({ connectionString: databaseUrl });
  await client.connect();
  try {
    const { rows } = await client.query<RunRow>(analysisCompleteRunsQuery(sinceIso, limit));

    const excluded: Array<{ slug: string; reasons: ExclusionReason[] }> = [];
    const candidates: RunRow[] = [];
    for (const run of rows) {
      const reasons = exclusionReasons(run.trace_json);
      if (reasons.length > 0) {
        excluded.push({ slug: run.slug, reasons });
      } else {
        candidates.push(run);
      }
    }

    const startedEvents =
      candidates.length > 0
        ? (await client.query<StartedEventRow>(generationStartedEventsQuery(candidates.map((run) => run.id)))).rows
        : [];
    const startedEventByRunId = new Map(startedEvents.map((event) => [event.run_id, event.started_event_at]));

    const included = candidates.map((run) => buildIncludedRun(run, startedEventByRunId.get(run.id)));

    const combined = cohortSummary(included);
    const byMode = Object.fromEntries(
      ANALYSIS_SOURCE_REFRESH_COHORTS.map((cohort) => [cohort, cohortSummary(included.filter((run) => run.cohort === cohort))])
    ) as Record<AnalysisSourceRefreshCohort, ReturnType<typeof cohortSummary>>;

    const summary = {
      window: { sinceDays, sinceIso, limit },
      population: {
        fetched: rows.length,
        excludedAsRepairArtifact: excluded.length,
        excludedSlugs: excluded.map((row) => ({ slug: row.slug, reasons: row.reasons })),
        included: included.length
      },
      // Combined view kept at the top level for continuity with every report before this item
      // (skip-fresh promoted to production 2026-07-20 is exactly why a blended report stopped
      // being trustworthy: byMode below is the fix).
      wallMs: combined.wallMs,
      analysisReadyMs: combined.analysisReadyMs,
      decomposition: combined.decomposition,
      byMode
    };

    if (hasArg("--json")) {
      console.log(JSON.stringify(summary, null, 2));
      return;
    }

    console.log(`analysis latency baseline over prod runs (last ${sinceDays}d, limit ${limit}, job_kind='analysis' AND status='complete')`);
    console.log(`window: ${sinceIso} -> now`);
    console.log(
      `population: ${rows.length} rows fetched, ${excluded.length} rows excluded as repair artifacts, ${included.length} rows included`
    );
    if (excluded.length > 0) {
      console.log("excluded rows (repair artifacts, not real latency):");
      for (const row of excluded) {
        console.log(`  ${row.slug.padEnd(20)} reasons: ${row.reasons.join("+")}`);
      }
    }
    console.log("");
    console.log("percentiles use nearest-rank (sort ascending, index = ceil(pct/100 * n) - 1)");
    console.log("mean per-step decomposition (queued-to-started, then trace.steps and trace.llm.calls stages found in the data);");
    console.log("p50 rides along because these lanes are right-skewed by a handful of slow Inngest dispatches, a known pattern.");
    console.log("");

    console.log("=== by ANALYSIS_SOURCE_REFRESH cohort (providers.stableenrich.analysisSourceRefresh; absent = pre-flag = full) ===");
    console.log("");
    for (const cohort of ANALYSIS_SOURCE_REFRESH_COHORTS) {
      printCohortSummary(`--- ${cohort} (n=${byMode[cohort].n}) ---`, byMode[cohort]);
    }

    console.log("=== combined (all cohorts) ===");
    console.log("");
    printCohortSummary(`combined (n=${combined.n})`, combined);
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
