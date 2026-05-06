import { describe, expect, it } from "vitest";
import {
  buildStableenrichRequests,
  fetchStableenrichSources,
  missingStableenrichConfig,
  runStableenrichProbe,
} from "../src/index";

describe("missingStableenrichConfig", () => {
  it("reports every missing endpoint needed by the day one spike", () => {
    expect(missingStableenrichConfig({})).toEqual([
      "AGENTCASH_API_KEY",
      "STABLEENRICH_EXA_SEARCH_URL",
      "STABLEENRICH_EXA_SIMILAR_URL",
      "STABLEENRICH_FIRECRAWL_URL",
      "STABLEENRICH_ORG_ENRICH_URL",
      "STABLEENRICH_LINKEDIN_URL",
    ]);
  });
});

describe("buildStableenrichRequests", () => {
  it("builds the five endpoint probes required by SPEC.md", () => {
    const requests = buildStableenrichRequests(
      {
        AGENTCASH_API_KEY: "key",
        STABLEENRICH_EXA_SEARCH_URL: "https://stable.example/exa/search",
        STABLEENRICH_EXA_SIMILAR_URL: "https://stable.example/exa/similar",
        STABLEENRICH_FIRECRAWL_URL: "https://stable.example/firecrawl",
        STABLEENRICH_ORG_ENRICH_URL: "https://stable.example/org",
        STABLEENRICH_LINKEDIN_URL: "https://stable.example/linkedin",
      },
      "cartesia.ai",
    );

    expect(requests.map((request) => request.name)).toEqual([
      "exa_search_news",
      "exa_find_similar",
      "firecrawl_homepage",
      "org_enrichment",
      "linkedin_company",
    ]);
  });
});

describe("runStableenrichProbe", () => {
  it("keeps endpoint identity when an injected fetch fails", async () => {
    const results = await runStableenrichProbe({
      env: stableenrichEnv(),
      domain: "cartesia.ai",
      fetchImpl: async () =>
        new Response("nope", {
          status: 402,
          statusText: "Payment Required",
        }),
    });

    const firstResult = results[0];
    expect(firstResult?.status).toBe("rejected");
    if (firstResult?.status !== "rejected") {
      throw new Error("Expected the first probe to reject");
    }
    expect(firstResult.reason).toMatchObject({
      name: "exa_search_news",
      endpointUrl: "https://stable.example/exa/search",
      error: "AgentCash call failed: 402 Payment Required",
    });
  });
});

describe("fetchStableenrichSources", () => {
  it("maps fulfilled probes into provider sources", async () => {
    const result = await fetchStableenrichSources({
      env: stableenrichEnv(),
      domain: "cartesia.ai",
      fetchImpl: async (input) =>
        Response.json({
          endpointUrl: input,
          text: "source payload",
        }),
    });

    expect(result.failures).toEqual([]);
    expect(result.sources.map((source) => source.sourceType)).toEqual([
      "news",
      "enrichment",
      "company_site",
      "enrichment",
      "enrichment",
    ]);
    expect(result.sources[0]).toMatchObject({
      url: "agentcash:exa_search_news",
      title: "exa_search_news",
      rawText: expect.stringContaining("source payload"),
    });
  });

  it("returns endpoint failures instead of silently dropping rejected probes", async () => {
    const result = await fetchStableenrichSources({
      env: stableenrichEnv(),
      domain: "cartesia.ai",
      fetchImpl: async (input) => {
        if (input === "https://stable.example/firecrawl") {
          return new Response("nope", {
            status: 500,
            statusText: "Internal Server Error",
          });
        }

        return Response.json({ text: "ok" });
      },
    });

    expect(result.sources).toHaveLength(4);
    expect(result.failures).toEqual([
      {
        name: "firecrawl_homepage",
        endpointUrl: "https://stable.example/firecrawl",
        error: "AgentCash call failed: 500 Internal Server Error",
      },
    ]);
  });
});

function stableenrichEnv() {
  return {
    AGENTCASH_API_KEY: "key",
    STABLEENRICH_EXA_SEARCH_URL: "https://stable.example/exa/search",
    STABLEENRICH_EXA_SIMILAR_URL: "https://stable.example/exa/similar",
    STABLEENRICH_FIRECRAWL_URL: "https://stable.example/firecrawl",
    STABLEENRICH_ORG_ENRICH_URL: "https://stable.example/org",
    STABLEENRICH_LINKEDIN_URL: "https://stable.example/linkedin",
  };
}
