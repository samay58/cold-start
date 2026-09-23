import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  HOW_IT_WINS_STRATEGIES,
  type ColdStartCard,
  type HowItWinsJudgment,
  type HowItWinsJudgmentBody,
  type HowItWinsRead
} from "@cold-start/core";
import { HOW_IT_WINS_SCREEN_IDENTITY } from "@cold-start/llm";

const mocks = vi.hoisted(() => ({
  completeHowItWinsJobWithCard: vi.fn(),
  createDb: vi.fn(() => ({})),
  findCardBySlug: vi.fn(),
  findHowItWinsJobById: vi.fn(),
  findHowItWinsJudgment: vi.fn(),
  findGenerationRunById: vi.fn(),
  findResearchRunEventsByRunId: vi.fn(),
  finishHowItWinsJob: vi.fn(),
  readHowItWinsStageCheckpoint: vi.fn(),
  recordResearchRunEvent: vi.fn(),
  storeHowItWinsJudgment: vi.fn(),
  storeHowItWinsStageCheckpoint: vi.fn(),
  updateGenerationRunTrace: vi.fn(),
  createAnthropicClient: vi.fn(() => ({})),
  judgeHowItWinsForAnalysis: vi.fn(),
  synthesizeHowItWins: vi.fn(),
  verifySynthesis: vi.fn(),
  verifyHowItWinsRead: vi.fn(),
  howItWinsExecutionConfig: vi.fn(),
  howItWinsJobIdentity: vi.fn(),
  howItWinsJudgeInputs: vi.fn(),
  howItWinsEnabled: vi.fn(() => true),
  howItWinsScreenConfig: vi.fn((): { mode: "shadow" | "scoped"; apiKey: string } | null => null),
  runHowItWinsScreen: vi.fn(),
  howItWinsScreenShadow: vi.fn(),
  createHowItWinsExecution: vi.fn()
}));

vi.mock("@cold-start/db", async (importOriginal) => ({
  ...await importOriginal<typeof import("@cold-start/db")>(),
  completeHowItWinsJobWithCard: mocks.completeHowItWinsJobWithCard,
  createDb: mocks.createDb,
  findCardBySlug: mocks.findCardBySlug,
  findHowItWinsJobById: mocks.findHowItWinsJobById,
  findHowItWinsJudgment: mocks.findHowItWinsJudgment,
  findGenerationRunById: mocks.findGenerationRunById,
  findResearchRunEventsByRunId: mocks.findResearchRunEventsByRunId,
  finishHowItWinsJob: mocks.finishHowItWinsJob,
  readHowItWinsStageCheckpoint: mocks.readHowItWinsStageCheckpoint,
  recordResearchRunEvent: mocks.recordResearchRunEvent,
  storeHowItWinsJudgment: mocks.storeHowItWinsJudgment,
  storeHowItWinsStageCheckpoint: mocks.storeHowItWinsStageCheckpoint,
  updateGenerationRunTrace: mocks.updateGenerationRunTrace
}));

vi.mock("@cold-start/core", async (importOriginal) => ({
  ...await importOriginal<typeof import("@cold-start/core")>(),
  howItWinsThinFileReason: () => null
}));

vi.mock("@cold-start/llm", async (importOriginal) => ({
  ...await importOriginal<typeof import("@cold-start/llm")>(),
  createAnthropicClient: mocks.createAnthropicClient,
  judgeHowItWinsForAnalysis: mocks.judgeHowItWinsForAnalysis,
  synthesizeHowItWins: mocks.synthesizeHowItWins,
  verifySynthesis: mocks.verifySynthesis
}));

vi.mock("@cold-start/pipeline", async (importOriginal) => ({
  ...await importOriginal<typeof import("@cold-start/pipeline")>(),
  verifyHowItWinsRead: mocks.verifyHowItWinsRead
}));

vi.mock("../src/lib/web-env", () => ({
  webEnv: () => ({ DATABASE_URL: "postgres://unused" })
}));

vi.mock("../src/inngest/how-it-wins", async (importOriginal) => ({
  ...await importOriginal<typeof import("../src/inngest/how-it-wins")>(),
  howItWinsJudgeInputs: mocks.howItWinsJudgeInputs
}));

// recordHowItWinsJobOutcome runs for real: it is the one surface these tests are pinning.
vi.mock("../src/inngest/how-it-wins-jobs", async (importOriginal) => ({
  ...await importOriginal<typeof import("../src/inngest/how-it-wins-jobs")>(),
  howItWinsExecutionConfig: mocks.howItWinsExecutionConfig,
  howItWinsJobIdentity: mocks.howItWinsJobIdentity
}));

