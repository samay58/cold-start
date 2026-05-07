import { describe, expect, it } from "vitest";
import { buildEvidenceLedger } from "../src/index";

describe("buildEvidenceLedger", () => {
  it("deduplicates sources, preserves intents, and surfaces funding support snippets", () => {
    const ledger = buildEvidenceLedger({
      domain: "perplexity.ai",
      sources: [
        {
          url: "https://www.perplexity.ai/hub/blog/series-b",
          title: "Perplexity Series B",
          sourceType: "news",
          fetchedAt: "2026-05-07T00:00:00.000Z",
          intent: "funding",
          rawText: "Perplexity raised $63 million in a Series B led by IVP on April 23, 2024.",
        },
        {
          url: "https://www.perplexity.ai/hub/blog/series-b",
          title: "Perplexity Series B",
          sourceType: "news",
          fetchedAt: "2026-05-07T00:00:00.000Z",
          intent: "company_profile",
          rawText: "Perplexity is a conversational answer engine.",
        },
      ],
    });

    expect(ledger).toHaveLength(1);
    expect(ledger[0]).toMatchObject({
      id: "e1",
      url: "https://www.perplexity.ai/hub/blog/series-b",
      intents: ["funding", "company_profile"],
      sourceType: "news",
      authorityScore: expect.any(Number),
    });
    expect(ledger[0]?.supportingSnippets.join(" ")).toContain("Series B");
  });

  it("ranks independent technical analysis ahead of press releases for qualitative evidence", () => {
    const ledger = buildEvidenceLedger({
      domain: "twelvelabs.io",
      sources: [
        {
          url: "https://www.businesswire.com/news/home/20250605/twelvelabs-series-b",
          title: "TwelveLabs Announces Series B Funding",
          sourceType: "news",
          fetchedAt: "2026-05-07T00:00:00.000Z",
          intent: "funding",
          rawText: "TwelveLabs announced a Series B financing round.",
        },
        {
          url: "https://example.substack.com/p/twelvelabs-technical-deep-dive",
          title: "TwelveLabs technical deep dive",
          sourceType: "news",
          fetchedAt: "2026-05-07T00:00:00.000Z",
          intent: "company_profile",
          rawText: "A technical deep dive on how TwelveLabs handles multimodal video understanding.",
        },
      ],
    });

    expect(ledger[0]?.url).toBe("https://example.substack.com/p/twelvelabs-technical-deep-dive");
    expect(ledger[1]?.url).toBe("https://www.businesswire.com/news/home/20250605/twelvelabs-series-b");
  });
});
