import { describe, expect, it } from "vitest";
import { buildSkeletonCard, generateCardForDomain } from "../src/index";

describe("buildSkeletonCard", () => {
  it("creates a public-safe unknown card before evidence arrives", () => {
    const card = buildSkeletonCard("cartesia.ai");

    expect(card.slug).toBe("cartesia");
    expect(card.identity.name.status).toBe("unknown");
    expect(card.identity.name.value).toBeNull();
    expect(card.synthesis).toBeUndefined();
  });
});

describe("generateCardForDomain", () => {
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
});
