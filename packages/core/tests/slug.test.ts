import { describe, expect, it } from "vitest";
import { canonicalDomain, companySlugFromDomain } from "../src/index";

describe("companySlugFromDomain", () => {
  it("normalizes a company domain into a stable slug", () => {
    expect(companySlugFromDomain("https://www.Cartesia.ai/about")).toBe("cartesia");
  });
});

describe("canonicalDomain", () => {
  it("normalizes a URL into a bare lowercase domain", () => {
    expect(canonicalDomain("https://www.Cartesia.ai/about")).toBe("cartesia.ai");
  });
});
