import { z } from "zod";

import {
  HOW_IT_WINS_STRATEGIES,
  howItWinsStrategyIdSchema,
  type HowItWinsStrategyId
} from "./how-it-wins";

const nonemptyIds = z.array(z.string().min(1));
const hashSchema = z.string().regex(/^[a-f0-9]{64}$/);

export const howItWinsDispositionSchema = z.enum([
  "current",
  "not_yet",
  "open_question",
  "insufficient_evidence",
  "rejected",
  "not_applicable"
]);

export const howItWinsEvidenceItemSchema = z.object({
  evidenceId: z.string().min(1),
  text: z.string().min(1),
  source: z.string().min(1),
  sourceDate: z.string().min(1).nullable(),
  attribution: z.string().min(1),
  scope: z.string().min(1)
});

export type HowItWinsEvidenceItem = z.infer<typeof howItWinsEvidenceItemSchema>;

const claimBase = {
  claimId: z.string().min(1),
  text: z.string().min(1),
  evidenceIds: nonemptyIds
};

export const howItWinsClaimSchema = z.discriminatedUnion("type", [
  z.object({ ...claimBase, type: z.literal("observed_fact"), evidenceIds: nonemptyIds.min(1) }),
  z.object({ ...claimBase, type: z.literal("reasonable_inference"), evidenceIds: nonemptyIds.min(1), bridge: z.string().min(1) }),
  z.object({ ...claimBase, type: z.literal("judgment"), basisClaimIds: nonemptyIds.min(1), rule: z.string().min(1) }),
  z.object({
    ...claimBase,
    type: z.literal("open_question"),
    whyMaterial: z.string().min(1),
    evidenceNeeded: z.string().min(1)
  }),
  z.object({ ...claimBase, type: z.literal("insufficient_evidence"), missingLink: z.string().min(1) }),
  z.object({ ...claimBase, type: z.literal("unsupported_speculation"), reason: z.string().min(1) })
]);

export const howItWinsMaterialBetSchema = z.object({
  betId: z.string().min(1),
  statement: z.string().min(1),
  scope: z.string().min(1),
  supportingEvidenceIds: nonemptyIds.min(1),
  scopeReasons: z.array(z.string().min(1)).min(1)
});

export const howItWinsJudgmentDimensionsSchema = z.object({
  evidenceStrength: z.enum(["direct_and_corroborated", "direct", "inferred", "mixed", "insufficient", "contradicted", "not_reached"]),
  centrality: z.enum(["central", "supporting", "peripheral", "unrelated", "unresolved", "not_reached"]),
  materiality: z.enum(["material", "immaterial", "unresolved", "not_reached"]),
  distinctiveness: z.enum(["category_distinctive", "company_specific", "category_baseline", "unresolved", "not_reached"]),
  independence: z.enum(["independent", "partially_overlapping", "duplicate", "unresolved", "not_reached"]),
  explanatoryValue: z.enum(["necessary", "additive", "redundant", "none", "unresolved", "not_reached"])
});

export const howItWinsSiblingResolutionSchema = z.object({
  strategyId: howItWinsStrategyIdSchema,
  decidingQuestion: z.string().min(1),
  reason: z.string().min(1),
  evidenceIds: nonemptyIds.min(1)
});

export const howItWinsNotYetSchema = z.object({
  precursorEvidenceIds: nonemptyIds.min(1),
  causalPath: z.string().min(1),
  missingCondition: z.string().min(1),
  promotionEvidence: z.string().min(1),
  horizonMonths: z.number().int().min(12).max(24)
});

export const howItWinsStrategyEvaluationSchema = z.object({
  strategyId: howItWinsStrategyIdSchema,
  disposition: howItWinsDispositionSchema,
  betIds: nonemptyIds,
  mechanism: z.string().min(1).nullable(),
  evidenceGate: z.enum(["pass", "fail", "unresolved"]),
  evidenceIds: nonemptyIds,
  claimIds: nonemptyIds,
  counterevidenceIds: nonemptyIds,
  dimensions: howItWinsJudgmentDimensionsSchema,
  presentRelevance: z.enum(["current", "historical_only", "unresolved", "not_reached"]),
  historicalEvidenceIds: nonemptyIds,
  presentEvidenceIds: nonemptyIds,
  presentBridge: z.object({ text: z.string().min(1), evidenceIds: nonemptyIds.min(1) }).nullable(),
  siblingCandidateIds: z.array(howItWinsStrategyIdSchema),
  siblingResolutions: z.array(howItWinsSiblingResolutionSchema),
  notYet: howItWinsNotYetSchema.nullable(),
  dispositionReason: z.string().min(1)
});

