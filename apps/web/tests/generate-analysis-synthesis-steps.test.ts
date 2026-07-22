import { beforeEach, describe, expect, it, vi } from "vitest";

import type { ColdStartCard, GenerationTrace } from "@cold-start/core";

// Phase 4 Task 5.2: synthesize and verify used to run inside one atomic "generate-card" Inngest
// step. They now run as their own steps (synthesize-card, verify-synthesis) with real progress
// events (synthesis.started, verify.started, verify.complete) bracketing the LLM calls. These
// tests drive the full generateCardHandler for mode "analysis" with generateCardForDomainWithTrace
// mocked (it only ever returns the pre-synthesis card here; the split units it used to call
// internally -- evaluateSynthesisGate, synthesizeCardDraft, verifyCardSynthesisDraft -- run for
// real via vi.importActual, with only the LLM calls (synthesizeCard, verifySynthesis) mocked).

const generatedAt = "2026-05-27T20:00:00.000Z";

const providerSource = {
  url: "https://modal.com",
  title: "Modal",
  sourceType: "company_site" as const,
  intent: "company_profile" as const,
  fetchedAt: generatedAt,
  rawText: "Modal runs serverless compute for AI teams."
};

const sections = {
  identity: {
    name: { value: "Modal", status: "verified", confidence: "high", citationIds: ["c1"] },
    websiteUrl: { value: "https://modal.com", status: "verified", confidence: "high", citationIds: ["c1"] },
    linkedinUrl: { value: "https://www.linkedin.com/company/modal-labs", status: "verified", confidence: "high", citationIds: ["c1"] },
    logoUrl: null,
    oneLiner: { value: "Serverless compute for AI teams", status: "verified", confidence: "high", citationIds: ["c1"] },
    description: {
      value: {
        shortDescription: "Modal runs serverless compute for AI workloads.",
        expandedDescription:
          "Modal runs serverless compute for AI teams. Developers use it to run containers and batch jobs without managing their own GPU or CPU infrastructure.",
        concept: "Serverless compute",
        serves: "AI engineering teams",
        mechanism: "On-demand containers"
      },
      status: "verified",
      confidence: "high",
      citationIds: ["c1"]
    },
    hq: { value: { city: "New York", country: "US" }, status: "verified", confidence: "high", citationIds: ["c1"] },
    foundedYear: { value: 2021, status: "verified", confidence: "high", citationIds: ["c1"] },
    status: "private" as const
  },
  funding: {
    totalRaisedUsd: { value: 23000000, status: "verified", confidence: "high", citationIds: ["c1"] },
    lastRound: {
      value: { name: "Series A", amountUsd: 16000000, announcedAt: "2023-01-01", leadInvestors: ["Redpoint"] },
      status: "verified",
      confidence: "high",
      citationIds: ["c1"]
    },
    rounds: {
      value: [{ name: "Series A", amountUsd: 16000000, announcedAt: "2023-01-01", leadInvestors: ["Redpoint"] }],
      status: "verified",
      confidence: "high",
      citationIds: ["c1"]
    },
    investors: {
      value: [{ name: "Redpoint", domain: "redpoint.com" }],
      status: "verified",
      confidence: "high",
      citationIds: ["c1"]
    }
  },
  team: {
    founders: {
      value: [{ name: "Erik Bernhardsson", role: "Founder", sourceUrl: "https://modal.com" }],
      status: "verified",
      confidence: "high",
      citationIds: ["c1"]
    },
    keyExecs: { value: [], status: "verified", confidence: "high", citationIds: ["c1"] },
    headcount: { value: { value: 75, asOf: "2026-05-27" }, status: "verified", confidence: "high", citationIds: ["c1"] }
  },
  signals: [],
  comparables: [],
  citations: [
    {
      id: "c1",
      url: "https://modal.com",
      title: "Modal",
      fetchedAt: generatedAt,
      sourceType: "company_site" as const,
      snippet: "Modal runs serverless compute for AI teams."
    }
  ]
};

const baseCard: ColdStartCard = {
  slug: "modal",
  domain: "modal.com",
  generatedAt,
  generationCostUsd: 0,
  cacheStatus: "miss",
  identity: {
    ...sections.identity,
    status: "private"
  },
  funding: sections.funding,
  team: sections.team,
  signals: sections.signals,
  comparables: sections.comparables,
  citations: sections.citations
};

