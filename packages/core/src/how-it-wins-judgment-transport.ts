import { z } from "zod";

import {
  howItWinsJudgmentBodySchema,
  howItWinsJudgmentDimensionsSchema,
  howItWinsMaterialBetSchema,
  howItWinsNotYetSchema,
  howItWinsSiblingResolutionSchema,
  type HowItWinsJudgmentBody,
  type HowItWinsStrategyEvaluation
} from "./how-it-wins-judgment";
import { howItWinsStrategyById, howItWinsStrategyIdSchema, type HowItWinsStrategyId } from "./how-it-wins";

export class HowItWinsJudgmentClosedError extends Error {
  constructor(message: string) {
    super(`how-it-wins judge failed closed: ${message}`);
    this.name = "HowItWinsJudgeClosedError";
  }
}

const semanticNullFields = new Set(["mechanism", "presentBridge", "notYet", "unusualPair"]);

export function stripUnknownNullTransportFields(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stripUnknownNullTransportFields);
  if (value === null || typeof value !== "object") return value;
  return Object.fromEntries(Object.entries(value as Record<string, unknown>).flatMap(([key, child]) => {
    if (child === null && !semanticNullFields.has(key)) return [];
    return [[key, stripUnknownNullTransportFields(child)]];
  }));
}

export const semanticMaterialBetSchema = howItWinsMaterialBetSchema.omit({ betId: true }).strict();

const notReachedStrategyDimensions = {
  evidenceStrength: "not_reached",
  centrality: "not_reached",
  materiality: "not_reached",
  distinctiveness: "not_reached",
  independence: "not_reached",
  explanatoryValue: "not_reached"
} as const;

export const failedStrategyDimensions = {
  ...notReachedStrategyDimensions,
  evidenceStrength: "insufficient"
} as const;

type CompactDisposition = Extract<
  HowItWinsStrategyEvaluation["disposition"],
  "insufficient_evidence" | "rejected" | "not_applicable"
>;

// One shape for every strategy the judgment does not carry: no mechanism, nothing cited, no
// dimension reached. A failed evidence gate is the case that also fixes evidence strength.
function compactStrategyEvaluation(input: {
  strategyId: HowItWinsStrategyId;
  disposition: CompactDisposition;
  evidenceGate: HowItWinsStrategyEvaluation["evidenceGate"];
  dispositionReason: string;
}): HowItWinsStrategyEvaluation {
  return {
    strategyId: input.strategyId,
    disposition: input.disposition,
    betIds: [],
    mechanism: null,
    evidenceGate: input.evidenceGate,
    evidenceIds: [],
    claimIds: [],
    counterevidenceIds: [],
    dimensions: input.evidenceGate === "fail" ? failedStrategyDimensions : notReachedStrategyDimensions,
    presentRelevance: "not_reached",
    historicalEvidenceIds: [],
    presentEvidenceIds: [],
    presentBridge: null,
    siblingCandidateIds: [],
    siblingResolutions: [],
    notYet: null,
    dispositionReason: input.dispositionReason
  };
}

export function failedStrategyEvaluation(
  strategyId: HowItWinsStrategyId,
  dispositionReason: string,
  disposition: CompactDisposition = "insufficient_evidence"
): HowItWinsStrategyEvaluation {
  return compactStrategyEvaluation({ strategyId, disposition, evidenceGate: "fail", dispositionReason });
}

const semanticSupportingClaimSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("observed_fact"),
    text: z.string().min(1),
    evidenceIds: z.array(z.string().min(1)).min(1)
  }).strict(),
  z.object({
    type: z.literal("reasonable_inference"),
    text: z.string().min(1),
    evidenceIds: z.array(z.string().min(1)).min(1),
    bridge: z.string().min(1)
  }).strict()
]);

// Nothing downstream reads a rejected strategy's full record, so the model returns four fields
// for one. Only current, not-yet, and open-question strategies pay for the full shape.
const compactSemanticStrategySchema = z.object({
  strategyId: howItWinsStrategyIdSchema,
  disposition: z.enum(["insufficient_evidence", "rejected", "not_applicable"]),
  evidenceGate: z.enum(["pass", "fail", "unresolved"]),
  dispositionReason: z.string().min(1)
}).strict();

// The deciding question comes from the frozen rubric, so the model never writes it back.
const semanticSiblingResolutionSchema = howItWinsSiblingResolutionSchema
  .omit({ decidingQuestion: true })
  .strict();