export type HowItWinsStrategyEvaluation = z.infer<typeof howItWinsStrategyEvaluationSchema>;

export const howItWinsUnusualPairSchema = z.object({
  strategyIds: z.tuple([howItWinsStrategyIdSchema, howItWinsStrategyIdSchema]),
  referenceClass: z.string().min(1),
  normalChoice: z.string().min(1),
  excludedAlternative: z.string().min(1),
  acceptedCost: z.string().min(1),
  interaction: z.string().min(1),
  copyingDifficulty: z.string().min(1),
  evidenceIds: nonemptyIds.min(1)
});

export const howItWinsOpenQuestionSchema = z.object({
  questionId: z.string().min(1),
  question: z.string().min(1),
  whyMaterial: z.string().min(1),
  evidenceNeeded: z.string().min(1),
  affectedStrategyIds: z.array(howItWinsStrategyIdSchema),
  evidenceIds: nonemptyIds
});

export const howItWinsDisagreementSchema = z.object({
  disagreementId: z.string().min(1),
  stage: z.string().min(1),
  summary: z.string().min(1),
  material: z.boolean(),
  strategyIds: z.array(howItWinsStrategyIdSchema),
  evidenceIds: nonemptyIds
});

export const howItWinsOverrideSchema = z.object({
  kind: z.enum(["strategy", "bet", "pair"]),
  strategyId: howItWinsStrategyIdSchema.optional(),
  betId: z.string().min(1).optional(),
  from: z.string().min(1),
  to: z.string().min(1),
  reason: z.string().min(1),
  evidenceIds: nonemptyIds.min(1)
});

export const howItWinsJudgeCallTraceSchema = z.object({
  callId: z.string().min(1),
  stage: z.enum(["global_judge", "critic", "adjudication"]),
  provider: z.string().min(1),
  model: z.string().min(1),
  inputTokens: z.number().int().nonnegative(),
  outputTokens: z.number().int().nonnegative(),
  cacheCreationInputTokens: z.number().int().nonnegative(),
  cacheReadInputTokens: z.number().int().nonnegative(),
  actualCostUsd: z.number().nonnegative().nullable(),
  estimatedCostUsd: z.number().nonnegative().nullable(),
  latencyMs: z.number().nonnegative(),
  retryCount: z.number().int().nonnegative(),
  thinkingState: z.enum(["enabled", "disabled", "unknown"]),
  outcome: z.enum(["ok", "failed"]),
  error: z.string().min(1).optional()
}).superRefine((call, ctx) => {
  if (call.actualCostUsd === null && call.estimatedCostUsd === null) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["estimatedCostUsd"], message: "actual or estimated cost is required" });
  }
});

export type HowItWinsJudgeCallTrace = z.infer<typeof howItWinsJudgeCallTraceSchema>;

const bodyObjectSchema = z.object({
  evidenceCutoff: z.string().datetime(),
  evidenceRegistry: z.array(howItWinsEvidenceItemSchema).min(1),
  claims: z.array(howItWinsClaimSchema),
  materialBets: z.array(howItWinsMaterialBetSchema).min(1),
  strategyEvaluations: z.array(howItWinsStrategyEvaluationSchema),
  currentStrategyIds: z.array(howItWinsStrategyIdSchema),
  unusualPair: howItWinsUnusualPairSchema.nullable(),
  openQuestions: z.array(howItWinsOpenQuestionSchema),
  overallWrongCondition: z.object({ condition: z.string().min(1), evidenceIds: nonemptyIds }),
  disagreements: z.array(howItWinsDisagreementSchema),
  overrides: z.array(howItWinsOverrideSchema)
});

export type HowItWinsJudgmentBody = z.infer<typeof bodyObjectSchema>;

function addIssue(ctx: z.RefinementCtx, path: Array<string | number>, message: string) {
  ctx.addIssue({ code: z.ZodIssueCode.custom, path, message });
}

