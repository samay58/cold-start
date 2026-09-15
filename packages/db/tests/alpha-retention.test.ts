import { describe, expect, it, vi } from "vitest";

vi.mock("../src/repositories/alpha", () => ({
  pruneAlphaEvents: vi.fn().mockResolvedValue(0),
  pruneAlphaInviteAttempts: vi.fn().mockResolvedValue(0)
}));
vi.mock("../src/repositories/access-requests", () => ({
  pruneHandledAccessRequests: vi.fn().mockResolvedValue(0)
}));
vi.mock("../src/repositories/how-it-wins-judgments", () => ({
  pruneHowItWinsJudgments: vi.fn().mockResolvedValue(0)
}));
vi.mock("../src/repositories/how-it-wins-jobs", () => ({
  pruneHowItWinsJobs: vi.fn()
}));

import { pruneHowItWinsJobs } from "../src/repositories/how-it-wins-jobs";
import {
  ALPHA_RETENTION_DAYS,
  alphaRetentionPlan,
  pruneAlphaRetention,
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

  it("keeps How it wins job diagnostics on the same fixed 90-day age window as judgments", () => {
    const now = new Date("2026-09-14T12:00:00.000Z");
    const plan = alphaRetentionPlan(now);

    expect(ALPHA_RETENTION_DAYS.howItWinsJobs).toBe(90);
    expect(plan.howItWinsJobsBefore.toISOString()).toBe("2026-06-16T12:00:00.000Z");
  });

  it("uses a caller-selected event boundary without changing fixed retention windows", () => {
    const now = new Date("2026-09-14T12:00:00.000Z");
    const eventsBefore = new Date("2026-08-01T00:00:00.000Z");
    const plan = alphaRetentionPlan(now, eventsBefore);

    expect(plan.eventsBefore).toBe(eventsBefore);
    expect(plan.howItWinsJudgmentsBefore.toISOString()).toBe("2026-06-16T12:00:00.000Z");
    expect(plan.howItWinsJobsBefore.toISOString()).toBe("2026-06-16T12:00:00.000Z");
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

  it("wires the howItWinsJobs kind through the same guarded batch path as the other kinds", async () => {
    const db = {} as Parameters<typeof pruneAlphaRetention>[0];
    const plan = alphaRetentionPlan(new Date("2026-09-14T12:00:00.000Z"));
    vi.mocked(pruneHowItWinsJobs).mockResolvedValue(1_000);

    const result = await pruneAlphaRetention(db, {
      plan,
      kinds: ["howItWinsJobs"],
      batch: 1_000,
      maximum: 1_000
    });

    expect(pruneHowItWinsJobs).toHaveBeenCalledWith(db, { before: plan.howItWinsJobsBefore, limit: 1_000 });
    expect(result.howItWinsJobs).toEqual({ deleted: 1_000, stoppedAtMax: true });
  });
});
