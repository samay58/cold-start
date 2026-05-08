import { describe, expect, it } from "vitest";
import {
  buildDirectExaFundamentalsRequests,
  fetchDirectExaFundamentalsSources,
  missingDirectExaConfig,
} from "../src/index";

describe("missingDirectExaConfig", () => {
  it("requires only DIRECT_EXA_API_KEY for the direct Exa basics lane", () => {
    expect(missingDirectExaConfig({})).toEqual(["DIRECT_EXA_API_KEY"]);
    expect(missingDirectExaConfig({ DIRECT_EXA_API_KEY: "exa-key" })).toEqual([]);
  });
});

describe("buildDirectExaFundamentalsRequests", () => {
  it("builds fast company, people, funding, and news searches for basics generation", () => {
    const requests = buildDirectExaFundamentalsRequests({ DIRECT_EXA_API_KEY: "exa-key" }, "cartesia.ai");

    expect(requests.map((request) => request.name)).toEqual([
      "exa_direct_company",
      "exa_direct_people",
      "exa_direct_funding",
      "exa_direct_news",
    ]);
    expect(requests.every((request) => request.url === "https://api.exa.ai/search")).toBe(true);
    expect(requests.every((request) => request.headers.Authorization === "Bearer exa-key")).toBe(true);
    expect(requests[0]?.body).toMatchObject({
      type: "instant",
      category: "company",
      query: expect.stringContaining("cartesia.ai"),
      numResults: 5,
    });
    expect(requests[1]?.body).toMatchObject({
      type: "instant",
      category: "people",
      query: expect.stringContaining("founders CEO management team"),
      numResults: 6,
    });
    expect(requests[2]?.body).toMatchObject({
      type: "fast",
      category: "news",
      query: expect.stringContaining("funding rounds investors total raised"),
      numResults: 8,
    });
    expect(requests[3]?.body).toMatchObject({
      type: "fast",
      category: "news",
      query: expect.stringContaining("recent launch hiring customers"),
      numResults: 6,
    });
  });
});

describe("fetchDirectExaFundamentalsSources", () => {
  it("skips cleanly when DIRECT_EXA_API_KEY is missing", async () => {
    const result = await fetchDirectExaFundamentalsSources({
      env: {},
      domain: "cartesia.ai",
      fetchJson: async () => {
        throw new Error("should not fetch without a key");
      },
    });

    expect(result).toEqual({ sources: [], failures: [], skipped: true });
  });

  it("maps Exa results into URL-backed sources with basics retrieval intents", async () => {
    const result = await fetchDirectExaFundamentalsSources({
      env: { DIRECT_EXA_API_KEY: "exa-key" },
      domain: "cartesia.ai",
      fetchJson: async ({ body }) => ({
        results: [
          {
            url: body.category === "company" ? "https://www.cartesia.ai/about" : `https://example.com/${body.category}`,
            title: `${body.category} result`,
            text: "Cartesia raised funding and lists its management team.",
            publishedDate: "2026-05-07",
            highlights: ["management team", "funding"],
          },
        ],
      }),
    });

    expect(result.skipped).toBe(false);
    expect(result.failures).toEqual([]);
    expect(result.sources.map((source) => source.intent)).toEqual([
      "company_profile",
      "management_team",
      "funding",
      "recent_signals",
    ]);
    expect(result.sources[0]).toMatchObject({
      url: "https://www.cartesia.ai/about",
      sourceType: "company_site",
      rawText: expect.stringContaining("management team"),
    });
  });
});
