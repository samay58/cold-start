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

    // The independent source ranks first; company-controlled sources follow.
    expect(read.evidence.map((item) => item.domain)).toEqual(["techcrunch.com", "docs.exa.ai", "exa.ai"]);
    expect(read.evidence[0]).toMatchObject({ domain: "techcrunch.com", cls: "independent", label: "independent" });
    expect(read.evidence[1]).toMatchObject({ domain: "docs.exa.ai", cls: "company", label: "docs" });
    expect(read.sourceCount).toBe(3);
    expect(read.independentCount).toBe(1);
    expect(read.gap).toBe("Named customers and budget owner.");
    expect(read.status).toBe("ready");
  });

  it("never restates the company summary as the read", () => {
    // serves is identical to the summary shown above the slip; it must be demoted.
    const read = firstReadForCard({
      card: card({ serves: SUMMARY }),
      summary: SUMMARY,
      sources: [
        source({ domain: "exa.ai", sourceType: "company_site" }),
        source({ domain: "techcrunch.com", sourceType: "news" })
      ]
    });

    expect(read.read).not.toBe(SUMMARY);
    expect(read.readKind).toBe("evidence");
    expect(read.read).toBe("2 sources filed, 1 independent.");
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
    expect(read.readLabel).toBe("Latest proof");
    expect(read.read).toBe("Exa raises Series B.");
    expect(read.gap).toBe("Who it's for and who pays.");
  });

  it("stays honest and free of filler when nothing useful has landed", () => {
    const read = firstReadForCard({
      card: card({
        citationIds: [],
        serves: "Likely positioned as a platform for everyone.",
        concept: "AI-native platform powering agentic workflows",
        oneLiner: "Emerging leader in agentic AI."
      }),
      summary: SUMMARY,
      sources: []
    });

    expect(read.evidence).toHaveLength(0);
    expect(read.read).toBe("Reading the first sources.");
    expect(read.gap).toBe("Who it's for and who pays.");
    expect([read.read, read.readLabel, read.gap].join(" ")).not.toMatch(/AI-native|emerging leader|agentic|platform for everyone/i);
    expect([read.read, read.readLabel, read.gap].every((value) => value.trim().length > 0)).toBe(true);
  });

  it("emits no empty evidence rows and dedupes a domain to its strongest mark", () => {
    const read = firstReadForCard({
      card: card(),
      summary: SUMMARY,
      sources: [
        source({ domain: "exa.ai", sourceType: "company_site" }),
        source({ domain: "exa.ai", sourceType: "news", id: "news-exa", title: "Exa press" })
      ]
    });

    expect(read.sourceCount).toBe(1);
    expect(read.evidence).toHaveLength(1);
    expect(read.evidence[0]).toMatchObject({ domain: "exa.ai", cls: "independent" });
    expect(read.evidence.every((item) => item.domain.length > 0 && item.label.length > 0 && item.href.length > 0)).toBe(true);
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
