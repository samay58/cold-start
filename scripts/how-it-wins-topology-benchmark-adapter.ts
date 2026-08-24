import Anthropic from "@anthropic-ai/sdk";
import type { Tool } from "@anthropic-ai/sdk/resources/messages";
import { createHash } from "node:crypto";
import {
  type GenerationLlmCallTrace,
  type HowItWinsJudgeCallTrace
} from "@cold-start/core";
import {
  createTracedAnthropicMessage,
  estimateAnthropicCostUsd,
  howItWinsJudgeToolJsonSchema,
  isTransientLlmError,
  parseModelString,
  type HowItWinsJudgeAdapter,
  type HowItWinsJudgeCallRequest
} from "@cold-start/llm";

const TOOL_NAME = "emit_how_it_wins_judgment";
const HOW_IT_WINS_BENCHMARK_TRANSPORT_VERSION = "2026-08-23.10";

const STAGE_TIMEOUT_MS: Record<HowItWinsJudgeCallRequest["stage"], number> = {
  bet_map: 120_000,
  group_scout: 120_000,
  global_judge: 360_000,
  critic: 180_000,
  adjudication: 360_000
};

const STAGE_RESERVATION_USD: Record<HowItWinsJudgeCallRequest["stage"], number> = {
  bet_map: 0.5,
  group_scout: 0.03,
  global_judge: 2.25,
  critic: 0.25,
  adjudication: 2.25
};

export function benchmarkTimeoutMsForStage(stage: HowItWinsJudgeCallRequest["stage"]) {
  return STAGE_TIMEOUT_MS[stage];
}

export function benchmarkStageReservationUsd(stage: HowItWinsJudgeCallRequest["stage"]) {
  return STAGE_RESERVATION_USD[stage];
}

const judgmentContract = `The judgment object is a compact semantic transport. Code assigns durable bet, claim, question, disagreement, and override identifiers. Do not create or return those identifiers. Do not repeat evidenceCutoff or evidenceRegistry because code injects the frozen packet exactly.
strategyEvaluations: exactly 80 records in canonical vocabulary order. Each supported or disputed record needs strategyId, disposition, betRefs, mechanism, evidenceGate, evidenceIds, supportingClaims, counterevidenceIds, dimensions, presentRelevance, historicalEvidenceIds, presentEvidenceIds, presentBridge, siblingCandidateIds, siblingResolutions, notYet, dispositionReason.
betRefs are one-based positions in the supplied material-bet list. supportingClaims are inline observed_fact or reasonable_inference records. An observed fact needs text and evidenceIds. An inference also needs a short bridge. Code assigns claim IDs after validation.
dimensions needs evidenceStrength, centrality, materiality, distinctiveness, independence, explanatoryValue using the supplied categorical standard. Fields after a failed evidence gate may use not_reached.
For an evidence-failed strategy, return only strategyId, disposition, evidenceGate, and a short dispositionReason. Code expands its empty arrays, nulls, and not_reached dimensions. Do not write repetitive explanations.
siblingResolutions records need strategyId, decidingQuestion, reason, evidenceIds. For every full strategy, copy every ID from requiredSiblingIdsByStrategy[strategyId] into siblingCandidateIds and resolve each one exactly once in siblingResolutions. Do not omit a required sibling because it looks weak.
notYet is null unless disposition is not_yet. A not-yet record needs precursorEvidenceIds, causalPath, missingCondition, promotionEvidence, horizonMonths from 12 through 24.
currentStrategyIds: every current strategy, ordered mainly by centrality, with no cap.
unusualPair: null or one record with strategyIds, referenceClass, normalChoice, excludedAlternative, acceptedCost, interaction, copyingDifficulty, evidenceIds.
openQuestions: records with question, whyMaterial, evidenceNeeded, affectedStrategyIds, evidenceIds.
overallWrongCondition: condition and evidenceIds.
disagreements: records with stage, summary, material, strategyIds, evidenceIds.
overrides: strategy or pair records with kind, optional strategyId, from, to, reason, evidenceIds. Bet revisions use the separate betRevision field.
Every evidence-reference field must use the short supplied handles such as ev_001. Code maps each handle back to its frozen evidence ID exactly. Keep reasons short and specific.`;

