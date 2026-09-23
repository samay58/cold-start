// Contract checks on a judgment body and the helpers that turn model output into one. A failure
// here throws HowItWinsJudgmentClosedError, which is what lets the one paid re-ask fire.
import {
  HOW_IT_WINS_STRATEGIES,
  HowItWinsJudgmentClosedError,
  assignMaterialBetIds,
  globalJudgmentTransportSchema,
  materializeSemanticJudgment,
  repairSemanticJudgment,
  semanticJudgmentSchema,
  stripUnknownNullTransportFields,
  type HowItWinsJudgmentBody,
  type HowItWinsStrategy,
  type HowItWinsStrategyId
} from "@cold-start/core";
import { z } from "zod";

import { completeScopedJudgment, type HowItWinsJudgeScope } from "./how-it-wins-judge-scope";
import {
  hashHowItWinsJudgeValue,
  primaryJudgmentSchema,
  type HowItWinsJudgeRules,
  type HowItWinsPrimaryJudgment,
  type evidencePacketSchema
} from "./how-it-wins-judge-schema";

export function assertExactVocabulary(vocabulary: readonly HowItWinsStrategy[]) {
  if (vocabulary.length !== HOW_IT_WINS_STRATEGIES.length) {
    throw new HowItWinsJudgmentClosedError(`expected ${HOW_IT_WINS_STRATEGIES.length} canonical strategies`);
  }
  vocabulary.forEach((strategy, index) => {
    const canonical = HOW_IT_WINS_STRATEGIES[index];
    if (
      !canonical ||
      strategy.id !== canonical.id ||
      strategy.name !== canonical.name ||
      strategy.group !== canonical.group ||
      strategy.meaning !== canonical.meaning
    ) {
      throw new HowItWinsJudgmentClosedError(`canonical vocabulary differs at index ${index}`);
    }
  });
}

export function assertExactRules(rules: HowItWinsJudgeRules) {
  if (!rules.standard.trim() || !rules.actualBetStandard.trim()) {
    throw new HowItWinsJudgmentClosedError("authoritative judgment rules are missing");
  }
  if (rules.strategyRubric.length !== HOW_IT_WINS_STRATEGIES.length) {
    throw new HowItWinsJudgmentClosedError("strategy rubric is incomplete");
  }
  rules.strategyRubric.forEach((row, index) => {
    const strategy = HOW_IT_WINS_STRATEGIES[index];
    if (!strategy || row.strategyId !== strategy.id || row.name !== strategy.name || row.canonicalMeaning !== strategy.meaning) {
      throw new HowItWinsJudgmentClosedError(`strategy rubric differs at index ${index}`);
    }
  });
}

export function assertFrozenEvidence(body: HowItWinsJudgmentBody, packet: z.infer<typeof evidencePacketSchema>) {
  if (body.evidenceCutoff !== packet.cutoff) {
    throw new HowItWinsJudgmentClosedError("the judgment changed the evidence cutoff");
  }
  if (hashHowItWinsJudgeValue(body.evidenceRegistry) !== hashHowItWinsJudgeValue(packet.evidence)) {
    throw new HowItWinsJudgmentClosedError("the judgment changed the frozen evidence registry");
  }
}

export function assertRequiredSiblingResolutions(
  body: HowItWinsJudgmentBody,
  siblingMap: Partial<Record<HowItWinsStrategyId, readonly HowItWinsStrategyId[]>>
) {
  for (const evaluation of body.strategyEvaluations) {
    // Only a current strategy owes a discriminating reason against its siblings: that is the
    // standard's current gate. A compact row has no mechanism to distinguish, and an open
    // question or not-yet row is by definition not yet claiming the label.
    if (evaluation.mechanism === null || evaluation.disposition !== "current") continue;
    const required = siblingMap[evaluation.strategyId] ?? [];
    const resolved = new Set(evaluation.siblingResolutions.map((entry) => entry.strategyId));
    for (const siblingId of required) {
      if (!resolved.has(siblingId)) {
        throw new HowItWinsJudgmentClosedError(
          `${evaluation.strategyId} needs a discriminating reason against ${siblingId}`
        );
      }
    }
  }
}

// A body-schema rejection is a contract violation like any assert, and its raw zod message is a
// page of JSON. Both readers of this want the failing path and reason, nothing else.
export function contractViolationMessage(error: unknown) {
  if (error instanceof z.ZodError) {
    return error.issues.map((issue) => `${issue.path.join(".") || "root"}: ${issue.message}`).join("; ");
  }
  return error instanceof Error ? error.message : String(error);
}

export type DecidingQuestionLookup = (strategyId: HowItWinsStrategyId) => string | undefined;

