import { describe, expect, it } from "vitest";
import { textLooksLikeCustomerProof, textLooksLikeDocs, textLooksLikeFunding } from "../src/source-class";

describe("source-class heuristics", () => {
  it("matches docs surfaces case-insensitively", () => {
    expect(textLooksLikeDocs("https://acme.com/docs")).toBe(true);
    expect(textLooksLikeDocs("Developer Guide")).toBe(true);
    expect(textLooksLikeDocs("API reference")).toBe(true);
    expect(textLooksLikeDocs("https://acme.com/pricing")).toBe(false);
  });

  it("does not treat a substring like 'rapid' as an api docs page", () => {
    expect(textLooksLikeDocs("Rapid growth at Acme")).toBe(false);
  });

  it("matches funding coverage", () => {
    expect(textLooksLikeFunding("Acme raises $20M Series B")).toBe(true);
    expect(textLooksLikeFunding("New investors back Acme")).toBe(true);
    expect(textLooksLikeFunding("Acme launches a product")).toBe(false);
  });

  it("matches customer proof", () => {
    expect(textLooksLikeCustomerProof("Acme customer case study")).toBe(true);
    expect(textLooksLikeCustomerProof("How BigCo deployed Acme")).toBe(true);
    expect(textLooksLikeCustomerProof("Acme blog post")).toBe(false);
  });
});