// citationCount 1 stays below the default ANALYSIS_SYNTHESIS_MIN_CITATIONS floor (8, unset in
// these tests) so the gate blocks; citationCount 8 clears it.
function cardWithCitationCount(citationCount: number): ColdStartCard {
  const citations = Array.from({ length: citationCount }, (_, index) => ({
    id: `c${index + 1}`,
    url: `https://example.com/modal-coverage-${index + 1}`,
    title: `Modal coverage ${index + 1}`,
    fetchedAt: generatedAt,
    sourceType: (index === 0 ? "company_site" : "news") as const,
    snippet: "Modal runs serverless compute for AI teams."
  }));
  return { ...baseCard, citations };
}

const whyItMatters = { text: "Modal has cited public product evidence. [c1]", citationIds: ["c1"] };
const bullCase = { text: "Modal customers deploy production containers on the platform. [c1]", citationIds: ["c1"] };

const mocks = vi.hoisted(() => ({
  createDb: vi.fn(() => ({})),
  findCardBySlug: vi.fn(),
  findSourcesBySlug: vi.fn(),
  isCardSignalsFresh: vi.fn(),
  markGenerationRun: vi.fn(),
  markResearchSectionFailed: vi.fn(),
  recordResearchRunEvent: vi.fn(),
  recordCardEvidence: vi.fn(),
  recordSource: vi.fn(),
  updateGenerationRunTrace: vi.fn(),
  upsertCard: vi.fn(),
  upsertResearchSection: vi.fn(),
  upsertResearchSections: vi.fn(),
  agentcashWalletSnapshot: vi.fn(),
  generateCardForDomainWithTrace: vi.fn(),
  synthesizeCard: vi.fn(),
  verifySynthesis: vi.fn(),
  fetchInitialSourcesForGeneration: vi.fn(),
  fetchLateEnrichmentSources: vi.fn(),
  recordSourcesForCard: vi.fn(),
  sectionsWithSourceCitations: vi.fn(),
  stableenrichLateEnrichmentSkipsForBlocks: vi.fn()
}));

vi.mock("@cold-start/db", () => ({
  createDb: mocks.createDb,
  findCardBySlug: mocks.findCardBySlug,
  findSourcesBySlug: mocks.findSourcesBySlug,
  isCardSignalsFresh: mocks.isCardSignalsFresh,
  markGenerationRun: mocks.markGenerationRun,
  markResearchSectionFailed: mocks.markResearchSectionFailed,
  recordResearchRunEvent: mocks.recordResearchRunEvent,
  recordCardEvidence: mocks.recordCardEvidence,
  recordSource: mocks.recordSource,
  updateGenerationRunTrace: mocks.updateGenerationRunTrace,
  upsertCard: mocks.upsertCard,
  upsertResearchSection: mocks.upsertResearchSection,
  upsertResearchSections: mocks.upsertResearchSections
}));

vi.mock("@cold-start/providers", () => ({
  agentcashWalletSnapshot: mocks.agentcashWalletSnapshot
}));

vi.mock("@cold-start/llm", async () => {
  const actual = await vi.importActual<typeof import("@cold-start/llm")>("@cold-start/llm");
  return {
    ...actual,
    anthropicModel: () => "claude-test",
    modelForStage: () => "claude-test",
    createAnthropicClient: () => ({}),
    extractCompanyBlockClaims: vi.fn(),
    extractCompanyClaims: vi.fn(),
    fallbackResearchPlan: vi.fn(() => ({ searchQueries: {} })),
    synthesizeCard: mocks.synthesizeCard,
    verifySynthesis: mocks.verifySynthesis
  };
});

// Only generateCardForDomainWithTrace is overridden: evaluateSynthesisGate, synthesizeCardDraft,
// and verifyCardSynthesisDraft (the units this task adds) run for real via importActual, which is
// the point -- these tests exercise the real split-unit logic, not a mock standing in for it.
vi.mock("@cold-start/pipeline", async () => {
  const actual = await vi.importActual<typeof import("@cold-start/pipeline")>("@cold-start/pipeline");
  return {
    ...actual,
    generateCardForDomainWithTrace: mocks.generateCardForDomainWithTrace
  };
});

