#!/usr/bin/env tsx
// Read-only production report answering one question: is How it wins working?
//
// Population: job_kind = 'analysis' in the last N days, every status. No status filter, on
// purpose. A fail-closed or crashed run is exactly what this script needs to see, not exclude
// (the analysis-latency baseline excludes repair artifacts because it measures speed; this
// measures whether the read actually gets produced and filed).
//
// The judge writes a full audit (`trace.howItWins.judgment`, every field in
// packages/core/src/how-it-wins-judgment.ts) inline into the run trace today. A later change may
// replace that with a lighter `judgeSummary` (currentCount, openQuestionCount, calls) to keep
// trace_json small; this script reads either shape so it keeps working across that change.
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";
import { Client } from "pg";

import type { GenerationLlmCallTrace, GenerationTrace } from "@cold-start/core";

type RunRow = {
  id: string;
  slug: string;
  domain: string;
  status: string;
  started_at: Date;
  completed_at: Date | null;
  trace_json: GenerationTrace | null;
};

type CardRow = {
  slug: string;
  card_json: unknown;
};

// What the classifier needs from a stored card: just enough of the how-it-wins block to compare
// judge output against what actually got filed. Anything else on the card is irrelevant here.
type CardHowItWinsLike = {
  status?: unknown;
  running?: unknown;
  inQuestion?: unknown;
};
type CardLike = {
  synthesis?: { howItWins?: CardHowItWinsLike };
} | null;

