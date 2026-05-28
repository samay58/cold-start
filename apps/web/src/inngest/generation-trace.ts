import {
  type GenerationTrace,
  type GenerationTraceStep
} from "@cold-start/core";
import type { GenerateCardTracePatch } from "@cold-start/pipeline";

export type GenerationTracePatch = Partial<Omit<GenerationTrace, "jobKind" | "mode">>;
export type ProviderTrace = NonNullable<GenerationTrace["providers"]>;
type StableenrichTrace = NonNullable<ProviderTrace["stableenrich"]>;
type GenerationMilestoneName = keyof NonNullable<GenerationTrace["milestones"]>;
type GenerationEventTimestamp = {
  ts?: unknown;
  data?: {
    requestedAt?: unknown;
    requestedAtMs?: unknown;
  };
};
type WalletSnapshotResult =
  | { ok: true; snapshot: { totalBalanceUsd: number } }
  | { ok: false; error: string };

function timestampMs(input: unknown): number | null {
  if (typeof input === "number" && Number.isFinite(input) && input > 0) {
    return Math.round(input);
  }

  if (typeof input === "string" && input.trim().length > 0) {
    const parsed = Date.parse(input);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

export function requestedAtMsFromGenerationEvent(event: GenerationEventTimestamp, fallbackNowMs = Date.now()) {
  return timestampMs(event.data?.requestedAtMs)
    ?? timestampMs(event.data?.requestedAt)
    ?? timestampMs(event.ts)
    ?? fallbackNowMs;
}

function milestoneElapsedMs(requestedAtMs: number, nowMs = Date.now()) {
  return Math.max(1, Math.round(nowMs - requestedAtMs));
}

export function writeGenerationMilestone(
  trace: GenerationTrace,
  name: GenerationMilestoneName,
  requestedAtMs: number,
  nowMs = Date.now()
) {
  const existing = trace.milestones?.[name];
  if (typeof existing === "number" && Number.isFinite(existing)) {
    return existing;
  }

  const value = milestoneElapsedMs(requestedAtMs, nowMs);
  trace.milestones = {
    ...trace.milestones,
    [name]: value
  };
  return value;
}

export function mergeGenerationTrace(
  base: GenerationTrace | null,
  patch: Partial<GenerationTrace> & Pick<GenerationTrace, "jobKind" | "mode">
): GenerationTrace {
  const next: GenerationTrace = {
    ...(base ?? {
      jobKind: patch.jobKind,
      mode: patch.mode
    }),
    jobKind: patch.jobKind,
    mode: patch.mode
  };

  mergeTracePatch(next, patch);

  if ("costUsdAgentcash" in patch && patch.costUsdAgentcash !== undefined) {
    next.costUsdAgentcash = patch.costUsdAgentcash;
  }

  if ("costUsdAnthropic" in patch && patch.costUsdAnthropic !== undefined) {
    next.costUsdAnthropic = patch.costUsdAnthropic;
  }

  return next;
}

export function mergeTracePatch(trace: GenerationTrace, patch?: GenerationTracePatch | GenerateCardTracePatch) {
  if (!patch) {
    return;
  }

  if ("inngest" in patch && patch.inngest) {
    trace.inngest = { ...trace.inngest, ...patch.inngest };
  }

  if ("steps" in patch && patch.steps) {
    trace.steps = { ...trace.steps, ...patch.steps };
  }

  if ("milestones" in patch && patch.milestones) {
    trace.milestones = { ...trace.milestones, ...patch.milestones };
  }

  if ("providers" in patch && patch.providers) {
    const providers: ProviderTrace = {
      ...trace.providers,
      ...patch.providers
    };

    if (patch.providers.stableenrich) {
      providers.stableenrich = {
        ...stableenrichTraceWithWallet(trace.providers?.stableenrich, null),
        ...patch.providers.stableenrich
      };
    } else if (trace.providers?.stableenrich) {
      providers.stableenrich = trace.providers.stableenrich;
    }

    trace.providers = providers;
  }

  if ("llm" in patch && patch.llm) {
    trace.llm = {
      calls: [...(trace.llm?.calls ?? []), ...patch.llm.calls],
      ...(patch.llm.totalEstimatedCostUsd !== undefined
        ? { totalEstimatedCostUsd: patch.llm.totalEstimatedCostUsd }
        : trace.llm?.totalEstimatedCostUsd !== undefined
          ? { totalEstimatedCostUsd: trace.llm.totalEstimatedCostUsd }
          : {})
    };
    if (trace.llm.totalEstimatedCostUsd !== undefined) {
      trace.costUsdAnthropic = trace.llm.totalEstimatedCostUsd;
    }
  }

  if ("sourceGate" in patch && patch.sourceGate) {
    trace.sourceGate = patch.sourceGate;
  }

  if ("extraction" in patch && patch.extraction) {
    trace.extraction = patch.extraction;
  }

  if ("synthesis" in patch && patch.synthesis) {
    trace.synthesis = patch.synthesis;
  }

  if ("failure" in patch && patch.failure) {
    trace.failure = patch.failure;
  }
}

export function completedStep(durationMs: number): GenerationTraceStep {
  return { status: "complete", durationMs };
}

export function skippedStep(message: string): GenerationTraceStep {
  return { status: "skipped", message };
}

function stableenrichTraceWithWallet(
  stableenrich: StableenrichTrace | undefined,
  before: WalletSnapshotResult | null,
  after?: WalletSnapshotResult | null
): StableenrichTrace {
  const next: StableenrichTrace = stableenrich ?? {
    sourceCount: 0,
    failureCount: 0
  };

  if (before?.ok) {
    next.walletSnapshotBeforeUsd = before.snapshot.totalBalanceUsd;
  } else if (before && !before.ok) {
    next.walletSnapshotError = `before: ${before.error}`;
  }

  if (after?.ok) {
    next.walletSnapshotAfterUsd = after.snapshot.totalBalanceUsd;
    if (before?.ok) {
      const delta = Math.max(0, before.snapshot.totalBalanceUsd - after.snapshot.totalBalanceUsd);
      next.walletDeltaUsd = Number(delta.toFixed(6));
    }
  } else if (after && !after.ok) {
    next.walletSnapshotError = [next.walletSnapshotError, `after: ${after.error}`].filter(Boolean).join("; ");
  }

  return next;
}

export function applyStableenrichWalletTrace(
  trace: GenerationTrace,
  before: WalletSnapshotResult | null,
  after?: WalletSnapshotResult | null
) {
  const stableenrich = stableenrichTraceWithWallet(trace.providers?.stableenrich, before, after);
  trace.providers = {
    ...trace.providers,
    stableenrich
  };

  if (stableenrich.walletDeltaUsd !== undefined) {
    trace.costUsdAgentcash = stableenrich.walletDeltaUsd;
  }
  if (trace.llm?.totalEstimatedCostUsd !== undefined) {
    trace.costUsdAnthropic = trace.llm.totalEstimatedCostUsd;
  }
}
