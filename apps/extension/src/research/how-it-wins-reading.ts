import type {
  ColdStartCard,
  HowItWinsJobReasonCode,
  HowItWinsJobStatusEnvelope,
  HowItWinsJobSummary
} from "@cold-start/core";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState
} from "react";
import { ApiError } from "../shared/extension-config";

const HOW_IT_WINS_POLL_DELAYS_MS = [8_000, 12_000, 20_000, 30_000, 45_000];
const HOW_IT_WINS_POLL_STEADY_MS = 60_000;
const HOW_IT_WINS_ADMISSION_POLL_WINDOW_MS = 40_000;

export const HOW_IT_WINS_POLL_WINDOW_MS = 8 * 60 * 1000;

export function howItWinsPollDelayMs(attempt: number): number {
  return HOW_IT_WINS_POLL_DELAYS_MS[attempt] ?? HOW_IT_WINS_POLL_STEADY_MS;
}

type HowItWinsJobPhase =
  | "idle"
  | "checking"
  | "reading"
  | "succeeded"
  | "failed"
  | "cancelled"
  | "superseded"
  | "unknown";

export type HowItWinsJobView = {
  phase: HowItWinsJobPhase;
  job: HowItWinsJobSummary | null;
  detail: string | null;
  actionPending: boolean;
  checkAgain: () => void;
  retry: () => void;
};

type ScopedSnapshot = {
  scopeKey: string | null;
  phase: HowItWinsJobPhase;
  job: HowItWinsJobSummary | null;
  detail: string | null;
  actionPending: boolean;
};

const noAction = () => undefined;
const DEFAULT_VIEW: HowItWinsJobView = {
  phase: "idle",
  job: null,
  detail: null,
  actionPending: false,
  checkAgain: noAction,
  retry: noAction
};

const HowItWinsJobContext = createContext<HowItWinsJobView>(DEFAULT_VIEW);

export const HowItWinsJobProvider = HowItWinsJobContext.Provider;

export function useHowItWinsJob(): HowItWinsJobView {
  return useContext(HowItWinsJobContext);
}

export type HowItWinsStatusFetch = (signal: AbortSignal) => Promise<HowItWinsJobStatusEnvelope>;
export type HowItWinsRetry = (
  jobId: string,
  requestId: string,
  signal: AbortSignal
) => Promise<HowItWinsJobStatusEnvelope>;
export type HowItWinsCardFetch = (signal: AbortSignal) => Promise<ColdStartCard>;

function phaseForJob(job: HowItWinsJobSummary): HowItWinsJobPhase {
  if (job.status === "queued" || job.status === "running") return "reading";
  return job.status;
}

function detailForReason(reasonCode: HowItWinsJobReasonCode | null): string | null {
  switch (reasonCode) {
    case "authentication_configuration":
      return "The reading service needs attention before this can run again.";
    case "budget_exhausted":
      return "The retry budget is unavailable.";
    case "deadline_expired":
      return "The read ran out of time.";
    case "input_limit":
      return "The saved research was too large for this read.";
    case "stale_evidence":
    case "stale_evaluator":
      return "The company research changed before the read finished.";
    case "cancelled":
      return "The read was stopped before it finished.";
    case "superseded":
      return "Newer company research replaced this read.";
    case "dispatch_unconfirmed":
      return "The reading job could not be confirmed.";
    case "structured_output":
    case "semantic_contract":
      return "The returned read was incomplete.";
    case "transient_provider":
      return "The reading service did not return a usable result.";
    case "lease_lost":
      return "The read stopped before it could be saved.";
    case "internal_storage":
      return "The read could not be saved.";
    case "unknown":
    case null:
      return null;
  }
}

function snapshotForJob(scopeKey: string, job: HowItWinsJobSummary | null): ScopedSnapshot {
  return {
    scopeKey,
    phase: job ? phaseForJob(job) : "idle",
    job,
    detail: job ? detailForReason(job.reasonCode) : null,
    actionPending: false
  };
}

