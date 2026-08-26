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

// An open question reaches the writer as a mechanism, its evidence, and the reason it is still
// open. Nothing downstream reads the rest, so the judge returns those and stops. A full-shaped
// open-question row stays valid: stored judgments carry one, and so may a model.
const leanSemanticStrategySchema = z.object({
  strategyId: howItWinsStrategyIdSchema,
  disposition: z.literal("open_question"),
  evidenceGate: z.enum(["pass", "unresolved"]),
  mechanism: z.string().min(1),
  evidenceIds: z.array(z.string().min(1)).min(1),
  counterevidenceIds: z.array(z.string().min(1)).optional(),
  dimensions: howItWinsJudgmentDimensionsSchema,
  dispositionReason: z.string().min(1)
}).strict();

// Order matters. Compact and full are both strict, so a lean row falls through to the last
// option; keeping lean last also keeps the tool schema's anyOf indices stable.
const semanticStrategyEvaluationSchema = z.union([
  compactSemanticStrategySchema,
  fullSemanticStrategySchema,
  leanSemanticStrategySchema
]);

const semanticUnusualPairSchema = z.object({
  strategyIds: z.tuple([howItWinsStrategyIdSchema, howItWinsStrategyIdSchema]),
  referenceClass: z.string().min(1),
  normalChoice: z.string().min(1),
  excludedAlternative: z.string().min(1),
  acceptedCost: z.string().min(1),
  interaction: z.string().min(1),
  copyingDifficulty: z.string().min(1),
  evidenceIds: z.array(z.string().min(1)).min(1)
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
  strategyEvaluations: z.array(semanticStrategyEvaluationSchema),
  currentStrategyIds: z.array(howItWinsStrategyIdSchema),
  unusualPair: semanticUnusualPairSchema.nullable(),
  openQuestions: z.array(semanticOpenQuestionSchema),
  overallWrongCondition: z.object({
    condition: z.string().min(1),
    evidenceIds: z.array(z.string().min(1))
  }).strict(),
  disagreements: z.array(semanticDisagreementSchema),
  overrides: z.array(semanticOverrideSchema)
}).strict();

export type SemanticHowItWinsJudgment = z.infer<typeof semanticJudgmentSchema>;

// Adjudication is the stage that may replace the material bets. The global judgment still
// tolerates the field because its stage contract names it; the judge drops what it carries.
export const betRevisionSchema = z.object({
  materialBets: z.array(semanticMaterialBetSchema).min(1),
  reason: z.string().min(1),
  evidenceIds: z.array(z.string().min(1)).min(1)
}).strict();

export const globalJudgmentTransportSchema = semanticJudgmentSchema.extend({
  betRevision: betRevisionSchema.optional()
}).strict();

// Adjudication used to re-emit all 80 rows so validation could prove nothing else moved. That
// cost a second full judgment and threw the whole answer away when one undisputed row drifted by
// a word. The patch names only what changed; everything else is carried from the settled body by
// code, so there is nothing left to drift.
export const adjudicationPatchSchema = z.object({
  strategyEvaluations: z.array(semanticStrategyEvaluationSchema),
  currentStrategyIds: z.array(howItWinsStrategyIdSchema),
  unusualPair: semanticUnusualPairSchema.nullable().optional(),
  overrides: z.array(semanticOverrideSchema),
  betRevision: betRevisionSchema.optional()
}).strict();

export type HowItWinsAdjudicationPatch = z.infer<typeof adjudicationPatchSchema>;

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

function isLeanSemanticStrategy(
  evaluation: SemanticStrategyEvaluation
): evaluation is z.infer<typeof leanSemanticStrategySchema> {
  return "mechanism" in evaluation && !("supportingClaims" in evaluation);
}

function leanStrategyEvaluation(
  input: z.infer<typeof leanSemanticStrategySchema>
): HowItWinsStrategyEvaluation {
  return {
    strategyId: input.strategyId,
    disposition: "open_question",
    betIds: [],
    mechanism: input.mechanism,
    evidenceGate: input.evidenceGate,
    evidenceIds: input.evidenceIds,
    claimIds: [],
    counterevidenceIds: input.counterevidenceIds ?? [],
    dimensions: input.dimensions,
    presentRelevance: "unresolved",
    historicalEvidenceIds: [],
    presentEvidenceIds: [],
    presentBridge: null,
    siblingCandidateIds: [],
    siblingResolutions: [],
    notYet: null,
    dispositionReason: input.dispositionReason
  };
}

