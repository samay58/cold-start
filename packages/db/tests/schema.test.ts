import { describe, expect, it } from "vitest";

import { cards, citations, claims, generationRuns, researchSections, sources } from "../src/schema";

describe("database schema", () => {
  it("exports every table required by the card pipeline", () => {
    expect(cards).toBeDefined();
    expect(claims).toBeDefined();
    expect(citations).toBeDefined();
    expect(sources).toBeDefined();
    expect(generationRuns).toBeDefined();
    expect(researchSections).toBeDefined();
  });

  it("requires generation run job kind to be explicit", () => {
    expect(generationRuns.jobKind.default).toBeUndefined();
    expect(generationRuns.jobKind.hasDefault).toBe(false);
    expect(generationRuns.jobKind.notNull).toBe(true);
  });
});