function unique(values: readonly string[]) {
  return new Set(values).size === values.length;
}

const judgedDispositions = new Set(["current", "not_yet", "open_question"]);

// A strategy the judgment does not carry may arrive compact: no mechanism, nothing reached,
// nothing cited. Judgments stored before the compact rows existed carry the full shape instead,
// and both stay valid.
function isCompactStrategyRecord(entry: HowItWinsStrategyEvaluation) {
  const cited = [
    entry.betIds,
    entry.evidenceIds,
    entry.claimIds,
    entry.counterevidenceIds,
    entry.historicalEvidenceIds,
    entry.presentEvidenceIds,
    entry.siblingCandidateIds,
    entry.siblingResolutions
  ];
  return Object.values(entry.dimensions).every((value) => value === "not_reached")
    && cited.every((value) => value.length === 0)
    && entry.presentRelevance === "not_reached"
    && entry.presentBridge === null;
}

function validateEvidenceIds(
  ids: readonly string[],
  validIds: Set<string>,
  ctx: z.RefinementCtx,
  path: Array<string | number>
) {
  for (const id of ids) {
    if (!validIds.has(id)) addIssue(ctx, path, `unknown evidence id: ${id}`);
  }
}

function validateBody(body: HowItWinsJudgmentBody, ctx: z.RefinementCtx) {
  const evidenceIds = body.evidenceRegistry.map((entry) => entry.evidenceId);
  if (!unique(evidenceIds)) addIssue(ctx, ["evidenceRegistry"], "evidence ids must be unique");
  const validEvidenceIds = new Set(evidenceIds);

  const claimIds = body.claims.map((claim) => claim.claimId);
  if (!unique(claimIds)) addIssue(ctx, ["claims"], "claim ids must be unique");
  const claimsById = new Map(body.claims.map((claim) => [claim.claimId, claim]));
  body.claims.forEach((claim, index) => {
    validateEvidenceIds(claim.evidenceIds, validEvidenceIds, ctx, ["claims", index, "evidenceIds"]);
    if (claim.type === "judgment") {
      for (const id of claim.basisClaimIds) {
        if (!claimsById.has(id)) addIssue(ctx, ["claims", index, "basisClaimIds"], `unknown claim id: ${id}`);
      }
    }
  });

  const betIds = body.materialBets.map((bet) => bet.betId);
  if (!unique(betIds)) addIssue(ctx, ["materialBets"], "bet ids must be unique");
  const validBetIds = new Set(betIds);
  body.materialBets.forEach((bet, index) =>
    validateEvidenceIds(bet.supportingEvidenceIds, validEvidenceIds, ctx, ["materialBets", index, "supportingEvidenceIds"])
  );

  const expectedIds = HOW_IT_WINS_STRATEGIES.map((strategy) => strategy.id);
  const actualIds = body.strategyEvaluations.map((entry) => entry.strategyId);
  if (actualIds.length !== expectedIds.length) {
    addIssue(ctx, ["strategyEvaluations"], `expected ${expectedIds.length} strategy evaluations`);
  }
  if (!unique(actualIds)) addIssue(ctx, ["strategyEvaluations"], "strategy ids must be unique");
  const actualSet = new Set(actualIds);
  for (const id of expectedIds) {
    if (!actualSet.has(id)) addIssue(ctx, ["strategyEvaluations"], `missing strategy id: ${id}`);
  }

  const currentDispositionIds: HowItWinsStrategyId[] = [];
  body.strategyEvaluations.forEach((entry, index) => {
    const path = ["strategyEvaluations", index];
    if (entry.disposition === "current") currentDispositionIds.push(entry.strategyId);
    for (const betId of entry.betIds) {
      if (!validBetIds.has(betId)) addIssue(ctx, [...path, "betIds"], `unknown bet id: ${betId}`);
    }
    for (const claimId of entry.claimIds) {
      if (!claimsById.has(claimId)) addIssue(ctx, [...path, "claimIds"], `unknown claim id: ${claimId}`);
    }
    validateEvidenceIds(entry.evidenceIds, validEvidenceIds, ctx, [...path, "evidenceIds"]);
    validateEvidenceIds(entry.counterevidenceIds, validEvidenceIds, ctx, [...path, "counterevidenceIds"]);
    validateEvidenceIds(entry.historicalEvidenceIds, validEvidenceIds, ctx, [...path, "historicalEvidenceIds"]);
    validateEvidenceIds(entry.presentEvidenceIds, validEvidenceIds, ctx, [...path, "presentEvidenceIds"]);
    if (entry.presentBridge) {
      validateEvidenceIds(entry.presentBridge.evidenceIds, validEvidenceIds, ctx, [...path, "presentBridge", "evidenceIds"]);
    }

    const dimensions = Object.values(entry.dimensions);
    if (entry.evidenceGate === "fail") {
      if (!["insufficient", "contradicted"].includes(entry.dimensions.evidenceStrength)) {
        addIssue(ctx, [...path, "dimensions", "evidenceStrength"], "failed evidence gate needs insufficient or contradicted evidence strength");
      }
      if (dimensions.slice(1).some((value) => value !== "not_reached")) {
        addIssue(ctx, [...path, "dimensions"], "dimensions after a failed evidence gate must be not_reached");
      }
    } else if (judgedDispositions.has(entry.disposition) || entry.mechanism !== null) {
      if (dimensions.includes("not_reached")) {
        addIssue(ctx, [...path, "dimensions"], "supported or disputed strategies require every judgment dimension");
      }
      if (!entry.mechanism || entry.evidenceIds.length === 0) {
        addIssue(ctx, path, "supported or disputed strategies require a mechanism and evidence");
      }
    } else if (!isCompactStrategyRecord(entry)) {
      addIssue(ctx, path, "a rejected strategy record must stay compact or carry the full judgment");
    }

    if (entry.disposition === "current") {
      if (
        entry.evidenceGate !== "pass" ||
        entry.dimensions.materiality !== "material" ||
        entry.dimensions.independence !== "independent" ||
        !["necessary", "additive"].includes(entry.dimensions.explanatoryValue) ||
        entry.presentRelevance !== "current"
      ) {
        addIssue(ctx, path, "current strategy does not pass every current-selection gate");
      }
      if (entry.presentEvidenceIds.length === 0 && !entry.presentBridge) {
        addIssue(ctx, path, "current strategy needs recent support or a present-outcome bridge");
      }
    }

    const siblingCandidates = new Set(entry.siblingCandidateIds);
    const siblingResolutions = new Map(entry.siblingResolutions.map((resolution) => [resolution.strategyId, resolution]));
    if (!unique(entry.siblingCandidateIds)) addIssue(ctx, [...path, "siblingCandidateIds"], "sibling candidates must be unique");
    for (const siblingId of siblingCandidates) {
      if (siblingId === entry.strategyId) {
        addIssue(ctx, [...path, "siblingCandidateIds"], "a strategy cannot be its own sibling");
      }
      if (!siblingResolutions.has(siblingId)) {
        addIssue(ctx, [...path, "siblingResolutions"], `missing sibling distinction for ${siblingId}`);
      }
    }
    for (const resolution of entry.siblingResolutions) {
      if (!siblingCandidates.has(resolution.strategyId)) {
        addIssue(ctx, [...path, "siblingResolutions"], `unexpected sibling distinction for ${resolution.strategyId}`);
      }
      validateEvidenceIds(resolution.evidenceIds, validEvidenceIds, ctx, [...path, "siblingResolutions"]);
    }

    if (entry.disposition === "not_yet") {
      if (!entry.notYet) addIssue(ctx, [...path, "notYet"], "not yet disposition requires a complete not-yet record");
      if (entry.presentRelevance === "current") {
        addIssue(ctx, [...path, "presentRelevance"], "a current mechanism cannot be not yet");
      }
    } else if (entry.notYet) {
      addIssue(ctx, [...path, "notYet"], "only a not yet disposition may carry a not-yet record");
    }
    if (entry.notYet) {
      validateEvidenceIds(entry.notYet.precursorEvidenceIds, validEvidenceIds, ctx, [...path, "notYet", "precursorEvidenceIds"]);
    }

    if (["current", "not_yet"].includes(entry.disposition)) {
      const usesSpeculation = entry.claimIds.some((id) => claimsById.get(id)?.type === "unsupported_speculation");
      if (usesSpeculation) addIssue(ctx, [...path, "claimIds"], "unsupported speculation cannot be current or not yet");
    }
  });

  if (!unique(body.currentStrategyIds)) addIssue(ctx, ["currentStrategyIds"], "current strategy ids must be unique");
  const selectedSet = new Set(body.currentStrategyIds);
  if (
    selectedSet.size !== currentDispositionIds.length ||
    currentDispositionIds.some((id) => !selectedSet.has(id))
  ) {
    addIssue(ctx, ["currentStrategyIds"], "current set must exactly match current dispositions");
  }

  if (body.unusualPair) {
    const [left, right] = body.unusualPair.strategyIds;
    if (left === right) addIssue(ctx, ["unusualPair", "strategyIds"], "pair legs must differ");
    if (!selectedSet.has(left) || !selectedSet.has(right)) {
      addIssue(ctx, ["unusualPair", "strategyIds"], "pair legs must both be current");
    }
    validateEvidenceIds(body.unusualPair.evidenceIds, validEvidenceIds, ctx, ["unusualPair", "evidenceIds"]);
  }

  const openQuestionIds = body.openQuestions.map((question) => question.questionId);
  if (!unique(openQuestionIds)) addIssue(ctx, ["openQuestions"], "open question ids must be unique");
  body.openQuestions.forEach((question, index) =>
    validateEvidenceIds(question.evidenceIds, validEvidenceIds, ctx, ["openQuestions", index, "evidenceIds"])
  );
  validateEvidenceIds(body.overallWrongCondition.evidenceIds, validEvidenceIds, ctx, ["overallWrongCondition", "evidenceIds"]);
  const disagreementIds = body.disagreements.map((entry) => entry.disagreementId);
  if (!unique(disagreementIds)) addIssue(ctx, ["disagreements"], "disagreement ids must be unique");
  body.disagreements.forEach((entry, index) =>
    validateEvidenceIds(entry.evidenceIds, validEvidenceIds, ctx, ["disagreements", index, "evidenceIds"])
  );
  body.overrides.forEach((entry, index) => {
    if (entry.kind === "strategy" && !entry.strategyId) {
      addIssue(ctx, ["overrides", index, "strategyId"], "strategy override requires a strategy id");
    }
    if (entry.kind === "bet" && !entry.betId) {
      addIssue(ctx, ["overrides", index, "betId"], "bet override requires a bet id");
    }
    validateEvidenceIds(entry.evidenceIds, validEvidenceIds, ctx, ["overrides", index, "evidenceIds"]);
  });
}

