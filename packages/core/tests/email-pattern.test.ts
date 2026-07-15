import { describe, expect, it } from "vitest";
import { applyEmailPattern, deriveEmailPattern, isRoleAlias } from "../src/email-pattern";

describe("isRoleAlias", () => {
  it("flags shared inbox / automation local parts", () => {
    for (const local of ["support", "hello", "info", "contact", "hiring", "join", "no-reply", "github", "svc", "circleci", "team", "careers"]) {
      expect(isRoleAlias(local)).toBe(true);
    }
  });

  it("treats role prefixes with a boundary as aliases", () => {
    expect(isRoleAlias("support+github")).toBe(true);
    expect(isRoleAlias("svc-autorelease")).toBe(true);
  });

  it("does not flag human local parts", () => {
    for (const local of ["noah.tye", "charles", "cimhoff", "andy.chhuon", "guy.rotman"]) {
      expect(isRoleAlias(local)).toBe(false);
    }
  });
});

describe("deriveEmailPattern", () => {
  it("derives first.last", () => {
    expect(deriveEmailPattern([{ email: "noah.tye@x.ai", fullName: "Noah Tye" }])).toEqual({ pattern: "first.last", anchorCount: 1 });
  });

  it("derives first", () => {
    expect(deriveEmailPattern([{ email: "charles@x.com", fullName: "Charles Frye" }])).toEqual({ pattern: "first", anchorCount: 1 });
  });

  it("derives flast", () => {
    expect(deriveEmailPattern([{ email: "cimhoff@x.tech", fullName: "Chris Imhoff" }])).toEqual({ pattern: "flast", anchorCount: 1 });
  });

  it("ignores role-alias-only anchors", () => {
    expect(
      deriveEmailPattern([
        { email: "support@x.ai", fullName: null },
        { email: "hello@x.ai", fullName: null }
      ])
    ).toBeNull();
  });

  it("ignores anchors whose local part cannot be reconstructed from the name", () => {
    expect(deriveEmailPattern([{ email: "zeus@x.ai", fullName: "Noah Tye" }])).toBeNull();
  });

  it("takes the majority pattern across multiple anchors", () => {
    expect(
      deriveEmailPattern([
        { email: "noah.tye@x.ai", fullName: "Noah Tye" },
        { email: "adam.ling@x.ai", fullName: "Adam Ling" },
        { email: "charles@x.ai", fullName: "Charles Frye" }
      ])
    ).toEqual({ pattern: "first.last", anchorCount: 2 });
  });

  it("reports how many anchors agreed on the winning pattern", () => {
    expect(
      deriveEmailPattern([
        { email: "noah.tye@x.ai", fullName: "Noah Tye" },
        { email: "adam.ling@x.ai", fullName: "Adam Ling" },
        { email: "charles@x.ai", fullName: "Charles Frye" }
      ])
    ).toEqual({ pattern: "first.last", anchorCount: 2 });
  });
});

describe("applyEmailPattern", () => {
  it("builds first.last and folds diacritics + punctuation", () => {
    expect(applyEmailPattern("first.last", "María O'Neil", "x.ai")).toBe("maria.oneil@x.ai");
  });

  it("builds first", () => {
    expect(applyEmailPattern("first", "Charles Frye", "x.com")).toBe("charles@x.com");
  });

  it("builds flast", () => {
    expect(applyEmailPattern("flast", "Chris Imhoff", "x.tech")).toBe("cimhoff@x.tech");
  });

  it("returns null for a single-token name when the pattern needs a surname", () => {
    expect(applyEmailPattern("first.last", "Cher", "x.ai")).toBeNull();
  });

  it("uses the given name for the single-token 'first' pattern", () => {
    expect(applyEmailPattern("first", "Cher", "x.ai")).toBe("cher@x.ai");
  });
});
