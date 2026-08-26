// Shared by the three How it wins eval scripts: how-it-wins-corpus.ts (paid two-arm corpus
// reads), how-it-wins-batch.ts (production-path batch), and how-it-wins-known-company-review.ts
// (frozen-verdict replay). Every helper here had two or three copies before. Keep it that way:
// change it here, not by forking a copy back into a script.
import { execFile } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

import type Anthropic from "@anthropic-ai/sdk";
import {
  HOW_IT_WINS_STRATEGIES,
  coldStartCardSchema,
  howItWinsJudgmentSchema,
  type ColdStartCard,
  type GenerationLlmCallTrace,
  type HowItWinsEvidenceItem,
  type HowItWinsJudgment,
  type HowItWinsRead
} from "@cold-start/core";
import {
  cardForHowItWinsPrompt,
  hashHowItWinsJudgeValue as hashBenchmarkValue,
  howItWinsEvidencePacketFromCard,
  howItWinsJudgePromptHash,
  judgeHowItWinsForAnalysis,
  loadHowItWinsJudgeRules,
  verifySynthesis,
  type HowItWinsModels
} from "@cold-start/llm";
import { verifyHowItWinsRead } from "@cold-start/pipeline";

// The benchmark scripts know this hash by its own name. It is the same function the judge hashes
// its evidence packet with, which is what makes a frozen evidence hash comparable across tools.
export { hashBenchmarkValue };

const execFileAsync = promisify(execFile);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SLOPCHECK = path.join(homedir(), ".claude", "scripts", "slopcheck.py");

// One cache for every offline tool, so a verdict paid for by the batch runner is free to the
// corpus reads and back again. Under the batch output root because that is where it started;
// the path is gitignored, and the files hold judgment, which is synthesis.
export const HOW_IT_WINS_JUDGMENT_CACHE_DIR = path.join(
  ROOT,
  "eval",
  "curation",
  "how-it-wins-batch",
  "_judgments"
);

export function seededBenchmarkOrder<T>(values: readonly T[], seed: string) {
  return [...values].sort((left, right) => {
    const leftHash = hashBenchmarkValue([seed, left]);
    const rightHash = hashBenchmarkValue([seed, right]);
    return leftHash.localeCompare(rightHash);
  });
}

export function buildHowItWinsEvidencePacket(cardInput: unknown, options: { orderSeed: string | null }) {
  const card = coldStartCardSchema.parse(cardInput);
  const context = structuredClone(cardForHowItWinsPrompt(card));
  const citations = options.orderSeed
    ? seededBenchmarkOrder(context.citations, `${options.orderSeed}:citations`)
    : context.citations;
  context.citations = citations;
  if (options.orderSeed) {
    context.signals = seededBenchmarkOrder(context.signals, `${options.orderSeed}:signals`);
    context.comparables = seededBenchmarkOrder(context.comparables, `${options.orderSeed}:comparables`);
  }
  const evidence: HowItWinsEvidenceItem[] = citations.map((citation) => ({
    evidenceId: citation.id,
    text: citation.snippet?.trim() || citation.title,
    source: `${citation.title} (${citation.url})`,
    sourceDate: null,
    attribution: citation.sourceQuality?.tier ?? citation.sourceType,
    scope: "company"
  }));
  return {
    cutoff: card.generatedAt,
    evidence,
    context
  };
}

