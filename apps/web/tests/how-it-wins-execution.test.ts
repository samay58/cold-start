import { beforeEach, describe, expect, it, vi } from "vitest";

import type {
  HowItWinsJudgeAdapterResult,
  HowItWinsJudgeCallRequest
} from "@cold-start/llm";
import { OpenAiCompatHttpError } from "@cold-start/llm";

const mocks = vi.hoisted(() => ({
  annotateHowItWinsCallValidation: vi.fn(),
  claimHowItWinsJobLease: vi.fn(),
  findHowItWinsJobById: vi.fn(),
  findHowItWinsRecoveryPayloadReference: vi.fn(),
  readHowItWinsRecoveryPayload: vi.fn(),
  reserveHowItWinsCall: vi.fn(),
  settleHowItWinsCall: vi.fn(),
  storeHowItWinsRecoveryPayload: vi.fn()
}));

vi.mock("@cold-start/db", async (importOriginal) => ({
  ...await importOriginal<typeof import("@cold-start/db")>(),
  ...mocks
}));

import { createHowItWinsExecution } from "../src/inngest/how-it-wins-execution";
import { HowItWinsExecutionError } from "../src/inngest/how-it-wins-budget";

const initialLease = {
  id: "00000000-0000-4000-8000-000000000001",
  owner: "run-1",
  version: 2,
  expiresAt: new Date("2026-09-14T20:05:00.000Z")
};

const storedLease = { ...initialLease, version: 3 };

const job = {
  id: initialLease.id,
  rootJobId: initialLease.id,
  retryOfJobId: null,
  sourceAnalysisRunId: "00000000-0000-4000-8000-000000000002",
  slug: "fixture",
  evidenceHash: "evidence-hash",
  evaluatorSignature: "evaluator-signature",
  executionContractVersion: 2,
  inngestEventId: "event-1",
  inngestRunId: "run-1",
  dispatchAttempts: 1,
  dispatchLastAttemptAt: null,
  dispatchConfirmedAt: null,
  status: "running" as const,
  stage: "judge_initial" as const,
  reasonCode: null,
  outcome: null,
  judgmentId: null,
  retryEligible: false,
  manualRetryUsed: false,
  configuredCapMicrodollars: 5_000_000,
  reservedMicrodollars: 0,
  settledMicrodollars: 0,
  attempts: [] as Array<{ logicalCallId: string; status: string }>,
  leaseOwner: "run-1",
  leaseExpiresAt: initialLease.expiresAt,
  version: initialLease.version,
  deadlineAt: new Date(Date.now() + 300_000),
  startedAt: new Date(),
  completedAt: null,
  createdAt: new Date(),
  updatedAt: new Date()
};

function request(attempt = 1): HowItWinsJudgeCallRequest {
  return {
    callId: `how-it-wins:monolith:${attempt}`,
    stage: "global_judge",
    attempt,
    model: "claude-opus-5",
    prompt: "Judge the supplied evidence.",
    payload: {
      evidencePacket: {
        evidence: [{ evidenceId: "e1", text: "Evidence", source: "Source" }]
      }
    }
  };
}

function successfulResult(input: HowItWinsJudgeCallRequest): HowItWinsJudgeAdapterResult {
  return {
    ok: true,
    output: { strategyEvaluations: [] },
    trace: {
      callId: input.callId,
      stage: input.stage,
      provider: "anthropic",
      model: "claude-opus-5",
      responseId: "msg_1",
      responseModel: "claude-opus-5-20260901",
      servingProvider: "anthropic",
      providerOutcome: "ok",
      validationOutcome: "not_run",
      latencyMs: 100,
      retryCount: 0,
      thinkingState: "unknown",
      outcome: "ok"
    }
  };
}

function harness(options: { replayReference?: { contentHash: string } } = {}) {
  const savedByHash = new Map<string, unknown>();
  const stepResults = new Map<string, unknown>();
  const step = {
    run: vi.fn(async (name: string, fn: () => Promise<unknown>) => {
      if (options.replayReference) return options.replayReference;
      if (stepResults.has(name)) return stepResults.get(name);
      const result = await fn();
      stepResults.set(name, result);
      return result;
    }),
    sendEvent: vi.fn(),
    stepWarnings: []
  };
  mocks.storeHowItWinsRecoveryPayload.mockImplementation(async (_db, input) => {
    const contentHash = `content-${input.logicalCallId}`;
    savedByHash.set(contentHash, input.normalizedCandidate);
    return { contentHash, lease: storedLease };
  });
  mocks.readHowItWinsRecoveryPayload.mockImplementation(async (_db, input) => savedByHash.get(input.contentHash) ?? null);
  return { savedByHash, step };
}

