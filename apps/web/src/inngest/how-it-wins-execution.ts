import Anthropic from "@anthropic-ai/sdk";
import {
  type HowItWinsJobReasonCode, type HowItWinsJobStage,
  type GenerationLlmCallTrace, type HowItWinsJudgeCallTrace
} from "@cold-start/core";
import {
  claimHowItWinsJobLease, findHowItWinsJobById, findHowItWinsRecoveryPayloadReference,
  readHowItWinsRecoveryPayload, reserveHowItWinsCall, settleHowItWinsCall,
  storeHowItWinsRecoveryPayload, annotateHowItWinsCallValidation,
  type ColdStartDb, type HowItWinsCallAttempt, type StoredHowItWinsJob
} from "@cold-start/db";
import {
  hashHowItWinsJudgeValue, OpenAiCompatHttpError, HowItWinsWriterOutputError, HowItWinsEmptyTextError, isSupportedZodError,
  type HowItWinsJudgeExecuteCall, type HowItWinsJudgeValidationSink,
  type HowItWinsJudgeAdapterResult, type HowItWinsMessageExecutor,
  howItWinsJudgeProviderRequest
} from "@cold-start/llm";
import type { GenerationStepTools } from "./client";
import { HowItWinsExecutionError, howItWinsCallReservation, howItWinsRequestDeadline } from "./how-it-wins-budget";

type Metadata = Partial<HowItWinsCallAttempt>;
type StoredResponse<T> = { candidate: T; metadata: Metadata; cost: number | null };

export function howItWinsFailureReason(error: unknown): HowItWinsJobReasonCode {
  if (error instanceof HowItWinsExecutionError) return error.reasonCode;
  if (error instanceof HowItWinsWriterOutputError || error instanceof HowItWinsEmptyTextError || isSupportedZodError(error) || error instanceof SyntaxError) return "structured_output";
  if (error instanceof Anthropic.APIUserAbortError ||
      (error instanceof DOMException && (error.name === "AbortError" || error.name === "TimeoutError"))) return "deadline_expired";
  if (error instanceof Anthropic.APIError || error instanceof OpenAiCompatHttpError) {
    if (error.status === undefined || error.status === 429 || error.status >= 500) return "transient_provider";
    return "authentication_configuration";
  }
  return "internal_storage";
}

function traceMetadata(trace: HowItWinsJudgeCallTrace | GenerationLlmCallTrace): Metadata {
  const judge = "callId" in trace ? trace as HowItWinsJudgeCallTrace : null;
  const general = !judge ? trace as GenerationLlmCallTrace : null;
  const actual = judge?.actualCostUsd;
  const estimate = trace.estimatedCostUsd;
  return {
    requestedModel: trace.model,
    ...(judge?.responseModel ?? general?.responseModel ? { returnedModel: judge?.responseModel ?? general?.responseModel } : {}),
    ...(judge?.servingProvider ?? general?.servingProvider ? { servingProvider: judge?.servingProvider ?? general?.servingProvider } : {}),
    ...(judge?.responseId ?? general?.responseId ? { responseId: judge?.responseId ?? general?.responseId } : {}),
    durationMs: judge?.latencyMs ?? general?.durationMs ?? null,
    retryCount: trace.retryCount ?? 0,
    usage: {
      inputTokens: trace.inputTokens ?? null, outputTokens: trace.outputTokens ?? null,
      cacheCreationInputTokens: judge?.cacheCreationInputTokens ?? general?.cacheCreationInputTokens ?? null,
      cacheReadInputTokens: judge?.cacheReadInputTokens ?? general?.cacheReadInputTokens ?? null
    },
    ...(actual === undefined || actual === null ? {} : { providerReportedCostMicrodollars: Math.ceil(actual * 1_000_000) }),
    ...(estimate === undefined || estimate === null ? {} : { estimateMicrodollars: Math.ceil(estimate * 1_000_000) }),
    httpOutcome: judge ? (judge.providerOutcome === "ok" ? "succeeded" : judge.providerOutcome === "failed" ? "failed" : "unknown") : general?.status === "ok" ? "succeeded" : "failed",
    validationOutcome: "not_run"
  };
}

function settledCost(metadata: Metadata) {
  if (metadata.providerReportedCostMicrodollars !== undefined && metadata.providerReportedCostMicrodollars !== null) return metadata.providerReportedCostMicrodollars;
  if (metadata.usage?.inputTokens === null || metadata.usage?.outputTokens === null || !metadata.usage) return null;
  return metadata.estimateMicrodollars ?? null;
}

