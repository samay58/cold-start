import { describe, expect, it } from "vitest";
import {
  type ColdStartCard,
  coldStartCardSchema,
  publicCard,
  sanitizeCardTrust,
  stripUnsupportedSynthesis
} from "../src/index";

const baseSynthesis = {
  whyItMatters: { text: "Cartesia is relevant because real-time voice is a live infra wedge [c1].", citationIds: ["c1"] },
  bullCase: [{ text: "The company has a credible infra wedge [c1].", citationIds: ["c1"] }],
  bearCase: [{ text: "Competition is intense [needs_verification].", citationIds: [] }],
  openQuestions: ["Which buyer owns the budget?"]
} satisfies NonNullable<ColdStartCard["synthesis"]>;

const baseCard: ColdStartCard = {
  slug: "cartesia",
  domain: "cartesia.ai",
  generatedAt: "2026-05-06T12:00:00.000Z",
  generationCostUsd: 0.12,
  cacheStatus: "miss",
  identity: {
    name: { value: "Cartesia", status: "verified", confidence: "high", citationIds: ["c1"] },
    logoUrl: null,
    oneLiner: { value: "Real-time voice AI platform", status: "verified", confidence: "high", citationIds: ["c1"] },
    hq: { value: { city: "San Francisco", country: "US" }, status: "verified", confidence: "high", citationIds: ["c1"] },
    foundedYear: { value: 2023, status: "verified", confidence: "high", citationIds: ["c1"] },
    status: "private"
  },
  funding: {
    totalRaisedUsd: { value: 91000000, status: "verified", confidence: "high", citationIds: ["c2"] },
    lastRound: {
      value: { name: "Series B", amountUsd: 64000000, announcedAt: "2025-03-01", leadInvestors: ["Kleiner Perkins"] },
      status: "verified",
      confidence: "high",
      citationIds: ["c2"]
    },
    investors: { value: [{ name: "Kleiner Perkins", domain: "kleinerperkins.com" }], status: "verified", confidence: "high", citationIds: ["c2"] }
  },
  team: {
    founders: { value: [{ name: "Karan Goel", role: "Co-founder", sourceUrl: "https://cartesia.ai" }], status: "verified", confidence: "high", citationIds: ["c1"] },
    keyExecs: { value: [], status: "verified", confidence: "high", citationIds: ["c1"] },
    headcount: { value: { value: 42, asOf: "2026-05-06" }, status: "inferred", confidence: "low", citationIds: ["c3"] }
  },
  signals: [],
  comparables: [],
  citations: [
    { id: "c1", url: "https://cartesia.ai", title: "Cartesia", fetchedAt: "2026-05-06T12:00:00.000Z", sourceType: "company_site" },
    { id: "c2", url: "https://example.com/cartesia-funding", title: "Funding", fetchedAt: "2026-05-06T12:00:00.000Z", sourceType: "news" },
    { id: "c3", url: "https://example.com/cartesia-headcount", title: "Headcount", fetchedAt: "2026-05-06T12:00:00.000Z", sourceType: "enrichment" }
  ],
  synthesis: baseSynthesis
};

describe("publicCard", () => {
  it("omits synthesis from the public tier", () => {
    expect(publicCard(baseCard)).not.toHaveProperty("synthesis");
  });

  it("strips people emails from the public tier", () => {
    const privateCard: ColdStartCard = {
      ...baseCard,
      team: {
        ...baseCard.team,
        founders: {
          ...baseCard.team.founders,
          value: [
            {
              name: "Karan Goel",
              role: "Co-founder",
              sourceUrl: "https://cartesia.ai",
              email: "karan@cartesia.ai",
            },
          ],
        },
      },
    };

    expect(publicCard(privateCard).team.founders.value?.[0]).not.toHaveProperty("email");
  });
});

