#!/usr/bin/env tsx
/*
 * Run the same code path production uses for How it wins (judge, frozen writer, verifier) over
 * frozen corpus cards, offline. This is the check that a real end-to-end read still works after
 * the non-streaming transport fix, before it ever runs on a live card: one card first, then a
 * small sampled batch, under a hard spend cap. Output goes to eval/curation/how-it-wins-batch/,
 * which is gitignored: these files hold synthesis.
 */
import { existsSync, readFileSync } from "node:fs";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { execFile } from "node:child_process";
import { homedir } from "node:os";
import { promisify } from "node:util";

import type Anthropic from "@anthropic-ai/sdk";
import {
  HOW_IT_WINS_STRATEGIES,
  HowItWinsJudgmentClosedError,
  coldStartCardSchema,
  howItWinsJudgmentSchema,
  howItWinsThinFileReason,
  type ColdStartCard,
  type GenerationLlmCallTrace,
  type HowItWins,
  type HowItWinsJudgment,
  type HowItWinsRead,
  type SourcedText
} from "@cold-start/core";
import {
  HOW_IT_WINS_DEFAULT_EDITOR_MODEL,
  createAnthropicClient,
  hashHowItWinsJudgeValue,
  howItWinsEvidencePacketFromCard,
  howItWinsJudgePromptHash,
  judgeHowItWinsForAnalysis,
  loadHowItWinsJudgeRules,
  modelForStage,
  synthesizeHowItWins,
  verifySynthesis,
  type HowItWinsModels,
  type VerificationResult
} from "@cold-start/llm";
import { verificationFactsForClaims, verifiedHowItWins } from "@cold-start/pipeline";

import { createSeededRng, shuffled } from "./eval-curation-lib";
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore score.mjs is plain JS shared with the node:test suite
import { strategyFrequency, strategyFrequencyGate } from "../eval/investor-lens/score.mjs";

const execFileAsync = promisify(execFile);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const CORPUS_DIR = path.join(ROOT, "eval", "curation", "corpus");
const OUT_ROOT = path.join(ROOT, "eval", "curation", "how-it-wins-batch");
const JUDGMENT_CACHE_DIR = path.join(OUT_ROOT, "_judgments");
// A local, gitignored capture of pre-repair monolith judge runs. This directory only exists in
// a worktree that also ran the topology benchmark; a fresh checkout has none, and seeding
// reports zero attempts rather than failing.
const BENCHMARK_RUNS_DIR = path.join(
  ROOT,
  "apps/web/.cold-start/how-it-wins-topology-benchmark/how-it-wins-topology-2026-08-23-semantic-repair/runs"
);
const SLOPCHECK = path.join(homedir(), ".claude", "scripts", "slopcheck.py");

// The ten unread sitting-2 cards. Never sampled and never run, even when named directly with
// --slugs. There is no override flag; that is deliberate.
export const HOW_IT_WINS_BATCH_HOLDOUT: readonly string[] = [
  "braintrust",
  "mintlify",
  "modretro",
  "perplexity",
  "plaud",
  "proton",
  "superhuman",
  "superlist",
  "uniqlo",
  "vercel"
];

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

const DEFAULT_LIMIT = 15;
const DEFAULT_SEED = "how-it-wins-batch-1";
const DEFAULT_BUDGET_USD = 8;

export type Flags = {
  slugs: string[] | null;
  limit: number;
  seed: string;
  judgeModel: string | null;
  writerModel: string | null;
  budgetUsd: number;
  parallel: number;
};

export function parseFlags(argv: string[]): Flags {
  const flags: Flags = {
    slugs: null,
    limit: DEFAULT_LIMIT,
    seed: DEFAULT_SEED,
    judgeModel: null,
    writerModel: null,
    budgetUsd: DEFAULT_BUDGET_USD,
    parallel: 1
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i] ?? "";
    const value = () => argv[++i] ?? "";
    if (arg === "--slugs") flags.slugs = value().split(",").map((s) => s.trim()).filter(Boolean);
    else if (arg === "--limit") flags.limit = Number.parseInt(value(), 10);
    else if (arg === "--seed") flags.seed = value();
    else if (arg === "--judge-model") flags.judgeModel = value();
    else if (arg === "--writer-model") flags.writerModel = value();
    else if (arg === "--budget-usd") flags.budgetUsd = Number.parseFloat(value());
    else if (arg === "--parallel") flags.parallel = Number.parseInt(value(), 10);
    else if (arg.startsWith("--")) throw new Error(`unknown flag: ${arg}`);
  }
  if (!Number.isFinite(flags.limit) || flags.limit < 1) throw new Error("--limit must be a positive integer");
  if (!Number.isFinite(flags.budgetUsd) || flags.budgetUsd <= 0) throw new Error("--budget-usd must be a positive number");
  if (!Number.isFinite(flags.parallel) || flags.parallel < 1) throw new Error("--parallel must be a positive integer");
  return flags;
}