const stageContracts: Record<HowItWinsJudgeCallRequest["stage"], string> = {
  bet_map: `Return materialBets only. Each record needs statement, scope, supportingEvidenceIds, and scopeReasons. Code assigns stable bet IDs.`,
  group_scout: `Return scopeId exactly as supplied. Return one evaluation per supplied strategy, in supplied order. Each evaluation needs strategyId, recommendation, mechanism, evidenceIds, siblingCandidateIds, siblingResolutions, and reason. Return betChallenges. Sibling resolutions need strategyId, decidingQuestion, reason, and evidenceIds.`,
  global_judge: `${judgmentContract}\nReturn the judgment fields directly as tool parameters. Do not wrap or stringify them inside a judgment field. A monolith request has no frozen betMap, so include materialBets. A multi-stage request supplies a frozen betMap owned by code, so omit materialBets. Only when the frozen map is wrong, return betRevision with replacement materialBets, a specific reason, and supporting evidenceIds. Code records the directly evaluated strategy IDs after validating that all 80 rows are present.`,
  critic: `Return findings. Each finding needs kind, material, summary, strategyIds, and evidenceIds. Code assigns finding IDs. kind is bet, strategy, pair, not_yet, or evidence. Return an empty findings array when no material or nonmaterial error is found.`,
  adjudication: `${judgmentContract}\nReturn the judgment fields directly as tool parameters, including materialBets. Do not wrap or stringify them inside a judgment field. Keep undisputed parts byte-for-byte equivalent in meaning and structure.`
};

function requestEvidenceIds(request: HowItWinsJudgeCallRequest) {
  const payload = record(request.payload);
  const packet = record(payload?.evidencePacket);
  const evidence = Array.isArray(packet?.evidence) ? packet.evidence : [];
  const ids = evidence.flatMap((entry) => {
    const item = record(entry);
    return typeof item?.evidenceId === "string" && item.evidenceId.length > 0
      ? [item.evidenceId]
      : [];
  });
  if (ids.length === 0 || ids.length !== evidence.length || new Set(ids).size !== ids.length) {
    throw new Error(`${request.stage} request needs a unique frozen evidence registry`);
  }
  return ids;
}

function evidenceHandlesForRequest(request: HowItWinsJudgeCallRequest) {
  const evidenceIds = requestEvidenceIds(request);
  const pairs = evidenceIds.map((evidenceId, index) => ({
    evidenceId,
    handle: `ev_${String(index + 1).padStart(3, "0")}`
  }));
  return {
    handles: pairs.map((pair) => pair.handle),
    evidenceIdToHandle: new Map(pairs.map((pair) => [pair.evidenceId, pair.handle])),
    handleToEvidenceId: new Map(pairs.map((pair) => [pair.handle, pair.evidenceId]))
  };
}

function mapEvidenceReferences(
  value: unknown,
  mapValue: (value: string, path: string) => string,
  path = "payload"
): unknown {
  if (Array.isArray(value)) {
    return value.map((child, index) => mapEvidenceReferences(child, mapValue, `${path}[${index}]`));
  }
  const object = record(value);
  if (!object) return value;
  return Object.fromEntries(Object.entries(object).map(([key, child]) => {
    const childPath = `${path}.${key}`;
    if (key === "evidenceId") {
      if (typeof child !== "string") throw new Error(`${childPath} must be an evidence reference`);
      return [key, mapValue(child, childPath)];
    }
    if (/evidenceIds$/i.test(key)) {
      if (!Array.isArray(child)) throw new Error(`${childPath} must be an evidence-reference array`);
      return [key, child.map((item, index) => {
        if (typeof item !== "string") throw new Error(`${childPath}[${index}] must be an evidence reference`);
        return mapValue(item, `${childPath}[${index}]`);
      })];
    }
    return [key, mapEvidenceReferences(child, mapValue, childPath)];
  }));
}

export function benchmarkProviderPayloadForRequest(request: HowItWinsJudgeCallRequest) {
  const aliases = evidenceHandlesForRequest(request);
  return mapEvidenceReferences(structuredClone(request.payload), (evidenceId, path) => {
    const handle = aliases.evidenceIdToHandle.get(evidenceId);
    if (!handle) throw new Error(`${path} references an unknown frozen evidence id`);
    return handle;
  });
}

function restoreEvidenceReferences(request: HowItWinsJudgeCallRequest, output: Record<string, unknown>) {
  const aliases = evidenceHandlesForRequest(request);
  return mapEvidenceReferences(output, (handle, path) => {
    const evidenceId = aliases.handleToEvidenceId.get(handle);
    if (!evidenceId) throw new Error(`${path} contains unknown evidence handle: ${handle}`);
    return evidenceId;
  }) as Record<string, unknown>;
}

