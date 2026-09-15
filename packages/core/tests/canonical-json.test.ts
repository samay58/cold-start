import { describe, expect, it } from "vitest";
import { canonicalJsonString, canonicalJsonValue } from "../src/canonical-json";

describe("canonicalJsonString", () => {
  it("sorts keys by code unit, not locale", () => {
    expect(canonicalJsonString({ b: 1, B: 2, a: 3, _x: 4 })).toBe('{"B":2,"_x":4,"a":3,"b":1}');
  });

  it("produces the same string regardless of insertion order", () => {
    const first = canonicalJsonString({ a: 1, b: 2, c: 3 });
    const second = canonicalJsonString({ c: 3, a: 1, b: 2 });
    expect(first).toBe(second);
  });

  it("keeps array order", () => {
    expect(canonicalJsonString([3, 1, 2])).toBe("[3,1,2]");
  });

  it("drops undefined object values", () => {
    expect(canonicalJsonString({ a: 1, b: undefined })).toBe('{"a":1}');
  });
});

describe("canonicalJsonValue", () => {
  it("throws on non-finite numbers", () => {
    expect(() => canonicalJsonValue(Number.NaN)).toThrow("canonical JSON input contains a non-finite number");
  });

  it("throws on unsupported types", () => {
    expect(() => canonicalJsonValue(() => {})).toThrow("canonical JSON input contains unsupported type: function");
  });
});
