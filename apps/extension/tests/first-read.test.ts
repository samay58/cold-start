import { describe, expect, it } from "vitest";
import type { ColdStartCard } from "@cold-start/core";
import type { ExtensionResearchRunEvent, ExtensionSourceSummary } from "../src/extension-config";
import { firstReadForCard, firstReadIsFiled, firstReadIsPending } from "../src/first-read";

function card(input: {
  concept?: string | null;
  mechanism?: string | null;
  serves?: string | null;
  citationIds?: string[];
  oneLiner?: string | null;
}): ColdStartCard {
  const citationIds = input.citationIds ?? ["c1"];
  return {
    slug: "exa",
    domain: "exa.ai",
    generatedAt: "2026-06-21T00:00:00.000Z",
    generationCostUsd: 0,
    cacheStatus: "partial",
    identity: {
      name: { value: "Exa", status: "verified", confidence: "high", citationIds: ["c1"] },
      websiteUrl: { value: "https://exa.ai/", status: "verified", confidence: "high", citationIds: ["c1"] },
      logoUrl: null,
      oneLiner: { value: input.oneLiner ?? "Search infrastructure for AI applications.", status: "verified", confidence: "high", citationIds },
      description: {
        value: {
          shortDescription: "Exa builds search and research infrastructure for AI products.",
          concept: input.concept ?? "Search and research infrastructure for AI products.",
          mechanism: input.mechanism ?? "A search API and crawler tuned for AI applications.",
          serves: input.serves ?? "AI product teams and developers building search-heavy workflows."
        },
        status: citationIds.length > 0 ? "verified" : "unknown",
        confidence: citationIds.length > 0 ? "high" : "low",
        citationIds
      },
      hq: { value: { city: "San Francisco", country: "United States" }, status: "verified", confidence: "medium", citationIds: ["c1"] },
      foundedYear: { value: 2021, status: "verified", confidence: "medium", citationIds: ["c1"] },
      status: "private"
    },
    funding: {
      totalRaisedUsd: { value: null, status: "unknown", confidence: "low", citationIds: [] },
      lastRound: { value: null, status: "unknown", confidence: "low", citationIds: [] },
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
    ]
  };
}

function source(input: Partial<ExtensionSourceSummary> & Pick<ExtensionSourceSummary, "domain" | "sourceType">): ExtensionSourceSummary {
  return {
    fetchedAt: "2026-06-21T00:00:00.000Z",
    id: `${input.sourceType}-${input.domain}`,
    snippet: "",
    title: input.domain,
    url: `https://${input.domain}`,
    ...input
  };
}

function event(input: Partial<ExtensionResearchRunEvent> & Pick<ExtensionResearchRunEvent, "id" | "type">): ExtensionResearchRunEvent {
  return {
    createdAt: "2026-06-21T00:00:00.000Z",
    domain: "exa.ai",
    message: input.type,
    metadata: {},
    runId: "run-1",
    sectionId: null,
    slug: "exa",
    ...input
  };
}

describe("firstReadForCard", () => {
  it("returns a source-backed product and buyer read from structured description fields", () => {
    expect(firstReadForCard({
      card: card({}),
      events: [event({ id: "partial", metadata: { citationCount: 5 }, type: "card.partial" })],
      sources: [
        source({ domain: "exa.ai", sourceType: "company_site" }),
        source({ domain: "docs.exa.ai", sourceType: "company_site" }),
        source({ domain: "techcrunch.com", sourceType: "news", title: "Exa raises funding" })
      ]
    })).toMatchObject({
      buyerLine: "AI product teams and developers building search-heavy workflows.",
      evidenceCategories: ["company site", "docs", "funding coverage"],
      missingProofLine: "Named customers and budget owner.",
      productLine: "Exa builds search and research infrastructure for AI products.",
      status: "ready"
    });
  });

  it("does not show buyer copy when the description is not source-backed", () => {
    expect(firstReadForCard({
      card: card({ citationIds: [] }),
      events: [],
      sources: []
    })).toMatchObject({
      buyerLine: "Buyer not proven yet.",
      evidenceCategories: ["company profile"],
      missingProofLine: "Buyer and customer proof.",
      status: "ready"
    });
  });

  it("does not emit empty or marketing-filler copy", () => {
    const read = firstReadForCard({
      card: card({
        concept: "AI-native platform powering agentic workflows",
        mechanism: null,
        oneLiner: "Emerging leader in agentic AI.",
        serves: "Likely positioned as a platform for everyone."
      }),
      events: [],
      sources: []
    });

    expect(read.productLine).toBe("Exa builds search and research infrastructure for AI products.");
    expect([read.productLine, read.buyerLine, read.missingProofLine].join(" ")).not.toMatch(/AI-native|emerging leader|agentic|platform for everyone/i);
  });
});

describe("first-read event state", () => {
  it("scopes saved/enriched signals to the latest profile run", () => {
    const oldRunSaved = event({
      createdAt: "2026-06-20T01:00:00.000Z",
      id: "old-saved",
      metadata: { sourceCount: 3 },
      runId: "run-old",
      type: "card.saved"
    });
    const activeRunPartial = event({
      createdAt: "2026-06-21T00:00:00.000Z",
      id: "active-partial",
      runId: "run-new",
      type: "card.partial"
    });

    expect(firstReadIsFiled([oldRunSaved, activeRunPartial])).toBe(false);
    expect(firstReadIsPending([oldRunSaved, activeRunPartial])).toBe(true);
  });

  it("respects latest filed event when the active run is newer", () => {
    const activeRunPartial = event({
      createdAt: "2026-06-20T01:00:00.000Z",
      id: "active-partial",
      runId: "run-new",
      type: "card.partial"
    });
    const newerRunSaved = event({
      createdAt: "2026-06-21T00:00:00.000Z",
      id: "new-saved",
      runId: "run-new",
      type: "card.saved"
    });

    expect(firstReadIsFiled([activeRunPartial, newerRunSaved])).toBe(true);
    expect(firstReadIsPending([activeRunPartial, newerRunSaved])).toBe(false);
  });

  it("uses metadata from the latest profile run for evidence categories", () => {
    const cardData = card({});
    const oldRunFundingEvent = event({
      createdAt: "2026-06-20T00:00:00.000Z",
      id: "old-funding",
      runId: "run-old",
      type: "source.found",
      metadata: { sourceCategory: "funding coverage" }
    });
    const activeRunEvent = event({
      createdAt: "2026-06-21T00:00:00.000Z",
      id: "active-partial",
      runId: "run-new",
      type: "card.partial",
      metadata: {}
    });

    expect(firstReadForCard({ card: cardData, events: [oldRunFundingEvent, activeRunEvent] }).evidenceCategories).toEqual(["company profile"]);
  });
});
