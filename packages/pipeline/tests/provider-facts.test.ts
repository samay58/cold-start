import { describe, expect, it } from "vitest";

import type { ProviderFactCandidate } from "@cold-start/providers";

import { applyProviderFactCandidates } from "../src/provider-facts";
import { buildSkeletonCard } from "../src/seed-profile";

const fetchedAt = "2026-05-27T20:00:00.000Z";

function providerFact(input: {
  path: ProviderFactCandidate["path"];
  value: unknown;
  endpoint: string;
}): ProviderFactCandidate {
  return {
    path: input.path,
    value: input.value,
    status: "verified",
    confidence: "high",
    sourceType: "enrichment",
    provider: "stableenrich",
    endpoint: input.endpoint,
    citationUrl: `https://stable.example/${input.endpoint}`,
    citationTitle: input.endpoint,
    fetchedAt,
    rawText: "{}"
  };
}

describe("applyProviderFactCandidates", () => {
  it("tracks applied provider facts by endpoint", () => {
    const skeleton = buildSkeletonCard("cartesia.ai");
    const sections = {
      identity: {
        ...skeleton.identity,
        name: {
          value: "Cartesia",
          status: "verified" as const,
          confidence: "high" as const,
          citationIds: ["c1"]
        }
      },
      funding: skeleton.funding,
      team: skeleton.team,
      signals: skeleton.signals,
      comparables: skeleton.comparables,
      citations: [
        {
          id: "c1",
          url: "https://cartesia.ai",
          title: "Cartesia",
          fetchedAt,
          sourceType: "company_site" as const
        }
      ]
    };

    const result = applyProviderFactCandidates(sections, [
      providerFact({ path: "identity.name", value: "Ignored", endpoint: "org_enrichment" }),
      providerFact({ path: "identity.websiteUrl", value: "https://cartesia.ai", endpoint: "apollo_org_search" })
    ]);

    expect(result.trace.candidateCount).toBe(2);
    expect(result.trace.appliedCount).toBe(1);
    expect(result.trace.appliedByEndpoint).toEqual({ apollo_org_search: 1 });
  });
});
