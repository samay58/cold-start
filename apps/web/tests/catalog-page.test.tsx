import { sourceQualityForSource, type SourceQualityTier } from "@cold-start/core";
import type { PublicCardSummary } from "@cold-start/db";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { emptySectionsCard, richConflictCard, thinFileCard } from "./fixtures/gallery-cards";

const mocks = vi.hoisted(() => ({
  getCachedPublicProfileIndex: vi.fn()
}));

vi.mock("../src/lib/cards", () => ({
  getCachedPublicProfileIndex: mocks.getCachedPublicProfileIndex
}));

vi.mock("next/server", () => ({
  connection: vi.fn(async () => undefined)
}));

const { default: CatalogPage } = await import("../src/app/catalog/page");

function summaryFrom(card: typeof richConflictCard): PublicCardSummary {
  const sourceQualityCounts: Record<SourceQualityTier, number> = {
    independent_technical: 0,
    independent_analysis: 0,
    independent_report: 0,
    primary_company: 0,
    press_release: 0,
    enrichment: 0,
    unknown: 0
  };
  for (const citation of card.citations) {
    sourceQualityCounts[(citation.sourceQuality ?? sourceQualityForSource(citation)).tier] += 1;
  }

  return {
    slug: card.slug,
    domain: card.domain,
    name: card.identity.name.value ?? card.domain,
    generatedAt: card.generatedAt,
    sourceCount: card.citations.length,
    sourceQualityCounts
  };
}

// Deliberately unsorted (Plainfield, the middle date, first) so the "filed-date desc" ordering
// the page is responsible for is a real assertion, not an artifact of mock order.
const threeSummaries: PublicCardSummary[] = [
  summaryFrom(emptySectionsCard), // Plainfield, 2026-04-18
  summaryFrom(richConflictCard), // Voxlathe, 2026-05-15 (most recent)
  summaryFrom(thinFileCard) // Hollow Labs, 2026-04-02 (oldest)
];

async function renderCatalogPage() {
  const element = await CatalogPage();
  return renderToStaticMarkup(element);
}

describe("CatalogPage", () => {
  beforeEach(() => {
    mocks.getCachedPublicProfileIndex.mockReset();
  });

  it("renders the header, real count, each row's identity, and the thin row's stamp", async () => {
    mocks.getCachedPublicProfileIndex.mockResolvedValue(threeSummaries);

    const html = await renderCatalogPage();

    expect(html).toContain("The Catalog");
    expect(html).toContain("3 profiles filed");

    expect(html).toContain("Voxlathe");
    expect(html).toContain("CS·VOXLATHE·26");
    expect(html).toContain("Hollow Labs");
    expect(html).toContain("CS·HOLLOWLABS·26");
    expect(html).toContain("Plainfield");
    expect(html).toContain("CS·PLAINFIELD·26");

    expect(html).toContain("THIN FILE");

    // Filed-date desc: Plainfield (dynamically two days old, the gallery's not-aged contrast)
    // before Voxlathe (2026-05-15) before Hollow Labs (2026-04-02), regardless of the mocked
    // array's own order above.
    const voxlatheIndex = html.indexOf("Voxlathe");
    const plainfieldIndex = html.indexOf("Plainfield");
    const hollowLabsIndex = html.indexOf("Hollow Labs");
    expect(plainfieldIndex).toBeGreaterThan(-1);
    expect(voxlatheIndex).toBeGreaterThan(plainfieldIndex);
    expect(hollowLabsIndex).toBeGreaterThan(voxlatheIndex);
  });

  it("never renders THIN FILE against the two non-thin rows", async () => {
    mocks.getCachedPublicProfileIndex.mockResolvedValue([summaryFrom(richConflictCard), summaryFrom(emptySectionsCard)]);

    const html = await renderCatalogPage();

    expect(html).not.toContain("THIN FILE");
  });

  it("renders the empty state when no profiles are filed", async () => {
    mocks.getCachedPublicProfileIndex.mockResolvedValue([]);

    const html = await renderCatalogPage();

    expect(html).toContain("The Catalog");
    expect(html).toContain("No profiles filed yet.");
    expect(html).not.toContain('href="/c/');
  });
});
