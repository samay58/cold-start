#!/usr/bin/env tsx
// Freezes one real, hand-reviewed production card and its most recent completed
// generation run's trace into apps/web/src/components/landing/recorded-build-data.ts,
// the checked-in data source for the landing page's "recorded build" hero animation
// (Tasks 17-18). READ-ONLY against production: every query below is a SELECT, and
// nothing here writes to generation_runs, cards, or any other table.
//
// Usage:
//   set -a; source .env.production.migrate.local; set +a
//   npx tsx scripts/export-recorded-build.ts --slug <slug>
//
// Derivation rules (see the Task 16 brief):
// - documentsOpened = trace.sourceGate.acceptedCount + trace.sourceGate.rejectedCount
// - documentsKept   = trace.sourceGate.acceptedCount
// - factsKept       = trace.extraction.citationCount ?? trace.extraction.evidenceCount
// - events: "Reading {domain}" and "Filed" always appear; the two counted lines only
//   appear when their trace numbers actually exist. Never fabricated.
// - clippings: the four most recent signals (hostname, date, title).
// - sections.money/people/signals/sources: constructed from the real card, never invented.
// - lens: only emitted when the card carries synthesis.
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

import { and, desc, eq } from "drizzle-orm";

import {
  coldStartCardSchema,
  formatCompactUsd,
  formatMonthYear,
  generationTraceSchema,
  stripCitationMarkers,
  type ColdStartCard,
  type GenerationTrace
} from "@cold-start/core";
import { cards, generationRuns } from "@cold-start/db";

import {
  databaseUrl,
  hasFlag,
  loadProductionEnv,
  parseCliArguments,
  requiredValue,
  runCli,
  withAlphaDb
} from "./alpha-common";

const OUTPUT_PATH = resolve(process.cwd(), "apps/web/src/components/landing/recorded-build-data.ts");

// Real published sources, not Cold Start's own internal enrichment plumbing (StableEnrich
// probe URLs, Apollo/agentcash lookups). Those carry sourceType "enrichment" and would read
// as broken or leak implementation detail if they showed up as a "source" on the landing page.
const PUBLISHER_SOURCE_TYPES = new Set(["news", "company_site", "filing", "github", "rdap"]);

type RecordedBuild = {
  domain: string;
  companyName: string;
  oneLiner: string;
  filedDate: string;
  clippings: Array<{ source: string; date: string; headline: string }>;
  events: string[];
  counts: { documentsOpened: number; documentsKept: number; factsKept: number };
  sections: { money: string[]; people: string[]; signals: string[]; sources: string[] };
  lens?: { whyCare: string; whatMustBeTrue: string };
};

const HELP = `Freeze one real, filed production card plus its most recent completed
generation run's trace into the landing page's recorded-build data module.

Usage:
  set -a; source .env.production.migrate.local; set +a
  npx tsx scripts/export-recorded-build.ts --slug <slug>

Read-only against production (SELECT only). Prints the emitted TypeScript module to
stdout and writes it to:
  ${OUTPUT_PATH}
`;

function hostnameFromUrl(url: string): string | null {
  try {
    return new URL(url).hostname.replace(/^www\./i, "");
  } catch {
    return null;
  }
}

function buildRecordedBuild(card: ColdStartCard, trace: GenerationTrace): RecordedBuild {
  const domain = card.domain;
  const companyName = card.identity.name.value ?? domain;
  const oneLiner = card.identity.oneLiner.value ?? "";
  const filedDate = card.generatedAt.slice(0, 10);

  const clippings = [...card.signals]
    .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0))
    .slice(0, 4)
    .map((signal) => ({
      source: hostnameFromUrl(signal.url) ?? signal.source,
      date: signal.date,
      headline: signal.title
    }));

  const documentsOpened = trace.sourceGate
    ? trace.sourceGate.acceptedCount + trace.sourceGate.rejectedCount
    : null;
  const documentsKept = trace.sourceGate ? trace.sourceGate.acceptedCount : null;
  const factsKept = trace.extraction
    ? trace.extraction.citationCount ?? trace.extraction.evidenceCount
    : null;

  const events: string[] = [`Reading ${domain}`];
  if (documentsOpened !== null && documentsKept !== null) {
    events.push(`Opened ${documentsOpened} documents, kept ${documentsKept}`);
  }
  if (factsKept !== null) {
    events.push(`Cut ${factsKept} facts, each pinned to a document`);
  }
  events.push("Filed");

  const money: string[] = [];
  const totalRaised = card.funding.totalRaisedUsd.value;
  if (totalRaised !== null) {
    money.push(`Raised ${formatCompactUsd(totalRaised)} across disclosed rounds.`);
  }
  const lastRound = card.funding.lastRound.value;
  if (lastRound) {
    const lead = lastRound.leadInvestors[0] ?? null;
    const monthText = lastRound.announcedAt ? formatMonthYear(lastRound.announcedAt) : null;
    const closedClause = monthText ? ` closed ${monthText}` : "";
    const leadClause = lead ? `, led by ${lead}` : "";
    money.push(`${lastRound.name}${closedClause}${leadClause}.`);
  }

  const people = (card.team.founders.value ?? []).map((founder) => founder.name);
  const signalTitles = card.signals.map((signal) => signal.title);

  const seenPublishers = new Set<string>();
  const sources: string[] = [];
  for (const citation of card.citations) {
    if (!PUBLISHER_SOURCE_TYPES.has(citation.sourceType)) {
      continue;
    }
    const hostname = hostnameFromUrl(citation.url);
    if (!hostname || seenPublishers.has(hostname)) {
      continue;
    }
    seenPublishers.add(hostname);
    sources.push(hostname);
  }

  const recordedBuild: RecordedBuild = {
    domain,
    companyName,
    oneLiner,
    filedDate,
    clippings,
    events,
    counts: {
      documentsOpened: documentsOpened ?? 0,
      documentsKept: documentsKept ?? 0,
      factsKept: factsKept ?? 0
    },
    sections: { money, people, signals: signalTitles, sources }
  };

  if (card.synthesis && card.synthesis.bullCase.length > 0) {
    recordedBuild.lens = {
      whyCare: stripCitationMarkers(card.synthesis.whyItMatters.text),
      whatMustBeTrue: stripCitationMarkers(card.synthesis.bullCase[0]!.text)
    };
  }

  return recordedBuild;
}

