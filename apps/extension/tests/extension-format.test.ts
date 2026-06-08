import { describe, expect, it } from "vitest";
import { compactProfileSummary, formatElapsed } from "../src/extension-format";

describe("extension formatting", () => {
  it("formats elapsed run time", () => {
    expect(formatElapsed(84)).toBe("1:24");
  });

  it("keeps the overview to the first load-bearing sentence", () => {
    expect(
      compactProfileSummary(
        "Hanover Park is an AI-native fund administrator for private equity and venture capital firms. It combines fund accounting, portfolio management, LP portals, analytics, modelling, security workflows, client support, and capital calls into one platform.",
        "hanoverpark.com"
      )
    ).toBe("Hanover Park is an AI-native fund administrator for private equity and venture capital firms.");
  });

  it("clamps long single-sentence overviews at a word boundary", () => {
    const summary = compactProfileSummary(
      "Hanover Park replaces fragmented fund administration workflows for private equity and venture capital teams by combining fund accounting, document extraction, portfolio management, limited partner reporting, capital calls, distributions, analytics, and service operations into one workspace",
      "hanoverpark.com"
    );

    expect(summary.length).toBeLessThanOrEqual(223);
    expect(summary.endsWith("...")).toBe(false);
    expect(summary).toMatch(/[.!?]$/);
    expect(summary).not.toContain("workspace...");
  });
});
