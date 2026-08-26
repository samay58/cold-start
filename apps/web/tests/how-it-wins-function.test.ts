import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { ColdStartCard, GenerationTrace, HowItWinsJudgment, HowItWinsRead } from "@cold-start/core";

import { howItWinsRefinementEnabled } from "../src/inngest/worker-env";

// Drives the real howItWinsHandler through the same fake step executor the analysis-run suites
// use, with the judge, the writer, the verifier, and every database call mocked at their module
// boundary. What it pins is the wiring the background function owns: the cache decision, the
// stale guard on the card write, and the one terminal statement each outcome makes on the
// parent run's trace and event trail.
const generatedAt = "2026-08-24T18:00:00.000Z";

const mocks = vi.hoisted(() => ({
  createDb: vi.fn(() => ({})),
  findCardBySlug: vi.fn(),
  recordResearchRunEvent: vi.fn(),
  updateGenerationRunTrace: vi.fn(),
  mutateCard: vi.fn(),
  findHowItWinsJudgment: vi.fn(),
  storeHowItWinsJudgment: vi.fn(),
  judgeHowItWinsForAnalysis: vi.fn(),
  synthesizeHowItWins: vi.fn(),
  verifySynthesis: vi.fn()
}));

vi.mock("@cold-start/db", () => ({
  createDb: mocks.createDb,
  findCardBySlug: mocks.findCardBySlug,
  recordResearchRunEvent: mocks.recordResearchRunEvent,
  updateGenerationRunTrace: mocks.updateGenerationRunTrace,
  mutateCard: mocks.mutateCard,
  findHowItWinsJudgment: mocks.findHowItWinsJudgment,
  storeHowItWinsJudgment: mocks.storeHowItWinsJudgment
}));

vi.mock("@cold-start/llm", async () => {
  const actual = await vi.importActual<typeof import("@cold-start/llm")>("@cold-start/llm");
  return {
    ...actual,
    anthropicModel: () => "claude-test",
    modelForStage: () => "claude-test",
    createAnthropicClient: () => ({}),
    judgeHowItWinsForAnalysis: mocks.judgeHowItWinsForAnalysis,
    synthesizeHowItWins: mocks.synthesizeHowItWins,
    verifySynthesis: mocks.verifySynthesis
  };
});

const judgment = {
  version: 1,
  currentStrategyIds: ["specialization", "iteration"],
  strategyEvaluations: [{ strategyId: "usership", disposition: "not_yet" }],
  openQuestions: [],
  calls: [
    {
      callId: "call-1",
      stage: "global_judge",
      provider: "anthropic",
      model: "claude-test",
      inputTokens: 40_000,
      outputTokens: 28_000,
      latencyMs: 91_000,
      estimatedCostUsd: 1.5,
      actualCostUsd: null,
      outcome: "ok"
    }
  ]
} as unknown as HowItWinsJudgment;

const runningOne = {
  strategy: "specialization" as const,
  meaning: "Strong competence in a narrow niche.",
  note: "Modal builds only serverless compute for AI teams. [c1]",
  citationIds: ["c1"]
};
const runningTwo = {
  strategy: "iteration" as const,
  meaning: "Iterates and changes quickly.",
  note: "Modal ships container runtime changes on a weekly cadence. [c2]",
  citationIds: ["c2"]
};
const read: HowItWinsRead = {
  status: "read",
  sentence: "Modal wins by staying narrow on compute and shipping faster than broader platforms.",
  running: [runningOne, runningTwo],
  pair: null,
  next: [],
  inQuestion: [],
  wrongIf: "A broad cloud matches the release cadence on serverless GPU."
};

