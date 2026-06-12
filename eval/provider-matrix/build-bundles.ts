#!/usr/bin/env tsx
// Read-only fixture builder for the provider-matrix replay harness. Pulls real cards, their
// stored sources (sources.raw_text is NOT NULL, so no re-fetch spend), and the latest complete
// generation trace from the database, then freezes them under eval/provider-matrix/fixtures/.
// SELECTs only; nothing here writes to the database.
//
// Usage:
//   set -a; source .env.production.migrate.local; set +a   # or .env.local for the local DB
//   npm run eval:providers:bundles -- --limit 10 --since 2026-05-01
//   npm run eval:providers:bundles -- --slugs cartesia,harvey

import { existsSync, readFileSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "pg";
import type { ColdStartCard, GenerationTrace } from "@cold-start/core";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fixturesDir = path.join(__dirname, "fixtures");

function loadEnvFile(filePath: string) {
  if (!existsSync(filePath)) {
    return;
  }
  for (const line of readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const match = line.match(/^([A-Z0-9_]+)\s*=\s*(.*)$/);
    if (!match || process.env[match[1]]) {
      continue;
    }
    process.env[match[1]] = match[2].trim().replace(/^['"]|['"]$/g, "");
  }
}

function argValue(name: string, fallback: string) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] ?? fallback : fallback;
}

export type ProviderMatrixFixture = {
  slug: string;
  domain: string;
  generatedAt: string;
  card: ColdStartCard;
  sources: Array<{ url: string; title: string; sourceType: string; fetchedAt: string; rawText: string }>;
  reference: {
    model: string | null;
    blocksRun: string[];
    llmCalls: Array<{ stage: string; label: string; model: string; durationMs: number; estimatedCostUsd?: number }>;
  };
};

async function main() {
  loadEnvFile(path.resolve(process.cwd(), ".env.production.migrate.local"));
  if (!process.env.DATABASE_URL) {
    loadEnvFile(path.resolve(process.cwd(), ".env.local"));
  }
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is required. Source .env.production.migrate.local or .env.local first.");
  }

  const limit = Number(argValue("--limit", "10"));
  const since = argValue("--since", "");
  const slugs = argValue("--slugs", "")
    .split(",")
    .map((slug) => slug.trim())
    .filter(Boolean);

  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();

  try {
    const cardRows = await client.query<{
      id: string;
      slug: string;
      domain: string;
      card_json: ColdStartCard;
      generated_at: string;
    }>(
      slugs.length > 0
        ? {
            text: `SELECT id, slug, domain, card_json, generated_at::text FROM cards WHERE slug = ANY($1) ORDER BY generated_at DESC`,
            values: [slugs],
          }
        : {
            text: `
              SELECT c.id, c.slug, c.domain, c.card_json, c.generated_at::text
              FROM cards c
              WHERE EXISTS (SELECT 1 FROM sources s WHERE s.card_id = c.id)
                AND ($1 = '' OR c.generated_at >= $1::timestamptz)
              ORDER BY c.generated_at DESC
              LIMIT $2`,
            values: [since, limit],
          }
    );

    if (cardRows.rows.length === 0) {
      console.log("No cards matched. Nothing written.");
      return;
    }

    await mkdir(fixturesDir, { recursive: true });
    let written = 0;

    for (const card of cardRows.rows) {
      const sourceRows = await client.query<{
        url: string;
        title: string;
        source_type: string;
        fetched_at: string;
        raw_text: string;
      }>(`SELECT url, title, source_type, fetched_at::text, raw_text FROM sources WHERE card_id = $1 ORDER BY created_at`, [
        card.id,
      ]);

      if (sourceRows.rows.length === 0) {
        console.log(`skip ${card.slug}: no stored sources`);
        continue;
      }

      const runRows = await client.query<{ trace_json: GenerationTrace | null }>(
        `SELECT trace_json FROM generation_runs
         WHERE slug = $1 AND status = 'complete' AND jsonb_array_length(coalesce(trace_json->'llm'->'calls', '[]'::jsonb)) > 0
         ORDER BY started_at DESC LIMIT 1`,
        [card.slug]
      );

      const llmCalls = runRows.rows[0]?.trace_json?.llm?.calls ?? [];
      const fixture: ProviderMatrixFixture = {
        slug: card.slug,
        domain: card.domain,
        generatedAt: card.generated_at,
        card: card.card_json,
        sources: sourceRows.rows.map((source) => ({
          url: source.url,
          title: source.title,
          sourceType: source.source_type,
          fetchedAt: source.fetched_at,
          rawText: source.raw_text,
        })),
        reference: {
          model: llmCalls[0]?.model ?? null,
          blocksRun: llmCalls
            .filter((call) => call.label.startsWith("extract-block:"))
            .map((call) => call.label.slice("extract-block:".length)),
          llmCalls: llmCalls.map((call) => ({
            stage: call.stage,
            label: call.label,
            model: call.model,
            durationMs: call.durationMs,
            ...(call.estimatedCostUsd !== undefined ? { estimatedCostUsd: call.estimatedCostUsd } : {}),
          })),
        },
      };

      const filePath = path.join(fixturesDir, `${card.slug}.json`);
      await writeFile(filePath, JSON.stringify(fixture, null, 2));
      written += 1;
      console.log(
        `wrote ${card.slug}: ${fixture.sources.length} sources, ${fixture.reference.llmCalls.length} reference llm calls, blocks [${fixture.reference.blocksRun.join(", ")}]`
      );
    }

    console.log(`\n${written} fixture(s) in ${fixturesDir}`);
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