function loadEnvFile(path: string) {
  if (!existsSync(path)) {
    return;
  }
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    const match = line.match(/^([A-Z0-9_]+)\s*=\s*(.*)$/);
    const key = match?.[1];
    const value = match?.[2];
    if (!key || value === undefined || process.env[key]) {
      continue;
    }
    process.env[key] = value.trim().replace(/^['"]|['"]$/g, "");
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

function parseDays(input: string | undefined, fallbackDays: number) {
  const days = Number(input);
  return Number.isFinite(days) && days > 0 ? days : fallbackDays;
}

function parseLimit(input: string | undefined, fallbackLimit: number) {
  const limit = Number(input);
  return Number.isFinite(limit) && limit > 0 ? Math.min(5000, Math.floor(limit)) : fallbackLimit;
}

// Nearest-rank percentile, same method as measure-analysis-latency.ts, so reports read the same way.
function percentile(values: number[], pct: number) {
  const sorted = values.filter((value) => Number.isFinite(value)).sort((left, right) => left - right);
  if (sorted.length === 0) {
    return null;
  }
  const index = Math.min(sorted.length - 1, Math.ceil((pct / 100) * sorted.length) - 1);
  return sorted[index] ?? null;
}

function distribution(values: number[]) {
  return {
    n: values.length,
    p50: percentile(values, 50),
    p90: percentile(values, 90),
    max: values.length > 0 ? Math.max(...values) : null
  };
}

function formatMs(value: number | null) {
  if (value === null) {
    return "-";
  }
  const seconds = value / 1000;
  return seconds < 60 ? `${seconds.toFixed(1)}s` : `${Math.floor(seconds / 60)}m ${String(Math.round(seconds % 60)).padStart(2, "0")}s`;
}

function formatUsd(value: number | null) {
  return value === null ? "-" : `$${value.toFixed(4)}`;
}

function formatBytes(value: number | null) {
  if (value === null) {
    return "-";
  }
  return value >= 1024 ? `${(value / 1024).toFixed(1)} KB` : `${value} B`;
}

function pad(value: string, width: number) {
  return value.length >= width ? `${value.slice(0, width - 1)}…` : value.padEnd(width);
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function arrayLength(value: unknown): number | null {
  return Array.isArray(value) ? value.length : null;
}

function numberOrNull(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function stringOrNull(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function sumOrNull(values: Array<number | null>): number | null {
  const finite = values.filter((value): value is number => value !== null);
  return finite.length > 0 ? finite.reduce((sum, value) => sum + value, 0) : null;
}

// Groups fail-closed step messages so ten instances of the same underlying error count as one
// bucket instead of ten. Takes the text before the first colon (error class), or the first line
// truncated, when there is no colon to split on.
export function failMessagePrefix(message: string | null): string {
  if (!message) {
    return "no message";
  }
  const firstLine = message.split("\n")[0] ?? message;
  const colonIndex = firstLine.indexOf(":");
  const prefix = colonIndex > 0 ? firstLine.slice(0, colonIndex) : firstLine;
  const trimmed = prefix.trim();
  return trimmed.length > 0 ? trimmed.slice(0, 80) : "no message";
}

export type HowItWinsJudgeCallSummary = {
  stage: string;
  model: string;
  outputTokens: number | null;
  latencyMs: number | null;
  costUsd: number | null;
};

function toJudgeCallSummary(raw: unknown): HowItWinsJudgeCallSummary {
  const call = isPlainObject(raw) ? raw : {};
  return {
    stage: stringOrNull(call.stage) ?? "unknown",
    model: stringOrNull(call.model) ?? "unknown",
    outputTokens: numberOrNull(call.outputTokens),
    latencyMs: numberOrNull(call.latencyMs),
    costUsd: numberOrNull(call.actualCostUsd) ?? numberOrNull(call.estimatedCostUsd)
  };
}

function countOpenQuestionDispositions(value: unknown): number | null {
  if (!Array.isArray(value)) {
    return null;
  }
  return value.filter((entry) => isPlainObject(entry) && entry.disposition === "open_question").length;
}

const DISABLED_MESSAGE_MARKER = "HOW_IT_WINS_ENABLED=false";
// Block-level statuses the current schema does not define yet (packages/core/src/how-it-wins.ts
// only knows read/thin_file/nothing_stands_out/discarded). A background function may start writing
// these; give them their own named buckets instead of falling into "unknown" so the report reads
// cleanly the day that lands.
const KNOWN_FORWARD_BLOCK_STATUSES = new Set(["failed", "deferred", "stale"]);

export type HowItWinsRunClassification = {
  bucket: string;
  blockStatus: string | null;
  stepStatus: string | null;
  stepMessage: string | null;
  stepDurationMs: number | null;
  failMessagePrefix: string | null;
  judgeCurrentCount: number | null;
  filedRunningCount: number | null;
  judgeOpenQuestionCount: number | null;
  filedInQuestionCount: number | null;
  judgeCalls: HowItWinsJudgeCallSummary[];
  judgeCostUsd: number | null;
  writerCostUsd: number | null;
};

// The single source of truth for what happened to how-it-wins on one run. Reads trace.steps
// (Inngest step status) and trace.howItWins (the semantic result) independently, because they can
// disagree: production's known bug has the step failing while the semantic result still gets
// written as "nothing_stands_out" (a graceful degrade at the draft level papering over a client-side
// SDK throw at the step level). Fail-closed detection depends on catching that gap.
export function classifyHowItWinsRun(trace: GenerationTrace | null | undefined, card: CardLike): HowItWinsRunClassification {
  const step = trace?.steps?.["how-it-wins"];
  const stepStatus = stringOrNull(step?.status ?? null);
  const stepMessage = stringOrNull(step?.message ?? null);
  const stepDurationMs = numberOrNull(step?.durationMs);

  const rawBlock = trace?.howItWins as unknown as Record<string, unknown> | undefined;
  const blockStatus = rawBlock ? stringOrNull(rawBlock.status) : null;

  let bucket: string;
  let messagePrefix: string | null = null;

  if (stepStatus === "failed") {
    bucket = "fail_closed";
    messagePrefix = failMessagePrefix(stepMessage);
  } else if (!rawBlock) {
    bucket = stepMessage?.includes(DISABLED_MESSAGE_MARKER) ? "enabled_false" : "absent";
  } else if (blockStatus === "nothing_stands_out") {
    bucket = "honest_nothing_stands_out";
  } else if (blockStatus === "read" || blockStatus === "discarded" || blockStatus === "thin_file") {
    bucket = blockStatus;
  } else if (blockStatus && KNOWN_FORWARD_BLOCK_STATUSES.has(blockStatus)) {
    bucket = `block_${blockStatus}`;
  } else if (blockStatus) {
    bucket = `unknown:${blockStatus}`;
  } else {
    bucket = "absent";
  }

  const judgment = rawBlock && isPlainObject(rawBlock.judgment) ? (rawBlock.judgment as Record<string, unknown>) : undefined;
  const judgeSummary = rawBlock && isPlainObject(rawBlock.judgeSummary) ? (rawBlock.judgeSummary as Record<string, unknown>) : undefined;

  const judgeCurrentCount = arrayLength(judgment?.currentStrategyIds) ?? numberOrNull(judgeSummary?.currentCount);
  const judgeOpenQuestionCount =
    arrayLength(judgment?.openQuestions) ??
    countOpenQuestionDispositions(judgment?.strategyEvaluations) ??
    numberOrNull(judgeSummary?.openQuestionCount);

  const cardHowItWins = card?.synthesis?.howItWins;
  const cardHowItWinsStatus = cardHowItWins ? stringOrNull(cardHowItWins.status) : null;
  const filedRunningCount = cardHowItWins ? (cardHowItWinsStatus === "read" ? (arrayLength(cardHowItWins.running) ?? 0) : 0) : null;
  const filedInQuestionCount = cardHowItWins
    ? cardHowItWinsStatus === "read" || cardHowItWinsStatus === "nothing_stands_out"
      ? (arrayLength(cardHowItWins.inQuestion) ?? 0)
      : 0
    : null;

  const callsSource = judgment?.calls ?? judgeSummary?.calls;
  const judgeCalls = Array.isArray(callsSource) ? callsSource.map(toJudgeCallSummary) : [];
  const judgeCostUsd = judgeCalls.length > 0 ? sumOrNull(judgeCalls.map((call) => call.costUsd)) : null;

  const writerCostUsd = sumOrNull(
    (trace?.llm?.calls ?? [])
      .filter((call): call is GenerationLlmCallTrace => call?.stage === "how_it_wins")
      .map((call) => numberOrNull(call.estimatedCostUsd))
  );

  return {
    bucket,
    blockStatus,
    stepStatus,
    stepMessage,
    stepDurationMs,
    failMessagePrefix: messagePrefix,
    judgeCurrentCount,
    filedRunningCount,
    judgeOpenQuestionCount,
    filedInQuestionCount,
    judgeCalls,
    judgeCostUsd,
    writerCostUsd
  };
}

export function traceJsonByteSize(traceJson: unknown): number | null {
  if (traceJson === null || traceJson === undefined) {
    return null;
  }
  try {
    return Buffer.byteLength(JSON.stringify(traceJson), "utf8");
  } catch {
    return null;
  }
}

export function analysisRunsSinceQuery(sinceIso: string, limit: number) {
  return {
    text: `select id, slug, domain, status, started_at, completed_at, trace_json
             from generation_runs
            where job_kind = 'analysis' and started_at >= $1
            order by started_at desc
            limit $2`,
    values: [sinceIso, limit]
  };
}

export function cardsBySlugQuery(slugs: string[]) {
  return {
    text: `select slug, card_json from cards where slug = any($1::text[])`,
    values: [slugs]
  };
}

type ReportRow = { slug: string; startedAt: Date } & HowItWinsRunClassification & {
    traceBytes: number | null;
    totalCostUsd: number | null;
    howItWinsCostUsd: number | null;
  };

function buildReportRows(runs: RunRow[], cardBySlug: Map<string, CardLike>): ReportRow[] {
  return runs.map((run) => {
    const classification = classifyHowItWinsRun(run.trace_json, cardBySlug.get(run.slug) ?? null);
    const traceBytes = traceJsonByteSize(run.trace_json);
    const totalCostUsd = numberOrNull(run.trace_json?.costUsdAnthropic);
    const howItWinsCostUsd =
      classification.judgeCostUsd === null && classification.writerCostUsd === null
        ? null
        : (classification.judgeCostUsd ?? 0) + (classification.writerCostUsd ?? 0);
    return { slug: run.slug, startedAt: run.started_at, ...classification, traceBytes, totalCostUsd, howItWinsCostUsd };
  });
}

function countBy<T>(items: T[], key: (item: T) => string) {
  const counts = new Map<string, number>();
  for (const item of items) {
    const k = key(item);
    counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  return [...counts.entries()].sort((left, right) => right[1] - left[1]);
}

async function main() {
  loadEnv();
  const databaseUrl = process.env.DATABASE_URL?.trim();
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is empty. Run `set -a; source .env.production.migrate.local; set +a` first.");
  }

  const days = parseDays(argValue("--days"), 14);
  const limit = parseLimit(argValue("--limit"), 500);
  const sinceIso = new Date(Date.now() - days * 86_400_000).toISOString();

  const client = new Client({ connectionString: databaseUrl });
  await client.connect();
  try {
    const { rows } = await client.query<RunRow>(analysisRunsSinceQuery(sinceIso, limit));
    const slugs = [...new Set(rows.map((row) => row.slug))];
    const cardRows = slugs.length > 0 ? (await client.query<CardRow>(cardsBySlugQuery(slugs))).rows : [];
    const cardBySlug = new Map(cardRows.map((row) => [row.slug, row.card_json as CardLike]));

    const report = buildReportRows(rows, cardBySlug);

    const bucketDist = countBy(report, (row) => row.bucket);
    const failMessages = countBy(
      report.filter((row) => row.bucket === "fail_closed"),
      (row) => row.failMessagePrefix ?? "no message"
    );

    const dropComparable = report.filter((row) => row.judgeCurrentCount !== null && row.filedRunningCount !== null);
    const dropRows = dropComparable.filter((row) => (row.filedRunningCount ?? 0) < (row.judgeCurrentCount ?? 0));
    const judgeCurrentTotal = dropComparable.reduce((sum, row) => sum + (row.judgeCurrentCount ?? 0), 0);
    const filedRunningTotal = dropComparable.reduce((sum, row) => sum + (row.filedRunningCount ?? 0), 0);

    const inQuestionComparable = report.filter((row) => row.judgeOpenQuestionCount !== null && row.filedInQuestionCount !== null);
    const judgeInQuestionTotal = inQuestionComparable.reduce((sum, row) => sum + (row.judgeOpenQuestionCount ?? 0), 0);
    const filedInQuestionTotal = inQuestionComparable.reduce((sum, row) => sum + (row.filedInQuestionCount ?? 0), 0);

    const stepDurations = distribution(
      report.map((row) => row.stepDurationMs).filter((value): value is number => value !== null)
    );

    const callsByStage = new Map<string, HowItWinsJudgeCallSummary[]>();
    for (const row of report) {
      for (const call of row.judgeCalls) {
        const list = callsByStage.get(call.stage) ?? [];
        list.push(call);
        callsByStage.set(call.stage, list);
      }
    }

    const costComparable = report.filter((row) => row.howItWinsCostUsd !== null && row.totalCostUsd !== null);
    const howItWinsCostTotal = costComparable.reduce((sum, row) => sum + (row.howItWinsCostUsd ?? 0), 0);
    const runCostTotal = costComparable.reduce((sum, row) => sum + (row.totalCostUsd ?? 0), 0);
    const costNotDerivableRows = report.filter((row) => row.howItWinsCostUsd === null && row.totalCostUsd !== null);
    const costNotDerivableTotal = costNotDerivableRows.reduce((sum, row) => sum + (row.totalCostUsd ?? 0), 0);

    const traceBytesValues = report.map((row) => row.traceBytes).filter((value): value is number => value !== null);
    const traceBytesDist = distribution(traceBytesValues);
    const maxTraceRow = report.reduce<ReportRow | null>((max, row) => {
      if (row.traceBytes === null) return max;
      if (max === null || (max.traceBytes ?? 0) < row.traceBytes) return row;
      return max;
    }, null);

    if (hasArg("--json")) {
      console.log(
        JSON.stringify(
          {
            window: { days, sinceIso, limit },
            population: { fetched: rows.length },
            statusDistribution: Object.fromEntries(bucketDist),
            failMessages: Object.fromEntries(failMessages),
            judgeToFiledDrop: {
              comparableRuns: dropComparable.length,
              runsWithDrop: dropRows.length,
              judgeCurrentTotal,
              filedRunningTotal,
              aggregateRatio: judgeCurrentTotal > 0 ? filedRunningTotal / judgeCurrentTotal : null,
              dropRows: dropRows.map((row) => ({
                slug: row.slug,
                judgeCurrentCount: row.judgeCurrentCount,
                filedRunningCount: row.filedRunningCount
              }))
            },
            inQuestion: {
              comparableRuns: inQuestionComparable.length,
              judgeTotal: judgeInQuestionTotal,
              filedTotal: filedInQuestionTotal,
              aggregateRatio: judgeInQuestionTotal > 0 ? filedInQuestionTotal / judgeInQuestionTotal : null
            },
            latency: { stepDurationMs: stepDurations },
            judgeCallStages: Object.fromEntries(
              [...callsByStage.entries()].map(([stage, calls]) => [
                stage,
                {
                  n: calls.length,
                  outputTokens: distribution(calls.map((call) => call.outputTokens).filter((v): v is number => v !== null)),
                  latencyMs: distribution(calls.map((call) => call.latencyMs).filter((v): v is number => v !== null)),
                  costUsdTotal: sumOrNull(calls.map((call) => call.costUsd))
                }
              ])
            ),
            cost: {
              comparableRuns: costComparable.length,
              howItWinsCostTotal,
              runCostTotal,
              share: runCostTotal > 0 ? howItWinsCostTotal / runCostTotal : null,
              notDerivableRuns: costNotDerivableRows.length,
              notDerivableRunCostTotal: costNotDerivableTotal
            },
            traceJsonBytes: { ...traceBytesDist, maxSlug: maxTraceRow?.slug ?? null }
          },
          null,
          2
        )
      );
      return;
    }

    console.log(`how-it-wins production report over last ${days}d (limit ${limit}, job_kind='analysis', every status)`);
    console.log(`window: ${sinceIso} -> now`);
    console.log(`population: ${rows.length} runs fetched, ${slugs.length} distinct slugs`);
    console.log("");

    console.log("=== status distribution ===");
    for (const [bucket, count] of bucketDist) {
      console.log(`  ${pad(bucket, 28)} ${count}`);
    }
    console.log("");

    if (failMessages.length > 0) {
      console.log("=== fail-closed messages (step status = failed, grouped by message prefix) ===");
      for (const [message, count] of failMessages) {
        console.log(`  ${pad(message, 60)} ${count}`);
      }
      console.log("");
    }

    console.log("=== judge-current to filed-running drop ===");
    console.log(`comparable runs: ${dropComparable.length}, runs with a drop: ${dropRows.length}`);
    console.log(
      `aggregate: judged ${judgeCurrentTotal}, filed ${filedRunningTotal}, ratio ${
        judgeCurrentTotal > 0 ? (filedRunningTotal / judgeCurrentTotal).toFixed(2) : "-"
      }`
    );
    for (const row of dropRows.slice(0, 20)) {
      console.log(`  ${pad(row.slug, 24)} judged ${row.judgeCurrentCount} -> filed ${row.filedRunningCount}`);
    }
    if (dropRows.length > 20) {
      console.log(`  ... ${dropRows.length - 20} more rows not shown`);
    }
    console.log("");

    console.log("=== in-question: filed vs judged ===");
    console.log(
      `comparable runs: ${inQuestionComparable.length}, judged ${judgeInQuestionTotal}, filed ${filedInQuestionTotal}, ratio ${
        judgeInQuestionTotal > 0 ? (filedInQuestionTotal / judgeInQuestionTotal).toFixed(2) : "-"
      }`
    );
    console.log("");

    console.log("=== latency: trace.steps['how-it-wins'].durationMs ===");
    console.log(
      `n=${stepDurations.n}  p50=${formatMs(stepDurations.p50)}  p90=${formatMs(stepDurations.p90)}  max=${formatMs(stepDurations.max)}`
    );
    console.log("");

    if (callsByStage.size > 0) {
      console.log("=== judge calls by stage ===");
      for (const [stage, calls] of callsByStage) {
        const outputTokens = distribution(calls.map((call) => call.outputTokens).filter((v): v is number => v !== null));
        const latency = distribution(calls.map((call) => call.latencyMs).filter((v): v is number => v !== null));
        const cost = sumOrNull(calls.map((call) => call.costUsd));
        console.log(
          `  ${pad(stage, 16)} n=${calls.length}  outputTokens p50=${outputTokens.p50 ?? "-"} p90=${outputTokens.p90 ?? "-"}  latency p50=${formatMs(latency.p50)} p90=${formatMs(latency.p90)}  cost=${formatUsd(cost)}`
        );
      }
      console.log("");
    }

    console.log("=== cost: how-it-wins share of trace.costUsdAnthropic ===");
    console.log(
      `comparable runs: ${costComparable.length}, how-it-wins cost ${formatUsd(howItWinsCostTotal)}, run cost ${formatUsd(runCostTotal)}, share ${
        runCostTotal > 0 ? `${((howItWinsCostTotal / runCostTotal) * 100).toFixed(1)}%` : "-"
      }`
    );
    if (costNotDerivableRows.length > 0) {
      console.log(
        `note: ${costNotDerivableRows.length} runs have a run total (${formatUsd(costNotDerivableTotal)} combined) but no judge or writer call cost to attribute; how-it-wins share is not derivable for them`
      );
    }
    console.log("");

    console.log("=== trace_json size ===");
    console.log(
      `n=${traceBytesDist.n}  p50=${formatBytes(traceBytesDist.p50)}  p90=${formatBytes(traceBytesDist.p90)}  max=${formatBytes(traceBytesDist.max)}  max slug=${maxTraceRow?.slug ?? "-"}`
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