function cardFixture(options: { citationCount?: number; includeCompanySite?: boolean; withSynthesis?: boolean } = {}): ColdStartCard {
  const citationCount = options.citationCount ?? 6;
  const includeCompanySite = options.includeCompanySite ?? true;
  const card: ColdStartCard = {
    slug: "modal",
    domain: "modal.com",
    generatedAt,
    generationCostUsd: 0.2,
    cacheStatus: "hit",
    identity: {
      name: { value: "Modal", status: "verified", confidence: "high", citationIds: ["c1"] },
      logoUrl: null,
      oneLiner: { value: "Serverless compute for AI teams", status: "verified", confidence: "high", citationIds: ["c1"] },
      hq: { value: { city: "New York", country: "US" }, status: "verified", confidence: "high", citationIds: ["c1"] },
      foundedYear: { value: 2021, status: "verified", confidence: "high", citationIds: ["c1"] },
      status: "private"
    },
    funding: {
      totalRaisedUsd: { value: 23_000_000, status: "verified", confidence: "high", citationIds: ["c1"] },
      lastRound: { value: null, status: "unknown", confidence: "low", citationIds: [] },
      investors: { value: [{ name: "Redpoint", domain: "redpoint.com" }], status: "verified", confidence: "high", citationIds: ["c1"] }
    },
    team: {
      founders: {
        value: [{ name: "Erik Bernhardsson", role: "Founder", sourceUrl: "https://modal.com" }],
        status: "verified",
        confidence: "high",
        citationIds: ["c1"]
      },
      keyExecs: { value: [], status: "verified", confidence: "high", citationIds: ["c1"] },
      headcount: { value: null, status: "unknown", confidence: "low", citationIds: [] }
    },
    signals: [],
    comparables: [],
    citations: Array.from({ length: citationCount }, (_, index) => ({
      id: `c${index + 1}`,
      url: includeCompanySite && index === 0 ? "https://modal.com" : `https://example.com/modal-${index + 1}`,
      title: `Modal coverage ${index + 1}`,
      fetchedAt: generatedAt,
      sourceType: (includeCompanySite && index === 0 ? "company_site" : "news") as const,
      snippet: "Modal runs serverless compute for AI teams."
    }))
  };
  if (options.withSynthesis === false) {
    return card;
  }
  return {
    ...card,
    synthesis: {
      whyItMatters: { text: "Modal has cited public product evidence. [c1]", citationIds: ["c1"] },
      bullCase: [],
      bearCase: [],
      openQuestions: []
    }
  };
}

function stepHarness() {
  const names: string[] = [];
  return {
    names,
    step: {
      run: vi.fn(async (name: string, fn: () => unknown) => {
        names.push(name);
        return fn();
      }),
      sendEvent: vi.fn(async (name: string) => {
        names.push(name);
      }),
      stepWarnings: [] as never[]
    }
  };
}

async function runHowItWins(
  harness = stepHarness(),
  options: { enabled?: boolean; refinement?: boolean } = {}
) {
  vi.resetModules();
  process.env.DATABASE_URL = "postgres://cold-start-test";
  process.env.NEXT_PUBLIC_WEB_ORIGIN = "http://localhost:3000";
  if (options.enabled === false) {
    process.env.HOW_IT_WINS_ENABLED = "false";
  } else {
    delete process.env.HOW_IT_WINS_ENABLED;
  }
  if (options.refinement === false) {
    process.env.HOW_IT_WINS_REFINEMENT = "off";
  } else {
    delete process.env.HOW_IT_WINS_REFINEMENT;
  }

  const { howItWinsHandler } = await import("../src/inngest/how-it-wins-function");
  const result = await howItWinsHandler({
    event: {
      id: "evt_how_it_wins",
      ts: Date.parse(generatedAt),
      data: {
        slug: "modal",
        domain: "modal.com",
        requestedAtMs: Date.parse(generatedAt),
        parentGenerationRunId: "generation-run-id",
        parentInngestRunId: "inngest-run"
      }
    },
    runId: "how-it-wins-run",
    step: harness.step
  } as never);

  return { ...harness, result };
}

function patchedTrace(): GenerationTrace {
  const call = mocks.updateGenerationRunTrace.mock.calls.at(-1);
  const patch = call?.[1]?.patch as (trace: unknown) => GenerationTrace;
  return patch({ jobKind: "analysis", mode: "analysis" });
}

function completeEvent() {
  return mocks.recordResearchRunEvent.mock.calls.find(
    ([, event]) => (event as { type: string }).type === "how-it-wins.complete"
  )?.[1] as { message: string; metadata: Record<string, unknown> } | undefined;
}

function storedHowItWins(): unknown {
  const mutate = mocks.mutateCard.mock.calls.at(-1)?.[2] as (current: ColdStartCard) => ColdStartCard;
  return mutate(cardFixture()).synthesis?.howItWins;
}