vi.mock("../src/inngest/how-it-wins-execution", async (importOriginal) => ({
  ...await importOriginal<typeof import("../src/inngest/how-it-wins-execution")>(),
  createHowItWinsExecution: mocks.createHowItWinsExecution
}));

vi.mock("../src/inngest/worker-env", () => ({
  howItWinsEnabled: mocks.howItWinsEnabled,
  howItWinsScreenConfig: mocks.howItWinsScreenConfig
}));

vi.mock("../src/inngest/how-it-wins-screen-shadow", async (importOriginal) => ({
  ...await importOriginal<typeof import("../src/inngest/how-it-wins-screen-shadow")>(),
  runHowItWinsScreen: mocks.runHowItWinsScreen,
  howItWinsScreenShadow: mocks.howItWinsScreenShadow
}));

import { howItWinsV2Handler } from "../src/inngest/how-it-wins-v2";
import { HowItWinsExecutionError } from "../src/inngest/how-it-wins-execution";
import { recordHowItWinsJobOutcome } from "../src/inngest/how-it-wins-jobs";

const read: HowItWinsRead = {
  status: "read",
  sentence: "Fixture wins by keeping one evidenced mechanism central.",
  running: [{
    strategy: "specialization",
    meaning: "Strong competence in a narrow niche.",
    note: "The company limits the product to one workflow. [c1]",
    citationIds: ["c1"]
  }],
  pair: null,
  next: [],
  inQuestion: [],
  wrongIf: "The product expands beyond the documented workflow."
};

const verifiedRead: HowItWinsRead = {
  ...read,
  sentence: "Fixture wins by keeping its documented workflow narrow."
};

const card = {
  slug: "fixture",
  domain: "fixture.com",
  synthesis: {
    howItWinsEvaluator: { signature: "evaluator-signature" }
  }
} as ColdStartCard;

const job = {
  id: "00000000-0000-4000-8000-000000000001",
  sourceAnalysisRunId: "00000000-0000-4000-8000-000000000002",
  slug: "fixture",
  evidenceHash: "evidence-hash",
  evaluatorSignature: "evaluator-signature",
  executionContractVersion: 2,
  inngestEventId: "event-1",
  status: "running" as const,
  leaseOwner: "run-1",
  leaseExpiresAt: new Date(Date.now() + 300_000),
  version: 1,
  deadlineAt: new Date(Date.now() + 300_000)
};

const config = {
  models: {
    judge: "claude-opus-5",
    writer: "claude-opus-5",
    editor: "deepseek/deepseek-v4-pro"
  },
  verifierModel: "deepseek/deepseek-v4-flash",
  refinement: true
};

function primaryBody(): HowItWinsJudgmentBody {
  return {
    evidenceCutoff: "2026-09-14T20:00:00.000Z",
    evidenceRegistry: [{
      evidenceId: "e1",
      text: "The company limits the product to one workflow.",
      source: "Primary source",
      sourceDate: "2026-09-14",
      attribution: "independent",
      scope: "company"
    }],
    claims: [],
    materialBets: [{
      betId: "b1",
      statement: "The company is betting on one workflow.",
      scope: "company",
      supportingEvidenceIds: ["e1"],
      scopeReasons: ["The evidence describes the company product."]
    }],
    strategyEvaluations: HOW_IT_WINS_STRATEGIES.map((strategy) => ({
      strategyId: strategy.id,
      disposition: "insufficient_evidence" as const,
      betIds: [],
      mechanism: null,
      evidenceGate: "fail" as const,
      evidenceIds: [],
      claimIds: [],
      counterevidenceIds: [],
      dimensions: {
        evidenceStrength: "insufficient" as const,
        centrality: "not_reached" as const,
        materiality: "not_reached" as const,
        distinctiveness: "not_reached" as const,
        independence: "not_reached" as const,
        explanatoryValue: "not_reached" as const
      },
      presentRelevance: "not_reached" as const,
      historicalEvidenceIds: [],
      presentEvidenceIds: [],
      presentBridge: null,
      siblingCandidateIds: [],
      siblingResolutions: [],
      notYet: null,
      dispositionReason: "The supplied evidence does not establish this mechanism."
    })),
    currentStrategyIds: [],
    unusualPair: null,
    openQuestions: [],
    overallWrongCondition: {
      condition: "New evidence establishes a material mechanism.",
      evidenceIds: ["e1"]
    },
    disagreements: [],
    overrides: []
  };
}