// source-fetching.ts is a local module (not a workspace package). The provider-fetch-touching
// exports are mocked so these tests do not have to model the direct-Exa/StableEnrich provider
// fan-out that fetchInitialSourcesForGeneration performs (that fan-out is exercised by
// generate-contact-dispatch.test.ts instead). analysisSourceFetchPlan and
// providerSourcesFromStoredSources (Task 5.3) are left real: functions.ts calls the former
// unconditionally on every run, and it is pure (no fetch/DB), so there is nothing to mock.
vi.mock("../src/inngest/source-fetching", async () => {
  const actual = await vi.importActual<typeof import("../src/inngest/source-fetching")>("../src/inngest/source-fetching");
  return {
    ...actual,
    fetchInitialSourcesForGeneration: mocks.fetchInitialSourcesForGeneration,
    fetchLateEnrichmentSources: mocks.fetchLateEnrichmentSources,
    recordSourcesForCard: mocks.recordSourcesForCard,
    sectionsWithSourceCitations: mocks.sectionsWithSourceCitations,
    stableenrichLateEnrichmentSkipsForBlocks: mocks.stableenrichLateEnrichmentSkipsForBlocks
  };
});

function stepHarness() {
  const names: string[] = [];
  const sendEvent = vi.fn(async (name: string) => {
    names.push(name);
  });
  return {
    names,
    step: {
      run: vi.fn(async (name: string, fn: () => unknown) => {
        names.push(name);
        return fn();
      }),
      sendEvent
    }
  };
}

async function runAnalysisGeneration() {
  vi.resetModules();
  process.env.DATABASE_URL = "postgres://cold-start-test";
  process.env.NEXT_PUBLIC_WEB_ORIGIN = "http://localhost:3000";
  process.env.CONTACT_ENRICHMENT_ENABLED = "false";
  delete process.env.ANALYSIS_SYNTHESIS_MIN_CITATIONS;

  const { generateCardHandler } = await import("../src/inngest/functions");
  const harness = stepHarness();
  await generateCardHandler({
    event: {
      id: "evt_modal",
      ts: Date.parse(generatedAt),
      data: { domain: "modal.com", mode: "analysis" }
    },
    runId: "inngest-run",
    step: harness.step
  } as never);

  return harness;
}

function eventTypes() {
  return mocks.recordResearchRunEvent.mock.calls.map(([, event]) => (event as { type: string }).type);
}

function persistedTrace(): GenerationTrace {
  const persistCall = mocks.updateGenerationRunTrace.mock.calls.at(-1);
  const patch = persistCall?.[1]?.patch as (trace: unknown) => GenerationTrace;
  return patch({ jobKind: "analysis", mode: "analysis" });
}

