import { describe, expect, it } from "vitest";

import { providerBudgetForEndpoint, providerBudgetRegistry } from "../src/provider-budget";

describe("providerBudgetRegistry", () => {
  it("declares timeout, cost, facts, mode, and stop condition for paid provider endpoints", () => {
    expect(providerBudgetRegistry.stableenrich.org_enrichment).toMatchObject({
      endpoint: "org_enrichment",
      mode: "enrichment",
      expectedFacts: ["identity.name", "identity.websiteUrl", "identity.linkedinUrl", "identity.logoUrl", "identity.hq", "identity.foundedYear", "identity.description"],
      timeoutMs: 30_000,
      estimatedCostUsd: 0.02,
      maxCallsPerRun: 1,
      stopCondition: "stop after one accepted firmographic profile"
    });
  });

  it("returns a stable budget by provider and endpoint", () => {
    expect(providerBudgetForEndpoint("stableenrich", "hunter_email_verifier")).toEqual(
      expect.objectContaining({
        endpoint: "hunter_email_verifier",
        timeoutMs: 15_000,
        estimatedCostUsd: 0.01,
        maxCallsPerRun: 6,
        expectedFacts: ["team.founders", "team.keyExecs"]
      })
    );
  });

  it("keeps slow no-fact fanout probes on bounded but plausible timeouts", () => {
    for (const endpoint of [
      "exa_funding_history",
      "exa_company_profile",
      "exa_management_team",
      "exa_competition",
      "exa_find_similar",
      "exa_email_search",
      "exa_leader_discovery",
    ] as const) {
      expect(providerBudgetForEndpoint("stableenrich", endpoint)).toMatchObject({
        timeoutMs: 18_000,
        estimatedCostUsd: 0.01,
        maxCallsPerRun: 1
      });
    }

    expect(providerBudgetForEndpoint("stableenrich", "firecrawl_team")).toMatchObject({
      timeoutMs: 15_000,
      estimatedCostUsd: 0.01,
      maxCallsPerRun: 1
    });
  });
});

describe("providerBudgetRegistry.founderVoice", () => {
  it("prices the paid xai_x_search lane at the fixed per-call estimate", () => {
    expect(providerBudgetRegistry.founderVoice.xai_x_search).toMatchObject({
      endpoint: "xai_x_search",
      estimatedCostUsd: 0.05,
      maxCallsPerRun: 1
    });
  });

  it("prices the paid exa_founder_web lane at two Direct Exa searches", () => {
    expect(providerBudgetRegistry.founderVoice.exa_founder_web).toMatchObject({
      endpoint: "exa_founder_web",
      estimatedCostUsd: 0.014,
      maxCallsPerRun: 1
    });
  });

  it("declares a positive timeout for every founderVoice lane", () => {
    for (const laneName of Object.keys(providerBudgetRegistry.founderVoice) as Array<keyof typeof providerBudgetRegistry.founderVoice>) {
      expect(providerBudgetRegistry.founderVoice[laneName].timeoutMs).toBeGreaterThan(0);
    }
  });

  it("keeps the free lanes (hn, github, bluesky) at zero estimated cost", () => {
    for (const laneName of ["hn_search", "github_author_activity", "bluesky_author_feed"] as const) {
      expect(providerBudgetRegistry.founderVoice[laneName].estimatedCostUsd).toBe(0);
    }
  });
});