const judgment = {
  version: 1,
  currentStrategyIds: [],
  strategyEvaluations: [],
  openQuestions: [],
  calls: []
} as unknown as HowItWinsJudgment;

const countedJudgment = {
  version: 1,
  currentStrategyIds: ["specialization", "iteration"],
  strategyEvaluations: [{ strategyId: "usership", disposition: "not_yet" }],
  openQuestions: [{ questionId: "q1" }],
  calls: []
} as unknown as HowItWinsJudgment;

function eventContext() {
  const names: string[] = [];
  return {
    names,
    context: {
      event: { id: "event-1", data: { jobId: job.id, slug: job.slug } },
      runId: "run-1",
      step: {
        run: vi.fn(async (name: string, fn: () => unknown) => {
          names.push(name);
          return fn();
        }),
        sendEvent: vi.fn(),
        stepWarnings: []
      }
    }
  };
}

// The job row the worker reads back. Terminal transitions replace it, the way the repository
// would, so the parent-trace summary is built from a row that actually finished.
let currentJob: Record<string, unknown> = job;

function terminalJob(patch: Record<string, unknown>) {
  return { ...job, leaseOwner: null, leaseExpiresAt: null, judgmentId: null, outcome: null, attempts: [], ...patch };
}

function attempt(patch: Record<string, unknown>) {
  return {
    logicalCallId: "how-it-wins:monolith:1",
    inputHash: "d".repeat(64),
    stage: "judge_initial",
    status: "completed",
    reservedMicrodollars: 900_000,
    reservedAt: "2026-09-15T02:00:00.000Z",
    settledAt: "2026-09-15T02:02:00.000Z",
    requestedModel: "claude-opus-5",
    returnedModel: "claude-opus-5-20260901",
    servingProvider: "anthropic",
    durationMs: 131_297,
    retryCount: 0,
    usage: { inputTokens: 40_000, outputTokens: 12_000, cacheCreationInputTokens: null, cacheReadInputTokens: null },
    httpOutcome: "succeeded",
    validationOutcome: "valid",
    ...patch
  };
}

function parentTrace(applications = 1) {
  const patch = mocks.updateGenerationRunTrace.mock.calls.at(-1)?.[1].patch as (trace: unknown) => Record<string, unknown>;
  let trace: unknown = null;
  for (let index = 0; index < applications; index += 1) trace = patch(trace);
  return trace as {
    howItWins?: Record<string, unknown>;
    llm?: { calls: Array<Record<string, unknown>>; totalEstimatedCostUsd?: number };
    costUsdAnthropic?: number;
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  job.deadlineAt = new Date(Date.now() + 300_000);
  job.leaseExpiresAt = new Date(Date.now() + 300_000);
  currentJob = job;
  mocks.howItWinsEnabled.mockReturnValue(true);
  mocks.howItWinsScreenConfig.mockReturnValue(null);
  mocks.findHowItWinsJobById.mockImplementation(async () => currentJob);
  mocks.findCardBySlug.mockResolvedValue(card);
  mocks.howItWinsExecutionConfig.mockReturnValue(config);
  mocks.howItWinsJobIdentity.mockReturnValue({
    evidenceHash: job.evidenceHash,
    evaluatorSignature: job.evaluatorSignature
  });
  mocks.howItWinsJudgeInputs.mockReturnValue({ hashes: {
    evidencePacketHash: "a".repeat(64),
    promptHash: "b".repeat(64),
    vocabularyHash: "c".repeat(64)
  } });
  mocks.findHowItWinsJudgment.mockResolvedValue({ id: "judgment-id", judgment });
  mocks.completeHowItWinsJobWithCard.mockResolvedValue("succeeded");
  mocks.recordResearchRunEvent.mockResolvedValue(undefined);
  mocks.findGenerationRunById.mockResolvedValue({ id: job.sourceAnalysisRunId, slug: job.slug, domain: "fixture.com" });
  mocks.findResearchRunEventsByRunId.mockResolvedValue([]);
  mocks.updateGenerationRunTrace.mockResolvedValue(undefined);
  mocks.createHowItWinsExecution.mockReturnValue({
    executeCall: vi.fn(),
    executeMessage: vi.fn(),
    onValidation: vi.fn(),
    telemetry: vi.fn(),
    lease: vi.fn(async () => ({ id: job.id, owner: "run-1", version: 2, expiresAt: job.leaseExpiresAt })),
    failureReason: vi.fn()
  });
});

