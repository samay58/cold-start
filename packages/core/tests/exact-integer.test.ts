import { describe, expect, it } from "vitest";
import { normalizeExactInteger } from "../src/exact-integer";

describe("exact amounts", () => {
  it.each([
    [0, 0], [25000000, 25000000], ["0", 0], ["25000000", 25000000],
    [" $25,000,000 ", 25000000], ["USD 25 million", 25000000],
    ["25 million USD", 25000000], ["US$2.75M", 2750000],
    ["1.234567 billion", 1234567000], ["0.000001m", 1],
    ["1250000.00", 1250000], ["9007199254740991", Number.MAX_SAFE_INTEGER],
  ])("normalizes %j without rounding", (input, expected) => {
    expect(normalizeExactInteger(input, true)).toBe(expected);
  });

  it.each([
    null, undefined, "", "unknown", "undisclosed", "mixed", "null", "N/A",
    true, false, {}, [], -1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1,
    "9007199254740993", "9007199254740.992k", "0.0000001m", "25,00,000",
    "25.000.000", "25,5 million", "25-30m", "25m+", "~25m", "about $25m",
    "up to $25m", "€25m", "CAD 25m", "A$25m", "25m EUR", "1e6", "0x10",
    "25 million raised", "1/2 million", "-25m", "25 million or 30 million",
  ])("withholds %j instead of inventing an amount", (input) => {
    expect(normalizeExactInteger(input, true)).toBeNull();
  });

  it("keeps count and year fields separate from money syntax", () => {
    expect(normalizeExactInteger("2,500")).toBe(2500);
    expect(normalizeExactInteger("2020")).toBe(2020);
    expect(normalizeExactInteger("2020.0")).toBe(2020);
    for (const value of ["$2500", "2.5k", "2020.5", "100-200", "about 100"]) {
      expect(normalizeExactInteger(value)).toBeNull();
    }
  });
});
