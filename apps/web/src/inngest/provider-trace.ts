import type { GenerationTrace } from "@cold-start/core";
import { providerBudgetForEndpoint, type StableenrichProbeName } from "@cold-start/providers";

import { boundedErrorMessage } from "../lib/errors";

type GenerationMode = "basics" | "analysis";
type StableenrichEndpointTraceInput = NonNullable<NonNullable<NonNullable<GenerationTrace["providers"]>["stableenrich"]>["endpoints"]>[number];

export function failedStableenrichEndpoint(reason: unknown) {
  return {
    name: "stableenrich" as const,
    endpointUrl: "stableenrich",
    status: "failed" as const,
    sourceCount: 0,
    factCount: 0,
    error: boundedErrorMessage(reason)
  };
}

export function mergeEndpointFactCounts(
  left: Record<string, number> | undefined,
  right: Record<string, number> | undefined
) {
  const out: Record<string, number> = { ...(left ?? {}) };
  for (const [endpoint, count] of Object.entries(right ?? {})) {
    out[endpoint] = (out[endpoint] ?? 0) + count;
  }
  return out;
}

export function withStableenrichEndpointBudgets(
  endpoints: StableenrichEndpointTraceInput[],
  appliedByEndpoint: Record<string, number> = {}
): StableenrichEndpointTraceInput[] {
  return endpoints.map((endpoint) => {
    try {
      const budget = providerBudgetForEndpoint("stableenrich", endpoint.name as StableenrichProbeName);
      return {
        ...endpoint,
        factsAppliedCount: appliedByEndpoint[endpoint.name] ?? endpoint.factsAppliedCount ?? 0,
        estimatedCostUsd: budget.estimatedCostUsd,
        expectedFacts: budget.expectedFacts,
        stopCondition: budget.stopCondition
      };
    } catch {
      return {
        ...endpoint,
        factsAppliedCount: appliedByEndpoint[endpoint.name] ?? endpoint.factsAppliedCount ?? 0
      };
    }
  });
}

export function applyStableenrichEndpointYield(trace: GenerationTrace, appliedByEndpoint?: Record<string, number>) {
  if (!trace.providers?.stableenrich?.endpoints || !appliedByEndpoint) {
    return;
  }

  trace.providers = {
    ...trace.providers,
    stableenrich: {
      ...trace.providers.stableenrich,
      endpoints: withStableenrichEndpointBudgets(trace.providers.stableenrich.endpoints, appliedByEndpoint)
    }
  };
}

export function agentcashBudgetCeilingUsd(input: {
  mode: GenerationMode;
  override?: number | undefined;
}) {
  if (typeof input.override === "number" && Number.isFinite(input.override) && input.override >= 0) {
    return input.override;
  }

  return input.mode === "analysis" ? 0.5 : 0.3;
}

function stableenrichEndpointBudgetUsd(endpoints: StableenrichEndpointTraceInput[] | undefined) {
  return (endpoints ?? []).reduce((sum, endpoint) => sum + (endpoint.estimatedCostUsd ?? 0), 0);
}

export function remainingAgentcashBudgetUsd(input: {
  ceilingUsd: number;
  endpoints?: StableenrichEndpointTraceInput[] | undefined;
}) {
  return Math.max(0, Number((input.ceilingUsd - stableenrichEndpointBudgetUsd(input.endpoints)).toFixed(6)));
}
