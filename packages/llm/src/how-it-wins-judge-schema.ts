// Hashing, stage schemas, and tool JSON for the How it wins judge. Every hash here is pinned by
// stored verdicts, so a change to what they cover invalidates the judgment cache.
import { createHash } from "node:crypto";

import {
  adjudicationPatchSchema,
  canonicalJsonString,
  howItWinsEvidenceItemSchema,
  howItWinsJudgeCallTraceSchema,
  howItWinsJudgmentBodySchema,
  howItWinsStrategyIdSchema,
  semanticJudgmentSchema,
  type HowItWinsJudgeCallTrace,
  type HowItWinsJudgmentBody,
  type HowItWinsStrategyId
} from "@cold-start/core";
import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";

import { HOW_IT_WINS_JUDGE_PROMPTS, HOW_IT_WINS_SCOPED_JUDGE_ADDENDUM } from "./how-it-wins-judge-prompts";

export function hashHowItWinsJudgeValue(value: unknown) {
  return createHash("sha256").update(canonicalJsonString(value)).digest("hex");
}

export const HOW_IT_WINS_JUDGE_PROMPT_HASH = hashHowItWinsJudgeValue(HOW_IT_WINS_JUDGE_PROMPTS);

export type HowItWinsJudgeStrategyRule = {
  strategyId: HowItWinsStrategyId;
  name: string;
  canonicalMeaning: string;
  positiveEvidence: string;
  falsePositives: string;
  nearestSiblings: string[];
  decidingQuestion: string;
  disqualifyingEvidence: string;
};

export type HowItWinsJudgeRules = {
  standard: string;
  actualBetStandard: string;
  strategyRubric: HowItWinsJudgeStrategyRule[];
};

// Refinement changes what the judge does with the same rules, so a verdict judged under one
// setting must never replay for a run under the other. Folded into the prompt hash, not a
// separate cache column: default true when the caller omits the option, matching
// createHowItWinsJudge's own default. A scoped judge folds in the screen's identity, never its
// scope, so a re-file over unchanged evidence replays the scoped verdict. The key is absent on
// unscoped calls, so every unscoped hash, and every verdict already filed under one, is unchanged.
export function howItWinsJudgePromptHash(
  rules: HowItWinsJudgeRules,
  options?: { refinement: boolean | undefined; screenIdentity?: string | undefined }
) {
  return hashHowItWinsJudgeValue({
    prompts: HOW_IT_WINS_JUDGE_PROMPTS,
    rules,
    refinement: options?.refinement ?? true,
    ...(options?.screenIdentity ? { scope: { addendum: HOW_IT_WINS_SCOPED_JUDGE_ADDENDUM, screen: options.screenIdentity } } : {})
  });
}

export const evidencePacketSchema = z.object({
  cutoff: z.string().datetime(),
  evidence: z.array(howItWinsEvidenceItemSchema).min(1),
  context: z.unknown()
});

export const criticFindingSchema = z.object({
  kind: z.enum(["bet", "strategy", "pair", "not_yet", "evidence"]),
  material: z.boolean(),
  summary: z.string().min(1),
  strategyIds: z.array(howItWinsStrategyIdSchema),
  evidenceIds: z.array(z.string().min(1))
}).strict();

export const criticOutputSchema = z.object({ findings: z.array(criticFindingSchema).max(12) }).strict();

// A scoped call's row count is the company's Round 1 count. The schema stays one fixed range
// rather than that count, because the tool schema leads Anthropic's cache prefix; code checks
// the exact rows on the way back.
function modelFacingJudgmentSchema(scoped: boolean) {
  return semanticJudgmentSchema.extend({
    strategyEvaluations: scoped
      ? semanticJudgmentSchema.shape.strategyEvaluations.min(1).max(80)
      : semanticJudgmentSchema.shape.strategyEvaluations.min(80).max(80)
  });
}

function howItWinsJudgeStageSchema(stage: HowItWinsJudgeCallTrace["stage"], scoped: boolean) {
  switch (stage) {
    case "critic":
      return criticOutputSchema;
    case "global_judge":
      return modelFacingJudgmentSchema(scoped).required({ materialBets: true });
    case "adjudication":
      return adjudicationPatchSchema;
  }
}

function jsonSchema202012(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(jsonSchema202012);
  if (value === null || typeof value !== "object") return value;
  const converted = Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([key, child]) => [key, jsonSchema202012(child)])
  ) as Record<string, unknown>;
  if (converted.type === "array" && Array.isArray(converted.items)) {
    converted.prefixItems = converted.items;
    converted.items = false;
  }
  return converted;
}

export function howItWinsJudgeToolJsonSchema(stage: HowItWinsJudgeCallTrace["stage"], options?: { scoped?: boolean }) {
  const { $schema: _schema, ...json } = zodToJsonSchema(howItWinsJudgeStageSchema(stage, options?.scoped === true), {
    $refStrategy: "none",
    target: "jsonSchema7"
  });
  return jsonSchema202012(json);
}

export type HowItWinsPrimaryJudgment = {
  schemaVersion: 1;
  hashes: {
    evidencePacket: string;
    prompt: string;
    vocabulary: string;
  };
  body: HowItWinsJudgmentBody;
  calls: HowItWinsJudgeCallTrace[];
  repairs?: string[];
};

export const primaryJudgmentSchema = z.object({
  schemaVersion: z.literal(1),
  hashes: z.object({
    evidencePacket: z.string().min(1),
    prompt: z.string().min(1),
    vocabulary: z.string().min(1)
  }).strict(),
  body: howItWinsJudgmentBodySchema,
  calls: z.array(howItWinsJudgeCallTraceSchema).min(1).max(2),
  repairs: z.array(z.string().min(1).max(300)).max(200).default([])
}).strict();
