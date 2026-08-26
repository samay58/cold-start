import { createHash } from "node:crypto";

import {
  HOW_IT_WINS_STRATEGIES,
  HowItWinsJudgmentClosedError,
  adjudicationPatchSchema,
  assignMaterialBetIds,
  globalJudgmentTransportSchema,
  howItWinsEvidenceItemSchema,
  howItWinsJudgeCallTraceSchema,
  howItWinsJudgmentSchema,
  howItWinsStrategyIdForName,
  howItWinsStrategyIdSchema,
  materializeSemanticJudgment,
  mergeAdjudicationPatch,
  repairSemanticJudgment,
  restoreUndisputedCurrentOrder,
  semanticJudgmentForModel,
  semanticJudgmentFromBody,
  semanticJudgmentSchema,
  stripUnknownNullTransportFields,
  type HowItWinsJudgeCallTrace,
  type HowItWinsJudgment,
  type HowItWinsJudgmentBody,
  type HowItWinsStrategy,
  type HowItWinsStrategyId
} from "@cold-start/core";
import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";

import {
  HOW_IT_WINS_ADJUDICATION_PROMPT,
  HOW_IT_WINS_CRITIC_PROMPT,
  HOW_IT_WINS_MONOLITH_PROMPT,
  HOW_IT_WINS_JUDGE_PROMPTS
} from "./how-it-wins-judge-prompts";
import { isTransientLlmError } from "./transient-error";

export type { HowItWinsJudgeCallTrace } from "@cold-start/core";
export { HowItWinsJudgmentClosedError as HowItWinsJudgeClosedError };

type JsonPrimitive = string | number | boolean | null;
type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };

function canonicalJson(value: unknown): JsonValue {
  if (value === null || typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new Error("judge hash input contains a non-finite number");
    return value;
  }
  if (Array.isArray(value)) return value.map(canonicalJson);
  if (typeof value === "object") {
    const out: Record<string, JsonValue> = {};
    for (const key of Object.keys(value as Record<string, unknown>).sort()) {
      const item = (value as Record<string, unknown>)[key];
      if (item !== undefined) out[key] = canonicalJson(item);
    }
    return out;
  }
  throw new Error(`judge hash input contains unsupported type: ${typeof value}`);
}