const fullSemanticStrategySchema = z.object({
  strategyId: howItWinsStrategyIdSchema,
  disposition: z.enum(["current", "not_yet", "open_question"]),
  betRefs: z.array(z.number().int().positive()),
  mechanism: z.string().min(1),
  evidenceGate: z.enum(["pass", "unresolved"]),
  evidenceIds: z.array(z.string().min(1)).min(1),
  supportingClaims: z.array(semanticSupportingClaimSchema),
  counterevidenceIds: z.array(z.string().min(1)),
  dimensions: howItWinsJudgmentDimensionsSchema,
  presentRelevance: z.enum(["current", "historical_only", "unresolved", "not_reached"]),
  historicalEvidenceIds: z.array(z.string().min(1)),
  presentEvidenceIds: z.array(z.string().min(1)),
  presentBridge: z.object({
    text: z.string().min(1),
    evidenceIds: z.array(z.string().min(1)).min(1)
  }).strict().nullable(),
  siblingCandidateIds: z.array(howItWinsStrategyIdSchema),
  siblingResolutions: z.array(semanticSiblingResolutionSchema),
  notYet: howItWinsNotYetSchema.nullable(),
  dispositionReason: z.string().min(1)
}).strict();

const semanticOpenQuestionSchema = z.object({
  question: z.string().min(1),
  whyMaterial: z.string().min(1),
  evidenceNeeded: z.string().min(1),
  affectedStrategyIds: z.array(howItWinsStrategyIdSchema),
  evidenceIds: z.array(z.string().min(1))
}).strict();

const semanticDisagreementSchema = z.object({
  stage: z.string().min(1),
  summary: z.string().min(1),
  material: z.boolean(),
  strategyIds: z.array(howItWinsStrategyIdSchema),
  evidenceIds: z.array(z.string().min(1))
}).strict();

const semanticOverrideSchema = z.object({
  kind: z.enum(["strategy", "pair"]),
  strategyId: howItWinsStrategyIdSchema.optional(),
  from: z.string().min(1),
  to: z.string().min(1),
  reason: z.string().min(1),
  evidenceIds: z.array(z.string().min(1)).min(1)
}).strict();

export const semanticJudgmentSchema = z.object({
  materialBets: z.array(semanticMaterialBetSchema).min(1).optional(),
  strategyEvaluations: z.array(z.union([
    compactSemanticStrategySchema,
    fullSemanticStrategySchema
  ])),
  currentStrategyIds: z.array(howItWinsStrategyIdSchema),
  unusualPair: z.object({
    strategyIds: z.tuple([howItWinsStrategyIdSchema, howItWinsStrategyIdSchema]),
    referenceClass: z.string().min(1),
    normalChoice: z.string().min(1),
    excludedAlternative: z.string().min(1),
    acceptedCost: z.string().min(1),
    interaction: z.string().min(1),
    copyingDifficulty: z.string().min(1),
    evidenceIds: z.array(z.string().min(1)).min(1)
  }).strict().nullable(),
  openQuestions: z.array(semanticOpenQuestionSchema),
  overallWrongCondition: z.object({
    condition: z.string().min(1),
    evidenceIds: z.array(z.string().min(1))
  }).strict(),
  disagreements: z.array(semanticDisagreementSchema),
  overrides: z.array(semanticOverrideSchema)
}).strict();

export type SemanticHowItWinsJudgment = z.infer<typeof semanticJudgmentSchema>;

export const betRevisionSchema = z.object({
  materialBets: z.array(semanticMaterialBetSchema).min(1),
  reason: z.string().min(1),
  evidenceIds: z.array(z.string().min(1)).min(1)
}).strict();

export const globalJudgmentTransportSchema = semanticJudgmentSchema.extend({
  betRevision: betRevisionSchema.optional()
}).strict();

export function assignMaterialBetIds(
  bets: Array<z.infer<typeof semanticMaterialBetSchema>>
): HowItWinsJudgmentBody["materialBets"] {
  return bets.map((bet, index) => ({ betId: `b${index + 1}`, ...bet }));
}

type SemanticStrategyEvaluation = SemanticHowItWinsJudgment["strategyEvaluations"][number];

function isCompactSemanticStrategy(
  evaluation: SemanticStrategyEvaluation
): evaluation is z.infer<typeof compactSemanticStrategySchema> {
  return !("mechanism" in evaluation);
}

