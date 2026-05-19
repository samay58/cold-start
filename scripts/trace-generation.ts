#!/usr/bin/env tsx
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import process from "node:process";
import { Client } from "pg";

import {
  formatGenerationQualityFlags,
  generationQualityFlags
} from "@cold-start/core";
import type { GenerationTrace } from "@cold-start/core";

type Row = {
  id: string;
  slug: string;
  domain: string;
  mode: "basics" | "analysis";
  job_kind: string;
  status: string;
  error: string | null;
  cost_usd: string | null;
  started_at: Date;
  completed_at: Date | null;
  inngest_event_id: string | null;
  inngest_run_id: string | null;
  trace_json: GenerationTrace | null;
};

type TraceFilters = {
  domain?: string;
  mode?: string;
  since?: Date;
  failedOnly: boolean;
  limit: number;
  detail: boolean;
  json: boolean;
  quality: boolean;
};

type GenerationRunColumns = {
  jobKind: boolean;
  inngestEventId: boolean;
  inngestRunId: boolean;
  traceJson: boolean;
};

function loadRootEnv() {
  const envPath = resolve(process.cwd(), ".env.local");
  if (!existsSync(envPath)) {
    return;
  }

  for (const line of readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const match = line.match(/^([A-Z0-9_]+)\s*=\s*(.*)$/);
    if (!match || process.env[match[1]]) {
      continue;
    }

    const rawValue = match[2].trim();
    process.env[match[1]] = rawValue.replace(/^['"]|['"]$/g, "");
  }
}

function argValue(name: string) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function hasArg(name: string) {
  return process.argv.includes(name);
}

function parseSince(input?: string) {
  if (!input) {
    return undefined;
  }

  const relative = input.match(/^(\d+)(m|h|d)$/i);
  if (relative) {
    const amount = Number(relative[1]);
    const unit = relative[2].toLowerCase();
    const ms = unit === "m" ? amount * 60_000 : unit === "h" ? amount * 3_600_000 : amount * 86_400_000;
    return new Date(Date.now() - ms);
  }

  const parsed = new Date(input);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error(`Invalid --since value: ${input}`);
  }

  return parsed;
}

function parseFilters(): TraceFilters {
  const limit = Math.max(1, Math.min(200, Number(argValue("--limit") ?? "12") || 12));
  const domain = argValue("--domain")?.trim().toLowerCase();
  const mode = argValue("--mode")?.trim().toLowerCase();
  const since = parseSince(argValue("--since"));

  if (mode && mode !== "basics" && mode !== "analysis") {
    throw new Error("--mode must be basics or analysis");
  }

  return {
    ...(domain ? { domain } : {}),
    ...(mode ? { mode } : {}),
    ...(since ? { since } : {}),
    failedOnly: hasArg("--failed"),
    limit,
    detail: hasArg("--detail"),
    json: hasArg("--json"),
    quality: hasArg("--quality") || hasArg("--json")
  };
}

function elapsed(row: Row) {
  const end = row.completed_at ?? new Date();
  const seconds = Math.max(0, Math.round((end.getTime() - row.started_at.getTime()) / 1000));
  if (seconds < 60) {
    return `${seconds}s`;
  }

  return `${Math.floor(seconds / 60)}m ${String(seconds % 60).padStart(2, "0")}s`;
}

function compactError(error: string | null) {
  if (!error) {
    return "";
  }

  return error.length > 56 ? `${error.slice(0, 53)}...` : error;
}

function flagsFor(row: Row) {
  return generationQualityFlags({
    status: row.status,
    mode: row.mode,
    traceJson: row.trace_json
  });
}

function summarize(row: Row, includeQuality: boolean) {
  const trace = row.trace_json;
  return {
    when: row.started_at.toISOString().replace("T", " ").slice(0, 19),
    company: row.domain,
    job: row.job_kind || row.mode,
    status: row.status,
    duration: elapsed(row),
    sources: trace?.sourceGate
      ? `${trace.sourceGate.acceptedCount}/${trace.sourceGate.acceptedCount + trace.sourceGate.rejectedCount}`
      : "-",
    facts: trace?.extraction?.providerFactCandidateCount !== undefined
      ? `${trace.extraction.providerFactAppliedCount ?? 0}/${trace.extraction.providerFactCandidateCount}`
      : "-",
    citations: trace?.extraction ? String(trace.extraction.citationCount) : "-",
    synthesis: trace?.synthesis
      ? `${trace.synthesis.claimCountAfterVerify}/${trace.synthesis.claimCountBeforeVerify}`
      : "-",
    ...(includeQuality ? { quality: formatGenerationQualityFlags(flagsFor(row)) } : {}),
    error: compactError(row.error ?? trace?.failure?.message ?? null)
  };
}

function printTable(rows: Row[], includeQuality: boolean) {
  const summaries = rows.map((row) => summarize(row, includeQuality));
  const headers = [
    "when",
    "company",
    "job",
    "status",
    "duration",
    "sources",
    "facts",
    "citations",
    "synthesis",
    ...(includeQuality ? ["quality"] : []),
    "error"
  ] as const;
  const widths = Object.fromEntries(
    headers.map((header) => [
      header,
      Math.max(header.length, ...summaries.map((row) => String(row[header as keyof typeof row] ?? "").length))
    ])
  ) as Record<(typeof headers)[number], number>;

  console.log(headers.map((header) => header.padEnd(widths[header])).join("  "));
  console.log(headers.map((header) => "-".repeat(widths[header])).join("  "));
  for (const row of summaries) {
    console.log(headers.map((header) => String(row[header as keyof typeof row] ?? "").padEnd(widths[header])).join("  "));
  }
}

function printDetail(row: Row) {
  const trace = row.trace_json;
  console.log(`\n${row.domain} ${row.job_kind || row.mode} ${row.status}`);
  console.log(`db run: ${row.id}`);
  if (row.inngest_event_id || row.inngest_run_id) {
    console.log(`inngest: event=${row.inngest_event_id ?? "-"} run=${row.inngest_run_id ?? "-"}`);
  }

  const flags = flagsFor(row);
  console.log(`quality: ${formatGenerationQualityFlags(flags)}`);
  for (const flag of flags) {
    console.log(`- ${flag.severity}: ${flag.message}`);
  }

  if (!trace) {
    console.log("No trace_json stored for this run.");
    return;
  }

  if (trace.steps) {
    console.log("\nsteps");
    for (const [name, step] of Object.entries(trace.steps)) {
      console.log(`- ${name}: ${step.status}${step.durationMs !== undefined ? ` in ${step.durationMs}ms` : ""}`);
    }
  }

  if (trace.providers) {
    console.log("\nproviders");
    console.log(JSON.stringify(trace.providers, null, 2));
  }

  if (trace.sourceGate) {
    console.log("\nsource gate");
    console.log(`accepted ${trace.sourceGate.acceptedCount}, rejected ${trace.sourceGate.rejectedCount}`);
    for (const source of trace.sourceGate.rejectedSamples) {
      console.log(`- rejected ${source.reason}: ${source.url}`);
    }
  }

  if (trace.extraction) {
    console.log("\nextraction");
    console.log(JSON.stringify(trace.extraction, null, 2));
  }

  if (trace.synthesis) {
    console.log("\nsynthesis");
    console.log(JSON.stringify(trace.synthesis, null, 2));
  }

  if (trace.failure) {
    console.log("\nfailure");
    console.log(`${trace.failure.stage}: ${trace.failure.message}`);
  }
}

async function generationRunColumns(client: Client): Promise<GenerationRunColumns> {
  const result = await client.query<{ column_name: string }>(
    `select column_name
       from information_schema.columns
      where table_name = 'generation_runs'
        and column_name = any($1)`,
    [["job_kind", "inngest_event_id", "inngest_run_id", "trace_json"]]
  );
  const columns = new Set(result.rows.map((row) => row.column_name));
  return {
    jobKind: columns.has("job_kind"),
    inngestEventId: columns.has("inngest_event_id"),
    inngestRunId: columns.has("inngest_run_id"),
    traceJson: columns.has("trace_json")
  };
}

function buildQuery(filters: TraceFilters, columns: GenerationRunColumns) {
  const where: string[] = [];
  const values: unknown[] = [];

  if (filters.domain) {
    values.push(filters.domain);
    where.push(`domain = $${values.length}`);
  }

  if (filters.mode) {
    values.push(filters.mode);
    where.push(`mode = $${values.length}`);
  }

  if (filters.since) {
    values.push(filters.since);
    where.push(`started_at >= $${values.length}`);
  }

  if (filters.failedOnly) {
    where.push("status = 'failed'");
  }

  values.push(filters.limit);

  return {
    text: `select id, slug, domain, mode,
                  ${columns.jobKind ? "job_kind" : "mode as job_kind"},
                  status, error, cost_usd, started_at, completed_at,
                  ${columns.inngestEventId ? "inngest_event_id" : "null::text as inngest_event_id"},
                  ${columns.inngestRunId ? "inngest_run_id" : "null::text as inngest_run_id"},
                  ${columns.traceJson ? "trace_json" : "null::jsonb as trace_json"}
           from generation_runs
           ${where.length > 0 ? `where ${where.join(" and ")}` : ""}
           order by started_at desc
           limit $${values.length}`,
    values
  };
}

function jsonRows(rows: Row[]) {
  return rows.map((row) => ({
    id: row.id,
    slug: row.slug,
    domain: row.domain,
    mode: row.mode,
    jobKind: row.job_kind || row.mode,
    status: row.status,
    startedAt: row.started_at.toISOString(),
    completedAt: row.completed_at?.toISOString() ?? null,
    duration: elapsed(row),
    error: row.error ?? row.trace_json?.failure?.message ?? null,
    inngestEventId: row.inngest_event_id,
    inngestRunId: row.inngest_run_id,
    trace: row.trace_json,
    qualityFlags: flagsFor(row)
  }));
}

async function main() {
  loadRootEnv();
  const databaseUrl = process.env.DATABASE_URL?.trim();
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is empty. Set it or add it to .env.local before running trace:generation.");
  }

  const filters = parseFilters();
  const client = new Client({ connectionString: databaseUrl });
  await client.connect();
  try {
    const columns = await generationRunColumns(client);
    const result = await client.query<Row>(buildQuery(filters, columns));

    if (filters.json) {
      console.log(JSON.stringify(jsonRows(result.rows), null, 2));
      return;
    }

    if (result.rows.length === 0) {
      console.log("No generation runs found.");
      return;
    }

    printTable(result.rows, filters.quality);
    if (filters.detail) {
      printDetail(result.rows[0]!);
    }
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
