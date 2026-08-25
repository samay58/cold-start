import Anthropic from "@anthropic-ai/sdk";
import type { Tool } from "@anthropic-ai/sdk/resources/messages";
import { createHash } from "node:crypto";
import {
  type GenerationLlmCallTrace,
  type HowItWinsJudgeCallTrace
} from "@cold-start/core";

import { createTracedAnthropicMessage, estimateAnthropicCostUsd, type AnthropicTelemetrySink } from "./anthropic";
import { buildLlmCallTrace } from "./call-trace";
import {
  howItWinsJudgeToolJsonSchema,
  type HowItWinsJudgeAdapter,
  type HowItWinsJudgeCallRequest
} from "./how-it-wins-judge";
import { parseModelString } from "./llm-provider";
import { isTransientLlmError } from "./transient-error";

const TOOL_NAME = "emit_how_it_wins_judgment";
const HOW_IT_WINS_BENCHMARK_TRANSPORT_VERSION = "2026-08-25.1";

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
strategyEvaluations: exactly 80 records in canonical vocabulary order. A full record is only for disposition current, not_yet, or open_question. It needs strategyId, disposition, betRefs, mechanism, evidenceGate, evidenceIds, supportingClaims, counterevidenceIds, dimensions, presentRelevance, historicalEvidenceIds, presentEvidenceIds, presentBridge, siblingCandidateIds, siblingResolutions, notYet, dispositionReason.
Every other strategy returns exactly four fields: strategyId, disposition of insufficient_evidence, rejected, or not_applicable, evidenceGate of pass, fail, or unresolved, and a dispositionReason of one clause under 20 words. Code expands its empty arrays, nulls, and not_reached dimensions. Most of the 80 are this shape. Do not spend words on them and do not repeat the same explanation.
Length limits inside a full record: mechanism under 40 words, dispositionReason under 30 words, at most three supportingClaims of under 30 words each, each siblingResolution reason under 20 words, each openQuestions field under 30 words.
betRefs are one-based positions in the supplied material-bet list. supportingClaims are inline observed_fact or reasonable_inference records. An observed fact needs text and evidenceIds. An inference also needs a short bridge. Code assigns claim IDs after validation.
dimensions needs evidenceStrength, centrality, materiality, distinctiveness, independence, explanatoryValue using the supplied categorical standard.
siblingResolutions records need strategyId, reason, evidenceIds. Code fills the deciding question from the frozen rubric, so do not write one. For every full strategy, copy every ID from requiredSiblingIdsByStrategy[strategyId] into siblingCandidateIds and resolve each one exactly once in siblingResolutions. Do not omit a required sibling because it looks weak.
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

// Character budgets for the prose the judgment spends its output on, at roughly 6.5 characters
// per word. They are hints the model sees in the tool schema, not validation: rejecting a
// five-minute judgment over a long sentence would cost more than the sentence.
const PROSE_MAX_LENGTH: Record<string, number> = {
  mechanism: 260,
  dispositionReason: 200,
  reason: 130,
  text: 200,
  bridge: 200,
  question: 200,
  whyMaterial: 200,
  evidenceNeeded: 200
};

function applyMaxLength(value: unknown, maxLength: number) {
  const object = record(value);
  if (!object) return;
  if (object.type === "string") {
    object.maxLength = maxLength;
    return;
  }
  if (Array.isArray(object.anyOf)) {
    for (const option of object.anyOf) applyMaxLength(option, maxLength);
  }
}

