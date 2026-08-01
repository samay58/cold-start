import type { PublicCardSummary } from "@cold-start/db";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { emptySectionsCard, richConflictCard, thinFileCard } from "./fixtures/gallery-cards";

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

const { default: CatalogPage } = await import("../src/app/catalog/page");

// Card fixtures carry no synthesis field, so they already satisfy the public PublicCardSummary's
// `card` shape (Omit<ColdStartCard, "synthesis" | "synthesisWithheld">) with no cast needed, the
// same pattern card-page.test.tsx uses.
function summaryFrom(card: typeof richConflictCard): PublicCardSummary {
  return {
    slug: card.slug,
    domain: card.domain,
    name: card.identity.name.value ?? card.domain,
    generatedAt: card.generatedAt,
    sourceCount: card.citations.length,
    totalRaisedUsd: card.funding.totalRaisedUsd.value,
    lastRoundName: card.funding.lastRound.value?.name ?? null,
    headcount: card.team.headcount.value?.value ?? null,
    card,
    sections: []
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
    mocks.getPublicProfileIndex.mockReset();
  });

  it("renders the header, real count, each row's identity, and the thin row's stamp", async () => {
    mocks.getPublicProfileIndex.mockResolvedValue(threeSummaries);

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

    // Filed-date desc: Voxlathe (2026-05-15) before Plainfield (2026-04-18) before Hollow Labs
    // (2026-04-02), regardless of the mocked array's own order above.
    const voxlatheIndex = html.indexOf("Voxlathe");
    const plainfieldIndex = html.indexOf("Plainfield");
    const hollowLabsIndex = html.indexOf("Hollow Labs");
    expect(voxlatheIndex).toBeGreaterThan(-1);
    expect(plainfieldIndex).toBeGreaterThan(voxlatheIndex);
    expect(hollowLabsIndex).toBeGreaterThan(plainfieldIndex);
  });

  it("never renders THIN FILE against the two non-thin rows", async () => {
    mocks.getPublicProfileIndex.mockResolvedValue([summaryFrom(richConflictCard), summaryFrom(emptySectionsCard)]);

    const html = await renderCatalogPage();

    expect(html).not.toContain("THIN FILE");
  });

  it("renders the empty state when no profiles are filed", async () => {
    mocks.getPublicProfileIndex.mockResolvedValue([]);

    const html = await renderCatalogPage();

    expect(html).toContain("The Catalog");
    expect(html).toContain("No profiles filed yet.");
    expect(html).not.toContain('href="/c/');
  });
});
