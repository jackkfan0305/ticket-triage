import { describe, expect, test } from "bun:test";
import { pooled } from "../lib/pool";

const deferred = <T>() => {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
};

describe("pooled", () => {
  test("never exceeds the concurrency limit", async () => {
    const items = Array.from({ length: 20 }, (_, i) => i);
    let inFlight = 0;
    let peak = 0;

    await pooled(items, 4, async () => {
      inFlight += 1;
      peak = Math.max(peak, inFlight);
      await Promise.resolve();
      await Promise.resolve();
      inFlight -= 1;
    });

    expect(peak).toBe(4);
  });

  test("visits every item exactly once", async () => {
    const items = ["a", "b", "c", "d", "e"];
    const seen: string[] = [];

    await pooled(items, 2, async (item) => {
      seen.push(item);
    });

    expect(seen.sort()).toEqual([...items].sort());
  });

  test("reports each result as it settles, not at the end", async () => {
    const slow = deferred<string>();
    const fast = deferred<string>();
    const settled: number[] = [];

    const run = pooled(
      [slow, fast],
      2,
      (item) => item.promise,
      ({ index }) => settled.push(index),
    );

    fast.resolve("second item, first response");
    await Promise.resolve();
    await Promise.resolve();
    expect(settled).toEqual([1]);

    slow.resolve("late");
    await run;
    expect(settled).toEqual([1, 0]);
  });

  test("one failure does not abandon the remaining items", async () => {
    const items = [1, 2, 3, 4];
    const errors: unknown[] = [];
    const values: number[] = [];

    await pooled(
      items,
      2,
      async (item) => {
        if (item === 2) throw new Error("boom");
        return item * 10;
      },
      ({ value, error }) => {
        if (error) errors.push(error);
        if (value !== undefined) values.push(value);
      },
    );

    expect(errors).toHaveLength(1);
    expect(values.sort((a, b) => a - b)).toEqual([10, 30, 40]);
  });

  test("an empty list resolves without starting a runner", async () => {
    let calls = 0;
    await pooled([], 8, async () => {
      calls += 1;
    });
    expect(calls).toBe(0);
  });

  test("rejects a limit below one rather than hanging", () => {
    expect(() => pooled([1], 0, async () => 1)).toThrow(RangeError);
  });
});
