export type LatencySummary = {
  count: number;
  p50: number;
  p95: number;
  mean: number;
  max: number;
};

/**
 * Nearest-rank percentile: the smallest sample at or above the quantile. No
 * interpolation, so every number reported is a latency that actually happened.
 */
export function percentile(sorted: readonly number[], q: number): number {
  if (sorted.length === 0) return 0;
  const rank = Math.ceil(q * sorted.length);
  const index = Math.min(sorted.length - 1, Math.max(0, rank - 1));
  return sorted[index] as number;
}

export function summarise(samples: readonly number[]): LatencySummary | null {
  if (samples.length === 0) return null;
  const sorted = [...samples].sort((a, b) => a - b);
  const total = sorted.reduce((a, b) => a + b, 0);
  return {
    count: sorted.length,
    p50: percentile(sorted, 0.5),
    p95: percentile(sorted, 0.95),
    mean: Math.round(total / sorted.length),
    max: sorted[sorted.length - 1] as number,
  };
}
