#!/usr/bin/env tsx
// Read-only production freeze for the corpus eval rig. SELECTs only; no write
// statement may ever enter this script's path.
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { Client } from "pg";

import { generationTraceSchema, sourceQualityForSource } from "@cold-start/core";

import { databaseUrl, loadProductionEnv } from "./alpha-common";
import { bandFor, eraBucket, richnessBands, richnessScore } from "./eval-curation-lib";
import { generationCostBreakdown } from "./generation-cost-accounting";

type CardRow = {
  id: string;
  slug: string;
  domain: string;
  card_json: Record<string, unknown>;
  created_at: Date;
  updated_at: Date;
};

type SourceRow = {
  card_id: string;
  url: string;
  title: string;
  source_type: string;
};

type CitationCountRow = {
  card_id: string;
  n: number;
};

type SectionRow = {
  slug: string;
  domain: string;
  section_id: string;
  visibility: string;
  status: string;
  content_json: Record<string, unknown>;
  citation_ids: string[];
  source_ids: string[];
  run_id: string | null;
  error: string | null;
  generated_at: Date | null;
  stale_at: Date | null;
};

type AnalysisRunRow = {
  domain: string;
  trace_json: Record<string, unknown>;
};

const OUT = path.join(process.cwd(), "eval", "curation", "corpus");

function countByTier(tiers: string[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const tier of tiers) {
    counts[tier] = (counts[tier] ?? 0) + 1;
  }
  return counts;
}

function routingFromTrace(trace: Record<string, unknown>): Record<string, string> | null {
  const llm = trace.llm as { calls?: Array<{ stage?: unknown; model?: unknown }> } | undefined;
  const calls = Array.isArray(llm?.calls) ? llm.calls : [];
  const routing: Record<string, string> = {};
  for (const call of calls) {
    if (typeof call?.stage === "string" && typeof call?.model === "string") {
      routing[call.stage] = call.model;
    }
  }
  return Object.keys(routing).length > 0 ? routing : null;
}

function sectionJson(row: SectionRow) {
  return {
    slug: row.slug,
    domain: row.domain,
    sectionId: row.section_id,
    visibility: row.visibility,
    status: row.status,
    content: row.content_json,
    citationIds: row.citation_ids,
    sourceIds: row.source_ids,
    runId: row.run_id,
    error: row.error,
    generatedAt: row.generated_at ? row.generated_at.toISOString() : null,
    staleAt: row.stale_at ? row.stale_at.toISOString() : null
  };
}

async function main() {
  loadProductionEnv();
  const client = new Client({ connectionString: databaseUrl() });
  await client.connect();
  try {
    await mkdir(path.join(OUT, "cards"), { recursive: true });

    const cards = (
      await client.query<CardRow>(
        "select id, slug, domain, card_json, created_at, updated_at from cards order by created_at asc"
      )
    ).rows;
    const sourcesByCard = new Map<string, SourceRow[]>();
    for (const source of (
      await client.query<SourceRow>("select card_id, url, title, source_type from sources")
    ).rows) {
      sourcesByCard.set(source.card_id, [...(sourcesByCard.get(source.card_id) ?? []), source]);
    }
    const citationCounts = new Map<string, number>();
    for (const row of (
      await client.query<CitationCountRow>(
        "select card_id, count(*)::int as n from citations group by card_id"
      )
    ).rows) {
      citationCounts.set(row.card_id, row.n);
    }
    const sectionsBySlug = new Map<string, SectionRow[]>();
    for (const section of (
      await client.query<SectionRow>(
        `select slug, domain, section_id, visibility, status, content_json, citation_ids,
                source_ids, run_id, error, generated_at, stale_at
           from research_sections
          where status = 'available' and content_json is not null`
      )
    ).rows) {
      sectionsBySlug.set(section.slug, [...(sectionsBySlug.get(section.slug) ?? []), section]);
    }
    const latestAnalysisTraceByDomain = new Map<string, Record<string, unknown>>();
    for (const run of (
      await client.query<AnalysisRunRow>(
        `select distinct on (domain) domain, trace_json
           from generation_runs
          where mode = 'analysis' and trace_json is not null
          order by domain, started_at desc`
      )
    ).rows) {
      latestAnalysisTraceByDomain.set(run.domain, run.trace_json);
    }

    const rows = cards.map((card) => {
      const sources = sourcesByCard.get(card.id) ?? [];
      const tiers = sources.map(
        (source) =>
          sourceQualityForSource(
            { url: source.url, title: source.title, sourceType: source.source_type },
            { targetDomain: card.domain }
          ).tier
      );
      const sections = (sectionsBySlug.get(card.slug) ?? []).map(sectionJson);
      const rawTrace = latestAnalysisTraceByDomain.get(card.domain);
      const trace = rawTrace ? generationTraceSchema.safeParse(rawTrace) : null;
      const cost = trace?.success ? generationCostBreakdown(trace.data) : null;
      const identity = card.card_json?.identity as { name?: { value?: unknown } } | undefined;
      const name = typeof identity?.name?.value === "string" ? identity.name.value : card.slug;
      const synthesis = (card.card_json?.synthesis ?? null) as {
        bullCase?: unknown[];
        bearCase?: unknown[];
        openQuestions?: unknown[];
      } | null;
      return {
        row: {
          slug: card.slug,
          name,
          domain: card.domain,
          createdAt: card.created_at.toISOString(),
          updatedAt: card.updated_at.toISOString(),
          eraBucket: eraBucket(card.created_at),
          hasSynthesis: Boolean(synthesis),
          sourceCount: sources.length,
          sourceQuality: countByTier(tiers),
          citationCount: citationCounts.get(card.id) ?? 0,
          bullCount: synthesis?.bullCase?.length ?? 0,
          bearCount: synthesis?.bearCase?.length ?? 0,
          openQuestionCount: synthesis?.openQuestions?.length ?? 0,
          sectionsPresent: sections.map((section) => section.sectionId),
          richnessScore: richnessScore(tiers),
          richnessBand: "thin" as ReturnType<typeof bandFor>,
          routing: trace?.success ? routingFromTrace(trace.data) : null,
          costUsd: cost?.totalUsd ?? null,
          costBreakdown: cost
        },
        card: card.card_json,
        sections
      };
    });

    const bands = richnessBands(rows.map((entry) => entry.row.richnessScore));
    for (const entry of rows) {
      entry.row.richnessBand = bandFor(entry.row.richnessScore, bands);
    }

    await writeFile(
      path.join(OUT, "index.json"),
      JSON.stringify(
        rows.map((entry) => entry.row),
        null,
        2
      )
    );
    for (const entry of rows) {
      await writeFile(
        path.join(OUT, "cards", `${entry.row.slug}.json`),
        JSON.stringify({ card: entry.card, sections: entry.sections, index: entry.row }, null, 2)
      );
    }
    console.log(
      `froze ${rows.length} cards (${rows.filter((entry) => entry.row.hasSynthesis).length} with synthesis)`
    );
  } finally {
    await client.end();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}
