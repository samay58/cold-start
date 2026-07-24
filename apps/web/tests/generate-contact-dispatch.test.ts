import { beforeEach, describe, expect, it, vi } from "vitest";

import type { ColdStartCard } from "@cold-start/core";

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

const card: ColdStartCard = {
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

function signal(title: string) {
  return {
    title,
    url: `https://modal.com/${title.toLowerCase().replace(/\s+/g, "-")}`,
    date: "2026-05-27",
    source: "Modal",
    category: "launch" as const,
    citationIds: ["c1"]
  };
}

function comparable(name: string, domain: string) {
  return {
    name,
    domain,
    oneLiner: `${name} provides adjacent AI infrastructure.`,
    basis: "Adjacent AI infrastructure workflow.",
    confidence: "medium" as const,
    citationIds: ["c1"]
  };
}

const mocks = vi.hoisted(() => ({
  createDb: vi.fn(() => ({})),
  findCardBySlug: vi.fn(),
  findSourcesBySlug: vi.fn(),
  isCardSignalsFresh: vi.fn(),
  markGenerationRun: vi.fn(),
  markResearchSectionFailed: vi.fn(),
  mutateCard: vi.fn(),
  recordResearchRunEvent: vi.fn(),
  recordCardEvidence: vi.fn(),
  recordSource: vi.fn(),
  transitionGenerationRunById: vi.fn(),
  updateGenerationRunTrace: vi.fn(),
  upsertCard: vi.fn(),
  upsertResearchSection: vi.fn(),
  upsertResearchSections: vi.fn(),
  fetchDirectExaContactSources: vi.fn(),
  fetchDirectExaFundamentalsSources: vi.fn(),
  fetchStableenrichEnrichmentSources: vi.fn(),
  fetchStableenrichFastSources: vi.fn(),
  fetchStableenrichPeopleEmailSources: vi.fn(),
  fetchStableenrichSources: vi.fn(),
  fetchWebsetsPeopleEmailSources: vi.fn(),
  agentcashWalletSnapshot: vi.fn(),
  providerBudgetForEndpoint: vi.fn(),
  synthesizeResearchSection: vi.fn(),
  buildSeedProfileCard: vi.fn(),
  enrichExtractedSectionsForDomain: vi.fn(),
  generateCardForDomainWithTrace: vi.fn(),
  applyProviderFactCandidates: vi.fn(),
  totalGenerationCost: vi.fn()
}));

vi.mock("@cold-start/db", () => ({
  createDb: mocks.createDb,
  findCardBySlug: mocks.findCardBySlug,
  findSourcesBySlug: mocks.findSourcesBySlug,
  isCardSignalsFresh: mocks.isCardSignalsFresh,
  markGenerationRun: mocks.markGenerationRun,
  markResearchSectionFailed: mocks.markResearchSectionFailed,
  mutateCard: mocks.mutateCard,
  recordResearchRunEvent: mocks.recordResearchRunEvent,
  recordCardEvidence: mocks.recordCardEvidence,
  recordSource: mocks.recordSource,
  transitionGenerationRunById: mocks.transitionGenerationRunById,
  updateGenerationRunTrace: mocks.updateGenerationRunTrace,
  upsertCard: mocks.upsertCard,
  upsertResearchSection: mocks.upsertResearchSection,
  upsertResearchSections: mocks.upsertResearchSections
}));

vi.mock("@cold-start/providers", () => ({
  fetchDirectExaContactSources: mocks.fetchDirectExaContactSources,
  fetchDirectExaFundamentalsSources: mocks.fetchDirectExaFundamentalsSources,
  fetchStableenrichEnrichmentSources: mocks.fetchStableenrichEnrichmentSources,
  fetchStableenrichFastSources: mocks.fetchStableenrichFastSources,
  fetchStableenrichPeopleEmailSources: mocks.fetchStableenrichPeopleEmailSources,
  fetchStableenrichSources: mocks.fetchStableenrichSources,
  fetchWebsetsPeopleEmailSources: mocks.fetchWebsetsPeopleEmailSources,
  agentcashWalletSnapshot: mocks.agentcashWalletSnapshot,
  providerBudgetForEndpoint: mocks.providerBudgetForEndpoint
}));

vi.mock("@cold-start/llm", () => ({
  BLOCK_ENRICHMENT_IDS: ["description", "funding", "team", "signals", "comparables"],
  anthropicModel: () => "claude-test",
  modelForStage: () => "claude-test",
  createAnthropicClient: () => ({}),
  // The section step consults the transient classifier before memoizing a failure; the errors
  // these tests throw are semantic, so the mock mirrors the real classifier's verdict for them.
  isTransientLlmError: () => false,
  // @cold-start/pipeline re-exports this schema from llm, so the mock must provide it; a passthrough
  // is enough for the section shapes the tests feed in.
  extractedCardSectionsSchema: { parse: (value: unknown) => value },
  extractCompanyBlockClaims: vi.fn(),
  extractCompanyClaims: vi.fn(),
  fallbackResearchPlan: vi.fn(() => ({ searchQueries: {} })),
  synthesizeResearchSection: mocks.synthesizeResearchSection,
  synthesizeCard: vi.fn(),
  verifySynthesis: vi.fn()
}));

vi.mock("@cold-start/pipeline", async () => {
  const actual = await vi.importActual<typeof import("@cold-start/pipeline")>("@cold-start/pipeline");
  return {
    ...actual,
    filterSourcesForDomain: vi.fn((_input: { sources: typeof providerSource[] }) => ({
      accepted: _input.sources,
      rejected: []
    })),
    sourceGateTrace: vi.fn((gate: { accepted: unknown[]; rejected: unknown[] }) => ({
      acceptedCount: gate.accepted.length,
      rejectedCount: gate.rejected.length,
      acceptedSamples: [],
      rejectedSamples: []
    })),
    buildSeedProfileCard: mocks.buildSeedProfileCard,
    enrichExtractedSectionsForDomain: mocks.enrichExtractedSectionsForDomain,
    generateCardForDomainWithTrace: mocks.generateCardForDomainWithTrace,
    applyProviderFactCandidates: mocks.applyProviderFactCandidates,
    totalGenerationCost: mocks.totalGenerationCost
  };
});

function stepHarness(options: {
  replayNowMs?: number;
  replayedStepResults?: Record<string, unknown>;
  stepNowMs?: Record<string, number>;
} = {}) {
  const names: string[] = [];
  let nowMs = options.replayNowMs ?? Date.now();
  const dateNowSpy = options.stepNowMs
    ? vi.spyOn(Date, "now").mockImplementation(() => nowMs)
    : null;
  const sendEvent = vi.fn(async (name: string) => {
    names.push(name);
  });
  return {
    names,
    restoreClock: () => dateNowSpy?.mockRestore(),
    step: {
      run: vi.fn(async (name: string, fn: () => unknown) => {
        names.push(name);
        if (Object.prototype.hasOwnProperty.call(options.replayedStepResults ?? {}, name)) {
          return options.replayedStepResults?.[name];
        }
        const stepNow = options.stepNowMs?.[name];
        if (stepNow !== undefined) {
          nowMs = stepNow;
        }
        const value = await fn();
        nowMs = options.replayNowMs ?? nowMs;
        return value;
      }),
      sendEvent
    }
  };
}

async function runBasicsGeneration(
  contactEnabled: string,
  harnessOptions: Parameters<typeof stepHarness>[0] = {}
) {
  return runGeneration(contactEnabled, harnessOptions);
}

async function runGeneration(
  contactEnabled: string,
  harnessOptions: Parameters<typeof stepHarness>[0] = {},
  eventData: { domain: string; mode?: unknown; sectionId?: string } = { domain: "modal.com", mode: "basics" }
) {
  vi.resetModules();
  process.env.DATABASE_URL = "postgres://cold-start-test";
  process.env.NEXT_PUBLIC_WEB_ORIGIN = "http://localhost:3000";
  process.env.CONTACT_ENRICHMENT_ENABLED = contactEnabled;
  process.env.CONTACT_ENRICHMENT_TIER = "named-only";

  const { generateCardHandler } = await import("../src/inngest/functions");
  const harness = stepHarness(harnessOptions);
  await generateCardHandler({
    event: {
      id: "evt_modal",
      ts: Date.parse(generatedAt),
      data: eventData
    },
    runId: "inngest-run",
    step: harness.step
  } as never);

  return harness;
}

function underfilledSeedCard(): ColdStartCard {
  return {
    ...card,
    identity: {
      ...card.identity,
      hq: { value: null, status: "unknown", confidence: "low", citationIds: [] },
      foundedYear: { value: null, status: "unknown", confidence: "low", citationIds: [] }
    },
    funding: {
      totalRaisedUsd: { value: null, status: "unknown", confidence: "low", citationIds: [] },
      lastRound: { value: null, status: "unknown", confidence: "low", citationIds: [] },
      rounds: { value: [], status: "unknown", confidence: "low", citationIds: [] },
      investors: { value: [], status: "unknown", confidence: "low", citationIds: [] }
    },
    team: {
      ...card.team,
      headcount: { value: null, status: "unknown", confidence: "low", citationIds: [] }
    }
  };
}

describe("generate-card contact dispatch", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.markGenerationRun.mockResolvedValue({ id: "generation-run-id" });
    mocks.mutateCard.mockResolvedValue(null);
    mocks.transitionGenerationRunById.mockResolvedValue({ id: "generation-run-id" });
    mocks.updateGenerationRunTrace.mockResolvedValue(null);
    mocks.recordResearchRunEvent.mockResolvedValue(null);
    mocks.recordCardEvidence.mockResolvedValue(undefined);
    mocks.recordSource.mockResolvedValue(undefined);
    mocks.upsertResearchSections.mockResolvedValue(undefined);
    mocks.upsertCard.mockResolvedValue({ id: "card-row-id" });
    mocks.findCardBySlug.mockResolvedValue(null);
    mocks.agentcashWalletSnapshot.mockResolvedValue({ totalBalanceUsd: 10, accounts: [] });
    mocks.providerBudgetForEndpoint.mockReturnValue({
      estimatedCostUsd: 0.01,
      expectedFacts: [],
      stopCondition: "test"
    });
    mocks.fetchDirectExaFundamentalsSources.mockResolvedValue({
      sources: [providerSource],
      failures: [],
      skipped: false
    });
    mocks.fetchStableenrichFastSources.mockResolvedValue({
      sources: [],
      facts: [],
      failures: [],
      endpoints: []
    });
    mocks.fetchStableenrichEnrichmentSources.mockResolvedValue({
      sources: [],
      facts: [],
      failures: [],
      endpoints: []
    });
    mocks.findSourcesBySlug.mockResolvedValue([{
      url: "https://modal.com",
      title: "Modal",
      sourceType: "company_site",
      fetchedAt: generatedAt,
      rawText: "Modal runs serverless compute for AI teams."
    }]);
    mocks.synthesizeResearchSection.mockResolvedValue({
      status: "available",
      summary: "Modal serves AI engineering teams running compute-heavy workloads.",
      items: [{
        label: "Buyer",
        text: "AI engineering teams use Modal for serverless compute. [c1]",
        citationIds: ["c1"]
      }],
      questions: ["Which workloads create repeated paid usage?"],
      confidence: "medium"
    });
    mocks.buildSeedProfileCard.mockReturnValue({
      card,
      sections,
      trace: {
        providerFactCandidateCount: 0,
        providerFactAppliedCount: 0,
        providerFactPaths: [],
        fallbackFields: [],
        citationCount: 1
      }
    });
    mocks.generateCardForDomainWithTrace.mockResolvedValue({
      card,
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
    mocks.applyProviderFactCandidates.mockReturnValue({
      sections,
      trace: { candidateCount: 0, appliedCount: 0, paths: [] }
    });
    mocks.enrichExtractedSectionsForDomain.mockResolvedValue({ sections });
    mocks.totalGenerationCost.mockReturnValue(0);
  });

  it("dispatches async block enrichment after the seed card is saved", async () => {
    const { names, step } = await runBasicsGeneration("true");

    // The seed card is already first-usable, so deeper block enrichment is handed to the async worker
    // (which then dispatches contact enrichment). The main run frees its Inngest slot at first usable.
    expect(step.sendEvent).toHaveBeenCalledWith(
      "request-block-enrichment",
      expect.objectContaining({
        name: "card/block-enrichment.requested",
        data: expect.objectContaining({
          domain: "modal.com",
          slug: "modal",
          parentGenerationRunId: "generation-run-id"
        })
      })
    );
    expect(names.indexOf("request-block-enrichment")).toBeGreaterThan(names.indexOf("upsert-seed-card"));
    expect(names).not.toContain("fetch-enrichment-sources");
    expect(names).not.toContain("enrich-card");
    expect(step.sendEvent).not.toHaveBeenCalledWith("request-contact-enrichment", expect.anything());
    expect(mocks.fetchStableenrichFastSources).toHaveBeenCalledWith(
      expect.objectContaining({
        skipProbeNames: ["exa_company_profile"],
        maxBudgetUsd: 0.3
      })
    );
    expect(names).not.toContain("fetch-contact-sources");
    expect(mocks.fetchStableenrichPeopleEmailSources).not.toHaveBeenCalled();
  }, 10_000);

  it("carries source images through the source.found event and into stored sources", async () => {
    const sourceWithImage = {
      url: "https://www.modal.com/blog/launch",
      title: "Modal launch",
      sourceType: "news" as const,
      intent: "recent_signals" as const,
      fetchedAt: generatedAt,
      rawText: "Modal launched a new product.",
      imageUrl: "https://www.modal.com/og.png"
    };
    mocks.fetchDirectExaFundamentalsSources.mockResolvedValue({
      sources: [providerSource, sourceWithImage],
      failures: [],
      skipped: false
    });

    await runBasicsGeneration("true");

    const sourceFoundCall = mocks.recordResearchRunEvent.mock.calls.find(
      ([, event]) => (event as { type: string }).type === "source.found"
    );
    expect(sourceFoundCall).toBeDefined();
    const metadata = (sourceFoundCall?.[1] as { metadata: { sources: unknown[] } }).metadata;
    expect(metadata.sources).toEqual([
      {
        url: "https://modal.com",
        domain: "modal.com",
        title: "Modal",
        sourceType: "company_site",
        imageUrl: null
      },
      {
        url: "https://www.modal.com/blog/launch",
        domain: "modal.com",
        title: "Modal launch",
        sourceType: "news",
        imageUrl: "https://www.modal.com/og.png"
      }
    ]);

    expect(mocks.recordSource).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ url: "https://www.modal.com/blog/launch", imageUrl: "https://www.modal.com/og.png" })
    );
    expect(mocks.recordSource).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ url: "https://modal.com", imageUrl: null })
    );
  }, 10_000);

  it("records the saved seed card as the first usable profile across replay", async () => {
    const requestedAtMs = Date.parse(generatedAt);
    const { restoreClock } = await runBasicsGeneration("true", {
      replayNowMs: requestedAtMs + 120_000,
      stepNowMs: {
        "upsert-seed-card": requestedAtMs + 12_000,
        "upsert-card": requestedAtMs + 80_000,
        "upsert-enriched-card": requestedAtMs + 110_000
      }
    });

    try {
      const persistCall = mocks.updateGenerationRunTrace.mock.calls.at(-1);
      expect(persistCall).toBeDefined();

      const patch = persistCall?.[1]?.patch as
        | ((trace: unknown) => { milestones?: { seedCardMs?: number; firstUsableCardMs?: number } })
        | undefined;
      const persisted = patch?.({ jobKind: "basics", mode: "basics" });

      expect(persisted?.milestones?.seedCardMs).toBe(12_000);
      expect(persisted?.milestones?.firstUsableCardMs).toBe(12_000);
    } finally {
      restoreClock();
    }
  }, 10_000);

  it("targets late enrichment probes to blocks still missing after the generated card", async () => {
    const teamGapSections = {
      ...sections,
      team: {
        ...sections.team,
        founders: {
          ...sections.team.founders,
          value: [{ name: "Erik Bernhardsson", role: null, sourceUrl: null }]
        }
      },
      signals: [signal("Launched new GPU capacity"), signal("Expanded enterprise workloads")],
      comparables: [
        comparable("Runpod", "runpod.io"),
        comparable("Replicate", "replicate.com"),
        comparable("Lambda", "lambdalabs.com")
      ]
    };
    mocks.generateCardForDomainWithTrace.mockResolvedValue({
      card: {
        ...card,
        team: teamGapSections.team,
        signals: teamGapSections.signals,
        comparables: teamGapSections.comparables
      },
      sections: teamGapSections,
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

    const { names, step } = await runBasicsGeneration("true");

    // Blocks are still missing, so the main run hands enrichment to the async worker instead of
    // running it inline (the skip-probe targeting is exercised in card-enrichment.test.ts).
    expect(step.sendEvent).toHaveBeenCalledWith(
      "request-block-enrichment",
      expect.objectContaining({ name: "card/block-enrichment.requested" })
    );
    expect(mocks.fetchStableenrichEnrichmentSources).not.toHaveBeenCalled();
    expect(names).not.toContain("enrich-card");
  });

  it("skips late enrichment when the generated card already has complete blocks", async () => {
    const completeSections = {
      ...sections,
      signals: [signal("Launched new GPU capacity"), signal("Expanded enterprise workloads")],
      comparables: [
        comparable("Runpod", "runpod.io"),
        comparable("Replicate", "replicate.com"),
        comparable("Lambda", "lambdalabs.com")
      ]
    };
    mocks.generateCardForDomainWithTrace.mockResolvedValue({
      card: {
        ...card,
        signals: completeSections.signals,
        comparables: completeSections.comparables
      },
      sections: completeSections,
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

    const { names } = await runBasicsGeneration("true");

    expect(names).not.toContain("fetch-enrichment-sources");
    expect(names).not.toContain("enrich-card");
    expect(names).not.toContain("upsert-enriched-card");
    expect(mocks.fetchStableenrichEnrichmentSources).not.toHaveBeenCalled();
    expect(mocks.enrichExtractedSectionsForDomain).not.toHaveBeenCalled();
  });

  it("dispatches contact enrichment from a stored final card when the seed card is underfilled", async () => {
    mocks.buildSeedProfileCard.mockReturnValue({
      card: underfilledSeedCard(),
      sections,
      trace: {
        providerFactCandidateCount: 0,
        providerFactAppliedCount: 0,
        providerFactPaths: [],
        fallbackFields: [],
        citationCount: 1
      }
    });

    const { names, step } = await runBasicsGeneration("true");

    // Seed underfilled, so the generated card is the first usable one. Block enrichment still goes to
    // the async worker, which dispatches contact enrichment downstream.
    expect(names).not.toContain("upsert-seed-card");
    expect(step.sendEvent).toHaveBeenCalledTimes(1);
    expect(step.sendEvent).toHaveBeenCalledWith(
      "request-block-enrichment",
      expect.objectContaining({
        name: "card/block-enrichment.requested",
        data: expect.objectContaining({
          domain: "modal.com",
          slug: "modal",
          parentGenerationRunId: "generation-run-id"
        })
      })
    );
    expect(names.indexOf("request-block-enrichment")).toBeGreaterThan(names.indexOf("upsert-card"));
    expect(names).not.toContain("fetch-contact-sources");
  });

  it("keeps the basics run complete because late enrichment is now async", async () => {
    // Late enrichment runs in a separate worker, so an enrichment failure can no longer fail the
    // user-facing basics run. The main run never calls the enrichment providers; it dispatches the
    // async worker and completes with the already-stored first-usable card.
    mocks.fetchStableenrichEnrichmentSources.mockRejectedValue(new Error("late enrichment failed"));

    const { step } = await runBasicsGeneration("true");

    expect(step.sendEvent).toHaveBeenCalledWith(
      "request-block-enrichment",
      expect.objectContaining({ name: "card/block-enrichment.requested" })
    );
    expect(mocks.fetchStableenrichEnrichmentSources).not.toHaveBeenCalled();
    expect(mocks.upsertCard).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      slug: "modal",
      domain: "modal.com"
    }));
    expect(mocks.upsertResearchSections).toHaveBeenCalled();
    expect(mocks.transitionGenerationRunById).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      id: "generation-run-id",
      status: "complete"
    }));
    expect(mocks.markResearchSectionFailed).not.toHaveBeenCalled();
  });

  it("fails malformed section events instead of treating them as profile generation", async () => {
    await expect(runGeneration("true", {}, { domain: "modal.com", mode: "analysis", sectionId: "not_a_section" }))
      .rejects.toThrow("invalid research section id: not_a_section");

    expect(mocks.markGenerationRun).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      slug: "modal",
      domain: "modal.com",
      mode: "analysis",
      jobKind: "analysis",
      status: "failed",
      error: "invalid research section id: not_a_section",
      traceJson: expect.objectContaining({
        failure: expect.objectContaining({
          stage: "validate-section-id",
          message: "invalid research section id: not_a_section"
        })
      })
    }));
    expect(mocks.findCardBySlug).not.toHaveBeenCalled();
    expect(mocks.generateCardForDomainWithTrace).not.toHaveBeenCalled();
    expect(mocks.markResearchSectionFailed).not.toHaveBeenCalled();
  });

  it("fails malformed generation modes instead of silently running basics", async () => {
    await expect(runGeneration("true", {}, { domain: "modal.com", mode: "analysys" }))
      .rejects.toThrow("invalid generation mode: analysys");

    expect(mocks.markGenerationRun).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      slug: "modal",
      domain: "modal.com",
      mode: "basics",
      jobKind: "basics",
      status: "failed",
      error: "invalid generation mode: analysys",
      traceJson: expect.objectContaining({
        failure: expect.objectContaining({
          stage: "validate-mode",
          message: "invalid generation mode: analysys"
        })
      })
    }));
    expect(mocks.findCardBySlug).not.toHaveBeenCalled();
    expect(mocks.generateCardForDomainWithTrace).not.toHaveBeenCalled();
    expect(mocks.markResearchSectionFailed).not.toHaveBeenCalled();
  });

  it("keeps requested section cleanup best-effort when section generation fails", async () => {
    mocks.findCardBySlug.mockResolvedValue(null);
    mocks.markResearchSectionFailed.mockRejectedValue(new Error("section cleanup unavailable"));

    await expect(runGeneration("true", {}, { domain: "modal.com", mode: "analysis", sectionId: "market" }))
      .rejects.toThrow("profile not found");

    expect(mocks.transitionGenerationRunById).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      id: "generation-run-id",
      status: "failed",
      error: "profile not found"
    }));
    expect(mocks.markResearchSectionFailed).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      slug: "modal",
      domain: "modal.com",
      sectionId: "market",
      visibility: "gated",
      error: "profile not found",
      runId: "generation-run-id"
    }));
  });

  it("persists LLM trace and Anthropic cost from a replayed section step result", async () => {
    const llmCall = {
      stage: "synthesis" as const,
      label: "research-section:market",
      model: "claude-test",
      status: "ok" as const,
      durationMs: 250,
      inputTokens: 1200,
      outputTokens: 300,
      estimatedCostUsd: 0.019456
    };
    const section = {
      slug: "modal",
      domain: "modal.com",
      sectionId: "market",
      visibility: "gated",
      status: "available",
      content: {
        status: "available",
        summary: "Modal serves AI engineering teams running compute-heavy workloads.",
        items: [{
          label: "Buyer",
          text: "AI engineering teams use Modal for serverless compute. [c1]",
          citationIds: ["c1"]
        }],
        questions: ["Which workloads create repeated paid usage?"],
        confidence: "medium"
      },
      citationIds: ["c1"],
      sourceIds: ["c1"],
      runId: "generation-run-id",
      error: null,
      generatedAt,
      staleAt: null
    };

    await runGeneration("true", {
      replayedStepResults: {
        "generate-section": {
          value: section,
          tracePatch: {
            steps: {
              "generate-section": {
                status: "complete",
                durationMs: 250
              }
            },
            llm: {
              calls: [llmCall],
              totalEstimatedCostUsd: 0.019456
            }
          }
        }
      }
    }, { domain: "modal.com", mode: "analysis", sectionId: "market" });

    expect(mocks.synthesizeResearchSection).not.toHaveBeenCalled();
    expect(mocks.upsertResearchSection).toHaveBeenCalledWith(expect.anything(), section);
    expect(mocks.transitionGenerationRunById).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      id: "generation-run-id",
      status: "complete",
      costUsd: 0.0195,
      traceJson: expect.objectContaining({
        costUsdAnthropic: 0.019456,
        llm: {
          calls: [llmCall],
          totalEstimatedCostUsd: 0.019456
        }
      })
    }));
  });

  it("dispatches block enrichment but not contact enrichment when contacts are disabled", async () => {
    const { names, step } = await runBasicsGeneration("false");

    // Block enrichment is independent of CONTACT_ENRICHMENT_ENABLED; the async worker decides whether
    // to dispatch contacts. The main run never dispatches contact enrichment directly.
    expect(step.sendEvent).toHaveBeenCalledWith(
      "request-block-enrichment",
      expect.objectContaining({ name: "card/block-enrichment.requested" })
    );
    expect(step.sendEvent).not.toHaveBeenCalledWith("request-contact-enrichment", expect.anything());
    expect(names).not.toContain("fetch-contact-sources");
    expect(mocks.fetchDirectExaContactSources).not.toHaveBeenCalled();
    expect(mocks.fetchStableenrichPeopleEmailSources).not.toHaveBeenCalled();
  });

  it("still marks the run complete when trace persistence fails", async () => {
    mocks.updateGenerationRunTrace.mockRejectedValue(
      new Error("No transactions support in neon-http driver")
    );

    const { names } = await runBasicsGeneration("true");

    expect(names).toContain("persist-generation-trace-before-complete");
    expect(mocks.transitionGenerationRunById).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ id: "generation-run-id", status: "complete" })
    );
  });

  it("still marks the run failed when trace persistence fails in the failure path", async () => {
    mocks.generateCardForDomainWithTrace.mockRejectedValue(new Error("generation blew up"));
    mocks.updateGenerationRunTrace.mockRejectedValue(
      new Error("No transactions support in neon-http driver")
    );

    await expect(runBasicsGeneration("true")).rejects.toThrow("generation blew up");

    expect(mocks.transitionGenerationRunById).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ id: "generation-run-id", status: "failed" })
    );
  });
});

