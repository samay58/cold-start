import { describe, expect, it } from "vitest";
import { buildCondensedView } from "../src/app/eval/condensed";
import { richConflictCard } from "./fixtures/gallery-cards";

describe("condensed views", () => {
  it("extracts the pick-screen fields and nothing identity-blind", () => {
    const view = buildCondensedView(richConflictCard.slug, richConflictCard, []);
    expect(view.name).toBeTruthy();
    expect(view.stats.length).toBeGreaterThan(0);
    expect(Object.keys(view)).not.toContain("eraBucket");
    expect(Object.keys(view)).not.toContain("routing");
  });

  it("tolerates a card with no synthesis and no competition section", () => {
    const bare = { ...richConflictCard };
    delete (bare as Record<string, unknown>).synthesis;
    const view = buildCondensedView("bare", bare, []);
    expect(view.thesis).toBeNull();
    expect(view.comps).toEqual([]);
  });
});
