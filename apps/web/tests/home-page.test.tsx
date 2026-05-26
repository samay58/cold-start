import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getPublicProfileIndex: vi.fn()
}));

vi.mock("../src/lib/cards", () => ({
  getPublicProfileIndex: mocks.getPublicProfileIndex
}));

const { default: HomePage } = await import("../src/app/page");

function fact<T>(value: T | null, citationIds = value === null ? [] : ["c1"]) {
  return {
    value,
    status: value === null ? "unknown" as const : "verified" as const,
    confidence: value === null ? "low" as const : "high" as const,
    citationIds
  };
}

function summary(slug: string, name: string, generatedAt: string) {
  const domain = `${slug}.ai`;
  return {
    slug,
    domain,
    name,
    generatedAt,
    sourceCount: slug === "cartesia" ? 3 : 2,
    totalRaisedUsd: slug === "cartesia" ? 91_000_000 : null,
    lastRoundName: slug === "cartesia" ? "Series B" : null,
    headcount: slug === "cartesia" ? 42 : null,
    card: {
      slug,
      domain,
      generatedAt,
      cacheStatus: "hit",
      generationCostUsd: 0.12,
      identity: {
        name: fact(name),
        websiteUrl: fact(`https://${slug}.ai`),
        logoUrl: null,
        oneLiner: fact(`${name} builds sourced company context infrastructure.`),
        description: {
          value: {
            shortDescription: `${name} builds sourced company context for investors.`,
            concept: "Source-grounded company profile generation.",
            serves: "Investors screening generated company profiles.",
            mechanism: "Public facts are separated from gated synthesis."
          },
          status: "verified" as const,
          confidence: "high" as const,
          citationIds: ["c1"]
        },
        hq: fact({ city: "San Francisco", country: "US" }),
        foundedYear: fact(2024),
        status: "private" as const
      },
      funding: {
        totalRaisedUsd: fact(slug === "cartesia" ? 91_000_000 : null, slug === "cartesia" ? ["c2"] : []),
        lastRound: {
          value: slug === "cartesia" ? { name: "Series B", amountUsd: 63_000_000, announcedAt: "2025-04-23", leadInvestors: ["NEA"] } : null,
          status: slug === "cartesia" ? "verified" as const : "unknown" as const,
          confidence: slug === "cartesia" ? "high" as const : "low" as const,
          citationIds: slug === "cartesia" ? ["c2"] : []
        },
        investors: fact([])
      },
      team: {
        founders: fact([]),
        keyExecs: fact([]),
        headcount: fact(slug === "cartesia" ? { value: 42, asOf: "2026-05-06" } : null, slug === "cartesia" ? ["c3"] : [])
      },
      signals: [
        {
          title: `${name} launches a product`,
          url: "https://example.com/signal",
          date: "2026-05-01",
          source: "Example",
          category: "launch",
          citationIds: ["c2"]
        }
      ],
      comparables: [],
      citations: [
        { id: "c1", url: "https://example.com/one", title: `${name} site`, fetchedAt: generatedAt, sourceType: "company_site" as const },
        { id: "c2", url: "https://example.com/two", title: `${name} funding`, fetchedAt: generatedAt, sourceType: "news" as const }
      ]
    },
    sections: [
      {
        slug,
        domain,
        sectionId: "buyer",
        visibility: "public",
        status: "available",
        content: {
          status: "available",
          summary: "Investors screening generated company profiles.",
          items: [{ label: "Buyer", text: "Investors screening generated company profiles.", citationIds: ["c1"] }],
          questions: [],
          confidence: "high"
        },
        citationIds: ["c1"],
        sourceIds: ["c1"],
        runId: null,
        error: null,
        generatedAt,
        staleAt: null
      },
      {
        slug,
        domain,
        sectionId: "traction",
        visibility: "public",
        status: "empty",
        content: { status: "empty", summary: null, items: [], questions: [], confidence: "low" },
        citationIds: [],
        sourceIds: [],
        runId: null,
        error: null,
        generatedAt,
        staleAt: null
      }
    ]
  };
}

async function renderHome(company?: string) {
  const element = await HomePage({ searchParams: Promise.resolve(company ? { company } : {}) });
  return renderToStaticMarkup(element);
}

describe("HomePage", () => {
  beforeEach(() => {
    mocks.getPublicProfileIndex.mockReset();
  });

  it("renders the profile index and selected company preview", async () => {
    mocks.getPublicProfileIndex.mockResolvedValue([
      summary("elevenlabs", "ElevenLabs", "2026-05-07T12:00:00.000Z"),
      summary("cartesia", "Cartesia", "2026-05-06T12:00:00.000Z")
    ]);

    const html = await renderHome("cartesia");

    expect(html).toContain('href="/?company=cartesia"');
    expect(html).toContain('aria-current="page"');
    expect(html).toContain('aria-label="Cartesia preview"');
    expect(html).toContain('href="/c/cartesia"');
    expect(html).toContain("Buyer &amp; Use Case");
    expect(html).toContain("3 sources");
    expect(html).toContain("Investors screening generated company profiles.");
    expect(html).not.toContain("cold-start-samay58s-projects.vercel.app");
  });

  it("falls back to the newest profile when the query is invalid", async () => {
    mocks.getPublicProfileIndex.mockResolvedValue([
      summary("elevenlabs", "ElevenLabs", "2026-05-07T12:00:00.000Z"),
      summary("cartesia", "Cartesia", "2026-05-06T12:00:00.000Z")
    ]);

    const html = await renderHome("missing");

    expect(html).toContain('aria-label="ElevenLabs preview"');
    expect(html).toContain('href="/c/elevenlabs"');
  });

  it("renders an honest empty state when no profiles clear the source gate", async () => {
    mocks.getPublicProfileIndex.mockResolvedValue([]);

    const html = await renderHome();

    expect(html).toContain("No sourced profiles yet");
    expect(html).toContain("Generate a company from the extension");
  });
});