export type SemanticJudgmentRepairOptions = {
  requiredSiblingIds?: Partial<Record<HowItWinsStrategyId, readonly HowItWinsStrategyId[]>>;
};

type FullSemanticStrategy = z.infer<typeof fullSemanticStrategySchema>;

const currentSelectionGates: ReadonlyArray<{ label: string; fails: (row: FullSemanticStrategy) => boolean }> = [
  { label: "the evidence gate did not pass", fails: (row) => row.evidenceGate !== "pass" },
  { label: "materiality is not material", fails: (row) => row.dimensions.materiality !== "material" },
  { label: "independence is not independent", fails: (row) => row.dimensions.independence !== "independent" },
  {
    label: "explanatory value is neither necessary nor additive",
    fails: (row) => !["necessary", "additive"].includes(row.dimensions.explanatoryValue)
  },
  { label: "present relevance is not current", fails: (row) => row.presentRelevance !== "current" },
  {
    label: "no recent evidence and no present bridge",
    fails: (row) => row.presentEvidenceIds.length === 0 && !row.presentBridge
  }
];

function repairFullStrategy(
  input: FullSemanticStrategy,
  requiredSiblingIds: readonly HowItWinsStrategyId[],
  note: (text: string) => void
): FullSemanticStrategy {
  const strategyId = input.strategyId;

  const siblingResolutions = input.siblingResolutions.filter((resolution) => {
    if (resolution.strategyId !== strategyId) return true;
    note(`${strategyId} drops a sibling distinction against itself.`);
    return false;
  });
  const resolved = new Set(siblingResolutions.map((resolution) => resolution.strategyId));

  const siblingCandidateIds: HowItWinsStrategyId[] = [];
  const carried = new Set<HowItWinsStrategyId>();
  for (const candidateId of input.siblingCandidateIds) {
    if (candidateId === strategyId) {
      note(`${strategyId} drops itself from its sibling candidates.`);
      continue;
    }
    if (carried.has(candidateId)) {
      note(`${strategyId} drops a repeated sibling candidate ${candidateId}.`);
      continue;
    }
    if (!resolved.has(candidateId)) {
      note(`${strategyId} drops sibling candidate ${candidateId} because it carries no distinction against it.`);
      continue;
    }
    carried.add(candidateId);
    siblingCandidateIds.push(candidateId);
  }
  for (const resolution of siblingResolutions) {
    if (carried.has(resolution.strategyId)) continue;
    carried.add(resolution.strategyId);
    siblingCandidateIds.push(resolution.strategyId);
    note(`${strategyId} adds sibling candidate ${resolution.strategyId} because it carries a distinction against it.`);
  }

  let disposition = input.disposition;
  let presentRelevance = input.presentRelevance;
  let notYet = input.notYet;
  if (disposition === "not_yet" && !notYet) {
    disposition = "open_question";
    note(`${strategyId} carries no not-yet record, so it becomes an open question.`);
  } else if (disposition !== "not_yet" && notYet) {
    notYet = null;
    note(`${strategyId} is not a not-yet row, so its not-yet record is dropped.`);
  }
  if (disposition === "not_yet" && presentRelevance === "current") {
    presentRelevance = "unresolved";
    note(`${strategyId} is not yet, so its present relevance moves from current to unresolved.`);
  }

  const missingSibling = requiredSiblingIds.find((siblingId) => !resolved.has(siblingId));
  if (disposition === "current" && missingSibling) {
    disposition = "open_question";
    note(`${strategyId} carries no cited distinction against ${missingSibling}, so it becomes an open question.`);
  }

  const repaired: FullSemanticStrategy = {
    ...input,
    disposition,
    presentRelevance,
    notYet,
    siblingCandidateIds,
    siblingResolutions
  };
  if (repaired.disposition !== "current") return repaired;
  const failures = currentSelectionGates.filter((gate) => gate.fails(repaired)).map((gate) => gate.label);
  if (failures.length === 0) return repaired;
  note(`${strategyId} fails the current-selection gate (${failures.join("; ")}), so it becomes an open question.`);
  return { ...repaired, disposition: "open_question" };
}

