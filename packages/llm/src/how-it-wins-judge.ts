import { createHash } from "node:crypto";

import {
  HOW_IT_WINS_STRATEGIES,
  HowItWinsJudgmentClosedError,
  adjudicationPatchSchema,
  assignMaterialBetIds,
  globalJudgmentTransportSchema,
  howItWinsEvidenceItemSchema,
  howItWinsJudgeCallTraceSchema,
  howItWinsJudgmentBodySchema,
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
import {
  howItWinsCorrectionFeedback,
  howItWinsOutputDiagnostics,
  type HowItWinsOutputDiagnostic
} from "./how-it-wins-output-diagnostics";

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
  model?: string;
  signal?: AbortSignal;
  deadlineAt?: number;
};

export type HowItWinsJudgeFailureKind =
  | "structured_output"
  | "semantic_contract"
  | "transient_provider"
  | "authentication_configuration"
  | "cancellation_deadline"
  | "internal";

export type HowItWinsJudgeAdapterResult =
  | { ok: true; output: unknown; trace: HowItWinsJudgeCallTrace }
  | {
    ok: false;
    error: string;
    retryable: boolean;
    failureKind?: HowItWinsJudgeFailureKind;
    repairInstruction?: string;
    candidate?: unknown;
    diagnostics?: HowItWinsOutputDiagnostic[];
    trace: HowItWinsJudgeCallTrace;
  };

export type HowItWinsJudgeAdapter = (
  request: HowItWinsJudgeCallRequest
) => Promise<HowItWinsJudgeAdapterResult>;

export type HowItWinsJudgeTelemetrySink = (trace: HowItWinsJudgeCallTrace) => void;

export type HowItWinsJudgeExecuteCall = (
  request: HowItWinsJudgeCallRequest,
  invoke: (execution?: { signal?: AbortSignal; deadlineAt?: number }) => Promise<HowItWinsJudgeAdapterResult>
) => Promise<HowItWinsJudgeAdapterResult>;

export type HowItWinsJudgeValidationEvent = {
  request: HowItWinsJudgeCallRequest;
  trace: HowItWinsJudgeCallTrace;
  outcome: "ok" | "failed";
  failureKind?: "structured_output" | "semantic_contract";
  diagnostics: HowItWinsOutputDiagnostic[];
};

export type HowItWinsJudgeValidationSink = (
  event: HowItWinsJudgeValidationEvent
) => void | Promise<void>;

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

export type HowItWinsPrimaryJudgmentSink = (
  primary: HowItWinsPrimaryJudgment
) => void | Promise<void>;

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

export type HowItWinsJudgeConfig = {
  adapters: { strong: HowItWinsJudgeAdapter; critic: HowItWinsJudgeAdapter };
  rules: HowItWinsJudgeRules;
  siblingMap?: Partial<Record<HowItWinsStrategyId, readonly HowItWinsStrategyId[]>>;
  telemetry?: HowItWinsJudgeTelemetrySink;
  // Named at construction so a same-provider critic costs nothing. The old check compared
  // provider strings on the returned traces, after both paid calls had already run.
  providers?: { strong: string; critic: string };
  models?: { strong: string; critic: string };
  // Default true. False skips the critic and adjudication calls after the global judgment: no
  // second paid pass, no patch. The taste question those passes answer (do the trims they make
  // match what the read should say) is Samay's blind read to make, so this needs a switch that
  // costs no deploy.
  refinement?: boolean;
  executeCall?: HowItWinsJudgeExecuteCall;
  onValidation?: HowItWinsJudgeValidationSink;
  onPrimaryJudgment?: HowItWinsPrimaryJudgmentSink;
  resumePrimaryJudgment?: HowItWinsPrimaryJudgment;
  signal?: AbortSignal;
  deadlineAt?: number;
};

const MAX_CORRECTION_CANDIDATE_BYTES = 512 * 1024;

