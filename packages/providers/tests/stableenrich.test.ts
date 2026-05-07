import { describe, expect, it } from "vitest";
import {
  buildStableenrichRequests,
  fetchStableenrichSources,
  missingStableenrichConfig,
  runStableenrichProbe,
} from "../src/index";

describe("missingStableenrichConfig", () => {
  it("does not require AgentCash API keys or endpoint env when using Stableenrich defaults", () => {
    expect(missingStableenrichConfig({})).toEqual([]);
  });
});

describe("buildStableenrichRequests", () => {
  it("builds the live Stableenrich endpoint probes", () => {
    const requests = buildStableenrichRequests({}, "cartesia.ai");

    expect(requests.map((request) => request.name)).toEqual([
      "exa_funding_history",
      "exa_company_profile",
      "exa_independent_analysis",
      "exa_find_similar",
      "firecrawl_homepage",
      "org_enrichment",
    ]);
    expect(requests.map((request) => request.url)).toEqual([
      "https://stableenrich.dev/api/exa/search",
      "https://stableenrich.dev/api/exa/search",
      "https://stableenrich.dev/api/exa/search",
      "https://stableenrich.dev/api/exa/find-similar",
      "https://stableenrich.dev/api/firecrawl/scrape",
      "https://stableenrich.dev/api/apollo/org-enrich",
    ]);
    expect(requests[0]?.body).toMatchObject({
      query: expect.stringContaining("funding"),
      numResults: 8,
    });
    expect(requests[1]?.body).toMatchObject({
      query: expect.stringContaining("what does"),
      numResults: 6,
    });
    expect(requests[4]?.body).toEqual({ url: "https://cartesia.ai" });
  });

  it("uses research-plan search queries when present", () => {
    const requests = buildStableenrichRequests({}, "harvey.ai", {
      searchQueries: {
        funding: "harvey latest round valuation Sequoia",
        companyProfile: "harvey legal AI workflow buyer",
        independentAnalysis: "harvey Sacra ARR analysis",
      },
    });

    expect(requests[0]?.body).toMatchObject({ query: "harvey latest round valuation Sequoia" });
    expect(requests[1]?.body).toMatchObject({ query: "harvey legal AI workflow buyer" });
    expect(requests[2]?.body).toMatchObject({ query: "harvey Sacra ARR analysis" });
  });
});

describe("runStableenrichProbe", () => {
  it("runs Stableenrich probes concurrently so cold starts are bounded by the slowest provider", async () => {
    let activeCalls = 0;
    let maxActiveCalls = 0;

    await runStableenrichProbe({
      env: stableenrichEnv(),
      domain: "cartesia.ai",
      agentcashFetch: async () => {
        activeCalls += 1;
        maxActiveCalls = Math.max(maxActiveCalls, activeCalls);
        await new Promise((resolve) => setTimeout(resolve, 1));
        activeCalls -= 1;
        return { text: "ok" };
      },
    });

    expect(maxActiveCalls).toBe(6);
  });

  it("keeps endpoint identity when an injected AgentCash fetch fails", async () => {
    const results = await runStableenrichProbe({
      env: stableenrichEnv(),
      domain: "cartesia.ai",
      agentcashFetch: async () => {
        throw new Error("payment failed");
      },
    });

    const firstResult = results[0];
    expect(firstResult?.status).toBe("rejected");
    if (firstResult?.status !== "rejected") {
      throw new Error("Expected the first probe to reject");
    }
    expect(firstResult.reason).toMatchObject({
      name: "exa_funding_history",
      endpointUrl: "https://stable.example/exa/search",
      error: "payment failed",
    });
  });
});

describe("fetchStableenrichSources", () => {
  it("maps fulfilled probes into provider sources", async () => {
    const result = await fetchStableenrichSources({
      env: stableenrichEnv(),
      domain: "cartesia.ai",
      agentcashFetch: async ({ url }) => ({
        endpointUrl: url,
        text: "source payload",
      }),
    });

    expect(result.failures).toEqual([]);
    expect(result.sources.map((source) => source.sourceType)).toEqual([
      "news",
      "news",
      "news",
      "enrichment",
      "company_site",
      "enrichment",
    ]);
    expect(result.sources[0]).toMatchObject({
      url: "agentcash:exa_funding_history",
      title: "exa_funding_history",
      rawText: expect.stringContaining("source payload"),
    });
  });

  it("expands Exa search results into URL-backed source records with retrieval intent", async () => {
    const result = await fetchStableenrichSources({
      env: stableenrichEnv(),
      domain: "perplexity.ai",
      agentcashFetch: async ({ url }) => {
        if (url === "https://stable.example/exa/search") {
          return {
            results: [
              {
                url: "https://www.perplexity.ai/hub/blog/series-b",
                title: "Perplexity Series B",
                text: "Perplexity raised a $63 million Series B led by IVP.",
                publishedDate: "2024-04-23",
              },
            ],
          };
        }

        return { text: "ok" };
      },
    });

    expect(result.sources).toContainEqual(
      expect.objectContaining({
        url: "https://www.perplexity.ai/hub/blog/series-b",
        title: "Perplexity Series B",
        sourceType: "news",
        intent: "funding",
        rawText: expect.stringContaining("Series B"),
      }),
    );
  });

  it("returns endpoint failures instead of silently dropping rejected probes", async () => {
    const result = await fetchStableenrichSources({
      env: stableenrichEnv(),
      domain: "cartesia.ai",
      agentcashFetch: async ({ url }) => {
        if (url === "https://stable.example/firecrawl") {
          throw new Error("upstream failed");
        }

        return { text: "ok" };
      },
    });

    expect(result.sources).toHaveLength(5);
    expect(result.failures).toEqual([
      {
        name: "firecrawl_homepage",
        endpointUrl: "https://stable.example/firecrawl",
        error: "upstream failed",
      },
    ]);
  });
});

function stableenrichEnv() {
  return {
    STABLEENRICH_EXA_SEARCH_URL: "https://stable.example/exa/search",
    STABLEENRICH_EXA_SIMILAR_URL: "https://stable.example/exa/similar",
    STABLEENRICH_FIRECRAWL_URL: "https://stable.example/firecrawl",
    STABLEENRICH_ORG_ENRICH_URL: "https://stable.example/org",
  };
}