export const howItWinsJudgmentBodySchema = bodyObjectSchema.superRefine(validateBody);

// What the refinement stages after the global judgment actually did. Judgments stored before
// this field existed omit it, so every reader treats an absent record as unknown rather than
// as a clean run.
const refinementSchema = z.object({
  critic: z.enum(["ok", "failed", "skipped_same_provider", "skipped_disabled"]),
  adjudication: z.enum(["ok", "failed", "not_needed"]),
  notes: z.array(z.string().min(1).max(300)),
  // Deterministic fixes the transport made to the model's own answer before it was
  // materialized. Judgments stored before the repair pass existed carry none.
  repairs: z.array(z.string().min(1).max(300)).default([])
});

const judgmentObjectSchema = z.object({
  version: z.literal(1),
  hashes: z.object({ evidencePacket: hashSchema, prompt: hashSchema, vocabulary: hashSchema }),
  ...bodyObjectSchema.shape,
  refinement: refinementSchema.optional(),
  calls: z.array(howItWinsJudgeCallTraceSchema).min(1)
});

export const howItWinsJudgmentSchema = judgmentObjectSchema.superRefine((judgment, ctx) => {
  validateBody(judgment, ctx);
  const callIds = judgment.calls.map((call) => call.callId);
  if (!unique(callIds)) addIssue(ctx, ["calls"], "call ids must be unique");
});

export type HowItWinsJudgment = z.infer<typeof howItWinsJudgmentSchema>;

export function howItWinsJudgmentSelection(input: Pick<HowItWinsJudgmentBody, "currentStrategyIds">) {
  return input.currentStrategyIds.length === 0
    ? { status: "nothing_stands_out" as const, strategyIds: [] as HowItWinsStrategyId[] }
    : { status: "current" as const, strategyIds: [...input.currentStrategyIds] };
}
