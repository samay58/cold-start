#!/usr/bin/env tsx
/*
 * Replay the frozen How it wins writer against the four known-company monolith
 * verdicts from the decision screen. No new judge calls. Writes a private
 * hoverable review under apps/web/.cold-start/. Not the holdout. Not a flag flip.
 */
import { execFile } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

import type Anthropic from "@anthropic-ai/sdk";
import {
  coldStartCardSchema,
  howItWinsJudgmentSchema,
  type ColdStartCard,
  type GenerationLlmCallTrace,
  type HowItWins,
  type HowItWinsJudgment,
  type HowItWinsRead,
  type SourcedText
} from "@cold-start/core";
import {
  createAnthropicClient,
  isTransientLlmError,
  modelForStage,
  synthesizeHowItWins,
  verifySynthesis,
  HOW_IT_WINS_DEFAULT_EDITOR_MODEL
} from "@cold-start/llm";
import { verificationFactsForClaims, verifiedHowItWins } from "@cold-start/pipeline";

import { buildHowItWinsEvidencePacket, hashBenchmarkValue } from "./how-it-wins-topology-benchmark-lib";

const execFileAsync = promisify(execFile);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const MANIFEST_PATH = path.join(ROOT, "eval/curation/ledger/how-it-wins-topology-benchmark-manifest.json");
const CORPUS_CARDS = path.join(ROOT, "eval/curation/corpus/cards");
const RUNS_DIR = path.join(
  ROOT,
  "apps/web/.cold-start/how-it-wins-topology-benchmark/how-it-wins-topology-2026-08-23-semantic-repair/runs"
);
const OUT_DIR = path.join(ROOT, "apps/web/.cold-start/how-it-wins-known-company-review");
const UI_ENTRY = path.join(path.dirname(fileURLToPath(import.meta.url)), "how-it-wins-known-company-review-ui.tsx");
const CROWN_CSS = path.join(ROOT, "apps/extension/src/styles/how-it-wins.css");
const SLOPCHECK = path.join(homedir(), ".claude", "scripts", "slopcheck.py");
const ESBUILD = path.join(ROOT, "node_modules/.bin/esbuild");

const COMPANIES = [
  {
    slug: "cognition",
    name: "Cognition",
    runFile: "cognition__base__0__monolith__cbd50a9001b7.json",
    why: "Ceiling he liked on the screen. Regression check for the new writer."
  },
  {
    slug: "august",
    name: "August",
    runFile: "august__screen__0__monolith__3c87581d69dd.json",
    why: "Okay written, more insight, no slop. Direct writing test."
  },
  {
    slug: "hebbia",
    name: "Hebbia",
    runFile: "hebbia__screen__0__monolith__3c87581d69dd.json",
    why: "He picked the other topology. This is the monolith that would ship."
  },
  {
    slug: "bland",
    name: "Bland",
    runFile: "bland__base__0__monolith__cbd50a9001b7.json",
    why: "Pick neither. Best test of a crown that keeps live uncertainties without a current set."
  }
] as const;

type Company = (typeof COMPANIES)[number];

type Manifest = { safeCards: Array<{ slug: string; evidenceHash: string }> };

export type KnownCompanyReview = {
  slug: string;
  name: string;
  runId: string;
  why: string;
  currentStrategyIds: string[];
  inQuestionIds: string[];
  preVerify: HowItWins;
  read: HowItWins;
  dropReason?: "running-dropped" | "pair-dropped";
  editorSkipped: boolean;
  fitRetried: boolean;
  styleIssues: string[];
  usage: { inputTokens: number; outputTokens: number; estimatedCostUsd: number; durationMs: number };
  failure?: string;
};

