import { describe, expect, it } from "vitest";

import {
  assertJsonBytes,
  assertNonNegativeInteger,
  assertNonemptyString,
  assertPositiveInteger,
  assertSha256Hex,
  booleanFromSql,
  boundedString,
  dateFromSql,
  jsonRoundTrip,
  nonNegativeInteger,
  nullableBoundedString,
  nullableNonNegativeInteger,
  objectValue,
  safeIntegerFromSql
} from "../src/validation";

const HASH = "a".repeat(64);

describe("assertSha256Hex", () => {
  it("passes a lowercase 64-char hex digest", () => {
    expect(() => assertSha256Hex(HASH, "evidenceHash")).not.toThrow();
  });

  it("throws TypeError on a value that is not a lowercase SHA-256 hex digest", () => {
    expect(() => assertSha256Hex("not-a-hash", "evidenceHash")).toThrow(TypeError);
  });
});

describe("assertPositiveInteger", () => {
  it("passes a positive safe integer", () => {
    expect(() => assertPositiveInteger(1, "limit")).not.toThrow();
  });

  it("throws RangeError on zero", () => {
    expect(() => assertPositiveInteger(0, "limit")).toThrow(RangeError);
  });
});

describe("assertNonNegativeInteger", () => {
  it("passes zero", () => {
    expect(() => assertNonNegativeInteger(0, "profileLimit")).not.toThrow();
  });

  it("throws RangeError on a negative number", () => {
    expect(() => assertNonNegativeInteger(-1, "profileLimit")).toThrow(RangeError);
  });
});

describe("nonNegativeInteger", () => {
  it("returns the value after the assert passes", () => {
    expect(nonNegativeInteger(3, "retryCount")).toBe(3);
  });

  it("throws RangeError on a negative number", () => {
    expect(() => nonNegativeInteger(-3, "retryCount")).toThrow(RangeError);
  });
});

describe("nullableNonNegativeInteger", () => {
  it("returns null unchanged", () => {
    expect(nullableNonNegativeInteger(null, "durationMs")).toBeNull();
  });

  it("throws RangeError on a negative non-null number", () => {
    expect(() => nullableNonNegativeInteger(-1, "durationMs")).toThrow(RangeError);
  });
});

describe("assertNonemptyString", () => {
  it("passes a non-empty string within the max length", () => {
    expect(() => assertNonemptyString("slug", "slug", 120)).not.toThrow();
  });

  it("throws Error on an empty string", () => {
    expect(() => assertNonemptyString("   ", "slug", 120)).toThrow(Error);
  });
});

describe("assertJsonBytes", () => {
  it("passes a value under the byte limit", () => {
    expect(() => assertJsonBytes({ a: 1 }, 1_000, "checkpoint")).not.toThrow();
  });

  it("throws Error when the value exceeds the byte limit", () => {
    expect(() => assertJsonBytes({ a: "x".repeat(100) }, 10, "checkpoint")).toThrow(Error);
  });
});

describe("boundedString", () => {
  it("returns the value unchanged when under the max", () => {
    expect(boundedString("abc", 10)).toBe("abc");
  });

  it("truncates to the max length", () => {
    expect(boundedString("abcdef", 3)).toBe("abc");
  });
});

describe("nullableBoundedString", () => {
  it("returns null unchanged", () => {
    expect(nullableBoundedString(null, 10)).toBeNull();
  });

  it("truncates a non-null value to the max length", () => {
    expect(nullableBoundedString("abcdef", 3)).toBe("abc");
  });
});

describe("objectValue", () => {
  it("returns a plain object unchanged", () => {
    expect(objectValue({ a: 1 })).toEqual({ a: 1 });
  });

  it("returns null for an array", () => {
    expect(objectValue([1, 2])).toBeNull();
  });
});

describe("jsonRoundTrip", () => {
  it("round-trips a JSON-serializable value", () => {
    expect(jsonRoundTrip({ a: 1, b: "x" })).toEqual({ a: 1, b: "x" });
  });

  it("throws Error when the value is not JSON serializable", () => {
    expect(() => jsonRoundTrip(undefined)).toThrow(Error);
  });
});

describe("safeIntegerFromSql", () => {
  it("parses a numeric string", () => {
    expect(safeIntegerFromSql("42", "version")).toBe(42);
  });

  it("throws Error on a negative value", () => {
    expect(() => safeIntegerFromSql(-1, "version")).toThrow(Error);
  });
});

describe("dateFromSql", () => {
  it("parses a string timestamp", () => {
    expect(dateFromSql("2026-09-14T12:00:00.000Z").toISOString()).toBe("2026-09-14T12:00:00.000Z");
  });

  it("throws TypeError on undefined", () => {
    expect(() => dateFromSql(undefined)).toThrow(TypeError);
  });
});

describe("booleanFromSql", () => {
  it("treats the string \"t\" as true", () => {
    expect(booleanFromSql("t")).toBe(true);
  });

  it("treats an arbitrary string as false", () => {
    expect(booleanFromSql("f")).toBe(false);
  });
});
