import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  buildSeedProfileCard,
  buildSkeletonCard,
  cardWithExtractedSections,
  type ExtractedCardSections,
  fallbackSectionsFromEvidence,
  finalizeGeneratedCard,
  generateCardForDomain,
  generateCardForDomainWithTrace,
  type GenerateCardDeps
} from "../src/index";

const originalAnalysisSynthesisMinCitations = process.env.ANALYSIS_SYNTHESIS_MIN_CITATIONS;

beforeEach(() => {
  process.env.ANALYSIS_SYNTHESIS_MIN_CITATIONS = "0";
});

afterEach(() => {
  if (originalAnalysisSynthesisMinCitations === undefined) {
    delete process.env.ANALYSIS_SYNTHESIS_MIN_CITATIONS;
  } else {
    process.env.ANALYSIS_SYNTHESIS_MIN_CITATIONS = originalAnalysisSynthesisMinCitations;
  }
});

describe("buildSkeletonCard", () => {
  it("creates a public-safe unknown card before evidence arrives", () => {
    const card = buildSkeletonCard("cartesia.ai");

    expect(card.slug).toBe("cartesia");
    expect(card.identity.name.status).toBe("unknown");
    expect(card.identity.name.value).toBeNull();
    expect(card.synthesis).toBeUndefined();
  });

  it("creates independent citation arrays for unknown facts", () => {
    const card = buildSkeletonCard("cartesia.ai");

    card.identity.name.citationIds.push("mutated");

    expect(card.identity.oneLiner.citationIds).toEqual([]);
    expect(card.funding.totalRaisedUsd.citationIds).toEqual([]);
  });

  it("uses the domain-derived company name when fallback evidence starts with a news headline", () => {
    const skeleton = buildSkeletonCard("wabi.ai");
    const sections = fallbackSectionsFromEvidence(skeleton, [
      {
        id: "e1",
        url: "https://techcrunch.com/2026/05/01/waabi-raises-1b",
        title: "Waabi raises $1B and expands into robotaxis with Uber | TechCrunch",
        sourceType: "news",
        fetchedAt: "2026-06-04T00:00:00.000Z",
        intents: ["funding"],
        authorityScore: 12,
        rawText: "Waabi raised $1 billion and works on autonomous trucking.",
        supportingSnippets: ["Waabi raised $1 billion and works on autonomous trucking."]
      }
    ]);

    expect(sections?.identity.name.value).toBe("Wabi");
  });
});

describe("buildSeedProfileCard", () => {
  it("creates a cited provider-first card without LLM extraction", () => {
    const seeded = buildSeedProfileCard({
      domain: "cartesia.ai",
      sources: [
        {
          url: "https://cartesia.ai",
          title: "Cartesia",
          sourceType: "company_site",
          fetchedAt: "2026-05-19T00:00:00.000Z",
          rawText: "Cartesia builds real-time multimodal intelligence for voice agents and interactive applications.",
          intent: "homepage"
        }
      ],
      providerFacts: [
        {
          path: "identity.name",
          value: "Cartesia",
          status: "inferred",
          confidence: "high",
          sourceType: "enrichment",
          provider: "stableenrich",
          endpoint: "org_enrichment",
          citationUrl: "https://stableenrich.dev/api/apollo/org-enrich?domain=cartesia.ai",
          citationTitle: "Apollo org enrichment for cartesia.ai",
          fetchedAt: "2026-05-19T00:00:00.000Z",
          rawText: "{}"
        },
        {
          path: "identity.description",
          value: {
            shortDescription: "Cartesia builds real-time multimodal intelligence for voice agents.",
            concept: null,
            serves: null,
            mechanism: null
          },
          status: "inferred",
          confidence: "medium",
          sourceType: "enrichment",
          provider: "stableenrich",
          endpoint: "org_enrichment",
          citationUrl: "https://stableenrich.dev/api/apollo/org-enrich?domain=cartesia.ai",
          citationTitle: "Apollo org enrichment for cartesia.ai",
          fetchedAt: "2026-05-19T00:00:00.000Z",
          rawText: "{}"
        }
      ]
    });

    expect(seeded.card.identity.name.value).toBe("Cartesia");
    expect(seeded.card.identity.oneLiner.value).toBe("Cartesia builds real-time multimodal intelligence for voice agents.");
    expect(seeded.card.citations.length).toBeGreaterThan(0);
    expect(seeded.trace.providerFactAppliedCount).toBe(2);
  });

  it("compresses provider description fields before they become reader-facing card copy", () => {
    const seeded = buildSeedProfileCard({
      domain: "oboe.com",
      sources: [],
      providerFacts: [
        {
          path: "identity.name",
          value: "Oboe",
          status: "inferred",
          confidence: "high",
          sourceType: "enrichment",
          provider: "stableenrich",
          endpoint: "org_enrichment",
          citationUrl: "https://stableenrich.dev/api/apollo/org-enrich?domain=oboe.com",
          citationTitle: "Apollo org enrichment for oboe.com",
          fetchedAt: "2026-05-26T18:00:00.000Z",
          rawText: "{}"
        },
        {
          path: "identity.description",
          value: {
            shortDescription:
              "Oboe is an AI-native learning platform that creates personalized educational courses on any topic. Founded by Michael Mignano and Nir Zicherman, Oboe aims to enhance learning experiences through AI-powered tutors, eliminating the need for human instructors or pre-recorded content. The platform generates structured, chapter-based curricula that adapt to individual user goals, prior knowledge, learning styles, and available time.",
            concept:
              "Oboe helps users create personalized educational courses on any topic with AI-generated curricula and tutors. It also supports quizzes, flashcards, games, and multiple learning formats.",
            serves:
              "The platform appears to serve individual learners, corporate training teams, and higher education institutions. It may also serve creators who want to package expertise into courses.",
            mechanism:
              "Users start with a diagnostic conversation that tailors the learning journey, then Oboe generates a structured chapter-based course. The system adapts to user goals, prior knowledge, learning style, and available time."
          },
          status: "inferred",
          confidence: "medium",
          sourceType: "enrichment",
          provider: "stableenrich",
          endpoint: "org_enrichment",
          citationUrl: "https://stableenrich.dev/api/apollo/org-enrich?domain=oboe.com",
          citationTitle: "Apollo org enrichment for oboe.com",
          fetchedAt: "2026-05-26T18:00:00.000Z",
          rawText: "{}"
        }
      ]
    });

    const description = seeded.card.identity.description?.value;
    expect(description?.shortDescription.length).toBeLessThanOrEqual(180);
    expect(description?.concept?.split(".").filter(Boolean)).toHaveLength(1);
    expect(description?.serves?.split(".").filter(Boolean)).toHaveLength(1);
    expect(description?.mechanism?.split(".").filter(Boolean)).toHaveLength(1);
    expect(seeded.card.identity.oneLiner.value).not.toContain("Founded by");
  });
});