// ---- selection -------------------------------------------------------------------------------

export type BatchCandidate = { slug: string; hasSynthesis: boolean; thinFileReason: string | null };

export type Selection = { slugs: string[]; holdoutExcluded: number };

// Pure so the holdout rule is testable without touching the corpus or the network. When slugs
// are named directly, only the holdout filter applies (no thin-file or synthesis check; a
// caller naming a slug explicitly is asking for it, and the corpus load will surface a missing
// card on its own).
export function selectBatchSlugs(
  candidates: BatchCandidate[],
  input: { seed: string; limit: number; requestedSlugs: string[] | null }
): Selection {
  const holdout = new Set(HOW_IT_WINS_BATCH_HOLDOUT);
  if (input.requestedSlugs) {
    const holdoutExcluded = input.requestedSlugs.filter((slug) => holdout.has(slug)).length;
    const slugs = input.requestedSlugs.filter((slug) => !holdout.has(slug));
    return { slugs, holdoutExcluded };
  }
  const eligible = candidates.filter(
    (entry) => entry.hasSynthesis && entry.thinFileReason === null && !holdout.has(entry.slug)
  );
  const holdoutExcluded = candidates.filter(
    (entry) => entry.hasSynthesis && entry.thinFileReason === null && holdout.has(entry.slug)
  ).length;
  const rng = createSeededRng(input.seed);
  const slugs = shuffled(eligible, rng).map((entry) => entry.slug).slice(0, input.limit);
  return { slugs, holdoutExcluded };
}

// ---- budget ------------------------------------------------------------------------------------

// Checked before a new card starts, never mid-card: a card already running is allowed to finish.
export function shouldStopForBudget(spentSoFar: number, budgetUsd: number): boolean {
  return spentSoFar >= budgetUsd;
}

// ---- judgment cache ------------------------------------------------------------------------

// One cache file per (evidence, prompt, vocabulary) triple. A hit means the same card content
// under the same judge rules and the same 80-strategy vocabulary already has a filed verdict, so
// the judge does not run again. Deliberately not exported as one opaque function: the filename
// shape is the thing the test checks, independent of how the three hashes get computed.
export function judgmentCacheFileName(evidencePacketHash: string, promptHash: string, vocabularyHash: string): string {
  return `${evidencePacketHash}.${promptHash}.${vocabularyHash}.json`;
}

function judgmentCacheKeyForCard(card: ColdStartCard, rules: ReturnType<typeof loadHowItWinsJudgeRules>): string {
  const packet = howItWinsEvidencePacketFromCard(card);
  const evidencePacketHash = hashHowItWinsJudgeValue(packet);
  const promptHash = howItWinsJudgePromptHash(rules);
  const vocabularyHash = hashHowItWinsJudgeValue(HOW_IT_WINS_STRATEGIES);
  return judgmentCacheFileName(evidencePacketHash, promptHash, vocabularyHash);
}

async function loadOrRunJudgment(input: {
  card: ColdStartCard;
  client: Anthropic;
  models: HowItWinsModels;
  telemetry: (call: GenerationLlmCallTrace) => void;
}): Promise<{ judgment: HowItWinsJudgment; cached: boolean }> {
  const rules = loadHowItWinsJudgeRules();
  const fileName = judgmentCacheKeyForCard(input.card, rules);
  const filePath = path.join(JUDGMENT_CACHE_DIR, fileName);
  if (existsSync(filePath)) {
    const stored = JSON.parse(await readFile(filePath, "utf8"));
    return { judgment: howItWinsJudgmentSchema.parse(stored), cached: true };
  }
  const judgment = await judgeHowItWinsForAnalysis({
    card: input.card,
    client: input.client,
    models: input.models,
    telemetry: input.telemetry
  });
  await mkdir(JUDGMENT_CACHE_DIR, { recursive: true });
  await writeFile(filePath, `${JSON.stringify(judgment, null, 2)}\n`);
  return { judgment, cached: false };
}