function hintProseLengths(value: unknown) {
  if (Array.isArray(value)) {
    for (const child of value) hintProseLengths(child);
    return;
  }
  const object = record(value);
  if (!object) return;
  const properties = record(object.properties);
  if (properties) {
    for (const [name, maxLength] of Object.entries(PROSE_MAX_LENGTH)) {
      if (Object.hasOwn(properties, name)) applyMaxLength(properties[name], maxLength);
    }
  }
  for (const child of Object.values(object)) hintProseLengths(child);
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
  hintProseLengths(schema);
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

const COMPACT_ROW_DISPOSITIONS = new Set(["insufficient_evidence", "rejected", "not_applicable"]);
const COMPACT_ROW_KEYS = new Set(["strategyId", "disposition", "evidenceGate", "dispositionReason"]);

function isEmptyPadding(value: unknown): boolean {
  return value === null
    || value === ""
    || (Array.isArray(value) && value.length === 0);
}

// A compact row is four fields. Models pad it anyway, with mechanism: null or evidenceIds: [],
// and the strict compact schema then rejects the whole 80-row judgment and buys a paid repair.
// Empty padding on a compact row carries nothing, so it goes. A padded key holding real content
// stays, and the judgment still fails loudly, because that row was not compact after all.
function trimCompactStrategyRows(value: Record<string, unknown>): Record<string, unknown> {
  const rows = value.strategyEvaluations;
  if (!Array.isArray(rows)) return value;
  return {
    ...value,
    strategyEvaluations: rows.map((row) => {
      const entry = record(row);
      if (!entry || !COMPACT_ROW_DISPOSITIONS.has(entry.disposition as string)) return row;
      return Object.fromEntries(
        Object.entries(entry).filter(([key, child]) => COMPACT_ROW_KEYS.has(key) || !isEmptyPadding(child))
      );
    })
  };
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
  const trimmed = trimCompactStrategyRows(normalized);
  const localBetRefs = localBetRefsForRequest(request);
  if (localBetRefs) assertLocalBetReferences(trimmed, localBetRefs);
  return restoreEvidenceReferences(request, trimmed);
}

type JudgeTransportTimers = {
  setTimeout: (callback: () => void, delayMs: number) => unknown;
  clearTimeout: (timer: unknown) => void;
};

const realTimers: JudgeTransportTimers = {
  setTimeout: (callback, delayMs) => setTimeout(callback, delayMs),
  clearTimeout: (timer) => clearTimeout(timer as ReturnType<typeof setTimeout>)
};

function deadline(input: {
  stage: HowItWinsJudgeCallRequest["stage"];
  timeoutMs: number;
  timers: JudgeTransportTimers;
}) {
  const controller = new AbortController();
  const timer = input.timers.setTimeout(() => {
    controller.abort(new DOMException(
      `how-it-wins ${input.stage} stage timed out after ${input.timeoutMs}ms`,
      "TimeoutError"
    ));
  }, input.timeoutMs);
  return {
    signal: controller.signal,
    clear: () => input.timers.clearTimeout(timer)
  };
}

// The OpenAI-compat path (the DeepSeek critic) takes no abort signal, so the stage deadline is
// applied by racing it. The underlying request keeps its own provider timeout; this only bounds
// how long the judge waits.
function withDeadline<T>(work: Promise<T>, signal: AbortSignal): Promise<T> {
  if (signal.aborted) return Promise.reject(signal.reason);
  return new Promise<T>((resolve, reject) => {
    const onAbort = () => reject(signal.reason);
    signal.addEventListener("abort", onAbort, { once: true });
    work.then(resolve, reject).finally(() => signal.removeEventListener("abort", onAbort));
  });
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

type JudgeTransportInput = {
  client: Anthropic;
  model: string;
  telemetry?: AnthropicTelemetrySink | undefined;
  onOutput?: (request: HowItWinsJudgeCallRequest, output: unknown) => void;
  onRawOutput?: (request: HowItWinsJudgeCallRequest, output: unknown) => void;
  timeoutMsForStage?: (stage: HowItWinsJudgeCallRequest["stage"]) => number;
  timers?: JudgeTransportTimers;
  // Production runs inside an Inngest step, which retries the whole step on a thrown transient
  // error. Set to 2 there so a second transient attempt escapes as a throw. Left unset by the
  // benchmark, which keeps every failure as a returned result.
  rethrowTransientOnAttempt?: number;
};

// The one judge transport. Anthropic models always stream: a non-streaming call with the
// global_judge and adjudication max_tokens of 50000 throws client-side inside the SDK
// ("Streaming is required for operations that may take longer than 10 minutes"), which is what
// kept production from ever producing a How it wins read. Never route Anthropic through
// messages.create here.
function createHowItWinsJudgeTransport(input: JudgeTransportInput): HowItWinsJudgeAdapter {
  return async (request) => {
    let providerTrace: GenerationLlmCallTrace | undefined;
    let rawToolOutputReceived = false;
    const callDeadline = deadline({
      stage: request.stage,
      timeoutMs: input.timeoutMsForStage?.(request.stage) ?? benchmarkTimeoutMsForStage(request.stage),
      timers: input.timers ?? realTimers
    });
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
      const emit = (trace: GenerationLlmCallTrace) => {
        providerTrace = trace;
        input.telemetry?.(trace);
      };
      const resolved = parseModelString(input.model);
      const message = resolved.provider === "anthropic"
        ? await (async () => {
          const startedAt = Date.now();
          try {
            const finalMessage = await input.client.messages
              .stream({ ...params, model: resolved.model }, { signal: callDeadline.signal })
              .finalMessage();
            const usage = {
              input_tokens: finalMessage.usage.input_tokens,
              output_tokens: finalMessage.usage.output_tokens,
              cache_creation_input_tokens: finalMessage.usage.cache_creation_input_tokens ?? 0,
              cache_read_input_tokens: finalMessage.usage.cache_read_input_tokens ?? 0
            };
            emit(buildLlmCallTrace({
              stage: "how_it_wins",
              label: request.callId,
              model: resolved.model,
              provider: "anthropic",
              status: "ok",
              durationMs: Date.now() - startedAt,
              usage,
              estimatedCostUsd: estimateAnthropicCostUsd(resolved.model, usage),
              retryCount: 0
            }));
            return finalMessage;
          } catch (error) {
            emit(buildLlmCallTrace({
              stage: "how_it_wins",
              label: request.callId,
              model: resolved.model,
              provider: "anthropic",
              status: "failed",
              durationMs: Date.now() - startedAt,
              estimatedCostUsd: 0,
              retryCount: 0,
              error
            }));
            throw error;
          }
        })()
        : await (async () => {
          const startedAt = Date.now();
          try {
            return await withDeadline(createTracedAnthropicMessage({
              client: input.client,
              label: request.callId,
              model: input.model,
              stage: "how_it_wins",
              telemetry: emit,
              params
            }), callDeadline.signal);
          } catch (error) {
            // The stage deadline can win the race before the traced call emits anything, and
            // every failure still has to come back as a result carrying a trace.
            if (!providerTrace) {
              emit(buildLlmCallTrace({
                stage: "how_it_wins",
                label: request.callId,
                model: resolved.model,
                provider: resolved.provider,
                status: "failed",
                durationMs: Date.now() - startedAt,
                estimatedCostUsd: 0,
                retryCount: 0,
                error
              }));
            }
            throw error;
          }
        })();
      const rawOutput = toolInput(message);
      rawToolOutputReceived = true;
      input.onRawOutput?.(request, rawOutput);
      const output = normalizeBenchmarkToolOutput(request, rawOutput);
      input.onOutput?.(request, output);
      return { ok: true, output, trace: mapTrace(request, providerTrace, "ok") };
    } catch (error) {
      if (
        input.rethrowTransientOnAttempt !== undefined &&
        isTransientLlmError(error) &&
        request.attempt >= input.rethrowTransientOnAttempt
      ) throw error;
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
    } finally {
      callDeadline.clear();
    }
  };
}

export function createBenchmarkModelAdapter(input: {
  client: Anthropic;
  model: string;
  telemetry?: AnthropicTelemetrySink | undefined;
  onOutput?: (request: HowItWinsJudgeCallRequest, output: unknown) => void;
  onRawOutput?: (request: HowItWinsJudgeCallRequest, output: unknown) => void;
  timeoutMsForStage?: (stage: HowItWinsJudgeCallRequest["stage"]) => number;
  timers?: JudgeTransportTimers;
}): HowItWinsJudgeAdapter {
  return createHowItWinsJudgeTransport(input);
}

export function createHowItWinsJudgeModelAdapter(input: {
  client: Anthropic;
  model: string;
  telemetry?: AnthropicTelemetrySink | undefined;
}): HowItWinsJudgeAdapter {
  return createHowItWinsJudgeTransport({ ...input, rethrowTransientOnAttempt: 2 });
}