function execution(step: ReturnType<typeof harness>["step"]) {
  return createHowItWinsExecution({
    db: {} as never,
    job: job as never,
    runId: "run-1",
    step: step as never,
    judgeModel: "claude-opus-5",
    editorModel: "deepseek/deepseek-v4-pro"
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  job.deadlineAt = new Date(Date.now() + 300_000);
  job.attempts = [];
  mocks.claimHowItWinsJobLease.mockResolvedValue(initialLease);
  mocks.findHowItWinsJobById.mockImplementation(async () => job);
  mocks.findHowItWinsRecoveryPayloadReference.mockResolvedValue(null);
  mocks.reserveHowItWinsCall.mockResolvedValue({ state: "reserved", lease: initialLease });
  mocks.settleHowItWinsCall.mockImplementation(async (_db, input) => {
    const found = job.attempts.find((attempt) => attempt.logicalCallId === input.logicalCallId);
    if (found) found.status = input.status;
    else job.attempts.push({ logicalCallId: input.logicalCallId, status: input.status });
    return { state: "settled", lease: { ...storedLease, version: storedLease.version + 1 } };
  });
  mocks.annotateHowItWinsCallValidation.mockResolvedValue(true);
});

describe("How it wins durable paid-call execution", () => {
  it("stores a provider response before settlement and settles with the returned lease version", async () => {
    const { step } = harness();
    const run = execution(step);
    const call = request();
    const invoke = vi.fn(async () => successfulResult(call));

    await expect(run.executeCall(call, invoke)).resolves.toMatchObject({ ok: true });

    expect(invoke).toHaveBeenCalledTimes(1);
    expect(mocks.storeHowItWinsRecoveryPayload).toHaveBeenCalledBefore(mocks.settleHowItWinsCall);
    expect(mocks.settleHowItWinsCall.mock.calls[0]?.[1]).toMatchObject({
      lease: storedLease,
      status: "completed",
      actualMicrodollars: null,
      metadata: {
        requestedModel: "claude-opus-5",
        returnedModel: "claude-opus-5-20260901",
        httpOutcome: "succeeded",
        usage: {
          inputTokens: null,
          outputTokens: null,
          cacheCreationInputTokens: null,
          cacheReadInputTokens: null
        }
      }
    });
  });

  it("replays a response saved before a crash without issuing another provider request", async () => {
    const replay = {
      candidate: successfulResult(request()),
      metadata: { requestedModel: "claude-opus-5", httpOutcome: "succeeded" as const },
      cost: null
    };
    const { savedByHash, step } = harness({ replayReference: { contentHash: "saved-before-crash" } });
    savedByHash.set("saved-before-crash", replay);
    job.attempts = [{ logicalCallId: request().callId, status: "reserved" }];
    const invoke = vi.fn();

    await expect(execution(step).executeCall(request(), invoke)).resolves.toMatchObject({ ok: true });

    expect(invoke).not.toHaveBeenCalled();
    expect(mocks.reserveHowItWinsCall).not.toHaveBeenCalled();
    expect(mocks.storeHowItWinsRecoveryPayload).not.toHaveBeenCalled();
    expect(mocks.settleHowItWinsCall).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      logicalCallId: request().callId,
      status: "completed",
      actualMicrodollars: null
    }));
  });

  it("never invokes when the repository rejects a third judge attempt", async () => {
    const { step } = harness();
    mocks.reserveHowItWinsCall.mockResolvedValueOnce({ state: "attempt_limit" });
    const invoke = vi.fn();

    await expect(execution(step).executeCall(request(3), invoke)).rejects.toMatchObject({
      name: "HowItWinsExecutionError",
      reasonCode: "semantic_contract"
    });
    expect(invoke).not.toHaveBeenCalled();
    expect(mocks.storeHowItWinsRecoveryPayload).not.toHaveBeenCalled();
  });

  it("settles an uncertain existing reservation and never repeats the request", async () => {
    const { step } = harness();
    mocks.reserveHowItWinsCall.mockResolvedValueOnce({
      state: "existing",
      attempt: { status: "reserved" },
      lease: initialLease
    });
    const invoke = vi.fn();

    await expect(execution(step).executeCall(request(), invoke)).rejects.toMatchObject({
      reasonCode: "internal_storage"
    });

    expect(invoke).not.toHaveBeenCalled();
    expect(mocks.settleHowItWinsCall).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      logicalCallId: request().callId,
      status: "unknown",
      actualMicrodollars: null,
      metadata: { httpOutcome: "unknown" }
    }));
  });

  it("does not settle a response when its recovery payload loses the lease", async () => {
    const { step } = harness();
    mocks.storeHowItWinsRecoveryPayload.mockResolvedValueOnce(null);
    const call = request();

    await expect(execution(step).executeCall(call, async () => successfulResult(call))).rejects.toMatchObject({
      reasonCode: "lease_lost"
    });

    expect(mocks.settleHowItWinsCall).not.toHaveBeenCalled();
    expect(mocks.readHowItWinsRecoveryPayload).not.toHaveBeenCalled();
  });

  it("persists bounded validation diagnostics against the exact reserved input", async () => {
    const { step } = harness();
    const run = execution(step);
    const call = request();
    await run.executeCall(call, async () => successfulResult(call));

    await run.onValidation({
      request: call,
      trace: successfulResult(call).trace,
      outcome: "failed",
      failureKind: "structured_output",
      diagnostics: [{
        code: "invalid_type",
        path: "strategyEvaluations.16.disposition",
        actualType: "undefined",
        strategyId: "iteration"
      }]
    });

    expect(mocks.annotateHowItWinsCallValidation).toHaveBeenCalledWith(expect.anything(), {
      jobId: job.id,
      logicalCallId: call.callId,
      inputHash: expect.stringMatching(/^[a-f0-9]{64}$/),
      validationOutcome: "invalid",
      validationIssues: [{
        stage: "global_judge",
        code: "invalid_type",
        path: "strategyEvaluations.16.disposition",
        actualType: "undefined",
        strategyId: "iteration"
      }]
    });
  });

  it("discards a provider response that arrives after the execution deadline", async () => {
    const { step } = harness();
    job.deadlineAt = new Date(Date.now() + 15_001);
    const call = request();
    const invoke = vi.fn(async () => {
      await new Promise((resolve) => setTimeout(resolve, 10));
      return successfulResult(call);
    });

    await expect(execution(step).executeCall(call, invoke)).rejects.toEqual(
      new HowItWinsExecutionError("deadline_expired")
    );

    expect(mocks.storeHowItWinsRecoveryPayload).not.toHaveBeenCalled();
    expect(mocks.settleHowItWinsCall).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      status: "failed",
      actualMicrodollars: null,
      metadata: { httpOutcome: "unknown" }
    }));
  });

  it("settles a thrown second transport failure with telemetry emitted before the throw", async () => {
    const { step } = harness();
    const run = execution(step);
    const call: HowItWinsJudgeCallRequest = {
      ...request(2),
      callId: "how-it-wins:critic:2",
      stage: "critic",
      model: "deepseek/deepseek-v4-pro"
    };
    const invoke = vi.fn(async () => {
      run.telemetry({
        stage: "how_it_wins",
        label: call.callId,
        provider: "deepseek",
        model: "deepseek-v4-pro",
        responseId: "response-before-throw",
        responseModel: "deepseek-v4-pro-202609",
        servingProvider: "deepseek",
        status: "failed",
        durationMs: 321,
        inputTokens: 1200,
        outputTokens: 44,
        cacheCreationInputTokens: 18,
        cacheReadInputTokens: 29,
        estimatedCostUsd: 0.012345,
        retryCount: 0,
        error: "provider unavailable"
      });
      throw new OpenAiCompatHttpError({ status: 503, message: "provider unavailable" });
    });

    await expect(run.executeCall(call, invoke)).rejects.toMatchObject({
      reasonCode: "transient_provider"
    });

    expect(mocks.storeHowItWinsRecoveryPayload).not.toHaveBeenCalled();
    expect(mocks.settleHowItWinsCall).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      status: "failed",
      actualMicrodollars: 12_345,
      metadata: {
        requestedModel: "deepseek-v4-pro",
        returnedModel: "deepseek-v4-pro-202609",
        servingProvider: "deepseek",
        responseId: "response-before-throw",
        durationMs: 321,
        retryCount: 0,
        usage: {
          inputTokens: 1200,
          outputTokens: 44,
          cacheCreationInputTokens: 18,
          cacheReadInputTokens: 29
        },
        estimateMicrodollars: 12_345,
        httpOutcome: "failed",
        validationOutcome: "not_run"
      }
    }));
  });
});
