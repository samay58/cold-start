#!/usr/bin/env tsx
// Read-only gate study over prod cards. Validates the new floor-plus-advisory synthesis
// gate (synthesisGateDecision, Task 1.1) against the deleted old gate (a0cf128) for every
// company that had an `analysis` generation run in the recent window, so a human can review
// the delta before the new gate ships. Zero writes; SELECT only.
//
// Old gate (reconstructed, not re-derived from git): pass only when ALL four held:
//   citationCount >= minCitations(8) AND nonEnrichmentSourceTypes.length >= 2
//   AND hasFundingEvidence AND hasNamedTeamMember.
// New gate: synthesisGateDecision(card, 8) from @cold-start/core.
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";
import { Client } from "pg";

import {
  coldStartCardSchema,
  synthesisEvidenceSignals,
  synthesisGateDecision,
  type ColdStartCard,
  type SynthesisEvidenceSignals
} from "@cold-start/core";

// The 11 withheld runs this study must account for (Task 1.3 brief). Not a filter, a
// completeness check: every one of these slugs must show up in the population below.
const KNOWN_WITHHELD_SLUGS = [
  "moonshot",
  "generaltranslation",
  "fanttik",
  "nuoathletics",
  "heynox",
  "timescaledb",
  "aside"
] as const;

const MIN_CITATIONS = 8;

type SlugRunRow = {
  slug: string;
  domain: string;
  runs: number;
  last_started_at: Date;
};

type CardRow = {
  slug: string;
  domain: string;
  card_json: unknown;
  generated_at: Date;
  updated_at: Date;
};

type GateOutcomeOld = "pass" | "block" | "no-card" | "error";
type GateOutcomeNew = "synthesize" | "synthesize-with-advisories" | "block" | "no-card" | "error";

