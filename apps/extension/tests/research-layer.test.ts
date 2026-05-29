import { fundingEvidenceFromCitations, type ColdStartCard, type ResearchSection } from "@cold-start/core";
import { describe, expect, it } from "vitest";
import { RESEARCH_LAYER_CARDS, layerDisplayForCard, layersForCard } from "../src/research-layer";
import {
  dormantCardCanDrag,
  dampenDragOffset,
  dragOffsetShouldPreview,
  dragOffsetShouldSnap,
  dragOffsetShouldSuppressClick,
  projectVelocity
} from "../src/research-layer-motion";

const futureCardTitles = [
  "Business Model & Unit Economics",
  "Team & Execution",
  "Strategic Relevance"
];

function baseCard(overrides: Partial<ColdStartCard> = {}): ColdStartCard {
  return {
    slug: "warp",
    domain: "warp.dev",
    generatedAt: "2026-05-11T12:00:00.000Z",
    generationCostUsd: 0,
    cacheStatus: "hit",
    identity: {
      name: { value: "Warp", status: "verified", confidence: "high", citationIds: ["c1"] },
      logoUrl: null,
      oneLiner: { value: "Developer productivity platform for the AI era.", status: "verified", confidence: "high", citationIds: ["c1"] },
      description: {
        value: {
          shortDescription: "Developer productivity platform for the AI era.",
          concept: "AI-native terminal collaboration layer.",
          serves: "Developers and engineering teams.",
          mechanism: "Combines terminal execution with shared AI context."
        },
        status: "verified",
        confidence: "medium",
        citationIds: ["c1"]
      },
      hq: { value: { city: "SF", country: "CA" }, status: "verified", confidence: "medium", citationIds: ["c1"] },
      foundedYear: { value: 2021, status: "verified", confidence: "medium", citationIds: ["c1"] },
      status: "private"
    },
    funding: {
      totalRaisedUsd: { value: 50000000, status: "verified", confidence: "medium", citationIds: ["c1"] },
      lastRound: {
        value: { name: "Series B", amountUsd: 50000000, announcedAt: "2024-02-01", leadInvestors: [] },
        status: "verified",
        confidence: "medium",
        citationIds: ["c1"]
      },
      investors: { value: [], status: "unknown", confidence: "low", citationIds: [] }
    },
    team: {
      founders: { value: [], status: "unknown", confidence: "low", citationIds: [] },
      keyExecs: { value: [], status: "unknown", confidence: "low", citationIds: [] },
      headcount: { value: null, status: "unknown", confidence: "low", citationIds: [] }
    },
    signals: [
      {
        title: "Warp launches AI features",
        url: "https://warp.dev/blog/ai",
        date: "2026-05-10",
        source: "Warp",
        category: "launch",
        citationIds: ["c1"]
      }
    ],
    comparables: [{ name: "Cursor", domain: "cursor.com", oneLiner: "AI code editor" }],
    citations: [
      {
        id: "c1",
        url: "https://warp.dev",
        title: "Warp",
        fetchedAt: "2026-05-11T12:00:00.000Z",
        sourceType: "company_site"
      }
    ],
    ...overrides
  };
}