function restrictEvidenceReferences(value: unknown, ids: readonly string[]) {
  if (!value || typeof value !== "object") return;
  const object = value as Record<string, unknown>;
  for (const [key, child] of Object.entries(object)) {
    if (/evidenceIds$/i.test(key)) {
      const field = record(child);
      if (!field || field.type !== "array") throw new Error(`invalid evidence array schema at ${key}`);
      field.items = { type: "string", enum: [...ids] };
      continue;
    }
    restrictEvidenceReferences(child, ids);
  }
}

function localBetRefsForRequest(request: HowItWinsJudgeCallRequest) {
  if (!isMultiStageGlobal(request)) return null;
  const payload = record(request.payload);
  const betMap = record(payload?.betMap);
  const materialBets = Array.isArray(betMap?.materialBets) ? betMap.materialBets : [];
  const refs = materialBets.flatMap((value) => {
    const bet = record(value);
    return Number.isInteger(bet?.betRef) && Number(bet?.betRef) > 0 ? [Number(bet?.betRef)] : [];
  });
  if (refs.length !== materialBets.length || new Set(refs).size !== refs.length) {
    throw new Error("multi-stage global request needs unique local bet references");
  }
  return refs;
}

function restrictLocalBetReferences(value: unknown, refs: readonly number[]) {
  if (!value || typeof value !== "object") return;
  const object = value as Record<string, unknown>;
  for (const [key, child] of Object.entries(object)) {
    if (key === "betRefs") {
      const field = record(child);
      if (!field || field.type !== "array") throw new Error("invalid local bet-reference schema");
      const items = record(field.items);
      field.items = { ...(items ?? { type: "integer" }), enum: [...refs] };
      continue;
    }
    restrictLocalBetReferences(child, refs);
  }
}

function assertLocalBetReferences(value: unknown, refs: readonly number[], path = "output") {
  if (Array.isArray(value)) {
    value.forEach((child, index) => assertLocalBetReferences(child, refs, `${path}[${index}]`));
    return;
  }
  const object = record(value);
  if (!object) return;
  for (const [key, child] of Object.entries(object)) {
    const childPath = `${path}.${key}`;
    if (key === "betRefs") {
      if (!Array.isArray(child)) throw new Error(`${childPath} must be a local bet-reference array`);
      for (const ref of child) {
        if (typeof ref !== "number" || !refs.includes(ref)) {
          throw new Error(`${childPath} contains unknown local bet reference ${String(ref)}`);
        }
      }
      continue;
    }
    assertLocalBetReferences(child, refs, childPath);
  }
}

function isMultiStageGlobal(request: HowItWinsJudgeCallRequest) {
  return request.stage === "global_judge" && record(request.payload)?.betMap != null;
}

export function benchmarkToolSchemaForRequest(request: HowItWinsJudgeCallRequest) {
  const schema = structuredClone(howItWinsJudgeToolJsonSchema(request.stage, {
    multiStage: isMultiStageGlobal(request)
  })) as Record<string, unknown>;
  restrictEvidenceReferences(schema, evidenceHandlesForRequest(request).handles);
  const localBetRefs = localBetRefsForRequest(request);
  if (localBetRefs) restrictLocalBetReferences(schema, localBetRefs);
  return schema;
}

function toolFor(request: HowItWinsJudgeCallRequest): Tool {
  return {
    name: TOOL_NAME,
    description: "Return the required structured judgment-stage output.",
    input_schema: benchmarkToolSchemaForRequest(request)
  } as Tool;
}

export function benchmarkTransportHash() {
  const fixturePacket = {
    cutoff: "2000-01-01T00:00:00.000Z",
    evidence: [{ evidenceId: "__evidence_id__" }]
  };
  const schemaRequest = (
    stage: HowItWinsJudgeCallRequest["stage"],
    betMap?: unknown
  ): HowItWinsJudgeCallRequest => ({
    callId: `transport:${stage}`,
    stage,
    attempt: 1,
    prompt: "transport contract",
    payload: {
      evidencePacket: fixturePacket,
      ...(stage === "global_judge" ? { betMap: betMap ?? null } : {})
    }
  });
  return createHash("sha256").update(JSON.stringify({
    version: HOW_IT_WINS_BENCHMARK_TRANSPORT_VERSION,
    stageSchemas: {
      betMap: benchmarkToolSchemaForRequest(schemaRequest("bet_map")),
      groupScout: benchmarkToolSchemaForRequest(schemaRequest("group_scout")),
      monolith: benchmarkToolSchemaForRequest(schemaRequest("global_judge")),
      multiStageGlobal: benchmarkToolSchemaForRequest(schemaRequest("global_judge", { materialBets: [] })),
      critic: benchmarkToolSchemaForRequest(schemaRequest("critic")),
      adjudication: benchmarkToolSchemaForRequest(schemaRequest("adjudication"))
    },
    stageContracts,
    stageTimeoutMs: STAGE_TIMEOUT_MS,
    stageReservationUsd: STAGE_RESERVATION_USD
  })).digest("hex");
}