describe("sanitizeCardTrust", () => {
  it("populates citation source quality consistently", () => {
    const clean = sanitizeCardTrust(baseCard);

    expect(clean.citations).toEqual([
      expect.objectContaining({
        id: "c1",
        sourceQuality: expect.objectContaining({ tier: "primary_company" })
      }),
      expect.objectContaining({
        id: "c2",
        sourceQuality: expect.objectContaining({ tier: "independent_report" })
      }),
      expect.objectContaining({
        id: "c3",
        sourceQuality: expect.objectContaining({ tier: "enrichment" })
      })
    ]);
  });

  it("nulls facts with no citations instead of showing uncited values", () => {
    const dirty: ColdStartCard = {
      ...baseCard,
      identity: {
        ...baseCard.identity,
        foundedYear: { value: 2023, status: "verified", confidence: "high", citationIds: [] }
      }
    };

    const clean = sanitizeCardTrust(dirty);

    expect(clean.identity.foundedYear).toEqual({
      value: null,
      status: "unknown",
      confidence: "low",
      citationIds: []
    });
  });

  it("nulls facts when citation IDs do not exist on the card", () => {
    const dirty: ColdStartCard = {
      ...baseCard,
      identity: {
        ...baseCard.identity,
        foundedYear: { value: 2023, status: "verified", confidence: "high", citationIds: ["missing"] }
      }
    };

    const clean = sanitizeCardTrust(dirty);

    expect(clean.identity.foundedYear).toEqual({
      value: null,
      status: "unknown",
      confidence: "low",
      citationIds: []
    });
  });

  it("keeps facts with valid citation IDs and filters missing IDs", () => {
    const dirty: ColdStartCard = {
      ...baseCard,
      identity: {
        ...baseCard.identity,
        foundedYear: { value: 2023, status: "verified", confidence: "high", citationIds: ["c1", "missing"] }
      }
    };

    const clean = sanitizeCardTrust(dirty);

    expect(clean.identity.foundedYear).toEqual({
      value: 2023,
      status: "verified",
      confidence: "high",
      citationIds: ["c1"]
    });
  });

  it("downgrades vendor-only facts and single-source sensitive facts", () => {
    const dirty: ColdStartCard = {
      ...baseCard,
      funding: {
        ...baseCard.funding,
        totalRaisedUsd: { value: 91000000, status: "verified", confidence: "high", citationIds: ["c3"] },
      },
      team: {
        ...baseCard.team,
        headcount: { value: { value: 42, asOf: "2026-05-06" }, status: "verified", confidence: "high", citationIds: ["c2"] },
      },
    };

    const clean = sanitizeCardTrust(dirty);

    expect(clean.funding.totalRaisedUsd).toEqual({
      value: 91000000,
      status: "inferred",
      confidence: "low",
      citationIds: ["c3"],
    });
    expect(clean.team.headcount).toEqual({
      value: { value: 42, asOf: "2026-05-06" },
      status: "verified",
      confidence: "low",
      citationIds: ["c2"],
    });
  });

  it("drops signals when citation IDs do not exist on the card", () => {
    const dirty: ColdStartCard = {
      ...baseCard,
      signals: [
        {
          title: "Launch coverage",
          url: "https://example.com/launch",
          date: "2026-05-06",
          source: "Example",
          category: "launch",
          citationIds: ["missing"]
        }
      ]
    };

    const clean = sanitizeCardTrust(dirty);

    expect(clean.signals).toEqual([]);
  });

  it("keeps signals with valid citation IDs and filters missing IDs", () => {
    const dirty: ColdStartCard = {
      ...baseCard,
      signals: [
        {
          title: "Launch coverage",
          url: "https://example.com/launch",
          date: "2026-05-06",
          source: "Example",
          category: "launch",
          citationIds: ["c1", "missing"]
        }
      ]
    };

    const clean = sanitizeCardTrust(dirty);

    expect(clean.signals).toEqual([
      {
        title: "Launch coverage",
        url: "https://example.com/launch",
        date: "2026-05-06",
        source: "Example",
        category: "launch",
        citationIds: ["c1"]
      }
    ]);
  });
});

describe("coldStartCardSchema trust invariants", () => {
  it("rejects non-null resolved facts without citation refs", () => {
    const dirty: ColdStartCard = {
      ...baseCard,
      identity: {
        ...baseCard.identity,
        name: { value: "Cartesia", status: "verified", confidence: "high", citationIds: [] }
      }
    };

    expect(coldStartCardSchema.safeParse(dirty).success).toBe(false);
  });

  it("rejects citation refs that do not resolve to card citations", () => {
    const dirty: ColdStartCard = {
      ...baseCard,
      identity: {
        ...baseCard.identity,
        name: { value: "Cartesia", status: "verified", confidence: "high", citationIds: ["missing"] }
      }
    };

    expect(coldStartCardSchema.safeParse(dirty).success).toBe(false);
  });
});

