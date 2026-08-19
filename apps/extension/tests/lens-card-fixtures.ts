import type { ColdStartCard, HowItWins } from "@cold-start/core";

// One filed How it wins read, shared by the crown's jsdom suite and the Playwright specs so the
// same six targets (three running, the hybrid/chokepoint bracket, two queued) are on screen
// everywhere. Notes carry citation markers like every other synthesis string; the display model
// strips them before the crown renders.
export function filedHowItWins(): HowItWins {
  return {
    status: "read",
    sentence: "It wins by combining two rare skills, and by sitting where two labs must pass through it.",
    running: [
      {
        strategy: "hybrid",
        meaning: "Wins by pairing two skills rarely combined.",
        note: "It builds live network environments and has models attack and defend inside them [c1].",
        citationIds: ["c1"]
      },
      {
        strategy: "chokepoint",
        meaning: "Controls a required passage.",
        note: "Two labs name its benchmarks before releasing a model [c1].",
        citationIds: ["c1"]
      },
      {
        strategy: "prestige",
        meaning: "Endorsed by credible outside sources.",
        note: "Two named investors put in personal money alongside the round [c2].",
        citationIds: ["c2"]
      }
    ],
    pair: {
      strategies: ["hybrid", "chokepoint"],
      note: "The method produced the passage: the same testing approach is what both labs now name in their own documents [c1].",
      wrongIf: "a lab could swap evaluators without a visible change in its own documentation.",
      citationIds: ["c1"]
    },
    next: [
      {
        strategy: "monopoly",
        note: "Would need a regulator naming it directly, not just a government contract [c2].",
        citationIds: ["c2"]
      },
      {
        strategy: "standardization",
        note: "Would need a third lab to adopt the same benchmarks independently [c1].",
        citationIds: ["c1"]
      }
    ],
    wrongIf: "a lab could swap evaluators without a visible change in its own documentation."
  };
}

// Shared minimal ColdStartCard fixtures for the lens/research-layer test suites. Two distinct
// company bodies existed across these suites before consolidation, each hand-rolled per file:
//   - minimalWarpCard (warp.dev, no identity.description/websiteUrl, no filed round): shared by
//     investor-read-card.test.tsx's baseCard and investor-lens.test.ts's card(), which layers its
//     own identity.description override on top.
//   - minimalExaCard (exa.ai, with identity.description, websiteUrl, and a filed Series A
//     round): was byte-identical between lens-withheld.test.tsx's card() and
//     research-layer-panel.test.tsx's card().

export function minimalWarpCard(overrides: Partial<ColdStartCard> = {}): ColdStartCard {
  return {
    slug: "warp",
    domain: "warp.dev",
    generatedAt: "2026-06-23T12:00:00.000Z",
    generationCostUsd: 0,
    cacheStatus: "hit",
    identity: {
      name: { value: "Warp", status: "verified", confidence: "high", citationIds: ["c1"] },
      logoUrl: null,
      oneLiner: { value: "AI terminal for developers.", status: "verified", confidence: "high", citationIds: ["c1"] },
      hq: { value: { city: "San Francisco", country: "US" }, status: "verified", confidence: "medium", citationIds: ["c1"] },
      foundedYear: { value: 2021, status: "verified", confidence: "medium", citationIds: ["c1"] },
      status: "private"
    },
    funding: {
      totalRaisedUsd: { value: null, status: "unknown", confidence: "low", citationIds: [] },
      lastRound: { value: null, status: "unknown", confidence: "low", citationIds: [] },
      investors: { value: [], status: "unknown", confidence: "low", citationIds: [] }
    },
    team: {
      founders: { value: [], status: "unknown", confidence: "low", citationIds: [] },
      keyExecs: { value: [], status: "unknown", confidence: "low", citationIds: [] },
      headcount: { value: null, status: "unknown", confidence: "low", citationIds: [] }
    },
    signals: [],
    comparables: [],
    citations: [
      { id: "c1", url: "https://warp.dev", title: "Warp", fetchedAt: "2026-06-23T12:00:00.000Z", sourceType: "company_site" },
      {
        id: "c2",
        url: "https://example.com/warp-deep-dive",
        title: "Independent Warp deep dive",
        fetchedAt: "2026-06-23T12:00:00.000Z",
        sourceType: "news",
        sourceQuality: {
          tier: "independent_analysis",
          label: "Independent analysis",
          rationale: "Independent product analysis.",
          incentive: "No direct company incentive."
        }
      }
    ],
    ...overrides
  };
}

export function minimalExaCard(overrides: Partial<ColdStartCard> = {}): ColdStartCard {
  return {
    slug: "exa",
    domain: "exa.ai",
    generatedAt: "2026-06-21T00:00:00.000Z",
    generationCostUsd: 0,
    cacheStatus: "hit",
    identity: {
      name: { value: "Exa", status: "verified", confidence: "high", citationIds: ["c1"] },
      websiteUrl: { value: "https://exa.ai/", status: "verified", confidence: "high", citationIds: ["c1"] },
      logoUrl: null,
      oneLiner: { value: "Search infrastructure for AI applications.", status: "verified", confidence: "high", citationIds: ["c1"] },
      description: {
        value: {
          shortDescription: "Exa builds search and research infrastructure for AI products.",
          concept: "Search and research infrastructure for AI products.",
          mechanism: "A search API and crawler tuned for AI applications.",
          serves: "AI product teams and developers building search-heavy workflows."
        },
        status: "verified",
        confidence: "high",
        citationIds: ["c1"]
      },
      hq: { value: { city: "San Francisco", country: "United States" }, status: "verified", confidence: "medium", citationIds: ["c1"] },
      foundedYear: { value: 2021, status: "verified", confidence: "medium", citationIds: ["c1"] },
      status: "private"
    },
    funding: {
      totalRaisedUsd: { value: null, status: "unknown", confidence: "low", citationIds: [] },
      lastRound: {
        value: { name: "Series A", amountUsd: null, announcedAt: null, leadInvestors: [] },
        status: "verified",
        confidence: "medium",
        citationIds: ["c1"]
      },
      investors: { value: null, status: "unknown", confidence: "low", citationIds: [] }
    },
    team: {
      founders: { value: [], status: "unknown", confidence: "low", citationIds: [] },
      keyExecs: { value: [], status: "unknown", confidence: "low", citationIds: [] },
      headcount: { value: null, status: "unknown", confidence: "low", citationIds: [] }
    },
    signals: [],
    comparables: [],
    citations: [
      {
        id: "c1",
        url: "https://exa.ai/",
        title: "Exa",
        fetchedAt: "2026-06-21T00:00:00.000Z",
        sourceType: "company_site",
        snippet: "Exa builds search infrastructure for AI applications."
      }
    ],
    ...overrides
  };
}
