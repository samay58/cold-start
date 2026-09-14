import { describe, expect, it } from "vitest";

import {
  ALPHA_RETENTION_DAYS,
  alphaRetentionPlan,
  pruneRetentionInBatches
} from "../src/index";

describe("alpha retention policy", () => {
  it("keeps How it wins as a fixed 90-day age window", () => {
    const now = new Date("2026-09-14T12:00:00.000Z");
    const plan = alphaRetentionPlan(now);

    expect(ALPHA_RETENTION_DAYS.howItWinsJudgments).toBe(90);
    expect(plan.howItWinsJudgmentsBefore.toISOString()).toBe("2026-06-16T12:00:00.000Z");
    expect(plan.accessRequestsBefore.toISOString()).toBe("2026-08-15T12:00:00.000Z");
    expect(plan.inviteAttemptsBefore.toISOString()).toBe("2026-09-13T12:00:00.000Z");
  });

  it("uses a caller-selected event boundary without changing fixed retention windows", () => {
    const now = new Date("2026-09-14T12:00:00.000Z");
    const eventsBefore = new Date("2026-08-01T00:00:00.000Z");
    const plan = alphaRetentionPlan(now, eventsBefore);

    expect(plan.eventsBefore).toBe(eventsBefore);
    expect(plan.howItWinsJudgmentsBefore.toISOString()).toBe("2026-06-16T12:00:00.000Z");
  });

  it("caps each repository pruner in bounded batches", async () => {
    const calls: Array<{ before: Date; limit: number }> = [];
    const result = await pruneRetentionInBatches(
      async (input) => {
        calls.push(input);
        return calls.length === 1 ? 3 : 1;
      },
      new Date("2026-06-16T12:00:00.000Z"),
      { batch: 3, maximum: 5 }
    );

    expect(calls.map((call) => call.limit)).toEqual([3, 2]);
    expect(result).toEqual({ deleted: 4, stoppedAtMax: false });
  });
});
