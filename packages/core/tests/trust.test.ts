import { describe, expect, it } from "vitest";
import {
  type ColdStartCard,
  publicCard,
  sanitizeCardTrust,
  stripUnsupportedSynthesis
} from "../src/index";

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
  synthesis: {
    whyItMatters: { text: "Cartesia is relevant because real-time voice is a live infra wedge [c1].", citationIds: ["c1"] },
    bullCase: [{ text: "The company has a credible infra wedge [c1].", citationIds: ["c1"] }],
    bearCase: [{ text: "Competition is intense [needs_verification].", citationIds: [] }],
    openQuestions: ["Which buyer owns the budget?"]
  }
};

describe("publicCard", () => {
  it("omits synthesis from the public tier", () => {
    expect(publicCard(baseCard)).not.toHaveProperty("synthesis");
  });
});

describe("sanitizeCardTrust", () => {
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
});

describe("stripUnsupportedSynthesis", () => {
  it("drops synthesis lines that contain verification sentinels", () => {
    const clean = stripUnsupportedSynthesis(baseCard);

    expect(clean.synthesis?.bearCase).toEqual([]);
  });
});
