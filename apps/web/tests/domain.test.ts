import { describe, expect, it } from "vitest";

import { canonicalCompanyDomain } from "../src/lib/domain";

describe("canonicalCompanyDomain", () => {
  it("accepts and canonicalizes company domains", () => {
    expect(canonicalCompanyDomain("https://www.cartesia.ai/path")).toBe("cartesia.ai");
    expect(canonicalCompanyDomain(" Exa.AI ")).toBe("exa.ai");
    expect(canonicalCompanyDomain("subdomain.example.co.uk")).toBe("subdomain.example.co.uk");
  });

  it.each([
    "",
    "localhost",
    "http://localhost:3000",
    "127.0.0.1",
    "192.168.0.1",
    "https://[::1]/",
    "cartesia",
    "company.local",
    "company.internal",
    "company.test",
    "company.invalid",
    "company.localhost",
    "a".repeat(254) + ".com",
    "foo_bar.com",
    "-bad.com",
    "bad-.com",
    "bad..com",
    ".bad.com",
    "bad.com.",
    `${"a".repeat(64)}.com`
  ])("rejects non-public domain input %s", (input) => {
    expect(() => canonicalCompanyDomain(input)).toThrow("domain is invalid");
  });

  it("rejects non-string input without stringifying it", () => {
    expect(() => canonicalCompanyDomain({ domain: "cartesia.ai" })).toThrow("domain is required");
  });
});
