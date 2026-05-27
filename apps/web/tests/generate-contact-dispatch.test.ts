import { beforeEach, describe, expect, it, vi } from "vitest";

import type { ColdStartCard } from "@cold-start/core";

const generatedAt = "2026-05-27T20:00:00.000Z";

const providerSource = {
  url: "https://modal.com",
  title: "Modal",
  sourceType: "company_site" as const,
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

const mocks = vi.hoisted(() => ({
  createDb: vi.fn(() => ({})),
  findCardBySlug: vi.fn(),
  findSourcesBySlug: vi.fn(),
  markGenerationRun: vi.fn(),
  markResearchSectionFailed: vi.fn(),
  recordResearchRunEvent: vi.fn(),
  recordCardEvidence: vi.fn(),
  recordSource: vi.fn(),
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
  agentcashWalletSnapshot: vi.fn(),
  providerBudgetForEndpoint: vi.fn(),
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
  fetchDirectExaContactSources: mocks.fetchDirectExaContactSources,
  fetchDirectExaFundamentalsSources: mocks.fetchDirectExaFundamentalsSources,
  fetchStableenrichEnrichmentSources: mocks.fetchStableenrichEnrichmentSources,
  fetchStableenrichFastSources: mocks.fetchStableenrichFastSources,
  fetchStableenrichPeopleEmailSources: mocks.fetchStableenrichPeopleEmailSources,
  fetchStableenrichSources: mocks.fetchStableenrichSources,
  agentcashWalletSnapshot: mocks.agentcashWalletSnapshot,
  providerBudgetForEndpoint: mocks.providerBudgetForEndpoint
}));

vi.mock("@cold-start/llm", () => ({
  anthropicModel: () => "claude-test",
  anthropicModelForStage: () => "claude-test",
  createAnthropicClient: () => ({}),
  extractCompanyBlockClaims: vi.fn(),
  extractCompanyClaims: vi.fn(),
  fallbackResearchPlan: vi.fn(() => ({ searchQueries: {} })),
  synthesizeResearchSection: vi.fn(),
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

async function runBasicsGeneration(contactEnabled: string) {
  vi.resetModules();
  process.env.DATABASE_URL = "postgres://cold-start-test";
  process.env.NEXT_PUBLIC_WEB_ORIGIN = "http://localhost:3000";
  process.env.CONTACT_ENRICHMENT_ENABLED = contactEnabled;
  process.env.CONTACT_ENRICHMENT_TIER = "named-only";

  const { generateCardFunction } = await import("../src/inngest/functions");
  const harness = stepHarness();
  await generateCardFunction.fn({
    event: {
      id: "evt_modal",
      ts: Date.parse(generatedAt),
      data: { domain: "modal.com", mode: "basics" }
    },
    runId: "inngest-run",
    step: harness.step
  } as never);

  return harness;
}

describe("generate-card contact dispatch", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.markGenerationRun.mockResolvedValue({ id: "generation-run-id" });
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

  it("dispatches contact enrichment after the seed card is saved", async () => {
    const { names, step } = await runBasicsGeneration("true");

    expect(step.sendEvent).toHaveBeenCalledWith(
      "request-contact-enrichment",
      expect.objectContaining({
        name: "card/contact-enrichment.requested",
        data: expect.objectContaining({
          domain: "modal.com",
          slug: "modal",
          parentGenerationRunId: "generation-run-id"
        })
      })
    );
    expect(names.indexOf("request-contact-enrichment")).toBeGreaterThan(names.indexOf("upsert-seed-card"));
    expect(names).not.toContain("fetch-contact-sources");
    expect(mocks.fetchStableenrichPeopleEmailSources).not.toHaveBeenCalled();
  });

  it("does not dispatch contact enrichment when disabled", async () => {
    const { names, step } = await runBasicsGeneration("false");

    expect(step.sendEvent).not.toHaveBeenCalled();
    expect(names).not.toContain("fetch-contact-sources");
    expect(mocks.fetchDirectExaContactSources).not.toHaveBeenCalled();
    expect(mocks.fetchStableenrichPeopleEmailSources).not.toHaveBeenCalled();
  });
});
