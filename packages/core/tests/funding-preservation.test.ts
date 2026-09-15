import { describe, expect, it } from "vitest";
import { preserveKnownFundingAmounts } from "../src/funding-preservation";
import type { ColdStartCard } from "../src/card";

type Funding = ColdStartCard["funding"];
function funding(amountUsd: number | null, date: string | null, id: string): Funding {
  const unknown = { value: null, status: "unknown" as const, confidence: "low" as const, citationIds: [] };
  const round = { name: "Series A", amountUsd, announcedAt: date, leadInvestors: [] };
  return {
    totalRaisedUsd: unknown, investors: unknown,
    lastRound: { value: round, status: "verified", confidence: "high", citationIds: [id] },
    rounds: { value: [round], status: "verified", confidence: "high", citationIds: [id] },
  };
}

describe("saved round amounts", () => {
  it("restores only the missing amount and carries its evidence and confidence", () => {
    const saved = funding(25000000, "2026-01-01", "saved");
    saved.lastRound.confidence = "medium";
    saved.rounds!.confidence = "medium";
    const next = funding(null, "2026-01-01", "next");
    const before = structuredClone({ saved, next });
    const result = preserveKnownFundingAmounts(next, saved);
    expect(result.lastRound.value?.amountUsd).toBe(25000000);
    expect(result.rounds?.value?.[0]?.amountUsd).toBe(25000000);
    expect(result.lastRound.confidence).toBe("medium");
    expect(result.lastRound.citationIds).toEqual(["next", "saved"]);
    expect({ saved, next }).toEqual(before);
    expect(preserveKnownFundingAmounts(result, saved)).toEqual(result);
  });

  it.each(["2026-02-01", null])("never transfers an old amount to a round dated %j", (date) => {
    const next = funding(null, date, "next");
    expect(preserveKnownFundingAmounts(next, funding(25000000, "2026-01-01", "saved"))).toEqual(next);
  });

  it("never replaces an explicit new amount", () => {
    const next = funding(30000000, "2026-01-01", "next");
    expect(preserveKnownFundingAmounts(next, funding(25000000, "2026-01-01", "saved"))).toEqual(next);
  });

  it("withholds an amount when the old ledger conflicts or lacks citations", () => {
    const saved = funding(25000000, "2026-01-01", "saved");
    saved.rounds!.value![0] = { ...saved.rounds!.value![0]!, amountUsd: 30000000 };
    const next = funding(null, "2026-01-01", "next");
    expect(preserveKnownFundingAmounts(next, saved)).toEqual(next);
    saved.lastRound.citationIds = [];
    saved.rounds!.citationIds = [];
    expect(preserveKnownFundingAmounts(next, saved)).toEqual(next);
  });
});

describe("restored round provenance", () => {
  const unknown = { value: null, status: "unknown" as const, confidence: "low" as const, citationIds: [] };
  const seriesA = { name: "Series A", amountUsd: 25000000, announcedAt: "2026-01-01", leadInvestors: [] };
  const seed = { name: "Seed", amountUsd: 4000000, announcedAt: "2025-01-01", leadInvestors: [] };

  it("withholds an amount whose saved evidence also backs other rounds", () => {
    const saved: Funding = {
      totalRaisedUsd: unknown, investors: unknown, lastRound: unknown,
      rounds: { value: [seriesA, seed], status: "verified", confidence: "high", citationIds: ["c1", "c2", "c3"] },
    };
    const next = funding(null, "2026-01-01", "c9");
    delete next.rounds;

    const result = preserveKnownFundingAmounts(next, saved);
    expect(result.lastRound.value?.amountUsd).toBeNull();
    expect(result.lastRound.citationIds).toEqual(["c9"]);
  });

  it("restores from a saved ledger that holds only the matching round", () => {
    const saved: Funding = {
      totalRaisedUsd: unknown, investors: unknown, lastRound: unknown,
      rounds: { value: [seriesA], status: "verified", confidence: "high", citationIds: ["c1"] },
    };
    const next = funding(null, "2026-01-01", "c9");
    delete next.rounds;

    const result = preserveKnownFundingAmounts(next, saved);
    expect(result.lastRound.value?.amountUsd).toBe(25000000);
    expect(result.lastRound.citationIds).toEqual(["c9", "c1"]);
  });

  it("never presents a restored amount as an unknown fact", () => {
    const saved = funding(50000000, "2026-01-01", "saved");
    saved.lastRound.status = "unknown";
    saved.rounds!.status = "unknown";
    const next = funding(null, "2026-01-01", "next");

    const result = preserveKnownFundingAmounts(next, saved);
    expect(result.lastRound.value?.amountUsd).toBe(50000000);
    expect(result.lastRound.status).toBe("inferred");
    expect(result.rounds?.value?.[0]?.amountUsd).toBe(50000000);
    expect(result.rounds?.status).toBe("inferred");
  });

  it("takes the restored status from the saved fact and the lower confidence of the two", () => {
    const saved = funding(25000000, "2026-01-01", "saved");
    saved.lastRound.status = "inferred";
    saved.rounds!.status = "inferred";
    const next = funding(null, "2026-01-01", "next");
    next.lastRound.confidence = "low";
    next.rounds!.confidence = "low";

    const result = preserveKnownFundingAmounts(next, saved);
    expect(result.lastRound.status).toBe("inferred");
    expect(result.lastRound.confidence).toBe("low");
  });
});
