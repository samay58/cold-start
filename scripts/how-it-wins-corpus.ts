#!/usr/bin/env tsx
/*
 * Two "How it wins" reads per corpus card, one per writer arm, from frozen evidence. The arms
 * share an editor and a verifier; only the writer model differs, and which model sits in slot A
 * is a seeded per-card flip so the rig's reader cannot learn the key from position. Output goes
 * to eval/curation/how-it-wins/, which is gitignored: these files hold synthesis.
 */
import { execFile } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";
import process from "node:process";
import { promisify } from "node:util";

import type Anthropic from "@anthropic-ai/sdk";
import {
  applyHowItWinsVerification,
  coldStartCardSchema,
  howItWinsThinFileReason,
  type ColdStartCard,
  type GenerationLlmCallTrace,
  type HowItWins,
  type HowItWinsRead,
  type SourcedText
} from "@cold-start/core";
import {
  applyVerifierResults,
  createAnthropicClient,
  modelForStage,
  synthesizeHowItWins,
  verifySynthesis,
  HOW_IT_WINS_DEFAULT_EDITOR_MODEL
} from "@cold-start/llm";
import { verificationFactsForClaims } from "@cold-start/pipeline";

import { createSeededRng, type RichnessBand } from "./eval-curation-lib";

const execFileAsync = promisify(execFile);

const DEFAULT_WRITERS: [string, string] = ["claude-sonnet-5", "claude-sonnet-4-6"];
const DEFAULT_SEED = "how-it-wins-1";
const DEFAULT_LIMIT = 20;
const DEFAULT_OUT = path.join("eval", "curation", "how-it-wins");
const CORPUS = path.join("eval", "curation", "corpus");
const SLOPCHECK = path.join(homedir(), ".claude", "scripts", "slopcheck.py");

export type HowItWinsCandidate = {
  slug: string;
  richnessBand: RichnessBand;
  hasSynthesis: boolean;
  thinFileReason: string | null;
};

type ArmLabel = "A" | "B";

type ArmResult = {
  writer: string;
  preVerify: HowItWins;
  read: HowItWins;
  dropReason?: "running-dropped" | "pair-dropped";
  editorSkipped: boolean;
  fitRetried: boolean;
  styleIssues: string[];
  usage: { inputTokens: number; outputTokens: number; estimatedCostUsd: number; durationMs: number };
};

type IndexRow = { slug: string; name: string; domain: string; createdAt: string };

// Bands in preference order. Thin still runs when rich and medium cannot fill the limit; the
// thin-file gate, not the richness band, is what keeps an unreadable card out.
const BAND_ORDER: RichnessBand[] = ["rich", "medium", "thin"];

function shuffled<T>(items: T[], rng: () => number): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    const held = copy[i]!;
    copy[i] = copy[j]!;
    copy[j] = held;
  }
  return copy;
}

export function selectHowItWinsSlugs(
  candidates: HowItWinsCandidate[],
  input: { seed: string; limit: number }
): string[] {
  const rng = createSeededRng(input.seed);
  const eligible = candidates.filter(
    (entry) => entry.hasSynthesis && entry.thinFileReason === null
  );
  const ordered: string[] = [];
  for (const band of BAND_ORDER) {
    const inBand = eligible.filter((entry) => entry.richnessBand === band);
    ordered.push(...shuffled(inBand, rng).map((entry) => entry.slug));
  }
  return ordered.slice(0, input.limit);
}

export function armAssignment(
  seed: string,
  slug: string,
  writers: [string, string]
): Record<ArmLabel, string> {
  const flip = createSeededRng(`${seed}:${slug}`)() < 0.5;
  return flip ? { A: writers[0], B: writers[1] } : { A: writers[1], B: writers[0] };
}