function toolInput(message: { content: Array<{ type: string; name?: string; input?: unknown }> }) {
  const block = message.content.find((item) => item.type === "tool_use" && item.name === TOOL_NAME);
  if (!block || block.input === undefined) throw new Error(`No ${TOOL_NAME} tool use returned`);
  return block.input;
}

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function unwrapOneJsonObject(value: unknown, label: string) {
  if (typeof value !== "string") {
    const object = record(value);
    if (!object) throw new Error(`${label} must be a JSON object`);
    return object;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(value) as unknown;
  } catch {
    throw new Error(`${label} must be a JSON object`);
  }
  const object = record(parsed);
  if (!object) throw new Error(`${label} may contain only one JSON string layer`);
  return object;
}

function removeExactParameterPrefix(value: unknown, fieldName: string) {
  if (typeof value !== "string") return value;
  const prefix = `<parameter name="${fieldName}">`;
  const withoutLeadingWhitespace = value.trimStart();
  return withoutLeadingWhitespace.startsWith(prefix)
    ? withoutLeadingWhitespace.slice(prefix.length)
    : value;
}

function combinedStructuredSchema(schema: unknown, value: unknown): Record<string, unknown> | null {
  const direct = record(schema);
  if (!direct) return null;
  const options = Array.isArray(direct.anyOf)
    ? direct.anyOf.map(record).filter((option): option is Record<string, unknown> => option !== null)
    : [direct];
  if (value === null) return options.find((option) => option.type === "null") ?? null;
  const objects = options.filter((option) => option.type === "object");
  if (objects.length > 0) {
    return {
      ...objects[0],
      properties: Object.assign({}, ...objects.map((option) => record(option.properties) ?? {}))
    };
  }
  return options.find((option) => option.type === "array") ?? direct;
}

function normalizeStructuredTransport(
  value: unknown,
  schema: unknown,
  fieldName: string,
  label: string
): unknown {
  const structuredSchema = combinedStructuredSchema(schema, value);
  if (!structuredSchema || value === null) return value;
  if (structuredSchema.type === "array") {
    const items = unwrapUnambiguousArray(
      removeExactParameterPrefix(value, fieldName),
      label
    );
    return items.map((item, index) => normalizeStructuredTransport(
      item,
      structuredSchema.items,
      fieldName,
      `${label}[${index}]`
    ));
  }
  if (structuredSchema.type !== "object") return value;
  const object = unwrapOneJsonObject(
    removeExactParameterPrefix(value, fieldName),
    label
  );
  const properties = record(structuredSchema.properties) ?? {};
  return Object.fromEntries(Object.entries(object).map(([key, child]) => [
    key,
    Object.hasOwn(properties, key)
      ? normalizeStructuredTransport(child, properties[key], key, `${label}.${key}`)
      : child
  ]));
}

function unwrapUnambiguousArray(
  value: unknown,
  label: string,
  state: { jsonLayers: number; objectLayers: number } = { jsonLayers: 0, objectLayers: 0 }
): unknown[] {
  if (Array.isArray(value)) return value;
  if (typeof value === "string") {
    if (state.jsonLayers >= 1) {
      try {
        JSON.parse(value);
      } catch {
        throw new Error(`${label} must be a JSON array`);
      }
      throw new Error(`${label} may contain only one JSON string layer`);
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(value) as unknown;
    } catch {
      throw new Error(`${label} must be a JSON array`);
    }
    return unwrapUnambiguousArray(parsed, label, { ...state, jsonLayers: state.jsonLayers + 1 });
  }
  const object = record(value);
  if (!object || state.objectLayers >= 2) throw new Error(`${label} must be a JSON array`);
  const entries = Object.entries(object);
  if (entries.length !== 1) throw new Error(`${label} must be a JSON array`);
  return unwrapUnambiguousArray(entries[0]![1], label, {
    ...state,
    objectLayers: state.objectLayers + 1
  });
}

