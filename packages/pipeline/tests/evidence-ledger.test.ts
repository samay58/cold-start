import { describe, expect, it } from "vitest";
import { buildEvidenceLedger } from "../src/index";

describe("buildEvidenceLedger", () => {
  it("deduplicates sources and preserves intents", () => {
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
    expect(ledger[0]?.snippet).toContain("Series B");
  });

  it("takes the supporting snippet from the page's lead, not its funding sentence", () => {
    const [entry] = buildEvidenceLedger({
      domain: "perplexity.ai",
      sources: [
        {
          url: "https://news.example/perplexity",
          title: "Perplexity profile",
          sourceType: "news",
          fetchedAt: "2026-05-07T00:00:00.000Z",
          intent: "company_profile",
          rawText: JSON.stringify({ id: "x", text: "Perplexity is a conversational answer engine. It raised $63 million in a Series B led by IVP." }),
        },
      ],
    });

    expect(entry?.snippet).toBe("Perplexity is a conversational answer engine. It raised $63 million in a Series B led by IVP.");
  });

  it("carries a source's publish date, never its fetch time", () => {
    const source = { sourceType: "news" as const, fetchedAt: "2026-05-07T00:00:00.000Z", title: "T", rawText: "Text." };
    const ledger = buildEvidenceLedger({
      domain: "perplexity.ai",
      sources: [
        { ...source, url: "https://news.example/dated", publishedAt: "2026-04-01T00:00:00.000Z" },
        { ...source, url: "https://news.example/undated" },
      ],
    });

    expect(ledger.map((entry) => entry.publishedAt ?? null)).toEqual(["2026-04-01T00:00:00.000Z", null]);
  });

  it("gives funding sources no ranking bonus over equal sources", () => {
    const source = { sourceType: "news" as const, fetchedAt: "2026-05-07T00:00:00.000Z" };
    const ledger = buildEvidenceLedger({
      domain: "perplexity.ai",
      sources: [
        { ...source, url: "https://news.example/product", title: "Product", intent: "company_profile" as const, rawText: "Perplexity answers questions." },
        { ...source, url: "https://news.example/round", title: "Round", intent: "funding" as const, rawText: "Perplexity raised a round." },
      ],
    });

    expect(ledger.map((entry) => entry.url)).toEqual(["https://news.example/product", "https://news.example/round"]);
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

  it("does not let the company homepage outrank independent profile evidence", () => {
    const ledger = buildEvidenceLedger({
      domain: "hanoverpark.com",
      sources: [
        {
          url: "https://hanoverpark.com",
          title: "Hanover Park",
          sourceType: "company_site",
          fetchedAt: "2026-05-19T00:00:00.000Z",
          intent: "company_profile",
          rawText: "Hanover Park offers comprehensive fund administration tools and support.",
        },
        {
          url: "https://www.finextra.com/pressarticle/hanover-park-profile",
          title: "Hanover Park raises Series A",
          sourceType: "news",
          fetchedAt: "2026-05-19T00:00:00.000Z",
          intent: "company_profile",
          rawText: "Hanover Park sells fund administration software to private equity and venture capital firms.",
        },
      ],
    });

    expect(ledger[0]?.url).toBe("https://www.finextra.com/pressarticle/hanover-park-profile");
    expect(ledger[1]?.url).toBe("https://hanoverpark.com");
  });

  it("does not let investor-authored analysis tie stronger independent judgment through intent bonuses", () => {
    const ledger = buildEvidenceLedger({
      domain: "notion.so",
      sources: [
        {
          url: "https://firstmark.com/story/notion-market-map",
          title: "Notion market map",
          sourceType: "news",
          fetchedAt: "2026-05-19T00:00:00.000Z",
          intent: "independent_analysis",
          rawText: "An investor-authored market map mentions Notion and the broader productivity market.",
        },
        {
          url: "https://sacrainsights.com/company/notion",
          title: "Notion revenue analysis",
          sourceType: "news",
          fetchedAt: "2026-05-19T00:00:00.000Z",
          intent: "company_profile",
          rawText: "Sacra analyzes Notion revenue, customers, product strategy, and market position.",
        },
      ],
    });

    expect(ledger[0]?.url).toBe("https://sacrainsights.com/company/notion");
    expect(ledger[1]?.url).toBe("https://firstmark.com/story/notion-market-map");
  });

  it("ranks independent reporting ahead of target-domain news pages and LinkedIn profiles", () => {
    const ledger = buildEvidenceLedger({
      domain: "notablehealth.com",
      sources: [
        {
          url: "https://www.notablehealth.com/blog/inova-health-ai-agents",
          title: "Inova Health taps Notable to utilize intelligent AI agents",
          sourceType: "news",
          fetchedAt: "2026-06-23T00:00:00.000Z",
          intent: "recent_signals",
          rawText: "Notable says Inova Health will use its AI agents for administrative workflows.",
        },
        {
          url: "https://www.linkedin.com/company/notable-health",
          title: "Notable LinkedIn",
          sourceType: "news",
          fetchedAt: "2026-06-23T00:00:00.000Z",
          intent: "management_team",
          rawText: "Notable is a healthcare automation company on LinkedIn.",
        },
        {
          url: "https://techcrunch.com/2021/11/03/notable-which-makes-rpa-based-tools-to-speed-up-healthcare-admin-raises-100m-at-a-600m-valuation/",
          title: "Notable raises $100M to speed up healthcare admin",
          sourceType: "news",
          fetchedAt: "2026-06-23T00:00:00.000Z",
          intent: "funding",
          rawText: "Notable raised $100 million for healthcare automation tools.",
        },
      ],
    });

    expect(ledger.map((entry) => entry.url)).toEqual([
      "https://techcrunch.com/2021/11/03/notable-which-makes-rpa-based-tools-to-speed-up-healthcare-admin-raises-100m-at-a-600m-valuation/",
      "https://www.notablehealth.com/blog/inova-health-ai-agents",
      "https://www.linkedin.com/company/notable-health",
    ]);
  });
});
