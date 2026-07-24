import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  buildContactEnrichmentRequestedEvent,
  contactEnrichmentHandler,
  emailPatternFallbackDecision,
  mergeContactProviderOutput
} from "../src/inngest/contact-enrichment";
import { contactEnrichmentEnabled } from "../src/inngest/worker-env";
import type { ColdStartCard } from "@cold-start/core";
import type { ProviderFactCandidate, ProviderSource } from "@cold-start/providers";

describe("contact enrichment dispatch", () => {
  it("honors the CONTACT_ENRICHMENT_ENABLED kill switch", () => {
    expect(
      contactEnrichmentEnabled({
        CONTACT_ENRICHMENT_ENABLED: false,
        CONTACT_ENRICHMENT_TIER: "named-only"
      })
    ).toBe(false);

    expect(
      contactEnrichmentEnabled({
        CONTACT_ENRICHMENT_ENABLED: true,
        CONTACT_ENRICHMENT_TIER: "off"
      })
    ).toBe(false);
  });

  it("builds a small replay-safe contact enrichment event", () => {
    expect(
      buildContactEnrichmentRequestedEvent({
        domain: "modal.com",
        slug: "modal",
        requestedAtMs: 1_799_999_000_000,
        tier: "named-only",
        parentGenerationRunId: "run-123",
        parentInngestRunId: "inngest-456"
      })
    ).toEqual({
      name: "card/contact-enrichment.requested",
      data: {
        domain: "modal.com",
        slug: "modal",
        requestedAtMs: 1_799_999_000_000,
        tier: "named-only",
        parentGenerationRunId: "run-123",
        parentInngestRunId: "inngest-456"
      }
    });
  });

  it("omits deepFind by default and includes it only when the paid deep-find is requested", () => {
    const standard = buildContactEnrichmentRequestedEvent({
      domain: "modal.com",
      slug: "modal",
      requestedAtMs: 1_799_999_000_000,
      tier: "named-only"
    });
    expect(standard.data).not.toHaveProperty("deepFind");

    const deep = buildContactEnrichmentRequestedEvent({
      domain: "modal.com",
      slug: "modal",
      requestedAtMs: 1_799_999_000_000,
      tier: "named-only",
      deepFind: true
    });
    expect(deep.data).toMatchObject({ deepFind: true });
  });
});

describe("email pattern fallback guard", () => {
  const eligible = {
    contactEnrichmentEnabled: true,
    fallbackEnabled: true,
    githubPattern: null,
    githubObservedCount: 0,
    hasNamedPersonWithoutEmail: true,
    remainingBudgetUsd: 0.01
  };

  it("allows one fallback only when every trigger condition is satisfied", () => {
    expect(emailPatternFallbackDecision(eligible)).toEqual({ eligible: true });
  });

  it.each([
    ["contact enrichment disabled", { contactEnrichmentEnabled: false }],
    ["EMAIL_PATTERN_FALLBACK_ENABLED=false", { fallbackEnabled: false }],
    ["GitHub pattern available", { githubPattern: "first.last" }],
    ["GitHub observed address available", { githubObservedCount: 1 }],
    ["no named person missing an email", { hasNamedPersonWithoutEmail: false }],
    ["AgentCash budget below $0.01", { remainingBudgetUsd: 0.009 }]
  ])("blocks when %s", (reason, override) => {
    expect(emailPatternFallbackDecision({ ...eligible, ...override })).toEqual({
      eligible: false,
      reason
    });
  });
});

describe("contact provider result merging", () => {
  it("preserves fallback facts and sources when deep-find providers return", () => {
    const fallbackFact = { endpoint: "exa_email_search" } as ProviderFactCandidate;
    const deepFindFact = { endpoint: "hunter_domain_search" } as ProviderFactCandidate;
    const fallbackSource = { url: "https://example.com/fallback" } as ProviderSource;
    const deepFindSource = { url: "https://example.com/deep-find" } as ProviderSource;

    expect(mergeContactProviderOutput(
      { facts: [fallbackFact], sources: [fallbackSource] },
      { facts: [deepFindFact], sources: [deepFindSource] }
    )).toEqual({
      facts: [fallbackFact, deepFindFact],
      sources: [fallbackSource, deepFindSource]
    });
  });
});

const generatedAt = "2026-05-27T20:00:00.000Z";