// Best-effort reuse of monolith verdicts captured before this batch runner existed. Seeds only
// when the verdict still parses under the current judgment schema and every evidence id it cites
// still resolves against the card, then only if the freshly computed cache key has no file yet.
// A schema or prompt change since those runs were captured (in flight alongside this packet)
// means most or all of these will not seed; that is expected, not a bug, and gets reported.
async function seedJudgmentCacheFromBenchmarkRuns(cardsBySlug: Map<string, ColdStartCard>): Promise<{ attempted: number; hits: number }> {
  if (!existsSync(BENCHMARK_RUNS_DIR)) return { attempted: 0, hits: 0 };
  const names = (await readdir(BENCHMARK_RUNS_DIR)).filter((name) => name.includes("monolith") && name.endsWith(".json"));
  if (names.length === 0) return { attempted: 0, hits: 0 };
  const rules = loadHowItWinsJudgeRules();
  await mkdir(JUDGMENT_CACHE_DIR, { recursive: true });
  let attempted = 0;
  let hits = 0;
  for (const name of names) {
    const slug = name.split("__")[0] ?? "";
    const card = cardsBySlug.get(slug);
    if (!card) continue;
    attempted += 1;
    let stored: unknown;
    try {
      stored = JSON.parse(await readFile(path.join(BENCHMARK_RUNS_DIR, name), "utf8"));
    } catch {
      continue;
    }
    const value = (stored as { value?: { outcome?: string; verdict?: unknown } }).value
      ?? (stored as { outcome?: string; verdict?: unknown });
    if (value.outcome !== "ok") continue;
    const parsed = howItWinsJudgmentSchema.safeParse(value.verdict);
    if (!parsed.success) continue;
    const citationIds = new Set(card.citations.map((citation) => citation.id));
    const missingEvidence = parsed.data.evidenceRegistry.some((entry) => !citationIds.has(entry.evidenceId));
    if (missingEvidence) continue;
    const fileName = judgmentCacheKeyForCard(card, rules);
    const filePath = path.join(JUDGMENT_CACHE_DIR, fileName);
    if (existsSync(filePath)) continue;
    await writeFile(filePath, `${JSON.stringify(parsed.data, null, 2)}\n`);
    hits += 1;
  }
  return { attempted, hits };
}

// ---- models --------------------------------------------------------------------------------

// HowItWinsModels carries its own judge slot now, so one object serves both stages: the judge
// step reads judge and the writer step reads writer. The role parameter that used to pick which
// model went into the single writer slot is gone, and with it the pair of near-identical objects
// the runner used to build.
function howItWinsModelsFor(
  models: { judgeModel: string; writerModel: string; editorModel: string }
): HowItWinsModels {
  return {
    judge: models.judgeModel,
    writer: models.writerModel,
    editor: models.editorModel
  };
}

// ---- verification ----------------------------------------------------------------------------

// Same claim order verifiedHowItWins reads its verdicts back in: one claim per running strategy,
// then the pair note, then in-question notes.
function howItWinsClaims(read: HowItWinsRead): SourcedText[] {
  return [
    ...read.running.map((entry) => ({ text: entry.note, citationIds: entry.citationIds })),
    ...(read.pair ? [{ text: read.pair.note, citationIds: read.pair.citationIds }] : []),
    ...(read.inQuestion ?? []).map((entry) => ({ text: entry.note, citationIds: entry.citationIds }))
  ];
}

async function verifyFiledRead(input: {
  client: Anthropic;
  model: string;
  card: ColdStartCard;
  read: HowItWinsRead;
  telemetry: (call: GenerationLlmCallTrace) => void;
}): Promise<{ howItWins: HowItWins; dropReason?: "running-dropped" | "pair-dropped"; results: VerificationResult[] }> {
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
  const outcome = verifiedHowItWins(input.read, results, 0);
  return { ...outcome, results };
}

// ---- losses --------------------------------------------------------------------------------

export type HowItWinsBatchLosses = {
  judgeCurrent: number;
  writerCurrent: number;
  verifiedRunning: number;
  capDropped: number;
  verifierDropped: number;
  underFloorFired: boolean;
  judgeOpenQuestion: number;
  filedInQuestion: number;
};

