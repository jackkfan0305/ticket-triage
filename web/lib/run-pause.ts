/**
 * Whether a run is paused, keyed by the run id the browser generated.
 *
 * The pause arrives as its own request while the run's response is still open,
 * so the two handlers need somewhere to meet.
 *
 * ponytail: one process, in memory. On a single server (dev, or one instance)
 * the pause always reaches the stream that is running. Behind more than one
 * instance it can land on the wrong one and do nothing; move the flag to Redis
 * if this ever runs replicated.
 *
 * The map is hung off globalThis because a dev hot update re-evaluates the
 * module, and a fresh Map would forget a run that is still streaming.
 */
const runs: Map<string, boolean> = ((globalThis as typeof globalThis & {
  __triagePaused?: Map<string, boolean>;
}).__triagePaused ??= new Map());

const POLL_MS = 120;

export const setPaused = (runId: string, paused: boolean): void => {
  runs.set(runId, paused);
};

/** Drops the flag once its run is over, so a long session does not collect one
 *  entry per Start. */
export const forget = (runId: string): void => {
  runs.delete(runId);
};

/**
 * Resolves when the run is not paused, or when the client has gone away.
 *
 * Polling rather than waking on the pause request keeps both handlers free of
 * shared resolver bookkeeping; the cost is up to one poll of lag on Resume,
 * which nobody can see.
 */
export async function holdWhilePaused(runId: string, signal: AbortSignal): Promise<void> {
  while (runs.get(runId) === true && !signal.aborted) {
    await new Promise((resolve) => setTimeout(resolve, POLL_MS));
  }
}
