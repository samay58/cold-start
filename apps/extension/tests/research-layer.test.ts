import { fundingEvidenceFromCitations, type ColdStartCard, type ResearchSection } from "@cold-start/core";
import { describe, expect, it } from "vitest";
import { RESEARCH_LAYER_CARDS, layerDisplayForCard, layersForCard } from "../src/research-layer";
import {
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
  // Why care, The case, Timing, and Next question render from the investor read (memo) now;
  // see investor-lens.test.ts. This deck only carries the card-sourced layers.
  it("ships only useful activatable cards in stable order", () => {
    expect(RESEARCH_LAYER_CARDS.map((card) => card.id)).toEqual([
      "serves",
      "customers",
      "signals",
      "investors",
      "competition",
      "mechanism"
    ]);
    expect(RESEARCH_LAYER_CARDS.map((card) => card.title)).toEqual([
      "Who pays",
      "Proof",
      "Signals",
      "Money",
      "Comps",
      "Product"
    ]);
  });

  it("does not include future cards without real data paths", () => {
    for (const title of futureCardTitles) {
      expect(RESEARCH_LAYER_CARDS.map((card) => card.title)).not.toContain(title);
    }
  });

  it("resolves availability for card-sourced layers directly from the card", () => {
    const layers = layersForCard(baseCard());
    expect(layers.find((layer) => layer.id === "serves")?.availability).toBe("available");
    expect(layers.find((layer) => layer.id === "investors")?.availability).toBe("available");
  });

  it("derives populated display data from real card fields", () => {
    expect(layerDisplayForCard(baseCard(), "customers")).toMatchObject({
      body: "Developers and engineering teams.",
      sourceCount: 1,
      status: "saved"
    });
    expect(layerDisplayForCard(baseCard(), "serves")).toMatchObject({
      body: "AI-native terminal collaboration layer.",
      sourceCount: 1,
      status: "saved"
    });
    expect(layerDisplayForCard(baseCard(), "signals")).toMatchObject({
      body: "Warp launches AI features",
      sourceCount: 1,
      status: "saved"
    });
  });

  // Why care (whyItMatters), The case (holds/breaks), Timing, and Next question now render
  // from the investor read; their derivation is covered in investor-lens.test.ts.

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

  it("clusters duplicate raise coverage into one corroborated signal row", () => {
    const card = baseCard({
      signals: [
        {
          title: "Warp raises $50M at $400M valuation to expand agentic terminal",
          url: "https://techcrunch.com/warp-series-b",
          date: "2026-04-02",
          source: "TechCrunch",
          category: "funding",
          citationIds: ["c1"]
        },
        {
          title: "Warp raises $50M Series B led by Sequoia",
          url: "https://thenextweb.com/warp-series-b",
          date: "2026-04-03",
          source: "TNW",
          category: "funding",
          citationIds: ["c2"]
        },
        {
          title: "Warp ships agent mode for long-running tasks",
          url: "https://warp.dev/blog/agent-mode",
          date: "2026-05-10",
          source: "Warp",
          category: "launch",
          citationIds: ["c3"]
        }
      ],
      citations: [
        { id: "c1", url: "https://techcrunch.com/warp-series-b", title: "TechCrunch", fetchedAt: "2026-05-11T12:00:00.000Z", sourceType: "news" },
        { id: "c2", url: "https://thenextweb.com/warp-series-b", title: "TNW", fetchedAt: "2026-05-11T12:00:00.000Z", sourceType: "news" },
        { id: "c3", url: "https://warp.dev/blog/agent-mode", title: "Warp", fetchedAt: "2026-05-11T12:00:00.000Z", sourceType: "company_site" }
      ]
    });

    const display = layerDisplayForCard(card, "signals");

    expect(display?.items).toHaveLength(2);
    expect(display?.statusLine).toBe("2 events · 3 sources");
    const raise = display?.items?.find((item) => item.title.includes("$50M"));
    expect(raise?.corroboration).toBe(2);
    expect(raise?.date).toBe("Apr 2 2026");
    expect(raise?.meta).toContain("TechCrunch");
    const launch = display?.items?.find((item) => item.title.includes("agent mode"));
    expect(launch?.corroboration).toBeUndefined();
    expect(launch?.sourceClass).toBe("company");
  });

  it("ignores a derived stored traction section in favor of clustered card signals", () => {
    const derivedSection: ResearchSection = {
      slug: "warp",
      domain: "warp.dev",
      sectionId: "traction",
      visibility: "public",
      status: "available",
      content: {
        status: "available",
        summary: "2026-05-10: Warp launches AI features",
        items: [
          { label: "launch", text: "2026-05-10: Warp launches AI features", citationIds: ["c1"], meta: "Warp" },
          { label: "launch", text: "2026-05-10: Warp launches AI features again", citationIds: ["c1"], meta: "Warp" }
        ],
        confidence: "medium"
      },
      citationIds: ["c1"],
      sourceIds: [],
      runId: null,
      error: null,
      generatedAt: null,
      staleAt: null
    };

    const display = layerDisplayForCard(baseCard(), "signals", [derivedSection]);

    // Card has one signal; the stale two-item derived projection does not win.
    expect(display?.items).toHaveLength(1);
    expect(display?.items?.[0]?.title).toBe("Warp launches AI features");
    expect(display?.items?.[0]?.date).toBe("May 10 2026");
  });

  it("prefers a deep LLM-authored traction section and renders legacy items headline-first", () => {
    const deepSection: ResearchSection = {
      slug: "warp",
      domain: "warp.dev",
      sectionId: "traction",
      visibility: "public",
      status: "available",
      content: {
        status: "available",
        summary: "Warp shows real adoption momentum.",
        items: [
          { label: "launch", text: "2026-05-10: Warp launches AI features", citationIds: ["c1"], meta: "Warp" },
          { label: "Senior hires accelerate", text: "Three staff engineers joined from Google in one quarter.", citationIds: ["c1"] }
        ],
        confidence: "medium"
      },
      citationIds: ["c1"],
      sourceIds: [],
      runId: "run-7",
      error: null,
      generatedAt: "2026-05-11T12:00:00.000Z",
      staleAt: null
    };

    const display = layerDisplayForCard(baseCard(), "signals", [deepSection]);

    expect(display?.items).toHaveLength(2);
    // Legacy "DATE: TITLE" item is unpacked: headline in the title slot, date quiet.
    expect(display?.items?.[0]?.title).toBe("Warp launches AI features");
    expect(display?.items?.[0]?.date).toBe("May 10 2026");
    expect(display?.items?.[0]?.meta).toBe("Warp · launch");
    // Deep-authored item keeps its label headline and explanation body.
    expect(display?.items?.[1]?.title).toBe("Senior hires accelerate");
    expect(display?.items?.[1]?.body).toBe("Three staff engineers joined from Google in one quarter.");
    expect(display?.statusLine).toBe("2 events · 1 source");
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

    expect(display?.status).toBe("saved");
    expect(display?.body).toContain("disclosed");
    expect(display?.items?.map((item) => item.title)).toEqual([
      "$91M disclosed across 2 rounds",
      "Series B",
      "Seed"
    ]);
    // Backer names surface once, as deduped pills: round leads in ledger order, then the
    // investors fact, with "Kleiner Perkins" (lead AND named investor) collapsed to one entry.
    expect(display?.investors).toEqual(["Kleiner Perkins", "Index", "Index Ventures"]);
    expect(display?.items?.[0]?.body).toBeUndefined();
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

    expect(display?.status).toBe("saved");
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

    expect(display?.status).toBe("saved");
    expect(display?.items?.map((item) => item.title)).toEqual(["ReadMe"]);
    expect(display?.sourceCount).toBe(1);
    expect(display?.sources[0]).toMatchObject({ domain: "readme.com", href: "https://readme.com" });
  });

  it("leads the competition body with the framing line and feeds its citations into sources", () => {
    const display = layerDisplayForCard(baseCard({
      comparables: [
        { name: "Cursor", domain: "cursor.com", oneLiner: "AI code editor.", basis: "Same developer budget line for AI-assisted coding." },
      ],
      competitionFraming: {
        value: "Warp competes in the AI-native terminal slice, which is still sparsely populated.",
        status: "verified",
        confidence: "medium",
        citationIds: ["c1"],
      },
    }), "competition");

    expect(display?.body).toBe("Warp competes in the AI-native terminal slice, which is still sparsely populated.");
    expect(display?.status).toBe("saved");
    expect(display?.sources.map((source) => source.domain)).toContain("warp.dev");
  });

  it("falls back to the comparable list summary when no framing is present", () => {
    const display = layerDisplayForCard(baseCard({
      comparables: [{ name: "Cursor", domain: "cursor.com", oneLiner: "AI code editor." }],
    }), "competition");

    expect(display?.body).toBe("Cursor (cursor.com)");
    expect(display?.status).toBe("saved");
  });

  it("renders basis as the per-comp reason, falling back to oneLiner for legacy cards", () => {
    const display = layerDisplayForCard(baseCard({
      comparables: [
        { name: "Cursor", domain: "cursor.com", oneLiner: "AI code editor.", basis: "Same buyer evaluating AI pair-programming spend." },
        { name: "Zed", domain: "zed.dev", oneLiner: "Fast collaborative code editor." },
      ],
    }), "competition");

    expect(display?.items?.find((item) => item.title === "Cursor")?.body).toBe("Same buyer evaluating AI pair-programming spend.");
    expect(display?.items?.find((item) => item.title === "Zed")?.body).toBe("Fast collaborative code editor.");
  });

  it("reports the empty state when there is no framing and no comparables", () => {
    const display = layerDisplayForCard(baseCard({ comparables: [] }), "competition");

    expect(display?.status).toBe("empty");
    expect(display?.body).toBe("No useful competitive evidence found yet.");
  });

  it("uses stable drag thresholds for card pinning", () => {
    expect(dragOffsetShouldPreview(-32)).toBe(true);
    expect(dragOffsetShouldPreview(-31)).toBe(false);
    expect(dragOffsetShouldPreview(-68, 3)).toBe(true);
    expect(dragOffsetShouldPreview(-67, 3)).toBe(false);
    expect(dragOffsetShouldSnap(-68)).toBe(true);
    expect(dragOffsetShouldSnap(-67)).toBe(false);
    expect(dragOffsetShouldSnap(-152, 0, 3)).toBe(true);
    expect(dragOffsetShouldSnap(-151, 0, 3)).toBe(false);
    expect(dragOffsetShouldSnap(-34, -540)).toBe(true);
    expect(dragOffsetShouldSnap(-70, -540, 3)).toBe(true);
    expect(dragOffsetShouldSnap(-59, -120)).toBe(true);
    expect(dragOffsetShouldSnap(-40, -40)).toBe(false);
    expect(dragOffsetShouldSuppressClick({ x: 0, y: -6 })).toBe(false);
    expect(dragOffsetShouldSuppressClick({ x: 6, y: 0 })).toBe(false);
    expect(dragOffsetShouldSuppressClick({ x: 0, y: -7 })).toBe(true);
    expect(Math.round(projectVelocity(-120))).toBe(-60);
    expect(dampenDragOffset(-180)).toBeLessThan(-150);
    expect(dampenDragOffset(-180)).toBeGreaterThan(-165);
  });
});
