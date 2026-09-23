import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { howItWinsRefinementEnabled } from "../src/inngest/worker-env";

// The registered function is the durable job path and nothing else. What this pins is the one
// decision the registration still owns: which events reach the worker, and that a stale event
// with no execution contract version is refused before any database read.
const mocks = vi.hoisted(() => ({
  createDb: vi.fn(() => ({})),
  howItWinsV2Handler: vi.fn(async () => ({ jobId: "job-1", status: "succeeded" })),
  clearExpiredHowItWinsRecoveryPayloads: vi.fn(async () => 0),
  listHowItWinsDispatchCandidates: vi.fn(async () => []),
  listRecentlyTerminalHowItWinsJobs: vi.fn(async () => []),
  reconcileExpiredHowItWinsJobs: vi.fn(async () => []),
  dispatchHowItWinsJob: vi.fn(async () => true),
  recordHowItWinsJobOutcome: vi.fn(async () => undefined)
}));

vi.mock("@cold-start/db", async (importOriginal) => ({
  ...await importOriginal<typeof import("@cold-start/db")>(),
  createDb: mocks.createDb,
  clearExpiredHowItWinsRecoveryPayloads: mocks.clearExpiredHowItWinsRecoveryPayloads,
  listHowItWinsDispatchCandidates: mocks.listHowItWinsDispatchCandidates,
  listRecentlyTerminalHowItWinsJobs: mocks.listRecentlyTerminalHowItWinsJobs,
  reconcileExpiredHowItWinsJobs: mocks.reconcileExpiredHowItWinsJobs
}));

vi.mock("../src/inngest/how-it-wins-v2", () => ({
  howItWinsV2Handler: mocks.howItWinsV2Handler
}));

vi.mock("../src/inngest/how-it-wins-jobs", () => ({
  dispatchHowItWinsJob: mocks.dispatchHowItWinsJob,
  recordHowItWinsJobOutcome: mocks.recordHowItWinsJobOutcome
}));

const { howItWinsHandler, howItWinsReconcileHandler } = await import("../src/inngest/how-it-wins-function");

function context(data: Record<string, unknown>) {
  return {
    event: { id: "evt_how_it_wins", data },
    runId: "how-it-wins-run",
    step: { run: vi.fn(), sendEvent: vi.fn(), stepWarnings: [] }
  } as never;
}

describe("how-it-wins background function routing", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("hands a version-2 event to the durable job worker", async () => {
    const event = context({ jobId: "job-1", slug: "modal", executionContractVersion: 2 });

    await expect(howItWinsHandler(event)).resolves.toEqual({ jobId: "job-1", status: "succeeded" });
    expect(mocks.howItWinsV2Handler).toHaveBeenCalledTimes(1);
  });

  it("rejects an event with no execution contract version without reading the database", async () => {
    const event = context({ slug: "modal", domain: "modal.com", parentGenerationRunId: "generation-run-id" });

    await expect(howItWinsHandler(event)).resolves.toEqual({ status: "rejected" });
    expect(mocks.howItWinsV2Handler).not.toHaveBeenCalled();
    expect(mocks.createDb).not.toHaveBeenCalled();
  });
});

describe("howItWinsRefinementEnabled", () => {
  afterEach(() => {
    delete process.env.HOW_IT_WINS_REFINEMENT;
  });

  it("is on unless the env var is exactly \"off\"", () => {
    delete process.env.HOW_IT_WINS_REFINEMENT;
    expect(howItWinsRefinementEnabled()).toBe(true);

    process.env.HOW_IT_WINS_REFINEMENT = "off";
    expect(howItWinsRefinementEnabled()).toBe(false);

    process.env.HOW_IT_WINS_REFINEMENT = "not-a-real-value";
    expect(howItWinsRefinementEnabled()).toBe(true);
  });
});

describe("how-it-wins reconcile sweep", () => {
  function reconcileContext() {
    const names: string[] = [];
    return {
      names,
      context: {
        step: {
          run: vi.fn(async (name: string, fn: () => unknown) => {
            names.push(name);
            return fn();
          }),
          sendEvent: vi.fn(),
          stepWarnings: []
        }
      }
    };
  }

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.DATABASE_URL = "postgres://cold-start-test";
    delete process.env.HOW_IT_WINS_ENABLED;
    mocks.clearExpiredHowItWinsRecoveryPayloads.mockResolvedValue(0);
    mocks.listHowItWinsDispatchCandidates.mockResolvedValue([]);
    mocks.listRecentlyTerminalHowItWinsJobs.mockResolvedValue([]);
    mocks.reconcileExpiredHowItWinsJobs.mockResolvedValue([]);
    mocks.dispatchHowItWinsJob.mockResolvedValue(true);
  });

  it("expires, closes each settled trail, and resends in one step plus one per job", async () => {
    const expired = [{ id: "job-a" }, { id: "job-b" }];
    mocks.reconcileExpiredHowItWinsJobs.mockResolvedValue(expired as never);
    mocks.listHowItWinsDispatchCandidates.mockResolvedValue([
      { id: "job-c", inngestEventId: "how-it-wins-v2:job-c", slug: "modal" }
    ] as never);
    const { context, names } = reconcileContext();

    await expect(howItWinsReconcileHandler(context as never)).resolves.toEqual({ expired: 2, dispatched: 1 });

    expect(names).toEqual(["hiw-v2-reconcile", "hiw-v2-resend:job-c"]);
    expect(mocks.recordHowItWinsJobOutcome.mock.calls.map(([, input]) => (input as { job: { id: string } }).job.id))
      .toEqual(["job-a", "job-b"]);
    expect(mocks.clearExpiredHowItWinsRecoveryPayloads).toHaveBeenCalledTimes(1);
  });

  it("re-announces jobs that turned terminal in the last thirty minutes so a thrown tick cannot strand one", async () => {
    mocks.reconcileExpiredHowItWinsJobs.mockResolvedValue([{ id: "job-a" }] as never);
    mocks.listRecentlyTerminalHowItWinsJobs.mockResolvedValue([{ id: "job-z" }] as never);
    const { context } = reconcileContext();

    await expect(howItWinsReconcileHandler(context as never)).resolves.toEqual({ expired: 1, dispatched: 0 });

    const since = (mocks.listRecentlyTerminalHowItWinsJobs.mock.calls[0]?.[1] as { since: Date }).since;
    expect(Date.now() - since.getTime()).toBeGreaterThanOrEqual(30 * 60 * 1_000 - 1_000);
    expect(mocks.recordHowItWinsJobOutcome.mock.calls.map(([, input]) => (input as { job: { id: string } }).job.id))
      .toEqual(["job-a", "job-z"]);
    // Only the sweep's re-announce defers to an owner that already announced.
    expect(mocks.recordHowItWinsJobOutcome.mock.calls.map(([, input]) => (input as { reannounce?: boolean }).reannounce))
      .toEqual([undefined, true]);
  });

  it("still expires and closes trails when the flag is off, and lists no dispatch candidates", async () => {
    process.env.HOW_IT_WINS_ENABLED = "false";
    mocks.reconcileExpiredHowItWinsJobs.mockResolvedValue([{ id: "job-a" }] as never);
    const { context, names } = reconcileContext();

    await expect(howItWinsReconcileHandler(context as never)).resolves.toEqual({ expired: 1, dispatched: 0 });

    expect(names).toEqual(["hiw-v2-reconcile"]);
    expect(mocks.recordHowItWinsJobOutcome).toHaveBeenCalledTimes(1);
    expect(mocks.listHowItWinsDispatchCandidates).not.toHaveBeenCalled();
  });
});
