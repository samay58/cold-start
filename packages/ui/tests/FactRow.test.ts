import { describe, expect, it } from "vitest";
import { formatCompactCurrency, formatShortDate } from "../src/FactRow";

describe("formatCompactCurrency", () => {
  it("delegates to the shared core precision rules", () => {
    expect(formatCompactCurrency(6_250_000)).toBe("$6.3M");
    expect(formatCompactCurrency(6_000_000)).toBe("$6M");
    expect(formatCompactCurrency(12_400_000)).toBe("$12M");
  });

  it("keeps the not-publicly-disclosed fallback for missing values", () => {
    expect(formatCompactCurrency(null)).toBe("not publicly disclosed");
    expect(formatCompactCurrency(undefined)).toBe("not publicly disclosed");
  });
});

describe("formatShortDate", () => {
  it("delegates to the shared core month-year formatter", () => {
    expect(formatShortDate("2019-07-25")).toBe("Jul 2019");
  });

  it("keeps the not-publicly-disclosed fallback for missing values", () => {
    expect(formatShortDate(null)).toBe("not publicly disclosed");
  });
});
