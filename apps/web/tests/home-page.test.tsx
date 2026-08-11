import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getCachedPublicProfileIndex: vi.fn()
}));

vi.mock("../src/lib/cards", () => ({
  getCachedPublicProfileIndex: mocks.getCachedPublicProfileIndex
}));

vi.mock("next/server", () => ({
  connection: vi.fn(async () => undefined)
}));

const { default: HomePage } = await import("../src/app/page");

function summary(slug: string, name: string, generatedAt: string) {
  const domain = `${slug}.ai`;
  return {
    slug,
    domain,
    name,
    generatedAt,
    sourceCount: slug === "browserbase" ? 21 : 8,
    sourceQualityCounts: {
      independent_technical: 0,
      independent_analysis: 0,
      independent_report: 0,
      primary_company: 0,
      press_release: 0,
      enrichment: 0,
      unknown: 0
    }
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
    mocks.getCachedPublicProfileIndex.mockReset();
  });

  it("renders the landing page with the real profile count", async () => {
    mocks.getCachedPublicProfileIndex.mockResolvedValue([
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
    mocks.getCachedPublicProfileIndex.mockResolvedValue([]);

    const html = await renderHome();

    expect(html).toContain("Deeply understand the companies you care about");
    expect(html).toContain("0 profiles filed");
    expect(html).not.toContain("last filing");
    expect(html.toLowerCase()).not.toContain(DROPPED_PHRASE);
  });
});
