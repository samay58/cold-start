import { describe, expect, it } from "vitest";
import { buildStableenrichRequests, missingStableenrichConfig, runStableenrichProbe } from "../src/index";

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