describe("how-it-wins background function", () => {
  // The judgment table, in memory: the write step reads back what the judge step stored, so a
  // plain resolved value would make every miss look like a lost row.
  let storedJudgment: { id: string; judgment: HowItWinsJudgment; createdAt: Date } | null = null;

  beforeEach(() => {
    vi.clearAllMocks();
    storedJudgment = null;
    mocks.findCardBySlug.mockResolvedValue(cardFixture());
    mocks.recordResearchRunEvent.mockResolvedValue(null);
    mocks.updateGenerationRunTrace.mockResolvedValue(null);
    mocks.findHowItWinsJudgment.mockImplementation(async () => storedJudgment);
    mocks.storeHowItWinsJudgment.mockImplementation(async () => {
      storedJudgment = { id: "judgment-id", judgment, createdAt: new Date() };
      return storedJudgment;
    });
    mocks.judgeHowItWinsForAnalysis.mockResolvedValue(judgment);
    mocks.synthesizeHowItWins.mockResolvedValue({
      read,
      editorSkipped: true,
      fitRetried: false,
      styleIssues: [],
      normalizations: []
    });
    mocks.verifySynthesis.mockResolvedValue([
      { text: runningOne.note, citationIds: runningOne.citationIds, status: "supported" },
      { text: runningTwo.note, citationIds: runningTwo.citationIds, status: "supported" }
    ]);
    mocks.mutateCard.mockImplementation(async (_db: unknown, _slug: string, mutate: (card: ColdStartCard) => ColdStartCard) => ({
      card: mutate(cardFixture()),
      row: { id: "card-row-id" }
    }));
  });

  it("judges on a cache miss, stores the verdict, and writes the verified read onto the card", async () => {
    const { names, result } = await runHowItWins();

    expect(names).toEqual([
      "how-it-wins-load",
      "how-it-wins-judge",
      "how-it-wins-write",
      "how-it-wins-verify",
      "how-it-wins-store",
      "how-it-wins-parent-trace",
      "how-it-wins-complete-event"
    ]);
    expect(mocks.judgeHowItWinsForAnalysis).toHaveBeenCalledTimes(1);
    expect(mocks.storeHowItWinsJudgment).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ slug: "modal", status: "read" });
    expect(storedHowItWins()).toEqual(read);

    const trace = patchedTrace();
    expect(trace.howItWins).toMatchObject({
      enabled: true,
      status: "read",
      judgmentRef: { id: "judgment-id", cached: false },
      judgeSummary: { currentCount: 2, notYetCount: 1, openQuestionCount: 0 },
      losses: { judgeCurrent: 2, writerCurrent: 2, verifiedRunning: 2, verifierDropped: 0, floorFired: false }
    });
    expect(trace.steps?.["how-it-wins"]?.status).toBe("complete");
    expect(completeEvent()).toMatchObject({
      message: "How it wins filed",
      metadata: { status: "read", cached: false }
    });
    // The paid judge call lands on the run's LLM ledger, so cost_usd counts the whole read.
    const judgeCalls = (trace.llm?.calls ?? []).filter((call) => call.stage === "how_it_wins" && call.label === "how-it-wins:global_judge");
    expect(judgeCalls).toHaveLength(1);
    expect(judgeCalls[0]).toMatchObject({ model: "claude-test", provider: "anthropic", status: "ok", durationMs: 91_000, estimatedCostUsd: 1.5 });
    expect(trace.llm?.totalEstimatedCostUsd ?? 0).toBeGreaterThanOrEqual(1.5);
    expect(trace.costUsdAnthropic).toBe(trace.llm?.totalEstimatedCostUsd);
  });

  it("replays a stored verdict without calling the judge", async () => {
    storedJudgment = { id: "stored-id", judgment, createdAt: new Date() };

    await runHowItWins();

    expect(mocks.judgeHowItWinsForAnalysis).not.toHaveBeenCalled();
    expect(mocks.storeHowItWinsJudgment).not.toHaveBeenCalled();
    expect(mocks.synthesizeHowItWins).toHaveBeenCalledTimes(1);
    expect(patchedTrace().howItWins?.judgmentRef).toMatchObject({ id: "stored-id", cached: true });
    expect(completeEvent()?.metadata).toMatchObject({ status: "read", cached: true });
    // A replayed verdict cost this run nothing, so no judge call joins its ledger.
    expect((patchedTrace().llm?.calls ?? []).some((call) => call.label.startsWith("how-it-wins:global_judge"))).toBe(false);
  });

  it("writes nothing and reports stale when the card moved under the judgment", async () => {
    // The row the store reads back inside mutateCard carries an extra citation, so its evidence
    // packet no longer hashes to the one the judge read.
    mocks.mutateCard.mockImplementation(
      async (_db: unknown, _slug: string, mutate: (card: ColdStartCard) => ColdStartCard) => {
        mutate(cardFixture({ citationCount: 7 }));
        return { card: cardFixture(), row: { id: "card-row-id" } };
      }
    );

    const { result } = await runHowItWins();

    expect(result).toEqual({ slug: "modal", status: "stale" });
    const trace = patchedTrace();
    expect(trace.howItWins).toMatchObject({ status: "stale", judgmentRef: { id: "judgment-id" } });
    expect(trace.steps?.["how-it-wins"]).toMatchObject({ status: "skipped" });
    expect(completeEvent()?.metadata).toMatchObject({ status: "stale" });
  });

  it("reports failed and writes no card when the writer fails semantically", async () => {
    mocks.synthesizeHowItWins.mockRejectedValue(new Error("how-it-wins draft did not parse"));

    const { names, result } = await runHowItWins();

    expect(result).toEqual({ slug: "modal", status: "failed" });
    expect(names).not.toContain("how-it-wins-store");
    expect(mocks.mutateCard).not.toHaveBeenCalled();
    const trace = patchedTrace();
    expect(trace.howItWins).toMatchObject({ status: "failed", judgmentRef: { id: "judgment-id" } });
    expect(trace.steps?.["how-it-wins"]).toMatchObject({
      status: "failed",
      message: "how-it-wins draft did not parse"
    });
    // The event name never changes, even on failure: the panel's progress-event union is closed.
    expect(completeEvent()).toMatchObject({
      message: "How it wins could not be read",
      metadata: { status: "failed" }
    });
  });

  it("stores a writer read of nothing_stands_out without a verifier pass", async () => {
    mocks.synthesizeHowItWins.mockResolvedValue({
      read: { status: "nothing_stands_out", sentence: "Nothing here separates it from the field yet.", inQuestion: [] },
      editorSkipped: true,
      fitRetried: false,
      styleIssues: [],
      normalizations: []
    });

    const { names, result } = await runHowItWins();

    expect(mocks.verifySynthesis).not.toHaveBeenCalled();
    expect(names).not.toContain("how-it-wins-verify");
    expect(result).toEqual({ slug: "modal", status: "nothing_stands_out" });
    expect(patchedTrace().steps?.["how-it-wins-verify"]).toBeUndefined();
    // Still counted: the judge found two current strategies and none of them reached a read.
    expect(patchedTrace().howItWins?.losses).toEqual({
      judgeCurrent: 2,
      writerCurrent: 0,
      verifiedRunning: 0,
      writerCitationDropped: 0,
      verifierDropped: 0,
      floorFired: false
    });
    expect(completeEvent()?.message).toBe("No how-it-wins read");
  });

  it("skips a card with no filed synthesis", async () => {
    mocks.findCardBySlug.mockResolvedValue(cardFixture({ withSynthesis: false }));

    const { result } = await runHowItWins();

    expect(result).toEqual({ slug: "modal", status: "skipped" });
    expect(mocks.judgeHowItWinsForAnalysis).not.toHaveBeenCalled();
    expect(patchedTrace().steps?.["how-it-wins"]).toMatchObject({
      status: "skipped",
      message: "stored card carries no synthesis"
    });
  });

  it("re-checks the thin-file gate and stops when the evidence thinned out after dispatch", async () => {
    mocks.findCardBySlug.mockResolvedValue(cardFixture({ includeCompanySite: false }));

    const { result } = await runHowItWins();

    expect(result).toEqual({ slug: "modal", status: "thin_file" });
    expect(mocks.judgeHowItWinsForAnalysis).not.toHaveBeenCalled();
    expect(mocks.mutateCard).not.toHaveBeenCalled();
    expect(patchedTrace().howItWins).toMatchObject({
      status: "thin_file",
      thinFileReason: "no-company-authored"
    });
  });

  it("reads no card at all when the flag went off between dispatch and execution", async () => {
    const { names, result } = await runHowItWins(stepHarness(), { enabled: false });

    expect(result).toEqual({ slug: "modal", status: "skipped" });
    expect(names).not.toContain("how-it-wins-load");
    expect(mocks.findCardBySlug).not.toHaveBeenCalled();
    expect(patchedTrace().howItWins).toMatchObject({ enabled: false, status: "skipped" });
  });

  it("passes HOW_IT_WINS_REFINEMENT through to the judge, on by default and off when set", async () => {
    await runHowItWins();
    expect(mocks.judgeHowItWinsForAnalysis.mock.calls[0]?.[0]).toMatchObject({ refinement: true });

    // Clear the in-memory judgment table so the second run is a cache miss too, and only the
    // judge mock's call history so its second call lands at index 0 again.
    storedJudgment = null;
    mocks.judgeHowItWinsForAnalysis.mockClear();

    await runHowItWins(stepHarness(), { refinement: false });
    expect(mocks.judgeHowItWinsForAnalysis.mock.calls[0]?.[0]).toMatchObject({ refinement: false });
  });
});

describe("howItWinsRefinementEnabled", () => {
  afterEach(() => {
    delete process.env.HOW_IT_WINS_REFINEMENT;
  });

  it("is on unless the env var is exactly \"off\"", () => {
    delete process.env.HOW_IT_WINS_REFINEMENT;
    expect(howItWinsRefinementEnabled()).toBe(true);

    process.env.HOW_IT_WINS_REFINEMENT = "off";
    expect(howItWinsRefinementEnabled()).toBe(false);

    process.env.HOW_IT_WINS_REFINEMENT = "not-a-real-value";
    expect(howItWinsRefinementEnabled()).toBe(true);
  });
});