describe("generateCardForDomain", () => {
  const citation = {
    id: "c1",
    url: "https://cartesia.ai/",
    title: "Cartesia",
    fetchedAt: "2026-05-06T12:00:00.000Z",
    sourceType: "company_site" as const,
    snippet: "Cartesia is building voice AI infrastructure."
  };

  it("does not attach synthesis without a verifier", async () => {
    const skeleton = buildSkeletonCard("cartesia.ai");
    const whyItMatters = { text: "Cartesia is building voice AI infrastructure. [c1]", citationIds: ["c1"] };
    const bullCase = { text: "Cartesia has public product evidence. [c1]", citationIds: ["c1"] };
    const bearCase = { text: "Cartesia still needs clearer public traction evidence. [c1]", citationIds: ["c1"] };

    const card = await generateCardForDomain("cartesia.ai", {
      fetchSources: async () => [],
      extractSections: async () => ({
        identity: skeleton.identity,
        funding: skeleton.funding,
        team: skeleton.team,
        signals: [],
        comparables: [],
        citations: [citation]
      }),
      synthesize: async () => ({
        whyItMatters,
        bullCase: [bullCase],
        bearCase: [bearCase],
        openQuestions: ["What customer traction has Cartesia disclosed?"]
      })
    } as unknown as GenerateCardDeps);

    expect(card.synthesis).toBeUndefined();
    expect(card.generationCostUsd).toBe(0);
  });

  it("drops unresolved extracted citation refs instead of crashing the run", async () => {
    // Reproduces the SpaceX basics failure: extraction cited evidence-ledger id "e19"
    // on identity facts, but no citation with id "e19" survived in citations[]. The full
    // schema parse used to throw a ZodError, which then leaked into every public section.
    const skeleton = buildSkeletonCard("spacex.com");

    const card = await generateCardForDomain("spacex.com", {
      fetchSources: async () => [],
      extractSections: async () => ({
        identity: {
          ...skeleton.identity,
          name: { value: "SpaceX", status: "verified", confidence: "high", citationIds: ["e19", "c1"] },
          websiteUrl: { value: "https://spacex.com", status: "verified", confidence: "high", citationIds: ["e19"] },
          linkedinUrl: { value: "https://www.linkedin.com/company/spacex", status: "verified", confidence: "high", citationIds: ["e19"] }
        },
        funding: skeleton.funding,
        team: skeleton.team,
        signals: [],
        comparables: [],
        citations: [
          { id: "c1", url: "https://spacex.com/", title: "SpaceX", fetchedAt: "2026-05-29T00:00:00.000Z", sourceType: "company_site" as const }
        ]
      })
    } as unknown as GenerateCardDeps);

    // The run completes. The unresolved "e19" ref is dropped everywhere.
    expect(card.identity.name.value).toBe("SpaceX");
    expect(card.identity.name.citationIds).toEqual(["c1"]);
    expect(card.identity.websiteUrl?.value ?? null).toBeNull();
    expect(card.identity.linkedinUrl?.value ?? null).toBeNull();
    const allRefs = [
      ...card.identity.name.citationIds,
      ...(card.identity.websiteUrl?.citationIds ?? []),
      ...(card.identity.linkedinUrl?.citationIds ?? [])
    ];
    expect(allRefs).not.toContain("e19");
  });

  it("includes cost lines added during synthesis and verification", async () => {
    const skeleton = buildSkeletonCard("cartesia.ai");
    const costLines = [{ label: "provider", usd: 0.01 }];
    const whyItMatters = { text: "Cartesia is building voice AI infrastructure. [c1]", citationIds: ["c1"] };

    const card = await generateCardForDomain("cartesia.ai", {
      costLines,
      fetchSources: async () => [],
      extractSections: async () => ({
        identity: skeleton.identity,
        funding: skeleton.funding,
        team: skeleton.team,
        signals: [],
        comparables: [],
        citations: [citation]
      }),
      synthesize: async () => {
        costLines.push({ label: "synthesis", usd: 0.02 });
        return {
          whyItMatters,
          bullCase: [],
          bearCase: [],
          openQuestions: ["What customer traction has Cartesia disclosed?"]
        };
      },
      verify: async () => {
        costLines.push({ label: "verify", usd: 0.03 });
        return [{ ...whyItMatters, status: "supported" }];
      },
      synthesisRequired: true
    });

    expect(card.generationCostUsd).toBe(0.06);
    expect(card.synthesis?.whyItMatters).toEqual(whyItMatters);
  });

  it("falls back to a supported synthesis claim when whyItMatters is unsupported", async () => {
    const skeleton = buildSkeletonCard("cartesia.ai");
    const whyItMatters = { text: "Cartesia is building voice AI infrastructure. [c1]", citationIds: ["c1"] };
    const bullCase = { text: "Cartesia has public product evidence. [c1]", citationIds: ["c1"] };
    const bearCase = { text: "Cartesia still needs clearer public traction evidence. [c1]", citationIds: ["c1"] };

    const card = await generateCardForDomain("cartesia.ai", {
      fetchSources: async () => [],
      extractSections: async () => ({
        identity: skeleton.identity,
        funding: skeleton.funding,
        team: skeleton.team,
        signals: [],
        comparables: [],
        citations: [citation]
      }),
      synthesize: async () => ({
        whyItMatters,
        bullCase: [bullCase],
        bearCase: [bearCase],
        openQuestions: ["What customer traction has Cartesia disclosed?"]
      }),
      verify: async () => [
        { ...whyItMatters, status: "unsupported" },
        { ...bullCase, status: "supported" },
        { ...bearCase, status: "supported" }
      ]
    });

    expect(card.synthesis?.whyItMatters).toEqual(bullCase);
    expect(card.synthesis?.bullCase).toEqual([]);
    expect(card.synthesis?.bearCase).toEqual([bearCase]);
  });

  it("fails required synthesis when no verified claims survive", async () => {
    const skeleton = buildSkeletonCard("cartesia.ai");
    const whyItMatters = { text: "Cartesia is building voice AI infrastructure. [c1]", citationIds: ["c1"] };
    const bullCase = { text: "Cartesia has public product evidence. [c1]", citationIds: ["c1"] };

    await expect(
      generateCardForDomain("cartesia.ai", {
        fetchSources: async () => [],
        extractSections: async () => ({
          identity: skeleton.identity,
          funding: skeleton.funding,
          team: skeleton.team,
          signals: [],
          comparables: [],
          citations: [citation]
        }),
        synthesize: async () => ({
          whyItMatters,
          bullCase: [bullCase],
          bearCase: [],
          openQuestions: ["What customer traction has Cartesia disclosed?"]
        }),
        verify: async () => [
          { ...whyItMatters, status: "unsupported" },
          { ...bullCase, status: "unsupported" }
        ],
        synthesisRequired: true
      })
    ).rejects.toThrow("No synthesis claims survived verification");
  });

  it("keeps verifier-dropped bull and bear claims dropped even when whole sections are empty", async () => {
    const skeleton = buildSkeletonCard("cartesia.ai");
    const whyItMatters = { text: "Cartesia is building voice AI infrastructure. [c1]", citationIds: ["c1"] };
    const bullCase = [
      { text: "Cartesia has a focused infrastructure wedge. [c1]", citationIds: ["c1"] },
      { text: "Developer adoption can compound through APIs. [c1]", citationIds: ["c1"] },
      { text: "Enterprise demand for low-latency voice is visible. [c1]", citationIds: ["c1"] },
    ];
    const bearCase = [
      { text: "Durable differentiation is not fully proven. [c1]", citationIds: ["c1"] },
      { text: "Gross margin is not disclosed. [c1]", citationIds: ["c1"] },
      { text: "Customer concentration remains unclear. [c1]", citationIds: ["c1"] },
    ];

    const card = await generateCardForDomain("cartesia.ai", {
      fetchSources: async () => [],
      extractSections: async () => ({
        identity: skeleton.identity,
        funding: skeleton.funding,
        team: skeleton.team,
        signals: [],
        comparables: [],
        citations: [citation]
      }),
      synthesize: async () => ({
        whyItMatters,
        bullCase,
        bearCase,
        openQuestions: ["What is retention?", "What is margin?", "What is concentration?"]
      }),
      verify: async () => [
        { ...whyItMatters, status: "supported" },
        ...bullCase.map((claim) => ({ ...claim, status: "unsupported" as const })),
        ...bearCase.map((claim) => ({ ...claim, status: "unsupported" as const })),
      ],
      synthesisRequired: true
    });

    expect(card.synthesis?.whyItMatters).toEqual(whyItMatters);
    expect(card.synthesis?.bullCase).toEqual([]);
    expect(card.synthesis?.bearCase).toEqual([]);
  });

  it("keeps only supported bull and bear claims after verification", async () => {
    const skeleton = buildSkeletonCard("cartesia.ai");
    const whyItMatters = { text: "Cartesia is building voice AI infrastructure. [c1]", citationIds: ["c1"] };
    const bullCase = [
      { text: "Cartesia has a focused infrastructure wedge. [c1]", citationIds: ["c1"] },
      { text: "Developer adoption can compound through APIs. [c1]", citationIds: ["c1"] },
      { text: "Enterprise demand for low-latency voice is visible. [c1]", citationIds: ["c1"] },
    ];
    const bearCase = [
      { text: "Durable differentiation is not fully proven. [c1]", citationIds: ["c1"] },
      { text: "Gross margin is not disclosed. [c1]", citationIds: ["c1"] },
      { text: "Customer concentration remains unclear. [c1]", citationIds: ["c1"] },
    ];

    const card = await generateCardForDomain("cartesia.ai", {
      fetchSources: async () => [],
      extractSections: async () => ({
        identity: skeleton.identity,
        funding: skeleton.funding,
        team: skeleton.team,
        signals: [],
        comparables: [],
        citations: [citation]
      }),
      synthesize: async () => ({
        whyItMatters,
        bullCase,
        bearCase,
        openQuestions: ["What is retention?", "What is margin?", "What is concentration?"]
      }),
      verify: async () => [
        { ...whyItMatters, status: "supported" },
        { ...bullCase[0]!, status: "supported" },
        ...bullCase.slice(1).map((claim) => ({ ...claim, status: "unsupported" as const })),
        ...bearCase.map((claim) => ({ ...claim, status: "unsupported" as const })),
      ],
      synthesisRequired: true
    });

    expect(card.synthesis?.bullCase).toEqual([bullCase[0]]);
    expect(card.synthesis?.bearCase).toEqual([]);
  });

  it("verifies market structure claims with the rest of synthesis", async () => {
    const skeleton = buildSkeletonCard("cartesia.ai");
    const whyItMatters = { text: "Cartesia is building voice AI infrastructure. [c1]", citationIds: ["c1"] };
    const buyerBudget = { text: "The likely buyer budget is contact-center automation. [c1]", citationIds: ["c1"] };
    const painSeverity = { text: "Unsupported market pain. [c1]", citationIds: ["c1"] };

    const card = await generateCardForDomain("cartesia.ai", {
      fetchSources: async () => [],
      extractSections: async () => ({
        identity: skeleton.identity,
        funding: skeleton.funding,
        team: skeleton.team,
        signals: [],
        comparables: [],
        citations: [citation]
      }),
      synthesize: async () => ({
        whyItMatters,
        bullCase: [],
        bearCase: [],
        openQuestions: ["Which buyer owns the budget?"],
        marketStructureAndTiming: {
          buyerBudget,
          painSeverity,
          adoptionTrigger: null,
          marketStructure: null,
          profitPool: null,
          expansionPath: null,
          timingRisk: null
        }
      }),
      verify: async () => [
        { ...whyItMatters, status: "supported" },
        { ...buyerBudget, status: "supported" },
        { ...painSeverity, status: "unsupported" }
      ],
      synthesisRequired: true
    });

    expect(card.synthesis?.marketStructureAndTiming).toEqual({
      buyerBudget,
      painSeverity: null,
      adoptionTrigger: null,
      marketStructure: null,
      profitPool: null,
      expansionPath: null,
      timingRisk: null
    });
  });

  it("keeps the extracted card when optional synthesis fails", async () => {
    const skeleton = buildSkeletonCard("cartesia.ai");
    const verify = vi.fn();

    const card = await generateCardForDomain("cartesia.ai", {
      fetchSources: async () => [],
      extractSections: async () => ({
        identity: {
          ...skeleton.identity,
          name: {
            value: "Cartesia",
            status: "verified",
            confidence: "high",
            citationIds: ["c1"]
          }
        },
        funding: skeleton.funding,
        team: skeleton.team,
        signals: [],
        comparables: [],
        citations: [citation]
      }),
      synthesize: async () => {
        throw new Error("Synthesis citation ID not found on card: e9");
      },
      verify
    });

    expect(card.identity.name.value).toBe("Cartesia");
    expect(card.synthesis).toBeUndefined();
    expect(verify).not.toHaveBeenCalled();
  });

  it("gates required synthesis before LLM calls when analysis evidence is weak", async () => {
    process.env.ANALYSIS_SYNTHESIS_MIN_CITATIONS = "8";
    const skeleton = buildSkeletonCard("oboe.com");
    const synthesize = vi.fn();
    const verify = vi.fn();

    const result = await generateCardForDomainWithTrace("oboe.com", {
      fetchSources: async () => [],
      extractSections: async () => ({
        identity: {
          ...skeleton.identity,
          name: {
            value: "Oboe",
            status: "verified",
            confidence: "high",
            citationIds: ["c1"]
          }
        },
        funding: skeleton.funding,
        team: skeleton.team,
        signals: [],
        comparables: [],
        citations: [
          { ...citation, id: "c1", url: "https://oboe.com", title: "Oboe" },
          { ...citation, id: "c2", url: "https://example.com/oboe", title: "Oboe profile", sourceType: "news" as const },
          { ...citation, id: "c3", url: "https://example.com/oboe-funding", title: "Oboe funding", sourceType: "news" as const }
        ]
      }),
      synthesize,
      verify,
      synthesisRequired: true
    });

    expect(synthesize).not.toHaveBeenCalled();
    expect(verify).not.toHaveBeenCalled();
    expect(result.card.synthesis).toBeUndefined();
    expect(result.tracePatch.synthesis).toEqual({
      required: true,
      produced: false,
      claimCountBeforeVerify: 0,
      claimCountAfterVerify: 0,
      gateMessage: "insufficient evidence for synthesis"
    });
  });

  it("ignores unexpected top-level extracted section keys", async () => {
    const skeleton = buildSkeletonCard("cartesia.ai");

    const card = await generateCardForDomain("cartesia.ai", {
      fetchSources: async () => [],
      extractSections: async () =>
        ({
          slug: "overridden",
          generationCostUsd: 99,
          identity: skeleton.identity,
          funding: skeleton.funding,
          team: skeleton.team,
          signals: [],
          comparables: [],
          citations: [citation]
        }) as unknown as ExtractedCardSections,
      costLines: [{ label: "provider", usd: 1.23456 }]
    } as GenerateCardDeps);

    expect(card.slug).toBe("cartesia");
    expect(card.generationCostUsd).toBe(1.2346);
  });

  it("rejects no-source extracted cards when no provider sources exist", async () => {
    const skeleton = buildSkeletonCard("cartesia.ai");

    await expect(
      generateCardForDomain("cartesia.ai", {
        fetchSources: async () => [],
        extractSections: async () => ({
          identity: skeleton.identity,
          funding: skeleton.funding,
          team: skeleton.team,
          signals: [],
          comparables: [],
          citations: []
        })
      })
    ).rejects.toThrow("No cited sources survived extraction");
  });

  it("stores a cited fallback profile when extraction drops citations but provider sources exist", async () => {
    const skeleton = buildSkeletonCard("legora.com");

    const card = await generateCardForDomain("legora.com", {
      fetchSources: async () => [
        {
          url: "https://legora.com/",
          title: "Legora",
          sourceType: "company_site",
          fetchedAt: "2026-05-11T00:00:00.000Z",
          intent: "company_profile",
          rawText: "Legora is a legal AI platform."
        }
      ],
      extractSections: async () => ({
        identity: skeleton.identity,
        funding: skeleton.funding,
        team: skeleton.team,
        signals: [],
        comparables: [],
        citations: []
      })
    });

    expect(card.identity.name).toMatchObject({
      value: "Legora",
      status: "inferred",
      confidence: "low",
      citationIds: ["c1"]
    });
    expect(card.citations).toEqual([
      expect.objectContaining({
        id: "c1",
        url: "https://legora.com/",
        title: "Legora",
        sourceType: "company_site"
      })
    ]);
  });

  it("passes an evidence ledger into extraction", async () => {
    const skeleton = buildSkeletonCard("perplexity.ai");
    let ledgerLength = 0;

    await generateCardForDomain("perplexity.ai", {
      fetchSources: async () => [
        {
          url: "https://www.perplexity.ai/hub/blog/series-b",
          title: "Perplexity Series B",
          sourceType: "news",
          fetchedAt: "2026-05-07T00:00:00.000Z",
          intent: "funding",
          rawText: "Perplexity raised $63 million in a Series B led by IVP.",
        },
      ],
      extractSections: async ({ evidenceLedger }) => {
        ledgerLength = evidenceLedger.length;
        return {
          identity: skeleton.identity,
          funding: skeleton.funding,
          team: skeleton.team,
          signals: [],
          comparables: [],
        citations: [citation],
        };
      },
    } as GenerateCardDeps);

    expect(ledgerLength).toBe(1);
  });

  it("passes the research plan into source fetching and extraction", async () => {
    const skeleton = buildSkeletonCard("harvey.ai");
    const researchPlan = {
      searchQueries: {
        funding: "harvey funding",
        companyProfile: "harvey product",
        independentAnalysis: "harvey analysis",
      },
    };
    let fetchSawPlan = false;
    let extractionSawPlan = false;

    await generateCardForDomain("harvey.ai", {
      researchPlan,
      fetchSources: async (_domain, plan) => {
        fetchSawPlan = plan === researchPlan;
        return [];
      },
      extractSections: async ({ researchPlan: plan }) => {
        extractionSawPlan = plan === researchPlan;
        return {
          identity: skeleton.identity,
          funding: skeleton.funding,
          team: skeleton.team,
          signals: [],
          comparables: [],
          citations: [citation],
        };
      },
    } as GenerateCardDeps);

    expect(fetchSawPlan).toBe(true);
    expect(extractionSawPlan).toBe(true);
  });

  it("runs cited block enrichments for fields the broad extraction misses", async () => {
    const skeleton = buildSkeletonCard("zo.computer");
    const seenBlocks: string[] = [];

    const result = await generateCardForDomainWithTrace("zo.computer", {
      fetchSources: async () => [
        {
          url: "https://www.businesswire.com/zo-seed",
          title: "Zo Computer seed financing",
          sourceType: "news",
          fetchedAt: "2026-05-14T16:00:00.000Z",
          intent: "funding",
          rawText: "Zo Computer raised a $4 million seed round led by Conviction.",
        },
        {
          url: "https://zo.computer/team",
          title: "Zo Computer team",
          sourceType: "company_site",
          fetchedAt: "2026-05-14T16:00:00.000Z",
          intent: "management_team",
          rawText: "Raymond Luo is founder and CEO. Contact raymond@zo.computer for company inquiries.",
        },
        {
          url: "https://zo.computer/blog/product",
          title: "Zo Computer launches persistent AI workspaces",
          sourceType: "company_site",
          fetchedAt: "2026-05-14T16:00:00.000Z",
          intent: "recent_signals",
          rawText: "Zo Computer launched persistent cloud workspaces for AI-assisted research and projects.",
        },
        {
          url: "https://browserbase.com",
          title: "Browserbase",
          sourceType: "news",
          fetchedAt: "2026-05-14T16:00:00.000Z",
          intent: "comparables",
          rawText: "Browserbase provides cloud browser automation infrastructure for AI agents.",
        },
      ],
      extractSections: async () => ({
        identity: {
          ...skeleton.identity,
          name: {
            value: "Zo Computer",
            status: "verified",
            confidence: "high",
            citationIds: ["c1"],
          },
        },
        funding: skeleton.funding,
        team: skeleton.team,
        signals: [],
        comparables: [],
        citations: [citation],
      }),
      enrichSections: async ({ block }) => {
        seenBlocks.push(block);

        if (block === "description") {
          return {
            identity: {
              description: {
                value: {
                  shortDescription: "Zo Computer provides cloud computers that users and AI agents can share.",
                  concept: "A persistent cloud computer for human and AI collaboration.",
                  serves: "Researchers, builders, and AI-heavy knowledge workers.",
                  mechanism: "Runs a hosted workspace that can be controlled by the user and their AI agent.",
                },
                status: "verified",
                confidence: "medium",
                citationIds: ["bd1"],
              },
            },
            citations: [
              {
                id: "bd1",
                url: "https://zo.computer/blog/product",
                title: "Zo Computer launches persistent AI workspaces",
                fetchedAt: "2026-05-14T16:00:00.000Z",
                sourceType: "company_site",
              },
            ],
          };
        }

        if (block === "funding") {
          return {
            funding: {
              lastRound: {
                value: {
                  name: "Seed",
                  amountUsd: 4000000,
                  announcedAt: "2026-05-14",
                  leadInvestors: ["Conviction"],
                },
                status: "verified",
                confidence: "high",
                citationIds: ["bf1"],
              },
            },
            citations: [
              {
                id: "bf1",
                url: "https://www.businesswire.com/zo-seed",
                title: "Zo Computer seed financing",
                fetchedAt: "2026-05-14T16:00:00.000Z",
                sourceType: "news",
              },
            ],
          };
        }

        if (block === "team") {
          return {
            team: {
              founders: {
                value: [
                  {
                    name: "Raymond Luo",
                    role: "Founder and CEO",
                    sourceUrl: "https://zo.computer/team",
                    email: "raymond@zo.computer",
                  },
                ],
                status: "verified",
                confidence: "medium",
                citationIds: ["bt1"],
              },
            },
            citations: [
              {
                id: "bt1",
                url: "https://zo.computer/team",
                title: "Zo Computer team",
                fetchedAt: "2026-05-14T16:00:00.000Z",
                sourceType: "company_site",
              },
            ],
          };
        }

        if (block === "signals") {
          return {
            signals: [
              {
                title: "Launched persistent AI workspaces",
                url: "https://zo.computer/blog/product",
                date: "2026-05-14",
                source: "Zo Computer",
                category: "launch",
                citationIds: ["bs1"],
              },
            ],
            citations: [
              {
                id: "bs1",
                url: "https://zo.computer/blog/product",
                title: "Zo Computer launches persistent AI workspaces",
                fetchedAt: "2026-05-14T16:00:00.000Z",
                sourceType: "company_site",
              },
            ],
          };
        }

        if (block === "comparables") {
          return {
            comparables: [
              {
                name: "Browserbase",
                domain: "browserbase.com",
                oneLiner: "Cloud browser automation infrastructure for AI agents.",
                basis: "Adjacent cloud execution surface for AI-controlled browser work.",
                confidence: "medium",
                citationIds: ["bc1"],
              },
            ],
            citations: [
              {
                id: "bc1",
                url: "https://browserbase.com",
                title: "Browserbase",
                fetchedAt: "2026-05-14T16:00:00.000Z",
                sourceType: "news",
              },
            ],
          };
        }

        return { citations: [] };
      },
    } as GenerateCardDeps);

    expect(seenBlocks).toEqual(["description", "funding", "team", "signals", "comparables"]);
    expect(result.card.identity.description?.value?.serves).toBe("Researchers, builders, and AI-heavy knowledge workers.");
    expect(result.card.funding.lastRound.value).toMatchObject({ name: "Seed", amountUsd: 4000000 });
    expect(result.card.team.founders.value?.[0]).toMatchObject({
      name: "Raymond Luo",
      role: "Founder and CEO",
      email: "raymond@zo.computer",
    });
    expect(result.card.signals[0]?.title).toBe("Launched persistent AI workspaces");
    expect(result.card.comparables[0]).toMatchObject({ name: "Browserbase", domain: "browserbase.com" });
    expect(result.tracePatch.extraction?.blockEnrichment).toMatchObject({
      requested: ["description", "funding", "team", "signals", "comparables"],
      produced: ["description", "funding", "team", "signals", "comparables"],
    });
  });

  it("merges contact facts when emails are missing but the team block is otherwise complete", async () => {
    const skeleton = buildSkeletonCard("zo.computer");
    const seenBlocks: string[] = [];
    const completeSections: ExtractedCardSections = {
      identity: {
        ...skeleton.identity,
        name: {
          value: "Zo Computer",
          status: "verified",
          confidence: "high",
          citationIds: ["c1"],
        },
        description: {
          value: {
            shortDescription: "Zo Computer provides cloud computers for people and AI agents.",
            concept: "A persistent cloud computer.",
            serves: "Researchers and builders.",
            mechanism: "Hosts a browser-accessible workspace.",
          },
          status: "verified",
          confidence: "medium",
          citationIds: ["c1"],
        },
      },
      funding: {
        ...skeleton.funding,
        lastRound: {
          value: {
            name: "Seed",
            amountUsd: 4000000,
            announcedAt: "2026-05-14",
            leadInvestors: ["Conviction"],
          },
          status: "verified",
          confidence: "high",
          citationIds: ["c1"],
        },
        investors: {
          value: [{ name: "Conviction", domain: null }],
          status: "verified",
          confidence: "medium",
          citationIds: ["c1"],
        },
      },
      team: {
        ...skeleton.team,
        founders: {
          value: [
            {
              name: "Raymond Luo",
              role: "Founder and CEO",
              sourceUrl: "https://zo.computer/team",
            },
          ],
          status: "verified",
          confidence: "medium",
          citationIds: ["c1"],
        },
      },
      signals: [
        {
          title: "Launched persistent AI workspaces",
          url: "https://zo.computer/blog/product",
          date: "2026-05-14",
          source: "Zo Computer",
          category: "launch",
          citationIds: ["c1"],
        },
        {
          title: "Announced seed financing",
          url: "https://www.businesswire.com/zo-seed",
          date: "2026-05-14",
          source: "Business Wire",
          category: "funding",
          citationIds: ["c1"],
        },
      ],
      comparables: [
        {
          name: "Browserbase",
          domain: "browserbase.com",
          oneLiner: "Cloud browser automation infrastructure.",
          basis: "Adjacent cloud execution layer.",
          confidence: "medium",
          citationIds: ["c1"],
        },
        {
          name: "Poolside",
          domain: "poolside.ai",
          oneLiner: "AI software engineering agents.",
          basis: "Adjacent AI workspace workflow.",
          confidence: "low",
          citationIds: ["c1"],
        },
        {
          name: "Replit",
          domain: "replit.com",
          oneLiner: "Browser-based software workspace.",
          basis: "Adjacent hosted development surface.",
          confidence: "medium",
          citationIds: ["c1"],
        },
      ],
      citations: [citation],
    };

    const result = await generateCardForDomainWithTrace("zo.computer", {
      providerFacts: [
        {
          path: "team.founders",
          value: [
            {
              name: "Raymond Luo",
              role: "Founder and CEO",
              sourceUrl: "https://zo.computer/team",
              email: "raymond@zo.computer",
            },
          ],
          status: "verified",
          confidence: "high",
          sourceType: "enrichment",
          provider: "stableenrich",
          endpoint: "hunter_email_verifier",
          citationUrl: "https://stable.example/hunter?domain=raymond@zo.computer",
          citationTitle: "Hunter email verification for raymond@zo.computer",
          fetchedAt: "2026-05-14T16:05:00.000Z",
        },
      ],
      fetchSources: async () => [
        {
          url: "https://zo.computer/team",
          title: "Zo Computer team",
          sourceType: "company_site",
          fetchedAt: "2026-05-14T16:00:00.000Z",
          intent: "management_team",
          rawText: "Raymond Luo is founder and CEO. Contact raymond@zo.computer for company inquiries.",
        },
      ],
      extractSections: async () => completeSections,
      enrichSections: async ({ block }) => {
        seenBlocks.push(block);
        return null;
      },
    } as GenerateCardDeps);

    expect(seenBlocks).toEqual([]);
    expect(result.card.team.founders.value?.[0]).toMatchObject({
      name: "Raymond Luo",
      role: "Founder and CEO",
      sourceUrl: "https://zo.computer/team",
      email: "raymond@zo.computer",
    });
    expect(result.tracePatch.extraction?.blockEnrichment).toBeUndefined();
  });

  it("merges deterministic provider facts into missing table-stakes fields", async () => {
    const skeleton = buildSkeletonCard("cartesia.ai");

    const result = await generateCardForDomainWithTrace("cartesia.ai", {
      providerFacts: [
        {
          path: "identity.name",
          value: "Ignored Provider Name",
          status: "inferred",
          confidence: "medium",
          sourceType: "enrichment",
          provider: "stableenrich",
          endpoint: "org_enrichment",
          citationUrl: "https://stableenrich.dev/ignored-name",
          citationTitle: "Ignored provider name",
          fetchedAt: "2026-05-13T00:00:00.000Z",
        },
        {
          path: "identity.websiteUrl",
          value: "https://cartesia.ai",
          status: "inferred",
          confidence: "high",
          sourceType: "enrichment",
          provider: "stableenrich",
          endpoint: "org_enrichment",
          citationUrl: "https://stableenrich.dev/api/apollo/org-enrich?domain=cartesia.ai",
          citationTitle: "Apollo org enrichment for cartesia.ai",
          fetchedAt: "2026-05-13T00:00:00.000Z",
        },
        {
          path: "team.headcount",
          value: { value: 64, asOf: "2026-05-13" },
          status: "inferred",
          confidence: "low",
          sourceType: "enrichment",
          provider: "stableenrich",
          endpoint: "org_enrichment",
          citationUrl: "https://stableenrich.dev/api/apollo/org-enrich?domain=cartesia.ai",
          citationTitle: "Apollo org enrichment for cartesia.ai",
          fetchedAt: "2026-05-13T00:00:00.000Z",
        },
        {
          path: "team.founders",
          value: [
            {
              name: "Karan Goel",
              role: "Co-founder and CEO",
              sourceUrl: "https://www.linkedin.com/in/karangoel",
              email: "karan@cartesia.ai",
            },
          ],
          status: "verified",
          confidence: "high",
          sourceType: "enrichment",
          provider: "stableenrich",
          endpoint: "apollo_people_enrich",
          citationUrl: "https://www.linkedin.com/in/karangoel",
          citationTitle: "Apollo people enrichment for Karan Goel",
          fetchedAt: "2026-05-13T00:00:00.000Z",
        },
        {
          path: "comparables",
          value: {
            name: "ElevenLabs",
            domain: "elevenlabs.io",
            oneLiner: "Voice AI platform.",
            basis: "Similar web and market context from Exa find-similar",
            confidence: "medium",
          },
          status: "inferred",
          confidence: "medium",
          sourceType: "news",
          provider: "stableenrich",
          endpoint: "exa_find_similar",
          citationUrl: "https://elevenlabs.io",
          citationTitle: "ElevenLabs",
          fetchedAt: "2026-05-13T00:00:00.000Z",
        },
        {
          path: "signals",
          value: {
            title: "Cartesia announces Series B",
            url: "https://cartesia.ai/blog/series-b",
            date: "2026-05-01",
            source: "cartesia.ai",
            category: "funding",
            citationIds: [],
          },
          status: "verified",
          confidence: "medium",
          sourceType: "news",
          provider: "stableenrich",
          endpoint: "exa_recent_signals",
          citationUrl: "https://cartesia.ai/blog/series-b",
          citationTitle: "Cartesia announces Series B",
          fetchedAt: "2026-05-13T00:00:00.000Z",
        },
      ],
      fetchSources: async () => [
        {
          url: "https://cartesia.ai",
          title: "Cartesia",
          sourceType: "company_site",
          fetchedAt: "2026-05-06T12:00:00.000Z",
          intent: "company_profile",
          rawText: "Cartesia is building voice AI infrastructure.",
        },
      ],
      extractSections: async () => ({
        identity: {
          ...skeleton.identity,
          name: {
            value: "Cartesia",
            status: "verified",
            confidence: "high",
            citationIds: ["c1"],
          },
        },
        funding: skeleton.funding,
        team: skeleton.team,
        signals: [],
        comparables: [],
        citations: [citation],
      }),
    });

    expect(result.card.identity.name.value).toBe("Cartesia");
    expect(result.card.identity.websiteUrl?.value).toBe("https://cartesia.ai");
    expect(result.card.team.headcount.value).toEqual({ value: 64, asOf: "2026-05-13" });
    expect(result.card.team.founders.value?.[0]).toMatchObject({
      name: "Karan Goel",
      email: "karan@cartesia.ai",
    });
    expect(result.card.comparables[0]).toMatchObject({
      name: "ElevenLabs",
      domain: "elevenlabs.io",
      citationIds: ["p3"],
    });
    expect(result.card.signals[0]).toMatchObject({
      title: "Cartesia announces Series B",
      category: "funding",
      citationIds: ["p4"],
    });
    expect(result.card.citations.map((item) => item.url)).not.toContain("https://stableenrich.dev/ignored-name");
    expect(result.tracePatch.extraction).toMatchObject({
      providerFactCandidateCount: 6,
      providerFactAppliedCount: 5,
      providerFactPaths: ["comparables", "identity.websiteUrl", "signals", "team.founders", "team.headcount"],
    });
  });

  it("returns extraction and synthesis trace patches", async () => {
    const skeleton = buildSkeletonCard("cartesia.ai");
    const whyItMatters = { text: "Cartesia has cited public product evidence. [c1]", citationIds: ["c1"] };
    const bullCase = { text: "The company has a clear infrastructure wedge. [c1]", citationIds: ["c1"] };

    const result = await generateCardForDomainWithTrace("cartesia.ai", {
      fetchSources: async () => [
        {
          url: "https://cartesia.ai",
          title: "Cartesia",
          sourceType: "company_site",
          fetchedAt: "2026-05-06T12:00:00.000Z",
          intent: "company_profile",
          rawText: "Cartesia is building voice AI infrastructure."
        }
      ],
      extractSections: async () => ({
        identity: skeleton.identity,
        funding: skeleton.funding,
        team: skeleton.team,
        signals: [],
        comparables: [],
        citations: [citation]
      }),
      synthesize: async () => ({
        whyItMatters,
        bullCase: [bullCase],
        bearCase: [],
        openQuestions: ["What buyer owns expansion?"]
      }),
      verify: async () => [
        { ...whyItMatters, status: "supported" },
        { ...bullCase, status: "unsupported" }
      ],
      synthesisRequired: true
    });

    expect(result.tracePatch.extraction).toMatchObject({
      sourceCount: 1,
      evidenceCount: 1,
      citationCount: 1,
      fallbackUsed: false,
      providerFactCandidateCount: 0,
      providerFactAppliedCount: 0,
      providerFactPaths: []
    });
    expect(result.tracePatch.synthesis).toEqual({
      required: true,
      produced: true,
      claimCountBeforeVerify: 2,
      claimCountAfterVerify: 1
    });
  });

  it("carries trace patches through extraction failure", async () => {
    const skeleton = buildSkeletonCard("legora.com");

    await expect(
      generateCardForDomainWithTrace("legora.com", {
        fetchSources: async () => [],
        extractSections: async () => ({
          identity: skeleton.identity,
          funding: skeleton.funding,
          team: skeleton.team,
          signals: [],
          comparables: [],
          citations: []
        })
      })
    ).rejects.toMatchObject({
      tracePatch: {
        extraction: {
          sourceCount: 0,
          evidenceCount: 0,
          citationCount: 0,
          fallbackUsed: false,
          providerFactCandidateCount: 0,
          providerFactAppliedCount: 0,
          providerFactPaths: []
        }
      }
    });
  });
});

