import { rename } from "node:fs/promises";
import { z } from "zod";
import type { JevResult } from "../src/triage/run";
import { AnswersSchema, type Ticket } from "../src/types";
import { requestFingerprint } from "./fingerprint";

// `request` is optional so an entry written before it existed parses, then counts as stale.
export const CacheSchema = z.record(
  z.string(),
  z.object({ model: z.string(), questions: z.string(), request: z.string().optional(), answers: AnswersSchema }),
);
export type Cache = z.infer<typeof CacheSchema>;
type Entry = Cache[string];

// Stale means fetched under different questions or for different ticket text.
export const isStale = (entry: Entry | undefined, ticket: Ticket, fingerprint: string): boolean =>
  entry !== undefined && (entry.questions !== fingerprint || entry.request !== requestFingerprint(ticket));

// Which rows have a current cached answer, which have none, and which are
// stale. Makes no requests.
export function cacheStatus(rows: readonly Ticket[], cache: Cache, fingerprint: string) {
  const fresh: string[] = [];
  const missing: string[] = [];
  const stale: string[] = [];
  for (const row of rows) {
    const hit = cache[row.id];
    if (!hit) missing.push(row.id);
    else if (isStale(hit, row, fingerprint)) stale.push(row.id);
    else fresh.push(row.id);
  }
  return { fresh, missing, stale };
}

// Writes a temp file beside the cache and renames it over the cache. The rename
// is atomic within one directory, so a crash mid-write leaves the old cache whole.
export async function writeCache(path: string, cache: Cache): Promise<void> {
  const tmp = `${path}.${process.pid}.tmp`;
  await Bun.write(tmp, `${JSON.stringify(cache, null, 2)}\n`);
  await rename(tmp, path);
}

// The API takes one ticket per request, so throughput is entirely client-side.
// 8 keeps the 60-row eval well under a rate limit the API does not document.
export const DEFAULT_CONCURRENCY = 8;

type FillOptions = {
  refresh: boolean;
  fingerprint: string;
  path: string;
  ask: (row: Ticket) => Promise<JevResult>;
  concurrency?: number;
};

// Fetches missing and stale rows (every row with refresh) and saves after each
// one, so a crash keeps everything already paid for. A failed request is
// recorded and skipped; a failed save throws, because every later answer
// would be paid for and then lost.
export async function fillCache(
  rows: readonly Ticket[],
  start: Cache,
  { refresh, fingerprint, path, ask, concurrency = DEFAULT_CONCURRENCY }: FillOptions,
): Promise<{ cache: Cache; errored: string[]; durations: number[] }> {
  const staleCount = rows.filter((r) => isStale(start[r.id], r, fingerprint)).length;
  if (staleCount > 0) {
    console.error(`${staleCount} cached answers are stale (questions or ticket text changed); refetching`);
  }

  const todo = rows.filter((r) => refresh || !start[r.id] || isStale(start[r.id], r, fingerprint));
  let cache = start;
  const errored: string[] = [];
  // Per-request wall time, so a run reports what the API actually cost in seconds.
  const durations: number[] = [];
  // Workers share one cursor, so requests overlap. Saves are chained instead:
  // one write runs at a time, in completion order, and every worker waits for
  // the file to hold its answer before starting another request. A crash still
  // keeps everything already paid for.
  let next = 0;
  let saveFailure: Error | undefined;
  let saving: Promise<unknown> = Promise.resolve();

  const worker = async () => {
    while (next < todo.length && saveFailure === undefined) {
      const row = todo[next++]!;
      let result: JevResult;
      const started = performance.now();
      try {
        result = await ask(row);
      } catch (err) {
        errored.push(row.id);
        console.error(`${row.id} errored: ${errorMessage(err)}`);
        continue;
      }
      const ms = Math.round(performance.now() - started);
      durations.push(ms);
      cache = { ...cache, [row.id]: { ...result, questions: fingerprint, request: requestFingerprint(row) } };
      // Recorded rather than thrown: a throw here would abandon the other
      // workers' in-flight answers instead of letting them settle.
      saving = saving
        .then(() => writeCache(path, cache))
        .catch((err: unknown) => {
          saveFailure ??= new Error(
            `cache write failed after fetching ${row.id}; stopped before more requests: ${errorMessage(err)}`,
          );
        });
      await saving;
      console.error(`fetched ${row.id} in ${ms}ms`);
    }
  };

  const workers = Math.max(1, Math.min(Math.trunc(concurrency), todo.length));
  await Promise.all(Array.from({ length: workers }, worker));
  if (saveFailure !== undefined) throw saveFailure;
  return { cache, errored, durations };
}

const errorMessage = (err: unknown) => (err instanceof Error ? err.message : String(err));
