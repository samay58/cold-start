import { describe, expect, it } from "vitest";
import {
  buildSkeletonCard,
  type ExtractedCardSections,
  generateCardForDomain,
  type GenerateCardDeps
} from "../src/index";

describe("buildSkeletonCard", () => {
  it("creates a public-safe unknown card before evidence arrives", () => {
    const card = buildSkeletonCard("cartesia.ai");

    expect(card.slug).toBe("cartesia");
    expect(card.identity.name.status).toBe("unknown");
    expect(card.identity.name.value).toBeNull();
    expect(card.synthesis).toBeUndefined();
  });

  it("creates independent citation arrays for unknown facts", () => {
    const card = buildSkeletonCard("cartesia.ai");

    card.identity.name.citationIds.push("mutated");

    expect(card.identity.oneLiner.citationIds).toEqual([]);
    expect(card.funding.totalRaisedUsd.citationIds).toEqual([]);
  });
});

describe("generateCardForDomain", () => {
  it("does not attach synthesis without a verifier", async () => {
    const skeleton = buildSkeletonCard("cartesia.ai");
    const whyItMatters = { text: "Cartesia is building voice AI infrastructure. [c1]", citationIds: ["c1"] };
    const bullCase = { text: "Cartesia has public product evidence. [c1]", citationIds: ["c1"] };
    const bearCase = { text: "Cartesia still needs clearer public traction evidence. [c1]", citationIds: ["c1"] };

    const card = await generateCardForDomain("cartesia.ai", {
      fetchSources: async () => [],
      extractSections: async () => ({
        identity: skeleton.identity,
        funding: skeleton.funding,
        team: skeleton.team,
        signals: [],
        comparables: [],
        citations: [
          {
            id: "c1",
            url: "https://cartesia.ai/",
            title: "Cartesia",
            fetchedAt: "2026-05-06T12:00:00.000Z",
            sourceType: "company_site",
            snippet: "Cartesia is building voice AI infrastructure."
          }
        ]
      }),
      synthesize: async () => ({
        whyItMatters,
        bullCase: [bullCase],
        bearCase: [bearCase],
        openQuestions: ["What customer traction has Cartesia disclosed?"]
      })
    } as unknown as GenerateCardDeps);

    expect(card.synthesis).toBeUndefined();
    expect(card.generationCostUsd).toBe(0);
  });

  it("removes synthesis when verified whyItMatters is unsupported", async () => {
    const skeleton = buildSkeletonCard("cartesia.ai");
    const whyItMatters = { text: "Cartesia is building voice AI infrastructure. [c1]", citationIds: ["c1"] };
    const bullCase = { text: "Cartesia has public product evidence. [c1]", citationIds: ["c1"] };
    const bearCase = { text: "Cartesia still needs clearer public traction evidence. [c1]", citationIds: ["c1"] };

    const card = await generateCardForDomain("cartesia.ai", {
      fetchSources: async () => [],
      extractSections: async () => ({
        identity: skeleton.identity,
        funding: skeleton.funding,
        team: skeleton.team,
        signals: [],
        comparables: [],
        citations: [
          {
            id: "c1",
            url: "https://cartesia.ai/",
            title: "Cartesia",
            fetchedAt: "2026-05-06T12:00:00.000Z",
            sourceType: "company_site",
            snippet: "Cartesia is building voice AI infrastructure."
          }
        ]
      }),
      synthesize: async () => ({
        whyItMatters,
        bullCase: [bullCase],
        bearCase: [bearCase],
        openQuestions: ["What customer traction has Cartesia disclosed?"]
      }),
      verify: async () => [
        { ...whyItMatters, status: "unsupported" },
        { ...bullCase, status: "supported" },
        { ...bearCase, status: "supported" }
      ]
    });

    expect(card.synthesis).toBeUndefined();
  });

  it("ignores unexpected top-level extracted section keys", async () => {
    const skeleton = buildSkeletonCard("cartesia.ai");

    const card = await generateCardForDomain("cartesia.ai", {
      fetchSources: async () => [],
      extractSections: async () =>
        ({
          slug: "overridden",
          generationCostUsd: 99,
          identity: skeleton.identity,
          funding: skeleton.funding,
          team: skeleton.team,
          signals: [],
          comparables: [],
          citations: []
        }) as unknown as ExtractedCardSections,
      costLines: [{ label: "provider", usd: 1.23456 }]
    } as GenerateCardDeps);

    expect(card.slug).toBe("cartesia");
    expect(card.generationCostUsd).toBe(1.2346);
  });
});
