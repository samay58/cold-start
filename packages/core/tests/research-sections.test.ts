import { describe, expect, it } from "vitest";
import type { ColdStartCard } from "../src/index";
import {
  RESEARCH_SECTION_DEFINITIONS,
  SYNTHESIS_ONLY_SECTION_IDS,
  deriveLegacyResearchSectionsFromCard,
  isSynthesisOnlySectionId,
  mergeStoredResearchSectionsWithLegacy,
  researchSectionJobKind,
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
  it("defines the visible research sections", () => {
    expect(RESEARCH_SECTION_DEFINITIONS.map((section) => section.id)).toEqual([
      "buyer",
      "customer_proof",
      "traction",
      "financing",
      "competition",
      "product",
      "why_it_matters",
      "market",
      "risks",
      "the_case"
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

  it("keeps section generation job kinds in the section registry", () => {
    expect(researchSectionJobKind("market")).toBe("section:market");
    expect(researchSectionJobKind("why_it_matters")).toBe("section:why_it_matters");
  });

  it("marks the synthesis-rendered sections as off-limits for standalone dispatch", () => {
    expect([...SYNTHESIS_ONLY_SECTION_IDS]).toEqual(["risks", "the_case"]);
    expect(isSynthesisOnlySectionId("risks")).toBe(true);
    expect(isSynthesisOnlySectionId("the_case")).toBe(true);
    expect(isSynthesisOnlySectionId("market")).toBe(false);
    expect(isSynthesisOnlySectionId("why_it_matters")).toBe(false);
  });

  it("derives compatible section state from an existing card", () => {
    const sections = deriveLegacyResearchSectionsFromCard(card());

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
            label: "Warp launches AI features",
            text: "Warp launches AI features",
            meta: "2026-05-10 · launch · Warp"
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

  it("does not turn enrichment-only descriptions into finished reader sections", () => {
    const sections = deriveLegacyResearchSectionsFromCard(card({
      identity: {
        ...card().identity,
        oneLiner: fact("AI startup for expert digital minds.", ["c1"]),
        description: {
          value: {
            shortDescription: "AI startup for expert digital minds.",
            concept: "Expert digital minds.",
            serves: "Experts and creators.",
            mechanism: "AI-powered clones."
          },
          status: "verified",
          confidence: "medium",
          citationIds: ["c1"]
        }
      },
      citations: [
        {
          id: "c1",
          url: "https://stableenrich.dev",
          title: "StableEnrich",
          fetchedAt: "2026-05-26T12:00:00.000Z",
          sourceType: "enrichment"
        }
      ]
    }));

    expect(sections.find((section) => section.sectionId === "buyer")).toMatchObject({ status: "empty" });
    expect(sections.find((section) => section.sectionId === "product")).toMatchObject({ status: "empty" });
  });

  it("merges stored rows over legacy fallback without dropping missing sections", () => {
    const stored = {
      ...deriveLegacyResearchSectionsFromCard(card()).find((section) => section.sectionId === "why_it_matters")!,
      status: "running" as const,
      content: null,
      runId: "run-1"
    };
    const sections = mergeStoredResearchSectionsWithLegacy({
      card: card(),
      storedSections: [stored]
    });

    expect(sections).toHaveLength(10);
    expect(sections.find((section) => section.sectionId === "why_it_matters")).toMatchObject({
      status: "running",
      runId: "run-1"
    });
    expect(sections.find((section) => section.sectionId === "buyer")).toMatchObject({
      status: "available"
    });
  });
});
