import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  admitHowItWinsJob: vi.fn(),
  admitHowItWinsManualRetry: vi.fn(),
  anthropicModel: vi.fn(() => "claude-opus-5"),
  evaluatorFor: vi.fn(() => ({ signature: "evaluator-signature" })),
  findCardBySlug: vi.fn(),
  findGenerationRunById: vi.fn(),
  findHowItWinsJobById: vi.fn(),
  findLatestHowItWinsJobBySlug: vi.fn(),
  howItWinsBudgetMicrodollars: vi.fn(() => 1_000_000),
  howItWinsEnabled: vi.fn(() => true),
  howItWinsJobOwnedByInstallation: vi.fn(),
  howItWinsJobSummary: vi.fn(),
  howItWinsJudgeInputs: vi.fn(() => ({ hashes: { evidencePacketHash: "evidence-hash" } })),
  howItWinsModelRates: vi.fn(),
  howItWinsModelsFromProcess: vi.fn(() => ({
    judge: "claude-opus-5",
    writer: "claude-sonnet-4-6",
    editor: "deepseek/deepseek-v4-pro",
    fallback: "deepseek/deepseek-v4-flash"
  })),
  howItWinsRefinementEnabled: vi.fn(() => false),
  inngestSend: vi.fn(),
  markHowItWinsDispatchAttempt: vi.fn(),
  confirmHowItWinsDispatch: vi.fn(),
  modelForStage: vi.fn(() => "claude-sonnet-4-6"),
  reserveAlphaRunRequest: vi.fn()
}));

vi.mock("@cold-start/db", () => ({
  admitHowItWinsJob: mocks.admitHowItWinsJob,
  admitHowItWinsManualRetry: mocks.admitHowItWinsManualRetry,
  confirmHowItWinsDispatch: mocks.confirmHowItWinsDispatch,
  findCardBySlug: mocks.findCardBySlug,
  findGenerationRunById: mocks.findGenerationRunById,
  findHowItWinsJobById: mocks.findHowItWinsJobById,
  findLatestHowItWinsJobBySlug: mocks.findLatestHowItWinsJobBySlug,
  howItWinsJobOwnedByInstallation: mocks.howItWinsJobOwnedByInstallation,
  howItWinsJobSummary: mocks.howItWinsJobSummary,
  markHowItWinsDispatchAttempt: mocks.markHowItWinsDispatchAttempt,
  reserveAlphaRunRequest: mocks.reserveAlphaRunRequest
}));

vi.mock("@cold-start/llm", () => ({
  anthropicModel: mocks.anthropicModel,
  modelForStage: mocks.modelForStage
}));

vi.mock("../src/inngest/client", () => ({ inngest: { send: mocks.inngestSend } }));
vi.mock("../src/inngest/how-it-wins", () => ({
  howItWinsEvaluatorFor: mocks.evaluatorFor,
  howItWinsJudgeInputs: mocks.howItWinsJudgeInputs
}));
vi.mock("../src/inngest/how-it-wins-budget", async (importOriginal) => {
  const original = await importOriginal<typeof import("../src/inngest/how-it-wins-budget")>();
  return {
    ...original,
    howItWinsBudgetMicrodollars: mocks.howItWinsBudgetMicrodollars,
    howItWinsModelRates: mocks.howItWinsModelRates
  };
});
vi.mock("../src/inngest/worker-env", () => ({
  howItWinsEnabled: mocks.howItWinsEnabled,
  howItWinsModelsFromProcess: mocks.howItWinsModelsFromProcess,
  howItWinsRefinementEnabled: mocks.howItWinsRefinementEnabled
}));

const { howItWinsStatusForPrincipal, retryHowItWinsJob } = await import("../src/inngest/how-it-wins-jobs");
const originalRetryEnabled = process.env.HOW_IT_WINS_RETRY_ENABLED;

const failedJob = {
  id: "11111111-1111-4111-8111-111111111111",
  retryOfJobId: null,
  sourceAnalysisRunId: "22222222-2222-4222-8222-222222222222",
  slug: "browserbase",
  evidenceHash: "evidence-hash",
  evaluatorSignature: "evaluator-signature",
  status: "failed",
  stage: "writer"
};
const card = { slug: "browserbase", synthesis: { whyItMatters: { text: "Saved read", citationIds: [] } } };
const alphaPrincipal = {
  kind: "alpha" as const,
  inviteId: "invite-1",
  installationId: "installation-1",
  scopes: ["cards:read", "generation:write"]
};