function loadRootEnv() {
  const envPath = path.resolve(process.cwd(), ".env.local");
  if (!existsSync(envPath)) return;
  for (const line of readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const match = line.match(/^([A-Z0-9_]+)\s*=\s*(.*)$/);
    const name = match?.[1];
    if (!name || process.env[name]) continue;
    process.env[name] = (match[2] ?? "").trim().replace(/^['"]|['"]$/g, "");
  }
}

type Flags = {
  limit: number;
  slugs: string[] | null;
  seed: string;
  writers: [string, string];
  editor: string;
  out: string;
  verify: boolean;
};

function parseFlags(argv: string[]): Flags {
  const flags: Flags = {
    limit: DEFAULT_LIMIT,
    slugs: null,
    seed: DEFAULT_SEED,
    writers: DEFAULT_WRITERS,
    editor: HOW_IT_WINS_DEFAULT_EDITOR_MODEL,
    out: DEFAULT_OUT,
    verify: true
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i] ?? "";
    const value = () => argv[++i] ?? "";
    if (arg === "--limit") flags.limit = Number.parseInt(value(), 10);
    else if (arg === "--slugs") flags.slugs = value().split(",").map((s) => s.trim()).filter(Boolean);
    else if (arg === "--seed") flags.seed = value();
    else if (arg === "--editor") flags.editor = value();
    else if (arg === "--out") flags.out = value();
    else if (arg === "--no-verify") flags.verify = false;
    else if (arg === "--writers") {
      const [first, second, ...rest] = value().split(",").map((s) => s.trim()).filter(Boolean);
      if (!first || !second || rest.length > 0) {
        throw new Error("--writers takes exactly two comma-separated models");
      }
      flags.writers = [first, second];
    } else if (arg.startsWith("--")) {
      throw new Error(`unknown flag: ${arg}`);
    }
  }
  if (!Number.isFinite(flags.limit) || flags.limit < 1) throw new Error("--limit must be a positive integer");
  return flags;
}

type CorpusEntry = { row: IndexRow; band: RichnessBand; card: ColdStartCard };

async function loadCorpus(): Promise<Map<string, CorpusEntry>> {
  const indexPath = path.join(process.cwd(), CORPUS, "index.json");
  if (!existsSync(indexPath)) {
    throw new Error(`no corpus at ${CORPUS}; run "npm run eval:snapshot" first`);
  }
  const rows = JSON.parse(await readFile(indexPath, "utf8")) as Array<
    IndexRow & { richnessBand: RichnessBand; hasSynthesis: boolean }
  >;
  const entries = new Map<string, CorpusEntry>();
  for (const row of rows) {
    if (!row.hasSynthesis) continue;
    const file = JSON.parse(
      await readFile(path.join(process.cwd(), CORPUS, "cards", `${row.slug}.json`), "utf8")
    ) as { card: unknown };
    const parsed = coldStartCardSchema.safeParse(file.card);
    if (!parsed.success) {
      console.warn(`skip ${row.slug}: frozen card does not parse`);
      continue;
    }
    entries.set(row.slug, {
      row: { slug: row.slug, name: row.name, domain: row.domain, createdAt: row.createdAt },
      band: row.richnessBand,
      card: parsed.data
    });
  }
  return entries;
}

function usageFromCalls(calls: GenerationLlmCallTrace[]) {
  return calls.reduce(
    (total, call) => ({
      inputTokens: total.inputTokens + (call.inputTokens ?? 0),
      outputTokens: total.outputTokens + (call.outputTokens ?? 0),
      estimatedCostUsd: total.estimatedCostUsd + (call.estimatedCostUsd ?? 0),
      durationMs: total.durationMs + call.durationMs
    }),
    { inputTokens: 0, outputTokens: 0, estimatedCostUsd: 0, durationMs: 0 }
  );
}

// The same claim order verifyCardSynthesisDraft uses for this read: one claim per running
// strategy, then the pair note. Offsets here start at zero because these are the only claims.
function howItWinsClaims(read: HowItWinsRead): SourcedText[] {
  return [
    ...read.running.map((entry) => ({ text: entry.note, citationIds: entry.citationIds })),
    ...(read.pair ? [{ text: read.pair.note, citationIds: read.pair.citationIds }] : [])
  ];
}

async function verifyRead(input: {
  client: Anthropic;
  model: string;
  card: ColdStartCard;
  read: HowItWinsRead;
  telemetry: (call: GenerationLlmCallTrace) => void;
}) {
  const claims = howItWinsClaims(input.read);
  const sources = input.card.citations.map((citation) => ({
    id: citation.id,
    url: citation.url,
    title: citation.title,
    ...(citation.snippet ? { snippet: citation.snippet } : {})
  }));
  const results = await verifySynthesis({
    client: input.client,
    model: input.model,
    claims,
    sources,
    evidenceFacts: verificationFactsForClaims(input.card, claims),
    telemetry: input.telemetry
  });
  const running = input.read.running.map(
    (entry, index) =>
      applyVerifierResults([{ text: entry.note, citationIds: entry.citationIds }], results, index).length === 1
  );
  const pair = input.read.pair
    ? applyVerifierResults(
        [{ text: input.read.pair.note, citationIds: input.read.pair.citationIds }],
        results,
        input.read.running.length
      ).length === 1
    : false;
  return applyHowItWinsVerification(input.read, { running, pair });
}

async function runArm(input: {
  client: Anthropic;
  card: ColdStartCard;
  writer: string;
  editor: string;
  verifyModel: string;
  verify: boolean;
}): Promise<ArmResult> {
  const calls: GenerationLlmCallTrace[] = [];
  const telemetry = (call: GenerationLlmCallTrace) => calls.push(call);
  const result = await synthesizeHowItWins({
    client: input.client,
    models: { writer: input.writer, editor: input.editor },
    card: input.card,
    telemetry
  });

  let read = result.read;
  let dropReason: ArmResult["dropReason"];
  if (input.verify && result.read.status === "read") {
    const verified = await verifyRead({
      client: input.client,
      model: input.verifyModel,
      card: input.card,
      read: result.read,
      telemetry
    });
    read = verified.howItWins;
    dropReason = verified.dropReason;
  }

  return {
    writer: input.writer,
    preVerify: result.read,
    read,
    ...(dropReason ? { dropReason } : {}),
    editorSkipped: result.editorSkipped,
    fitRetried: result.fitRetried,
    styleIssues: result.styleIssues,
    usage: usageFromCalls(calls)
  };
}

// slopcheck exits non-zero only on kill-list hits, and prints its report on stdout either way.
// Warn and structural lines are noise against a JSON file, so only the kill lines are surfaced.
async function slopcheck(slug: string, file: string) {
  if (!existsSync(SLOPCHECK)) return;
  try {
    await execFileAsync("python3", [SLOPCHECK, file]);
  } catch (error) {
    const report = (error as { stdout?: string }).stdout ?? "";
    const kills = report.split("\n").filter((line) => line.includes("KILL"));
    for (const line of kills.length > 0 ? kills : [`slopcheck failed on ${file}`]) {
      console.log(`  ${slug} slop: ${line.trim()}`);
    }
  }
}

function statusLabel(read: HowItWins): string {
  if (read.status !== "read") return read.status;
  return `read/${read.running.length}`;
}

async function writeIndex(outDir: string, row: IndexRow) {
  const indexPath = path.join(outDir, "index.json");
  let rows: IndexRow[] = [];
  if (existsSync(indexPath)) {
    rows = JSON.parse(await readFile(indexPath, "utf8")) as IndexRow[];
  }
  const existing = rows.findIndex((entry) => entry.slug === row.slug);
  if (existing >= 0) rows[existing] = row;
  else rows.push(row);
  await writeFile(indexPath, `${JSON.stringify(rows, null, 2)}\n`);
}

async function main() {
  loadRootEnv();
  const flags = parseFlags(process.argv.slice(2));
  const corpus = await loadCorpus();

  const candidates: HowItWinsCandidate[] = [...corpus.values()].map((entry) => ({
    slug: entry.row.slug,
    richnessBand: entry.band,
    hasSynthesis: true,
    thinFileReason: howItWinsThinFileReason(entry.card)
  }));
  const slugs = flags.slugs ?? selectHowItWinsSlugs(candidates, { seed: flags.seed, limit: flags.limit });
  if (slugs.length === 0) {
    console.log("nothing to read: no corpus card carries synthesis and clears the thin-file gate");
    return;
  }

  const client = createAnthropicClient();
  const verifyModel = modelForStage("verify");
  const outDir = path.resolve(process.cwd(), flags.out);
  await mkdir(outDir, { recursive: true });
  console.log(
    `${slugs.length} cards, writers ${flags.writers.join(" and ")}, editor ${flags.editor}, verifier ${flags.verify ? verifyModel : "off"}`
  );

  let spent = 0;
  for (const slug of slugs) {
    const entry = corpus.get(slug);
    if (!entry) {
      console.log(`${slug}  not in corpus`);
      continue;
    }
    const key = armAssignment(flags.seed, slug, flags.writers);
    const startedAt = Date.now();
    try {
      // One card at a time (Anthropic rate limits), but its two arms are independent.
      const run = (label: ArmLabel) =>
        runArm({
          client,
          card: entry.card,
          writer: key[label],
          editor: flags.editor,
          verifyModel,
          verify: flags.verify
        });
      const [armA, armB] = await Promise.all([run("A"), run("B")]);
      const cost = armA.usage.estimatedCostUsd + armB.usage.estimatedCostUsd;
      spent += cost;
      const file = {
        slug,
        name: entry.row.name,
        domain: entry.row.domain,
        editor: flags.editor,
        arms: { A: armA, B: armB },
        key
      };
      const filePath = path.join(outDir, `${slug}.json`);
      await writeFile(filePath, `${JSON.stringify(file, null, 2)}\n`);
      await writeIndex(outDir, { ...entry.row, createdAt: new Date().toISOString() });
      console.log(
        `${slug}  A ${statusLabel(armA.read)}  B ${statusLabel(armB.read)}  $${cost.toFixed(4)}  ${Math.round((Date.now() - startedAt) / 1000)}s`
      );
      await slopcheck(slug, filePath);
    } catch (error) {
      console.log(
        `${slug}  failed after ${Math.round((Date.now() - startedAt) / 1000)}s: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }
  console.log(`total $${spent.toFixed(4)}`);
}

if (process.argv[1] && import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