export function materializeFromPacket(
  semantic: z.infer<typeof semanticJudgmentSchema>,
  materialBets: HowItWinsJudgmentBody["materialBets"],
  packet: z.infer<typeof evidencePacketSchema>,
  decidingQuestionFor: DecidingQuestionLookup,
  retainedOverrides?: HowItWinsJudgmentBody["overrides"]
) {
  try {
    return materializeSemanticJudgment({
      semantic,
      materialBets,
      evidenceCutoff: packet.cutoff,
      evidenceRegistry: packet.evidence,
      decidingQuestionFor,
      ...(retainedOverrides ? { retainedOverrides } : {})
    });
  } catch (error) {
    // A body the repair pass could not settle is a contract violation, not a transport failure.
    // Naming it as one is what lets the single paid re-ask fire on a contradictory verdict.
    if (!(error instanceof z.ZodError)) throw error;
    throw new HowItWinsJudgmentClosedError(`the judgment body is contradictory: ${contractViolationMessage(error)}`);
  }
}

export function betRevisionOverride(input: {
  from: HowItWinsJudgmentBody["materialBets"];
  to: HowItWinsJudgmentBody["materialBets"];
  reason: string;
  evidenceIds: string[];
}): HowItWinsJudgmentBody["overrides"][number] {
  return {
    kind: "bet",
    betId: input.to[0]!.betId,
    from: hashHowItWinsJudgeValue(input.from),
    to: hashHowItWinsJudgeValue(input.to),
    reason: input.reason,
    evidenceIds: input.evidenceIds
  };
}

export function parseGlobalJudgment(
  output: unknown,
  packet: z.infer<typeof evidencePacketSchema>,
  decidingQuestionFor: DecidingQuestionLookup,
  requiredSiblingIds: Partial<Record<HowItWinsStrategyId, readonly HowItWinsStrategyId[]>>,
  scope?: HowItWinsJudgeScope
) {
  // The stage contract still names betRevision, which adjudication owns. A judgment that returns
  // one anyway is read and its revision dropped, rather than costing the one paid re-ask.
  const { betRevision: _betRevision, ...transport } = globalJudgmentTransportSchema.parse(
    stripUnknownNullTransportFields(output)
  );
  const parsed = scope ? completeScopedJudgment(transport, scope) : transport;
  const { semantic, repairs } = repairSemanticJudgment(parsed, { requiredSiblingIds });
  if (!semantic.materialBets) {
    throw new HowItWinsJudgmentClosedError("monolith judgment requires material bets");
  }
  const bets = assignMaterialBetIds(semantic.materialBets);
  return { body: materializeFromPacket(semantic, bets, packet, decidingQuestionFor), repairs };
}

export function refinementNote(label: string, error: unknown) {
  return `${label}: ${contractViolationMessage(error)}`.slice(0, 300);
}

const MAX_CORRECTION_CANDIDATE_BYTES = 512 * 1024;

export function correctionCandidate(candidate: unknown) {
  if (candidate === undefined) return {};
  let serialized: string;
  try {
    serialized = JSON.stringify(candidate);
  } catch {
    throw new HowItWinsJudgmentClosedError("the prior normalized output cannot be serialized for correction");
  }
  if (Buffer.byteLength(serialized, "utf8") > MAX_CORRECTION_CANDIDATE_BYTES) {
    throw new HowItWinsJudgmentClosedError("the prior normalized output exceeds the correction input limit");
  }
  return { previousNormalizedOutput: candidate };
}

export function validatedPrimaryJudgment(input: {
  checkpoint: HowItWinsPrimaryJudgment;
  expectedHashes: HowItWinsPrimaryJudgment["hashes"];
  packet: z.infer<typeof evidencePacketSchema>;
  siblingMap: Partial<Record<HowItWinsStrategyId, readonly HowItWinsStrategyId[]>>;
}) {
  let checkpoint: HowItWinsPrimaryJudgment;
  try {
    checkpoint = primaryJudgmentSchema.parse(input.checkpoint);
  } catch {
    throw new HowItWinsJudgmentClosedError("resumed primary judgment failed its stored schema");
  }
  if (hashHowItWinsJudgeValue(checkpoint.hashes) !== hashHowItWinsJudgeValue(input.expectedHashes)) {
    throw new HowItWinsJudgmentClosedError("resumed primary judgment hashes do not match this request");
  }
  const expectedCallIds = checkpoint.calls.length === 1
    ? ["how-it-wins:monolith"]
    : ["how-it-wins:monolith", "how-it-wins:monolith:2"];
  checkpoint.calls.forEach((call, index) => {
    if (
      call.stage !== "global_judge" ||
      call.callId !== expectedCallIds[index] ||
      call.retryCount < index ||
      (index < checkpoint.calls.length - 1 && call.validationOutcome === "ok")
    ) {
      throw new HowItWinsJudgmentClosedError("resumed primary judgment has inconsistent global calls");
    }
  });
  const finalCall = checkpoint.calls[checkpoint.calls.length - 1]!;
  if (finalCall.outcome !== "ok" || finalCall.validationOutcome !== "ok") {
    throw new HowItWinsJudgmentClosedError("resumed primary judgment was not fully validated");
  }
  assertFrozenEvidence(checkpoint.body, input.packet);
  assertRequiredSiblingResolutions(checkpoint.body, input.siblingMap);
  return checkpoint;
}
