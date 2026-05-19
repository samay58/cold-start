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

export function serverTiming(metrics: ServerTimingMetric[]) {
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

export function apiJson(body: unknown, init?: ResponseInit) {
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
