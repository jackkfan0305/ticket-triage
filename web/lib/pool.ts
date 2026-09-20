/**
 * Runs `work` over `items` with at most `limit` in flight, calling `onSettle`
 * as each one lands rather than at the end.
 *
 * The bound is the point. Firing all 60 at once makes the API queue them, and
 * every reported latency becomes mostly queue wait instead of model time.
 */
export async function pooled<T, R>(
  items: readonly T[],
  limit: number,
  work: (item: T, index: number) => Promise<R>,
  onSettle?: (result: { item: T; index: number; value?: R; error?: unknown }) => void,
): Promise<void> {
  if (limit < 1) throw new RangeError(`pool limit must be at least 1, got ${limit}`);

  let next = 0;
  const runner = async (): Promise<void> => {
    while (next < items.length) {
      const index = next++;
      const item = items[index] as T;
      try {
        const value = await work(item, index);
        onSettle?.({ item, index, value });
      } catch (error) {
        // one failed ticket must not abandon the other fifty-nine
        onSettle?.({ item, index, error });
      }
    }
  };

  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, runner));
}
