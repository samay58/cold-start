import { describe, expect, it } from "vitest";
import type { ColdStartCard } from "../src/index";
import {
  analysisBlockedReason,
  canRunInvestorAnalysis,
  hasUsablePublicProfile,
  publicProfileQuality,
  publicProfileStructuredFactCount,
  publicProfileVisibleFactCount,
} from "../src/index";

function fact<T>(value: T | null) {
  return {
    value,
    status: value === null ? "unknown" as const : "verified" as const,
    confidence: value === null ? "low" as const : "medium" as const,
    citationIds: value === null ? [] : ["c1"],
  };
}

function card(overrides: Partial<ColdStartCard> = {}): ColdStartCard {
  return {
    slug: "cartesia",
    domain: "cartesia.ai",
    generatedAt: "2026-05-14T00:00:00.000Z",
    generationCostUsd: 0,
    cacheStatus: "hit",
    identity: {
      name: fact("Cartesia"),
      websiteUrl: fact("https://cartesia.ai"),
      logoUrl: null,
      oneLiner: fact("Voice AI infrastructure."),
      hq: fact({ city: "San Francisco", country: "United States" }),
      foundedYear: fact(2023),
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
      headcount: fact(null),
    },
    signals: [],
    comparables: [],
    citations: [
      {
        id: "c1",
        url: "https://cartesia.ai",
        title: "Cartesia",
        fetchedAt: "2026-05-14T00:00:00.000Z",
        sourceType: "company_site",
      },
    ],
    ...overrides,
  };
}

describe("public profile quality", () => {
  it("does not treat citations alone as a usable profile", () => {
    const underfilled = card({
      identity: {
        ...card().identity,
        websiteUrl: fact(null),
        hq: fact(null),
        foundedYear: fact(null),
      },
    });

    expect(publicProfileStructuredFactCount(underfilled)).toBe(0);
    expect(publicProfileVisibleFactCount(underfilled)).toBe(0);
    expect(hasUsablePublicProfile(underfilled)).toBe(false);
    expect(canRunInvestorAnalysis(underfilled)).toBe(false);
    expect(analysisBlockedReason(underfilled)).toBe("profile needs more structured facts before analysis");
  });

  it("accepts a cited profile with enough structured facts", () => {
    const usable = card({
      team: {
        ...card().team,
        headcount: fact({ value: 64, asOf: "2026-05-14" }),
      },
      comparables: [
        {
          name: "ElevenLabs",
          domain: "elevenlabs.io",
          oneLiner: "Voice AI platform.",
        },
      ],
    });

    expect(publicProfileStructuredFactCount(usable)).toBeGreaterThanOrEqual(4);
    expect(hasUsablePublicProfile(usable)).toBe(true);
    expect(canRunInvestorAnalysis(usable)).toBe(true);
  });

  it("reports analysis readiness separately from structured fact count", () => {
    const missingSummary = card({
      identity: {
        ...card().identity,
        oneLiner: fact(null),
      },
      team: {
        ...card().team,
        headcount: fact({ value: 64, asOf: "2026-05-15" }),
      },
      comparables: [
        {
          name: "ElevenLabs",
          domain: "elevenlabs.io",
          oneLiner: "Voice AI platform.",
        },
      ],
    });

    expect(publicProfileStructuredFactCount(missingSummary)).toBe(5);
    expect(publicProfileQuality(missingSummary)).toMatchObject({
      hasCitations: true,
      hasName: true,
      hasSummary: false,
      structuredFactCount: 5,
      visibleFactCount: 3,
      minimumStructuredFactCount: 4,
      isAnalysisReady: false,
    });
    expect(analysisBlockedReason(missingSummary)).toBe("profile needs more structured facts before analysis");
  });

  it("rejects domain-placeholder names and hollow visible profiles", () => {
    const shell = card({
      domain: "databricks.com",
      identity: {
        ...card().identity,
        name: fact("databricks.com"),
        websiteUrl: fact("https://databricks.com"),
        oneLiner: fact("databricks.com"),
        hq: fact(null),
        foundedYear: fact(null),
      },
      funding: {
        totalRaisedUsd: fact(null),
        lastRound: fact(null),
        investors: fact([{ name: "Andreessen Horowitz", domain: "a16z.com" }]),
      },
      signals: [
        {
          title: "Databricks source mention",
          url: "https://example.com/databricks",
          date: "2026-05-15",
          source: "Example",
          category: "news",
          citationIds: ["c1"],
        },
      ],
      comparables: [
        {
          name: "Snowflake",
          domain: "snowflake.com",
          oneLiner: "Cloud data platform.",
          citationIds: ["c1"],
        },
      ],
    });

    expect(publicProfileQuality(shell)).toMatchObject({
      hasCitations: true,
      hasName: false,
      hasSummary: false,
      structuredFactCount: 4,
      visibleFactCount: 1,
      isAnalysisReady: false,
    });
    expect(hasUsablePublicProfile(shell)).toBe(false);
    expect(canRunInvestorAnalysis(shell)).toBe(false);
  });
});
