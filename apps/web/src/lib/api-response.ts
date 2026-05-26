import { COLD_START_API_CONTRACT_HEADER, COLD_START_API_CONTRACT_VERSION } from "@cold-start/core";
import { NextResponse } from "next/server";

export type ServerTimingMetric = {
  name: string;
  durationMs?: number;
  description?: string;
};

function quoteServerTimingDescription(input: string) {
  return input.replace(/["\\]/g, "");
}

function serverTiming(metrics: ServerTimingMetric[]) {
  return metrics
    .map((metric) => {
      const parts = [metric.name];
      if (metric.durationMs !== undefined && Number.isFinite(metric.durationMs)) {
        parts.push(`dur=${Math.max(0, metric.durationMs).toFixed(1)}`);
      }
      if (metric.description) {
        parts.push(`desc="${quoteServerTimingDescription(metric.description)}"`);
      }
      return parts.join(";");
    })
    .join(", ");
}

function apiJson(body: unknown, init?: ResponseInit) {
  const response = NextResponse.json(body, init);
  response.headers.set(COLD_START_API_CONTRACT_HEADER, COLD_START_API_CONTRACT_VERSION);
  return response;
}

export function apiJsonWithTiming(body: unknown, metrics: ServerTimingMetric[], init?: ResponseInit) {
  const response = apiJson(body, init);
  if (metrics.length > 0) {
    response.headers.set("Server-Timing", serverTiming(metrics));
  }
  return response;
}

// Stamps a per-slug provider failure summary onto the response. Extension clients (and curl)
// can read these to distinguish "card thin because data is sparse" from "card thin because
// 25 of 26 enrichment lanes failed in the last generation." Header names use the x-cold-start-
// prefix consistent with the contract header.
export function setProviderFailureHeaders(
  response: { headers: Headers },
  summary: { failedCount: number; topReason: string | null; topEndpoint: string | null } | null
) {
  if (!summary || summary.failedCount === 0) {
    return;
  }
  response.headers.set("x-cold-start-provider-failures", String(summary.failedCount));
  if (summary.topReason) {
    response.headers.set("x-cold-start-provider-top-reason", summary.topReason);
  }
  if (summary.topEndpoint) {
    response.headers.set("x-cold-start-provider-top-endpoint", summary.topEndpoint);
  }
}
