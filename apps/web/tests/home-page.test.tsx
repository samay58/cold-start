import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getPublicProfileIndex: vi.fn()
}));

vi.mock("../src/lib/cards", () => ({
  getPublicProfileIndex: mocks.getPublicProfileIndex
}));

vi.mock("next/cache", () => ({
  unstable_cache: <T extends (...args: never[]) => unknown>(fn: T) => fn
}));

vi.mock("next/server", () => ({
  connection: vi.fn(async () => undefined)
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
    sourceCount: slug === "browserbase" ? 21 : 8,
    totalRaisedUsd: slug === "browserbase" ? 67_500_000 : 191_000_000,
    lastRoundName: slug === "browserbase" ? "Series B" : "Venture Round",
    headcount: slug === "browserbase" ? 50 : 75,
    card: {
      slug,
      domain,
      generatedAt,
      cacheStatus: "hit",
      generationCostUsd: 0.12,
      identity: {
        name: fact(name),
        websiteUrl: fact(`https://${domain}`),
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
        totalRaisedUsd: fact(slug === "browserbase" ? 67_500_000 : 191_000_000, ["c2"]),
        lastRound: {
          value: slug === "browserbase"
            ? { name: "Series B", amountUsd: 40_000_000, announcedAt: "2025-06-17", leadInvestors: ["Notable Capital"] }
            : { name: "Venture Round", amountUsd: 100_000_000, announcedAt: "2025-11", leadInvestors: [] },
          status: "verified" as const,
          confidence: "high" as const,
          citationIds: ["c2"]
        },
        investors: fact([])
      },
      team: {
        founders: fact([]),
        keyExecs: fact([]),
        headcount: fact({ value: slug === "browserbase" ? 50 : 75, asOf: "2026-05-06" }, ["c3"])
      },
      signals: [],
      comparables: [],
      citations: [
        { id: "c1", url: "https://example.com/one", title: `${name} site`, fetchedAt: generatedAt, sourceType: "company_site" as const },
        { id: "c2", url: "https://example.com/two", title: `${name} funding`, fetchedAt: generatedAt, sourceType: "news" as const }
      ]
    },
    sections: []
  };
}

async function renderHome() {
  const element = await HomePage();
  return renderToStaticMarkup(element);
}

describe("HomePage", () => {
  beforeEach(() => {
    mocks.getPublicProfileIndex.mockReset();
  });

  it("renders a spare receipt landing page with curated examples", async () => {
    mocks.getPublicProfileIndex.mockResolvedValue([
      summary("elevenlabs", "ElevenLabs", "2026-05-07T12:00:00.000Z"),
      summary("cartesia", "Cartesia", "2026-05-06T12:00:00.000Z"),
      summary("browserbase", "Browserbase", "2026-05-22T12:00:00.000Z")
    ]);

    const html = await renderHome();

    expect(html).toContain("Before the memo, check the receipt.");
    expect(html).toContain("Public facts. Private judgment.");
    expect(html).toContain("Open Browserbase");
    expect(html).toContain('href="/c/browserbase"');
    expect(html).toContain('href="/c/cartesia"');
    expect(html).toContain("Browserbase");
    expect(html).toContain("Cartesia");
    expect(html).not.toContain("Browserbase builds sourced company context infrastructure.");
    expect(html).not.toContain("ElevenLabs");
    expect(html).not.toContain("Public receipt");
    expect(html).not.toContain("Extension lens");
    expect(html).not.toContain("Receipts worth opening.");
    expect(html).not.toContain("Every material claim cites a source.");
    expect(html).not.toContain("Companies");
    expect(html).not.toContain("Search");
    expect(html).not.toContain("Sort");
    expect(html).not.toContain("profiles filed");
    expect(html).not.toContain("public sections");
  });

  it("hides unavailable examples instead of falling back to newest profiles", async () => {
    mocks.getPublicProfileIndex.mockResolvedValue([
      summary("elevenlabs", "ElevenLabs", "2026-05-07T12:00:00.000Z")
    ]);

    const html = await renderHome();

    expect(html).toContain("Before the memo, check the receipt.");
    expect(html).toContain("Request access");
    expect(html).not.toContain("Open Browserbase");
    expect(html).not.toContain("ElevenLabs");
    expect(html).not.toContain("Examples");
    expect(html).not.toContain("Search");
  });
});
