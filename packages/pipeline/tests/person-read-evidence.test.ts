import { describe, expect, it } from "vitest";

import type { PersonReadResult } from "@cold-start/llm";
import type { ProviderFactCandidate } from "@cold-start/providers";

import { attachPersonReads, buildPersonReadEvidence } from "../src/person-read-evidence";
import { buildSkeletonCard } from "../src/seed-profile";
import type { SectionsWithFacts } from "../src/provider-facts";

const fetchedAt = "2026-07-05T00:00:00.000Z";

function person(overrides: Partial<{ name: string; role: string | null; sourceUrl: string | null }> = {}) {
  return {
    name: overrides.name ?? "Karan Goel",
    role: overrides.role ?? "Co-founder",
    sourceUrl: overrides.sourceUrl ?? null
  };
}

function candidate(overrides: Partial<ProviderFactCandidate> = {}): ProviderFactCandidate {
  return {
    path: "team.founders",
    value: [],
    status: "verified",
    confidence: "high",
    sourceType: "news",
    provider: "direct_exa",
    endpoint: "direct_exa_contacts",
    citationUrl: "https://techcrunch.com/karan",
    citationTitle: "TechCrunch",
    fetchedAt,
    rawText: "Karan Goel previously founded a robotics company acquired by Deere.",
    ...overrides
  };
}

describe("buildPersonReadEvidence", () => {
  it("only includes texts mentioning the person's name", () => {
    const karan = person({ name: "Karan Goel" });
    const evidence = buildPersonReadEvidence({
      people: [karan],
      citations: [
        { id: "c1", title: "TechCrunch", url: "https://techcrunch.com/karan", snippet: "Karan Goel raised a seed round." },
        { id: "c2", title: "Other coverage", url: "https://example.com/other", snippet: "An unrelated person joined the board." }
      ],
      candidates: [],
      sources: []
    });

    expect(evidence).toHaveLength(1);
    expect(evidence[0]?.evidence).toEqual([
      { citationId: "c1", title: "TechCrunch", url: "https://techcrunch.com/karan", text: "Karan Goel raised a seed round." }
    ]);
  });

  it("only produces evidence entries whose citationId exists in the supplied citations", () => {
    const karan = person({ name: "Karan Goel" });
    const evidence = buildPersonReadEvidence({
      people: [karan],
      citations: [{ id: "c1", title: "TechCrunch", url: "https://techcrunch.com/karan" }],
      candidates: [
        candidate({ citationUrl: "https://techcrunch.com/karan", citationTitle: "TechCrunch" }),
        candidate({
          citationUrl: "https://unmatched.example/karan",
          citationTitle: "Unmatched",
          rawText: "Karan Goel also appears here, but this source never became a citation."
        })
      ],
      sources: []
    });

    const [result] = evidence;
    expect(result?.evidence).toHaveLength(1);
    expect(result?.evidence[0]?.citationId).toBe("c1");
    for (const item of result?.evidence ?? []) {
      expect(["c1"]).toContain(item.citationId);
    }
  });

  it("pulls evidence from stored source rawText mentioning the person's name, case-insensitively", () => {
    const karan = person({ name: "Karan Goel" });
    const evidence = buildPersonReadEvidence({
      people: [karan],
      citations: [{ id: "c1", title: "Site", url: "https://example.com/team" }],
      candidates: [],
      sources: [
        { url: "https://example.com/team", title: "Team page", rawText: "KARAN GOEL led the founding team from day one." },
        { url: "https://example.com/other", title: "Unrelated", rawText: "Someone else entirely." }
      ]
    });

    expect(evidence[0]?.evidence).toHaveLength(1);
    expect(evidence[0]?.evidence[0]).toEqual({
      citationId: "c1",
      title: "Team page",
      url: "https://example.com/team",
      text: "KARAN GOEL led the founding team from day one."
    });
  });

  it("carries channels and role through untouched, and returns empty evidence for a person with no mentions", () => {
    const evidence = buildPersonReadEvidence({
      people: [
        {
          name: "Priya Shah",
          role: "CTO",
          sourceUrl: null,
          githubUrl: "https://github.com/priyashah",
          xUrl: null,
          personalUrl: null
        }
      ],
      citations: [{ id: "c1", title: "Site", url: "https://example.com", snippet: "No mention of anyone here." }],
      candidates: [],
      sources: []
    });

    expect(evidence).toEqual([
      {
        name: "Priya Shah",
        role: "CTO",
        channels: { githubUrl: "https://github.com/priyashah", xUrl: null, personalUrl: null },
        evidence: []
      }
    ]);
  });
});

describe("attachPersonReads", () => {
  function sectionsWithFounders(): SectionsWithFacts {
    const skeleton = buildSkeletonCard("example.com");
    return {
      identity: skeleton.identity,
      funding: skeleton.funding,
      team: {
        ...skeleton.team,
        founders: {
          value: [
            { name: "Karan Goel", role: "Co-founder", sourceUrl: null },
            { name: "Priya Shah", role: "Co-founder", sourceUrl: null }
          ],
          status: "verified",
          confidence: "high",
          citationIds: ["c1"]
        }
      },
      signals: skeleton.signals,
      comparables: skeleton.comparables,
      citations: [{ id: "c1", url: "https://example.com", title: "Example", fetchedAt, sourceType: "company_site" as const }]
    };
  }

  it("writes read onto the matching person and leaves others untouched", () => {
    const sections = sectionsWithFounders();
    const reads: PersonReadResult[] = [
      {
        name: "Karan Goel",
        read: { text: "Second robotics company; the first sold to Deere in 2021.", citationIds: ["c1"] },
        suppressionReason: null
      }
    ];

    const next = attachPersonReads(sections, reads);
    const founders = next.team.founders.value ?? [];
    const karan = founders.find((founder) => founder.name === "Karan Goel");
    const priya = founders.find((founder) => founder.name === "Priya Shah");

    expect(karan?.read).toEqual({ text: "Second robotics company; the first sold to Deere in 2021.", citationIds: ["c1"] });
    expect(priya?.read).toBeUndefined();
  });

  it("matches by trimmed lowercase name", () => {
    const sections = sectionsWithFounders();
    const reads: PersonReadResult[] = [
      { name: "  karan goel  ", read: { text: "Non-obvious founder history.", citationIds: ["c1"] }, suppressionReason: null }
    ];

    const next = attachPersonReads(sections, reads);
    const karan = (next.team.founders.value ?? []).find((founder) => founder.name === "Karan Goel");
    expect(karan?.read).toEqual({ text: "Non-obvious founder history.", citationIds: ["c1"] });
  });

  it("writes an explicit null read rather than leaving the field absent", () => {
    const sections = sectionsWithFounders();
    const reads: PersonReadResult[] = [{ name: "Karan Goel", read: null, suppressionReason: "thin_evidence" }];

    const next = attachPersonReads(sections, reads);
    const karan = (next.team.founders.value ?? []).find((founder) => founder.name === "Karan Goel");
    expect("read" in (karan ?? {})).toBe(true);
    expect(karan?.read).toBeNull();
  });
});