type StudyRow = {
  slug: string;
  domain: string;
  runs: number;
  known: boolean;
  parse: "ok" | "raw" | "no-card";
  citationCount: number | null;
  sourceTypeCount: number | null;
  oldOutcome: GateOutcomeOld;
  newOutcome: GateOutcomeNew;
  reasons: string[];
  advisories: string[];
  note: string | null;
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

function parseSinceDays(input: string | undefined, fallbackDays: number) {
  const relative = input?.match(/^(\d+)d$/i);
  const days = relative ? Number(relative[1]) : Number(input);
  return Number.isFinite(days) && days > 0 ? days : fallbackDays;
}

export function analysisRunsBySlugQuery(sinceIso: string) {
  return {
    text: `select slug, min(domain) as domain, count(*)::int as runs, max(started_at) as last_started_at
             from generation_runs
            where job_kind = 'analysis' and started_at >= $1
            group by slug
            order by slug`,
    values: [sinceIso]
  };
}

export function cardsBySlugQuery(slugs: string[]) {
  return {
    text: `select slug, domain, card_json, generated_at, updated_at
             from cards
            where slug = any($1::text[])`,
    values: [slugs]
  };
}

const EMPTY_SIGNALS: SynthesisEvidenceSignals = {
  citationCount: 0,
  nonEnrichmentSourceTypes: [],
  hasFundingEvidence: false,
  hasNamedTeamMember: false
};

function oldGateOutcome(signals: SynthesisEvidenceSignals): GateOutcomeOld {
  const pass =
    signals.citationCount >= MIN_CITATIONS &&
    signals.nonEnrichmentSourceTypes.length >= 2 &&
    signals.hasFundingEvidence &&
    signals.hasNamedTeamMember;
  return pass ? "pass" : "block";
}

function newGateOutcome(blocked: boolean, advisoryCount: number): GateOutcomeNew {
  if (blocked) {
    return "block";
  }
  return advisoryCount > 0 ? "synthesize-with-advisories" : "synthesize";
}

function buildStudyRow(slugRow: SlugRunRow, cardRow: CardRow | undefined): StudyRow {
  const base = {
    slug: slugRow.slug,
    domain: slugRow.domain,
    runs: slugRow.runs,
    known: (KNOWN_WITHHELD_SLUGS as readonly string[]).includes(slugRow.slug)
  };

  if (!cardRow) {
    return {
      ...base,
      parse: "no-card",
      citationCount: null,
      sourceTypeCount: null,
      oldOutcome: "no-card",
      newOutcome: "no-card",
      reasons: [],
      advisories: [],
      note: "no row in cards table for this slug"
    };
  }

  const strictParse = coldStartCardSchema.safeParse(cardRow.card_json);
  // Lenient fallback: a strict-parse failure (e.g. a newer optional field, a stricter
  // enum) should not drop the row. synthesisEvidenceSignals only touches citations,
  // funding.totalRaisedUsd/lastRound, and team.founders/keyExecs, so the raw JSON shape
  // is usually enough even when the full schema rejects it.
  const cardForSignals = (strictParse.success ? strictParse.data : cardRow.card_json) as ColdStartCard;

  try {
    const signals = synthesisEvidenceSignals(cardForSignals);
    const decision = synthesisGateDecision(cardForSignals, MIN_CITATIONS);
    return {
      ...base,
      parse: strictParse.success ? "ok" : "raw",
      citationCount: signals.citationCount,
      sourceTypeCount: signals.nonEnrichmentSourceTypes.length,
      oldOutcome: oldGateOutcome(signals),
      newOutcome: newGateOutcome(decision.blocked, decision.advisories.length),
      reasons: decision.reasons,
      advisories: decision.advisories,
      note: strictParse.success ? null : `strict schema parse failed: ${strictParse.error.issues[0]?.message ?? "unknown issue"}`
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      ...base,
      parse: strictParse.success ? "ok" : "raw",
      citationCount: EMPTY_SIGNALS.citationCount,
      sourceTypeCount: EMPTY_SIGNALS.nonEnrichmentSourceTypes.length,
      oldOutcome: "error",
      newOutcome: "error",
      reasons: [],
      advisories: [],
      note: `signal computation threw: ${message}`
    };
  }
}

function pad(value: string, width: number) {
  return value.length >= width ? `${value.slice(0, width - 1)}…` : value.padEnd(width);
}

function printTable(rows: StudyRow[]) {
  const widths = { slug: 22, old: 8, new: 28, reasons: 40, advisories: 56, cite: 5, src: 4, parse: 6, runs: 5, known: 6 };
  const header = [
    pad("slug", widths.slug),
    pad("old", widths.old),
    pad("new", widths.new),
    pad("reasons", widths.reasons),
    pad("advisories", widths.advisories),
    pad("cite", widths.cite),
    pad("src", widths.src),
    pad("parse", widths.parse),
    pad("runs", widths.runs),
    pad("known", widths.known)
  ].join(" ");
  console.log(header);
  console.log("-".repeat(header.length));

  for (const row of rows) {
    const line = [
      pad(row.slug, widths.slug),
      pad(row.oldOutcome, widths.old),
      pad(row.newOutcome, widths.new),
      pad(row.reasons.length > 0 ? row.reasons.join("+") : "-", widths.reasons),
      pad(row.advisories.length > 0 ? row.advisories.join("+") : "-", widths.advisories),
      pad(row.citationCount === null ? "-" : String(row.citationCount), widths.cite),
      pad(row.sourceTypeCount === null ? "-" : String(row.sourceTypeCount), widths.src),
      pad(row.parse, widths.parse),
      pad(String(row.runs), widths.runs),
      pad(row.known ? "yes" : "-", widths.known)
    ].join(" ");
    console.log(line);
    if (row.note) {
      console.log(`  note: ${row.note}`);
    }
  }
}

async function queryPopulation(client: Client, sinceDays: number) {
  const sinceIso = new Date(Date.now() - sinceDays * 86_400_000).toISOString();
  const { rows } = await client.query<SlugRunRow>(analysisRunsBySlugQuery(sinceIso));
  return { sinceIso, slugRows: rows };
}

async function main() {
  loadEnv();
  const databaseUrl = process.env.DATABASE_URL?.trim();
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is empty. Run `set -a; source .env.production.migrate.local; set +a` first.");
  }

  const explicitSince = argValue("--since");
  let sinceDays = parseSinceDays(explicitSince, 60);

  const client = new Client({ connectionString: databaseUrl });
  await client.connect();
  try {
    let { sinceIso, slugRows } = await queryPopulation(client, sinceDays);

    const knownSlugSet = new Set(slugRows.map((row) => row.slug));
    const missingKnown = KNOWN_WITHHELD_SLUGS.filter((slug) => !knownSlugSet.has(slug));
    let widened = false;

    if (missingKnown.length > 0 && explicitSince === undefined && sinceDays < 90) {
      widened = true;
      sinceDays = 90;
      ({ sinceIso, slugRows } = await queryPopulation(client, sinceDays));
    }

    const finalKnownSlugSet = new Set(slugRows.map((row) => row.slug));
    const stillMissingKnown = KNOWN_WITHHELD_SLUGS.filter((slug) => !finalKnownSlugSet.has(slug));

    const slugs = slugRows.map((row) => row.slug);
    const cardRows = slugs.length > 0 ? (await client.query<CardRow>(cardsBySlugQuery(slugs))).rows : [];
    const cardBySlug = new Map(cardRows.map((row) => [row.slug, row]));

    const studyRows: StudyRow[] = slugRows.map((slugRow) => buildStudyRow(slugRow, cardBySlug.get(slugRow.slug)));
    studyRows.sort((left, right) => left.slug.localeCompare(right.slug));

    console.log(`synthesis gate study over prod cards (job_kind='analysis' runs, last ${sinceDays}d${widened ? ", widened from 60d" : ""})`);
    console.log(`window: ${sinceIso} -> now`);
    console.log(`population: ${slugRows.length} distinct slugs, ${cardRows.length} with a cards row`);
    if (widened) {
      console.log(`note: widened from 60d to 90d because these known slugs were missing at 60d: ${missingKnown.join(", ")}`);
    }
    if (stillMissingKnown.length > 0) {
      console.log(`WARNING: still missing from population after widening: ${stillMissingKnown.join(", ")}`);
    } else {
      console.log(`all ${KNOWN_WITHHELD_SLUGS.length} known withheld slugs present in population`);
    }
    console.log("");

    printTable(studyRows);
    console.log("");

    const studied = studyRows.filter((row) => row.parse !== "no-card" && row.oldOutcome !== "error");
    const noCard = studyRows.filter((row) => row.parse === "no-card");
    const errored = studyRows.filter((row) => row.oldOutcome === "error");
    const parseRaw = studyRows.filter((row) => row.parse === "raw");

    const oldPass = studied.filter((row) => row.oldOutcome === "pass");
    const oldBlock = studied.filter((row) => row.oldOutcome === "block");
    const newSynthesize = studied.filter((row) => row.newOutcome === "synthesize");
    const newAdvisory = studied.filter((row) => row.newOutcome === "synthesize-with-advisories");
    const newBlock = studied.filter((row) => row.newOutcome === "block");
    const flipToSynthesize = studied.filter((row) => row.oldOutcome === "block" && row.newOutcome !== "block");
    const stillBlocked = studied.filter((row) => row.oldOutcome === "block" && row.newOutcome === "block");
    const regression = studied.filter((row) => row.oldOutcome === "pass" && row.newOutcome === "block");

    console.log("summary");
    console.log(`  cards studied: ${studied.length} (no-card: ${noCard.length}, signal-compute-error: ${errored.length}, strict-parse-failed-but-computed: ${parseRaw.length})`);
    console.log(`  old gate: pass=${oldPass.length} block=${oldBlock.length}`);
    console.log(`  new gate: synthesize=${newSynthesize.length} synthesize-with-advisories=${newAdvisory.length} block=${newBlock.length}`);
    console.log(`  flips old-block -> new-not-blocked: ${flipToSynthesize.length}`);
    console.log(`  still blocked (old-block AND new-block): ${stillBlocked.length}`);
    console.log(`  regressions (old-pass AND new-block, should be 0): ${regression.length}`);
    if (regression.length > 0) {
      console.log(`    regression slugs: ${regression.map((row) => row.slug).join(", ")}`);
    }
    if (stillBlocked.length > 0) {
      console.log(`  still-blocked slugs: ${stillBlocked.map((row) => row.slug).join(", ")}`);
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
