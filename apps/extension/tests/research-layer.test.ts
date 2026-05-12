import type { ColdStartCard } from "@cold-start/core";
import { describe, expect, it } from "vitest";
import { RESEARCH_LAYER_CARDS, layerDisplayForCard, layersForCard } from "../src/research-layer";
import {
  dormantCardCanDrag,
  dragOffsetShouldPreview,
  dragOffsetShouldSnap,
  dragOffsetShouldSuppressClick
} from "../src/research-layer-motion";

const futureCardTitles = [
  ["Market", "Context"].join(" "),
  ["Business", "Model"].join(" "),
  ["Cold", "Start", "Brief"].join(" ")
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
      "customers",
      "serves",
      "signals",
      "competition",
      "mechanism",
      "openQuestions"
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

  it("does not fabricate source counts for cards without citations", () => {
    const display = layerDisplayForCard(baseCard({ citations: [] }), "serves");
    expect(display?.sourceCount).toBe(0);
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

  it("uses stable drag thresholds for card pinning", () => {
    expect(dormantCardCanDrag({ prefersReducedMotion: true })).toBe(true);
    expect(dormantCardCanDrag({ prefersReducedMotion: false })).toBe(true);
    expect(dragOffsetShouldPreview(-42)).toBe(true);
    expect(dragOffsetShouldPreview(-41)).toBe(false);
    expect(dragOffsetShouldSnap(-80)).toBe(true);
    expect(dragOffsetShouldSnap(-79)).toBe(false);
    expect(dragOffsetShouldSuppressClick({ x: 0, y: -6 })).toBe(false);
    expect(dragOffsetShouldSuppressClick({ x: 8, y: 0 })).toBe(true);
    expect(dragOffsetShouldSuppressClick({ x: 0, y: -8 })).toBe(true);
  });
});