function loadRootEnv() {
  const envPath = path.join(ROOT, ".env.local");
  if (!existsSync(envPath)) return;
  for (const line of readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const match = line.match(/^([A-Z0-9_]+)\s*=\s*(.*)$/);
    const name = match?.[1];
    if (!name || process.env[name]) continue;
    process.env[name] = (match[2] ?? "").trim().replace(/^['"]|['"]$/g, "");
  }
}

function parseFlags(argv: string[]) {
  return {
    force: argv.includes("--force"),
    uiOnly: argv.includes("--ui-only"),
    dryRun: argv.includes("--dry-run")
  };
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

function howItWinsClaims(read: HowItWinsRead): SourcedText[] {
  return [
    ...read.running.map((entry) => ({ text: entry.note, citationIds: entry.citationIds })),
    ...(read.pair ? [{ text: read.pair.note, citationIds: read.pair.citationIds }] : []),
    ...(read.inQuestion ?? []).map((entry) => ({ text: entry.note, citationIds: entry.citationIds }))
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
  return verifiedHowItWins(input.read, results, 0);
}

function loadCard(slug: string) {
  const raw = JSON.parse(readFileSync(path.join(CORPUS_CARDS, `${slug}.json`), "utf8")) as { card: unknown };
  return coldStartCardSchema.parse(raw.card);
}

function loadJudgment(company: Company): { runId: string; judgment: HowItWinsJudgment } {
  const stored = JSON.parse(readFileSync(path.join(RUNS_DIR, company.runFile), "utf8")) as {
    value?: { run?: { runId?: string }; outcome?: string; verdict?: unknown };
    run?: { runId?: string };
    outcome?: string;
    verdict?: unknown;
  };
  const value = stored.value ?? stored;
  if (value.outcome !== "ok") throw new Error(`${company.slug}: ${company.runFile} is not a valid monolith verdict`);
  return {
    runId: value.run?.runId ?? company.runFile,
    judgment: howItWinsJudgmentSchema.parse(value.verdict)
  };
}

function preflight(company: Company, card: ColdStartCard, judgment: HowItWinsJudgment, manifest: Manifest) {
  const frozen = manifest.safeCards.find((entry) => entry.slug === company.slug);
  if (!frozen) throw new Error(`${company.slug} is not on the closed allowlist`);
  const packet = buildHowItWinsEvidencePacket(card, { orderSeed: null });
  if (hashBenchmarkValue(packet) !== frozen.evidenceHash) {
    throw new Error(`${company.slug}: corpus evidence hash drifted from the frozen verdict`);
  }
  const citations = new Set(card.citations.map((citation) => citation.id));
  const missing = judgment.evidenceRegistry
    .map((entry) => entry.evidenceId)
    .filter((id) => !citations.has(id));
  if (missing.length > 0) {
    throw new Error(`${company.slug}: judgment cites evidence missing from the card: ${missing.join(", ")}`);
  }
}

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

async function writeReviewPage(reviews: KnownCompanyReview[]) {
  await mkdir(OUT_DIR, { recursive: true });
  await writeFile(path.join(OUT_DIR, "index.json"), `${JSON.stringify(reviews, null, 2)}\n`);
  await writeFile(
    path.join(OUT_DIR, "data.js"),
    `window.__KNOWN_COMPANY_REVIEWS__ = ${JSON.stringify(reviews)};\n`
  );
  await copyFile(CROWN_CSS, path.join(OUT_DIR, "how-it-wins.css"));
  await writeFile(
    path.join(OUT_DIR, "index.html"),
    `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="robots" content="noindex" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Known-company How it wins</title>
    <link rel="stylesheet" href="./how-it-wins.css" />
    <style>
      :root {
        --color-field: #f7f5ee;
        --color-plate: #fffdf8;
        --color-ink: #171a1f;
        --color-muted: #68706a;
        --color-rule: #ccc7b8;
        --color-rule-strong: #9c978a;
        --color-focus: #d7b84a;
        --font-text: "AtTextual", ui-serif, Georgia, serif;
        --font-body: "IBM Plex Sans", ui-sans-serif, system-ui, sans-serif;
        --cs-motion-ease-out: cubic-bezier(0.16, 1, 0.3, 1);
        --shadow-popover: 0 10px 26px rgb(23 26 31 / 0.10), 0 0 0 1px var(--color-rule);
      }
      * { box-sizing: border-box; }
      body {
        margin: 0;
        background: var(--color-field);
        color: var(--color-ink);
        font-family: var(--font-body);
      }
      .review {
        max-width: 720px;
        margin: 0 auto;
        padding: 28px 20px 80px;
      }
      .review-kicker, .review-why, .review-note p, .review-text p, .review-text li {
        font-size: 14px;
        line-height: 1.45;
      }
      .review-kicker { color: var(--color-muted); margin: 0 0 8px; }
      h1 { font-size: 22px; font-weight: 640; margin: 0 0 10px; }
      h2 { font-size: 18px; font-weight: 640; margin: 0 0 6px; }
      .review-intro { margin: 0 0 28px; font-size: 15px; line-height: 1.5; }
      .review-card { margin: 0 0 36px; }
      .review-why { color: var(--color-muted); margin: 0 0 12px; }
      .review-crown {
        position: relative;
        background: var(--color-plate);
        border: 1px solid var(--color-rule);
        border-radius: 8px;
        margin-bottom: 16px;
        padding-bottom: 120px;
      }
      .review-text { padding: 0 4px; }
      .review-text .name { font-weight: 640; margin: 12px 0 2px; }
      .review-text .meaning { color: var(--color-muted); font-size: 13px; margin: 0 0 4px; }
      .review-fail { color: #8a3b2b; }
    </style>
  </head>
  <body>
    <div id="root"></div>
    <script src="./data.js"></script>
    <script src="./review.js"></script>
  </body>
</html>
`
  );
  if (!existsSync(ESBUILD)) throw new Error("esbuild is not installed at the repo root");
  await execFileAsync(ESBUILD, [
    UI_ENTRY,
    "--bundle",
    "--outfile=" + path.join(OUT_DIR, "review.js"),
    "--format=iife",
    "--jsx=automatic",
    "--platform=browser",
    "--target=es2022",
    `--define:process.env.NODE_ENV=${JSON.stringify("production")}`
  ], { cwd: ROOT });
}

async function runCompany(input: {
  company: Company;
  client: Anthropic;
  writer: string;
  editor: string;
  verifyModel: string;
  judgment: HowItWinsJudgment;
  card: ColdStartCard;
}): Promise<KnownCompanyReview> {
  const calls: GenerationLlmCallTrace[] = [];
  const telemetry = (call: GenerationLlmCallTrace) => calls.push(call);
  const inQuestionIds = input.judgment.strategyEvaluations
    .filter((entry) => entry.disposition === "open_question")
    .map((entry) => entry.strategyId);
  const base = {
    slug: input.company.slug,
    name: input.company.name,
    runId: "",
    why: input.company.why,
    currentStrategyIds: [...input.judgment.currentStrategyIds],
    inQuestionIds
  };
  try {
    const result = await synthesizeHowItWins({
      client: input.client,
      models: { writer: input.writer, editor: input.editor },
      card: input.card,
      telemetry,
      judgment: input.judgment
    });
    let read = result.read;
    let dropReason: KnownCompanyReview["dropReason"];
    if (result.read.status === "read") {
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
      ...base,
      runId: "",
      preVerify: result.read,
      read,
      ...(dropReason ? { dropReason } : {}),
      editorSkipped: result.editorSkipped,
      fitRetried: result.fitRetried,
      styleIssues: result.styleIssues,
      usage: usageFromCalls(calls)
    };
  } catch (error) {
    if (isTransientLlmError(error)) throw error;
    const message = error instanceof Error ? error.message : String(error);
    return {
      ...base,
      runId: "",
      preVerify: { status: "nothing_stands_out", inQuestion: [] },
      read: { status: "nothing_stands_out", inQuestion: [] },
      editorSkipped: true,
      fitRetried: false,
      styleIssues: [],
      usage: usageFromCalls(calls),
      failure: message.slice(0, 300)
    };
  }
}

async function main() {
  loadRootEnv();
  const flags = parseFlags(process.argv.slice(2));
  const manifest = JSON.parse(await readFile(MANIFEST_PATH, "utf8")) as Manifest;
  await mkdir(OUT_DIR, { recursive: true });

  const loaded = COMPANIES.map((company) => {
    const card = loadCard(company.slug);
    const { runId, judgment } = loadJudgment(company);
    preflight(company, card, judgment, manifest);
    return { company, card, runId, judgment };
  });

  for (const entry of loaded) {
    const current = entry.judgment.currentStrategyIds.join(", ") || "(none)";
    const questions = entry.judgment.strategyEvaluations.filter((row) => row.disposition === "open_question").length;
    console.log(
      `${entry.company.slug}: ${entry.judgment.currentStrategyIds.length} current [${current}]; ${questions} in question; run ${entry.runId}`
    );
  }

  if (flags.dryRun) {
    console.log("dry-run: evidence hashes and citation ids match. no model call.");
    return;
  }

  if (flags.uiOnly) {
    const reviews: KnownCompanyReview[] = [];
    for (const entry of loaded) {
      const file = path.join(OUT_DIR, `${entry.company.slug}.json`);
      if (!existsSync(file)) throw new Error(`--ui-only needs ${file}`);
      reviews.push(JSON.parse(await readFile(file, "utf8")) as KnownCompanyReview);
    }
    await writeReviewPage(reviews);
    console.log(`review page: ${path.join(OUT_DIR, "index.html")}`);
    return;
  }

  const client = createAnthropicClient();
  const writer = modelForStage("how_it_wins");
  const editor = process.env.LLM_HOW_IT_WINS_EDITOR_MODEL?.trim() || HOW_IT_WINS_DEFAULT_EDITOR_MODEL;
  const verifyModel = modelForStage("verify");
  console.log(`writer ${writer}; verifier ${verifyModel}; editor skipped on the frozen path`);

  const reviews: KnownCompanyReview[] = [];
  for (const entry of loaded) {
    const file = path.join(OUT_DIR, `${entry.company.slug}.json`);
    if (!flags.force && existsSync(file)) {
      const existing = JSON.parse(await readFile(file, "utf8")) as KnownCompanyReview;
      if (!existing.failure) {
        console.log(`skip ${entry.company.slug}: already filed`);
        reviews.push(existing);
        continue;
      }
    }
    console.log(`writing ${entry.company.slug}`);
    const review = await runCompany({
      company: entry.company,
      client,
      writer,
      editor,
      verifyModel,
      judgment: entry.judgment,
      card: entry.card
    });
    review.runId = entry.runId;
    await writeFile(file, `${JSON.stringify(review, null, 2)}\n`);
    await slopcheck(entry.company.slug, file);
    const status = review.failure
      ? `failed: ${review.failure}`
      : `${review.read.status}${review.read.status === "read" ? `/${review.read.running.length}` : ""} inQ=${review.read.inQuestion.length} $${review.usage.estimatedCostUsd.toFixed(4)}`;
    console.log(`  ${status}`);
    reviews.push(review);
  }

  await writeReviewPage(reviews);
  const spend = reviews.reduce((sum, review) => sum + review.usage.estimatedCostUsd, 0);
  console.log(`total $${spend.toFixed(4)}`);
  console.log(`review page: ${path.join(OUT_DIR, "index.html")}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
