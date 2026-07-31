import { describe, expect, it } from "vitest";
import { coldStartCardSchema, hasUsablePublicProfile } from "@cold-start/core";
import { emptySectionsCard, richConflictCard, thinFileCard } from "./fixtures/gallery-cards";

describe("web gallery fixtures", () => {
  it.each([
    ["richConflictCard", richConflictCard],
    ["thinFileCard", thinFileCard],
    ["emptySectionsCard", emptySectionsCard]
  ])("%s parses as a valid ColdStartCard and passes hasUsablePublicProfile", (_name, card) => {
    const parsed = coldStartCardSchema.safeParse(card);
    expect(parsed.success).toBe(true);
    expect(hasUsablePublicProfile(card)).toBe(true);
  });

  it("gives richConflictCard's headcount a mixed status backed by the two reporting citations", () => {
    expect(richConflictCard.team.headcount.status).toBe("mixed");
    expect(richConflictCard.team.headcount.citationIds).toEqual(["c3", "c4"]);
  });
});