// Three independent counts, kept apart on purpose. capDropped is the writer trimming a judgment
// that named more current strategies than the four-slot running list holds. verifierDropped is
// the verifier removing a claim the writer did file. underFloorFired is the read never clearing
// (or falling back below) the two-running floor, whether that happened at the writer or after
// verification; a judgment with fewer than two current strategies produces this without ever
// touching the other two counters.
export function computeLosses(input: {
  judgment: HowItWinsJudgment;
  preVerify: HowItWins;
  filed: HowItWins;
}): HowItWinsBatchLosses {
  const judgeCurrent = input.judgment.currentStrategyIds.length;
  const judgeOpenQuestion = input.judgment.strategyEvaluations.filter(
    (entry) => entry.disposition === "open_question"
  ).length;
  const preVerify = input.preVerify;
  const filed = input.filed;
  const writerCurrent = preVerify.status === "read" ? preVerify.running.length : 0;
  const capDropped = preVerify.status === "read" ? Math.max(0, judgeCurrent - writerCurrent) : 0;
  const verifiedRunning = filed.status === "read" ? filed.running.length : 0;
  const verifierDropped = preVerify.status === "read" ? Math.max(0, writerCurrent - verifiedRunning) : 0;
  const underFloorFired = judgeCurrent > 0 && filed.status !== "read";
  const filedInQuestion = filed.status === "thin_file" ? 0 : filed.inQuestion.length;
  return {
    judgeCurrent,
    writerCurrent,
    verifiedRunning,
    capDropped,
    verifierDropped,
    underFloorFired,
    judgeOpenQuestion,
    filedInQuestion
  };
}

// ---- records ---------------------------------------------------------------------------------

export type JudgeCallSummary = {
  stage: string;
  model: string;
  provider?: string;
  inputTokens?: number;
  outputTokens?: number;
  latencyMs: number;
  estimatedCostUsd?: number;
  outcome: "ok" | "failed";
};

export type HowItWinsBatchCardRecord = {
  slug: string;
  status: "ok" | "failed";
  cached: boolean;
  judgeCalls: JudgeCallSummary[];
  refinement?: HowItWinsJudgment["refinement"];
  judgeCurrent: string[];
  judgeNotYet: string[];
  judgeOpenQuestion: string[];
  writer: { model: string; outputTokens: number; latencyMs: number; costUsd: number; fitRetried: boolean; styleIssues: string[] };
  preVerify: HowItWins;
  verifier?: VerificationResult[];
  filed: HowItWins;
  dropReason?: "running-dropped" | "pair-dropped";
  losses: HowItWinsBatchLosses;
  costUsd: number;
  latencyMs: number;
  failure?: string;
};

function usageTotals(calls: GenerationLlmCallTrace[]) {
  return calls.reduce(
    (total, call) => ({
      outputTokens: total.outputTokens + (call.outputTokens ?? 0),
      estimatedCostUsd: total.estimatedCostUsd + (call.estimatedCostUsd ?? 0),
      durationMs: total.durationMs + call.durationMs
    }),
    { outputTokens: 0, estimatedCostUsd: 0, durationMs: 0 }
  );
}

function judgeCallSummaryFromJudgment(judgment: HowItWinsJudgment): JudgeCallSummary[] {
  return judgment.calls.map((call) => {
    const cost = call.estimatedCostUsd ?? call.actualCostUsd;
    return {
      stage: call.stage,
      model: call.model,
      provider: call.provider,
      inputTokens: call.inputTokens,
      outputTokens: call.outputTokens,
      latencyMs: call.latencyMs,
      ...(cost !== null && cost !== undefined ? { estimatedCostUsd: cost } : {}),
      outcome: call.outcome
    };
  });
}

// Used only when the judge failed before returning a judgment: the only record of what it spent
// is what the telemetry sink already caught.
function judgeCallSummaryFromTelemetry(calls: GenerationLlmCallTrace[]): JudgeCallSummary[] {
  return calls.map((call) => ({
    stage: call.stage,
    model: call.model,
    ...(call.provider ? { provider: call.provider } : {}),
    ...(call.inputTokens !== undefined ? { inputTokens: call.inputTokens } : {}),
    ...(call.outputTokens !== undefined ? { outputTokens: call.outputTokens } : {}),
    latencyMs: call.durationMs,
    ...(call.estimatedCostUsd !== undefined ? { estimatedCostUsd: call.estimatedCostUsd } : {}),
    outcome: call.status
  }));
}

