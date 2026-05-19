import { describe, expect, it } from "vitest";
import type { ColdStartCard } from "../src/index";
import { fundingEvidenceFromCitations, materializeFundingFromCitations } from "../src/index";

function fact<T>(value: T | null, citationIds: string[] = []) {
  return {
    value,
    status: value === null ? "unknown" as const : "verified" as const,
    confidence: value === null ? "low" as const : "medium" as const,
    citationIds,
  };
}

function card(overrides: Partial<ColdStartCard> = {}): ColdStartCard {
  return {
    slug: "polymarket",
    domain: "polymarket.com",
    generatedAt: "2026-05-19T12:00:00.000Z",
    generationCostUsd: 0,
    cacheStatus: "hit",
    identity: {
      name: fact("Polymarket", ["c1"]),
      websiteUrl: fact("https://polymarket.com", ["c1"]),
      logoUrl: null,
      oneLiner: fact("Prediction market.", ["c1"]),
      hq: fact({ city: "New York", country: "United States" }, ["c1"]),
      foundedYear: fact(null),
      status: "private",
    },
    funding: {
      totalRaisedUsd: fact(null),
      lastRound: fact(null),
      investors: fact(null),
    },
    team: {
      founders: fact([]),
      keyExecs: fact([]),
      headcount: fact({ value: 209, asOf: "2026-04-21" }, ["c1"]),
    },
    signals: [],
    comparables: [],
    citations: [
      {
        id: "c1",
        url: "https://polymarket.com",
        title: "Polymarket",
        fetchedAt: "2026-05-19T12:00:00.000Z",
        sourceType: "company_site",
      },
      {
        id: "e1",
        url: "https://www.bloomberg.com/news/articles/2026-04-20/polymarket-in-talks-for-new-investment-at-15-billion-valuation",
        title: "Polymarket Seeks $400 Million in New Funding at $15 Billion Valuation",
        fetchedAt: "2026-05-19T12:00:00.000Z",
        sourceType: "news",
        snippet:
          "Polymarket is seeking an additional $400 million in funding, after securing $600 million at a $15 billion valuation last month.",
      },
      {
        id: "e2",
        url: "https://www.covers.com/industry/polymarket-seeks-fundraising-at-15b-valuation-april-21-2026",
        title: "Polymarket Seeks Fundraising at $15B Valuation",
        fetchedAt: "2026-05-19T12:00:00.000Z",
        sourceType: "news",
        snippet:
          "ICE pledged $2B, completed with $600M injection in March 2026 at $9B valuation. Now seeking $400M at $15B.",
      },
    ],
    ...overrides,
  };
}

describe("funding evidence fallback", () => {
  it("prefers a completed financing amount over valuation and target amounts", () => {
    expect(fundingEvidenceFromCitations(card())[0]).toMatchObject({
      amountLabel: "$600M",
      amountUsd: 600_000_000,
      citationIds: ["e2"],
      status: "closed",
    });
  });

  it("materializes a cited financing round when structured funding is empty", () => {
    const materialized = materializeFundingFromCitations(card());

    expect(materialized.funding.lastRound).toMatchObject({
      value: {
        name: "Reported financing",
        amountUsd: 600_000_000,
      },
      status: "inferred",
      confidence: "medium",
      citationIds: ["e2"],
    });
    expect(materialized.funding.rounds?.value?.[0]?.amountUsd).toBe(600_000_000);
    expect(materialized.funding.totalRaisedUsd.value).toBeNull();
  });

  it("does not materialize pledged commitments as closed funding", () => {
    const pledgeOnly = card({
      citations: [
        {
          id: "e1",
          url: "https://example.com/polymarket-investment",
          title: "ICE pledged up to $2B commitment to Polymarket",
          fetchedAt: "2026-05-19T12:00:00.000Z",
          sourceType: "news",
          snippet: "ICE pledged up to $2B as a future investment commitment to Polymarket.",
        }
      ],
    });

    expect(fundingEvidenceFromCitations(pledgeOnly)[0]).toMatchObject({
      amountLabel: "$2B",
      amountUsd: 2_000_000_000,
      status: "reported",
    });
    expect(materializeFundingFromCitations(pledgeOnly).funding.lastRound.value).toBeNull();
  });
});