describe("How it wins v2 checkpoint recovery", () => {
  it("reuses valid writer and verifier checkpoints without repeating either paid stage", async () => {
    mocks.readHowItWinsStageCheckpoint.mockImplementation(async (_db, input) => {
      if (input.checkpointId === "writer") return { result: read };
      if (input.checkpointId === "verifier") return { result: verifiedRead };
      return null;
    });
    const { context, names } = eventContext();

    await expect(howItWinsV2Handler(context as never)).resolves.toEqual({
      jobId: job.id,
      status: "succeeded",
      outcome: "read"
    });

    expect(mocks.synthesizeHowItWins).not.toHaveBeenCalled();
    expect(mocks.verifyHowItWinsRead).not.toHaveBeenCalled();
    expect(mocks.storeHowItWinsStageCheckpoint).not.toHaveBeenCalled();
    expect(names).toEqual(["hiw-v2-store"]);
    expect(mocks.completeHowItWinsJobWithCard).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      judgmentId: "judgment-id",
      outcome: "read",
      verifyAndMutate: expect.any(Function)
    }));
    const mutate = mocks.completeHowItWinsJobWithCard.mock.calls[0]?.[1].verifyAndMutate;
    expect(mutate(card).card.synthesis.howItWins).toEqual(verifiedRead);
  });

  it("stores a validated primary before critic failure and resumes it without another global call", async () => {
    const hashes = mocks.howItWinsJudgeInputs().hashes;
    const primary = {
      schemaVersion: 1 as const,
      hashes: {
        evidencePacket: hashes.evidencePacketHash,
        prompt: hashes.promptHash,
        vocabulary: hashes.vocabularyHash
      },
      body: primaryBody(),
      calls: [{
        callId: "how-it-wins:monolith",
        stage: "global_judge" as const,
        provider: "anthropic",
        model: "claude-opus-5",
        latencyMs: 100,
        retryCount: 0,
        thinkingState: "disabled" as const,
        outcome: "ok" as const,
        providerOutcome: "ok" as const,
        validationOutcome: "ok" as const
      }]
    };
    let storedPrimary: HowItWinsJudgment | undefined;
    let storedFinal: HowItWinsJudgment | undefined;
    let globalCalls = 0;
    mocks.findHowItWinsJudgment.mockImplementation(async (_db, lookup) => {
      if (lookup.promptHash === hashes.promptHash) {
        return storedFinal ? { id: "final-id", judgment: storedFinal } : null;
      }
      return storedPrimary ? { id: "primary-id", judgment: storedPrimary } : null;
    });
    mocks.storeHowItWinsJudgment.mockImplementation(async (_db, input) => {
      if (input.promptHash === hashes.promptHash) {
        storedFinal = input.judgment;
        return { id: "final-id", judgment: input.judgment };
      }
      storedPrimary = input.judgment;
      return { id: "primary-id", judgment: input.judgment };
    });
    mocks.judgeHowItWinsForAnalysis.mockImplementation(async (input) => {
      if (!input.resumePrimaryJudgment) {
        globalCalls += 1;
        await input.onPrimaryJudgment(primary);
        throw new HowItWinsExecutionError("budget_exhausted");
      }
      return {
        version: 1,
        hashes: primary.hashes,
        ...primary.body,
        refinement: { critic: "failed", adjudication: "not_needed", notes: ["critic unavailable"], repairs: [] },
        calls: primary.calls
      };
    });
    mocks.readHowItWinsStageCheckpoint.mockResolvedValue({
      result: { status: "nothing_stands_out", inQuestion: [] }
    });
    mocks.storeHowItWinsStageCheckpoint.mockResolvedValue({
      lease: { id: job.id, owner: "run-1", version: 3, expiresAt: job.leaseExpiresAt }
    });

    const first = eventContext();
    await expect(howItWinsV2Handler(first.context as never)).resolves.toMatchObject({ status: "running" });
    expect(storedPrimary).toBeDefined();
    expect(storedFinal).toBeUndefined();
    expect(mocks.storeHowItWinsStageCheckpoint).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      checkpointId: "primary-notes",
      stage: "judge_initial",
      result: { judgmentId: "primary-id", repairs: [] }
    }));
    expect(mocks.finishHowItWinsJob).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      status: "failed",
      reasonCode: "budget_exhausted"
    }));

    const second = eventContext();
    await expect(howItWinsV2Handler(second.context as never)).resolves.toEqual({
      jobId: job.id,
      status: "succeeded",
      outcome: "nothing_stands_out"
    });

    expect(globalCalls).toBe(1);
    expect(mocks.judgeHowItWinsForAnalysis.mock.calls[1]?.[0].resumePrimaryJudgment).toEqual(primary);
    expect(storedFinal).toBeDefined();
  });
});

