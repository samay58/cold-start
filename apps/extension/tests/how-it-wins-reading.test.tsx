// @vitest-environment jsdom

import type { ColdStartCard, HowItWinsJobStatusEnvelope, HowItWinsJobSummary } from "@cold-start/core";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  HOW_IT_WINS_POLL_WINDOW_MS,
  howItWinsPollDelayMs,
  useHowItWinsJobStatus,
  type HowItWinsCardFetch,
  type HowItWinsRetry,
  type HowItWinsStatusFetch
} from "../src/research/how-it-wins-reading";
import { filedHowItWins, minimalWarpCard } from "./lens-card-fixtures";

const SYNTHESIS = {
  whyItMatters: { text: "Warp has a developer workflow wedge [c1].", citationIds: ["c1"] },
  bullCase: [],
  bearCase: [],
  openQuestions: [{ question: "Can this reach team budgets?", category: "buyer_budget" as const }]
};

const readCard: ColdStartCard = minimalWarpCard({
  synthesis: { ...SYNTHESIS, howItWins: filedHowItWins() }
});

function job(
  status: HowItWinsJobSummary["status"],
  overrides: Partial<HowItWinsJobSummary> = {}
): HowItWinsJobSummary {
  return {
    id: "10000000-0000-4000-8000-000000000001",
    status,
    stage: status === "queued" ? "queued" : status === "succeeded" ? "complete" : "judge_initial",
    reasonCode: status === "failed" ? "structured_output" : null,
    canRetry: status === "failed",
    updatedAt: "2026-09-14T20:00:00.000Z",
    ...overrides
  };
}

type ProbeProps = {
  enabled?: boolean;
  scopeKey: string | null;
  fetchStatus: HowItWinsStatusFetch | null;
  retryJob?: HowItWinsRetry | null;
  fetchCard?: HowItWinsCardFetch | null;
  onCard?: (card: ColdStartCard) => void;
};

function Probe({
  enabled = true,
  scopeKey,
  fetchStatus,
  retryJob = null,
  fetchCard = null,
  onCard = () => undefined
}: ProbeProps) {
  const view = useHowItWinsJobStatus({ enabled, scopeKey, fetchStatus, retryJob, fetchCard, onCard });
  return (
    <div data-job-id={view.job?.id ?? ""} data-phase={view.phase}>
      <span>{view.detail}</span>
      <button onClick={view.checkAgain} type="button">Check</button>
      <button disabled={view.actionPending} onClick={view.retry} type="button">Retry</button>
    </div>
  );
}