export function createHowItWinsExecution(input: {
  db: ColdStartDb; job: StoredHowItWinsJob; runId: string; step: GenerationStepTools;
  judgeModel: string; editorModel: string;
}) {
  const { db, job, runId, step } = input;
  const inputHashes = new Map<string, string>();
  let failureReason: HowItWinsJobReasonCode | undefined;
  let lastTrace: GenerationLlmCallTrace | undefined;
  const telemetry = (trace: GenerationLlmCallTrace) => { lastTrace = trace; };

  const lease = async (stage: HowItWinsJobStage) => {
    const held = await claimHowItWinsJobLease(db, { jobId: job.id, owner: runId, inngestRunId: runId, stage, leaseSeconds: 285 });
    if (!held) throw new HowItWinsExecutionError("lease_lost");
    return held;
  };

  const paid = async <T>(request: {
    callId: string; model: string; stage: HowItWinsJobStage; payload: unknown; maxTokens: number;
  }, invoke: (options: { signal: AbortSignal; timeout: number; maxRetries: number; deadlineAt: number }) => Promise<StoredResponse<T>>): Promise<T> => {
    const inputHash = hashHowItWinsJudgeValue({ model: request.model, input: request.payload, evidence: job.evidenceHash });
    inputHashes.set(request.callId, inputHash);
    const reference = await step.run(`hiw-v2-call:${request.callId}`, async () => {
      let held = await lease(request.stage);
      const persisted = await findHowItWinsRecoveryPayloadReference(db, { jobId: job.id, logicalCallId: request.callId, evidenceHash: job.evidenceHash });
      if (persisted) return { contentHash: persisted.contentHash };
      const reservation = await reserveHowItWinsCall(db, {
        jobId: job.id, lease: held, logicalCallId: request.callId, inputHash, stage: request.stage,
        reservedMicrodollars: howItWinsCallReservation({ model: request.model, input: request.payload, maxOutputTokens: request.maxTokens }),
        metadata: { requestedModel: request.model, httpOutcome: "unknown", validationOutcome: "not_run" }
      });
      if (reservation.lease) held = reservation.lease;
      if (reservation.state === "budget_exhausted") return { reason: "budget_exhausted" as const };
      if (reservation.state === "lease_lost") return { reason: "lease_lost" as const };
      if (reservation.state === "existing") {
        if (reservation.attempt?.status === "reserved") {
          await settleHowItWinsCall(db, { jobId: job.id, lease: held, logicalCallId: request.callId,
            status: "unknown", actualMicrodollars: null, metadata: { httpOutcome: "unknown", requestedModel: request.model } });
        }
        return { reason: "internal_storage" as const };
      }
      if (reservation.state !== "reserved") return { reason: "semantic_contract" as const };
      let controller: AbortController | undefined;
      let timer: ReturnType<typeof setTimeout> | undefined;
      let heartbeat: ReturnType<typeof setInterval> | undefined;
      lastTrace = undefined;
      try {
        const deadline = howItWinsRequestDeadline(job.deadlineAt);
        controller = new AbortController();
        const activeController = controller;
        timer = setTimeout(() => activeController.abort(new DOMException("Request deadline expired", "TimeoutError")), deadline.timeout);
        // Cancellation and supersession invalidate the lease. Abort the actual provider call.
        heartbeat = setInterval(() => {
          void findHowItWinsJobById(db, job.id).then(current => {
            if (!current || current.status !== "running" || current.leaseOwner !== runId || current.version !== held.version) {
              activeController.abort(new DOMException("Job stopped", "AbortError"));
            }
          }).catch(() => activeController.abort(new DOMException("Job status unavailable", "AbortError")));
        }, 5000);
        const response = await invoke({ signal: controller.signal, timeout: deadline.timeout, maxRetries: 0, deadlineAt: deadline.deadlineAt });
        controller.signal.throwIfAborted();
        const saved = await storeHowItWinsRecoveryPayload(db, { jobId: job.id, lease: held,
          logicalCallId: request.callId, evidenceHash: job.evidenceHash, normalizedCandidate: response });
        if (!saved) return { reason: "lease_lost" as const };
        held = saved.lease;
        const settled = await settleHowItWinsCall(db, { jobId: job.id, lease: held, logicalCallId: request.callId,
          status: response.metadata.httpOutcome === "succeeded" ? "completed" : "failed",
          actualMicrodollars: response.cost, metadata: response.metadata });
        if (settled.state === "lease_lost") return { reason: "lease_lost" as const };
        return { contentHash: saved.contentHash };
      } catch (error) {
        const reason = howItWinsFailureReason(error);
        const metadata = { ...(lastTrace ? traceMetadata(lastTrace) : { httpOutcome: "unknown" as const }), requestedModel: request.model };
        await settleHowItWinsCall(db, { jobId: job.id, lease: held, logicalCallId: request.callId,
          status: "failed", actualMicrodollars: settledCost(metadata), metadata });
        return { reason };
      } finally {
        if (timer) clearTimeout(timer);
        if (heartbeat) clearInterval(heartbeat);
        controller?.abort();
      }
    });
    if ("reason" in reference) throw new HowItWinsExecutionError(reference.reason);
    if (!reference.contentHash) throw new HowItWinsExecutionError("internal_storage");
    const saved = await readHowItWinsRecoveryPayload(db, { jobId: job.id, logicalCallId: request.callId,
      contentHash: reference.contentHash, evidenceHash: job.evidenceHash }) as StoredResponse<T> | null;
    if (!saved) throw new HowItWinsExecutionError("internal_storage");
    // Also settle a response saved just before a worker crash. No provider request repeats.
    const current = await findHowItWinsJobById(db, job.id);
    if (current?.attempts.find(attempt => attempt.logicalCallId === request.callId)?.status === "reserved") {
      const held = await lease(request.stage);
      await settleHowItWinsCall(db, { jobId: job.id, lease: held, logicalCallId: request.callId,
        status: saved.metadata.httpOutcome === "succeeded" ? "completed" : "failed",
        actualMicrodollars: saved.cost, metadata: saved.metadata });
    }
    return saved.candidate;
  };

  const executeCall: HowItWinsJudgeExecuteCall = async (request, invoke) => {
    const model = request.stage === "critic" ? input.editorModel : input.judgeModel;
    const stage = request.stage === "global_judge" ? (request.attempt === 1 ? "judge_initial" : "judge_recovery") : request.stage;
    return paid<HowItWinsJudgeAdapterResult>({ callId: request.callId, model, stage,
      payload: howItWinsJudgeProviderRequest(request), maxTokens: request.stage === "global_judge" ? 50_000 : 12_000 }, async options => {
      const result = await invoke(options);
      if (!result.ok) failureReason = result.failureKind === "cancellation_deadline" ? "deadline_expired" : result.failureKind === "internal" ? "internal_storage" : result.failureKind;
      const metadata = { ...traceMetadata(result.trace), requestedModel: model };
      if (!result.ok && result.failureKind === "structured_output") {
        metadata.validationOutcome = "invalid";
        metadata.validationIssues = result.diagnostics?.map(issue => ({
          stage: request.stage, code: issue.code, path: issue.path,
          ...(issue.expected ? { expected: issue.expected } : {}),
          ...(issue.actualType ? { actualType: issue.actualType } : {}),
          ...(issue.strategyId ? { strategyId: issue.strategyId } : {})
        })) ?? [];
      }
      const safeTrace = { ...result.trace, error: undefined };
      const candidate: HowItWinsJudgeAdapterResult = result.ok ? { ...result, trace: safeTrace } : {
        ...result, error: result.failureKind ?? "internal", trace: safeTrace
      };
      return { candidate, metadata, cost: settledCost(metadata) };
    });
  };

  const onValidation: HowItWinsJudgeValidationSink = async validation => {
    failureReason = validation.failureKind;
    const inputHash = inputHashes.get(validation.request.callId);
    if (!inputHash) throw new HowItWinsExecutionError("internal_storage");
    await annotateHowItWinsCallValidation(db, { jobId: job.id, logicalCallId: validation.request.callId, inputHash,
      validationOutcome: validation.outcome === "ok" ? "valid" : "invalid",
      validationIssues: validation.diagnostics?.map(issue => ({
        stage: validation.request.stage, code: issue.code, path: issue.path,
        ...(issue.expected ? { expected: issue.expected } : {}),
        ...(issue.actualType ? { actualType: issue.actualType } : {}),
        ...(issue.strategyId ? { strategyId: issue.strategyId } : {})
      })) ?? [] });
  };

  const executeMessage: HowItWinsMessageExecutor = (request, invoke) => paid({
    callId: request.callId, model: request.model, stage: request.callId.startsWith("writer:") ? "writer" : "verifier",
    payload: request.params, maxTokens: request.params.max_tokens
  }, async options => {
    const message = await invoke(options);
    const metadata = { ...(lastTrace ? traceMetadata(lastTrace) : { httpOutcome: "succeeded" as const }), requestedModel: request.model };
    return {
      candidate: { ...message, content: message.content.filter(block => block.type === "text") },
      metadata, cost: settledCost(metadata)
    };
  });

  return { executeCall, executeMessage, onValidation, telemetry, lease, failureReason: () => failureReason };
}