describe("How it wins job ownership", () => {
  beforeEach(() => {
    process.env.HOW_IT_WINS_RETRY_ENABLED = "true";
    vi.stubEnv("ALPHA_GENERATION_ENABLED", "true");
    for (const mock of Object.values(mocks)) mock.mockClear();
    mocks.howItWinsEnabled.mockReturnValue(true);
    mocks.findLatestHowItWinsJobBySlug.mockResolvedValue(failedJob);
    mocks.findHowItWinsJobById.mockResolvedValue(failedJob);
    mocks.findCardBySlug.mockResolvedValue(card);
    mocks.howItWinsJobSummary.mockReturnValue({
      id: failedJob.id,
      status: "failed",
      stage: "writer",
      reasonCode: "structured_output",
      canRetry: true,
      updatedAt: "2026-09-14T17:00:00.000Z"
    });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    if (originalRetryEnabled === undefined) delete process.env.HOW_IT_WINS_RETRY_ENABLED;
    else process.env.HOW_IT_WINS_RETRY_ENABLED = originalRetryEnabled;
  });

  it("keeps status readable but blocks alpha retry when generation is disabled", async () => {
    vi.stubEnv("ALPHA_GENERATION_ENABLED", "false");
    mocks.howItWinsJobOwnedByInstallation.mockResolvedValue(true);
    const status = await howItWinsStatusForPrincipal({} as never, "browserbase", alphaPrincipal);
    expect(status.job?.status).toBe("failed");
    expect(status.job?.canRetry).toBe(false);
    await expect(retryHowItWinsJob({} as never, {
      slug: "browserbase", jobId: failedJob.id, principal: alphaPrincipal
    })).rejects.toMatchObject({ reasonCode: "authentication_configuration" });
    expect(mocks.admitHowItWinsManualRetry).not.toHaveBeenCalled();
  });

  it("leaves operator recovery available while alpha generation is disabled", async () => {
    vi.stubEnv("ALPHA_GENERATION_ENABLED", "false");
    const principal = { kind: "operator" as const, scopes: ["cards:read", "generation:write"] };
    const status = await howItWinsStatusForPrincipal({} as never, "browserbase", principal);
    expect(status.job?.canRetry).toBe(true);
    await retryHowItWinsJob({} as never, { slug: "browserbase", jobId: failedJob.id, principal });
    expect(mocks.admitHowItWinsManualRetry).toHaveBeenCalledOnce();
  });

  it("hides retry permission when the installation did not own the source run", async () => {
    mocks.howItWinsJobOwnedByInstallation.mockResolvedValue(false);

    const result = await howItWinsStatusForPrincipal({ kind: "db" } as never, "browserbase", alphaPrincipal);

    expect(result.job?.canRetry).toBe(false);
    expect(mocks.howItWinsJobOwnedByInstallation).toHaveBeenCalledWith(
      { kind: "db" },
      failedJob.sourceAnalysisRunId,
      "installation-1"
    );
  });

  it("refuses a manual retry when source-run ownership does not match", async () => {
    mocks.howItWinsJobOwnedByInstallation.mockResolvedValue(false);

    const result = await retryHowItWinsJob({ kind: "db" } as never, {
      slug: "browserbase",
      jobId: failedJob.id,
      principal: alphaPrincipal
    });

    expect(result).toBeNull();
    expect(mocks.admitHowItWinsManualRetry).not.toHaveBeenCalled();
    expect(mocks.reserveAlphaRunRequest).not.toHaveBeenCalled();
  });

  it("admits the owned retry without touching profile or lens allowance", async () => {
    const admission = { state: "admitted", job: { ...failedJob, id: "33333333-3333-4333-8333-333333333333" } };
    mocks.howItWinsJobOwnedByInstallation.mockResolvedValue(true);
    mocks.admitHowItWinsManualRetry.mockResolvedValue(admission);

    const result = await retryHowItWinsJob({ kind: "db" } as never, {
      slug: "browserbase",
      jobId: failedJob.id,
      principal: alphaPrincipal
    });

    expect(result).toBe(admission);
    expect(mocks.admitHowItWinsManualRetry).toHaveBeenCalledWith(
      { kind: "db" },
      expect.objectContaining({
        failedJobId: failedJob.id,
        sourceAnalysisRunId: failedJob.sourceAnalysisRunId,
        slug: "browserbase",
        evidenceHash: "evidence-hash",
        evaluatorSignature: "evaluator-signature"
      })
    );
    expect(mocks.reserveAlphaRunRequest).not.toHaveBeenCalled();
  });
});
