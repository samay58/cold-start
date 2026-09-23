// Constants and small value helpers shared by the alpha status reader, builder and formatter.
import { ALPHA_INVITE_ATTEMPT_WINDOW_SECONDS, type GenerationFailureCode } from "@cold-start/core";

import type { JsonObject } from "./types";

export const MAX_RUN_ROWS = 10_000;
export const ALPHA_RELEASE_WALLET_FLOOR_USD = 35;
export const PROFILE_RUN_FLOOR_COUNT = 10;
export const SOFTWARE_FAILURE_CODES = new Set<GenerationFailureCode>(["model_contract", "concurrent_write", "unknown"]);
// This script queries alpha_invite_attempts through its raw pg.Client rather than the web route's
// Drizzle connection so the operator can see when credential validation is being throttled.
export const INVITE_QUOTA_WINDOW_MINUTES = ALPHA_INVITE_ATTEMPT_WINDOW_SECONDS / 60;

export function objectAt(value: JsonObject | null | undefined, key: string): JsonObject | null {
  const nested = value?.[key];
  return nested && typeof nested === "object" && !Array.isArray(nested)
    ? nested as JsonObject
    : null;
}

export function finiteNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export function stringValue(value: unknown): string | null {
  return typeof value === "string" && value ? value : null;
}

export function integer(value: string | number | null | undefined): number {
  const parsed = Number(value ?? 0);
  return Number.isInteger(parsed) ? parsed : 0;
}

export function dateNumber(value: Date | null | undefined): number {
  return value?.getTime() ?? 0;
}

export function iso(value: Date | null | undefined): string | null {
  return value ? value.toISOString() : null;
}

export function earliestIso(values: Array<Date | null>): string | null {
  const timestamps = values.flatMap((value) => value ? [value.getTime()] : []);
  return timestamps.length ? new Date(Math.min(...timestamps)).toISOString() : null;
}

export function money(value: number): string {
  return `$${value.toFixed(4)}`;
}
