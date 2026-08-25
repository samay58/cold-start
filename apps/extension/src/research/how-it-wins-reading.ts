// The crown's late arrival. The How it wins read runs in the background after the analysis run
// settles, so the card the panel already holds is the right card with one field still missing.
// This module owns the wait: the backoff schedule, the poll that watches for the read to land,
// and the context that carries the waiting state past CompanyArc and the research panel down to
// the crown, which is the only surface that renders it.
//
// It polls the card endpoint alone. The run's status endpoint would answer sooner but costs a
// second request per tick for a fact the card itself carries.
import { createContext, useContext, useEffect, useRef, useState } from "react";
import type { ColdStartCard } from "@cold-start/core";

// Fast enough that a read landing at the low end of its one-to-four-minute window is on screen
// within a few seconds, then slack enough that a long one costs a handful of requests.
const HOW_IT_WINS_POLL_DELAYS_MS = [8_000, 12_000, 20_000, 30_000, 45_000];
const HOW_IT_WINS_POLL_STEADY_MS = 60_000;

// Past this the wait is over whatever the background function is doing, and the crown drops back
// to showing nothing rather than waiting on screen forever.
export const HOW_IT_WINS_POLL_WINDOW_MS = 8 * 60 * 1000;

export function howItWinsPollDelayMs(attempt: number): number {
  return HOW_IT_WINS_POLL_DELAYS_MS[attempt] ?? HOW_IT_WINS_POLL_STEADY_MS;
}

const HowItWinsReadingContext = createContext(false);

export const HowItWinsReadingProvider = HowItWinsReadingContext.Provider;

export function useHowItWinsReading(): boolean {
  return useContext(HowItWinsReadingContext);
}

export type HowItWinsCardFetch = (signal: AbortSignal) => Promise<ColdStartCard>;

export function useHowItWinsReadPoll({
  pending,
  pollKey,
  fetchCard,
  onCard
}: {
  pending: boolean;
  // The domain the wait belongs to. A new one starts its own wait and clears a spent one.
  pollKey: string | null;
  fetchCard: HowItWinsCardFetch | null;
  onCard: (card: ColdStartCard) => void;
}): boolean {
  const [spentKey, setSpentKey] = useState<string | null>(null);
  // Both callbacks are rebuilt every render by their caller. Holding them in refs keeps the
  // effect below keyed on the wait itself, so a re-render cannot restart the backoff.
  const fetchRef = useRef(fetchCard);
  const onCardRef = useRef(onCard);
  fetchRef.current = fetchCard;
  onCardRef.current = onCard;

  const waiting = pending && pollKey !== null && spentKey !== pollKey;

  // A spent wait belongs to the read that ran out of window, not to the domain. Clearing it the
  // moment nothing is pending lets the next run on the same domain wait again.
  useEffect(() => {
    if (!pending && spentKey !== null) {
      setSpentKey(null);
    }
  }, [pending, spentKey]);

  useEffect(() => {
    if (!waiting || pollKey === null) {
      return undefined;
    }

    const controller = new AbortController();
    const startedAt = Date.now();
    let timer: ReturnType<typeof setTimeout> | null = null;
    let attempt = 0;
    let stopped = false;

    function schedule() {
      if (stopped) {
        return;
      }
      const delay = howItWinsPollDelayMs(attempt);
      // The window is a wall, not a target: a poll that would land past it is not worth sending,
      // so the wait ends here instead of one delay late.
      if (Date.now() - startedAt + delay > HOW_IT_WINS_POLL_WINDOW_MS) {
        setSpentKey(pollKey);
        return;
      }
      attempt += 1;
      timer = setTimeout(() => {
        void tick();
      }, delay);
    }

    async function tick() {
      timer = null;
      const fetchOne = fetchRef.current;
      if (stopped || !fetchOne) {
        return;
      }
      try {
        const card = await fetchOne(controller.signal);
        if (stopped) {
          return;
        }
        // Only a card that carries the read is worth handing back. Anything else is the card
        // the panel already shows, and replacing it would rewrite the cache for nothing.
        if (card.synthesis?.howItWins) {
          onCardRef.current(card);
          return;
        }
      } catch {
        // A refused or aborted fetch says nothing about the read. Keep waiting on the schedule.
      }
      schedule();
    }

    schedule();

    return () => {
      stopped = true;
      if (timer !== null) {
        clearTimeout(timer);
      }
      controller.abort();
    };
  }, [pollKey, waiting]);

  return waiting;
}
