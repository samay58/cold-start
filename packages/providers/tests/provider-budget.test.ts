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
      stopCondition: "stop after one accepted firmographic profile"
    });
  });

  it("returns a stable budget by provider and endpoint", () => {
    expect(providerBudgetForEndpoint("stableenrich", "hunter_email_verifier")).toEqual(
      expect.objectContaining({
        endpoint: "hunter_email_verifier",
        timeoutMs: 15_000,
        expectedFacts: ["team.founders", "team.keyExecs"]
      })
    );
  });
});
