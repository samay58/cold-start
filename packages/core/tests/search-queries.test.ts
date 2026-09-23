import { describe, expect, it } from "vitest";
import { defaultSourceSearchQueries, sourceSearchSubjectForDomain } from "../src/index";

const FUNDING_WORDS = /\b(fund(ing|ed|raise)?|raised?|series|valuation|investors?|round|revenue|traction)\b/i;

describe("defaultSourceSearchQueries", () => {
  it("keeps funding words in the funding search only", () => {
    const queries = defaultSourceSearchQueries("nekohealth.com");

    expect(queries.funding).toMatch(FUNDING_WORDS);
    for (const [name, query] of Object.entries(queries)) {
      if (name === "funding") continue;
      expect(query, name).not.toMatch(FUNDING_WORDS);
    }
  });

  it("names the company the way the search subject helper does", () => {
    const subject = sourceSearchSubjectForDomain("nekohealth.com");

    for (const [name, query] of Object.entries(defaultSourceSearchQueries("nekohealth.com"))) {
      expect(query.startsWith(`${subject} `), name).toBe(true);
    }
  });
});
