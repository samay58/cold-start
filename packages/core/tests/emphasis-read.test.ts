import { describe, expect, it } from "vitest";
import {
  emphasisSourceDigests,
  emphasisThinFileReason,
  type ColdStartCard
} from "../src";

function citation(id: string, over: Partial<ColdStartCard["citations"][number]> = {}) {
  return {
    id,
    url: `https://example.com/${id}`,
    title: `Title ${id}`,
    fetchedAt: "2026-08-11T00:00:00.000Z",
    sourceType: "news" as const,
    snippet: "First sentence here. Second sentence follows. Third one never appears.",
    ...over
  };
}

function fact<T>(value: T) {
  return { value, status: "verified" as const, confidence: "medium" as const, citationIds: ["c1"] };
}

function cardWith(citations: ColdStartCard["citations"]): ColdStartCard {
  return {
    slug: "acme",
    domain: "acme.com",
    generatedAt: "2026-08-11T00:00:00.000Z",
    generationCostUsd: 0,
    cacheStatus: "hit",
    identity: {
      name: fact("Acme"),
      logoUrl: null,
      oneLiner: fact("Acme sells to mid-market ops teams."),
      hq: fact({ city: "San Francisco", country: "United States" }),
      foundedYear: fact(2024),
      status: "private"
    },
    funding: { totalRaisedUsd: fact(null), lastRound: fact(null), investors: fact(null) },
    team: { founders: fact([]), keyExecs: fact([]), headcount: fact(null) },
    signals: [],
    comparables: [],
    citations
  };
}

describe("emphasisThinFileReason", () => {
  it("returns too-few-sources under four non-enrichment citations", () => {
    const card = cardWith([citation("c1"), citation("c2"), citation("e1", { sourceType: "enrichment" })]);
    expect(emphasisThinFileReason(card)).toBe("too-few-sources");
  });

  it("returns no-company-authored when nothing in the file is the company's own voice", () => {
    const card = cardWith([citation("c1"), citation("c2"), citation("c3"), citation("c4")]);
    expect(emphasisThinFileReason(card)).toBe("no-company-authored");
  });

  it("returns null when the file is readable", () => {
    const card = cardWith([
      citation("c1", { sourceType: "company_site", url: "https://acme.com/product" }),
      citation("c2"), citation("c3"), citation("c4")
    ]);
    expect(emphasisThinFileReason(card)).toBeNull();
  });

  // A repeat analysis run's working card keeps every founder_authored ("fv"-prefixed) citation a
  // PRIOR run's founder-voice fetch produced (apps/web/src/inngest/emphasis-read.ts's additive
  // design), so this gate must never treat one as company-authored presence: doing so would let
  // stale founder-voice evidence silently clear a gate this run's own evidence never earned.
  it("returns no-company-authored when the only would-be company voice is a founder_authored citation", () => {
    const card = cardWith([
      citation("c1"), citation("c2"), citation("c3"), citation("c4"),
      citation("fv1", {
        sourceQuality: { tier: "founder_authored", label: "Founder-authored", rationale: "r", incentive: "i" }
      })
    ]);
    expect(emphasisThinFileReason(card)).toBe("no-company-authored");
  });

  // The same exclusion applies to the non-enrichment count itself: a card that clears four
  // citations only because a prior run's fv citation is in the mix must still read as too thin,
  // not as merely missing company-authored evidence.
  it("excludes founder_authored citations from the non-enrichment count too", () => {
    const card = cardWith([
      citation("c1"), citation("c2"), citation("c3"),
      citation("fv1", {
        sourceQuality: { tier: "founder_authored", label: "Founder-authored", rationale: "r", incentive: "i" }
      })
    ]);
    expect(emphasisThinFileReason(card)).toBe("too-few-sources");
  });
});

describe("emphasisSourceDigests", () => {
  it("digests each non-enrichment citation with class, headline, and a two-sentence lead", () => {
    const card = cardWith([
      citation("c1", { sourceType: "company_site", url: "https://acme.com/blog" }),
      citation("fv1", {
        sourceQuality: { tier: "founder_authored", label: "Founder-authored", rationale: "r", incentive: "i" }
      }),
      citation("e1", { sourceType: "enrichment" })
    ]);
    const digests = emphasisSourceDigests(card);
    expect(digests.map((d) => d.citationId)).toEqual(["c1", "fv1"]);
    expect(digests[0]).toMatchObject({ sourceClass: "company-authored", headline: "Title c1" });
    expect(digests[1]?.sourceClass).toBe("founder-authored");
    expect(digests[0]?.leadsWith).toBe("First sentence here. Second sentence follows.");
  });
});
