import {
  type GenerationTrace,
  type GenerationLlmCallTrace,
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

function totalEstimatedLlmCostUsd(calls: GenerationLlmCallTrace[]) {
  const total = calls.reduce((sum, call) => sum + (call.estimatedCostUsd ?? 0), 0);
  return total > 0 ? Number(total.toFixed(6)) : undefined;
}

export function llmTracePatchFromCalls(calls: GenerationLlmCallTrace[]): GenerationTracePatch {
  if (calls.length === 0) {
    return {};
  }

  const totalEstimatedCostUsd = totalEstimatedLlmCostUsd(calls);
  return {
    llm: {
      calls,
      ...(totalEstimatedCostUsd !== undefined ? { totalEstimatedCostUsd } : {})
    }
  };
}

export function anthropicGenerationCostUsdFromTrace(trace: GenerationTrace) {
  const costUsd =
    trace.costUsdAnthropic
    ?? trace.llm?.totalEstimatedCostUsd
    ?? (trace.llm ? totalEstimatedLlmCostUsd(trace.llm.calls) : undefined);

  return costUsd === undefined ? undefined : Number(costUsd.toFixed(4));
}

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

export function generationMilestoneElapsedMs(requestedAtMs: number, nowMs = Date.now()) {
  return Math.max(1, Math.round(nowMs - requestedAtMs));
}

export function writeGenerationMilestoneValue(
  trace: GenerationTrace,
  name: GenerationMilestoneName,
  valueMs: number
) {
  const existing = trace.milestones?.[name];
  if (typeof existing === "number" && Number.isFinite(existing)) {
    return existing;
  }

  const value = Math.max(1, Math.round(valueMs));
  trace.milestones = {
    ...trace.milestones,
    [name]: value
  };
  return value;
}

export function writeGenerationMilestone(
  trace: GenerationTrace,
  name: GenerationMilestoneName,
  requestedAtMs: number,
  nowMs = Date.now()
) {
  return writeGenerationMilestoneValue(trace, name, generationMilestoneElapsedMs(requestedAtMs, nowMs));
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

  if (next.providers?.stableenrich?.accountingStatus === "receipts_complete") {
    next.costUsdAgentcash = next.providers.stableenrich.receiptCostUsd ?? 0;
  } else if (next.providers?.stableenrich?.accountingStatus === "receipts_partial") {
    delete next.costUsdAgentcash;
  } else if ("costUsdAgentcash" in patch && patch.costUsdAgentcash !== undefined) {
    next.costUsdAgentcash = patch.costUsdAgentcash;
  }

  if (next.llm?.totalEstimatedCostUsd !== undefined) {
    next.costUsdAnthropic = next.llm.totalEstimatedCostUsd;
  } else if ("costUsdAnthropic" in patch && patch.costUsdAnthropic !== undefined) {
    next.costUsdAnthropic = patch.costUsdAnthropic;
  }

  return next;
}

function sumOptional(left: number | undefined, right: number | undefined) {
  if (left === undefined && right === undefined) return undefined;
  return Number(((left ?? 0) + (right ?? 0)).toFixed(6));
}

function endpointTraceKey(endpoint: NonNullable<StableenrichTrace["endpoints"]>[number]) {
  if (endpoint.paymentTransactionHash) {
    return `tx:${endpoint.paymentNetwork ?? "unknown"}:${endpoint.paymentTransactionHash}`;
  }
  if (endpoint.callId) {
    return `call:${endpoint.callId}`;
  }
  return `legacy:${JSON.stringify(endpoint)}`;
}

function mergeStableenrichEndpoints(
  left: StableenrichTrace["endpoints"],
  right: StableenrichTrace["endpoints"]
) {
  const merged = new Map<string, NonNullable<StableenrichTrace["endpoints"]>[number]>();
  for (const endpoint of [...(left ?? []), ...(right ?? [])]) {
    merged.set(endpointTraceKey(endpoint), endpoint);
  }
  return Array.from(merged.values());
}

function withReceiptAccounting(stableenrich: StableenrichTrace): StableenrichTrace {
  const endpoints = stableenrich.endpoints ?? [];
  const modernCalls = endpoints.filter((endpoint) => Boolean(endpoint.callId));
  if (modernCalls.length === 0) {
    return {
      ...stableenrich,
      ...(stableenrich.walletDeltaUsd !== undefined ? { accountingStatus: "legacy_wallet_delta" as const } : {})
    };
  }

  const receiptedCalls = modernCalls.filter((endpoint) => endpoint.actualCostUsd !== undefined);
  const receiptCostUsd = Number(receiptedCalls.reduce((sum, endpoint) => sum + (endpoint.actualCostUsd ?? 0), 0).toFixed(6));
  const unreceiptedCallCount = modernCalls.length - receiptedCalls.length;
  return {
    ...stableenrich,
    receiptCostUsd,
    receiptCount: receiptedCalls.length,
    unreceiptedCallCount,
    accountingStatus: unreceiptedCallCount === 0 ? "receipts_complete" : "receipts_partial"
  };
}

function applyReceiptAccounting(trace: GenerationTrace) {
  const stableenrich = trace.providers?.stableenrich;
  if (!stableenrich) {
    return;
  }
  const accounted = withReceiptAccounting(stableenrich);
  trace.providers = { ...trace.providers, stableenrich: accounted };
  if (accounted.accountingStatus === "receipts_complete") {
    trace.costUsdAgentcash = accounted.receiptCostUsd ?? 0;
  } else if (accounted.accountingStatus === "receipts_partial") {
    delete trace.costUsdAgentcash;
  }
}

export function mergeContactEnrichmentTrace(
  parent: GenerationTrace | null,
  contact: GenerationTrace
): GenerationTrace {
  const merged = mergeGenerationTrace(parent, contact);
  const parentStable = parent?.providers?.stableenrich;
  const contactStable = contact.providers?.stableenrich;

  if (contactStable) {
    const walletDeltaUsd = sumOptional(parentStable?.walletDeltaUsd, contactStable.walletDeltaUsd);
    const factCount = sumOptional(parentStable?.factCount, contactStable.factCount);
    const walletErrors = Array.from(new Set(
      [parentStable?.walletSnapshotError, contactStable.walletSnapshotError].filter((value): value is string => Boolean(value))
    ));
    merged.providers = {
      ...merged.providers,
      stableenrich: {
        ...parentStable,
        ...contactStable,
        sourceCount: (parentStable?.sourceCount ?? 0) + contactStable.sourceCount,
        failureCount: (parentStable?.failureCount ?? 0) + contactStable.failureCount,
        ...(factCount !== undefined ? { factCount } : {}),
        endpoints: mergeStableenrichEndpoints(parentStable?.endpoints, contactStable.endpoints),
        skippedProbeNames: Array.from(new Set([
          ...(parentStable?.skippedProbeNames ?? []),
          ...(contactStable.skippedProbeNames ?? [])
        ])),
        ...(parentStable?.budgetCeilingHit || contactStable.budgetCeilingHit ? { budgetCeilingHit: true } : {}),
        ...(parentStable?.walletSnapshotBeforeUsd !== undefined
          ? { walletSnapshotBeforeUsd: parentStable.walletSnapshotBeforeUsd }
          : {}),
        ...(contactStable.walletSnapshotAfterUsd !== undefined
          ? { walletSnapshotAfterUsd: contactStable.walletSnapshotAfterUsd }
          : {}),
        ...(walletDeltaUsd !== undefined ? { walletDeltaUsd } : {}),
        ...(walletErrors.length > 0 ? { walletSnapshotError: walletErrors.join("; ") } : {})
      }
    };
  }

  applyReceiptAccounting(merged);
  const agentcashCost = sumOptional(parent?.costUsdAgentcash, contact.costUsdAgentcash);
  if (
    merged.providers?.stableenrich?.accountingStatus !== "receipts_complete"
    && merged.providers?.stableenrich?.accountingStatus !== "receipts_partial"
    && agentcashCost !== undefined
  ) {
    merged.costUsdAgentcash = agentcashCost;
  }
  if (merged.llm?.totalEstimatedCostUsd !== undefined) {
    merged.costUsdAnthropic = merged.llm.totalEstimatedCostUsd;
  }
  return merged;
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
      const previousStable = trace.providers?.stableenrich;
      providers.stableenrich = withReceiptAccounting({
        ...stableenrichTraceWithWallet(previousStable, null),
        ...patch.providers.stableenrich,
        endpoints: mergeStableenrichEndpoints(previousStable?.endpoints, patch.providers.stableenrich.endpoints)
      });
    } else if (trace.providers?.stableenrich) {
      providers.stableenrich = trace.providers.stableenrich;
    }

    trace.providers = providers;
    applyReceiptAccounting(trace);
  }

  if ("llm" in patch && patch.llm) {
    const previousTotalEstimatedCostUsd = trace.llm?.totalEstimatedCostUsd;
    trace.llm = {
      calls: [...(trace.llm?.calls ?? []), ...patch.llm.calls]
    };
    const totalEstimatedCostUsd =
      totalEstimatedLlmCostUsd(trace.llm.calls)
      ?? patch.llm.totalEstimatedCostUsd
      ?? previousTotalEstimatedCostUsd;
    if (totalEstimatedCostUsd !== undefined) {
      trace.llm.totalEstimatedCostUsd = totalEstimatedCostUsd;
    }
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

  // Shallow-merged, not replaced: the emphasis wiring calls mergeTracePatch multiple times
  // across the run (thin-file decision, founder-voice fetch, verify outcome), each carrying a
  // different subset of fields. A wholesale replace like synthesis/sourceGate/extraction above
  // would let the last call wipe out laneCounts/laneFailures written by an earlier one.
  if ("emphasis" in patch && patch.emphasis) {
    trace.emphasis = { ...trace.emphasis, ...patch.emphasis };
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
    if (stableenrich.accountingStatus !== "receipts_complete" && stableenrich.accountingStatus !== "receipts_partial") {
      trace.costUsdAgentcash = stableenrich.walletDeltaUsd;
    }
  }
  applyReceiptAccounting(trace);
  if (trace.llm?.totalEstimatedCostUsd !== undefined) {
    trace.costUsdAnthropic = trace.llm.totalEstimatedCostUsd;
  }
}
