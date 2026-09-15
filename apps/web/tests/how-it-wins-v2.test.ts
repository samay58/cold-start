import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  HOW_IT_WINS_STRATEGIES,
  type ColdStartCard,
  type HowItWinsJudgment,
  type HowItWinsJudgmentBody,
  type HowItWinsRead
} from "@cold-start/core";

const mocks = vi.hoisted(() => ({
  completeHowItWinsJobWithCard: vi.fn(),
  createDb: vi.fn(() => ({})),
  findCardBySlug: vi.fn(),
  findHowItWinsJobById: vi.fn(),
  findHowItWinsJudgment: vi.fn(),
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
  createHowItWinsExecution: vi.fn()
}));

vi.mock("@cold-start/db", async (importOriginal) => ({
  ...await importOriginal<typeof import("@cold-start/db")>(),
  completeHowItWinsJobWithCard: mocks.completeHowItWinsJobWithCard,
  createDb: mocks.createDb,
  findCardBySlug: mocks.findCardBySlug,
  findHowItWinsJobById: mocks.findHowItWinsJobById,
  findHowItWinsJudgment: mocks.findHowItWinsJudgment,
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

vi.mock("../src/inngest/how-it-wins", () => ({
  howItWinsJudgeInputs: mocks.howItWinsJudgeInputs
}));

vi.mock("../src/inngest/how-it-wins-jobs", () => ({
  howItWinsExecutionConfig: mocks.howItWinsExecutionConfig,
  howItWinsJobIdentity: mocks.howItWinsJobIdentity
}));

vi.mock("../src/inngest/how-it-wins-execution", async (importOriginal) => ({
  ...await importOriginal<typeof import("../src/inngest/how-it-wins-execution")>(),
  createHowItWinsExecution: mocks.createHowItWinsExecution
}));

vi.mock("../src/inngest/worker-env", () => ({
  howItWinsEnabled: mocks.howItWinsEnabled
}));

import { howItWinsV2Handler } from "../src/inngest/how-it-wins-v2";
import { HowItWinsExecutionError } from "../src/inngest/how-it-wins-budget";

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

beforeEach(() => {
  vi.clearAllMocks();
  job.deadlineAt = new Date(Date.now() + 300_000);
  job.leaseExpiresAt = new Date(Date.now() + 300_000);
  mocks.howItWinsEnabled.mockReturnValue(true);
  mocks.findHowItWinsJobById.mockResolvedValue(job);
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
