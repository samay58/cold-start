import { describe, expect, it } from "vitest";
import { stripCitationMarkers } from "../src/citation-text";

describe("stripCitationMarkers", () => {
  it("strips bare, prefixed, and comma-list markers identically", () => {
    expect(stripCitationMarkers("Warp matters [c1].")).toBe("Warp matters.");
    expect(stripCitationMarkers("Warp matters [e3].")).toBe("Warp matters.");
    expect(stripCitationMarkers("Warp matters [seed1].")).toBe("Warp matters.");
    expect(stripCitationMarkers("Warp matters [123].")).toBe("Warp matters.");
    expect(stripCitationMarkers("Warp matters [c1, c2].")).toBe("Warp matters.");
    expect(stripCitationMarkers("Warp matters [c.1, e-2].")).toBe("Warp matters.");
  });

  it("collapses whitespace left by a mid-sentence marker", () => {
    expect(stripCitationMarkers("Funding [c4] closed in 2024.")).toBe("Funding closed in 2024.");
  });

  it("leaves prose brackets and marker-free text intact", () => {
    expect(stripCitationMarkers("See [item one] for details.")).toBe("See [item one] for details.");
    expect(stripCitationMarkers("No markers here.")).toBe("No markers here.");
  });
});