describe("How it wins v2 judgment reuse", () => {
  beforeEach(() => {
    mocks.readHowItWinsStageCheckpoint.mockImplementation(async (_db: unknown, input: { checkpointId: string }) => {
      if (input.checkpointId === "writer") return { result: read };
      if (input.checkpointId === "verifier") return { result: verifiedRead };
      return null;
    });
  });

  it("replays a stored verdict for the same evidence, prompt, and vocabulary", async () => {
    await expect(howItWinsV2Handler(eventContext().context as never)).resolves.toMatchObject({ status: "succeeded" });

    expect(mocks.findHowItWinsJudgment.mock.calls[0]?.[1]).toEqual({
      evidencePacketHash: "a".repeat(64),
      promptHash: "b".repeat(64),
      vocabularyHash: "c".repeat(64)
    });
    expect(mocks.judgeHowItWinsForAnalysis).not.toHaveBeenCalled();
    expect(mocks.storeHowItWinsJudgment).not.toHaveBeenCalled();
  });

  it("judges on a miss under the configured refinement flag and hashes its lookup with it", async () => {
    mocks.howItWinsExecutionConfig.mockReturnValue({ ...config, refinement: false });
    mocks.findHowItWinsJudgment.mockResolvedValueOnce(null).mockResolvedValueOnce(null);
    mocks.judgeHowItWinsForAnalysis.mockResolvedValue(judgment);
    mocks.storeHowItWinsJudgment.mockResolvedValue({ id: "judgment-id", judgment });

    await howItWinsV2Handler(eventContext().context as never);

    expect(mocks.howItWinsJudgeInputs).toHaveBeenCalledWith(card, false, config.models);
    expect(mocks.judgeHowItWinsForAnalysis.mock.calls[0]?.[0]).toMatchObject({ refinement: false });
  });
});

describe("How it wins v2 parent-trace accounting", () => {
  beforeEach(() => {
    mocks.readHowItWinsStageCheckpoint.mockImplementation(async (_db: unknown, input: { checkpointId: string }) => {
      if (input.checkpointId === "writer") return { result: read };
      if (input.checkpointId === "verifier") return { result: verifiedRead };
      return null;
    });
    mocks.findHowItWinsJudgment.mockResolvedValue({ id: "judgment-id", judgment: countedJudgment });
  });

  it("carries the settled calls, the judgment reference, and the judge counts onto the parent run", async () => {
    mocks.completeHowItWinsJobWithCard.mockImplementation(async () => {
      currentJob = terminalJob({
        status: "succeeded",
        outcome: "read",
        judgmentId: "judgment-id",
        attempts: [attempt({ settledMicrodollars: 123_456, costBasis: "known" })]
      });
      return "succeeded";
    });
    const { context, names } = eventContext();

    await expect(howItWinsV2Handler(context as never)).resolves.toMatchObject({ status: "succeeded" });

    expect(names).toEqual(["hiw-v2-store", "hiw-v2-notify"]);
    const trace = parentTrace();
    expect(trace.howItWins).toMatchObject({
      enabled: true,
      status: "read",
      judgmentRef: { id: "judgment-id", evidencePacketHash: "a".repeat(64), promptHash: "b".repeat(64), cached: true },
      judgeSummary: { currentCount: 2, notYetCount: 1, openQuestionCount: 1 }
    });
    expect(trace.llm?.calls).toEqual([{
      stage: "how_it_wins",
      label: "how-it-wins:how-it-wins:monolith:1",
      model: "claude-opus-5-20260901",
      provider: "anthropic",
      status: "ok",
      durationMs: 131_297,
      inputTokens: 40_000,
      outputTokens: 12_000,
      retryCount: 0,
      estimatedCostUsd: 0.123456
    }]);
    expect(trace.costUsdAnthropic).toBeCloseTo(0.123456, 6);
  });

  it("applies the same patch twice without duplicating a call row", async () => {
    mocks.completeHowItWinsJobWithCard.mockImplementation(async () => {
      currentJob = terminalJob({
        status: "succeeded",
        outcome: "read",
        judgmentId: "judgment-id",
        attempts: [attempt({ settledMicrodollars: 123_456, costBasis: "known" })]
      });
      return "succeeded";
    });

    await howItWinsV2Handler(eventContext().context as never);

    expect(parentTrace(1).llm?.calls).toHaveLength(1);
    expect(parentTrace(2).llm?.calls).toHaveLength(1);
    expect(parentTrace(2).costUsdAnthropic).toBeCloseTo(0.123456, 6);
  });

  it("keeps a failed judge's call rows, with cost only when its basis is known", async () => {
    mocks.judgeHowItWinsForAnalysis.mockRejectedValue(new Error("Validation failed at strategyEvaluations.16"));
    mocks.findHowItWinsJudgment.mockResolvedValue(null);
    mocks.finishHowItWinsJob.mockImplementation(async () => {
      currentJob = terminalJob({
        status: "failed",
        reasonCode: "structured_output",
        attempts: [
          attempt({ status: "failed", httpOutcome: "succeeded", validationOutcome: "invalid", settledMicrodollars: 400_000, costBasis: "known" }),
          attempt({
            logicalCallId: "how-it-wins:monolith:2",
            status: "unknown",
            httpOutcome: "unknown",
            validationOutcome: "not_run",
            settledMicrodollars: 900_000,
            costBasis: "unknown_reserved"
          })
        ]
      });
      return true;
    });

    await expect(howItWinsV2Handler(eventContext().context as never)).resolves.toMatchObject({ status: "failed" });

    const trace = parentTrace();
    expect(trace.howItWins).toMatchObject({ enabled: true, status: "failed" });
    expect(trace.howItWins?.judgmentRef).toBeUndefined();
    expect(trace.llm?.calls).toEqual([
      expect.objectContaining({ label: "how-it-wins:how-it-wins:monolith:1", status: "failed", estimatedCostUsd: 0.4 }),
      expect.objectContaining({ label: "how-it-wins:how-it-wins:monolith:2", status: "failed" })
    ]);
    expect(trace.llm?.calls[1]).not.toHaveProperty("estimatedCostUsd");
  });
});

