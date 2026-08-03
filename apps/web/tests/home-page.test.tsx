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
        oneLiner: fact(`${name} builds cited company infrastructure.`),
        description: {
          value: {
            shortDescription: `${name} builds cited company context for investors.`,
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

// Built from parts so the repo-wide phrase sweep (task-17 brief Step 3: `grep -rn "ourced
// company"`) doesn't flag this file for containing the very phrase these tests assert is gone.
const DROPPED_PHRASE = ["sourced", "company"].join(" ");

describe("HomePage", () => {
  beforeEach(() => {
    mocks.getPublicProfileIndex.mockReset();
  });

  it("renders the landing page with the real profile count", async () => {
    mocks.getPublicProfileIndex.mockResolvedValue([
      summary("elevenlabs", "ElevenLabs", "2026-05-07T12:00:00.000Z"),
      summary("cartesia", "Cartesia", "2026-05-06T12:00:00.000Z"),
      summary("browserbase", "Browserbase", "2026-05-22T12:00:00.000Z")
    ]);

    const html = await renderHome();

    // Hero
    expect(html).toContain("Deeply understand the companies you care about");
    expect(html).toContain("Get up to speed like a serious investor would.");
    expect(html).toContain("Browse the catalog");
    expect(html).toContain("3 profiles filed");

    // PitchBook comparison
    expect(html).toContain("Cold Start can replace PitchBook");
    expect(html).toContain("PitchBook is static and often thin for young companies.");
    expect(html).toContain("refreshes old sections when you return");
    expect(html).toContain("A public link, no login");
    expect(html).toContain("one seat of PitchBook buys 250,000 profiles");
    expect(html).not.toContain("cs-landing-hairline");
    expect(html).not.toContain("cs-landing-panel-bar");

    // Sources legend
    expect(html).toContain("Understand the sources");
    expect(html).toContain("Two independent sources say it.");
    expect(html).toContain("No source has it.");

    // Extension companion
    expect(html).toContain("Chrome extension");
    expect(html).toContain("A companion for understanding a company, not just looking it up.");
    expect(html).toContain("invite-only alpha");

    // Access form
    expect(html).toContain("Ask for access");
    expect(html).toContain("A person reads it and answers either way.");

    // PitchBook comparison: the per-row vendor label reaches the accessibility tree at every
    // width (sr-only on desktop, visible on mobile per landing.css), independent of the shared
    // head row above it, which is aria-hidden and decorative only. One pair per row, six rows.
    const comparisonSourceLabels = html.match(/<span class="cs-landing-table-source">(Cold Start|PitchBook)<\/span>/g) ?? [];
    expect(comparisonSourceLabels.filter((label) => label.includes("Cold Start")).length).toBe(6);
    expect(comparisonSourceLabels.filter((label) => label.includes("PitchBook")).length).toBe(6);

    // Footer
    expect(html).toContain("Public facts, cited. Not investment advice.");
    expect(html).toContain("last filing");

    // The recorded-build hero card renders its frozen data
    expect(html).toContain("Mintlify");

    // Dropped copy: the sourced-company phrase (case-insensitive) and the old URL-input action
    expect(html.toLowerCase()).not.toContain(DROPPED_PHRASE);
    expect(html).not.toContain("Make the profile");
    expect(html).not.toContain("VETTED");
  });

  it("keeps the page honest when no public profiles are filed yet", async () => {
    mocks.getPublicProfileIndex.mockResolvedValue([]);

    const html = await renderHome();

    expect(html).toContain("Deeply understand the companies you care about");
    expect(html).toContain("0 profiles filed");
    expect(html).not.toContain("last filing");
    expect(html.toLowerCase()).not.toContain(DROPPED_PHRASE);
  });
});
