import { describe, expect, it } from "vitest";
import { AGED_PROFILE_THRESHOLD_DAYS, isAgedProfile } from "../src/card-age";

describe("isAgedProfile", () => {
  it("flags past the threshold, not before", () => {
    const now = new Date("2026-08-11T00:00:00Z");
    expect(isAgedProfile("2026-08-01T00:00:00Z", now)).toBe(false); // 10 days
    expect(isAgedProfile("2026-07-20T00:00:00Z", now)).toBe(true); // 22 days
    expect(AGED_PROFILE_THRESHOLD_DAYS).toBe(14);
  });

  it("sits exactly on the threshold without flagging", () => {
    const now = new Date("2026-08-11T00:00:00Z");
    expect(isAgedProfile("2026-07-28T00:00:00Z", now)).toBe(false); // exactly 14 days
  });

  it("never flags invalid input", () => {
    const now = new Date("2026-08-11T00:00:00Z");
    expect(isAgedProfile("not a date", now)).toBe(false);
    expect(isAgedProfile("", now)).toBe(false);
  });
});
