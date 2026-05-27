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
      maxStageCallsUsd: 0.02,
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
        maxStageCallsUsd: 0.06,
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
        maxCallsPerRun: 1,
        maxStageCallsUsd: 0.01
      });
    }

    expect(providerBudgetForEndpoint("stableenrich", "firecrawl_team")).toMatchObject({
      timeoutMs: 15_000,
      estimatedCostUsd: 0.01,
      maxCallsPerRun: 1,
      maxStageCallsUsd: 0.01
    });
  });
});
