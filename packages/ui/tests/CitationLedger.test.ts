import { describe, expect, it } from "vitest";
import { sourceClassForQualityTier } from "../src/CitationLedger";

describe("sourceClassForQualityTier", () => {
  it("classifies independent_technical and independent_analysis as independent", () => {
    expect(sourceClassForQualityTier("independent_technical")).toBe("independent");
    expect(sourceClassForQualityTier("independent_analysis")).toBe("independent");
  });

  it("classifies independent_report as reporting", () => {
    expect(sourceClassForQualityTier("independent_report")).toBe("reporting");
  });

  it("classifies primary_company and press_release as company", () => {
    expect(sourceClassForQualityTier("primary_company")).toBe("company");
    expect(sourceClassForQualityTier("press_release")).toBe("company");
  });

  // founder_authored (the emphasis read's "fv"-prefixed evidence, packages/core/src/source-quality.ts)
  // previously fell through to "unknown" here, the same class as a citation with no tier
  // information at all. It belongs alongside the company-authored class family, matching the
  // extension's own lensSources footer-chip mapping in investor-lens.ts.
  it("classifies founder_authored alongside the company-authored class family", () => {
    expect(sourceClassForQualityTier("founder_authored")).toBe("company");
  });

  it("classifies enrichment as vendor", () => {
    expect(sourceClassForQualityTier("enrichment")).toBe("vendor");
  });

  it("falls back to unknown for an unrecognized tier", () => {
    expect(sourceClassForQualityTier("unknown")).toBe("unknown");
  });
});
