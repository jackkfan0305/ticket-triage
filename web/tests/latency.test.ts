import { describe, expect, test } from "bun:test";
import { percentile, summarise } from "../lib/latency";

describe("percentile", () => {
  test("returns a sample that actually happened, never an interpolation", () => {
    const sorted = [100, 200, 300, 400];
    expect(sorted).toContain(percentile(sorted, 0.5));
    expect(sorted).toContain(percentile(sorted, 0.75));
  });

  test("nearest rank puts p50 at the middle sample", () => {
    expect(percentile([10, 20, 30, 40, 50], 0.5)).toBe(30);
  });

  test("p95 of twenty samples is the nineteenth", () => {
    const sorted = Array.from({ length: 20 }, (_, i) => (i + 1) * 10);
    expect(percentile(sorted, 0.95)).toBe(190);
  });

  test("p95 of a short run does not run off the end", () => {
    expect(percentile([5, 9], 0.95)).toBe(9);
    expect(percentile([7], 0.95)).toBe(7);
  });

  test("an empty set has no percentile to report", () => {
    expect(percentile([], 0.5)).toBe(0);
  });
});

describe("summarise", () => {
  test("returns null before any latency has been recorded", () => {
    expect(summarise([])).toBeNull();
  });

  test("reports count, p50, p95, mean and max over an unsorted run", () => {
    const samples = [300, 100, 900, 200, 400, 150, 250, 350, 180, 220];
    expect(summarise(samples)).toEqual({
      count: 10,
      p50: 220, // nearest rank: the fifth of ten samples
      p95: 900,
      mean: 305,
      max: 900,
    });
  });

  test("leaves the caller's array untouched", () => {
    const samples = [3, 1, 2];
    summarise(samples);
    expect(samples).toEqual([3, 1, 2]);
  });

  test("a single sample is its own p50, p95 and mean", () => {
    expect(summarise([420])).toEqual({ count: 1, p50: 420, p95: 420, mean: 420, max: 420 });
  });
});
