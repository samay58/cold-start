import { describe, expect, it } from "vitest";

import { publicCard, type ColdStartCard } from "@cold-start/core";

import { buildGithubContactFacts } from "../src/github-contact-facts";
import { applyProviderFactCandidates } from "../src/provider-facts";
import { buildSkeletonCard } from "../src/seed-profile";

const fetchedAt = "2026-07-02T00:00:00.000Z";

function person(name: string, extra: Record<string, unknown> = {}) {
  return { name, role: "Co-founder", sourceUrl: "https://acme.ai", ...extra };
}

describe("buildGithubContactFacts", () => {
  it("attaches an observed email by name match and infers the rest from the pattern", () => {
    const candidates = buildGithubContactFacts({
      domain: "acme.ai",
      founders: [person("Noah Tye"), person("Ada Lovelace")],
      keyExecs: [],
      observed: [{ email: "noah.tye@acme.ai", fullName: "Noah Tye", sourceUrl: "https://github.com/acme/x/commit/1" }],
      pattern: "first.last",
      orgUrl: "https://github.com/acme",
      fetchedAt
    });

    const noah = candidates.find((c) => (c.value as { name: string }[])[0]?.name === "Noah Tye");
    const ada = candidates.find((c) => (c.value as { name: string }[])[0]?.name === "Ada Lovelace");

    expect(noah).toBeDefined();
    expect((noah!.value as { email: string; emailStatus: string }[])[0]).toMatchObject({
      email: "noah.tye@acme.ai",
      emailStatus: "observed"
    });
    expect(noah!.provider).toBe("github");
    expect(noah!.sourceType).toBe("github");

    expect(ada).toBeDefined();
    expect((ada!.value as { email: string; emailStatus: string }[])[0]).toMatchObject({
      email: "ada.lovelace@acme.ai",
      emailStatus: "inferred"
    });
    expect(ada!.status).toBe("inferred");
  });

  it("infers nothing when there is no pattern", () => {
    const candidates = buildGithubContactFacts({
      domain: "acme.ai",
      founders: [person("Ada Lovelace")],
      keyExecs: [],
      observed: [],
      pattern: null,
      orgUrl: "https://github.com/acme",
      fetchedAt
    });
    expect(candidates).toHaveLength(0);
  });

  it("produces inferred emails that the public card strips", () => {
    const skeleton = buildSkeletonCard("acme.ai");
    const base = {
      identity: { ...skeleton.identity, name: { value: "Acme", status: "verified" as const, confidence: "high" as const, citationIds: ["c1"] } },
      funding: skeleton.funding,
      team: {
        ...skeleton.team,
        founders: {
          value: [{ name: "Ada Lovelace", role: "CEO", sourceUrl: "https://acme.ai" }],
          status: "verified" as const,
          confidence: "high" as const,
          citationIds: ["c1"]
        }
      },
      signals: skeleton.signals,
      comparables: skeleton.comparables,
      citations: [{ id: "c1", url: "https://acme.ai", title: "Acme", fetchedAt, sourceType: "company_site" as const }]
    };

    const candidates = buildGithubContactFacts({
      domain: "acme.ai",
      founders: base.team.founders.value,
      keyExecs: [],
      observed: [],
      pattern: "first.last",
      orgUrl: "https://github.com/acme",
      fetchedAt
    });
    const merged = applyProviderFactCandidates(base, candidates);
    const founder = merged.sections.team.founders.value?.[0];
    expect(founder?.email).toBe("ada.lovelace@acme.ai");
    expect(founder?.emailStatus).toBe("inferred");

    const full = { ...merged.sections, slug: "acme", domain: "acme.ai", generatedAt: fetchedAt, cacheStatus: "miss", synthesis: null } as unknown as ColdStartCard;
    const publicFounder = publicCard(full).team.founders.value?.[0];
    expect(publicFounder).not.toHaveProperty("email");
    expect(publicFounder).not.toHaveProperty("emailStatus");
  });
});
