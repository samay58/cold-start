// @vitest-environment jsdom

import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ColdStartCard } from "@cold-start/core";
import {
  HOW_IT_WINS_POLL_WINDOW_MS,
  howItWinsPollDelayMs,
  useHowItWinsReadPoll
} from "../src/research/how-it-wins-reading";
import { filedHowItWins, minimalWarpCard } from "./lens-card-fixtures";

const SYNTHESIS = {
  whyItMatters: { text: "Warp has a developer workflow wedge [c1].", citationIds: ["c1"] },
  bullCase: [],
  bearCase: [],
  openQuestions: [{ question: "Can this reach team budgets?", category: "buyer_budget" as const }]
};

const waitingCard: ColdStartCard = minimalWarpCard({ synthesis: SYNTHESIS });
const readCard: ColdStartCard = minimalWarpCard({
  synthesis: { ...SYNTHESIS, howItWins: filedHowItWins() }
});

type ProbeProps = {
  pending: boolean;
  pollKey: string | null;
  fetchCard: ((signal: AbortSignal) => Promise<ColdStartCard>) | null;
  onCard: (card: ColdStartCard) => void;
};

function Probe(props: ProbeProps) {
  const reading = useHowItWinsReadPoll(props);
  return <span data-reading={reading ? "true" : "false"} />;
}

function mountProbe(initial: ProbeProps) {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  return {
    reading() {
      return container.querySelector("span")?.getAttribute("data-reading") ?? null;
    },
    async render(props: ProbeProps) {
      await act(async () => {
        root.render(<Probe {...props} />);
      });
    },
    async start() {
      await act(async () => {
        root.render(<Probe {...initial} />);
      });
    },
    async tick(ms: number) {
      await act(async () => {
        await vi.advanceTimersByTimeAsync(ms);
      });
    },
    async unmount() {
      await act(async () => root.unmount());
      container.remove();
    }
  };
}

describe("howItWinsPollDelayMs", () => {
  it("opens fast, then settles onto a minute", () => {
    expect([0, 1, 2, 3, 4].map(howItWinsPollDelayMs)).toEqual([8_000, 12_000, 20_000, 30_000, 45_000]);
    expect(howItWinsPollDelayMs(5)).toBe(60_000);
    expect(howItWinsPollDelayMs(40)).toBe(60_000);
  });
});

describe("useHowItWinsReadPoll", () => {
  beforeEach(() => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true;
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("waits on the backoff and hands back the card the moment the read lands", async () => {
    const seen: ColdStartCard[] = [];
    const fetchCard = vi.fn(async () => (fetchCard.mock.calls.length < 3 ? waitingCard : readCard));
    const probe = mountProbe({
      pending: true,
      pollKey: "warp.dev",
      fetchCard,
      onCard: (card) => seen.push(card)
    });
    await probe.start();
    expect(probe.reading()).toBe("true");
    expect(fetchCard).not.toHaveBeenCalled();

    await probe.tick(7_999);
    expect(fetchCard).not.toHaveBeenCalled();
    await probe.tick(1);
    expect(fetchCard).toHaveBeenCalledTimes(1);
    // A card that still carries no read is the one already on screen, so nothing is handed back.
    expect(seen).toHaveLength(0);

    await probe.tick(12_000);
    expect(fetchCard).toHaveBeenCalledTimes(2);
    await probe.tick(20_000);
    expect(fetchCard).toHaveBeenCalledTimes(3);
    expect(seen).toEqual([readCard]);

    // The wait is over: nothing more is fetched once the caller stops asking.
    await probe.render({ pending: false, pollKey: "warp.dev", fetchCard, onCard: (card) => seen.push(card) });
    await probe.tick(120_000);
    expect(fetchCard).toHaveBeenCalledTimes(3);
    expect(probe.reading()).toBe("false");
    await probe.unmount();
  });

  it("keeps waiting through a failed fetch", async () => {
    const fetchCard = vi.fn(async () => {
      if (fetchCard.mock.calls.length === 1) {
        throw new Error("network");
      }
      return waitingCard;
    });
    const probe = mountProbe({ pending: true, pollKey: "warp.dev", fetchCard, onCard: () => undefined });
    await probe.start();

    await probe.tick(8_000);
    expect(fetchCard).toHaveBeenCalledTimes(1);
    expect(probe.reading()).toBe("true");
    await probe.tick(12_000);
    expect(fetchCard).toHaveBeenCalledTimes(2);
    expect(probe.reading()).toBe("true");
    await probe.unmount();
  });

  it("gives the wait up after eight minutes and stops saying it is reading", async () => {
    const fetchCard = vi.fn(async () => waitingCard);
    const probe = mountProbe({ pending: true, pollKey: "warp.dev", fetchCard, onCard: () => undefined });
    await probe.start();

    await probe.tick(HOW_IT_WINS_POLL_WINDOW_MS);
    expect(probe.reading()).toBe("false");
    const calls = fetchCard.mock.calls.length;
    expect(calls).toBeGreaterThan(5);

    await probe.tick(300_000);
    expect(fetchCard).toHaveBeenCalledTimes(calls);
    await probe.unmount();
  });

  it("waits again on the same domain once the spent wait is cleared", async () => {
    const fetchCard = vi.fn(async () => waitingCard);
    const props = { pollKey: "warp.dev", fetchCard, onCard: () => undefined };
    const probe = mountProbe({ pending: true, ...props });
    await probe.start();
    await probe.tick(HOW_IT_WINS_POLL_WINDOW_MS);
    expect(probe.reading()).toBe("false");
    const spent = fetchCard.mock.calls.length;

    // A new run on the same domain: nothing pending for a beat, then a fresh read to wait on.
    await probe.render({ pending: false, ...props });
    await probe.render({ pending: true, ...props });
    expect(probe.reading()).toBe("true");
    await probe.tick(8_000);
    expect(fetchCard.mock.calls.length).toBe(spent + 1);
    await probe.unmount();
  });

  it("stops on unmount and starts over on a new domain", async () => {
    const fetchCard = vi.fn(async () => waitingCard);
    const probe = mountProbe({ pending: true, pollKey: "warp.dev", fetchCard, onCard: () => undefined });
    await probe.start();
    await probe.tick(8_000);
    expect(fetchCard).toHaveBeenCalledTimes(1);

    // A new domain restarts the schedule at its first delay rather than continuing the old one.
    await probe.render({ pending: true, pollKey: "exa.ai", fetchCard, onCard: () => undefined });
    await probe.tick(7_999);
    expect(fetchCard).toHaveBeenCalledTimes(1);
    await probe.tick(1);
    expect(fetchCard).toHaveBeenCalledTimes(2);

    await probe.unmount();
    await probe.tick(300_000);
    expect(fetchCard).toHaveBeenCalledTimes(2);
  });

  it("does nothing without a domain or a fetch", async () => {
    const fetchCard = vi.fn(async () => waitingCard);
    const noDomain = mountProbe({ pending: true, pollKey: null, fetchCard, onCard: () => undefined });
    await noDomain.start();
    expect(noDomain.reading()).toBe("false");
    await noDomain.tick(300_000);
    expect(fetchCard).not.toHaveBeenCalled();
    await noDomain.unmount();

    const noFetch = mountProbe({ pending: true, pollKey: "warp.dev", fetchCard: null, onCard: () => undefined });
    await noFetch.start();
    // The wait is still honest with no fetch wired: it says it is reading and simply never polls.
    expect(noFetch.reading()).toBe("true");
    await noFetch.tick(300_000);
    expect(fetchCard).not.toHaveBeenCalled();
    await noFetch.unmount();
  });
});
