import { describe, expect, it } from "vitest";
import {
  sourceTargetAliasesForDomain,
  sourceTargetContextTermsForDomain,
  targetHostMatchesDomain
} from "../src/source-target";

describe("sourceTargetAliasesForDomain", () => {
  it("emits the domain, root, and suffix-expanded company name", () => {
    const aliases = sourceTargetAliasesForDomain("notablehealth.com");
    expect(aliases).toContain("notablehealth.com");
    expect(aliases).toContain("notablehealth");
    expect(aliases).toContain("Notable Health");
    expect(aliases).toContain("Notable");
  });

  it("includes a provided company name", () => {
    expect(sourceTargetAliasesForDomain("warp.dev", "Warp")).toContain("Warp");
  });

  it("splits a hyphenated root into a title-cased alias", () => {
    expect(sourceTargetAliasesForDomain("my-startup.com")).toContain("My Startup");
  });

  it("does not emit a bare generic stem that would match unrelated text", () => {
    const aliases = sourceTargetAliasesForDomain("globaltech.com");
    expect(aliases).toContain("Global Tech");
    expect(aliases).not.toContain("Global");
  });
});

describe("sourceTargetContextTermsForDomain", () => {
  it("returns the corroborating terms for the matched suffix", () => {
    expect(sourceTargetContextTermsForDomain("notablehealth.com")).toEqual(
      expect.arrayContaining(["health", "healthcare"])
    );
  });

  it("returns nothing when no known suffix matches", () => {
    expect(sourceTargetContextTermsForDomain("warp.dev")).toEqual([]);
  });
});

describe("targetHostMatchesDomain", () => {
  it("matches the domain, its subdomains, and a www prefix", () => {
    expect(targetHostMatchesDomain("notablehealth.com", "notablehealth.com")).toBe(true);
    expect(targetHostMatchesDomain("blog.notablehealth.com", "notablehealth.com")).toBe(true);
    expect(targetHostMatchesDomain("www.notablehealth.com", "notablehealth.com")).toBe(true);
  });

  it("does not match a different host or a missing domain", () => {
    expect(targetHostMatchesDomain("notablehealthcare.io", "notablehealth.com")).toBe(false);
    expect(targetHostMatchesDomain("notablehealth.com", null)).toBe(false);
  });
});