function unknownSnapshot(scopeKey: string, detail: string | null): ScopedSnapshot {
  return {
    scopeKey,
    phase: "unknown",
    job: null,
    detail,
    actionPending: false
  };
}

function isLegacyStatusRoute(caught: unknown): boolean {
  return caught instanceof ApiError && (caught.status === 404 || caught.status === 405);
}

function isOlderJob(candidate: HowItWinsJobSummary, current: HowItWinsJobSummary | null): boolean {
  if (!current) return false;
  return Date.parse(candidate.updatedAt) < Date.parse(current.updatedAt);
}

export function useHowItWinsJobStatus({
  enabled,
  scopeKey,
  fetchStatus,
  retryJob,
  fetchCard,
  onCard
}: {
  enabled: boolean;
  scopeKey: string | null;
  fetchStatus: HowItWinsStatusFetch | null;
  retryJob: HowItWinsRetry | null;
  fetchCard: HowItWinsCardFetch | null;
  onCard: (card: ColdStartCard) => void;
}): HowItWinsJobView {
  const [snapshot, setSnapshot] = useState<ScopedSnapshot>({
    scopeKey: null,
    phase: "idle",
    job: null,
    detail: null,
    actionPending: false
  });
  const [refreshKey, setRefreshKey] = useState(0);
  const fetchStatusRef = useRef(fetchStatus);
  const retryJobRef = useRef(retryJob);
  const fetchCardRef = useRef(fetchCard);
  const onCardRef = useRef(onCard);
  const activeControllerRef = useRef<AbortController | null>(null);
  const retryControllerRef = useRef<AbortController | null>(null);
  const retryInFlightRef = useRef(false);
  const scopeKeyRef = useRef(scopeKey);
  const latestJobRef = useRef<HowItWinsJobSummary | null>(null);
  const fetchedSucceededJobsRef = useRef(new Set<string>());

  fetchStatusRef.current = fetchStatus;
  retryJobRef.current = retryJob;
  fetchCardRef.current = fetchCard;
  onCardRef.current = onCard;
  scopeKeyRef.current = scopeKey;

  useEffect(() => {
    retryControllerRef.current?.abort();
    retryControllerRef.current = null;
    retryInFlightRef.current = false;
    latestJobRef.current = null;
  }, [scopeKey]);

  useEffect(() => {
    if (!enabled || scopeKey === null || !fetchStatusRef.current) {
      activeControllerRef.current?.abort();
      activeControllerRef.current = null;
      setSnapshot({
        scopeKey,
        phase: "idle",
        job: null,
        detail: null,
        actionPending: false
      });
      return undefined;
    }

    const activeScope = scopeKey;
    const controller = new AbortController();
    activeControllerRef.current?.abort();
    activeControllerRef.current = controller;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let attempt = 0;
    const startedAt = Date.now();

    setSnapshot((current) => ({
      scopeKey: activeScope,
      phase: current.scopeKey === activeScope && current.phase === "reading" ? "reading" : "checking",
      job: current.scopeKey === activeScope ? current.job : null,
      detail: null,
      actionPending: false
    }));

    const applies = () => !controller.signal.aborted && scopeKeyRef.current === activeScope;

    async function refreshSucceededCard(job: HowItWinsJobSummary) {
      const fetchOne = fetchCardRef.current;
      if (!fetchOne || fetchedSucceededJobsRef.current.has(job.id)) return;
      fetchedSucceededJobsRef.current.add(job.id);
      try {
        const card = await fetchOne(controller.signal);
        if (!applies()) return;
        if (!card.synthesis?.howItWins) {
          fetchedSucceededJobsRef.current.delete(job.id);
          setSnapshot(unknownSnapshot(activeScope, "The read finished, but the saved card could not be refreshed."));
          return;
        }
        onCardRef.current(card);
      } catch {
        if (!applies()) return;
        fetchedSucceededJobsRef.current.delete(job.id);
        setSnapshot(unknownSnapshot(activeScope, "The read finished, but the saved card could not be refreshed."));
      }
    }

    function schedule(windowMs = HOW_IT_WINS_POLL_WINDOW_MS) {
      if (!applies()) return;
      const delay = howItWinsPollDelayMs(attempt);
      if (Date.now() - startedAt + delay > windowMs) {
        if (windowMs === HOW_IT_WINS_POLL_WINDOW_MS) {
          setSnapshot(unknownSnapshot(activeScope, null));
        }
        return;
      }
      attempt += 1;
      timer = setTimeout(() => void tick(), delay);
    }

    async function tick() {
      const fetchOne = fetchStatusRef.current;
      if (!fetchOne || !applies()) return;
      try {
        const { job } = await fetchOne(controller.signal);
        if (!applies()) return;
        const known = latestJobRef.current;
        if (job && isOlderJob(job, known)) {
          if (known?.status === "queued" || known?.status === "running") schedule();
          return;
        }
        if (!job) {
          setSnapshot(snapshotForJob(activeScope, null));
          if (!known) schedule(HOW_IT_WINS_ADMISSION_POLL_WINDOW_MS);
          return;
        }
        latestJobRef.current = job;
        setSnapshot(snapshotForJob(activeScope, job));
        if (job.status === "queued" || job.status === "running") {
          schedule();
          return;
        }
        if (job.status === "succeeded") await refreshSucceededCard(job);
      } catch (caught) {
        if (!applies()) return;
        setSnapshot(unknownSnapshot(
          activeScope,
          isLegacyStatusRoute(caught) ? "This API does not report saved progress yet." : null
        ));
      }
    }

    void tick();

    return () => {
      controller.abort();
      if (timer !== null) clearTimeout(timer);
      if (activeControllerRef.current === controller) activeControllerRef.current = null;
    };
  }, [enabled, refreshKey, scopeKey]);

  const checkAgain = useCallback(() => {
    if (!enabled || scopeKeyRef.current === null) return;
    setRefreshKey((current) => current + 1);
  }, [enabled]);

  const retry = useCallback(() => {
    const currentScope = scopeKeyRef.current;
    const retryOne = retryJobRef.current;
    if (
      currentScope === null ||
      !retryOne ||
      retryInFlightRef.current ||
      snapshot.scopeKey !== currentScope ||
      snapshot.phase !== "failed" ||
      !snapshot.job?.canRetry
    ) {
      return;
    }

    retryInFlightRef.current = true;
    activeControllerRef.current?.abort();
    const controller = new AbortController();
    retryControllerRef.current = controller;
    setSnapshot((current) => ({ ...current, actionPending: true, detail: null }));

    void retryOne(snapshot.job.id, crypto.randomUUID(), controller.signal)
      .then(({ job }) => {
        if (controller.signal.aborted || scopeKeyRef.current !== currentScope) return;
        if (!job) {
          setSnapshot(unknownSnapshot(currentScope, "The retry could not be confirmed."));
          return;
        }
        latestJobRef.current = job;
        setSnapshot(snapshotForJob(currentScope, job));
        setRefreshKey((current) => current + 1);
      })
      .catch(() => {
        if (controller.signal.aborted || scopeKeyRef.current !== currentScope) return;
        setSnapshot(unknownSnapshot(currentScope, "The retry could not be confirmed."));
      })
      .finally(() => {
        if (retryControllerRef.current === controller) retryControllerRef.current = null;
        retryInFlightRef.current = false;
      });
  }, [snapshot]);

  useEffect(() => () => {
    activeControllerRef.current?.abort();
    retryControllerRef.current?.abort();
  }, []);

  const current = snapshot.scopeKey === scopeKey
    ? snapshot
    : {
        scopeKey,
        phase: enabled ? "checking" as const : "idle" as const,
        job: null,
        detail: null,
        actionPending: false
      };

  return useMemo(() => ({
    phase: current.phase,
    job: current.job,
    detail: current.detail,
    actionPending: current.actionPending,
    checkAgain,
    retry
  }), [checkAgain, current.actionPending, current.detail, current.job, current.phase, retry]);
}