describe("stripUnsupportedSynthesis", () => {
  it("drops synthesis lines that contain verification sentinels", () => {
    const clean = stripUnsupportedSynthesis(baseCard);

    expect(clean.synthesis?.bearCase).toEqual([]);
  });

  it("omits synthesis when why it matters is unsupported", () => {
    const dirty: ColdStartCard = {
      ...baseCard,
      synthesis: {
        ...baseSynthesis,
        whyItMatters: { text: "Cartesia reportedly has a live infra wedge.", citationIds: ["c1"] }
      }
    };

    expect(stripUnsupportedSynthesis(dirty)).not.toHaveProperty("synthesis");
  });

  it("omits synthesis when why it matters has no citations", () => {
    const dirty: ColdStartCard = {
      ...baseCard,
      synthesis: {
        ...baseSynthesis,
        whyItMatters: { text: "Cartesia is relevant because real-time voice is a live infra wedge.", citationIds: [] }
      }
    };

    expect(stripUnsupportedSynthesis(dirty)).not.toHaveProperty("synthesis");
  });

  it("drops bull and bear lines with no citations or forbidden phrases", () => {
    const dirty: ColdStartCard = {
      ...baseCard,
      synthesis: {
        ...baseSynthesis,
        bullCase: [
          { text: "The company has a credible infra wedge [c1].", citationIds: ["c1"] },
          { text: "A partner channel appears to be opening up [c1].", citationIds: ["c1"] },
          { text: "The model latency advantage could compound.", citationIds: [] }
        ],
        bearCase: [
          { text: "Competition is intense [c2].", citationIds: ["c2"] },
          { text: "Industry sources suggest churn risk is elevated [c2].", citationIds: ["c2"] },
          { text: "Pricing pressure may compress margins.", citationIds: [] }
        ]
      }
    };

    const clean = stripUnsupportedSynthesis(dirty);

    expect(clean.synthesis?.bullCase).toEqual([
      { text: "The company has a credible infra wedge [c1].", citationIds: ["c1"] }
    ]);
    expect(clean.synthesis?.bearCase).toEqual([{ text: "Competition is intense [c2].", citationIds: ["c2"] }]);
  });

  it("drops synthesis text without a visible citation marker", () => {
    const dirty: ColdStartCard = {
      ...baseCard,
      synthesis: {
        ...baseSynthesis,
        bullCase: [{ text: "The company has a credible infra wedge.", citationIds: ["c1"] }]
      }
    };

    const clean = stripUnsupportedSynthesis(dirty);

    expect(clean.synthesis?.bullCase).toEqual([]);
  });

  it("drops synthesis text when its visible marker is not in card citations", () => {
    const dirty: ColdStartCard = {
      ...baseCard,
      synthesis: {
        ...baseSynthesis,
        bullCase: [{ text: "The company has a credible infra wedge [missing].", citationIds: ["missing"] }]
      }
    };

    const clean = stripUnsupportedSynthesis(dirty);

    expect(clean.synthesis?.bullCase).toEqual([]);
  });

  it("drops synthesis text with mixed valid and invalid visible citation markers", () => {
    const dirty: ColdStartCard = {
      ...baseCard,
      synthesis: {
        ...baseSynthesis,
        bullCase: [{ text: "The company has a credible infra wedge [c1] [missing].", citationIds: ["c1", "missing"] }]
      }
    };

    const clean = stripUnsupportedSynthesis(dirty);

    expect(clean.synthesis?.bullCase).toEqual([]);
  });

  it("drops synthesis text when a visible citation marker is not declared", () => {
    const dirty: ColdStartCard = {
      ...baseCard,
      synthesis: {
        ...baseSynthesis,
        bullCase: [{ text: "The company has a credible infra wedge [c1] [c2].", citationIds: ["c1"] }]
      }
    };

    const clean = stripUnsupportedSynthesis(dirty);

    expect(clean.synthesis?.bullCase).toEqual([]);
  });

  it("keeps synthesis text with a valid visible citation marker", () => {
    const dirty: ColdStartCard = {
      ...baseCard,
      synthesis: {
        ...baseSynthesis,
        bullCase: [{ text: "The company has a credible infra wedge [c1].", citationIds: ["c1"] }]
      }
    };

    const clean = stripUnsupportedSynthesis(dirty);

    expect(clean.synthesis?.bullCase).toEqual([
      { text: "The company has a credible infra wedge [c1].", citationIds: ["c1"] }
    ]);
  });

  it("filters unsupported market structure claims while preserving supported ones", () => {
    const dirty: ColdStartCard = {
      ...baseCard,
      synthesis: {
        ...baseSynthesis,
        marketStructureAndTiming: {
          buyerBudget: {
            text: "Voice agent infrastructure can come from contact-center automation budgets [c1].",
            citationIds: ["c1"]
          },
          painSeverity: {
            text: "The pain point is not supported [missing].",
            citationIds: ["missing"]
          },
          adoptionTrigger: null,
          marketStructure: null,
          profitPool: null,
          expansionPath: null,
          timingRisk: null
        }
      }
    };

    const clean = stripUnsupportedSynthesis(dirty);

    expect(clean.synthesis?.marketStructureAndTiming).toEqual({
      buyerBudget: {
        text: "Voice agent infrastructure can come from contact-center automation budgets [c1].",
        citationIds: ["c1"]
      },
      painSeverity: null,
      adoptionTrigger: null,
      marketStructure: null,
      profitPool: null,
      expansionPath: null,
      timingRisk: null
    });
  });
});
