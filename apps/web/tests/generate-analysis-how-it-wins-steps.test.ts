import { beforeEach, describe, expect, it, vi } from "vitest";

import type { ColdStartCard, GenerationTrace } from "@cold-start/core";
import type { FounderVoiceItem } from "@cold-start/providers";

import type { GenerationStepWarning } from "../src/inngest/client";

// Sibling to generate-analysis-emphasis-steps.test.ts, scoped to the how-it-wins wiring: drives
// the real generateCardHandler for mode "analysis" with both HOW_IT_WINS_ENABLED and
// EMPHASIS_READ_ENABLED left at their production defaults (on), and asserts the how-it-wins step
// placement, its events, its trace block, and the verified read landing on the stored card.
// synthesizeHowItWins is the one boundary this suite mocks that the emphasis sibling does not;
// fetchFounderVoiceEvidence and synthesizeEmphasisRead stay mocked exactly as that file does, so
// the emphasis pair runs its real default-on path alongside the how-it-wins step.
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
const howItWinsPair = {
  strategies: ["specialization", "iteration"] as const,
  note: "A narrow surface plus weekly shipping compounds faster than a broad platform can. [c3]",
  wrongIf: "The roadmap widens past compute.",
  citationIds: ["c3"]
};
const howItWinsReadFixture = {
  status: "read" as const,
  sentence: "Modal wins by staying narrow on compute and shipping faster than broader platforms.",
  running: [runningOne, runningTwo],
  pair: howItWinsPair,
  next: [],
  wrongIf: "A broad cloud matches the release cadence on serverless GPU."
};
const howItWinsStageResult = {
  read: howItWinsReadFixture,
  editorSkipped: false,
  fitRetried: true,
  styleIssues: []
};
const runningClaimOne = { text: runningOne.note, citationIds: runningOne.citationIds };
const runningClaimTwo = { text: runningTwo.note, citationIds: runningTwo.citationIds };
const howItWinsPairClaim = { text: howItWinsPair.note, citationIds: howItWinsPair.citationIds };

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
  synthesizeHowItWins: vi.fn(),
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
    synthesizeEmphasisRead: mocks.synthesizeEmphasisRead,
    synthesizeHowItWins: mocks.synthesizeHowItWins
  };
});

// Only generateCardForDomainWithTrace is overridden here, same as the sibling suite:
// evaluateSynthesisGate, synthesizeCardDraft, and verifyCardSynthesisDraft (including both the
// emphasisRead and the howItWins extras) run for real via importActual.
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

