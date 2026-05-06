import { describe, expect, it } from "vitest";

import { cards, citations, claims, generationRuns, sources } from "../src/schema";

describe("database schema", () => {
  it("exports every table required by the card pipeline", () => {
    expect(cards).toBeDefined();
    expect(claims).toBeDefined();
    expect(citations).toBeDefined();
    expect(sources).toBeDefined();
    expect(generationRuns).toBeDefined();
  });
});
