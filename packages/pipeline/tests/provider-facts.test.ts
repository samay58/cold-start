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

  it("carries person channels + email provenance and lets observed beat inferred", () => {
    const skeleton = buildSkeletonCard("cartesia.ai");
    const base = {
      identity: {
        ...skeleton.identity,
        name: { value: "Cartesia", status: "verified" as const, confidence: "high" as const, citationIds: ["c1"] }
      },
      funding: skeleton.funding,
      team: skeleton.team,
      signals: skeleton.signals,
      comparables: skeleton.comparables,
      citations: [
        { id: "c1", url: "https://cartesia.ai", title: "Cartesia", fetchedAt, sourceType: "company_site" as const }
      ]
    };

    const result = applyProviderFactCandidates(base, [
      providerFact({
        path: "team.founders",
        value: [
          {
            name: "Karan Goel",
            role: "Co-founder",
            sourceUrl: "https://github.com/karan/x/commit/1",
            email: "karan@cartesia.ai",
            emailStatus: "inferred",
            emailBasis: "domain pattern first, 2 observed addresses",
            githubUrl: "https://github.com/karan"
          }
        ],
        endpoint: "github_contacts"
      }),
      providerFact({
        path: "team.founders",
        value: [
          { name: "Karan Goel", role: null, sourceUrl: null, email: "karan@cartesia.ai", emailStatus: "observed" }
        ],
        endpoint: "github_contacts"
      })
    ]);

    const founder = result.sections.team.founders.value?.find((person) => person.name === "Karan Goel");
    expect(founder?.email).toBe("karan@cartesia.ai");
    expect(founder?.emailStatus).toBe("observed");
    expect(founder?.emailBasis).toBeNull();
    expect(founder?.githubUrl).toBe("https://github.com/karan");
  });

  it("prefers a non-null person read over null when merging candidates", () => {
    const skeleton = buildSkeletonCard("cartesia.ai");
    const base = {
      identity: {
        ...skeleton.identity,
        name: { value: "Cartesia", status: "verified" as const, confidence: "high" as const, citationIds: ["c1"] }
      },
      funding: skeleton.funding,
      team: skeleton.team,
      signals: skeleton.signals,
      comparables: skeleton.comparables,
      citations: [
        { id: "c1", url: "https://cartesia.ai", title: "Cartesia", fetchedAt, sourceType: "company_site" as const }
      ]
    };

    const result = applyProviderFactCandidates(base, [
      providerFact({
        path: "team.founders",
        value: [{ name: "Karan Goel", role: "Co-founder", sourceUrl: null, read: null }],
        endpoint: "github_contacts"
      }),
      providerFact({
        path: "team.founders",
        value: [
          {
            name: "Karan Goel",
            role: null,
            sourceUrl: null,
            read: { text: "Second robotics company; the first sold to Deere in 2021.", citationIds: ["s1"] }
          }
        ],
        endpoint: "apollo_person_enrich"
      })
    ]);

    const founder = result.sections.team.founders.value?.find((person) => person.name === "Karan Goel");
    expect(founder?.read).toEqual({
      text: "Second robotics company; the first sold to Deere in 2021.",
      citationIds: ["s1"]
    });
  });

  it("keeps the left person's read when both candidates already carry one", () => {
    const skeleton = buildSkeletonCard("cartesia.ai");
    const base = {
      identity: {
        ...skeleton.identity,
        name: { value: "Cartesia", status: "verified" as const, confidence: "high" as const, citationIds: ["c1"] }
      },
      funding: skeleton.funding,
      team: skeleton.team,
      signals: skeleton.signals,
      comparables: skeleton.comparables,
      citations: [
        { id: "c1", url: "https://cartesia.ai", title: "Cartesia", fetchedAt, sourceType: "company_site" as const }
      ]
    };

    const result = applyProviderFactCandidates(base, [
      providerFact({
        path: "team.founders",
        value: [
          {
            name: "Karan Goel",
            role: "Co-founder",
            sourceUrl: null,
            read: { text: "First read wins.", citationIds: ["s1"] }
          }
        ],
        endpoint: "github_contacts"
      }),
      providerFact({
        path: "team.founders",
        value: [
          {
            name: "Karan Goel",
            role: null,
            sourceUrl: null,
            read: { text: "Second read should not win.", citationIds: ["s2"] }
          }
        ],
        endpoint: "apollo_person_enrich"
      })
    ]);

    const founder = result.sections.team.founders.value?.find((person) => person.name === "Karan Goel");
    expect(founder?.read).toEqual({ text: "First read wins.", citationIds: ["s1"] });
  });

  it("skips weak or incomplete provider descriptions without adding citations", () => {
    const skeleton = buildSkeletonCard("cartesia.ai");
    const result = applyProviderFactCandidates(
      {
        identity: skeleton.identity,
        funding: skeleton.funding,
        team: skeleton.team,
        signals: skeleton.signals,
        comparables: skeleton.comparables,
        citations: skeleton.citations
      },
      [
        providerFact({
          path: "identity.description",
          endpoint: "org_enrichment",
          value: {
            shortDescription: "AI platform",
            expandedDescription: "A product suite for",
            concept: null,
            serves: null,
            mechanism: null
          }
        }),
        providerFact({
          path: "identity.description",
          endpoint: "apollo_org_search",
          value: {
            shortDescription: "Cartesia builds voice infrastructure for developers shipping real-time audio products over",
            expandedDescription: "Cartesia helps developers ship real-time voice products.",
            concept: null,
            serves: null,
            mechanism: null
          }
        })
      ]
    );

    expect(result.sections.identity.description).toBeUndefined();
    expect(result.sections.identity.oneLiner.value).toBeNull();
    expect(result.sections.citations).toHaveLength(0);
    expect(result.trace.appliedCount).toBe(0);
    expect(result.trace.appliedByEndpoint).toEqual({});
  });
});
