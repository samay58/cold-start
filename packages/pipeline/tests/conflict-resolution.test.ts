import { describe, expect, it } from "vitest";
import { chooseMostAuthoritativeFact } from "../src/index";

describe("chooseMostAuthoritativeFact", () => {
  it("returns null for empty input", () => {
    expect(chooseMostAuthoritativeFact([])).toBeNull();
  });

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

  it("uses recency when source authority is tied", () => {
    const result = chooseMostAuthoritativeFact([
      { value: "older", sourceType: "news", fetchedAt: "2026-05-05T12:00:00.000Z", citationId: "c1" },
      { value: "newer", sourceType: "news", fetchedAt: "2026-05-06T12:00:00.000Z", citationId: "c2" }
    ]);

    expect(result?.value).toBe("newer");
  });

  it("treats invalid fetchedAt values as older than valid dates", () => {
    const result = chooseMostAuthoritativeFact([
      { value: "invalid", sourceType: "company_site", fetchedAt: "not-a-date", citationId: "c1" },
      { value: "valid", sourceType: "company_site", fetchedAt: "2026-05-05T12:00:00.000Z", citationId: "c2" }
    ]);

    expect(result?.value).toBe("valid");
  });

  it("treats unknown source types as lower authority than known sources", () => {
    const result = chooseMostAuthoritativeFact([
      { value: "unknown", sourceType: "social_post", fetchedAt: "2026-05-06T12:00:00.000Z", citationId: "c1" },
      { value: "known", sourceType: "other", fetchedAt: "2026-05-05T12:00:00.000Z", citationId: "c2" }
    ]);

    expect(result?.value).toBe("known");
  });
});
