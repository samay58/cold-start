import {
  HOW_IT_WINS_STRATEGIES,
  HowItWinsJudgmentClosedError,
  adjudicationPatchSchema,
  assignMaterialBetIds,
  howItWinsJudgeCallTraceSchema,
  howItWinsJudgmentSchema,
  howItWinsStrategyIdForName,
  mergeAdjudicationPatch,
  repairSemanticJudgment,
  restoreUndisputedCurrentOrder,
  semanticJudgmentForModel,
  semanticJudgmentFromBody,
  stripUnknownNullTransportFields,
  type HowItWinsJudgeCallTrace,
  type HowItWinsJudgment,
  type HowItWinsJudgmentBody,
  type HowItWinsStrategy,
  type HowItWinsStrategyId
} from "@cold-start/core";
import type { z } from "zod";

import {
  HOW_IT_WINS_ADJUDICATION_PROMPT,
  HOW_IT_WINS_CRITIC_PROMPT,
  HOW_IT_WINS_MONOLITH_PROMPT,
  HOW_IT_WINS_SCOPED_JUDGE_ADDENDUM
} from "./how-it-wins-judge-prompts";
import {
  howItWinsCriticJudgmentPayload,
  runHowItWinsCitationCheck,
  type HowItWinsCitationCheck,
  type HowItWinsJudgeScope
} from "./how-it-wins-judge-scope";
import {
  criticOutputSchema,
  evidencePacketSchema,
  hashHowItWinsJudgeValue,
  howItWinsJudgePromptHash,
  type criticFindingSchema,
  type HowItWinsJudgeRules,
  type HowItWinsPrimaryJudgment
} from "./how-it-wins-judge-schema";
import {
  assertExactRules,
  assertExactVocabulary,
  assertFrozenEvidence,
  assertRequiredSiblingResolutions,
  betRevisionOverride,
  contractViolationMessage,
  correctionCandidate,
  materializeFromPacket,
  parseGlobalJudgment,
  refinementNote,
  validatedPrimaryJudgment,
  type DecidingQuestionLookup
} from "./how-it-wins-judge-validate";
import { isTransientLlmError } from "./transient-error";
import {
  howItWinsCorrectionFeedback,
  howItWinsOutputDiagnostics,
  type HowItWinsOutputDiagnostic
} from "./how-it-wins-output-diagnostics";

export type { HowItWinsJudgeCallTrace } from "@cold-start/core";
export { HowItWinsJudgmentClosedError as HowItWinsJudgeClosedError };
export {
  HOW_IT_WINS_JUDGE_PROMPT_HASH,
  hashHowItWinsJudgeValue,
  howItWinsJudgePromptHash,
  howItWinsJudgeToolJsonSchema,
  type HowItWinsJudgeRules,
  type HowItWinsJudgeStrategyRule,
  type HowItWinsPrimaryJudgment
} from "./how-it-wins-judge-schema";

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
  // Set only on a global judgment limited to the screen's scope.
  scoped?: boolean;
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

type HowItWinsRefinementRecord = {
  critic: "ok" | "failed" | "skipped_same_provider" | "skipped_disabled";
  adjudication: "ok" | "failed" | "not_needed";
  notes: string[];
  repairs: string[];
};
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
  // Both off unless the caller passes them; see HowItWinsJudgeScope and HowItWinsCitationCheck.
  scope?: HowItWinsJudgeScope;
  citationCheck?: HowItWinsCitationCheck;
  executeCall?: HowItWinsJudgeExecuteCall;
  onValidation?: HowItWinsJudgeValidationSink;
  onPrimaryJudgment?: HowItWinsPrimaryJudgmentSink;
  resumePrimaryJudgment?: HowItWinsPrimaryJudgment;
  signal?: AbortSignal;
  deadlineAt?: number;
};

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
    if (input.promptHash !== howItWinsJudgePromptHash(config.rules, { refinement: config.refinement, screenIdentity: config.scope?.identity })) {
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
    // A scoped call reuses missingStrategyIds, the field that always named what this call judges,
    // and adds the screen's leads. An unscoped request is byte-identical to before the screen.
    const scope = config.scope;
    const globalRequest: HowItWinsJudgeCallRequest = {
      callId: "how-it-wins:monolith",
      stage: "global_judge",
      attempt: 1,
      prompt: scope ? `${HOW_IT_WINS_MONOLITH_PROMPT}\n\n${HOW_IT_WINS_SCOPED_JUDGE_ADDENDUM}` : HOW_IT_WINS_MONOLITH_PROMPT,
      payload: {
        evidencePacket: packet,
        betMap: null,
        vocabulary: input.vocabulary,
        rules: config.rules,
        requiredSiblingIdsByStrategy: siblingMap,
        scouts: [],
        missingStrategyIds: scope ? scope.strategyIds : HOW_IT_WINS_STRATEGIES.map((strategy) => strategy.id),
        ...(scope ? { screenLeads: scope.leads } : {})
      },
      ...(scope ? { scoped: true } : {}),
      ...(config.models ? { model: config.models.strong } : {}),
      ...(config.signal ? { signal: config.signal } : {}),
      ...(config.deadlineAt !== undefined ? { deadlineAt: config.deadlineAt } : {})
    };
    // The deterministic repair pass runs first, inside parseGlobalJudgment. Whatever survives it
    // is a contradiction that needs evidence to settle, which only the model can supply.
    const acceptGlobalJudgment = (output: unknown) => {
      const accepted = parseGlobalJudgment(output, packet, decidingQuestionFor, siblingMap, scope);
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
    // deterministic repair pass already fixed above stays recorded in refinement.repairs. The
    // citation check is skipped too, since its flags only matter to adjudication.
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
        ...howItWinsCriticJudgmentPayload(semanticJudgmentForModel(globalJudgment), config.scope)
      },
      ...(config.models ? { model: config.models.critic } : {}),
      ...(config.signal ? { signal: config.signal } : {}),
      ...(config.deadlineAt !== undefined ? { deadlineAt: config.deadlineAt } : {})
    };
    // Everything past the global judgment is refinement. A failure here drops back to the global
    // judgment and records why, rather than throwing away a judgment that already cost the run.
    // The citation check reads the same global judgment and never throws, so it runs beside the
    // critic rather than after it.
    const [criticTransportCall, citation] = await Promise.all([
      invokeTransport(config.adapters.critic, criticRequest),
      runHowItWinsCitationCheck(config.citationCheck, globalJudgment)
    ]);
    refinement.notes.push(...citation.notes);
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

    // Citation flags join the critic's findings, so the one adjudication pass settles both.
    critic.findings.push(...citation.findings.map((finding, index) => ({
      findingId: `cite${index + 1}`,
      ...finding
    })));
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
          stage: finding.findingId.startsWith("cite") ? "citation_check" : "critic",
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
