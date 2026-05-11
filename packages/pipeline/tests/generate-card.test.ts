import { describe, expect, it, vi } from "vitest";
import {
  buildSkeletonCard,
  type ExtractedCardSections,
  generateCardForDomain,
  type GenerateCardDeps
} from "../src/index";

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

  it("rejects no-source extracted cards instead of storing unusable partials", async () => {
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
});