export function materializeSemanticJudgment(input: {
  semantic: SemanticHowItWinsJudgment;
  materialBets: HowItWinsJudgmentBody["materialBets"];
  evidenceCutoff: string;
  evidenceRegistry: HowItWinsJudgmentBody["evidenceRegistry"];
  decidingQuestionFor?: (strategyId: HowItWinsStrategyId) => string | undefined;
  retainedOverrides?: HowItWinsJudgmentBody["overrides"];
}) {
  const decidingQuestion = (strategyId: HowItWinsStrategyId) =>
    input.decidingQuestionFor?.(strategyId) || howItWinsStrategyById(strategyId).meaning;
  const claims: HowItWinsJudgmentBody["claims"] = [];
  const claimIdsByStrategy = new Map<HowItWinsStrategyId, string[]>();
  for (const evaluation of input.semantic.strategyEvaluations) {
    if (isCompactSemanticStrategy(evaluation)) continue;
    const claimIds: string[] = [];
    for (const claim of evaluation.supportingClaims) {
      const claimId = `c${claims.length + 1}`;
      claims.push({ claimId, ...claim });
      claimIds.push(claimId);
    }
    claimIdsByStrategy.set(evaluation.strategyId, claimIds);
  }

  const strategyEvaluations = input.semantic.strategyEvaluations.map((evaluation) => {
    if (isCompactSemanticStrategy(evaluation)) return compactStrategyEvaluation(evaluation);
    const { betRefs, supportingClaims: _supportingClaims, siblingResolutions, ...rest } = evaluation;
    const betIds = betRefs.map((reference) => {
      const bet = input.materialBets[reference - 1];
      if (!bet) {
        throw new HowItWinsJudgmentClosedError(
          `${evaluation.strategyId} references unknown local bet ${reference}`
        );
      }
      return bet.betId;
    });
    return {
      ...rest,
      betIds,
      claimIds: claimIdsByStrategy.get(evaluation.strategyId) ?? [],
      siblingResolutions: siblingResolutions.map((resolution) => ({
        strategyId: resolution.strategyId,
        decidingQuestion: decidingQuestion(resolution.strategyId),
        reason: resolution.reason,
        evidenceIds: resolution.evidenceIds
      }))
    };
  });

  return howItWinsJudgmentBodySchema.parse({
    evidenceCutoff: input.evidenceCutoff,
    evidenceRegistry: input.evidenceRegistry,
    claims,
    materialBets: input.materialBets,
    strategyEvaluations,
    currentStrategyIds: input.semantic.currentStrategyIds,
    unusualPair: input.semantic.unusualPair,
    openQuestions: input.semantic.openQuestions.map((question, index) => ({
      questionId: `q${index + 1}`,
      ...question
    })),
    overallWrongCondition: input.semantic.overallWrongCondition,
    disagreements: input.semantic.disagreements.map((entry, index) => ({
      disagreementId: `d${index + 1}`,
      ...entry
    })),
    overrides: [
      ...(input.retainedOverrides ?? []),
      ...input.semantic.overrides
    ]
  });
}

export function semanticJudgmentForModel(body: HowItWinsJudgmentBody): SemanticHowItWinsJudgment {
  const betIndexById = new Map(body.materialBets.map((bet, index) => [bet.betId, index + 1]));
  const claimsById = new Map(body.claims.map((claim) => [claim.claimId, claim]));
  return semanticJudgmentSchema.parse({
    materialBets: body.materialBets.map(({ betId: _betId, ...bet }) => bet),
    strategyEvaluations: body.strategyEvaluations.map((evaluation) => {
      // A judgment stored before the compact rows existed can carry a full rejected record.
      // The model never needs to read one back, so every such row projects compact.
      if (!["current", "not_yet", "open_question"].includes(evaluation.disposition)) {
        return {
          strategyId: evaluation.strategyId,
          disposition: evaluation.disposition,
          evidenceGate: evaluation.evidenceGate,
          dispositionReason: evaluation.dispositionReason
        };
      }
      const supportingClaims = evaluation.claimIds.flatMap((claimId) => {
        const claim = claimsById.get(claimId);
        if (!claim || (claim.type !== "observed_fact" && claim.type !== "reasonable_inference")) return [];
        const { claimId: _claimId, ...semantic } = claim;
        return [semantic];
      });
      const betRefs = evaluation.betIds.map((betId) => {
        const reference = betIndexById.get(betId);
        if (!reference) {
          throw new HowItWinsJudgmentClosedError(`cannot project unknown bet id ${betId}`);
        }
        return reference;
      });
      const { betIds: _betIds, claimIds: _claimIds, siblingResolutions, ...rest } = evaluation;
      return {
        ...rest,
        betRefs,
        supportingClaims,
        siblingResolutions: siblingResolutions.map(
          ({ decidingQuestion: _decidingQuestion, ...resolution }) => resolution
        )
      };
    }),
    currentStrategyIds: body.currentStrategyIds,
    unusualPair: body.unusualPair,
    openQuestions: body.openQuestions.map(({ questionId: _questionId, ...question }) => question),
    overallWrongCondition: body.overallWrongCondition,
    disagreements: body.disagreements.map(({ disagreementId: _disagreementId, ...entry }) => entry),
    overrides: body.overrides.flatMap((entry) => {
      if (entry.kind === "bet") return [];
      const { betId: _betId, ...semantic } = entry;
      return [semantic];
    })
  });
}