export function hashHowItWinsJudgeValue(value: unknown) {
  return createHash("sha256").update(JSON.stringify(canonicalJson(value))).digest("hex");
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
// createHowItWinsJudge's own default.
export function howItWinsJudgePromptHash(rules: HowItWinsJudgeRules, options?: { refinement: boolean | undefined }) {
  return hashHowItWinsJudgeValue({ prompts: HOW_IT_WINS_JUDGE_PROMPTS, rules, refinement: options?.refinement ?? true });
}

const evidencePacketSchema = z.object({
  cutoff: z.string().datetime(),
  evidence: z.array(howItWinsEvidenceItemSchema).min(1),
  context: z.unknown()
});

const criticFindingSchema = z.object({
  kind: z.enum(["bet", "strategy", "pair", "not_yet", "evidence"]),
  material: z.boolean(),
  summary: z.string().min(1),
  strategyIds: z.array(howItWinsStrategyIdSchema),
  evidenceIds: z.array(z.string().min(1))
}).strict();

const criticOutputSchema = z.object({ findings: z.array(criticFindingSchema) }).strict();

function modelFacingJudgmentSchema() {
  return semanticJudgmentSchema.extend({
    strategyEvaluations: semanticJudgmentSchema.shape.strategyEvaluations.min(80).max(80)
  });
}

function howItWinsJudgeStageSchema(stage: HowItWinsJudgeCallTrace["stage"]) {
  switch (stage) {
    case "critic":
      return criticOutputSchema;
    case "global_judge":
      return modelFacingJudgmentSchema().required({ materialBets: true });
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

export function howItWinsJudgeToolJsonSchema(stage: HowItWinsJudgeCallTrace["stage"]) {
  const { $schema: _schema, ...json } = zodToJsonSchema(howItWinsJudgeStageSchema(stage), {
    $refStrategy: "none",
    target: "jsonSchema7"
  });
  return jsonSchema202012(json);
}

const settledCrossGroupSiblings: Partial<Record<HowItWinsStrategyId, readonly HowItWinsStrategyId[]>> = {
  usership: ["reliability"],
  reliability: ["usership"]
};

export type HowItWinsJudgeCallRequest = {
  callId: string;
  stage: HowItWinsJudgeCallTrace["stage"];
  attempt: number;
  prompt: string;
  payload: unknown;
};

export type HowItWinsJudgeAdapterResult =
  | { ok: true; output: unknown; trace: HowItWinsJudgeCallTrace }
  | {
    ok: false;
    error: string;
    retryable: boolean;
    repairInstruction?: string;
    trace: HowItWinsJudgeCallTrace;
  };

export type HowItWinsJudgeAdapter = (
  request: HowItWinsJudgeCallRequest
) => Promise<HowItWinsJudgeAdapterResult>;

export type HowItWinsJudgeTelemetrySink = (trace: HowItWinsJudgeCallTrace) => void;

export type HowItWinsJudgeInput = {
  evidencePacket: z.infer<typeof evidencePacketSchema>;
  evidencePacketHash: string;
  vocabulary: readonly HowItWinsStrategy[];
  vocabularyHash: string;
  promptHash: string;
};

function assertExactVocabulary(vocabulary: readonly HowItWinsStrategy[]) {
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

function assertExactRules(rules: HowItWinsJudgeRules) {
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

function assertFrozenEvidence(body: HowItWinsJudgmentBody, packet: z.infer<typeof evidencePacketSchema>) {
  if (body.evidenceCutoff !== packet.cutoff) {
    throw new HowItWinsJudgmentClosedError("the judgment changed the evidence cutoff");
  }
  if (hashHowItWinsJudgeValue(body.evidenceRegistry) !== hashHowItWinsJudgeValue(packet.evidence)) {
    throw new HowItWinsJudgmentClosedError("the judgment changed the frozen evidence registry");
  }
}

function assertRequiredSiblingResolutions(
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
function contractViolationMessage(error: unknown) {
  if (error instanceof z.ZodError) {
    return error.issues.map((issue) => `${issue.path.join(".") || "root"}: ${issue.message}`).join("; ");
  }
  return error instanceof Error ? error.message : String(error);
}

type DecidingQuestionLookup = (strategyId: HowItWinsStrategyId) => string | undefined;

function materializeFromPacket(
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

function betRevisionOverride(input: {
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

function parseGlobalJudgment(
  output: unknown,
  packet: z.infer<typeof evidencePacketSchema>,
  decidingQuestionFor: DecidingQuestionLookup,
  requiredSiblingIds: Partial<Record<HowItWinsStrategyId, readonly HowItWinsStrategyId[]>>
) {
  // The stage contract still names betRevision, which adjudication owns. A judgment that returns
  // one anyway is read and its revision dropped, rather than costing the one paid re-ask.
  const { betRevision: _betRevision, ...parsed } = globalJudgmentTransportSchema.parse(
    stripUnknownNullTransportFields(output)
  );
  const { semantic, repairs } = repairSemanticJudgment(parsed, { requiredSiblingIds });
  if (!semantic.materialBets) {
    throw new HowItWinsJudgmentClosedError("monolith judgment requires material bets");
  }
  const bets = assignMaterialBetIds(semantic.materialBets);
  return { body: materializeFromPacket(semantic, bets, packet, decidingQuestionFor), repairs };
}

type HowItWinsRefinementRecord = {
  critic: "ok" | "failed" | "skipped_same_provider" | "skipped_disabled";
  adjudication: "ok" | "failed" | "not_needed";
  notes: string[];
  repairs: string[];
};

function refinementNote(label: string, error: unknown) {
  return `${label}: ${contractViolationMessage(error)}`.slice(0, 300);
}

export function createHowItWinsJudge(config: {
  adapters: { strong: HowItWinsJudgeAdapter; critic: HowItWinsJudgeAdapter };
  rules: HowItWinsJudgeRules;
  siblingMap?: Partial<Record<HowItWinsStrategyId, readonly HowItWinsStrategyId[]>>;
  telemetry?: HowItWinsJudgeTelemetrySink;
  // Named at construction so a same-provider critic costs nothing. The old check compared
  // provider strings on the returned traces, after both paid calls had already run.
  providers?: { strong: string; critic: string };
  // Default true. False skips the critic and adjudication calls after the global judgment: no
  // second paid pass, no patch. The taste question those passes answer (do the trims they make
  // match what the read should say) is Samay's blind read to make, so this needs a switch that
  // costs no deploy.
  refinement?: boolean;
}) {
  assertExactRules(config.rules);
  if (config.providers && config.providers.strong === config.providers.critic) {
    throw new HowItWinsJudgmentClosedError("critic must use a different provider from the global judge");
  }
  const rubricById = new Map(config.rules.strategyRubric.map((row) => [row.strategyId, row]));
  const decidingQuestionFor: DecidingQuestionLookup = (strategyId) =>
    rubricById.get(strategyId)?.decidingQuestion;
  const siblingMap = Object.fromEntries(HOW_IT_WINS_STRATEGIES.map((strategy) => {
    const rubricSiblings = (rubricById.get(strategy.id)?.nearestSiblings ?? [])
      .map(howItWinsStrategyIdForName)
      .filter((id): id is HowItWinsStrategyId => id !== null);
    return [strategy.id, Array.from(new Set([
      ...rubricSiblings,
      ...(settledCrossGroupSiblings[strategy.id] ?? []),
      ...(config.siblingMap?.[strategy.id] ?? [])
    ]))];
  })) as Partial<Record<HowItWinsStrategyId, readonly HowItWinsStrategyId[]>>;

  return async function judge(input: HowItWinsJudgeInput): Promise<HowItWinsJudgment> {
    const packet = evidencePacketSchema.parse(input.evidencePacket);
    assertExactVocabulary(input.vocabulary);
    if (hashHowItWinsJudgeValue(packet) !== input.evidencePacketHash) {
      throw new HowItWinsJudgmentClosedError("evidence packet hash mismatch");
    }
    if (hashHowItWinsJudgeValue(input.vocabulary) !== input.vocabularyHash) {
      throw new HowItWinsJudgmentClosedError("vocabulary hash mismatch");
    }
    if (input.promptHash !== howItWinsJudgePromptHash(config.rules, { refinement: config.refinement })) {
      throw new HowItWinsJudgmentClosedError("prompt hash mismatch");
    }

    const calls: HowItWinsJudgeCallTrace[] = [];
    const invoke = async (adapter: HowItWinsJudgeAdapter, request: HowItWinsJudgeCallRequest) => {
      let result: HowItWinsJudgeAdapterResult;
      try {
        result = await adapter(request);
      } catch (error) {
        if (isTransientLlmError(error)) throw error;
        throw new HowItWinsJudgmentClosedError(`${request.callId} threw without returning trace data`);
      }
      const trace = howItWinsJudgeCallTraceSchema.parse(result.trace);
      if (
        trace.callId !== request.callId ||
        trace.stage !== request.stage ||
        trace.retryCount < request.attempt - 1 ||
        (result.ok && trace.outcome !== "ok") ||
        (!result.ok && trace.outcome !== "failed")
      ) {
        throw new HowItWinsJudgmentClosedError(`${request.callId} returned inconsistent trace data`);
      }
      calls.push(trace);
      config.telemetry?.(trace);
      return result;
    };
    const correctedRequest = (
      request: HowItWinsJudgeCallRequest,
      correction: string | undefined,
      callIdSuffix: string
    ): HowItWinsJudgeCallRequest => ({
      ...request,
      callId: `${request.callId}:${callIdSuffix}`,
      attempt: 2,
      ...(correction && request.payload && typeof request.payload === "object" && !Array.isArray(request.payload)
        ? {
          payload: {
            ...(request.payload as Record<string, unknown>),
            retryCorrection: correction
          }
        }
        : {})
    });
    const invokeTransport = async (
      adapter: HowItWinsJudgeAdapter,
      request: HowItWinsJudgeCallRequest
    ) => {
      const first = await invoke(adapter, request);
      if (first.ok || !first.retryable) return first;
      return invoke(adapter, correctedRequest(request, first.repairInstruction, "2"));
    };

    // betMap, scouts, and missingStrategyIds are what the retired multi-stage topology fed this
    // call. The one call left always saw them at these three values, so they stay as written
    // rather than change what a production judge reads.
    const globalRequest: HowItWinsJudgeCallRequest = {
      callId: "how-it-wins:monolith",
      stage: "global_judge",
      attempt: 1,
      prompt: HOW_IT_WINS_MONOLITH_PROMPT,
      payload: {
        evidencePacket: packet,
        betMap: null,
        vocabulary: input.vocabulary,
        rules: config.rules,
        requiredSiblingIdsByStrategy: siblingMap,
        scouts: [],
        missingStrategyIds: HOW_IT_WINS_STRATEGIES.map((strategy) => strategy.id)
      }
    };
    const globalResult = await invokeTransport(config.adapters.strong, globalRequest);
    if (!globalResult.ok) throw new HowItWinsJudgmentClosedError("global judgment failed");
    // The deterministic repair pass runs first, inside parseGlobalJudgment. Whatever survives it
    // is a contradiction that needs evidence to settle, which only the model can supply.
    const acceptGlobalJudgment = (output: unknown) => {
      const accepted = parseGlobalJudgment(output, packet, decidingQuestionFor, siblingMap);
      assertFrozenEvidence(accepted.body, packet);
      assertRequiredSiblingResolutions(accepted.body, siblingMap);
      return accepted;
    };

    const refinement: HowItWinsRefinementRecord = {
      critic: "ok",
      adjudication: "not_needed",
      notes: [],
      repairs: []
    };
    let globalTraceProvider = globalResult.trace.provider;
    let globalJudgment: HowItWinsJudgmentBody;
    try {
      const accepted = acceptGlobalJudgment(globalResult.output);
      globalJudgment = accepted.body;
      refinement.repairs.push(...accepted.repairs);
    } catch (error) {
      // Exactly one re-ask, never two. A global judge call runs about a dollar and five minutes,
      // so a second repair costs more than it is worth. Anything but a contract violation, and
      // any failure on the corrected answer, still fails closed.
      if (!(error instanceof HowItWinsJudgmentClosedError)) throw error;
      const detail = contractViolationMessage(error);
      const repair = await invoke(config.adapters.strong, correctedRequest(
        globalRequest,
        `Return one complete corrected global_judge result. The previous judgment failed a contract check: ${detail}`.slice(0, 500),
        "repair"
      ));
      if (!repair.ok) throw new HowItWinsJudgmentClosedError("global judgment failed");
      globalTraceProvider = repair.trace.provider;
      const accepted = acceptGlobalJudgment(repair.output);
      globalJudgment = accepted.body;
      refinement.repairs.push(...accepted.repairs);
      refinement.notes.push(refinementNote("global judgment repaired after", error));
    }

    // No critic call, no adjudication call: the global judgment is the answer. Whatever the
    // deterministic repair pass already fixed above stays recorded in refinement.repairs.
    if (config.refinement === false) {
      refinement.critic = "skipped_disabled";
      refinement.adjudication = "not_needed";
      return howItWinsJudgmentSchema.parse({
        version: 1,
        hashes: {
          evidencePacket: input.evidencePacketHash,
          prompt: input.promptHash,
          vocabulary: input.vocabularyHash
        },
        ...globalJudgment,
        refinement,
        calls
      });
    }

    const criticRequest: HowItWinsJudgeCallRequest = {
      callId: "how-it-wins:critic",
      stage: "critic",
      attempt: 1,
      prompt: HOW_IT_WINS_CRITIC_PROMPT,
      payload: {
        evidencePacket: packet,
        vocabulary: input.vocabulary,
        rules: config.rules,
        judgment: semanticJudgmentForModel(globalJudgment)
      }
    };
    // Everything past the global judgment is refinement. A failure here drops back to the global
    // judgment and records why, rather than throwing away a judgment that already cost the run.
    const criticResult = await invokeTransport(config.adapters.critic, criticRequest);
    let critic: { findings: Array<{ findingId: string } & z.infer<typeof criticFindingSchema>> } = { findings: [] };
    if (!criticResult.ok) {
      refinement.critic = "failed";
      refinement.notes.push(refinementNote("critic call failed", criticResult.error));
    } else if (globalTraceProvider === criticResult.trace.provider) {
      refinement.critic = "skipped_same_provider";
      refinement.notes.push(`critic ran on the same provider as the global judge: ${criticResult.trace.provider}`.slice(0, 300));
    } else {
      const criticTransport = criticOutputSchema.safeParse(stripUnknownNullTransportFields(criticResult.output));
      if (!criticTransport.success) {
        refinement.critic = "failed";
        refinement.notes.push(refinementNote("critic output rejected", criticTransport.error));
      } else {
        critic = {
          findings: criticTransport.data.findings.map((finding, index) => ({
            findingId: `f${index + 1}`,
            ...finding
          }))
        };
      }
    }

    const materialFindings = critic.findings.filter((finding) => finding.material);
    let finalBody = globalJudgment;
    if (materialFindings.length > 0) {
      const disputedStrategyIds = Array.from(new Set(materialFindings.flatMap((finding) => finding.strategyIds)));
      const settled = semanticJudgmentFromBody(globalJudgment);
      const adjudicationRequest: HowItWinsJudgeCallRequest = {
        callId: "how-it-wins:adjudication",
        stage: "adjudication",
        attempt: 1,
        prompt: HOW_IT_WINS_ADJUDICATION_PROMPT,
        payload: {
          evidencePacket: packet,
          vocabulary: input.vocabulary,
          rules: config.rules,
          requiredSiblingIdsByStrategy: siblingMap,
          judgment: semanticJudgmentForModel(globalJudgment),
          disputes: materialFindings,
          disputedStrategyIds
        }
      };
      const adjudicationResult = await invokeTransport(config.adapters.strong, adjudicationRequest);
      if (!adjudicationResult.ok) {
        refinement.adjudication = "failed";
        refinement.notes.push(refinementNote("adjudication call failed", adjudicationResult.error));
      } else {
        try {
          const patch = adjudicationPatchSchema.parse(
            stripUnknownNullTransportFields(adjudicationResult.output)
          );
          const merged = mergeAdjudicationPatch({
            settled,
            patch,
            disputedStrategyIds,
            pairDisputed: materialFindings.some((finding) => finding.kind === "pair"),
            betDisputed: materialFindings.some((finding) => finding.kind === "bet")
          });
          const repaired = repairSemanticJudgment(merged.semantic, { requiredSiblingIds: siblingMap });
          const ordered = restoreUndisputedCurrentOrder({
            semantic: repaired.semantic,
            settledCurrentStrategyIds: globalJudgment.currentStrategyIds,
            disputedStrategyIds
          });
          const revisedBets = merged.betRevision
            ? assignMaterialBetIds(merged.betRevision.materialBets)
            : null;
          const adjudicated = materializeFromPacket(
            ordered.semantic,
            revisedBets ?? structuredClone(globalJudgment.materialBets),
            packet,
            decidingQuestionFor,
            [
              ...globalJudgment.overrides.filter((entry) => entry.kind === "bet"),
              ...(revisedBets && merged.betRevision
                ? [betRevisionOverride({
                  from: globalJudgment.materialBets,
                  to: revisedBets,
                  reason: merged.betRevision.reason,
                  evidenceIds: merged.betRevision.evidenceIds
                })]
                : [])
            ]
          );
          assertFrozenEvidence(adjudicated, packet);
          assertRequiredSiblingResolutions(adjudicated, siblingMap);
          finalBody = adjudicated;
          refinement.adjudication = "ok";
          refinement.repairs.push(...repaired.repairs);
          refinement.notes.push(...merged.notes, ...ordered.notes);
        } catch (error) {
          if (isTransientLlmError(error)) throw error;
          refinement.adjudication = "failed";
          refinement.notes.push(refinementNote("adjudication output rejected", error));
        }
      }
    }

    const existingDisagreements = new Set(finalBody.disagreements.map((entry) => entry.disagreementId));
    finalBody = {
      ...finalBody,
      disagreements: [
        ...finalBody.disagreements,
        ...critic.findings.flatMap((finding) => existingDisagreements.has(finding.findingId) ? [] : [{
          disagreementId: finding.findingId,
          stage: "critic",
          summary: finding.summary,
          material: finding.material,
          strategyIds: finding.strategyIds,
          evidenceIds: finding.evidenceIds
        }])
      ]
    };

    return howItWinsJudgmentSchema.parse({
      version: 1,
      hashes: {
        evidencePacket: input.evidencePacketHash,
        prompt: input.promptHash,
        vocabulary: input.vocabularyHash
      },
      ...finalBody,
      refinement,
      calls
    });
  };
}