// The 0.2.8 extension stops showing "reading" when how-it-wins.complete lands on the analysis
// run. Every terminal path owes that event, including the ones that never load a card.
describe("How it wins v2 terminal event trail", () => {
  function recordedEvents() {
    return mocks.recordResearchRunEvent.mock.calls
      .map(([, event]) => event as { type: string; domain: string; metadata: Record<string, unknown> })
      .filter(event => event.type === "how-it-wins.complete");
  }

  it("closes the trail when the flag cancels the read before the card loads", async () => {
    mocks.howItWinsEnabled.mockReturnValue(false);
    mocks.findCardBySlug.mockResolvedValue(null);
    mocks.finishHowItWinsJob.mockImplementation(async () => {
      currentJob = terminalJob({ status: "cancelled", reasonCode: "cancelled" });
      return true;
    });

    await expect(howItWinsV2Handler(eventContext().context as never)).resolves.toMatchObject({ status: "cancelled" });

    expect(mocks.findCardBySlug).not.toHaveBeenCalled();
    expect(recordedEvents()).toEqual([expect.objectContaining({
      domain: "fixture.com",
      message: "How it wins skipped",
      metadata: { status: "skipped", jobId: job.id, reasonCode: "cancelled" }
    })]);
    expect(parentTrace().howItWins).toEqual({ enabled: true, status: "skipped", reasonCode: "cancelled" });
  });

  it("closes the trail for a job the cron already expired before this run started", async () => {
    currentJob = terminalJob({ status: "failed", reasonCode: "deadline_expired" });
    const { context, names } = eventContext();

    await expect(howItWinsV2Handler(context as never)).resolves.toEqual({ jobId: job.id, status: "failed" });

    expect(names).toEqual(["hiw-v2-notify"]);
    expect(mocks.judgeHowItWinsForAnalysis).not.toHaveBeenCalled();
    expect(recordedEvents()).toEqual([expect.objectContaining({
      metadata: { status: "failed", jobId: job.id, reasonCode: "deadline_expired" }
    })]);
    expect(parentTrace().howItWins).toEqual({ enabled: true, status: "failed", reasonCode: "deadline_expired" });
  });

  it("records one event per job however many times the outcome is replayed", async () => {
    currentJob = terminalJob({ status: "failed", reasonCode: "deadline_expired" });
    const recorded: Array<Record<string, unknown>> = [];
    mocks.recordResearchRunEvent.mockImplementation(async (_db: unknown, event: Record<string, unknown>) => {
      recorded.push(event);
      return null;
    });
    mocks.findResearchRunEventsByRunId.mockImplementation(async () =>
      recorded.map((event, index) => ({ ...event, id: `event-${index}` })));

    await howItWinsV2Handler(eventContext().context as never);
    await howItWinsV2Handler(eventContext().context as never);

    expect(recorded).toHaveLength(1);
  });

  it("lets the owner's notify enrich the trace after the reconcile sweep announced the job first", async () => {
    const terminal = terminalJob({ status: "succeeded", outcome: "read" });
    const recorded: Array<Record<string, unknown>> = [];
    mocks.recordResearchRunEvent.mockImplementation(async (_db: unknown, event: Record<string, unknown>) => {
      recorded.push(event);
      return null;
    });
    mocks.findResearchRunEventsByRunId.mockImplementation(async () =>
      recorded.map((event, index) => ({ ...event, id: `event-${index}` })));
    const judgmentRef = { id: "judgment-id", evidencePacketHash: "a".repeat(64), promptHash: "b".repeat(64), cached: false };

    await recordHowItWinsJobOutcome({} as never, { job: terminal as never, reannounce: true });
    await recordHowItWinsJobOutcome({} as never, { job: terminal as never, judgmentRef });
    const traceWrites = mocks.updateGenerationRunTrace.mock.calls.length;
    await recordHowItWinsJobOutcome({} as never, { job: terminal as never, reannounce: true });

    expect(recorded).toHaveLength(1);
    expect(parentTrace().howItWins).toMatchObject({ status: "read", judgmentRef });
    expect(mocks.updateGenerationRunTrace).toHaveBeenCalledTimes(traceWrites);
  });

  it("skips the event but still patches the trace when the source run row is gone", async () => {
    currentJob = terminalJob({ status: "superseded", reasonCode: "stale_evidence" });
    mocks.findGenerationRunById.mockResolvedValue(null);

    await howItWinsV2Handler(eventContext().context as never);

    expect(recordedEvents()).toEqual([]);
    expect(parentTrace().howItWins).toEqual({ enabled: true, status: "stale", reasonCode: "stale_evidence" });
  });
});

