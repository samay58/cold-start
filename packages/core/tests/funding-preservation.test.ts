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