function renderModule(
  recordedBuild: RecordedBuild,
  provenance: { slug: string; domain: string; runId: string; exportedAt: Date }
): string {
  const exportedDate = provenance.exportedAt.toISOString().slice(0, 10);
  return `// Frozen production data for the landing page's "recorded build" hero animation
// (Tasks 17-18). Generated by scripts/export-recorded-build.ts, read-only against
// production Postgres. Every number here traces back to one real run's trace_json.
//
// Source: slug "${provenance.slug}" (${provenance.domain})
// Generation run: ${provenance.runId}
// Exported: ${exportedDate}
//
// Plain data, no imports: this feeds a client component and must stay inert.

export interface RecordedBuild {
  domain: string;
  companyName: string;
  oneLiner: string;
  filedDate: string;
  clippings: Array<{ source: string; date: string; headline: string }>; // up to 4, from the card's citations/signals
  events: string[]; // ordered stage lines derived from the real trace
  counts: { documentsOpened: number; documentsKept: number; factsKept: number };
  sections: { money: string[]; people: string[]; signals: string[]; sources: string[] };
  lens?: { whyCare: string; whatMustBeTrue: string }; // present only when the card carries synthesis
}

export const recordedBuild: RecordedBuild = ${JSON.stringify(recordedBuild, null, 2)};
`;
}

async function main(argv = process.argv.slice(2)): Promise<void> {
  const args = parseCliArguments(argv);
  if (hasFlag(args, "--help")) {
    console.log(HELP);
    return;
  }

  const slug = requiredValue(args, "--slug");
  loadProductionEnv();

  await withAlphaDb(async (db) => {
    const [cardRow] = await db
      .select({ cardJson: cards.cardJson, domain: cards.domain })
      .from(cards)
      .where(eq(cards.slug, slug))
      .limit(1);
    if (!cardRow) {
      throw new Error(`No card found for slug "${slug}".`);
    }

    const cardParsed = coldStartCardSchema.safeParse(cardRow.cardJson);
    if (!cardParsed.success) {
      throw new Error(
        `Stored card for "${slug}" does not parse against the current card schema; pick a different slug.`
      );
    }
    const card = cardParsed.data;

    const [runRow] = await db
      .select({ id: generationRuns.id, traceJson: generationRuns.traceJson, startedAt: generationRuns.startedAt })
      .from(generationRuns)
      .where(and(eq(generationRuns.slug, slug), eq(generationRuns.status, "complete")))
      .orderBy(desc(generationRuns.startedAt))
      .limit(1);
    if (!runRow) {
      throw new Error(`No completed generation run found for slug "${slug}".`);
    }

    const traceParsed = runRow.traceJson ? generationTraceSchema.safeParse(runRow.traceJson) : null;
    if (!traceParsed || !traceParsed.success) {
      throw new Error(
        `Latest completed run for "${slug}" (${runRow.id}) has no valid trace_json. ` +
          "That run does not have a complete trace for this export; pick a different slug."
      );
    }
    const trace = traceParsed.data as GenerationTrace;

    const recordedBuild = buildRecordedBuild(card, trace);
    const moduleSource = renderModule(recordedBuild, {
      slug,
      domain: card.domain,
      runId: runRow.id,
      exportedAt: new Date()
    });

    console.log(moduleSource);
    mkdirSync(dirname(OUTPUT_PATH), { recursive: true });
    writeFileSync(OUTPUT_PATH, moduleSource, "utf8");
    console.error(`\nWrote ${OUTPUT_PATH}`);
  });
}

runCli(import.meta.url, main);
