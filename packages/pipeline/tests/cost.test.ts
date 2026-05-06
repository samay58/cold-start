import { describe, expect, it } from "vitest";
import { totalGenerationCost } from "../src/index";

describe("totalGenerationCost", () => {
  it("rounds summed cost to four decimal places", () => {
    expect(totalGenerationCost([
      { label: "provider", usd: 0.01234 },
      { label: "extraction", usd: 0.01235 }
    ])).toBe(0.0247);
  });

  it("rejects invalid cost lines", () => {
    expect(() => totalGenerationCost([{ label: "negative", usd: -0.01 }])).toThrow(/finite nonnegative/);
    expect(() => totalGenerationCost([{ label: "infinite", usd: Number.POSITIVE_INFINITY }])).toThrow(
      /finite nonnegative/
    );
  });
});
