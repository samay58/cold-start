// Latency and count summaries shared by the measurement scripts, so every report reads a p50 the
// same way. Non-finite values are dropped before anything is counted.

export type Distribution = {
  n: number;
  p50: number | null;
  p90: number | null;
  max: number | null;
};

// Nearest-rank percentile: sort ascending, take index ceil(pct/100 * n) - 1, clamped to the
// array. pct is 0-100. Returns null for an empty input rather than a misleading zero.
export function percentile(values: readonly number[], pct: number): number | null {
  const sorted = values.filter((value) => Number.isFinite(value)).sort((left, right) => left - right);
  if (sorted.length === 0) {
    return null;
  }
  const index = Math.ceil((pct / 100) * sorted.length) - 1;
  return sorted[Math.max(0, Math.min(sorted.length - 1, index))] ?? null;
}

export function distribution(values: readonly number[]): Distribution;
export function distribution(values: readonly number[], options: { p95: true }): Distribution & { p95: number | null };
export function distribution(values: readonly number[], options?: { p95: true }) {
  const finite = values.filter((value) => Number.isFinite(value));
  return {
    n: finite.length,
    p50: percentile(finite, 50),
    p90: percentile(finite, 90),
    ...(options?.p95 ? { p95: percentile(finite, 95) } : {}),
    max: finite.length > 0 ? Math.max(...finite) : null
  };
}