async function runBlockEnrichment(
  contactEnabled: string,
  data: { domain: string; slug: string; parentGenerationRunId?: string } = {
    domain: "modal.com",
    slug: "modal",
    parentGenerationRunId: "generation-run-id"
  }
) {
  vi.resetModules();
  process.env.DATABASE_URL = "postgres://cold-start-test";
  process.env.NEXT_PUBLIC_WEB_ORIGIN = "http://localhost:3000";
  process.env.CONTACT_ENRICHMENT_ENABLED = contactEnabled;
  process.env.CONTACT_ENRICHMENT_TIER = "named-only";

  const { cardEnrichmentHandler } = await import("../src/inngest/card-enrichment");
  const harness = stepHarness();
  await cardEnrichmentHandler({
    event: {
      id: "evt_enrich",
      ts: Date.parse(generatedAt),
      data: { ...data, requestedAtMs: Date.parse(generatedAt) }
    },
    runId: "inngest-enrich",
    step: harness.step
  } as never);

  return harness;
}

describe("card block enrichment worker", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.findCardBySlug.mockResolvedValue(card);
    mocks.mutateCard.mockResolvedValue(null);
    mocks.findSourcesBySlug.mockResolvedValue([{
      url: "https://modal.com",
      title: "Modal",
      sourceType: "company_site",
      fetchedAt: generatedAt,
      rawText: "Modal runs serverless compute for AI teams."
    }]);
    mocks.fetchStableenrichEnrichmentSources.mockResolvedValue({ sources: [], facts: [], failures: [], endpoints: [] });
    mocks.applyProviderFactCandidates.mockReturnValue({
      sections,
      trace: { candidateCount: 0, appliedCount: 0, paths: [], appliedByEndpoint: {} }
    });
    mocks.enrichExtractedSectionsForDomain.mockResolvedValue({ sections });
    mocks.upsertCard.mockResolvedValue({ id: "card-row-id" });
    mocks.recordCardEvidence.mockResolvedValue(undefined);
    mocks.upsertResearchSections.mockResolvedValue(undefined);
    mocks.recordResearchRunEvent.mockResolvedValue(null);
    mocks.updateGenerationRunTrace.mockResolvedValue(null);
    mocks.providerBudgetForEndpoint.mockReturnValue({ estimatedCostUsd: 0.01, expectedFacts: [], stopCondition: "test" });
  });

  it("enriches the stored card and then dispatches contact enrichment", async () => {
    const { names, step } = await runBlockEnrichment("true");

    expect(mocks.enrichExtractedSectionsForDomain).toHaveBeenCalled();
    expect(names).toContain("upsert-enriched-card");
    // Contact enrichment is dispatched only after the enriched card is stored, so contact enrichment
    // reads the block-enriched card and the two async card writes stay serial.
    expect(step.sendEvent).toHaveBeenCalledWith(
      "request-contact-enrichment",
      expect.objectContaining({
        name: "card/contact-enrichment.requested",
        data: expect.objectContaining({ domain: "modal.com", slug: "modal", parentGenerationRunId: "generation-run-id" })
      })
    );
    expect(names.indexOf("request-contact-enrichment")).toBeGreaterThan(names.indexOf("upsert-enriched-card"));
  });

  it("does not dispatch contact enrichment when contacts are disabled", async () => {
    const { names, step } = await runBlockEnrichment("false");

    expect(names).toContain("upsert-enriched-card");
    expect(step.sendEvent).not.toHaveBeenCalled();
  });

  it("skips enrichment when the stored card is missing", async () => {
    mocks.findCardBySlug.mockResolvedValue(null);

    const { names, step } = await runBlockEnrichment("true");

    expect(names).not.toContain("upsert-enriched-card");
    expect(mocks.enrichExtractedSectionsForDomain).not.toHaveBeenCalled();
    expect(step.sendEvent).not.toHaveBeenCalled();
  });

  it("builds a small replay-safe block enrichment event", async () => {
    const { buildBlockEnrichmentRequestedEvent } = await import("../src/inngest/card-enrichment");
    expect(
      buildBlockEnrichmentRequestedEvent({
        domain: "modal.com",
        slug: "modal",
        requestedAtMs: 1_799_999_000_000,
        parentGenerationRunId: "run-123",
        parentInngestRunId: "inngest-456"
      })
    ).toEqual({
      name: "card/block-enrichment.requested",
      data: {
        domain: "modal.com",
        slug: "modal",
        requestedAtMs: 1_799_999_000_000,
        parentGenerationRunId: "run-123",
        parentInngestRunId: "inngest-456"
      }
    });
  });
});
