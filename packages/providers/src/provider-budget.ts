import type { ProviderFactPath, StableenrichProbeName } from "./types";

export type ProviderBudgetMode = "search" | "scrape" | "enrichment" | "email";

export type ProviderEndpointBudget = {
  endpoint: StableenrichProbeName;
  mode: ProviderBudgetMode;
  expectedFacts: ProviderFactPath[];
  timeoutMs: number;
  estimatedCostUsd: number;
  maxCallsPerRun: number;
  stopCondition: string;
};

export type ProviderBudgetRegistry = {
  stableenrich: Record<StableenrichProbeName, ProviderEndpointBudget>;
};

const exaSearchFanoutTimeoutMs = 18_000;
const firecrawlSecondaryPageTimeoutMs = 15_000;

// StableEnrich endpoint costs are operator budget estimates for AgentCash-backed probes,
// not provider invoices. They are used for per-run ceilings and trace explainability.
// Reconcile against AgentCash wallet deltas before using them for pricing decisions.
// See docs/product/research/provider-cost-assumptions.md for the assumption trail.
export const providerBudgetRegistry = {
  stableenrich: {
    exa_funding_history: {
      endpoint: "exa_funding_history",
      mode: "search",
      expectedFacts: ["funding.totalRaisedUsd", "funding.lastRound"],
      timeoutMs: exaSearchFanoutTimeoutMs,
      estimatedCostUsd: 0.01,
      maxCallsPerRun: 1,
      stopCondition: "stop after cited funding total or latest round evidence"
    },
    exa_company_profile: {
      endpoint: "exa_company_profile",
      mode: "search",
      expectedFacts: ["identity.name", "identity.description", "identity.websiteUrl"],
      timeoutMs: exaSearchFanoutTimeoutMs,
      estimatedCostUsd: 0.01,
      maxCallsPerRun: 1,
      stopCondition: "stop after one accepted company profile source"
    },
    exa_management_team: {
      endpoint: "exa_management_team",
      mode: "search",
      expectedFacts: ["team.founders", "team.keyExecs"],
      timeoutMs: exaSearchFanoutTimeoutMs,
      estimatedCostUsd: 0.01,
      maxCallsPerRun: 1,
      stopCondition: "stop after cited founders or executives are found"
    },
    exa_recent_signals: {
      endpoint: "exa_recent_signals",
      mode: "search",
      expectedFacts: ["signals"],
      timeoutMs: 30_000,
      estimatedCostUsd: 0.01,
      maxCallsPerRun: 1,
      stopCondition: "stop after recent accepted signal sources"
    },
    exa_competition: {
      endpoint: "exa_competition",
      mode: "search",
      expectedFacts: ["comparables"],
      timeoutMs: exaSearchFanoutTimeoutMs,
      estimatedCostUsd: 0.01,
      maxCallsPerRun: 1,
      stopCondition: "stop after comparable candidates with a clear basis"
    },
    exa_independent_analysis: {
      endpoint: "exa_independent_analysis",
      mode: "search",
      expectedFacts: ["identity.description", "signals"],
      timeoutMs: 30_000,
      estimatedCostUsd: 0.01,
      maxCallsPerRun: 1,
      stopCondition: "stop after independent analysis source coverage"
    },
    exa_customer_proof: {
      endpoint: "exa_customer_proof",
      mode: "search",
      // Judgment evidence for the Lens and sections. Expected structured-fact yield is
      // deliberately thin; the payoff is cited customer proof, not card fields.
      expectedFacts: ["signals"],
      timeoutMs: exaSearchFanoutTimeoutMs,
      estimatedCostUsd: 0.01,
      maxCallsPerRun: 1,
      stopCondition: "stop after accepted named-customer or deployment evidence"
    },
    exa_product_proof: {
      endpoint: "exa_product_proof",
      mode: "search",
      expectedFacts: ["identity.description"],
      timeoutMs: exaSearchFanoutTimeoutMs,
      estimatedCostUsd: 0.01,
      maxCallsPerRun: 1,
      stopCondition: "stop after accepted docs, repository, or benchmark evidence"
    },
    exa_find_similar: {
      endpoint: "exa_find_similar",
      mode: "search",
      expectedFacts: ["comparables"],
      timeoutMs: exaSearchFanoutTimeoutMs,
      estimatedCostUsd: 0.01,
      maxCallsPerRun: 1,
      stopCondition: "stop after semantically similar company candidates"
    },
    firecrawl_homepage: {
      endpoint: "firecrawl_homepage",
      mode: "scrape",
      expectedFacts: ["identity.name", "identity.description", "identity.websiteUrl"],
      timeoutMs: 20_000,
      estimatedCostUsd: 0.01,
      maxCallsPerRun: 1,
      stopCondition: "stop after one accepted homepage scrape"
    },
    firecrawl_about: {
      endpoint: "firecrawl_about",
      mode: "scrape",
      expectedFacts: ["identity.description", "team.founders", "team.keyExecs"],
      timeoutMs: 20_000,
      estimatedCostUsd: 0.01,
      maxCallsPerRun: 1,
      stopCondition: "stop after about page text or confirmed 404"
    },
    firecrawl_team: {
      endpoint: "firecrawl_team",
      mode: "scrape",
      expectedFacts: ["team.founders", "team.keyExecs"],
      timeoutMs: firecrawlSecondaryPageTimeoutMs,
      estimatedCostUsd: 0.01,
      maxCallsPerRun: 1,
      stopCondition: "stop after team page text or confirmed 404"
    },
    apollo_org_search: {
      endpoint: "apollo_org_search",
      mode: "enrichment",
      expectedFacts: ["identity.name", "identity.websiteUrl", "identity.linkedinUrl"],
      timeoutMs: 30_000,
      estimatedCostUsd: 0.02,
      maxCallsPerRun: 1,
      stopCondition: "stop after one accepted organization match"
    },
    org_enrichment: {
      endpoint: "org_enrichment",
      mode: "enrichment",
      expectedFacts: ["identity.name", "identity.websiteUrl", "identity.linkedinUrl", "identity.logoUrl", "identity.hq", "identity.foundedYear", "identity.description"],
      timeoutMs: 30_000,
      estimatedCostUsd: 0.02,
      maxCallsPerRun: 1,
      stopCondition: "stop after one accepted firmographic profile"
    },
    apollo_people_search: {
      endpoint: "apollo_people_search",
      mode: "email",
      expectedFacts: ["team.founders", "team.keyExecs"],
      timeoutMs: 30_000,
      estimatedCostUsd: 0.02,
      maxCallsPerRun: 1,
      stopCondition: "stop after likely work emails for known people"
    },
    apollo_people_enrich: {
      endpoint: "apollo_people_enrich",
      mode: "email",
      expectedFacts: ["team.founders", "team.keyExecs"],
      timeoutMs: 30_000,
      estimatedCostUsd: 0.02,
      maxCallsPerRun: 3,
      stopCondition: "stop after enriching requested people"
    },
    clado_contacts_enrich: {
      endpoint: "clado_contacts_enrich",
      mode: "email",
      expectedFacts: ["team.founders", "team.keyExecs"],
      timeoutMs: 30_000,
      estimatedCostUsd: 0.02,
      maxCallsPerRun: 2,
      stopCondition: "stop after alternate contact enrichment returns"
    },
    minerva_enrich: {
      endpoint: "minerva_enrich",
      mode: "email",
      expectedFacts: ["team.founders", "team.keyExecs"],
      timeoutMs: 30_000,
      estimatedCostUsd: 0.02,
      maxCallsPerRun: 2,
      stopCondition: "stop after alternate email enrichment returns"
    },
    hunter_email_verifier: {
      endpoint: "hunter_email_verifier",
      mode: "email",
      expectedFacts: ["team.founders", "team.keyExecs"],
      timeoutMs: 15_000,
      estimatedCostUsd: 0.01,
      maxCallsPerRun: 6,
      stopCondition: "stop after validating one candidate work email"
    },
    exa_email_search: {
      endpoint: "exa_email_search",
      mode: "email",
      expectedFacts: ["team.founders", "team.keyExecs"],
      timeoutMs: exaSearchFanoutTimeoutMs,
      estimatedCostUsd: 0.01,
      maxCallsPerRun: 1,
      stopCondition: "stop after public email evidence or no relevant results"
    },
    exa_leader_discovery: {
      endpoint: "exa_leader_discovery",
      mode: "search",
      expectedFacts: ["team.founders", "team.keyExecs"],
      timeoutMs: exaSearchFanoutTimeoutMs,
      estimatedCostUsd: 0.01,
      maxCallsPerRun: 1,
      stopCondition: "stop after leader discovery sources are accepted"
    }
  }
} satisfies ProviderBudgetRegistry;

export function providerBudgetForEndpoint(provider: "stableenrich", endpoint: StableenrichProbeName): ProviderEndpointBudget {
  return providerBudgetRegistry[provider][endpoint];
}
