import { describe, expect, it } from "vitest";
import type { ColdStartCard } from "../src/index";
import {
  RESEARCH_SECTION_DEFINITIONS,
  deriveResearchSectionsFromCard,
  researchSectionSchema
} from "../src/index";

function fact<T>(value: T | null, citationIds = value === null ? [] : ["c1"]) {
  return {
    value,
    status: value === null ? "unknown" as const : "verified" as const,
    confidence: value === null ? "low" as const : "medium" as const,
    citationIds
  };
}

function card(overrides: Partial<ColdStartCard> = {}): ColdStartCard {
  return {
    slug: "warp",
    domain: "warp.dev",
    generatedAt: "2026-05-26T12:00:00.000Z",
    generationCostUsd: 0,
    cacheStatus: "hit",
    identity: {
      name: fact("Warp"),
      websiteUrl: fact("https://warp.dev"),
      logoUrl: null,
      oneLiner: fact("Developer productivity platform."),
      description: {
        value: {
          shortDescription: "Developer productivity platform.",
          concept: "AI-native terminal collaboration layer.",
          serves: "Developers and engineering teams.",
          mechanism: "Combines terminal execution with shared AI context."
        },
        status: "verified",
        confidence: "medium",
        citationIds: ["c1"]
      },
      hq: fact({ city: "San Francisco", country: "United States" }),
      foundedYear: fact(2021),
      status: "private"
    },
    funding: {
      totalRaisedUsd: fact(50000000),
      lastRound: fact({ name: "Series B", amountUsd: 50000000, announcedAt: "2024-02-01", leadInvestors: ["Sequoia"] }),
      investors: fact([{ name: "Sequoia", domain: "sequoiacap.com" }])
    },
    team: {
      founders: fact([]),
      keyExecs: fact([]),
      headcount: fact(null)
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
    comparables: [{ name: "Cursor", domain: "cursor.com", oneLiner: "AI code editor.", citationIds: ["c1"] }],
    citations: [
      {
        id: "c1",
        url: "https://warp.dev",
        title: "Warp",
        fetchedAt: "2026-05-26T12:00:00.000Z",
        sourceType: "company_site"
      }
    ],
    ...overrides
  };
}

describe("research section registry", () => {
  it("defines the nine visible research sections", () => {
    expect(RESEARCH_SECTION_DEFINITIONS.map((section) => section.id)).toEqual([
      "buyer",
      "customer_proof",
      "traction",
      "financing",
      "competition",
      "product",
      "why_it_matters",
      "market",
      "risks"
    ]);
  });

  it("keeps nuanced section prompts in the typed registry", () => {
    const traction = RESEARCH_SECTION_DEFINITIONS.find((section) => section.id === "traction");
    const competition = RESEARCH_SECTION_DEFINITIONS.find((section) => section.id === "competition");
    const market = RESEARCH_SECTION_DEFINITIONS.find((section) => section.id === "market");

    expect(traction?.generationPrompt).toContain("Look creatively for traction without guessing");
    expect(competition?.generationPrompt).toContain("frontier AI labs");
    expect(market?.generationPrompt).toContain("Use bottom-up thinking first");
  });

  it("derives compatible section state from an existing card", () => {
    const sections = deriveResearchSectionsFromCard(card());

    expect(sections.map((section) => section.sectionId)).toEqual(RESEARCH_SECTION_DEFINITIONS.map((section) => section.id));
    expect(sections.find((section) => section.sectionId === "buyer")).toMatchObject({
      status: "available",
      content: {
        summary: "Developers and engineering teams."
      }
    });
    expect(sections.find((section) => section.sectionId === "traction")).toMatchObject({
      status: "available",
      content: {
        items: [
          {
            label: "launch",
            text: "2026-05-10: Warp launches AI features"
          }
        ]
      }
    });
    expect(sections.find((section) => section.sectionId === "customer_proof")).toMatchObject({
      status: "empty"
    });
    expect(sections.find((section) => section.sectionId === "market")?.status).toBe("not_started");
    for (const section of sections) {
      expect(() => researchSectionSchema.parse(section)).not.toThrow();
    }
  });
});
