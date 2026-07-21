import { describe, expect, it } from "vitest";
import type { Citation, ColdStartCard } from "../src/index";
import { synthesisAdvisoriesFromSignals, synthesisGateDecision } from "../src/synthesis-evidence";

const generatedAt = "2026-06-23T12:00:00.000Z";
const MIN_CITATIONS = 8;

function fact<T>(value: T, citationIds: string[]) {
  return { value, status: "verified" as const, confidence: "medium" as const, citationIds };
}

function person(name: string) {
  return { name, role: "Co-founder", sourceUrl: null };
}

function citations(count: number, sourceTypes: [Citation["sourceType"], ...Citation["sourceType"][]]): Citation[] {
  return Array.from({ length: count }, (_, index) => ({
    id: `c${index}`,
    url: `https://example.com/${index}`,
    title: `Source ${index}`,
    fetchedAt: generatedAt,
    sourceType: sourceTypes[index % sourceTypes.length] ?? sourceTypes[0]
  }));
}

function baseCard(overrides: Partial<ColdStartCard> = {}): ColdStartCard {
  return {
    slug: "acme",
    domain: "acme.com",
    generatedAt,
    generationCostUsd: 0,
    cacheStatus: "hit",
    identity: {
      name: fact("Acme", ["c0"]),
      logoUrl: null,
      oneLiner: fact("Acme builds developer infrastructure.", ["c0"]),
      hq: fact({ city: "San Francisco", country: "United States" }, ["c0"]),
      foundedYear: fact(2020, ["c0"]),
      status: "private"
    },
    funding: {
      totalRaisedUsd: fact(null, []),
      lastRound: fact(null, []),
      investors: fact(null, [])
    },
    team: {
      founders: fact([], []),
      keyExecs: fact([], []),
      headcount: fact(null, [])
    },
    signals: [],
    comparables: [],
    citations: [],
    ...overrides
  } as ColdStartCard;
}

describe("synthesisGateDecision", () => {
  it("(a) blocks nothing for a news-only card with 20 citations, flags single-source-class and missing evidence advisories", () => {
    const card = baseCard({
      citations: citations(20, ["news"])
    });

    const decision = synthesisGateDecision(card, MIN_CITATIONS);

    expect(decision.blocked).toBe(false);
    expect(decision.reasons).toEqual([]);
    expect(decision.advisories).toEqual(
      expect.arrayContaining(["single-source-class", "no-funding-evidence", "no-named-team"])
    );
    expect(decision.signals.citationCount).toBe(20);
    expect(decision.signals.nonEnrichmentSourceTypes).toEqual(["news"]);
  });

  it("(b) blocks a card with 5 citations for citation-floor only", () => {
    const card = baseCard({
      citations: citations(5, ["news"])
    });

    const decision = synthesisGateDecision(card, MIN_CITATIONS);

    expect(decision.blocked).toBe(true);
    expect(decision.reasons).toEqual(["citation-floor"]);
    expect(decision.signals.citationCount).toBe(5);
  });

  it("(c) blocks a card whose citations are all enrichment for no-usable-source-type", () => {
    const card = baseCard({
      citations: citations(10, ["enrichment"])
    });

    const decision = synthesisGateDecision(card, MIN_CITATIONS);

    expect(decision.blocked).toBe(true);
    expect(decision.reasons).toEqual(["no-usable-source-type"]);
    expect(decision.signals.nonEnrichmentSourceTypes).toEqual([]);
  });

  it("(d) returns no reasons and no advisories for a rich card", () => {
    const card = baseCard({
      citations: citations(10, ["news", "company_site"]),
      funding: {
        totalRaisedUsd: fact(5_000_000, ["c0"]),
        lastRound: fact(null, []),
        investors: fact(null, [])
      },
      team: {
        founders: fact([person("Jane Doe")], ["c0"]),
        keyExecs: fact([], []),
        headcount: fact(null, [])
      }
    });

    const decision = synthesisGateDecision(card, MIN_CITATIONS);

    expect(decision.blocked).toBe(false);
    expect(decision.reasons).toEqual([]);
    expect(decision.advisories).toEqual([]);
  });

  it("(e) flags no-named-team without blocking when the rest of the card is rich", () => {
    const card = baseCard({
      citations: citations(10, ["news", "company_site"]),
      funding: {
        totalRaisedUsd: fact(5_000_000, ["c0"]),
        lastRound: fact(null, []),
        investors: fact(null, [])
      },
      team: {
        founders: fact([], []),
        keyExecs: fact([], []),
        headcount: fact(null, [])
      }
    });

    const decision = synthesisGateDecision(card, MIN_CITATIONS);

    expect(decision.blocked).toBe(false);
    expect(decision.advisories).toEqual(["no-named-team"]);
  });

  it("treats a whitespace-only name as no named team member (trimmed, ported verbatim)", () => {
    const card = baseCard({
      citations: citations(10, ["news", "company_site"]),
      funding: {
        totalRaisedUsd: fact(5_000_000, ["c0"]),
        lastRound: fact(null, []),
        investors: fact(null, [])
      },
      team: {
        founders: fact([person("   ")], ["c0"]),
        keyExecs: fact([], []),
        headcount: fact(null, [])
      }
    });

    const decision = synthesisGateDecision(card, MIN_CITATIONS);

    expect(decision.signals.hasNamedTeamMember).toBe(false);
    expect(decision.advisories).toContain("no-named-team");
  });
});

describe("synthesisAdvisoriesFromSignals", () => {
  it("matches synthesisGateDecision's advisory list off the same signals, with no citation-count input", () => {
    const signals = {
      citationCount: 20,
      nonEnrichmentSourceTypes: ["news"],
      hasFundingEvidence: false,
      hasNamedTeamMember: false
    };

    expect(synthesisAdvisoriesFromSignals(signals)).toEqual([
      "single-source-class",
      "no-funding-evidence",
      "no-named-team"
    ]);
  });

  it("returns no advisories once source diversity, funding, and a named team are all present", () => {
    const signals = {
      citationCount: 20,
      nonEnrichmentSourceTypes: ["news", "company_site"],
      hasFundingEvidence: true,
      hasNamedTeamMember: true
    };

    expect(synthesisAdvisoriesFromSignals(signals)).toEqual([]);
  });
});
