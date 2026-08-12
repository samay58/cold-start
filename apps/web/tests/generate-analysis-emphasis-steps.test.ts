import { beforeEach, describe, expect, it, vi } from "vitest";

import type { ColdStartCard, GenerationTrace } from "@cold-start/core";
import type { FounderVoiceItem } from "@cold-start/providers";

import type { GenerationStepWarning } from "../src/inngest/client";

// Sibling to generate-analysis-synthesis-steps.test.ts, scoped to the emphasis-read wiring
// (Task 7; added on coordinator review for IMPORTANT-1 and IMPORTANT-2): drives the real
// generateCardHandler for mode "analysis" with EMPHASIS_READ_ENABLED left at its production
// default (on), and asserts the fetch-founder-voice / emphasis-read step order, the events, the
// accumulated trace block, the citations merge, and finalEmphasis landing on the stored card.
// generateCardForDomainWithTrace stays mocked (as in the sibling file); fetchFounderVoiceEvidence
// and synthesizeEmphasisRead are the two new boundaries this suite mocks that the sibling suite
// does not, and EMPHASIS_READ_ENABLED=false was added to the sibling suite specifically because
// it lacks these two mocks.

const generatedAt = "2026-08-12T20:00:00.000Z";

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
    headcount: { value: { value: 75, asOf: "2026-08-12" }, status: "verified", confidence: "high", citationIds: ["c1"] }
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

// includeCompanySite controls whether citation 1 is company_site (clears emphasisThinFileReason's
// "no-company-authored" check) or news (fails it), while both variants clear the synthesis gate's
// own 8-citation floor and its separate "at least one non-enrichment source type" check.
function cardWithCitations(citationCount: number, options: { includeCompanySite?: boolean } = {}): ColdStartCard {
  const includeCompanySite = options.includeCompanySite ?? true;
  const citations = Array.from({ length: citationCount }, (_, index) => ({
    id: `c${index + 1}`,
    url: `https://example.com/modal-coverage-${index + 1}`,
    title: `Modal coverage ${index + 1}`,
    fetchedAt: generatedAt,
    sourceType: (includeCompanySite && index === 0 ? "company_site" : "news") as const,
    snippet: "Modal runs serverless compute for AI teams."
  }));
  return { ...baseCard, citations };
}

const whyItMatters = { text: "Modal has cited public product evidence. [c1]", citationIds: ["c1"] };
const bullCase = { text: "Modal customers deploy production containers on the platform. [c1]", citationIds: ["c1"] };

const founderVoiceItem: FounderVoiceItem = {
  lane: "hn_search",
  url: "https://news.ycombinator.com/item?id=1",
  title: "Show HN: Modal",
  text: "We just shipped serverless GPU containers.",
  authorship: "founder"
};

function founderVoiceEvidence(items: FounderVoiceItem[] = [founderVoiceItem]) {
  return {
    laneResults: [
      { lane: "hn_search" as const, items, estimatedCostUsd: 0 },
      { lane: "github_author_activity" as const, items: [] as FounderVoiceItem[], estimatedCostUsd: 0 },
      { lane: "bluesky_author_feed" as const, items: [] as FounderVoiceItem[], estimatedCostUsd: 0 },
      { lane: "xai_x_search" as const, items: [] as FounderVoiceItem[], estimatedCostUsd: 0, failure: "XAI_API_KEY not set" },
      { lane: "exa_founder_web" as const, items: [] as FounderVoiceItem[], estimatedCostUsd: 0 }
    ],
    items,
    estimatedCostUsd: 0
  };
}

const emphasisReadFixture = {
  status: "read" as const,
  loud: { text: "They lead every post with GitHub stars [fv1].", citationIds: ["fv1"] },
  quiet: "Nothing filed shows a named paying customer.",
  read: { text: "The loudest proof sits at product, not customers [fv1].", citationIds: ["fv1"] },
  wouldChangeIf: "A named customer with a dollar figure would break this read."
};

