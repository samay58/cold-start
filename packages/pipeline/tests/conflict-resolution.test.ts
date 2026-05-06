import { describe, expect, it } from "vitest";
import { chooseMostAuthoritativeFact } from "../src/index";

describe("chooseMostAuthoritativeFact", () => {
  it("prefers recent primary source facts over older enrichment facts", () => {
    const result = chooseMostAuthoritativeFact([
      { value: 2021, sourceType: "enrichment", fetchedAt: "2026-05-06T12:00:00.000Z", citationId: "c2" },
      { value: 2020, sourceType: "company_site", fetchedAt: "2026-05-05T12:00:00.000Z", citationId: "c1" }
    ]);

    expect(result).toEqual({
      value: 2020,
      sourceType: "company_site",
      fetchedAt: "2026-05-05T12:00:00.000Z",
      citationId: "c1"
    });
  });
});