function materialBetsFromToolOutput(raw: unknown) {
  let value = raw;
  let jsonLayers = 0;
  if (typeof value === "string") {
    try {
      value = JSON.parse(value) as unknown;
      jsonLayers = 1;
    } catch {
      throw new Error("bet_map tool result must contain one JSON object or array");
    }
    if (typeof value === "string") {
      throw new Error("bet_map tool result may contain only one JSON string layer");
    }
  }
  if (Array.isArray(value)) return value;
  const output = record(value);
  if (!output) throw new Error("bet_map tool result must contain one JSON object or array");
  if (Object.hasOwn(output, "materialBets")) {
    return unwrapUnambiguousArray(
      removeExactParameterPrefix(output.materialBets, "materialBets"),
      "bet_map materialBets",
      {
      jsonLayers,
      objectLayers: 0
      }
    );
  }
  const entries = Object.entries(output);
  if (entries.length !== 1) throw new Error("bet_map tool result needs materialBets");
  return unwrapUnambiguousArray(entries[0]![1], "bet_map materialBets", {
    jsonLayers,
    objectLayers: 0
  });
}

export function normalizeBenchmarkToolOutput(request: HowItWinsJudgeCallRequest, raw: unknown) {
  const toolSchema = benchmarkToolSchemaForRequest(request);
  if (request.stage === "bet_map") {
    const normalized = normalizeStructuredTransport({
      materialBets: materialBetsFromToolOutput(raw)
    }, toolSchema, "bet_map", "bet_map tool result");
    return restoreEvidenceReferences(request, normalized as Record<string, unknown>);
  }
  const normalized = normalizeStructuredTransport(
    unwrapOneJsonObject(raw, `${request.stage} tool result`),
    toolSchema,
    request.stage,
    `${request.stage} tool result`
  ) as Record<string, unknown>;
  if (request.stage === "critic" && !Object.hasOwn(normalized, "findings")) {
    throw new Error("critic tool result needs findings");
  }
  if (request.stage === "group_scout") {
    if (!Object.hasOwn(normalized, "evaluations") || !Object.hasOwn(normalized, "betChallenges")) {
      throw new Error("group_scout tool result needs evaluations and betChallenges");
    }
    normalized.scopeId = request.groupId ?? request.bundleId;
  }
  if (
    (request.stage === "global_judge" || request.stage === "adjudication")
    && !Object.hasOwn(normalized, "strategyEvaluations")
  ) {
    throw new Error(`${request.stage} tool result needs strategyEvaluations`);
  }
  const localBetRefs = localBetRefsForRequest(request);
  if (localBetRefs) assertLocalBetReferences(normalized, localBetRefs);
  return restoreEvidenceReferences(request, normalized);
}

type BenchmarkTimers = {
  setTimeout: (callback: () => void, delayMs: number) => unknown;
  clearTimeout: (timer: unknown) => void;
};

function deadline(input: { timeoutMs: number; timers: BenchmarkTimers }) {
  const controller = new AbortController();
  const timer = input.timers.setTimeout(() => {
    controller.abort(new DOMException(`benchmark stage timed out after ${input.timeoutMs}ms`, "TimeoutError"));
  }, input.timeoutMs);
  return {
    signal: controller.signal,
    clear: () => input.timers.clearTimeout(timer)
  };
}

function mapTrace(
  request: HowItWinsJudgeCallRequest,
  trace: GenerationLlmCallTrace | undefined,
  outcome: "ok" | "failed",
  error?: unknown
): HowItWinsJudgeCallTrace {
  if (!trace) throw new Error(`${request.callId} returned no provider trace`);
  return {
    callId: request.callId,
    stage: request.stage,
    ...(request.groupId ? { groupId: request.groupId } : {}),
    ...(request.bundleId ? { bundleId: request.bundleId } : {}),
    provider: trace.provider ?? "anthropic",
    model: trace.model,
    inputTokens: trace.inputTokens ?? 0,
    outputTokens: trace.outputTokens ?? 0,
    cacheCreationInputTokens: trace.cacheCreationInputTokens ?? 0,
    cacheReadInputTokens: trace.cacheReadInputTokens ?? 0,
    actualCostUsd: null,
    estimatedCostUsd: trace.estimatedCostUsd ?? 0,
    latencyMs: trace.durationMs,
    retryCount: request.attempt - 1 + (trace.retryCount ?? 0),
    thinkingState: "disabled",
    outcome,
    ...(outcome === "failed" ? { error: error instanceof Error ? error.message.slice(0, 300) : String(error).slice(0, 300) } : {})
  };
}

