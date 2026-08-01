import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { richConflictCard, thinFileCard } from "./fixtures/gallery-cards";

const mocks = vi.hoisted(() => ({
  getPublicCachedCardProfile: vi.fn()
}));

vi.mock("../src/lib/cards", () => ({
  getPublicCachedCardProfile: mocks.getPublicCachedCardProfile
}));

vi.mock("next/cache", () => ({
  unstable_cache: <T extends (...args: never[]) => unknown>(fn: T) => fn
}));

vi.mock("next/server", () => ({
  connection: vi.fn(async () => undefined)
}));

// CardTexture is a "use client" WebGL component (window.matchMedia, document.createElement):
// stub it to null so renderToStaticMarkup can run in plain Node without jsdom.
vi.mock("../src/app/CardTexture", () => ({
  CardTexture: () => null
}));

const { default: CompanyCardPage } = await import("../src/app/c/[slug]/page");

function params(slug: string) {
  return { params: Promise.resolve({ slug }) };
}

async function renderCardPage(slug: string) {
  const element = await CompanyCardPage(params(slug));
  return renderToStaticMarkup(element);
}

describe("CompanyCardPage", () => {
  beforeEach(() => {
    mocks.getPublicCachedCardProfile.mockReset();
  });

  it("renders the rich fixture's name, call number, and an honest absence", async () => {
    mocks.getPublicCachedCardProfile.mockResolvedValue({ card: richConflictCard, sections: [] });

    const html = await renderCardPage("voxlathe-example");

    expect(html).toContain("Voxlathe");
    expect(html).toContain("CS·VOXLATHE·26");
    expect(html).toContain("not publicly disclosed");
    expect(html).toContain("Both values stand. Cold Start does not average sources.");
  });

  it("never renders synthesis, even when the fetched card carries one", async () => {
    // The public route type (PublicCardData) omits synthesis, but that is a compile-time
    // guarantee only. This plants a synthesis object with marker strings on a card the mocked
    // data layer returns anyway, so the assertion below proves the face never reads it at
    // runtime either.
    const cardWithSynthesis = {
      ...richConflictCard,
      synthesis: {
        whyItMatters: { text: "SYNTHESIS-MARKER-WHY-IT-MATTERS [c1].", citationIds: ["c1"] },
        bullCase: [{ text: "SYNTHESIS-MARKER-BULL-CASE [c1].", citationIds: ["c1"] }],
        bearCase: [{ text: "SYNTHESIS-MARKER-BEAR-CASE [c1].", citationIds: ["c1"] }],
        openQuestions: [{ question: "SYNTHESIS-MARKER-OPEN-QUESTION?", category: "buyer_budget" as const }]
      }
    };
    mocks.getPublicCachedCardProfile.mockResolvedValue({ card: cardWithSynthesis, sections: [] });

    const html = await renderCardPage("voxlathe-example");

    expect(html).not.toContain("SYNTHESIS-MARKER-WHY-IT-MATTERS");
    expect(html).not.toContain("SYNTHESIS-MARKER-BULL-CASE");
    expect(html).not.toContain("SYNTHESIS-MARKER-BEAR-CASE");
    expect(html).not.toContain("SYNTHESIS-MARKER-OPEN-QUESTION");
  });

  it("renders the thin fixture's THIN FILE stamp and withholds Investor read", async () => {
    mocks.getPublicCachedCardProfile.mockResolvedValue({ card: thinFileCard, sections: [] });

    const html = await renderCardPage("hollowlabs-example");

    expect(html).toContain("THIN FILE");
    expect(html).not.toContain("Investor read");
  });
});