const mocks = vi.hoisted(() => ({
  createDb: vi.fn(() => ({})),
  findCardBySlug: vi.fn(),
  findSourcesBySlug: vi.fn(),
  isCardSignalsFresh: vi.fn(),
  markGenerationRun: vi.fn(),
  mutateCard: vi.fn(),
  markResearchSectionFailed: vi.fn(),
  recordResearchRunEvent: vi.fn(),
  recordCardEvidence: vi.fn(),
  recordSource: vi.fn(),
  updateGenerationRunTrace: vi.fn(),
  upsertCard: vi.fn(),
  upsertResearchSection: vi.fn(),
  upsertResearchSections: vi.fn(),
  transitionGenerationRunById: vi.fn(),
  settleAlphaRunRequest: vi.fn(),
  agentcashWalletSnapshot: vi.fn(),
  generateCardForDomainWithTrace: vi.fn(),
  synthesizeCard: vi.fn(),
  verifySynthesis: vi.fn(),
  synthesizeEmphasisRead: vi.fn(),
  fetchFounderVoiceEvidence: vi.fn(),
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
  mutateCard: mocks.mutateCard,
  markResearchSectionFailed: mocks.markResearchSectionFailed,
  recordResearchRunEvent: mocks.recordResearchRunEvent,
  recordCardEvidence: mocks.recordCardEvidence,
  recordSource: mocks.recordSource,
  updateGenerationRunTrace: mocks.updateGenerationRunTrace,
  upsertCard: mocks.upsertCard,
  upsertResearchSection: mocks.upsertResearchSection,
  upsertResearchSections: mocks.upsertResearchSections,
  transitionGenerationRunById: mocks.transitionGenerationRunById,
  settleAlphaRunRequest: mocks.settleAlphaRunRequest
}));

vi.mock("@cold-start/providers", () => ({
  agentcashWalletSnapshot: mocks.agentcashWalletSnapshot,
  fetchFounderVoiceEvidence: mocks.fetchFounderVoiceEvidence
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
    verifySynthesis: mocks.verifySynthesis,
    synthesizeEmphasisRead: mocks.synthesizeEmphasisRead
  };
});

// Only generateCardForDomainWithTrace is overridden here, same as the sibling suite:
// evaluateSynthesisGate, synthesizeCardDraft, and verifyCardSynthesisDraft (including the
// emphasisRead extras this task added) run for real via importActual.
vi.mock("@cold-start/pipeline", async () => {
  const actual = await vi.importActual<typeof import("@cold-start/pipeline")>("@cold-start/pipeline");
  return {
    ...actual,
    generateCardForDomainWithTrace: mocks.generateCardForDomainWithTrace
  };
});

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

function stepHarness(stepWarnings: GenerationStepWarning[] = []) {
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
      sendEvent,
      stepWarnings
    }
  };
}

