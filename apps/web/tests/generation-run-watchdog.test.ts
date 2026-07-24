import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  deadGenerationRunTarget: vi.fn(),
  findGenerationRunById: vi.fn(),
  findResearchRunEventsByRunId: vi.fn(),
  retireGenerationRunById: vi.fn(),
  runProducedCardEvent: vi.fn(),
  settleAlphaRunRequest: vi.fn()
}));

vi.mock("@cold-start/db", () => ({
  deadGenerationRunTarget: mocks.deadGenerationRunTarget,
  findGenerationRunById: mocks.findGenerationRunById,
  findResearchRunEventsByRunId: mocks.findResearchRunEventsByRunId,
  retireGenerationRunById: mocks.retireGenerationRunById,
  runProducedCardEvent: mocks.runProducedCardEvent,
  settleAlphaRunRequest: mocks.settleAlphaRunRequest
}));

import { retireDeadGenerationRun } from "../src/lib/generation-run-watchdog";

const db = { kind: "db" } as never;
const run = {
  id: "40000000-0000-4000-8000-000000000001",
  slug: "cartesia",
  domain: "cartesia.ai",
  mode: "basics" as const,
  jobKind: "basics",
  status: "running" as const,
  error: null,
  costUsd: "0.03",
  startedAt: new Date("2026-07-24T12:00:00.000Z"),
  completedAt: null
};

describe("dead generation run settlement", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.deadGenerationRunTarget.mockReturnValue("failed");
    mocks.findResearchRunEventsByRunId.mockResolvedValue([]);
    mocks.runProducedCardEvent.mockResolvedValue(false);
  });

  it("retires a queued run that nothing ever picked up", async () => {
    const queued = { ...run, status: "queued" as const };
    mocks.settleAlphaRunRequest.mockResolvedValue(null);
    mocks.retireGenerationRunById.mockResolvedValue({ ...queued, status: "failed" as const });

    await retireDeadGenerationRun(db, queued);

    expect(mocks.retireGenerationRunById).toHaveBeenCalledWith(db, { id: run.id, target: "failed" });
  });

  it("retires as complete when the card event is older than the event tail it was handed", async () => {
    mocks.runProducedCardEvent.mockResolvedValue(true);
    mocks.settleAlphaRunRequest.mockResolvedValue(null);
    mocks.retireGenerationRunById.mockResolvedValue({ ...run, status: "complete" as const });

    await retireDeadGenerationRun(db, run);

    expect(mocks.runProducedCardEvent).toHaveBeenCalledWith(db, run.id);
    expect(mocks.retireGenerationRunById).toHaveBeenCalledWith(db, { id: run.id, target: "complete" });
  });

  it("falls back to the standalone retirement when the alpha request was already settled", async () => {
    mocks.settleAlphaRunRequest.mockResolvedValue({
      requestId: "request-1",
      generationRunId: run.id,
      outcome: "watchdog_retired",
      failureCode: "timeout",
      settledAt: new Date(),
      refunded: true,
      applied: false
    });
    mocks.retireGenerationRunById.mockResolvedValue(null);

    await retireDeadGenerationRun(db, run);

    expect(mocks.findGenerationRunById).not.toHaveBeenCalled();
    expect(mocks.retireGenerationRunById).toHaveBeenCalledWith(db, { id: run.id, target: "failed" });
  });

  it("settles a charged alpha run atomically before any standalone retirement", async () => {
    const settledRun = { ...run, status: "failed" as const };
    mocks.settleAlphaRunRequest.mockResolvedValue({
      requestId: "request-1",
      generationRunId: run.id,
      outcome: "watchdog_retired",
      failureCode: "timeout",
      settledAt: new Date(),
      refunded: true,
      applied: true
    });
    mocks.findGenerationRunById.mockResolvedValue(settledRun);

    await expect(retireDeadGenerationRun(db, run)).resolves.toEqual({
      run: settledRun,
      events: []
    });
    expect(mocks.settleAlphaRunRequest).toHaveBeenCalledWith(
      db,
      expect.objectContaining({
        generationRunId: run.id,
        outcome: "watchdog_retired",
        failureCode: "timeout"
      })
    );
    expect(mocks.retireGenerationRunById).not.toHaveBeenCalled();
  });

  it("uses the existing retirement path when no alpha debit owns the run", async () => {
    const retiredRun = { ...run, status: "failed" as const };
    mocks.settleAlphaRunRequest.mockResolvedValue(null);
    mocks.retireGenerationRunById.mockResolvedValue(retiredRun);

    await expect(retireDeadGenerationRun(db, run)).resolves.toEqual({
      run: retiredRun,
      events: []
    });
    expect(mocks.retireGenerationRunById).toHaveBeenCalledWith(db, {
      id: run.id,
      target: "failed"
    });
  });
});