async function runAnalysisGeneration(
  harness: ReturnType<typeof stepHarness> = stepHarness(),
  options: { howItWinsEnabled?: boolean } = {}
) {
  vi.resetModules();
  process.env.DATABASE_URL = "postgres://cold-start-test";
  process.env.NEXT_PUBLIC_WEB_ORIGIN = "http://localhost:3000";
  process.env.CONTACT_ENRICHMENT_ENABLED = "false";
  delete process.env.ANALYSIS_SYNTHESIS_MIN_CITATIONS;
  // Left unset deliberately: emphasisReadEnabled() defaults on, and this suite runs the emphasis
  // pair alongside the how-it-wins step so the two concurrent closures are exercised together.
  delete process.env.EMPHASIS_READ_ENABLED;
  if (options.howItWinsEnabled === false) {
    process.env.HOW_IT_WINS_ENABLED = "false";
  } else {
    delete process.env.HOW_IT_WINS_ENABLED;
  }

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

describe("generate-card analysis how-it-wins step", () => {
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
    mocks.synthesizeHowItWins.mockResolvedValue(howItWinsStageResult);
    // No result carries claimIndex, so applyVerifierResults falls back to matching each claim by
    // its own {text, citationIds} key; the ordering inside the full claims array never matters.
    mocks.verifySynthesis.mockResolvedValue([
      { ...whyItMatters, status: "supported" },
      { ...bullCase, status: "supported" },
      { ...emphasisReadFixture.loud, status: "supported" },
      { ...emphasisReadFixture.read, status: "supported" },
      { ...runningClaimOne, status: "supported" },
      { ...runningClaimTwo, status: "supported" },
      { ...howItWinsPairClaim, status: "supported" }
    ]);
  });

  it("runs how-it-wins after synthesize-card and before verify-synthesis", async () => {
    const { names } = await runAnalysisGeneration();

    expect(names).toContain("how-it-wins");
    expect(names.indexOf("how-it-wins")).toBeGreaterThan(names.indexOf("synthesize-card"));
    expect(names.indexOf("how-it-wins")).toBeLessThan(names.indexOf("verify-synthesis"));
  });

  // The how-it-wins step runs concurrently with the founder-voice fetch and the emphasis-read
  // step (functions.ts awaits both closures through one Promise.all), so its own start is not
  // queued behind the emphasis pair. Both assertions read the same deterministic microtask
  // ordering the step harness records: nothing here depends on wall-clock timing.
  it("starts how-it-wins without waiting for the emphasis pair to finish", async () => {
    const { names } = await runAnalysisGeneration();

    expect(names.indexOf("event-how-it-wins-started")).toBeLessThan(names.indexOf("emphasis-read"));
    // The card handed to the stage is the snapshot taken right after the synthesis draft, before
    // the emphasis closure appends this run's founder-voice citations to the working card.
    const cardArg = mocks.synthesizeHowItWins.mock.calls[0]?.[0]?.card as ColdStartCard;
    expect(cardArg.citations.some((citation) => citation.id.startsWith("fv"))).toBe(false);
  });

  it("emits how-it-wins.started then how-it-wins.complete with status read", async () => {
    await runAnalysisGeneration();

    const types = eventTypes();
    expect(types).toContain("how-it-wins.started");
    expect(types).toContain("how-it-wins.complete");
    // how-it-wins.complete reads verify's outcome, so it fires after verify.complete, the same
    // ordering the emphasis pair follows.
    expect(types.indexOf("synthesis.started")).toBeLessThan(types.indexOf("how-it-wins.started"));
    expect(types.indexOf("how-it-wins.started")).toBeLessThan(types.indexOf("verify.started"));
    expect(types.indexOf("verify.complete")).toBeLessThan(types.indexOf("how-it-wins.complete"));

    const startedEvent = eventOfType("how-it-wins.started");
    expect(startedEvent?.message).toBe("Reading how it wins");
    const completeEvent = eventOfType("how-it-wins.complete");
    expect(completeEvent?.message).toBe("How it wins filed");
    expect(completeEvent?.metadata).toMatchObject({ status: "read" });
  });

  it("records the how-it-wins trace block and attaches the verified read to the stored card", async () => {
    await runAnalysisGeneration();

    const trace = persistedTrace();
    expect(trace.howItWins).toMatchObject({ enabled: true, status: "read", fitRetried: true, editorSkipped: false });
    expect(trace.steps?.["how-it-wins"]?.status).toBe("complete");

    const storedCard = mocks.upsertCard.mock.calls.at(-1)?.[1] as ColdStartCard;
    expect(storedCard.synthesis?.howItWins?.status).toBe("read");
    expect(storedCard.synthesis?.howItWins).toEqual(howItWinsReadFixture);
    // The emphasis read still lands on the same synthesis: the two closures write different
    // fields, neither overwriting the other.
    expect(storedCard.synthesis?.emphasisRead).toEqual(emphasisReadFixture);
  });

  it("skips the step entirely when HOW_IT_WINS_ENABLED=false", async () => {
    const { names } = await runAnalysisGeneration(stepHarness(), { howItWinsEnabled: false });

    expect(mocks.synthesizeHowItWins).not.toHaveBeenCalled();
    expect(names).not.toContain("how-it-wins");

    const types = eventTypes();
    expect(types).not.toContain("how-it-wins.started");
    expect(types).not.toContain("how-it-wins.complete");

    const trace = persistedTrace();
    expect(trace.steps?.["how-it-wins"]).toMatchObject({ status: "skipped", message: "HOW_IT_WINS_ENABLED=false" });

    // The emphasis pair is unaffected by the how-it-wins flag.
    expect(mocks.synthesizeEmphasisRead).toHaveBeenCalledTimes(1);
    const storedCard = mocks.upsertCard.mock.calls.at(-1)?.[1] as ColdStartCard;
    expect(storedCard.synthesis?.howItWins).toBeUndefined();
  });

  // A semantic failure of the stage (an unparseable draft, a citation that is not on the card)
  // must never fail the analysis run: the step body memoizes it as { ok: false } and the wiring
  // degrades to nothing_stands_out, while the trace still records the step as failed so the
  // failure is not invisible.
  it("degrades to nothing_stands_out when the stage fails semantically, without failing the run", async () => {
    mocks.synthesizeHowItWins.mockRejectedValue(new Error("how-it-wins draft did not parse"));

    await runAnalysisGeneration();

    const trace = persistedTrace();
    expect(trace.steps?.["how-it-wins"]).toMatchObject({
      status: "failed",
      message: "how-it-wins draft did not parse"
    });
    expect(trace.howItWins).toMatchObject({ enabled: true, status: "nothing_stands_out" });
    expect(trace.failure).toBeUndefined();

    const completeEvent = eventOfType("how-it-wins.complete");
    expect(completeEvent?.message).toBe("No how-it-wins read");
    expect(completeEvent?.metadata).toMatchObject({ status: "nothing_stands_out" });

    const storedCard = mocks.upsertCard.mock.calls.at(-1)?.[1] as ColdStartCard;
    expect(storedCard.synthesis?.howItWins).toEqual({ status: "nothing_stands_out" });
    // The rest of the run is untouched: the synthesis and the emphasis read still land.
    expect(storedCard.synthesis?.emphasisRead).toEqual(emphasisReadFixture);
  });

  // Same gate as the emphasis read (howItWinsThinFileReason is emphasisThinFileReason), so a card
  // with no company-authored citation thin-files both. The gate runs in code before any model
  // call: no lane fetch, no four passes, no started event.
  it("thin-files a card with no company-authored evidence without a model call", async () => {
    mocks.generateCardForDomainWithTrace.mockResolvedValue({
      card: cardWithCitations(8, { includeCompanySite: false }),
      sections,
      sources: [providerSource],
      tracePatch: {
        extraction: { sourceCount: 1, evidenceCount: 1, citationCount: 8, fallbackUsed: false }
      }
    });

    const { names } = await runAnalysisGeneration();

    expect(mocks.synthesizeHowItWins).not.toHaveBeenCalled();
    expect(names).not.toContain("how-it-wins");

    const types = eventTypes();
    expect(types).not.toContain("how-it-wins.started");
    expect(eventOfType("how-it-wins.complete")?.metadata).toMatchObject({ status: "thin_file" });

    const trace = persistedTrace();
    expect(trace.steps?.["how-it-wins"]?.status).toBe("skipped");
    expect(trace.howItWins).toMatchObject({ enabled: true, status: "thin_file", thinFileReason: "no-company-authored" });

    const storedCard = mocks.upsertCard.mock.calls.at(-1)?.[1] as ColdStartCard;
    expect(storedCard.synthesis?.howItWins).toEqual({ status: "thin_file" });
  });
});