const EMPTY_HOW_IT_WINS: HowItWins = { status: "nothing_stands_out", inQuestion: [] };
const ZERO_LOSSES: HowItWinsBatchLosses = {
  judgeCurrent: 0,
  writerCurrent: 0,
  verifiedRunning: 0,
  capDropped: 0,
  verifierDropped: 0,
  underFloorFired: false,
  judgeOpenQuestion: 0,
  filedInQuestion: 0
};

async function runCard(input: {
  slug: string;
  card: ColdStartCard;
  client: Anthropic;
  models: HowItWinsModels;
  writerModelLabel: string;
  verifyModel: string;
}): Promise<HowItWinsBatchCardRecord> {
  const startedAt = Date.now();
  const judgeTelemetry: GenerationLlmCallTrace[] = [];
  const writerTelemetry: GenerationLlmCallTrace[] = [];
  const verifyTelemetry: GenerationLlmCallTrace[] = [];

  let judgment: HowItWinsJudgment;
  let cached = false;
  try {
    const loaded = await loadOrRunJudgment({
      card: input.card,
      client: input.client,
      models: input.models,
      telemetry: (call) => judgeTelemetry.push(call)
    });
    judgment = loaded.judgment;
    cached = loaded.cached;
  } catch (error) {
    // HowItWinsJudgmentClosedError is the judge failing closed (its own message already says
    // so); anything else is unexpected. Either way, the card records as failed and the batch
    // moves on rather than aborting the whole run over one card.
    const closed = error instanceof HowItWinsJudgmentClosedError;
    const rawMessage = error instanceof Error ? error.message : String(error);
    const message = closed ? rawMessage : `judge error: ${rawMessage}`;
    return {
      slug: input.slug,
      status: "failed",
      cached: false,
      judgeCalls: judgeCallSummaryFromTelemetry(judgeTelemetry),
      judgeCurrent: [],
      judgeNotYet: [],
      judgeOpenQuestion: [],
      writer: { model: input.writerModelLabel, outputTokens: 0, latencyMs: 0, costUsd: 0, fitRetried: false, styleIssues: [] },
      preVerify: EMPTY_HOW_IT_WINS,
      filed: EMPTY_HOW_IT_WINS,
      losses: ZERO_LOSSES,
      costUsd: usageTotals(judgeTelemetry).estimatedCostUsd,
      latencyMs: Date.now() - startedAt,
      failure: message.slice(0, 300)
    };
  }

  let writerResult: Awaited<ReturnType<typeof synthesizeHowItWins>>;
  try {
    writerResult = await synthesizeHowItWins({
      client: input.client,
      models: input.models,
      card: input.card,
      telemetry: (call) => writerTelemetry.push(call),
      judgment
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const judgeCosts = usageTotals(judgeTelemetry).estimatedCostUsd;
    const writerCosts = usageTotals(writerTelemetry).estimatedCostUsd;
    return {
      slug: input.slug,
      status: "failed",
      cached,
      judgeCalls: judgeCallSummaryFromJudgment(judgment),
      ...(judgment.refinement ? { refinement: judgment.refinement } : {}),
      judgeCurrent: [...judgment.currentStrategyIds],
      judgeNotYet: judgment.strategyEvaluations.filter((entry) => entry.disposition === "not_yet").map((entry) => entry.strategyId),
      judgeOpenQuestion: judgment.strategyEvaluations.filter((entry) => entry.disposition === "open_question").map((entry) => entry.strategyId),
      writer: { model: input.writerModelLabel, outputTokens: 0, latencyMs: 0, costUsd: 0, fitRetried: false, styleIssues: [] },
      preVerify: EMPTY_HOW_IT_WINS,
      filed: EMPTY_HOW_IT_WINS,
      losses: ZERO_LOSSES,
      costUsd: judgeCosts + writerCosts,
      latencyMs: Date.now() - startedAt,
      failure: message.slice(0, 300)
    };
  }

  let filed: HowItWins = writerResult.read;
  let dropReason: "running-dropped" | "pair-dropped" | undefined;
  let verifierResults: VerificationResult[] = [];
  if (writerResult.read.status === "read") {
    const verified = await verifyFiledRead({
      client: input.client,
      model: input.verifyModel,
      card: input.card,
      read: writerResult.read,
      telemetry: (call) => verifyTelemetry.push(call)
    });
    filed = verified.howItWins;
    dropReason = verified.dropReason;
    verifierResults = verified.results;
  }

  const losses = computeLosses({ judgment, preVerify: writerResult.read, filed });
  const writerTotals = usageTotals(writerTelemetry);
  const totalCost = usageTotals(judgeTelemetry).estimatedCostUsd + writerTotals.estimatedCostUsd + usageTotals(verifyTelemetry).estimatedCostUsd;

  return {
    slug: input.slug,
    status: "ok",
    cached,
    judgeCalls: judgeCallSummaryFromJudgment(judgment),
    ...(judgment.refinement ? { refinement: judgment.refinement } : {}),
    judgeCurrent: [...judgment.currentStrategyIds],
    judgeNotYet: judgment.strategyEvaluations.filter((entry) => entry.disposition === "not_yet").map((entry) => entry.strategyId),
    judgeOpenQuestion: judgment.strategyEvaluations.filter((entry) => entry.disposition === "open_question").map((entry) => entry.strategyId),
    writer: {
      model: input.writerModelLabel,
      outputTokens: writerTotals.outputTokens,
      latencyMs: writerTotals.durationMs,
      costUsd: writerTotals.estimatedCostUsd,
      fitRetried: writerResult.fitRetried,
      styleIssues: writerResult.styleIssues
    },
    preVerify: writerResult.read,
    ...(verifierResults.length > 0 ? { verifier: verifierResults } : {}),
    filed,
    ...(dropReason ? { dropReason } : {}),
    losses,
    costUsd: totalCost,
    latencyMs: Date.now() - startedAt
  };
}

// ---- summary -----------------------------------------------------------------------------

export function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? ((sorted[mid - 1] ?? 0) + (sorted[mid] ?? 0)) / 2 : (sorted[mid] ?? 0);
}

function max(values: number[]): number {
  return values.length === 0 ? 0 : Math.max(...values);
}

function judgeOutputTokens(record: HowItWinsBatchCardRecord): number {
  return record.judgeCalls.reduce((sum, call) => sum + (call.outputTokens ?? 0), 0);
}

function judgeLatencyMs(record: HowItWinsBatchCardRecord): number {
  return record.judgeCalls.reduce((sum, call) => sum + call.latencyMs, 0);
}

function summaryMarkdown(records: HowItWinsBatchCardRecord[]): string {
  const ok = records.filter((record) => record.status === "ok");
  const failed = records.filter((record) => record.status === "failed");
  const gateCards = ok.map((record) => ({ synthesis: { howItWins: record.filed } }));
  const gate = strategyFrequencyGate(gateCards) as { passed: boolean; reads: number };
  const { share } = strategyFrequency(gateCards) as { share: Record<string, number> };
  const topStrategies = Object.entries(share)
    .sort(([leftName, left], [rightName, right]) => right - left || leftName.localeCompare(rightName))
    .slice(0, 5)
    .map(([strategy, value]) => `${strategy} ${value.toFixed(2)}`);

  const outTokens = ok.map(judgeOutputTokens);
  const latencies = ok.map(judgeLatencyMs);
  const costs = ok.map((record) => record.costUsd);
  const totalSpend = records.reduce((sum, record) => sum + record.costUsd, 0);
  const lossTotals = ok.reduce(
    (sum, record) => ({
      capDropped: sum.capDropped + record.losses.capDropped,
      verifierDropped: sum.verifierDropped + record.losses.verifierDropped,
      underFloorFired: sum.underFloorFired + (record.losses.underFloorFired ? 1 : 0)
    }),
    { capDropped: 0, verifierDropped: 0, underFloorFired: 0 }
  );

  const lines: string[] = [];
  lines.push("# How it wins production-path batch");
  lines.push("");
  lines.push(
    `${records.length} cards ran. ${ok.length} produced a read or a clean nothing-stands-out. ${failed.length} failed before filing anything.`
  );
  lines.push(`Total spend across the batch was $${totalSpend.toFixed(4)}.`);
  lines.push("");
  lines.push("## Per-card");
  lines.push("");
  lines.push("| slug | status | judge current | filed running | filed in question | judge out tokens | judge latency s | cost |");
  lines.push("| --- | --- | --- | --- | --- | --- | --- | --- |");
  for (const record of records) {
    const filedRunning = record.filed.status === "read" ? record.filed.running.length : 0;
    lines.push(
      `| ${record.slug} | ${record.status}${record.status === "failed" ? ` (${record.failure ?? "unknown"})` : ""} | ${record.judgeCurrent.length} | ${filedRunning} | ${record.losses.filedInQuestion} | ${judgeOutputTokens(record)} | ${(judgeLatencyMs(record) / 1000).toFixed(1)} | $${record.costUsd.toFixed(4)} |`
    );
  }
  lines.push("");
  lines.push("## Aggregates");
  lines.push("");
  lines.push(`Judge output tokens: median ${median(outTokens).toFixed(0)}, max ${max(outTokens)}.`);
  lines.push(`Judge latency: median ${(median(latencies) / 1000).toFixed(1)}s, max ${(max(latencies) / 1000).toFixed(1)}s.`);
  lines.push(`Card cost: median $${median(costs).toFixed(4)}, max $${max(costs).toFixed(4)}.`);
  lines.push(
    `Losses across ${ok.length} filed cards: capDropped ${lossTotals.capDropped}, verifierDropped ${lossTotals.verifierDropped}, underFloorFired ${lossTotals.underFloorFired}.`
  );
  lines.push("");
  lines.push("## Strategy frequency gate");
  lines.push("");
  lines.push(`${gate.passed ? "Passed" : "Failed"} over ${gate.reads} reads.`);
  lines.push(`Top strategies: ${topStrategies.length > 0 ? topStrategies.join(", ") : "none"}.`);
  lines.push("");
  return lines.join("\n");
}

async function slopcheck(file: string) {
  if (!existsSync(SLOPCHECK)) return;
  try {
    await execFileAsync("python3", [SLOPCHECK, file]);
  } catch (error) {
    const report = (error as { stdout?: string }).stdout ?? "";
    const kills = report.split("\n").filter((line) => line.includes("KILL"));
    for (const line of kills.length > 0 ? kills : [`slopcheck failed on ${file}`]) {
      console.log(`  summary slop: ${line.trim()}`);
    }
  }
}

// ---- corpus loading ------------------------------------------------------------------------

type CorpusIndexRow = { slug: string; name: string; domain: string; createdAt: string; hasSynthesis: boolean };

async function loadCorpusIndex(): Promise<CorpusIndexRow[]> {
  const indexPath = path.join(CORPUS_DIR, "index.json");
  if (!existsSync(indexPath)) {
    throw new Error(`no corpus at ${CORPUS_DIR}; run "npm run eval:snapshot" first`);
  }
  return JSON.parse(await readFile(indexPath, "utf8")) as CorpusIndexRow[];
}

async function loadCorpusCard(slug: string): Promise<ColdStartCard> {
  const raw = JSON.parse(await readFile(path.join(CORPUS_DIR, "cards", `${slug}.json`), "utf8")) as { card: unknown };
  return coldStartCardSchema.parse(raw.card);
}

function runStamp(date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}-${pad(date.getHours())}${pad(date.getMinutes())}`;
}

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

function cardLine(record: HowItWinsBatchCardRecord): string {
  if (record.status === "failed") {
    return `${record.slug}  failed: ${record.failure}  $${record.costUsd.toFixed(4)}  ${Math.round(record.latencyMs / 1000)}s`;
  }
  const filedRunning = record.filed.status === "read" ? record.filed.running.length : 0;
  return `${record.slug}  ${record.filed.status}${record.filed.status === "read" ? `/${filedRunning}` : ""}  ${record.cached ? "cached" : "fresh"}  $${record.costUsd.toFixed(4)}  ${Math.round(record.latencyMs / 1000)}s`;
}

async function main() {
  loadRootEnv();
  const flags = parseFlags(process.argv.slice(2));
  const index = await loadCorpusIndex();

  const cardsBySlug = new Map<string, ColdStartCard>();
  const candidates: BatchCandidate[] = [];
  for (const row of index) {
    if (!row.hasSynthesis) continue;
    const card = await loadCorpusCard(row.slug);
    cardsBySlug.set(row.slug, card);
    candidates.push({ slug: row.slug, hasSynthesis: true, thinFileReason: howItWinsThinFileReason(card) });
  }

  const selection = selectBatchSlugs(candidates, { seed: flags.seed, limit: flags.limit, requestedSlugs: flags.slugs });
  console.log(`holdout excluded: ${selection.holdoutExcluded}`);
  if (selection.slugs.length === 0) {
    console.log("nothing to run: no eligible card selected");
    return;
  }
  const missing = selection.slugs.filter((slug) => !cardsBySlug.has(slug));
  if (missing.length > 0) console.log(`not in corpus, skipped: ${missing.join(", ")}`);
  const runSlugs = selection.slugs.filter((slug) => cardsBySlug.has(slug));
  if (runSlugs.length === 0) {
    console.log("nothing to run: none of the selected slugs are in the corpus");
    return;
  }

  const seed = await seedJudgmentCacheFromBenchmarkRuns(cardsBySlug);
  console.log(`benchmark seed: ${seed.attempted} attempted, ${seed.hits} written`);

  const client = createAnthropicClient();
  const judgeModel = flags.judgeModel?.trim() || process.env.LLM_HOW_IT_WINS_JUDGE_MODEL?.trim() || "claude-opus-5";
  const writerModel = flags.writerModel?.trim() || modelForStage("how_it_wins", "claude-opus-5");
  const editorModel = process.env.LLM_HOW_IT_WINS_EDITOR_MODEL?.trim() || HOW_IT_WINS_DEFAULT_EDITOR_MODEL;
  const verifyModel = modelForStage("verify");
  const modelSet = { judgeModel, writerModel, editorModel };
  const models = howItWinsModelsFor(modelSet);

  console.log(
    `${runSlugs.length} cards; judge ${judgeModel}; writer ${writerModel}; editor ${editorModel}; verifier ${verifyModel}; budget $${flags.budgetUsd.toFixed(2)}`
  );

  const runDir = path.join(OUT_ROOT, runStamp());
  await mkdir(runDir, { recursive: true });

  const records: HowItWinsBatchCardRecord[] = [];
  const skipped: string[] = [];
  let spent = 0;

  // Budget is checked once per batch, not once per card: with --parallel above 1 a batch that
  // starts under the cap is allowed to finish, so the realized spend can overshoot the cap by up
  // to one extra card. The default --parallel 1 has no such slack.
  for (const batch of chunk(runSlugs, Math.max(1, flags.parallel))) {
    if (shouldStopForBudget(spent, flags.budgetUsd)) {
      skipped.push(...batch);
      continue;
    }
    const results = await Promise.all(
      batch.map((slug) =>
        runCard({
          slug,
          card: cardsBySlug.get(slug)!,
          client,
          models,
          writerModelLabel: writerModel,
          verifyModel
        })
      )
    );
    for (const record of results) {
      spent += record.costUsd;
      records.push(record);
      await writeFile(path.join(runDir, `${record.slug}.json`), `${JSON.stringify(record, null, 2)}\n`);
      console.log(cardLine(record));
      console.log(`  running spend: $${spent.toFixed(4)}`);
    }
  }

  if (skipped.length > 0) {
    console.log(`budget cap reached at $${flags.budgetUsd.toFixed(2)}; skipped: ${skipped.join(", ")}`);
  }

  const gateCards = records.filter((record) => record.status === "ok").map((record) => ({ synthesis: { howItWins: record.filed } }));
  const summary = {
    generatedAt: new Date().toISOString(),
    judgeModel,
    writerModel,
    editorModel,
    verifyModel,
    budgetUsd: flags.budgetUsd,
    spentUsd: spent,
    holdoutExcluded: selection.holdoutExcluded,
    skipped,
    cards: records.map((record) => ({
      slug: record.slug,
      status: record.status,
      cached: record.cached,
      judgeCurrent: record.judgeCurrent.length,
      filedStatus: record.filed.status,
      filedRunning: record.filed.status === "read" ? record.filed.running.length : 0,
      filedInQuestion: record.losses.filedInQuestion,
      judgeOutputTokens: judgeOutputTokens(record),
      judgeLatencyMs: judgeLatencyMs(record),
      costUsd: record.costUsd,
      losses: record.losses,
      failure: record.failure
    })),
    strategyFrequency: strategyFrequency(gateCards),
    strategyFrequencyGate: strategyFrequencyGate(gateCards)
  };
  await writeFile(path.join(runDir, "summary.json"), `${JSON.stringify(summary, null, 2)}\n`);
  const summaryMdPath = path.join(runDir, "summary.md");
  await writeFile(summaryMdPath, `${summaryMarkdown(records)}\n`);
  await slopcheck(summaryMdPath);

  console.log(`total $${spent.toFixed(4)}`);
  console.log(`run dir: ${runDir}`);
}

if (process.argv[1] && import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
