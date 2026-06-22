import { describe, expect, it } from "vitest";
import type { ColdStartCard } from "@cold-start/core";
import type { ExtensionResearchRunEvent, ExtensionSourceSummary } from "../src/extension-config";
import { firstReadForCard, firstReadIsFiled, firstReadIsPending } from "../src/first-read";

const SUMMARY = "Exa builds search and research infrastructure for AI products.";

function card(input: {
  concept?: string | null;
  mechanism?: string | null;
  serves?: string | null;
  citationIds?: string[];
  oneLiner?: string | null;
  shortDescription?: string | null;
  signals?: ColdStartCard["signals"];
  lastRoundName?: string | null;
  noCitations?: boolean;
} = {}): ColdStartCard {
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
          shortDescription: input.shortDescription ?? "Exa builds search and research infrastructure for AI products.",
          concept: input.concept ?? "Search and research infrastructure for AI products.",
          mechanism: input.mechanism ?? "A search API and crawler tuned for AI applications.",
          serves: input.serves === undefined ? "AI product teams and developers building search-heavy workflows." : input.serves
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
      lastRound: input.lastRoundName
        ? { value: { name: input.lastRoundName, amountUsd: null, announcedAt: null, leadInvestors: [] }, status: "verified", confidence: "medium", citationIds: ["c1"] }
        : { value: null, status: "unknown", confidence: "low", citationIds: [] },
      investors: { value: null, status: "unknown", confidence: "low", citationIds: [] }
    },
    team: {
      founders: { value: [], status: "unknown", confidence: "low", citationIds: [] },
      keyExecs: { value: [], status: "unknown", confidence: "low", citationIds: [] },
      headcount: { value: null, status: "unknown", confidence: "low", citationIds: [] }
    },
    signals: input.signals ?? [],
    comparables: [],
    citations: input.noCitations
      ? []
      : [
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
  it("leads with a source-backed buyer read and a named, weighted evidence ledger", () => {
    const read = firstReadForCard({
      card: card({ lastRoundName: "Series A" }),
      summary: SUMMARY,
      sources: [
        source({ domain: "exa.ai", sourceType: "company_site" }),
        source({ domain: "docs.exa.ai", sourceType: "company_site", url: "https://docs.exa.ai", title: "Exa docs", snippet: "API reference" }),
        source({ domain: "techcrunch.com", sourceType: "news", title: "Exa raises funding" })
      ]
    });

    expect(read.readKind).toBe("buyer");
    expect(read.readLabel).toBe("Who it's for");
    expect(read.read).toBe("AI product teams and developers building search-heavy workflows.");

    // Reporting (independent_report) ranks first, then company-controlled sources.
    expect(read.evidence.map((item) => item.domain)).toEqual(["techcrunch.com", "docs.exa.ai", "exa.ai"]);
    expect(read.evidence[0]).toMatchObject({ domain: "techcrunch.com", cls: "reported", label: "report" });
    expect(read.evidence[1]).toMatchObject({ domain: "docs.exa.ai", cls: "company", label: "docs" });
    expect(read.sourceCount).toBe(3);
    expect(read.substantive).toBe(true);
    expect(read.gap).toBe("Named customers and budget owner.");
    expect(read.status).toBe("ready");
  });

  it("builds the ledger from card citations even when the live sources prop is empty", () => {
    // This is the bug the screenshots showed: 12 citations on the card, but an empty slip
    // because it only read the (absent) sources prop. The ledger must come from citations too.
    const read = firstReadForCard({
      card: card({ serves: null }),
      summary: SUMMARY,
      sources: []
    });

    expect(read.evidence.length).toBeGreaterThan(0);
    expect(read.evidence[0]?.domain).toBe("exa.ai");
    expect(read.read).not.toBe("Reading the first sources.");
  });

  it("marks generic news as reporting, not independent, so the trust count is honest", () => {
    const read = firstReadForCard({
      card: card({ serves: null, noCitations: true }),
      summary: SUMMARY,
      sources: [
        source({ domain: "finsmes.com", sourceType: "news", title: "Runloop coverage", url: "https://finsmes.com/runloop" }),
        source({ domain: "fintech-pulse.com", sourceType: "news", title: "Roundup", url: "https://fintech-pulse.com/x" }),
        source({ domain: "futureteknow.com", sourceType: "news", title: "Weekly digest", url: "https://futureteknow.com/y" })
      ]
    });

    expect(read.evidence.every((item) => item.cls === "reported")).toBe(true);
    expect(read.independentCount).toBe(0);
    expect(read.read).toBe("3 sources filed.");
    expect(read.substantive).toBe(true);
  });

  it("reads a headline straight off the strongest source title before extraction", () => {
    const read = firstReadForCard({
      card: card({ serves: null, noCitations: true }),
      summary: SUMMARY,
      sources: [
        source({ domain: "exa.ai", sourceType: "company_site", title: "Exa home" }),
        source({ domain: "techcrunch.com", sourceType: "news", title: "Exa raises $7M seed", url: "https://techcrunch.com/exa" })
      ]
    });

    expect(read.readKind).toBe("proof");
    expect(read.readLabel).toBe("Latest proof");
    expect(read.read).toBe("Exa raises $7M seed.");
  });

  it("does not let a news headline earn the green independent class", () => {
    // sourceQualityForSource promotes a news title containing "analysis" to independent_analysis;
    // First Read must keep it as reporting so the independent count stays honest.
    const read = firstReadForCard({
      card: card({ serves: null, noCitations: true }),
      summary: SUMMARY,
      sources: [source({ domain: "techcrunch.com", sourceType: "news", title: "Exa platform analysis", url: "https://techcrunch.com/exa" })]
    });

    expect(read.evidence[0]).toMatchObject({ domain: "techcrunch.com", cls: "reported" });
    expect(read.independentCount).toBe(0);
  });

  it("does not surface a proof headline that does not name the company", () => {
    const read = firstReadForCard({
      card: card({ serves: null, noCitations: true }), // company is Exa
      summary: SUMMARY,
      sources: [source({ domain: "aggregator.com", sourceType: "news", title: "Acme raises $50M Series C", url: "https://aggregator.com/acme" })]
    });

    expect(read.readKind).not.toBe("proof");
    expect(read.read).not.toContain("Acme");
  });

  it("surfaces the freshest dated signal as proof when buyer is not source-backed", () => {
    const read = firstReadForCard({
      card: card({
        citationIds: [],
        signals: [
          { title: "Exa ships agentic search API", url: "https://exa.ai/blog", date: "2026-06-01", source: "exa.ai", category: "launch", citationIds: ["c1"] },
          { title: "Exa raises Series B", url: "https://techcrunch.com/exa", date: "2026-06-18", source: "techcrunch.com", category: "funding", citationIds: ["c1"] }
        ]
      }),
      summary: SUMMARY,
      sources: [source({ domain: "techcrunch.com", sourceType: "news" })]
    });

    expect(read.readKind).toBe("proof");
    expect(read.read).toBe("Exa raises Series B.");
    expect(read.gap).toBe("Who it's for and who pays.");
  });

  it("marks a thin card as non-substantive so the panel can hide it", () => {
    const read = firstReadForCard({
      card: card({
        noCitations: true,
        serves: "Likely positioned as a platform for everyone.",
        concept: "AI-native platform powering agentic workflows",
        oneLiner: "Emerging leader in agentic AI."
      }),
      summary: SUMMARY,
      sources: []
    });

    expect(read.substantive).toBe(false);
    expect(read.read).toBe("Reading the first sources.");
    expect([read.read, read.readLabel, read.gap].join(" ")).not.toMatch(/AI-native|emerging leader|agentic|platform for everyone/i);
    expect([read.read, read.readLabel, read.gap].every((value) => value.trim().length > 0)).toBe(true);
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
});