describe("How it wins v2 scoped screen", () => {
  // Round 1 kept two strategies; everything else is screened out.
  const kept = ["specialization", "alliance"] as const;
  const screen = {
    version: "screen-v1",
    model: "jev-1.13.0",
    strategies: Object.fromEntries(HOW_IT_WINS_STRATEGIES.map((strategy) => [strategy.id, {
      roundOne: kept.includes(strategy.id as never) ? 0.6 : 0.05,
      ...(kept.includes(strategy.id as never) ? { roundTwo: { deciding: 0.6, positive: 0.6, lookalike: 0.1, disqualifier: 0 } } : {}),
      support: kept.includes(strategy.id as never) ? 0.6 : 0,
      percentile: 0.5,
      blocked: false
    }])),
    keptIds: [...kept],
    shortlistIds: [...kept],
    inputTokens: 1_000,
    costUsd: 0.00004,
    latencyMs: 700
  };

  beforeEach(() => {
    mocks.howItWinsScreenConfig.mockReturnValue({ mode: "scoped", apiKey: "test-key" });
    mocks.howItWinsJudgeInputs.mockImplementation((_card, _refinement, _models, screenIdentity?: string) => ({ hashes: {
      evidencePacketHash: "a".repeat(64),
      promptHash: screenIdentity ? "e".repeat(64) : "b".repeat(64),
      vocabularyHash: "c".repeat(64)
    } }));
    // The screen step's lookup, then resolveJudgment's filed and primary lookups, all miss.
    mocks.findHowItWinsJudgment.mockResolvedValueOnce(null).mockResolvedValueOnce(null).mockResolvedValueOnce(null);
    mocks.judgeHowItWinsForAnalysis.mockResolvedValue(judgment);
    mocks.storeHowItWinsJudgment.mockResolvedValue({ id: "judgment-id", judgment });
    mocks.readHowItWinsStageCheckpoint.mockImplementation(async (_db: unknown, input: { checkpointId: string }) => {
      if (input.checkpointId === "writer") return { result: read };
      if (input.checkpointId === "verifier") return { result: verifiedRead };
      return null;
    });
    mocks.completeHowItWinsJobWithCard.mockImplementation(async () => {
      currentJob = terminalJob({ status: "succeeded", outcome: "read", judgmentId: "judgment-id" });
      return "succeeded";
    });
  });

  it("screens before the judge and judges only the survivors, filed under the screen's identity", async () => {
    mocks.runHowItWinsScreen.mockResolvedValue({ ok: true, screen });
    const { names, context } = eventContext();
    await expect(howItWinsV2Handler(context as never)).resolves.toMatchObject({ status: "succeeded" });

    expect(names.indexOf("hiw-v2-screen")).toBeLessThan(names.indexOf("hiw-v2-judgment"));
    expect(mocks.howItWinsJudgeInputs.mock.calls.map((call) => call[3])).toEqual([undefined, HOW_IT_WINS_SCREEN_IDENTITY]);
    expect(mocks.storeHowItWinsJudgment.mock.calls.at(-1)?.[1]).toMatchObject({ promptHash: "e".repeat(64) });
    const judged = mocks.judgeHowItWinsForAnalysis.mock.calls[0]?.[0];
    expect(judged.scope).toMatchObject({ identity: HOW_IT_WINS_SCREEN_IDENTITY, strategyIds: ["specialization", "alliance"].sort((a, b) =>
      HOW_IT_WINS_STRATEGIES.findIndex((s) => s.id === a) - HOW_IT_WINS_STRATEGIES.findIndex((s) => s.id === b)) });
    expect(typeof judged.citationCheck).toBe("function");
    expect(parentTrace().howItWins?.screen).toMatchObject({ status: "ok", mode: "scoped", keptCount: 2 });
  });

  it("replays a filed scoped verdict without asking Jev again", async () => {
    mocks.findHowItWinsJudgment.mockReset();
    mocks.findHowItWinsJudgment.mockResolvedValue({ id: "judgment-id", judgment });
    await expect(howItWinsV2Handler(eventContext().context as never)).resolves.toMatchObject({ status: "succeeded" });

    expect(mocks.runHowItWinsScreen).not.toHaveBeenCalled();
    expect(mocks.judgeHowItWinsForAnalysis).not.toHaveBeenCalled();
    expect(mocks.findHowItWinsJudgment.mock.calls.every((call) => (call[1] as { promptHash: string }).promptHash === "e".repeat(64))).toBe(true);
    expect(parentTrace().howItWins?.screen).toBeUndefined();
  });

  it("falls back to the full judge when the screen fails", async () => {
    mocks.runHowItWinsScreen.mockResolvedValue({ ok: false, trace: { status: "failed", reason: "jev 503" } });
    await expect(howItWinsV2Handler(eventContext().context as never)).resolves.toMatchObject({ status: "succeeded" });

    expect(mocks.storeHowItWinsJudgment.mock.calls.at(-1)?.[1]).toMatchObject({ promptHash: "b".repeat(64) });
    const judged = mocks.judgeHowItWinsForAnalysis.mock.calls[0]?.[0];
    expect(judged.scope).toBeUndefined();
    expect(judged.citationCheck).toBeUndefined();
    expect(parentTrace().howItWins?.screen).toEqual({ status: "failed", reason: "jev 503", mode: "scoped" });
  });
});

