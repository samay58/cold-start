#!/usr/bin/env tsx
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";
import { Client } from "pg";

import {
  COLD_START_API_CONTRACT_VERSION,
  COLD_START_CLIENT_CONTRACT_HEADER,
  companySlugFromDomain,
  formatGenerationQualityFlags,
  generationQualityFlags,
  type ColdStartCard,
  type GenerationQualityFlag,
  type GenerationTrace
} from "@cold-start/core";

const QA_COMPANIES = [
  "cartesia.ai",
  "elevenlabs.io",
  "linear.app",
  "legora.com",
  "attio.com",
  "skyfire.xyz",
  "minimax.io",
  "varickagents.com"
] as const;

type RunRow = {
  id: string;
  slug: string;
  domain: string;
  mode: "basics" | "analysis";
  job_kind: string;
  status: string;
  error: string | null;
  started_at: Date;
  completed_at: Date | null;
  trace_json: GenerationTrace | null;
};

type CardFetchResult =
  | { status: "ok"; card: ColdStartCard; surface: "extension" | "public" }
  | { status: "missing"; statusCode: number; surface: "extension" | "public"; error: string }
  | { status: "skipped"; surface: "none"; error: string };

export type GenerationRunColumns = {
  jobKind: boolean;
  traceJson: boolean;
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

function loadLocalQaEnv() {
  loadEnvFile(resolve(process.cwd(), ".env.production.migrate.local"));
  if (!process.env.DATABASE_URL) {
    loadEnvFile(resolve(process.cwd(), ".env.local"));
  }

  const tokenPath = resolve(process.cwd(), ".vercel/extension-api-token.production.local");
  if (!process.env.EXTENSION_API_TOKEN && existsSync(tokenPath)) {
    process.env.EXTENSION_API_TOKEN = readFileSync(tokenPath, "utf8").trim();
  }
}

function apiOrigin() {
  return (process.env.COLD_START_QA_API_ORIGIN ?? process.env.COLD_START_API_ORIGIN ?? "https://cold-start-samay58s-projects.vercel.app").replace(/\/$/, "");
}

function extensionId() {
  return process.env.COLD_START_EXTENSION_ID ?? process.env.CHROME_EXTENSION_ID;
}

function elapsed(row?: RunRow) {
  if (!row) {
    return "-";
  }

  const end = row.completed_at ?? new Date();
  const seconds = Math.max(0, Math.round((end.getTime() - row.started_at.getTime()) / 1000));
  if (seconds < 60) {
    return `${seconds}s`;
  }

  return `${Math.floor(seconds / 60)}m ${String(seconds % 60).padStart(2, "0")}s`;
}

function runLabel(row?: RunRow) {
  if (!row) {
    return "no-run";
  }

  const trace = row.trace_json;
  const citations = trace?.extraction ? trace.extraction.citationCount : "-";
  const facts = trace?.extraction?.providerFactCandidateCount !== undefined
    ? `${trace.extraction.providerFactAppliedCount ?? 0}/${trace.extraction.providerFactCandidateCount}`
    : "-";
  const synthesis = trace?.synthesis ? `${trace.synthesis.claimCountAfterVerify}/${trace.synthesis.claimCountBeforeVerify}` : "-";
  return `${row.status} ${elapsed(row)} c:${citations} f:${facts} s:${synthesis}`;
}

async function fetchCard(domain: string): Promise<CardFetchResult> {
  const origin = apiOrigin();
  const slug = companySlugFromDomain(domain);
  const token = process.env.EXTENSION_API_TOKEN;
  const id = extensionId();
  const extensionHeaders =
    token && id
      ? {
          Authorization: `Bearer ${token}`,
          "X-Cold-Start-Extension-Id": id,
          [COLD_START_CLIENT_CONTRACT_HEADER]: COLD_START_API_CONTRACT_VERSION
        }
      : null;

  const surface = extensionHeaders ? "extension" : "public";
  const url = extensionHeaders ? `${origin}/api/extension/cards/${encodeURIComponent(slug)}` : `${origin}/api/cards/${encodeURIComponent(slug)}`;

  try {
    const response = await fetch(url, {
      headers: extensionHeaders ?? {
        [COLD_START_CLIENT_CONTRACT_HEADER]: COLD_START_API_CONTRACT_VERSION
      }
    });
    if (!response.ok) {
      return {
        status: "missing",
        statusCode: response.status,
        surface,
        error: await response.text()
      };
    }

    return { status: "ok", card: (await response.json()) as ColdStartCard, surface };
  } catch (error) {
    return {
      status: "skipped",
      surface: "none",
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

async function latestRuns(client: Client) {
  const columns = await generationRunColumns(client);
  const result = await client.query<RunRow>(latestQaRunsQuery(QA_COMPANIES, columns));
  const byKey = new Map<string, RunRow>();
  for (const row of result.rows) {
    byKey.set(`${row.domain}:${row.mode}`, row);
  }
  return byKey;
}

export function latestQaRunsQuery(domains: readonly string[], columns: GenerationRunColumns) {
  const profileJobFilter = columns.jobKind
    ? `
         and job_kind = mode::text
         and job_kind in ('basics', 'analysis')`
    : "";

  return {
    text: `select distinct on (domain, mode)
            id, slug, domain, mode, ${columns.jobKind ? "job_kind" : "mode as job_kind"},
            status, error, started_at, completed_at,
            ${columns.traceJson ? "trace_json" : "null::jsonb as trace_json"}
       from generation_runs
       where domain = any($1)${profileJobFilter}
       order by domain, mode, started_at desc`,
    values: [domains]
  };
}

async function generationRunColumns(client: Client): Promise<GenerationRunColumns> {
  const result = await client.query<{ column_name: string }>(
    `select column_name
       from information_schema.columns
      where table_name = 'generation_runs'
        and column_name = any($1)`,
    [["job_kind", "trace_json"]]
  );
  const columns = new Set(result.rows.map((row) => row.column_name));
  return {
    jobKind: columns.has("job_kind"),
    traceJson: columns.has("trace_json")
  };
}

function flagsFor(run: RunRow | undefined, card: ColdStartCard | null): GenerationQualityFlag[] {
  if (!run) {
    return [{ code: "missing_trace", severity: "fail", message: "no generation run found" }];
  }

  return generationQualityFlags({
    status: run.status,
    mode: run.mode,
    traceJson: run.trace_json,
    card
  });
}

function printTable(rows: Array<Record<string, string>>) {
  const headers = ["domain", "basics", "analysis", "api", "flags"] as const;
  const widths = Object.fromEntries(
    headers.map((header) => [header, Math.max(header.length, ...rows.map((row) => row[header].length))])
  ) as Record<(typeof headers)[number], number>;

  console.log(headers.map((header) => header.padEnd(widths[header])).join("  "));
  console.log(headers.map((header) => "-".repeat(widths[header])).join("  "));
  for (const row of rows) {
    console.log(headers.map((header) => row[header].padEnd(widths[header])).join("  "));
  }
}

async function main() {
  loadLocalQaEnv();
  const databaseUrl = process.env.DATABASE_URL?.trim();
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is empty. Set it, or create .env.production.migrate.local from the production pooled URL.");
  }

  const client = new Client({ connectionString: databaseUrl });
  await client.connect();
  try {
    const runs = await latestRuns(client);
    const rows: Array<Record<string, string>> = [];
    let failCount = 0;

    for (const domain of QA_COMPANIES) {
      const card = await fetchCard(domain);
      const visibleCard = card.status === "ok" ? card.card : null;
      const extensionCard = card.status === "ok" && card.surface === "extension" ? card.card : null;
      const basics = runs.get(`${domain}:basics`);
      const analysis = runs.get(`${domain}:analysis`);
      const flags = [...flagsFor(basics, visibleCard), ...flagsFor(analysis, extensionCard)];
      if (card.status === "missing") {
        flags.push({
          code: "missing_trace",
          severity: "fail",
          message: `API returned ${card.statusCode}; saved stale cards should remain visible`
        });
      }
      const uniqueFlags = Array.from(new Map(flags.map((flag) => [flag.code, flag])).values());
      failCount += uniqueFlags.filter((flag) => flag.severity === "fail").length;

      rows.push({
        domain,
        basics: runLabel(basics),
        analysis: runLabel(analysis),
        api: card.status === "ok" ? `${card.surface} hit` : `${card.surface} ${card.status}`,
        flags: formatGenerationQualityFlags(uniqueFlags)
      });
    }

    console.log(`Cold Start production QA suite`);
    console.log(`origin: ${apiOrigin()}`);
    console.log(`api surface: ${process.env.EXTENSION_API_TOKEN && extensionId() ? "extension" : "public fallback"}`);
    console.log("");
    printTable(rows);
    console.log("");
    console.log("If runtime flags point at server failure, pull Vercel logs with:");
    console.log("npm exec vercel -- logs --environment production --since 4h --json --expand");
    if (failCount > 0) {
      process.exitCode = 1;
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