async function runAnalysisGeneration(harness: ReturnType<typeof stepHarness> = stepHarness()) {
  vi.resetModules();
  process.env.DATABASE_URL = "postgres://cold-start-test";
  process.env.NEXT_PUBLIC_WEB_ORIGIN = "http://localhost:3000";
  process.env.CONTACT_ENRICHMENT_ENABLED = "false";
  delete process.env.ANALYSIS_SYNTHESIS_MIN_CITATIONS;
  // Left unset deliberately: emphasisReadEnabled() defaults on, and this suite exists to exercise
  // that default-enabled path end to end.
  delete process.env.EMPHASIS_READ_ENABLED;

  const { generateCardHandler } = await import("../src/inngest/functions");
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

function eventOfType(type: string) {
  return mocks.recordResearchRunEvent.mock.calls.find(
    ([, event]) => (event as { type: string }).type === type
  )?.[1] as { message: string; metadata: Record<string, unknown> } | undefined;
}

function persistedTrace(): GenerationTrace {
  const persistCall = mocks.updateGenerationRunTrace.mock.calls.at(-1);
  const patch = persistCall?.[1]?.patch as (trace: unknown) => GenerationTrace;
  return patch({ jobKind: "analysis", mode: "analysis" });
}

describe("generate-card analysis emphasis-read steps", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.markGenerationRun.mockResolvedValue({ id: "generation-run-id" });
    mocks.mutateCard.mockResolvedValue(null);
    mocks.transitionGenerationRunById.mockResolvedValue({ id: "generation-run-id" });
    mocks.settleAlphaRunRequest.mockResolvedValue(null);
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
      card: cardWithCitations(8, { includeCompanySite: true }),
      sections,
      sources: [providerSource],
      tracePatch: {
        extraction: { sourceCount: 1, evidenceCount: 1, citationCount: 8, fallbackUsed: false }
      }
    });
    mocks.synthesizeCard.mockResolvedValue({
      whyItMatters,
      bullCase: [bullCase],
      bearCase: [],
      openQuestions: [{ question: "What buyer owns the renewal decision?", category: "buyer_budget" }]
    });
    mocks.fetchFounderVoiceEvidence.mockResolvedValue(founderVoiceEvidence());
    mocks.synthesizeEmphasisRead.mockResolvedValue(emphasisReadFixture);
    // No result carries claimIndex, so applyVerifierResults (packages/llm/src/verifier.ts) falls
    // back to matching each claim by its own {text, citationIds} key; ordering inside the full
    // claims array (synthesis claims followed by the emphasis loud/read/quiet claims,
    // verifyCardSynthesisDraft in packages/pipeline/src/generate-card.ts) never matters here.
    mocks.verifySynthesis.mockResolvedValue([
      { ...whyItMatters, status: "supported" },
      { ...bullCase, status: "supported" },
      { ...emphasisReadFixture.loud, status: "supported" },
      { ...emphasisReadFixture.read, status: "supported" }
    ]);
  });

  it("runs fetch-founder-voice then emphasis-read, both between synthesize-card and verify-synthesis", async () => {
    const { names } = await runAnalysisGeneration();

    expect(names).toContain("synthesize-card");
    expect(names).toContain("fetch-founder-voice");
    expect(names).toContain("emphasis-read");
    expect(names).toContain("verify-synthesis");
    expect(names.indexOf("fetch-founder-voice")).toBeGreaterThan(names.indexOf("synthesize-card"));
    expect(names.indexOf("emphasis-read")).toBeGreaterThan(names.indexOf("fetch-founder-voice"));
    expect(names.indexOf("verify-synthesis")).toBeGreaterThan(names.indexOf("emphasis-read"));
  });

  it("puts founder-voice citations on the card before emphasis-read consumes it", async () => {
    await runAnalysisGeneration();

    expect(mocks.synthesizeEmphasisRead).toHaveBeenCalledTimes(1);
    const cardArg = mocks.synthesizeEmphasisRead.mock.calls[0]?.[0]?.card as ColdStartCard;
    const fvCitation = cardArg.citations.find((citation) => citation.id === "fv1");
    expect(fvCitation).toMatchObject({
      url: founderVoiceItem.url,
      sourceQuality: expect.objectContaining({ tier: "founder_authored" })
    });
  });

  it("emits emphasis.started and emphasis.complete around the enabled path, in order with synthesis/verify", async () => {
    await runAnalysisGeneration();

    const types = eventTypes();
    expect(types).toContain("emphasis.started");
    expect(types).toContain("emphasis.complete");
    // synthesis.started -> emphasis.started -> verify.started -> verify.complete ->
    // emphasis.complete: emphasis-complete reads verify's outcome (verified.emphasisRead), so it
    // fires after verify.complete, not before verify.started.
    expect(types.indexOf("synthesis.started")).toBeLessThan(types.indexOf("emphasis.started"));
    expect(types.indexOf("emphasis.started")).toBeLessThan(types.indexOf("verify.started"));
    expect(types.indexOf("verify.started")).toBeLessThan(types.indexOf("verify.complete"));
    expect(types.indexOf("verify.complete")).toBeLessThan(types.indexOf("emphasis.complete"));

    const completeEvent = eventOfType("emphasis.complete");
    expect(completeEvent?.metadata).toMatchObject({ status: "read" });
  });

  it("skips emphasis.started but still fires emphasis.complete with status thin_file when the card lacks company-authored evidence", async () => {
    mocks.generateCardForDomainWithTrace.mockResolvedValue({
      card: cardWithCitations(8, { includeCompanySite: false }),
      sections,
      sources: [providerSource],
      tracePatch: {
        extraction: { sourceCount: 1, evidenceCount: 1, citationCount: 8, fallbackUsed: false }
      }
    });

    const { names } = await runAnalysisGeneration();

    expect(mocks.fetchFounderVoiceEvidence).not.toHaveBeenCalled();
    expect(mocks.synthesizeEmphasisRead).not.toHaveBeenCalled();
    expect(names).not.toContain("fetch-founder-voice");
    expect(names).not.toContain("emphasis-read");

    const types = eventTypes();
    expect(types).not.toContain("emphasis.started");
    expect(types).toContain("emphasis.complete");
    expect(eventOfType("emphasis.complete")?.metadata).toMatchObject({ status: "thin_file" });

    const trace = persistedTrace();
    expect(trace.steps?.["fetch-founder-voice"]?.status).toBe("skipped");
    expect(trace.steps?.["emphasis-read"]?.status).toBe("skipped");
    expect(trace.emphasis).toMatchObject({ enabled: true, status: "thin_file", thinFileReason: "no-company-authored" });
  });

  it("accumulates the trace emphasis block across the fetch and verify merges instead of one wiping the other", async () => {
    await runAnalysisGeneration();

    const trace = persistedTrace();
    // laneCounts/laneFailures/estimatedLaneCostUsd come from the fetch-founder-voice merge;
    // status comes from the later verify-outcome merge. Both must survive on the same
    // trace.emphasis object: generation-trace.ts's mergeTracePatch shallow-merges "emphasis"
    // (a wholesale replace, like synthesis/sourceGate, would let the later call erase the
    // earlier fields).
    expect(trace.emphasis).toMatchObject({
      enabled: true,
      status: "read",
      laneCounts: expect.objectContaining({ hn_search: 1 }),
      laneFailures: expect.arrayContaining([expect.stringContaining("xai_x_search")])
    });
  });

  it("attaches the verified emphasis read to the stored card's synthesis.emphasisRead", async () => {
    await runAnalysisGeneration();

    const storedCard = mocks.upsertCard.mock.calls.at(-1)?.[1] as ColdStartCard;
    expect(storedCard.synthesis?.emphasisRead).toEqual(emphasisReadFixture);
  });

  // Coordinator review IMPORTANT-1: on a repeat analysis run over a slug whose stored card
  // already carries fv-prefixed citations from a prior run, generatedCard.citations can already
  // carry those same fv ids (extraction reuse spreads the existing card's citations wholesale).
  // Before the fix, founderVoiceCitations always numbered a fresh batch from 1 and the wiring
  // appended unconditionally, so the working card ended up with two "fv1" entries (stale content
  // plus fresh content) and emphasisSourceDigests fed the emphasis LLM two digests under one
  // ambiguous label.
  it("dedupes fv citations and renumbers past the existing card's range on a second analysis run", async () => {
    const staleFvCitation = {
      id: "fv1",
      url: "https://old.example/founder-post-from-last-run",
      title: "Old founder post",
      fetchedAt: "2026-07-01T00:00:00.000Z",
      sourceType: "other" as const,
      snippet: "Stale founder content from a prior run.",
      sourceQuality: {
        tier: "founder_authored" as const,
        label: "Founder-authored",
        rationale: "The founder's own public voice.",
        incentive: "Personal and company promotion."
      }
    };
    const baseCitations = cardWithCitations(8, { includeCompanySite: true }).citations;
    const cardWithStaleFv: ColdStartCard = {
      ...cardWithCitations(8, { includeCompanySite: true }),
      citations: [...baseCitations, staleFvCitation]
    };

    // generatedCard.citations already carries the stale fv1 (extraction reuse), and the stored
    // existingCard row does too (mergeByKey's fallback side of the union at storage time).
    mocks.generateCardForDomainWithTrace.mockResolvedValue({
      card: cardWithStaleFv,
      sections,
      sources: [providerSource],
      tracePatch: {
        extraction: { sourceCount: 1, evidenceCount: 1, citationCount: 9, fallbackUsed: false }
      }
    });
    mocks.findCardBySlug.mockResolvedValue(cardWithStaleFv);

    await runAnalysisGeneration();

    expect(mocks.synthesizeEmphasisRead).toHaveBeenCalledTimes(1);
    const cardArg = mocks.synthesizeEmphasisRead.mock.calls[0]?.[0]?.card as ColdStartCard;
    const ids = cardArg.citations.map((citation) => citation.id);

    // No duplicate ids on the card the emphasis step (and its digests, one per citation id) read.
    expect(new Set(ids).size).toBe(ids.length);
    // The stale fv1 is stripped from the working card; the fresh item is renumbered past it.
    expect(ids).not.toContain("fv1");
    expect(ids).toContain("fv2");
    expect(cardArg.citations.find((citation) => citation.id === "fv2")?.url).toBe(founderVoiceItem.url);

    // fv1 still resolves on the stored card (mergeByKey pulls it back in from existingCard, the
    // fallback side of the union) with its original content untouched, since the fresh item
    // landed at fv2 instead of colliding with it.
    const storedCard = mocks.upsertCard.mock.calls.at(-1)?.[1] as ColdStartCard;
    const storedIds = storedCard.citations.map((citation) => citation.id);
    expect(new Set(storedIds).size).toBe(storedIds.length);
    expect(storedCard.citations.find((citation) => citation.id === "fv1")?.url).toBe(staleFvCitation.url);
    expect(storedCard.citations.find((citation) => citation.id === "fv2")?.url).toBe(founderVoiceItem.url);
  });
});
