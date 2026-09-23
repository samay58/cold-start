import { describe, expect, it } from "vitest";
import type { ColdStartCard } from "../src/index";
import { coldStartCardSchema, fundingEvidenceFromCitations, materializeFundingFromCitations } from "../src/index";

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
      founders: fact(null),
      keyExecs: fact(null),
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
      {
        id: "e3",
        url: "https://techfundingnews.com/polymarket-400m-15b-valuation-ice-nyse-investment/",
        title: "Prediction market startup Polymarket nabs $400M at $15B valuation from NYSE owner: sources",
        fetchedAt: "2026-05-19T12:00:00.000Z",
        sourceType: "news",
        snippet:
          "Main competitor Kalshi raised $1B at $22B valuation and leads US market with ~$1.5B annual revenues. Polymarket considering IPO.",
      },
    ],
    ...overrides,
  };
}

describe("funding evidence fallback", () => {
  it("expands decimal millions without binary rounding before saving a card", () => {
    const input = card();
    input.citations = [{ ...input.citations[0]!, snippet: "Polymarket raised $33.3 million in a Series A round." }];
    const result = materializeFundingFromCitations(input);
    expect(result.funding.lastRound.value?.amountUsd).toBe(33_300_000);
    expect(coldStartCardSchema.safeParse(result).success).toBe(true);
  });

  it("does not promote a lifetime total to a single financing round", () => {
    const input = card();
    input.citations = [{ ...input.citations[0]!, snippet: "Polymarket has raised a total of $33.3 million." }];
    expect(materializeFundingFromCitations(input).funding.lastRound.value).toBeNull();
  });

  it("does not use an unassigned same-name article to fill funding", () => {
    const input = card();
    input.slug = "column";
    input.domain = "column.com";
    input.identity.name = fact("Column", ["c1"]);
    input.citations = [{ ...input.citations[0]!, url: "https://column.com/", title: "Column bank" }, {
      ...input.citations[1]!, title: "Startup Public Notice Tech Firm Column Raises $30M",
      snippet: "Column raised $30 million for its public notice business."
    }];
    expect(materializeFundingFromCitations(input).funding.lastRound.value).toBeNull();
    expect(fundingEvidenceFromCitations(input)).toEqual([]);
  });

  it.each(["$1.0000001 million", "$99,99 million", "$9007199255 billion"])("keeps an unusable amount unknown: %s", (amount) => {
    const input = card();
    input.citations = [{ ...input.citations[0]!, snippet: `Polymarket raised ${amount} in a round.` }];
    expect(materializeFundingFromCitations(input).funding.lastRound.value).toBeNull();
  });
  it("prefers a completed financing amount over valuation and target amounts", () => {
    const input = card();
    input.identity.name.citationIds.push("e2");
    expect(fundingEvidenceFromCitations(input)[0]).toMatchObject({
      amountLabel: "$600M",
      amountUsd: 600_000_000,
      citationIds: ["e2"],
      status: "closed",
    });
  });

  it("labels a single-digit-million raise the way the shared money formatter does", () => {
    const input = card();
    input.citations = [{ ...input.citations[0]!, snippet: "Polymarket raised $6.25 million in a seed round." }];
    expect(fundingEvidenceFromCitations(input)[0]).toMatchObject({ amountLabel: "$6.3M", amountUsd: 6_250_000 });
  });

  it("materializes a cited financing round when structured funding is empty", () => {
    const input = card();
    input.identity.name.citationIds.push("e2");
    const materialized = materializeFundingFromCitations(input);

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

    pledgeOnly.identity.name.citationIds = ["e1"];
    expect(fundingEvidenceFromCitations(pledgeOnly)[0]).toMatchObject({
      amountLabel: "$2B",
      amountUsd: 2_000_000_000,
      status: "reported",
    });
    expect(materializeFundingFromCitations(pledgeOnly).funding.lastRound.value).toBeNull();
  });
});
