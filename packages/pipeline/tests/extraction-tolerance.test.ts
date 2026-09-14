import { describe, expect, it } from "vitest";
import { coldStartCardSchema } from "@cold-start/core";
import { parseBlockEnrichmentToolUse } from "@cold-start/llm";
import { buildSkeletonCard, enrichExtractedSectionsForDomain } from "../src/index";

describe("enrichment after optional field normalization", () => {
  it("keeps the known amount when a higher-confidence same-round patch omits it", async () => {
    const card = buildSkeletonCard("example.com");
    const citation = { id: "saved", url: "https://example.com/funding", title: "Funding", fetchedAt: "2026-09-14T00:00:00.000Z", sourceType: "company_site" as const };
    const value = { name: "Series A", amountUsd: 25000000, announcedAt: "2026-01-01", leadInvestors: [] };
    card.citations = [citation];
    card.funding.lastRound = { value, status: "verified", confidence: "medium", citationIds: ["saved"] };
    card.funding.rounds = { ...card.funding.lastRound, value: [value] };
    const patch = parseBlockEnrichmentToolUse({ content: [{ type: "tool_use", name: "emit_block_claims", input: {
      blockId: "funding",
      funding: {
        lastRound: { value: { ...value, amountUsd: "undisclosed" }, status: "verified", confidence: "high", citationIds: ["new"] },
        rounds: { value: [{ ...value, amountUsd: "undisclosed" }], status: "verified", confidence: "high", citationIds: ["new"] },
      },
      citations: [{ ...citation, id: "new", url: "https://example.com/funding-update" }],
    } }] });
    const result = await enrichExtractedSectionsForDomain({
      domain: card.domain, sections: card,
      sources: [{ ...citation, intent: "funding", rawText: "Series A financing." }],
      enrichSections: async ({ block }) => block === "funding" ? {
        funding: { lastRound: patch.funding!.lastRound!, rounds: patch.funding!.rounds! }, citations: patch.citations,
      } : null,
    });
    expect(result.sections.funding.lastRound.value?.amountUsd).toBe(25000000);
    expect(result.sections.funding.rounds?.value?.[0]?.amountUsd).toBe(25000000);
    expect(result.sections.funding.lastRound.confidence).toBe("medium");
    expect(() => coldStartCardSchema.parse({ ...card, ...result.sections })).not.toThrow();
  });

  it("retains saved funding when a malformed total accompanies a useful new round", async () => {
    const card = buildSkeletonCard("example.com");
    const citation = {
      id: "saved", url: "https://example.com/funding", title: "Funding",
      fetchedAt: "2026-09-14T00:00:00.000Z", sourceType: "company_site" as const,
    };
    card.citations = [citation];
    card.funding.totalRaisedUsd = { value: 25000000, status: "verified", confidence: "high", citationIds: ["saved"] };
    const patch = parseBlockEnrichmentToolUse({ content: [{
      type: "tool_use", name: "emit_block_claims", input: {
        blockId: "funding",
        funding: {
          totalRaisedUsd: { value: "undisclosed", status: "verified", confidence: "high", citationIds: ["new"] },
          lastRound: { value: { name: "Series A", amountUsd: "USD 4 million" }, status: "verified", confidence: "high", citationIds: ["new"] },
        },
        citations: [{ ...citation, id: "new", url: "https://example.com/series-a" }],
      },
    }] });

    const result = await enrichExtractedSectionsForDomain({
      domain: card.domain,
      sections: card,
      sources: [{ ...citation, intent: "funding", rawText: "The company announced a $4 million Series A." }],
      enrichSections: async ({ block }) => block === "funding" ? {
        funding: { totalRaisedUsd: patch.funding!.totalRaisedUsd!, lastRound: patch.funding!.lastRound! },
        citations: patch.citations,
      } : null,
    });
    expect(result.sections.funding.totalRaisedUsd).toEqual(card.funding.totalRaisedUsd);
    expect(result.sections.funding.lastRound.value?.amountUsd).toBe(4000000);
    expect(result.sections.funding.lastRound.value?.name).toBe("Series A");
    const stored = coldStartCardSchema.parse({ ...card, ...result.sections });
    expect(stored.citations.some((item) => stored.funding.lastRound.citationIds.includes(item.id))).toBe(true);
  });
});
