import { describe, expect, it } from "vitest";
import { z } from "zod";

import { boundedErrorMessage, rawErrorDetail } from "../src/lib/errors";

// Operator surfaces (the run error column, event messages) get prose. A ZodError's .message
// is the JSON dump of its issue array; the varda failures stored that dump verbatim where a
// person reading the run log needed a sentence. The raw issues stay available for the trace
// through rawErrorDetail.
describe("boundedErrorMessage", () => {
  it("turns a validation error into a readable sentence", () => {
    const result = z
      .object({ marketStructureAndTiming: z.object({ profitPool: z.object({ text: z.string() }) }) })
      .safeParse({ marketStructureAndTiming: { profitPool: { text: null } } });
    if (result.success) throw new Error("expected a parse failure");

    const message = boundedErrorMessage(result.error);

    expect(message).toBe(
      "Validation failed at marketStructureAndTiming.profitPool.text: Expected string, received null"
    );
    expect(message).not.toContain("{");
  });

  it("counts additional issues instead of listing them", () => {
    const result = z
      .object({ a: z.string(), b: z.string(), c: z.string() })
      .safeParse({ a: null, b: null, c: null });
    if (result.success) throw new Error("expected a parse failure");

    expect(boundedErrorMessage(result.error)).toBe(
      "Validation failed at a: Expected string, received null (+2 more issues)"
    );
  });

  it("keeps plain error messages unchanged", () => {
    expect(boundedErrorMessage(new Error("plain failure"))).toBe("plain failure");
    expect(boundedErrorMessage("not an error")).toBe("unknown error");
  });
});

describe("rawErrorDetail", () => {
  it("returns the structured issues for a validation error", () => {
    const result = z.object({ text: z.string() }).safeParse({ text: null });
    if (result.success) throw new Error("expected a parse failure");

    expect(rawErrorDetail(result.error)).toEqual([
      expect.objectContaining({ path: ["text"], expected: "string", received: "null" })
    ]);
  });

  it("returns undefined for errors whose message already carries everything", () => {
    expect(rawErrorDetail(new Error("plain failure"))).toBeUndefined();
  });
});