function repairSemanticPass(
  semantic: SemanticHowItWinsJudgment,
  requiredSiblingIds: SemanticJudgmentRepairOptions["requiredSiblingIds"],
  note: (text: string) => void
): SemanticHowItWinsJudgment {
  // A compact row carries nothing to repair, and a lean row is an open question with no
  // siblings, no not-yet record, and no current claim, so every rule below is already settled.
  const strategyEvaluations = semantic.strategyEvaluations.map((evaluation) =>
    isCompactSemanticStrategy(evaluation) || isLeanSemanticStrategy(evaluation)
      ? evaluation
      : repairFullStrategy(evaluation, requiredSiblingIds?.[evaluation.strategyId] ?? [], note));

  const currentRowIds = strategyEvaluations.flatMap((evaluation) =>
    evaluation.disposition === "current" ? [evaluation.strategyId] : []);
  const currentRows = new Set(currentRowIds);
  const currentStrategyIds: HowItWinsStrategyId[] = [];
  const selected = new Set<HowItWinsStrategyId>();
  for (const strategyId of semantic.currentStrategyIds) {
    if (!currentRows.has(strategyId)) {
      note(`The current set drops ${strategyId} because its row is not current.`);
      continue;
    }
    if (selected.has(strategyId)) {
      note(`The current set keeps one copy of ${strategyId}.`);
      continue;
    }
    selected.add(strategyId);
    currentStrategyIds.push(strategyId);
  }
  for (const strategyId of currentRowIds) {
    if (selected.has(strategyId)) continue;
    selected.add(strategyId);
    currentStrategyIds.push(strategyId);
    note(`The current set adds ${strategyId} because its row is current.`);
  }

  let unusualPair = semantic.unusualPair;
  if (unusualPair) {
    const [left, right] = unusualPair.strategyIds;
    if (left === right) {
      note(`The unusual pair is dropped because both legs name ${left}.`);
      unusualPair = null;
    } else if (!selected.has(left) || !selected.has(right)) {
      note(`The unusual pair is dropped because ${selected.has(left) ? right : left} is not current.`);
      unusualPair = null;
    }
  }

  return { ...semantic, strategyEvaluations, currentStrategyIds, unusualPair };
}

const MAXIMUM_REPAIR_PASSES = 3;