function mountProbe(initial: ProbeProps) {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  return {
    phase() {
      return container.querySelector("div")?.getAttribute("data-phase") ?? null;
    },
    jobId() {
      return container.querySelector("div")?.getAttribute("data-job-id") ?? null;
    },
    text() {
      return container.textContent ?? "";
    },
    async click(label: "Check" | "Retry") {
      const button = [...container.querySelectorAll("button")].find((candidate) => candidate.textContent === label);
      await act(async () => button?.click());
    },
    async render(props: ProbeProps) {
      await act(async () => root.render(<Probe {...props} />));
    },
    async start() {
      await act(async () => root.render(<Probe {...initial} />));
    },
    async tick(ms: number) {
      await act(async () => vi.advanceTimersByTimeAsync(ms));
    },
    async unmount() {
      await act(async () => root.unmount());
      container.remove();
    }
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((next) => {
    resolve = next;
  });
  return { promise, resolve };
}

describe("howItWinsPollDelayMs", () => {
  it("opens fast, then settles onto a minute", () => {
    expect([0, 1, 2, 3, 4].map(howItWinsPollDelayMs)).toEqual([8_000, 12_000, 20_000, 30_000, 45_000]);
    expect(howItWinsPollDelayMs(5)).toBe(60_000);
  });
});

describe("useHowItWinsJobStatus", () => {
  beforeEach(() => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true;
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("does not read status before a saved Investor Lens exists", async () => {
    const fetchStatus = vi.fn<HowItWinsStatusFetch>();
    const probe = mountProbe({ enabled: false, scopeKey: "warp.dev", fetchStatus });
    await probe.start();
    expect(probe.phase()).toBe("idle");
    expect(fetchStatus).not.toHaveBeenCalled();
    await probe.unmount();
  });

  it("loads persisted failure state when the panel opens", async () => {
    const failed = job("failed", { reasonCode: "deadline_expired", canRetry: true });
    const fetchStatus = vi.fn(async (): Promise<HowItWinsJobStatusEnvelope> => ({ job: failed }));
    const probe = mountProbe({ scopeKey: "warp.dev", fetchStatus });
    await probe.start();
    expect(probe.phase()).toBe("failed");
    expect(probe.jobId()).toBe(failed.id);
    expect(probe.text()).toContain("The read ran out of time.");
    await probe.unmount();
  });

  it("follows a short admission gap from no job through queued to success", async () => {
    const responses: HowItWinsJobStatusEnvelope[] = [
      { job: null },
      { job: job("queued") },
      { job: job("succeeded", { stage: "complete", outcome: "read", updatedAt: "2026-09-14T20:01:00.000Z" }) }
    ];
    const fetchStatus = vi.fn(async () => responses.shift() ?? { job: null });
    const fetchCard = vi.fn(async () => readCard);
    const onCard = vi.fn();
    const probe = mountProbe({ scopeKey: "warp.dev", fetchStatus, fetchCard, onCard });
    await probe.start();

    expect(probe.phase()).toBe("idle");
    expect(fetchStatus).toHaveBeenCalledTimes(1);
    await probe.tick(8_000);
    expect(probe.phase()).toBe("reading");
    await probe.tick(12_000);
    expect(probe.phase()).toBe("succeeded");
    expect(fetchStatus).toHaveBeenCalledTimes(3);
    expect(fetchCard).toHaveBeenCalledTimes(1);
    expect(onCard).toHaveBeenCalledWith(readCard);
    await probe.unmount();
  });

  it("stops all-null admission polling while leaving the crown at rest", async () => {
    const fetchStatus = vi.fn(async (): Promise<HowItWinsJobStatusEnvelope> => ({ job: null }));
    const fetchCard = vi.fn<HowItWinsCardFetch>();
    const probe = mountProbe({ scopeKey: "warp.dev", fetchStatus, fetchCard });
    await probe.start();

    expect(probe.phase()).toBe("idle");
    await probe.tick(40_000);
    expect(fetchStatus).toHaveBeenCalledTimes(4);
    expect(probe.phase()).toBe("idle");
    await probe.tick(60_000);
    expect(fetchStatus).toHaveBeenCalledTimes(4);
    expect(fetchCard).not.toHaveBeenCalled();
    await probe.unmount();
  });

  it("polls a saved job and refreshes the card after success", async () => {
    const responses = [
      { job: job("running") },
      { job: job("succeeded", { stage: "complete", outcome: "read", updatedAt: "2026-09-14T20:01:00.000Z" }) }
    ];
    const fetchStatus = vi.fn(async () => responses.shift() ?? responses[0]!);
    const fetchCard = vi.fn(async () => readCard);
    const onCard = vi.fn();
    const retryJob = vi.fn<HowItWinsRetry>();
    const probe = mountProbe({ scopeKey: "warp.dev", fetchStatus, fetchCard, onCard, retryJob });
    await probe.start();

    expect(probe.phase()).toBe("reading");
    expect(fetchStatus).toHaveBeenCalledTimes(1);
    expect(fetchCard).not.toHaveBeenCalled();
    expect(retryJob).not.toHaveBeenCalled();

    await probe.tick(8_000);
    expect(probe.phase()).toBe("succeeded");
    expect(fetchCard).toHaveBeenCalledTimes(1);
    expect(onCard).toHaveBeenCalledWith(readCard);
    expect(retryJob).not.toHaveBeenCalled();
    await probe.unmount();
  });

  it("lets Check again refetch a card that lagged behind a succeeded job", async () => {
    const succeeded = job("succeeded", { stage: "complete", outcome: "read" });
    const fetchStatus = vi.fn(async (): Promise<HowItWinsJobStatusEnvelope> => ({ job: succeeded }));
    const staleCard = minimalWarpCard({ synthesis: SYNTHESIS });
    const fetchCard = vi.fn(async () => fetchCard.mock.calls.length === 1 ? staleCard : readCard);
    const onCard = vi.fn();
    const probe = mountProbe({ scopeKey: "warp.dev", fetchStatus, fetchCard, onCard });
    await probe.start();

    expect(probe.phase()).toBe("unknown");
    expect(onCard).not.toHaveBeenCalled();
    await probe.click("Check");
    expect(fetchCard).toHaveBeenCalledTimes(2);
    expect(onCard).toHaveBeenCalledWith(readCard);
    await probe.unmount();
  });

  it("ends an unconfirmed polling window as unknown and checks again without retrying", async () => {
    const fetchStatus = vi.fn(async (): Promise<HowItWinsJobStatusEnvelope> => ({ job: job("running") }));
    const retryJob = vi.fn<HowItWinsRetry>();
    const probe = mountProbe({ scopeKey: "warp.dev", fetchStatus, retryJob });
    await probe.start();
    await probe.tick(HOW_IT_WINS_POLL_WINDOW_MS);
    expect(probe.phase()).toBe("unknown");
    const statusCalls = fetchStatus.mock.calls.length;

    await probe.click("Check");
    expect(fetchStatus.mock.calls.length).toBe(statusCalls + 1);
    expect(retryJob).not.toHaveBeenCalled();
    await probe.unmount();
  });

  it("admits one retry when the button is clicked twice", async () => {
    const retryResponse = deferred<HowItWinsJobStatusEnvelope>();
    const failed = job("failed", { canRetry: true });
    const fetchStatus = vi.fn(async (): Promise<HowItWinsJobStatusEnvelope> => ({ job: failed }));
    const retryJob = vi.fn<HowItWinsRetry>(() => retryResponse.promise);
    const probe = mountProbe({ scopeKey: "warp.dev", fetchStatus, retryJob });
    await probe.start();

    await act(async () => {
      const buttons = [...document.querySelectorAll<HTMLButtonElement>("button")]
        .filter((button) => button.textContent === "Retry");
      buttons[0]?.click();
      buttons[0]?.click();
    });
    expect(retryJob).toHaveBeenCalledTimes(1);
    expect(retryJob.mock.calls[0]?.[0]).toBe(failed.id);
    expect(retryJob.mock.calls[0]?.[1]).toMatch(/^[0-9a-f-]{36}$/);

    await act(async () => retryResponse.resolve({ job: job("queued", { canRetry: false }) }));
    await probe.unmount();
  });

  it("checks saved status after a lost retry response without submitting again", async () => {
    const fetchStatus = vi.fn(async (): Promise<HowItWinsJobStatusEnvelope> => ({ job: job("failed", { canRetry: true }) }));
    const retryJob = vi.fn<HowItWinsRetry>(async () => { throw new TypeError("Network response lost"); });
    const probe = mountProbe({ scopeKey: "warp.dev", fetchStatus, retryJob });
    await probe.start();
    await probe.click("Retry");
    expect(probe.phase()).toBe("unknown");
    expect(probe.text()).toContain("The retry could not be confirmed.");
    fetchStatus.mockResolvedValue({ job: job("running", { canRetry: false }) });
    await probe.click("Check");
    expect(probe.phase()).toBe("reading");
    expect(retryJob).toHaveBeenCalledTimes(1);
    expect(fetchStatus).toHaveBeenCalledTimes(2);
    await probe.unmount();
  });

  it("ignores a late response after navigation", async () => {
    const oldResponse = deferred<HowItWinsJobStatusEnvelope>();
    const failedNewJob = job("failed", {
      id: "20000000-0000-4000-8000-000000000002",
      canRetry: false,
      updatedAt: "2026-09-14T20:02:00.000Z"
    });
    const fetchOld = vi.fn(() => oldResponse.promise);
    const fetchNew = vi.fn(async (): Promise<HowItWinsJobStatusEnvelope> => ({ job: failedNewJob }));
    const probe = mountProbe({ scopeKey: "warp.dev", fetchStatus: fetchOld });
    await probe.start();
    expect(probe.phase()).toBe("checking");

    await probe.render({ scopeKey: "exa.ai", fetchStatus: fetchNew });
    expect(probe.phase()).toBe("failed");
    expect(probe.jobId()).toBe(failedNewJob.id);

    await act(async () => oldResponse.resolve({ job: job("succeeded", { outcome: "read" }) }));
    expect(probe.phase()).toBe("failed");
    expect(probe.jobId()).toBe(failedNewJob.id);
    await probe.unmount();
  });

  it("accepts a newer job admitted elsewhere and ignores an older follow-up", async () => {
    const first = job("running", { updatedAt: "2026-09-14T20:00:00.000Z" });
    const newer = job("running", {
      id: "30000000-0000-4000-8000-000000000003",
      updatedAt: "2026-09-14T20:02:00.000Z"
    });
    const older = job("running", {
      id: first.id,
      updatedAt: "2026-09-14T20:01:00.000Z"
    });
    const responses = [{ job: first }, { job: newer }, { job: older }];
    const fetchStatus = vi.fn(async () => responses.shift() ?? { job: newer });
    const probe = mountProbe({ scopeKey: "warp.dev", fetchStatus });
    await probe.start();
    await probe.tick(8_000);
    expect(probe.jobId()).toBe(newer.id);
    await probe.tick(12_000);
    expect(probe.phase()).toBe("reading");
    expect(probe.jobId()).toBe(newer.id);
    await probe.unmount();
  });

  it("marks an old server as unknown without calling the retry route", async () => {
    const { ApiError } = await import("../src/shared/extension-config");
    const fetchStatus = vi.fn(async () => {
      throw new ApiError("request failed with 404", 404);
    });
    const retryJob = vi.fn<HowItWinsRetry>();
    const probe = mountProbe({ scopeKey: "warp.dev", fetchStatus, retryJob });
    await probe.start();
    expect(probe.phase()).toBe("unknown");
    expect(probe.text()).toContain("This API does not report saved progress yet.");
    expect(retryJob).not.toHaveBeenCalled();
    await probe.unmount();
  });
});