export function createBenchmarkModelAdapter(input: {
  client: Anthropic;
  model: string;
  onOutput?: (request: HowItWinsJudgeCallRequest, output: unknown) => void;
  onRawOutput?: (request: HowItWinsJudgeCallRequest, output: unknown) => void;
  timeoutMsForStage?: (stage: HowItWinsJudgeCallRequest["stage"]) => number;
  timers?: BenchmarkTimers;
}): HowItWinsJudgeAdapter {
  return async (request) => {
    let providerTrace: GenerationLlmCallTrace | undefined;
    let rawToolOutputReceived = false;
    try {
      const maxTokens = request.stage === "global_judge" || request.stage === "adjudication" ? 50_000 : 12_000;
      const params = {
        model: input.model,
        max_tokens: maxTokens,
        ...(input.model.includes("opus-5") ? {} : { temperature: 0 }),
        system: `${request.prompt}\n\n${stageContracts[request.stage]}`,
        tool_choice: { type: "tool" as const, name: TOOL_NAME },
        tools: [toolFor(request)],
        messages: [{ role: "user" as const, content: JSON.stringify(benchmarkProviderPayloadForRequest(request)) }]
      };
      const resolved = parseModelString(input.model);
      const message = resolved.provider === "anthropic"
        ? await (async () => {
          const startedAt = Date.now();
          const callDeadline = deadline({
            timeoutMs: input.timeoutMsForStage?.(request.stage) ?? benchmarkTimeoutMsForStage(request.stage),
            timers: input.timers ?? {
              setTimeout: (callback, delayMs) => setTimeout(callback, delayMs),
              clearTimeout: (timer) => clearTimeout(timer as ReturnType<typeof setTimeout>)
            }
          });
          try {
            const finalMessage = await input.client.messages
              .stream({ ...params, model: resolved.model }, { signal: callDeadline.signal })
              .finalMessage();
            providerTrace = {
              stage: "how_it_wins",
              label: request.callId,
              model: resolved.model,
              provider: "anthropic",
              status: "ok",
              durationMs: Date.now() - startedAt,
              inputTokens: finalMessage.usage.input_tokens,
              outputTokens: finalMessage.usage.output_tokens,
              cacheCreationInputTokens: finalMessage.usage.cache_creation_input_tokens ?? 0,
              cacheReadInputTokens: finalMessage.usage.cache_read_input_tokens ?? 0,
              estimatedCostUsd: estimateAnthropicCostUsd(resolved.model, finalMessage.usage),
              retryCount: 0
            };
            return finalMessage;
          } catch (error) {
            providerTrace = {
              stage: "how_it_wins",
              label: request.callId,
              model: resolved.model,
              provider: "anthropic",
              status: "failed",
              durationMs: Date.now() - startedAt,
              estimatedCostUsd: 0,
              retryCount: 0,
              error: error instanceof Error ? error.message.slice(0, 300) : String(error).slice(0, 300)
            };
            throw error;
          } finally {
            callDeadline.clear();
          }
        })()
        : await createTracedAnthropicMessage({
          client: input.client,
          label: request.callId,
          model: input.model,
          stage: "how_it_wins",
          telemetry: (trace) => { providerTrace = trace; },
          params
        });
      const rawOutput = toolInput(message);
      rawToolOutputReceived = true;
      input.onRawOutput?.(request, rawOutput);
      const output = normalizeBenchmarkToolOutput(request, rawOutput);
      input.onOutput?.(request, output);
      return { ok: true, output, trace: mapTrace(request, providerTrace, "ok") };
    } catch (error) {
      return {
        ok: false,
        error: error instanceof Error ? error.message : String(error),
        retryable: isTransientLlmError(error) || rawToolOutputReceived,
        ...(rawToolOutputReceived
          ? {
            repairInstruction: `Return one complete corrected ${request.stage} result. Previous structured output failed validation: ${error instanceof Error ? error.message : String(error)}`.slice(0, 500)
          }
          : {}),
        trace: mapTrace(request, providerTrace, "failed", error)
      };
    }
  };
}