// Contradictions the model can leave behind that code can settle without reading the evidence:
// a not-yet row that also claims present relevance, a current row that misses its own selection
// gate, a current set that drifted from the rows. Each fix lowers a claim or drops a reference;
// none of them invents an evidence id. One fix can open another, so the pass repeats to a fixed
// point. This runs before materialization so the body schema sees a settled verdict, which keeps
// a one-row contradiction from throwing away a judgment that already cost a dollar to produce.
export function repairSemanticJudgment(
  semantic: SemanticHowItWinsJudgment,
  options: SemanticJudgmentRepairOptions = {}
): { semantic: SemanticHowItWinsJudgment; repairs: string[] } {
  const repairs: string[] = [];
  const note = (text: string) => { repairs.push(text.slice(0, 300)); };
  let repaired = semantic;
  for (let pass = 0; pass < MAXIMUM_REPAIR_PASSES; pass += 1) {
    const before = repairs.length;
    repaired = repairSemanticPass(repaired, options.requiredSiblingIds, note);
    if (repairs.length === before) break;
  }
  return { semantic: repaired, repairs };
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
    if (isCompactSemanticStrategy(evaluation) || isLeanSemanticStrategy(evaluation)) continue;
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
    if (isLeanSemanticStrategy(evaluation)) return leanStrategyEvaluation(evaluation);
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

// The lossless projection: what materializeSemanticJudgment took in, recovered from what it put
// out. Merging an adjudication patch runs through this, so the rows nobody disputed round-trip
// back to the same records they started as.
export function semanticJudgmentFromBody(body: HowItWinsJudgmentBody): SemanticHowItWinsJudgment {
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

// What the critic and the adjudicator read. Same body, minus the parts of an open-question row
// no reader downstream uses.
export function semanticJudgmentForModel(body: HowItWinsJudgmentBody): SemanticHowItWinsJudgment {
  const semantic = semanticJudgmentFromBody(body);
  return {
    ...semantic,
    strategyEvaluations: semantic.strategyEvaluations.map((evaluation) => {
      if (evaluation.disposition !== "open_question") return evaluation;
      if (isCompactSemanticStrategy(evaluation) || isLeanSemanticStrategy(evaluation)) return evaluation;
      return {
        strategyId: evaluation.strategyId,
        disposition: evaluation.disposition,
        evidenceGate: evaluation.evidenceGate,
        mechanism: evaluation.mechanism,
        evidenceIds: evaluation.evidenceIds,
        ...(evaluation.counterevidenceIds.length > 0
          ? { counterevidenceIds: evaluation.counterevidenceIds }
          : {}),
        dimensions: evaluation.dimensions,
        dispositionReason: evaluation.dispositionReason
      };
    })
  };
}

function overrideKey(entry: SemanticHowItWinsJudgment["overrides"][number]) {
  return [entry.kind, entry.strategyId ?? "", entry.from, entry.to, entry.reason].join(" ");
}

export function mergeAdjudicationPatch(input: {
  settled: SemanticHowItWinsJudgment;
  patch: HowItWinsAdjudicationPatch;
  disputedStrategyIds: readonly HowItWinsStrategyId[];
  pairDisputed: boolean;
  betDisputed: boolean;
}): {
  semantic: SemanticHowItWinsJudgment;
  betRevision: z.infer<typeof betRevisionSchema> | null;
  notes: string[];
} {
  const notes: string[] = [];
  const note = (text: string) => { notes.push(text.slice(0, 300)); };
  const disputed = new Set(input.disputedStrategyIds);

  const replacements = new Map<HowItWinsStrategyId, SemanticStrategyEvaluation>();
  for (const row of input.patch.strategyEvaluations) {
    if (!disputed.has(row.strategyId)) {
      note(`Adjudication dropped its row for undisputed strategy ${row.strategyId}.`);
      continue;
    }
    if (replacements.has(row.strategyId)) {
      note(`Adjudication returned ${row.strategyId} more than once, so the first row stands.`);
      continue;
    }
    replacements.set(row.strategyId, row);
  }
  const strategyEvaluations = input.settled.strategyEvaluations.map(
    (row) => replacements.get(row.strategyId) ?? row
  );

  let unusualPair = input.settled.unusualPair;
  if (input.patch.unusualPair !== undefined) {
    if (input.pairDisputed) unusualPair = input.patch.unusualPair;
    else note("Adjudication kept the settled pair because no material dispute named the pair.");
  }

  const overrides = [...input.settled.overrides];
  const seen = new Set(overrides.map(overrideKey));
  for (const entry of input.patch.overrides) {
    if (seen.has(overrideKey(entry))) continue;
    seen.add(overrideKey(entry));
    overrides.push(entry);
  }

  let betRevision: z.infer<typeof betRevisionSchema> | null = null;
  if (input.patch.betRevision) {
    if (input.betDisputed) betRevision = input.patch.betRevision;
    else note("Adjudication kept the settled bets because no material dispute named a bet.");
  }

  return {
    semantic: {
      ...input.settled,
      strategyEvaluations,
      currentStrategyIds: input.patch.currentStrategyIds,
      unusualPair,
      overrides
    },
    betRevision,
    notes
  };
}

// The one ordering claim adjudication still owes: a strategy nobody disputed keeps its place
// relative to the others. A patch that shuffles them is put back in order rather than thrown out.
export function restoreUndisputedCurrentOrder(input: {
  semantic: SemanticHowItWinsJudgment;
  settledCurrentStrategyIds: readonly HowItWinsStrategyId[];
  disputedStrategyIds: readonly HowItWinsStrategyId[];
}): { semantic: SemanticHowItWinsJudgment; notes: string[] } {
  const disputed = new Set(input.disputedStrategyIds);
  const positions: number[] = [];
  const found: HowItWinsStrategyId[] = [];
  input.semantic.currentStrategyIds.forEach((strategyId, index) => {
    if (disputed.has(strategyId)) return;
    positions.push(index);
    found.push(strategyId);
  });
  const settledOrder = input.settledCurrentStrategyIds.filter(
    (strategyId) => !disputed.has(strategyId) && found.includes(strategyId)
  );
  if (settledOrder.length !== found.length) return { semantic: input.semantic, notes: [] };
  if (settledOrder.every((strategyId, index) => strategyId === found[index])) {
    return { semantic: input.semantic, notes: [] };
  }
  const currentStrategyIds = [...input.semantic.currentStrategyIds];
  positions.forEach((position, index) => { currentStrategyIds[position] = settledOrder[index]!; });
  return {
    semantic: { ...input.semantic, currentStrategyIds },
    notes: ["Adjudication reordered undisputed current strategies, so the settled order was restored."]
  };
}