describe("How it wins v2 shadow screen", () => {
  const shadowTrace = { status: "ok", mode: "shadow", keptCount: 3 };

  beforeEach(() => {
    mocks.howItWinsScreenConfig.mockReturnValue({ mode: "shadow", apiKey: "test-key" });
    mocks.howItWinsScreenShadow.mockResolvedValue(shadowTrace);
    mocks.readHowItWinsStageCheckpoint.mockImplementation(async (_db: unknown, input: { checkpointId: string }) => {
      if (input.checkpointId === "writer") return { result: read };
      if (input.checkpointId === "verifier") return { result: verifiedRead };
      return null;
    });
    mocks.completeHowItWinsJobWithCard.mockImplementation(async () => {
      currentJob = terminalJob({ status: "succeeded", outcome: "read", judgmentId: "judgment-id" });
      return "succeeded";
    });
  });

  it("records the shadow beside the judgment without changing the judge's hashes", async () => {
    await expect(howItWinsV2Handler(eventContext().context as never)).resolves.toMatchObject({ status: "succeeded" });
    expect(mocks.howItWinsJudgeInputs.mock.calls.map((call) => call[3])).toEqual([undefined]);
    expect(parentTrace().howItWins?.screen).toEqual(shadowTrace);
  });

  // The time check lives inside the step, so every replay reaches the same step list.
  it("still takes the shadow step when too little time is left, and skips only the Jev calls", async () => {
    job.deadlineAt = new Date(Date.now() + 30_000);
    const { names, context } = eventContext();
    await howItWinsV2Handler(context as never);
    expect(names).toContain("hiw-v2-screen-shadow");
    expect(mocks.howItWinsScreenShadow).not.toHaveBeenCalled();
    expect(parentTrace().howItWins?.screen).toBeUndefined();
  });
});
