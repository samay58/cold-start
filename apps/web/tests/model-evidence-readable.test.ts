import { describe, expect, it } from "vitest";
import { coldStartCardSchema, emphasisSourceDigests, type ColdStartCard } from "@cold-start/core";
import { evidenceForExtractionPrompt, howItWinsEvidencePacketFromCard } from "@cold-start/llm";
import {
  applyProviderFactCandidates,
  buildEvidenceLedger,
  buildExpandedDescriptionEvidence,
  buildPersonReadEvidence,
  buildSkeletonCard,
  verifyCardSynthesisDraft
} from "@cold-start/pipeline";
import type { ProviderFactCandidate } from "@cold-start/providers";
import { evidenceForSection } from "../src/inngest/research-section-generation";
import { providerSourcesFromStoredSources, sectionsWithSourceCitations } from "../src/inngest/source-fetching";

// The invariant behind the September 2026 evidence remediation: no text a model reads as
// evidence is serialized provider JSON. Stored rows stay JSON, so this feeds every stage the
// shapes production holds (Exa records with and without page text, a people-database record,
// Firecrawl markdown, and a card stored with an old JSON snippet) through the real builders.

const fetchedAt = "2026-09-01T00:00:00.000Z";
const exaRecord = (fields: Record<string, unknown>) => JSON.stringify({ id: fields.url, publishedDate: null, author: null, ...fields });

const storedSources = [
  {
    url: "https://notion.com/product",
    title: "Notion product",
    sourceType: "company_site",
    fetchedAt,
    rawText: exaRecord({ url: "https://notion.com/product", title: "Notion product", text: `# Notion\n\nIvan Zhao built Notion so teams can write, plan and share work in one connected workspace. ${"Teams use pages, databases and automations together. ".repeat(20)}` }),
    imageUrl: null
  },
  {
    url: "https://news.example/notion-round",
    title: "Notion raises a round",
    sourceType: "news",
    fetchedAt,
    rawText: exaRecord({ url: "https://news.example/notion-round", title: "Notion raises a round" }),
    imageUrl: null
  },
  {
    url: "https://people.example/ivan-zhao",
    title: "Ivan Zhao profile",
    sourceType: "other",
    fetchedAt,
    rawText: JSON.stringify({ person: { name: "Ivan Zhao", title: "CEO", organization: { name: "Notion" } } }),
    imageUrl: null
  },
  {
    url: "https://blog.example/notion-review",
    title: "A review of Notion",
    sourceType: "news",
    fetchedAt,
    rawText: "[home](https://blog.example/)\n\n# A review of Notion\n\nNotion, led by Ivan Zhao, replaced three tools for our team.",
    imageUrl: null
  }
];

const providerFact: ProviderFactCandidate = {
  path: "identity.foundedYear",
  value: 2013,
  status: "verified",
  confidence: "medium",
  sourceType: "enrichment",
  provider: "stableenrich",
  endpoint: "org_enrichment",
  citationUrl: "https://enrich.example/notion",
  citationTitle: "Notion organization record",
  fetchedAt,
  rawText: JSON.stringify({ organization: { name: "Notion", founded_year: 2013, short_description: "Notion workspace" } })
};

function buildCard(): ColdStartCard {
  const sources = providerSourcesFromStoredSources(storedSources);
  const skeleton = buildSkeletonCard("notion.so");
  const person = { name: "Ivan Zhao", role: "CEO", sourceUrl: null };
  const withSources = sectionsWithSourceCitations(
    {
      ...skeleton,
      team: { ...skeleton.team, founders: { value: [person], status: "verified", confidence: "high", citationIds: ["e1"] } },
      // A card stored before this change: its snippet is a cut-off slice of provider JSON.
      citations: [
        {
          id: "e1",
          url: "https://old.example/notion",
          title: "Old coverage of Notion",
          fetchedAt,
          sourceType: "news",
          snippet: exaRecord({ url: "https://old.example/notion", title: "Old coverage", text: "Ivan Zhao said Notion grew." }).slice(0, 120)
        }
      ]
    },
    sources
  );
  const { sections } = applyProviderFactCandidates(withSources, [providerFact]);
  return coldStartCardSchema.parse({ ...skeleton, ...sections, team: withSources.team });
}

function expectNoJson(label: string, values: string[]) {
  expect(values.length, `${label} has evidence`).toBeGreaterThan(0);
  for (const value of values) {
    expect(value.trim().startsWith("{"), `${label}: ${value.slice(0, 80)}`).toBe(false);
    expect(value.includes('":"'), `${label}: ${value.slice(0, 80)}`).toBe(false);
  }
}

describe("model evidence is readable text, never provider JSON", () => {
  const card = buildCard();
  const sources = providerSourcesFromStoredSources(storedSources);

  it("citation snippets", () => {
    expectNoJson("snippets", card.citations.flatMap((citation) => (citation.snippet ? [citation.snippet] : [])));
    const product = card.citations.find((citation) => citation.url === "https://notion.com/product");
    expect(product?.snippet).toContain("one connected workspace");
  });

  it("the How it wins judge packet", () => {
    expectNoJson("judge", howItWinsEvidencePacketFromCard(card).evidence.map((item) => item.text));
  });

  it("the verifier's sources", async () => {
    const seen: string[] = [];
    const claim = { text: "Notion is a connected workspace.", citationIds: [card.citations[0]!.id] };
    await verifyCardSynthesisDraft(
      card,
      { synthesis: { whyItMatters: claim, bullCase: [], bearCase: [], openQuestions: [] } as never, claimCountBeforeVerify: 1 },
      {
        verify: async (_claims, verifySources) => {
          seen.push(...verifySources.flatMap((source) => (source.snippet ? [source.snippet] : [])));
          return [];
        }
      }
    );
    expectNoJson("verifier", seen);
  });

  it("the emphasis read's digests", () => {
    expectNoJson("emphasis", emphasisSourceDigests(card).map((digest) => digest.leadsWith).filter(Boolean));
  });

  it("person-read evidence", () => {
    const [person] = buildPersonReadEvidence({
      people: card.team.founders.value ?? [],
      citations: card.citations,
      candidates: [providerFact],
      sources
    });
    expectNoJson("person reads", person!.evidence.map((item) => item.text));
  });

  it("research-section evidence", () => {
    expectNoJson("research sections", evidenceForSection(card, storedSources.map((source, index) => ({ ...source, id: `src-${index}` }))).map((item) => item.text));
  });

  it("expanded-description evidence", () => {
    expectNoJson("expanded description", buildExpandedDescriptionEvidence({ card, sources }).map((item) => item.text));
  });

  it("the extraction prompt", () => {
    const evidence = evidenceForExtractionPrompt({
      domain: "notion.so",
      sources,
      evidenceLedger: buildEvidenceLedger({ domain: "notion.so", sources })
    });
    expectNoJson("extraction sources", evidence.sources.map((source) => source.rawText));
    expectNoJson("extraction ledger", (evidence.evidenceLedger ?? []).flatMap((entry) => entry.supportingSnippets));
  });
});