const providerSource: ProviderSource = {
  url: "https://modal.com",
  title: "Modal",
  sourceType: "company_site",
  intent: "company_profile",
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

// This section drives the exported contactEnrichmentHandler directly (rather than only its pure
// helpers above), the same way apps/web/tests/generate-contact-dispatch.test.ts drives
// generateCardHandler: mocked step tools, mocked DB/provider/LLM boundaries, real pipeline/core
// logic in between. It exists to cover the PERSON_READS_ENABLED gate at contact-enrichment.ts's
// person-reads step, which was previously unreachable because the handler was inlined as the
// third argument to inngest.createFunction.
const handlerMocks = vi.hoisted(() => ({
  createDb: vi.fn(() => ({})),
  findCardBySlug: vi.fn(),
  findGenerationRunById: vi.fn(),
  findSourcesBySlug: vi.fn(),
  recordCardEvidence: vi.fn(),
  recordResearchRunEvent: vi.fn(),
  updateGenerationRunTrace: vi.fn(),
  upsertCard: vi.fn(),
  upsertResearchSections: vi.fn(),
  mutateCard: vi.fn(),
  recordSource: vi.fn(),
  fetchGithubContacts: vi.fn(),
  fetchDirectExaContactSources: vi.fn(),
  fetchStableenrichPeopleEmailSources: vi.fn(),
  fetchStableenrichEmailPatternSources: vi.fn(),
  createPeopleEmailWebset: vi.fn(),
  pollPeopleEmailWebset: vi.fn(),
  agentcashWalletSnapshot: vi.fn(),
  providerBudgetForEndpoint: vi.fn(),
  synthesizePersonReads: vi.fn()
}));

vi.mock("@cold-start/db", () => ({
  createDb: handlerMocks.createDb,
  findCardBySlug: handlerMocks.findCardBySlug,
  findGenerationRunById: handlerMocks.findGenerationRunById,
  findSourcesBySlug: handlerMocks.findSourcesBySlug,
  recordCardEvidence: handlerMocks.recordCardEvidence,
  recordResearchRunEvent: handlerMocks.recordResearchRunEvent,
  updateGenerationRunTrace: handlerMocks.updateGenerationRunTrace,
  upsertCard: handlerMocks.upsertCard,
  upsertResearchSections: handlerMocks.upsertResearchSections,
  mutateCard: handlerMocks.mutateCard,
  recordSource: handlerMocks.recordSource
}));

// Only the network-touching endpoints are replaced; everything else (isGithubContactsResult, the
// provider types) stays real so the handler's branching on their return shapes is unchanged.
vi.mock("@cold-start/providers", async () => {
  const actual = await vi.importActual<typeof import("@cold-start/providers")>("@cold-start/providers");
  return {
    ...actual,
    fetchGithubContacts: handlerMocks.fetchGithubContacts,
    fetchDirectExaContactSources: handlerMocks.fetchDirectExaContactSources,
    fetchStableenrichPeopleEmailSources: handlerMocks.fetchStableenrichPeopleEmailSources,
    fetchStableenrichEmailPatternSources: handlerMocks.fetchStableenrichEmailPatternSources,
    createPeopleEmailWebset: handlerMocks.createPeopleEmailWebset,
    pollPeopleEmailWebset: handlerMocks.pollPeopleEmailWebset,
    agentcashWalletSnapshot: handlerMocks.agentcashWalletSnapshot,
    providerBudgetForEndpoint: handlerMocks.providerBudgetForEndpoint
  };
});

// Only the Anthropic-calling exports are replaced; extractedCardSectionsSchema and
// coldStartCardSchema (consumed transitively through the real, unmocked @cold-start/pipeline)
// stay real so the fixture card below is validated the same way production is.
vi.mock("@cold-start/llm", async () => {
  const actual = await vi.importActual<typeof import("@cold-start/llm")>("@cold-start/llm");
  return {
    ...actual,
    anthropicModel: () => "claude-test",
    createAnthropicClient: () => ({}),
    modelForStage: () => "claude-test",
    synthesizePersonReads: handlerMocks.synthesizePersonReads
  };
});

function contactStepHarness() {
  const names: string[] = [];
  return {
    names,
    step: {
      run: vi.fn(async (name: string, fn: () => unknown) => {
        names.push(name);
        return await fn();
      }),
      sendEvent: vi.fn(async () => undefined),
      sleep: vi.fn(async () => undefined)
    }
  };
}

const CONTACT_HANDLER_ENV_KEYS = [
  "DATABASE_URL",
  "NEXT_PUBLIC_WEB_ORIGIN",
  "CONTACT_ENRICHMENT_ENABLED",
  "CONTACT_ENRICHMENT_TIER",
  "EMAIL_PATTERN_FALLBACK_ENABLED",
  "PERSON_READS_ENABLED"
] as const;

async function runContactEnrichmentHandler(personReadsEnabled: "true" | "false" | undefined) {
  process.env.DATABASE_URL = "postgres://cold-start-test";
  process.env.NEXT_PUBLIC_WEB_ORIGIN = "http://localhost:3000";
  process.env.CONTACT_ENRICHMENT_ENABLED = "true";
  process.env.CONTACT_ENRICHMENT_TIER = "named-only";
  // Disabled so the paid email-pattern fallback step is skipped, keeping this test focused on the
  // person-reads gate instead of also driving the fallback's own provider call.
  process.env.EMAIL_PATTERN_FALLBACK_ENABLED = "false";
  if (personReadsEnabled === undefined) {
    delete process.env.PERSON_READS_ENABLED;
  } else {
    process.env.PERSON_READS_ENABLED = personReadsEnabled;
  }

  const harness = contactStepHarness();
  const result = await contactEnrichmentHandler({
    event: {
      id: "evt_modal_contacts",
      ts: Date.parse(generatedAt),
      data: { domain: "modal.com", slug: "modal" }
    },
    runId: "inngest-contacts",
    step: harness.step
  } as never);

  return { ...harness, result };
}

describe("contact enrichment handler: person-reads gate", () => {
  let originalEnv: Partial<Record<(typeof CONTACT_HANDLER_ENV_KEYS)[number], string>>;

  beforeEach(() => {
    originalEnv = {};
    for (const key of CONTACT_HANDLER_ENV_KEYS) {
      if (process.env[key] !== undefined) {
        originalEnv[key] = process.env[key];
      }
    }

    vi.clearAllMocks();
    handlerMocks.findCardBySlug.mockResolvedValue(card);
    handlerMocks.findSourcesBySlug.mockResolvedValue([{
      url: providerSource.url,
      title: providerSource.title,
      sourceType: providerSource.sourceType,
      fetchedAt: providerSource.fetchedAt,
      rawText: providerSource.rawText
    }]);
    // No GitHub org found: the free layer contributes no facts, so contactProviderFacts stays
    // empty and the run reaches person-reads on the card's own citations alone.
    handlerMocks.fetchGithubContacts.mockResolvedValue({
      found: false,
      reason: "no public org found",
      trace: { org: null, reposChecked: 0, requestCount: 1, estimatedCostUsd: 0 }
    });
    handlerMocks.mutateCard.mockResolvedValue(null);
    handlerMocks.upsertCard.mockResolvedValue({ id: "card-row-id" });
    handlerMocks.recordCardEvidence.mockResolvedValue(undefined);
    handlerMocks.upsertResearchSections.mockResolvedValue(undefined);
    handlerMocks.recordSource.mockResolvedValue(undefined);
    handlerMocks.recordResearchRunEvent.mockResolvedValue(null);
    handlerMocks.updateGenerationRunTrace.mockResolvedValue(null);
    handlerMocks.providerBudgetForEndpoint.mockReturnValue({
      estimatedCostUsd: 0.01,
      expectedFacts: [],
      stopCondition: "test"
    });
    handlerMocks.agentcashWalletSnapshot.mockResolvedValue({ totalBalanceUsd: 10, accounts: [] });
    handlerMocks.synthesizePersonReads.mockResolvedValue({ reads: [], usage: {} });
  });

  afterEach(() => {
    for (const key of CONTACT_HANDLER_ENV_KEYS) {
      if (originalEnv[key] === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = originalEnv[key];
      }
    }
  });

  it("skips the person-reads step and never calls synthesizePersonReads when PERSON_READS_ENABLED=false", async () => {
    const { names, result } = await runContactEnrichmentHandler("false");

    expect(names).not.toContain("person-reads");
    expect(handlerMocks.synthesizePersonReads).not.toHaveBeenCalled();
    expect(result).toEqual({ slug: "modal", emailCount: 0 });

    const storedCard = handlerMocks.upsertCard.mock.calls.at(-1)?.[1] as ColdStartCard;
    expect(storedCard.team.founders.value?.[0]?.read).toBeUndefined();
  });

  it("runs the person-reads step and attaches the read when PERSON_READS_ENABLED is unset", async () => {
    handlerMocks.synthesizePersonReads.mockResolvedValue({
      reads: [{
        name: "Erik Bernhardsson",
        read: { text: "Ships Modal's core scheduling engine.", citationIds: ["c1"] },
        suppressionReason: null
      }],
      usage: {}
    });

    const { names, result } = await runContactEnrichmentHandler(undefined);

    expect(names).toContain("person-reads");
    expect(handlerMocks.synthesizePersonReads).toHaveBeenCalledTimes(1);
    expect(handlerMocks.synthesizePersonReads).toHaveBeenCalledWith(
      expect.objectContaining({ companyName: "Modal", domain: "modal.com" })
    );
    expect(result).toEqual({ slug: "modal", emailCount: 0 });

    const storedCard = handlerMocks.upsertCard.mock.calls.at(-1)?.[1] as ColdStartCard;
    expect(storedCard.team.founders.value?.[0]?.read).toEqual({
      text: "Ships Modal's core scheduling engine.",
      citationIds: ["c1"]
    });
  });
});