describe("finalizeGeneratedCard", () => {
  it("drops same-name unrelated comparables proposed by enrichment", () => {
    const card = {
      ...buildSkeletonCard("cognition.ai"),
      identity: {
        ...buildSkeletonCard("cognition.ai").identity,
        name: {
          value: "Cognition AI",
          status: "verified" as const,
          confidence: "high" as const,
          citationIds: ["c1"],
        },
      },
      citations: [
        {
          id: "c1",
          url: "https://cognition.ai",
          title: "Cognition",
          fetchedAt: "2026-05-15T00:00:00.000Z",
          sourceType: "company_site" as const,
        },
      ],
      comparables: [
        {
          name: "Cursor",
          domain: "cursor.com",
          oneLiner: "AI coding IDE.",
          citationIds: ["c1"],
        },
        {
          name: "Cognition (Cognition Therapeutics)",
          domain: "cogtherapeutics.com",
          oneLiner: "Unrelated therapeutics company.",
          citationIds: ["c1"],
        },
      ],
    };

    expect(finalizeGeneratedCard(card).comparables.map((comparable) => comparable.name)).toEqual(["Cursor"]);
  });

  it("derives a readable name from the domain when extraction leaves it missing but the site is cited", () => {
    const skeleton = buildSkeletonCard("bolt.com");
    const card = {
      ...skeleton,
      citations: [
        {
          id: "c1",
          url: "https://bolt.com",
          title: "Bolt",
          fetchedAt: "2026-05-29T00:00:00.000Z",
          sourceType: "company_site" as const,
        },
      ],
    };

    const finalized = finalizeGeneratedCard(card);
    expect(finalized.identity.name.value).toBe("Bolt");
    expect(finalized.identity.name.status).toBe("inferred");
    expect(finalized.identity.name.citationIds).toEqual(["c1"]);
  });

  it("derives the name from a subdomain company-site citation", () => {
    const skeleton = buildSkeletonCard("bolt.com");
    const card = {
      ...skeleton,
      citations: [
        {
          id: "c1",
          url: "https://app.bolt.com/dashboard",
          title: "Bolt App",
          fetchedAt: "2026-05-29T00:00:00.000Z",
          sourceType: "company_site" as const,
        },
      ],
    };

    const finalized = finalizeGeneratedCard(card);
    expect(finalized.identity.name.value).toBe("Bolt");
    expect(finalized.identity.name.citationIds).toEqual(["c1"]);
  });

  it("does not derive the name from a look-alike domain citation", () => {
    const skeleton = buildSkeletonCard("bolt.com");
    const card = {
      ...skeleton,
      citations: [
        {
          id: "c1",
          url: "https://evil-bolt.com",
          title: "Not Bolt",
          fetchedAt: "2026-05-29T00:00:00.000Z",
          sourceType: "company_site" as const,
        },
      ],
    };

    expect(finalizeGeneratedCard(card).identity.name.value).toBeNull();
  });

  it("leaves the name missing when the company site is not cited", () => {
    const skeleton = buildSkeletonCard("bolt.com");
    const card = {
      ...skeleton,
      citations: [
        {
          id: "c1",
          url: "https://techcrunch.com/2026/bolt",
          title: "News",
          fetchedAt: "2026-05-29T00:00:00.000Z",
          sourceType: "news" as const,
        },
      ],
    };

    expect(finalizeGeneratedCard(card).identity.name.value).toBeNull();
  });
});

describe("cardWithExtractedSections", () => {
  it("drops unresolved fact citation refs instead of throwing", () => {
    const base = buildSkeletonCard("acme.com");
    const sections: ExtractedCardSections = {
      identity: {
        ...base.identity,
        name: { value: "Acme", status: "verified", confidence: "high", citationIds: ["c1"] },
      },
      funding: base.funding,
      team: {
        founders: {
          value: [{ name: "Jane Doe", role: "CEO", sourceUrl: null }],
          status: "verified",
          confidence: "high",
          citationIds: ["e1"],
        },
        keyExecs: base.team.keyExecs,
        headcount: base.team.headcount,
      },
      signals: [],
      comparables: [],
      citations: [
        {
          id: "c1",
          url: "https://acme.com",
          title: "Acme",
          fetchedAt: "2026-05-29T00:00:00.000Z",
          sourceType: "company_site" as const,
        },
      ],
    };

    const card = cardWithExtractedSections(base, sections);
    // Valid ref survives; the dangling "e1" ref is dropped and its fact nulled (no schema throw).
    expect(card.identity.name.value).toBe("Acme");
    expect(card.team.founders.value).toBeNull();
    expect(card.team.founders.citationIds).toEqual([]);
  });
});