// The scripts compute the repo root differently (cwd against import.meta.url), so the caller
// passes its own root rather than this module guessing at one.
export function loadRootEnv(root: string) {
  const envPath = path.join(root, ".env.local");
  if (!existsSync(envPath)) return;
  for (const line of readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const match = line.match(/^([A-Z0-9_]+)\s*=\s*(.*)$/);
    const name = match?.[1];
    if (!name || process.env[name]) continue;
    process.env[name] = (match[2] ?? "").trim().replace(/^['"]|['"]$/g, "");
  }
}

export function usageFromCalls(calls: GenerationLlmCallTrace[]) {
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

// One row per model call, small enough to sit in an arm file without doubling its size. Lets a
// later measurement pass split the judge's tokens from the writer's without paying for the read
// again.
export type CompactCall = {
  label: string;
  model: string;
  status: "ok" | "failed";
  durationMs: number;
  inputTokens: number;
  outputTokens: number;
  estimatedCostUsd: number;
};

export function compactCalls(calls: GenerationLlmCallTrace[]): CompactCall[] {
  return calls.map((call) => ({
    label: call.label,
    model: call.model,
    status: call.status,
    durationMs: call.durationMs,
    inputTokens: call.inputTokens ?? 0,
    outputTokens: call.outputTokens ?? 0,
    estimatedCostUsd: call.estimatedCostUsd ?? 0
  }));
}

// Claim order and degrade rules live in packages/pipeline, shared with the production worker, so
// the rig and production can never verify a read two different ways.
export async function verifyRead(input: {
  client: Anthropic;
  model: string;
  card: ColdStartCard;
  read: HowItWinsRead;
  telemetry: (call: GenerationLlmCallTrace) => void;
}) {
  return verifyHowItWinsRead({
    card: input.card,
    read: input.read,
    verify: (claims, sources, evidenceFacts) =>
      verifySynthesis({
        client: input.client,
        model: input.model,
        claims,
        sources,
        evidenceFacts,
        telemetry: input.telemetry
      })
  });
}

// One cache file per (evidence, prompt, vocabulary) triple. A hit means the same card content
// under the same judge rules and the same 80-strategy vocabulary already has a filed verdict, so
// the judge does not run again. Deliberately not folded into one opaque function: the filename
// shape is the thing the test checks, independent of how the three hashes get computed.
export function judgmentCacheFileName(evidencePacketHash: string, promptHash: string, vocabularyHash: string): string {
  return `${evidencePacketHash}.${promptHash}.${vocabularyHash}.json`;
}

export function judgmentCacheKeyForCard(
  card: ColdStartCard,
  rules: ReturnType<typeof loadHowItWinsJudgeRules>,
  refinement: boolean
): string {
  const packet = howItWinsEvidencePacketFromCard(card);
  const evidencePacketHash = hashBenchmarkValue(packet);
  const promptHash = howItWinsJudgePromptHash(rules, { refinement });
  const vocabularyHash = hashBenchmarkValue(HOW_IT_WINS_STRATEGIES);
  return judgmentCacheFileName(evidencePacketHash, promptHash, vocabularyHash);
}

export async function loadOrRunJudgment(input: {
  card: ColdStartCard;
  client: Anthropic;
  models: HowItWinsModels;
  telemetry: (call: GenerationLlmCallTrace) => void;
  refinement: boolean;
}): Promise<{ judgment: HowItWinsJudgment; cached: boolean }> {
  const rules = loadHowItWinsJudgeRules();
  const fileName = judgmentCacheKeyForCard(input.card, rules, input.refinement);
  const filePath = path.join(HOW_IT_WINS_JUDGMENT_CACHE_DIR, fileName);
  if (existsSync(filePath)) {
    const stored = JSON.parse(await readFile(filePath, "utf8"));
    return { judgment: howItWinsJudgmentSchema.parse(stored), cached: true };
  }
  const judgment = await judgeHowItWinsForAnalysis({
    card: input.card,
    client: input.client,
    models: input.models,
    telemetry: input.telemetry,
    refinement: input.refinement
  });
  await mkdir(HOW_IT_WINS_JUDGMENT_CACHE_DIR, { recursive: true });
  await writeFile(filePath, `${JSON.stringify(judgment, null, 2)}\n`);
  return { judgment, cached: false };
}

// slopcheck exits non-zero only on kill-list hits, and prints its report on stdout either way.
// Warn and structural lines are noise against a JSON file, so only the kill lines are surfaced.
export async function slopcheck(label: string, file: string) {
  if (!existsSync(SLOPCHECK)) return;
  try {
    await execFileAsync("python3", [SLOPCHECK, file]);
  } catch (error) {
    const report = (error as { stdout?: string }).stdout ?? "";
    const kills = report.split("\n").filter((line) => line.includes("KILL"));
    for (const line of kills.length > 0 ? kills : [`slopcheck failed on ${file}`]) {
      console.log(`  ${label} slop: ${line.trim()}`);
    }
  }
}
