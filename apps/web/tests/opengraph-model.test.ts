import { describe, expect, it } from "vitest";
import { buildOpenGraphModel, type OpenGraphPublicCard } from "../src/app/c/[slug]/opengraph-model";

const baseCard: OpenGraphPublicCard = {
  slug: "cartesia",
  domain: "cartesia.ai",
  generatedAt: "2026-05-19T12:00:00.000Z",
  generationCostUsd: 0.12,
  cacheStatus: "hit",
  identity: {
    name: { value: "Cartesia", status: "verified", confidence: "high", citationIds: ["c1"] },
    logoUrl: null,
    oneLiner: { value: "Real-time voice AI platform", status: "verified", confidence: "high", citationIds: ["c1"] },
    description: {
      value: {
        shortDescription: "Real-time voice AI infrastructure for developers building low-latency audio products.",
        concept: "Low-latency speech models exposed as developer infrastructure.",
        serves: "Developers building voice agents and audio applications.",
        mechanism: "APIs and models for real-time speech generation and understanding."
      },
      status: "verified",
      confidence: "high",
      citationIds: ["c1"]
    },
    hq: { value: { city: "San Francisco", country: "US" }, status: "verified", confidence: "high", citationIds: ["c1"] },
    foundedYear: { value: 2023, status: "verified", confidence: "high", citationIds: ["c1"] },
    status: "private"
  },
  funding: {
    totalRaisedUsd: { value: 91000000, status: "verified", confidence: "high", citationIds: ["c2"] },
    lastRound: {
      value: {
        name: "Series B",
        amountUsd: 63000000,
        announcedAt: "2026-04-23",
        leadInvestors: ["NEA", "IVP"]
      },
      status: "verified",
      confidence: "high",
      citationIds: ["c2"]
    },
    rounds: { value: [], status: "unknown", confidence: "low", citationIds: [] },
    investors: { value: [], status: "unknown", confidence: "low", citationIds: [] }
  },
  team: {
    founders: { value: [], status: "unknown", confidence: "low", citationIds: [] },
    keyExecs: { value: [], status: "unknown", confidence: "low", citationIds: [] },
    headcount: { value: null, status: "unknown", confidence: "low", citationIds: [] }
  },
  signals: [],
  comparables: [],
  citations: [
    { id: "c1", url: "https://cartesia.ai", title: "Cartesia", fetchedAt: "2026-05-19T12:00:00.000Z", sourceType: "company_site" },
    { id: "c2", url: "https://example.com/cartesia", title: "Cartesia funding", fetchedAt: "2026-05-19T12:00:00.000Z", sourceType: "news" }
  ]
};

function card(overrides: Partial<OpenGraphPublicCard> = {}): OpenGraphPublicCard {
  return {
    ...baseCard,
    ...overrides,
    identity: {
      ...baseCard.identity,
      ...overrides.identity
    },
    funding: {
      ...baseCard.funding,
      ...overrides.funding
    }
  };
}

describe("buildOpenGraphModel", () => {
  it("builds a readable fallback for missing cards", () => {
    const model = buildOpenGraphModel(null, "hanover-park");

    expect(model.name).toBe("Hanover Park");
    expect(model.description).toBe("Sourced company context card.");
    expect(model.domainLabel).toBe("public company card");
    expect(model.facts).toEqual([
      { label: "Sources", value: "0" },
      { label: "Status", value: "Private" }
    ]);
  });

  it("keeps sparse cards useful without showing empty funding facts", () => {
    const model = buildOpenGraphModel(
      card({
        citations: [],
        funding: {
          ...baseCard.funding,
          totalRaisedUsd: { value: null, status: "unknown", confidence: "low", citationIds: [] },
          lastRound: { value: null, status: "unknown", confidence: "low", citationIds: [] }
        }
      }),
      "cartesia"
    );

    expect(model.facts).toEqual([
      { label: "HQ", value: "San Francisco, US" },
      { label: "Sources", value: "0" },
      { label: "Status", value: "Private" }
    ]);
    expect(model.sourceSummary).toBe("0 cited sources, via Cold Start.");
  });

  it("formats funding and source facts for compact social display", () => {
    const model = buildOpenGraphModel(baseCard, "cartesia");

    expect(model.facts).toEqual([
      { label: "Raised", value: "$91M" },
      { label: "Round", value: "Series B" },
      { label: "HQ", value: "San Francisco, US" },
      { label: "Sources", value: "2" }
    ]);
    expect(model.sourceSummary).toBe("2 cited sources, via Cold Start.");
  });

  it("uses smaller title sizing for long company names", () => {
    const shortModel = buildOpenGraphModel(baseCard, "cartesia");
    const longModel = buildOpenGraphModel(
      card({
        identity: {
          ...baseCard.identity,
          name: { value: "The Extremely Long Institutional Infrastructure Company", status: "verified", confidence: "high", citationIds: ["c1"] }
        }
      }),
      "long-company"
    );

    expect(longModel.titleFontSize).toBeLessThan(shortModel.titleFontSize);
  });

  it("trims long sourced thesis lines", () => {
    const model = buildOpenGraphModel(
      card({
        identity: {
          ...baseCard.identity,
          description: {
            value: {
              shortDescription:
                "A deliberately long company description that should be compressed before it reaches the social card, because a clipped social image reads unfinished and the title needs more visual oxygen.",
              concept: "A compact concept.",
              serves: "A precise audience.",
              mechanism: "A direct mechanism."
            },
            status: "verified",
            confidence: "high",
            citationIds: ["c1"]
          }
        }
      }),
      "cartesia"
    );

    expect(model.description.length).toBeLessThanOrEqual(154);
    expect(model.description.endsWith("...")).toBe(true);
  });
});