describe("research layer model", () => {
  it("ships only useful activatable cards in stable order", () => {
    expect(RESEARCH_LAYER_CARDS.map((card) => card.id)).toEqual([
      "coreIdea",
      "serves",
      "marketStructureTiming",
      "customers",
      "signals",
      "investors",
      "competition",
      "mechanism",
      "openQuestions"
    ]);
    expect(RESEARCH_LAYER_CARDS.map((card) => card.title)).toEqual([
      "Why care",
      "Who pays",
      "Timing",
      "Proof",
      "Signals",
      "Money",
      "Comps",
      "Product",
      "Next question"
    ]);
  });

  it("does not include future cards without real data paths", () => {
    for (const title of futureCardTitles) {
      expect(RESEARCH_LAYER_CARDS.map((card) => card.title)).not.toContain(title);
    }
  });

  it("marks synthesis-backed cards as needing analysis until synthesis exists", () => {
    const layers = layersForCard(baseCard());
    expect(layers.find((layer) => layer.id === "coreIdea")?.availability).toBe("needs-analysis");
    expect(layers.find((layer) => layer.id === "openQuestions")?.availability).toBe("needs-analysis");
  });

  it("derives populated display data from real card fields", () => {
    expect(layerDisplayForCard(baseCard(), "customers")).toMatchObject({
      body: "Developers and engineering teams.",
      sourceCount: 1,
      status: "populated"
    });
    expect(layerDisplayForCard(baseCard(), "serves")).toMatchObject({
      body: "AI-native terminal collaboration layer.",
      sourceCount: 1,
      status: "populated"
    });
    expect(layerDisplayForCard(baseCard(), "signals")).toMatchObject({
      body: "Warp launches AI features",
      sourceCount: 1,
      status: "populated"
    });
  });

  it("derives analysis display data only after synthesis exists", () => {
    const card = baseCard({
      synthesis: {
        whyItMatters: { text: "Warp turns terminal work into a collaboration layer [c1].", citationIds: ["c1"] },
        bullCase: [{ text: "Developers already show adoption.", citationIds: ["c1"] }],
        bearCase: [],
        openQuestions: ["Can it expand beyond developers?"]
      }
    });

    expect(layerDisplayForCard(card, "coreIdea")).toMatchObject({
      body: "Warp turns terminal work into a collaboration layer.",
      sourceCount: 1,
      sources: [
        {
          domain: "warp.dev",
          href: "https://warp.dev",
          id: "c1",
          title: "Warp"
        }
      ],
      status: "populated"
    });
    expect(layerDisplayForCard(card, "openQuestions")?.body).toContain("Can it expand beyond developers?");
  });

  it("renders market structure and timing from verified synthesis fields", () => {
    const buyerBudget = {
      text: "The buyer budget is contact-center automation spend [c1].",
      citationIds: ["c1"]
    };
    const timingRisk = {
      text: "Timing risk remains because production voice workflows are still early [c1].",
      citationIds: ["c1"]
    };
    const card = baseCard({
      synthesis: {
        whyItMatters: { text: "Warp turns terminal work into a collaboration layer [c1].", citationIds: ["c1"] },
        bullCase: [],
        bearCase: [],
        openQuestions: ["Can it expand beyond developers?"],
        marketStructureAndTiming: {
          buyerBudget,
          painSeverity: null,
          adoptionTrigger: null,
          marketStructure: null,
          profitPool: null,
          expansionPath: null,
          timingRisk
        }
      }
    });

    expect(layerDisplayForCard(card, "marketStructureTiming")).toMatchObject({
      title: "Timing",
      body: "The buyer budget is contact-center automation spend.",
      sourceCount: 1,
      status: "populated"
    });
    expect(layerDisplayForCard(card, "marketStructureTiming")?.items).toEqual([
      { title: "Buyer budget", body: "The buyer budget is contact-center automation spend." },
      { title: "Timing risk", body: "Timing risk remains because production voice workflows are still early." }
    ]);
  });

  it("treats stale synthesis without market structure as needing analysis", () => {
    const card = baseCard({
      synthesis: {
        whyItMatters: { text: "Warp turns terminal work into a collaboration layer [c1].", citationIds: ["c1"] },
        bullCase: [],
        bearCase: [],
        openQuestions: ["Can it expand beyond developers?"]
      }
    });

    expect(layersForCard(card).find((layer) => layer.id === "marketStructureTiming")?.availability).toBe("needs-analysis");
    expect(layerDisplayForCard(card, "marketStructureTiming")).toMatchObject({
      title: "Timing",
      body: "Market structure analysis has not been generated for this card yet.",
      sourceCount: 0,
      status: "needs-analysis"
    });
  });

  it("keeps generated market structure with no surviving fields empty", () => {
    const card = baseCard({
      synthesis: {
        whyItMatters: { text: "Warp turns terminal work into a collaboration layer [c1].", citationIds: ["c1"] },
        bullCase: [],
        bearCase: [],
        openQuestions: ["Can it expand beyond developers?"],
        marketStructureAndTiming: {
          buyerBudget: null,
          painSeverity: null,
          adoptionTrigger: null,
          marketStructure: null,
          profitPool: null,
          expansionPath: null,
          timingRisk: null
        }
      }
    });

    expect(layersForCard(card).find((layer) => layer.id === "marketStructureTiming")?.availability).toBe("empty");
    expect(layerDisplayForCard(card, "marketStructureTiming")).toMatchObject({
      body: "No market structure claims survived verification.",
      sourceCount: 0,
      status: "empty"
    });
  });

  it("orders displayed sources by source quality before chip truncation", () => {
    const display = layerDisplayForCard(baseCard({
      identity: {
        ...baseCard().identity,
        description: {
          value: {
            shortDescription: "Developer productivity platform for the AI era.",
            concept: "AI-native terminal collaboration layer.",
            serves: "Developers and engineering teams.",
            mechanism: "Combines terminal execution with shared AI context."
          },
          status: "verified",
          confidence: "medium",
          citationIds: ["c1", "c2"]
        }
      },
      citations: [
        {
          id: "c1",
          url: "https://warp.dev",
          title: "Warp",
          fetchedAt: "2026-05-11T12:00:00.000Z",
          sourceType: "company_site"
        },
        {
          id: "c2",
          url: "https://example.substack.com/p/warp-terminal-deep-dive",
          title: "Warp terminal technical deep dive",
          fetchedAt: "2026-05-11T12:00:00.000Z",
          sourceType: "news"
        }
      ]
    }), "customers");

    expect(display?.sources.map((source) => source.domain)).toEqual([
      "example.substack.com",
      "warp.dev"
    ]);
    expect(display?.sources[0]?.qualityLabel).toBe("Independent technical");
  });

  it("does not fabricate source counts for cards without citations", () => {
    const display = layerDisplayForCard(baseCard({ citations: [] }), "serves");
    expect(display?.sourceCount).toBe(0);
  });

  it("never renders a raw section error as card body", () => {
    const zodCrud =
      '[ { "code": "custom", "message": "Citation ref does not resolve: e19", "path": [ "identity", "name", "citationIds", 0 ] } ]';
    const failedSection: ResearchSection = {
      slug: "warp",
      domain: "warp.dev",
      sectionId: "traction",
      visibility: "public",
      status: "failed",
      content: null,
      citationIds: [],
      sourceIds: [],
      runId: null,
      error: zodCrud,
      generatedAt: null,
      staleAt: null
    };

    const display = layerDisplayForCard(baseCard(), "signals", [failedSection]);

    expect(display?.status).toBe("failed");
    expect(display?.body).not.toContain("Citation ref does not resolve");
    expect(display?.body).not.toContain("citationIds");
  });

  it("deduplicates repeated source links before rendering chips", () => {
    const display = layerDisplayForCard(baseCard({
      identity: {
        ...baseCard().identity,
        description: {
          value: {
            shortDescription: "Developer productivity platform for the AI era.",
            concept: "AI-native terminal collaboration layer.",
            serves: "Developers and engineering teams.",
            mechanism: "Combines terminal execution with shared AI context."
          },
          status: "verified",
          confidence: "medium",
          citationIds: ["c1", "c2"]
        }
      },
      citations: [
        {
          id: "c1",
          url: "https://warp.dev/",
          title: "Warp",
          fetchedAt: "2026-05-11T12:00:00.000Z",
          sourceType: "company_site"
        },
        {
          id: "c2",
          url: "https://warp.dev",
          title: "Warp duplicate",
          fetchedAt: "2026-05-11T12:00:00.000Z",
          sourceType: "company_site"
        }
      ]
    }), "customers");

    expect(display?.sourceCount).toBe(1);
    expect(display?.sources).toHaveLength(1);
  });

  it("surfaces fundraising rounds and named investors when funding data exists", () => {
    const card = baseCard({
      funding: {
        totalRaisedUsd: { value: 91_000_000, status: "verified", confidence: "high", citationIds: ["c1"] },
        lastRound: {
          value: { name: "Series B", amountUsd: 64_000_000, announcedAt: "2024-04-23", leadInvestors: ["Kleiner Perkins"] },
          status: "verified",
          confidence: "high",
          citationIds: ["c1"]
        },
        rounds: {
          value: [
            { name: "Series B", amountUsd: 64_000_000, announcedAt: "2024-04-23", leadInvestors: ["Kleiner Perkins"] },
            { name: "Seed", amountUsd: 27_000_000, announcedAt: "2023-06-15", leadInvestors: ["Index"] }
          ],
          status: "verified",
          confidence: "high",
          citationIds: ["c1"]
        },
        investors: {
          value: [
            { name: "Kleiner Perkins", domain: "kleinerperkins.com" },
            { name: "Index Ventures", domain: "indexventures.com" }
          ],
          status: "verified",
          confidence: "high",
          citationIds: ["c1"]
        }
      }
    });

    const display = layerDisplayForCard(card, "investors");

    expect(display?.status).toBe("populated");
    expect(display?.body).toContain("disclosed");
    expect(display?.items?.map((item) => item.title)).toEqual([
      "$91M disclosed across 2 rounds",
      "Series B",
      "Seed"
    ]);
    expect(display?.items?.[0]?.body).toContain("Kleiner Perkins");
    expect(display?.items?.[1]?.body).toBe("$64M · Kleiner Perkins");
    expect(display?.items?.[2]?.body).toBe("$27M · Index");
    expect(display?.sources[0]).toMatchObject({ id: "c1" });
  });

  it("reports the empty state for investors when funding data is missing", () => {
    const card = baseCard({
      funding: {
        totalRaisedUsd: { value: null, status: "unknown", confidence: "low", citationIds: [] },
        lastRound: { value: null, status: "unknown", confidence: "low", citationIds: [] },
        investors: { value: [], status: "unknown", confidence: "low", citationIds: [] }
      }
    });

    expect(layerDisplayForCard(card, "investors")?.status).toBe("empty");
  });

  it("falls back to cited funding reporting when structured funding fields are missing", () => {
    const card = baseCard({
      domain: "polymarket.com",
      funding: {
        totalRaisedUsd: { value: null, status: "unknown", confidence: "low", citationIds: [] },
        lastRound: { value: null, status: "unknown", confidence: "low", citationIds: [] },
        investors: { value: null, status: "unknown", confidence: "low", citationIds: [] }
      },
      citations: [
        {
          id: "e1",
          url: "https://www.bloomberg.com/news/articles/2026-04-20/polymarket-in-talks-for-new-investment-at-15-billion-valuation",
          title: "Polymarket Seeks $400 Million in New Funding at $15 Billion Valuation",
          fetchedAt: "2026-05-19T12:00:00.000Z",
          sourceType: "news",
          snippet:
            "Polymarket is seeking an additional $400 million in funding, after securing $600 million at a $15 billion valuation last month."
        },
        {
          id: "e2",
          url: "https://www.covers.com/industry/polymarket-seeks-fundraising-at-15b-valuation-april-21-2026",
          title: "Polymarket Seeks Fundraising at $15B Valuation",
          fetchedAt: "2026-05-19T12:00:00.000Z",
          sourceType: "news",
          snippet:
            "ICE pledged $2B, completed with $600M injection in March 2026 at $9B valuation. Now seeking $400M at $15B."
        }
      ]
    });

    expect(fundingEvidenceFromCitations(card)[0]).toMatchObject({
      amountLabel: "$600M",
      status: "closed"
    });

    const display = layerDisplayForCard(card, "investors");

    expect(display?.status).toBe("populated");
    expect(display?.sourceCount).toBeGreaterThan(0);
    expect(display?.items?.[0]?.title).toContain("$600M");
    expect(display?.items?.[0]?.body).toContain("completed with $600M injection");
  });

  it("filters stale self-comparables before rendering competition", () => {
    const display = layerDisplayForCard(baseCard({
      slug: "mintlify",
      domain: "mintlify.com",
      identity: {
        ...baseCard().identity,
        name: { value: "Mintlify", status: "verified", confidence: "high", citationIds: ["c1"] },
      },
      comparables: [
        { name: "Mintlify", domain: "mintlify.com", oneLiner: "Self result." },
        { name: "Mintlify", domain: "explinks.com", oneLiner: "Proxy page." },
        { name: "Mintlify", domain: "mintlify.ojasgoyal.in", oneLiner: "Mirror page." },
        { name: "ReadMe", domain: "readme.com", oneLiner: "API documentation platform.", citationIds: ["c2"] },
      ],
      citations: [
        ...baseCard().citations,
        {
          id: "c2",
          url: "https://readme.com",
          title: "ReadMe",
          fetchedAt: "2026-05-11T12:00:00.000Z",
          sourceType: "news",
        },
      ],
    }), "competition");

    expect(display?.status).toBe("populated");
    expect(display?.items?.map((item) => item.title)).toEqual(["ReadMe"]);
    expect(display?.sourceCount).toBe(1);
    expect(display?.sources[0]).toMatchObject({ domain: "readme.com", href: "https://readme.com" });
  });

  it("uses stable drag thresholds for card pinning", () => {
    expect(dormantCardCanDrag()).toBe(true);
    expect(dragOffsetShouldPreview(-24)).toBe(true);
    expect(dragOffsetShouldPreview(-23)).toBe(false);
    expect(dragOffsetShouldSnap(-58)).toBe(true);
    expect(dragOffsetShouldSnap(-57)).toBe(false);
    expect(dragOffsetShouldSnap(-26, -500)).toBe(true);
    expect(dragOffsetShouldSnap(-48, -120)).toBe(true);
    expect(dragOffsetShouldSnap(-40, -40)).toBe(false);
    expect(dragOffsetShouldSuppressClick({ x: 0, y: -6 })).toBe(false);
    expect(dragOffsetShouldSuppressClick({ x: 6, y: 0 })).toBe(false);
    expect(dragOffsetShouldSuppressClick({ x: 0, y: -7 })).toBe(true);
    expect(Math.round(projectVelocity(-120))).toBe(-60);
    expect(dampenDragOffset(-180)).toBeLessThan(-130);
    expect(dampenDragOffset(-180)).toBeGreaterThan(-150);
  });
});
