import { describe, expect, it } from "vitest";
import { formatCompactUsd, formatMonthYear } from "../src/money-format";

describe("formatCompactUsd", () => {
  it("keeps one decimal under $10M and trims a trailing .0", () => {
    expect(formatCompactUsd(6_250_000)).toBe("$6.3M");
    expect(formatCompactUsd(6_000_000)).toBe("$6M");
  });

  it("rounds to a whole million at and above $10M", () => {
    expect(formatCompactUsd(12_400_000)).toBe("$12M");
    expect(formatCompactUsd(91_000_000)).toBe("$91M");
    expect(formatCompactUsd(10_000_000)).toBe("$10M");
  });

  it("keeps one decimal for billions, trimmed when whole", () => {
    expect(formatCompactUsd(1_250_000_000)).toBe("$1.3B");
    expect(formatCompactUsd(2_000_000_000)).toBe("$2B");
  });

  it("formats sub-million amounts as plain currency", () => {
    expect(formatCompactUsd(500_000)).toBe("$500,000");
    expect(formatCompactUsd(0)).toBe("$0");
  });
});

describe("formatMonthYear", () => {
  it("renders an ISO date as month and year", () => {
    expect(formatMonthYear("2019-07-25")).toBe("Jul 2019");
  });

  it("passes a bare year through unchanged", () => {
    expect(formatMonthYear("2021")).toBe("2021");
  });

  it("returns unparseable input unchanged rather than throwing", () => {
    expect(formatMonthYear("not a date")).toBe("not a date");
  });
});
