import { describe, expect, it } from "vitest";
import {
  howItWinsBudgetMicrodollars,
  howItWinsCallReservation,
  howItWinsRequestDeadline
} from "../src/inngest/how-it-wins-budget";

describe("How it wins paid-call bounds", () => {
  it("rejects absent, ambiguous, unsafe, and excessive dollar caps", () => {
    for (const value of ["", "1e3", "-1", "NaN", "0", "10.000001", "1.0000001"]) {
      expect(() => howItWinsBudgetMicrodollars(value)).toThrow("authentication_configuration");
    }
    expect(howItWinsBudgetMicrodollars("5")).toBe(5_000_000);
    expect(howItWinsBudgetMicrodollars("0.000001")).toBe(1);
  });

  it("reserves output plus byte-bounded input and protocol overhead at maximum rates", () => {
    const input = { evidence: "Example" };
    expect(howItWinsCallReservation({ model: "claude-opus-5", input, maxOutputTokens: 50_000 }))
      .toBe((Buffer.byteLength(JSON.stringify(input)) + 4096) * 10 + 50_000 * 25);
    expect(() => howItWinsCallReservation({ model: "unknown/model", input, maxOutputTokens: 1 }))
      .toThrow("authentication_configuration");
    expect(() => howItWinsCallReservation({ model: "claude-opus-5", input: "x".repeat(512 * 1024), maxOutputTokens: 1 }))
      .toThrow("input_limit");
  });

  it("accepts the exact input and output ceilings, then rejects the next unit", () => {
    const exactInput = "x".repeat(512 * 1024 - 2);
    expect(Buffer.byteLength(JSON.stringify(exactInput))).toBe(512 * 1024);
    expect(howItWinsCallReservation({
      model: "claude-opus-5",
      input: exactInput,
      maxOutputTokens: 50_000
    })).toBeGreaterThan(0);
    expect(() => howItWinsCallReservation({
      model: "claude-opus-5",
      input: `${exactInput}x`,
      maxOutputTokens: 50_000
    })).toThrow("input_limit");
    for (const maxOutputTokens of [0, 50_001, 1.5, Number.NaN]) {
      expect(() => howItWinsCallReservation({
        model: "claude-opus-5",
        input: {},
        maxOutputTokens
      })).toThrow("authentication_configuration");
    }
  });

  it("leaves settlement time and never extends the persisted deadline", () => {
    expect(howItWinsRequestDeadline(new Date(600_000), 0)).toEqual({ timeout: 240_000, deadlineAt: 240_000 });
    expect(howItWinsRequestDeadline(new Date(30_000), 0)).toEqual({ timeout: 15_000, deadlineAt: 15_000 });
    expect(howItWinsRequestDeadline(new Date(600_000), 0, 60_000).timeout).toBe(60_000);
    expect(() => howItWinsRequestDeadline(new Date(NaN), 0)).toThrow("authentication_configuration");
    expect(() => howItWinsRequestDeadline(new Date(30_000), 0, NaN)).toThrow("authentication_configuration");
    expect(() => howItWinsRequestDeadline(new Date(30_000), NaN)).toThrow("authentication_configuration");
    expect(() => howItWinsRequestDeadline(new Date(15_000), 0)).toThrow("deadline_expired");
  });
});