describe("generate-card analysis synthesize/verify steps", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.markGenerationRun.mockResolvedValue({ id: "generation-run-id" });
    mocks.updateGenerationRunTrace.mockResolvedValue(null);
    mocks.recordResearchRunEvent.mockResolvedValue(null);
    mocks.recordCardEvidence.mockResolvedValue(undefined);
    mocks.upsertResearchSections.mockResolvedValue(undefined);
    mocks.upsertCard.mockResolvedValue({ id: "card-row-id" });
    mocks.findCardBySlug.mockResolvedValue(null);
    mocks.agentcashWalletSnapshot.mockResolvedValue({ totalBalanceUsd: 10, accounts: [] });
    mocks.fetchInitialSourcesForGeneration.mockResolvedValue({
      sources: [providerSource],
      providerFacts: [],
      failureCount: 0,
      trace: {
        providers: {
          directExa: { skipped: false, sourceCount: 1, failureCount: 0, requestCount: 1, estimatedCostUsd: 0 },
          stableenrich: { sourceCount: 0, factCount: 0, failureCount: 0, endpoints: [] }
        },
        sourceGate: { acceptedCount: 1, rejectedCount: 0, acceptedSamples: [], rejectedSamples: [] }
      },
      error: null
    });
    mocks.recordSourcesForCard.mockResolvedValue(undefined);
    mocks.generateCardForDomainWithTrace.mockResolvedValue({
      card: cardWithCitationCount(8),
      sections,
      sources: [providerSource],
      tracePatch: {
        extraction: {
          sourceCount: 1,
          evidenceCount: 1,
          citationCount: 8,
          fallbackUsed: false
        }
      }
    });
  });

  it("emits synthesis.started, verify.started, and verify.complete around real synthesize-card and verify-synthesis steps when the gate is clear", async () => {
    mocks.synthesizeCard.mockResolvedValue({
      whyItMatters,
      bullCase: [bullCase],
      bearCase: [],
      openQuestions: [{ question: "What buyer owns the renewal decision?", category: "buyer_budget" }]
    });
    mocks.verifySynthesis.mockResolvedValue([
      { ...whyItMatters, status: "supported" },
      { ...bullCase, status: "supported" }
    ]);

    const { names, step } = await runAnalysisGeneration();

    // Step boundaries: generate-card returns the pre-synthesis card; synthesize-card and
    // verify-synthesis are separate, independently memoizable steps after it.
    expect(names).toContain("generate-card");
    expect(names.indexOf("synthesize-card")).toBeGreaterThan(names.indexOf("generate-card"));
    expect(names.indexOf("verify-synthesis")).toBeGreaterThan(names.indexOf("synthesize-card"));

    // Real LLM calls happened exactly once each, wired through the new pure step bodies.
    expect(mocks.synthesizeCard).toHaveBeenCalledTimes(1);
    expect(mocks.verifySynthesis).toHaveBeenCalledTimes(1);
    expect(mocks.verifySynthesis.mock.calls[0]?.[0]).toMatchObject({
      claims: expect.arrayContaining([
        expect.objectContaining({ text: whyItMatters.text }),
        expect.objectContaining({ text: bullCase.text })
      ])
    });

    // Real progress events fire in order, bracketing the two calls.
    const types = eventTypes();
    expect(types.indexOf("synthesis.started")).toBeGreaterThanOrEqual(0);
    expect(types.indexOf("verify.started")).toBeGreaterThan(types.indexOf("synthesis.started"));
    expect(types.indexOf("verify.complete")).toBeGreaterThan(types.indexOf("verify.started"));

    const verifyStartedEvent = mocks.recordResearchRunEvent.mock.calls.find(
      ([, event]) => (event as { type: string }).type === "verify.started"
    )?.[1] as { message: string; metadata: { claimCount: number } };
    expect(verifyStartedEvent.message).toBe("Verifying 2 claims against sources");
    expect(verifyStartedEvent.metadata.claimCount).toBe(2);

    const verifyCompleteEvent = mocks.recordResearchRunEvent.mock.calls.find(
      ([, event]) => (event as { type: string }).type === "verify.complete"
    )?.[1] as { message: string; metadata: { claimCount: number } };
    expect(verifyCompleteEvent.message).toBe("2 claims survived");
    expect(verifyCompleteEvent.metadata.claimCount).toBe(2);

    // Trace continuity: generate-card, synthesize-card, and verify-synthesis each keep their own
    // recorded duration under their own step name; the final card is stored with synthesis attached.
    const trace = persistedTrace();
    expect(trace.steps?.["generate-card"]?.status).toBe("complete");
    expect(trace.steps?.["synthesize-card"]?.status).toBe("complete");
    expect(trace.steps?.["verify-synthesis"]?.status).toBe("complete");
    expect(typeof trace.steps?.["synthesize-card"]?.durationMs).toBe("number");
    expect(typeof trace.steps?.["verify-synthesis"]?.durationMs).toBe("number");
    expect(trace.synthesis).toMatchObject({
      required: true,
      produced: true,
      claimCountBeforeVerify: 2,
      claimCountAfterVerify: 2
    });
    expect(trace.milestones?.analysisReadyMs).toEqual(expect.any(Number));

    expect(mocks.upsertCard).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ synthesis: expect.objectContaining({ whyItMatters }) })
    );
    expect(step.sendEvent).not.toHaveBeenCalled();
  });

  // Migrated from packages/pipeline/tests/generate-card.test.ts (Task 1 tightening pass): the
  // stale-synthesisWithheld strip used to live inside the combined generateCardForDomainWithTrace
  // path in packages/pipeline/src/generate-card.ts. That path is gone; the strip now lives only
  // in the "verify-synthesis" step body here (functions.ts:~732-737). This test seeds a card
  // carrying a synthesisWithheld mark from an earlier gate-blocked run (as a re-run with improved
  // evidence would) and confirms a later successful synthesis clears it rather than storing it
  // stale alongside the synthesis it predates.
  it("strips a stale synthesisWithheld mark once a later run produces synthesis", async () => {
    mocks.generateCardForDomainWithTrace.mockResolvedValue({
      card: {
        ...cardWithCitationCount(8),
        synthesisWithheld: {
          at: "2026-05-20T00:00:00.000Z",
          reasons: ["citation-floor"],
          advisories: [],
          citationCount: 1,
          sourceTypeCount: 1
        }
      },
      sections,
      sources: [providerSource],
      tracePatch: {
        extraction: {
          sourceCount: 1,
          evidenceCount: 1,
          citationCount: 8,
          fallbackUsed: false
        }
      }
    });
    mocks.synthesizeCard.mockResolvedValue({
      whyItMatters,
      bullCase: [bullCase],
      bearCase: [],
      openQuestions: [{ question: "What buyer owns the renewal decision?", category: "buyer_budget" }]
    });
    mocks.verifySynthesis.mockResolvedValue([
      { ...whyItMatters, status: "supported" },
      { ...bullCase, status: "supported" }
    ]);

    await runAnalysisGeneration();

    const storedCard = mocks.upsertCard.mock.calls.at(-1)?.[1] as ColdStartCard;
    expect(storedCard.synthesis).toMatchObject({ whyItMatters });
    expect(storedCard.synthesisWithheld).toBeUndefined();
  });

  it("skips synthesize-card and verify-synthesis, and emits neither synthesis.started nor verify.started, when the evidence gate blocks", async () => {
    mocks.generateCardForDomainWithTrace.mockResolvedValue({
      card: cardWithCitationCount(1),
      sections,
      sources: [providerSource],
      tracePatch: {
        extraction: {
          sourceCount: 1,
          evidenceCount: 1,
          citationCount: 1,
          fallbackUsed: false
        }
      }
    });

    const { names } = await runAnalysisGeneration();

    expect(names).not.toContain("synthesize-card");
    expect(names).not.toContain("verify-synthesis");
    expect(mocks.synthesizeCard).not.toHaveBeenCalled();
    expect(mocks.verifySynthesis).not.toHaveBeenCalled();

    const types = eventTypes();
    expect(types).not.toContain("synthesis.started");
    expect(types).not.toContain("verify.started");
    expect(types).not.toContain("verify.complete");

    const trace = persistedTrace();
    expect(trace.steps?.["synthesize-card"]?.status).toBe("skipped");
    expect(trace.steps?.["verify-synthesis"]?.status).toBe("skipped");
    expect(trace.synthesis).toMatchObject({
      required: true,
      produced: false,
      gateMessage: "insufficient evidence for synthesis"
    });

    expect(mocks.upsertCard).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        synthesisWithheld: expect.objectContaining({ reasons: ["citation-floor"] })
      })
    );
  });

  it("fails the run when verify-synthesis produces no surviving claims, without ever storing the card", async () => {
    mocks.synthesizeCard.mockResolvedValue({
      whyItMatters,
      bullCase: [],
      bearCase: [],
      openQuestions: [{ question: "What buyer owns the renewal decision?", category: "buyer_budget" }]
    });
    mocks.verifySynthesis.mockResolvedValue([{ ...whyItMatters, status: "contradicted" }]);

    await expect(runAnalysisGeneration()).rejects.toThrow("No synthesis claims survived verification");

    expect(mocks.upsertCard).not.toHaveBeenCalled();
    expect(mocks.markGenerationRun).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ status: "failed" })
    );

    const types = eventTypes();
    // verify-synthesis really ran and returned (0 survivors), so verify.complete still fires; the
    // failure is a downstream business decision (analysis requires usable synthesis), not an LLM error.
    expect(types).toContain("verify.complete");
  });

  // Item 2 (schema null-tolerance) fix: documents current semantics for a schema-shaped failure,
  // which item 3 (transient-vs-semantic step classification) keeps unchanged. synthesizeCardStepBody
  // catches every error from synthesizeCardDraft into { ok: false } today (generation-helpers.ts);
  // a ZodError from a malformed synthesize response is one such error. Item 3 classifies ZodError as
  // semantic (not transport-transient), so it keeps this exact behavior: memoized { ok: false }, then
  // a function-level throw, never a step re-throw for Inngest to retry.
  it("surfaces a malformed synthesize response as a memoized synthesize-card failure, and the run throws", async () => {
    // Missing whyItMatters/bullCase/bearCase/openQuestions: synthesisSchema.parse (inside
    // synthesizeCardDraft) rejects this with a ZodError before verify-synthesis ever runs.
    mocks.synthesizeCard.mockResolvedValue({ marketStructureAndTiming: null });

    await expect(runAnalysisGeneration()).rejects.toThrow();

    expect(mocks.verifySynthesis).not.toHaveBeenCalled();
    expect(mocks.upsertCard).not.toHaveBeenCalled();
    expect(mocks.markGenerationRun).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ status: "failed" })
    );

    const trace = persistedTrace();
    expect(trace.steps?.["synthesize-card"]?.status).toBe("failed");
  });
});