function correctionCandidate(candidate: unknown) {
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

const primaryJudgmentSchema = z.object({
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

function validatedPrimaryJudgment(input: {
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

export function createHowItWinsJudge(config: HowItWinsJudgeConfig) {
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
      config.signal?.throwIfAborted();
      if (config.deadlineAt !== undefined && Date.now() >= config.deadlineAt) {
        throw new DOMException("how-it-wins job deadline expired", "TimeoutError");
      }
      let result: HowItWinsJudgeAdapterResult;
      const invokeAdapter = (execution?: { signal?: AbortSignal; deadlineAt?: number }) => adapter({
        ...request,
        ...(execution?.signal ? { signal: execution.signal } : {}),
        ...(execution?.deadlineAt !== undefined ? { deadlineAt: execution.deadlineAt } : {})
      });
      if (config.executeCall) {
        // Durable execution owns lease, reservation, and storage errors. Preserve those typed
        // failures exactly so the worker can settle the job without treating them as model output.
        result = await config.executeCall(request, invokeAdapter);
      } else {
        try {
          result = await invokeAdapter();
        } catch (error) {
          if (isTransientLlmError(error)) throw error;
          throw new HowItWinsJudgmentClosedError(`${request.callId} threw without returning trace data`);
        }
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
    const reportValidation = async (event: HowItWinsJudgeValidationEvent) => {
      const trace = {
        ...event.trace,
        validationOutcome: event.outcome === "ok" ? "ok" as const : "failed" as const
      };
      let callIndex = calls.length - 1;
      while (callIndex >= 0 && calls[callIndex]?.callId !== event.request.callId) callIndex -= 1;
      if (callIndex >= 0) calls[callIndex] = trace;
      await config.onValidation?.({ ...event, trace });
    };
    const correctedRequest = (
      request: HowItWinsJudgeCallRequest,
      correction: string | undefined,
      callIdSuffix: string,
      candidate?: unknown
    ): HowItWinsJudgeCallRequest => ({
      ...request,
      callId: `${request.callId}:${callIdSuffix}`,
      attempt: 2,
      ...(correction && request.payload && typeof request.payload === "object" && !Array.isArray(request.payload)
        ? {
          payload: {
            ...(request.payload as Record<string, unknown>),
            retryCorrection: correction,
            ...correctionCandidate(candidate)
          }
        }
        : {})
    });
    const invokeTransport = async (
      adapter: HowItWinsJudgeAdapter,
      request: HowItWinsJudgeCallRequest
    ) => {
      const first = await invoke(adapter, request);
      if (!first.ok && first.failureKind === "structured_output" && first.trace.providerOutcome === "ok") {
        await reportValidation({
          request,
          trace: first.trace,
          outcome: "failed",
          failureKind: "structured_output",
          diagnostics: first.diagnostics ?? []
        });
      }
      if (first.ok || !first.retryable) return { result: first, request };
      const correction = correctedRequest(request, first.repairInstruction, "2", first.candidate);
      const second = await invoke(adapter, correction);
      if (!second.ok && second.failureKind === "structured_output" && second.trace.providerOutcome === "ok") {
        await reportValidation({
          request: correction,
          trace: second.trace,
          outcome: "failed",
          failureKind: "structured_output",
          diagnostics: second.diagnostics ?? []
        });
      }
      return { result: second, request: correction };
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
      },
      ...(config.models ? { model: config.models.strong } : {}),
      ...(config.signal ? { signal: config.signal } : {}),
      ...(config.deadlineAt !== undefined ? { deadlineAt: config.deadlineAt } : {})
    };
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
    const primaryHashes = {
      evidencePacket: input.evidencePacketHash,
      prompt: input.promptHash,
      vocabulary: input.vocabularyHash
    };
    let globalTraceProvider: string;
    let globalJudgment: HowItWinsJudgmentBody;
    if (config.resumePrimaryJudgment) {
      const resumed = validatedPrimaryJudgment({
        checkpoint: config.resumePrimaryJudgment,
        expectedHashes: primaryHashes,
        packet,
        siblingMap
      });
      calls.push(...resumed.calls);
      globalTraceProvider = resumed.calls[resumed.calls.length - 1]!.provider;
      globalJudgment = resumed.body;
      refinement.repairs.push(...(resumed.repairs ?? []));
    } else {
      let globalResultRequest = globalRequest;
      let globalResult = await invoke(config.adapters.strong, globalResultRequest);
      if (!globalResult.ok) {
        if (globalResult.failureKind === "structured_output" && globalResult.trace.providerOutcome === "ok") {
          await reportValidation({
            request: globalResultRequest,
            trace: globalResult.trace,
            outcome: "failed",
            failureKind: "structured_output",
            diagnostics: globalResult.diagnostics ?? []
          });
        }
        if (!globalResult.retryable) throw new HowItWinsJudgmentClosedError("global judgment failed");
        globalResultRequest = correctedRequest(
          globalRequest,
          globalResult.repairInstruction,
          "2",
          globalResult.candidate
        );
        globalResult = await invoke(config.adapters.strong, globalResultRequest);
        if (!globalResult.ok) {
          if (globalResult.failureKind === "structured_output" && globalResult.trace.providerOutcome === "ok") {
            await reportValidation({
              request: globalResultRequest,
              trace: globalResult.trace,
              outcome: "failed",
              failureKind: "structured_output",
              diagnostics: globalResult.diagnostics ?? []
            });
          }
          throw new HowItWinsJudgmentClosedError("global judgment failed");
        }
      }
      globalTraceProvider = globalResult.trace.provider;
      try {
        const accepted = acceptGlobalJudgment(globalResult.output);
        await reportValidation({
          request: globalResultRequest,
          trace: globalResult.trace,
          outcome: "ok",
          diagnostics: []
        });
        globalJudgment = accepted.body;
        refinement.repairs.push(...accepted.repairs);
      } catch (error) {
        // Exactly one re-ask, never two. A global judge call runs about a dollar and five minutes,
        // so a second repair costs more than it is worth. Anything but a contract violation, and
        // any failure on the corrected answer, still fails closed.
        const diagnostics = howItWinsOutputDiagnostics({
          stage: "global_judge",
          error,
          candidate: globalResult.output
        });
        if (!(error instanceof HowItWinsJudgmentClosedError) && diagnostics === null) throw error;
        await reportValidation({
          request: globalResultRequest,
          trace: globalResult.trace,
          outcome: "failed",
          failureKind: diagnostics ? "structured_output" : "semantic_contract",
          diagnostics: diagnostics ?? []
        });
        if (globalResultRequest.attempt >= 2) {
          throw new HowItWinsJudgmentClosedError(`corrected global judgment still failed: ${contractViolationMessage(error)}`);
        }
        const detail = diagnostics
          ? howItWinsCorrectionFeedback(diagnostics)
          : `Return one complete corrected global_judge result. The previous judgment failed a contract check: ${contractViolationMessage(error)}`;
        const repairRequest = correctedRequest(
          globalRequest,
          detail.slice(0, 4096),
          "2",
          globalResult.output
        );
        const repair = await invoke(config.adapters.strong, repairRequest);
        if (!repair.ok) throw new HowItWinsJudgmentClosedError("global judgment failed");
        globalTraceProvider = repair.trace.provider;
        let accepted: ReturnType<typeof acceptGlobalJudgment>;
        try {
          accepted = acceptGlobalJudgment(repair.output);
          await reportValidation({
            request: repairRequest,
            trace: repair.trace,
            outcome: "ok",
            diagnostics: []
          });
        } catch (repairError) {
          const repairDiagnostics = howItWinsOutputDiagnostics({
            stage: "global_judge",
            error: repairError,
            candidate: repair.output
          });
          if (!(repairError instanceof HowItWinsJudgmentClosedError) && repairDiagnostics === null) throw repairError;
          await reportValidation({
            request: repairRequest,
            trace: repair.trace,
            outcome: "failed",
            failureKind: repairDiagnostics ? "structured_output" : "semantic_contract",
            diagnostics: repairDiagnostics ?? []
          });
          throw new HowItWinsJudgmentClosedError(
            `corrected global judgment still failed: ${contractViolationMessage(repairError)}`
          );
        }
        globalJudgment = accepted.body;
        refinement.repairs.push(...accepted.repairs);
        refinement.notes.push(refinementNote("global judgment repaired after", error));
      }
      await config.onPrimaryJudgment?.({
        schemaVersion: 1,
        hashes: primaryHashes,
        body: structuredClone(globalJudgment),
        calls: structuredClone(calls),
        repairs: [...refinement.repairs]
      });
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
      },
      ...(config.models ? { model: config.models.critic } : {}),
      ...(config.signal ? { signal: config.signal } : {}),
      ...(config.deadlineAt !== undefined ? { deadlineAt: config.deadlineAt } : {})
    };
    // Everything past the global judgment is refinement. A failure here drops back to the global
    // judgment and records why, rather than throwing away a judgment that already cost the run.
    const criticTransportCall = await invokeTransport(config.adapters.critic, criticRequest);
    const criticResult = criticTransportCall.result;
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
        await reportValidation({
          request: criticTransportCall.request,
          trace: criticResult.trace,
          outcome: "failed",
          failureKind: "structured_output",
          diagnostics: howItWinsOutputDiagnostics({
            stage: "critic",
            error: criticTransport.error,
            candidate: criticResult.output
          }) ?? []
        });
        refinement.critic = "failed";
        refinement.notes.push(refinementNote("critic output rejected", criticTransport.error));
      } else {
        await reportValidation({
          request: criticTransportCall.request,
          trace: criticResult.trace,
          outcome: "ok",
          diagnostics: []
        });
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
        },
        ...(config.models ? { model: config.models.strong } : {}),
        ...(config.signal ? { signal: config.signal } : {}),
        ...(config.deadlineAt !== undefined ? { deadlineAt: config.deadlineAt } : {})
      };
      const adjudicationTransportCall = await invokeTransport(config.adapters.strong, adjudicationRequest);
      const adjudicationResult = adjudicationTransportCall.result;
      if (!adjudicationResult.ok) {
        refinement.adjudication = "failed";
        refinement.notes.push(refinementNote("adjudication call failed", adjudicationResult.error));
      } else {
        let adjudicationAccepted = false;
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
          adjudicationAccepted = true;
        } catch (error) {
          if (isTransientLlmError(error)) throw error;
          const diagnostics = howItWinsOutputDiagnostics({
            stage: "adjudication",
            error,
            candidate: adjudicationResult.output
          });
          await reportValidation({
            request: adjudicationTransportCall.request,
            trace: adjudicationResult.trace,
            outcome: "failed",
            failureKind: diagnostics ? "structured_output" : "semantic_contract",
            diagnostics: diagnostics ?? []
          });
          refinement.adjudication = "failed";
          refinement.notes.push(refinementNote("adjudication output rejected", error));
        }
        if (adjudicationAccepted) {
          await reportValidation({
            request: adjudicationTransportCall.request,
            trace: adjudicationResult.trace,
            outcome: "ok",
            diagnostics: []
          });
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
