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

type FillOptions = {
  refresh: boolean;
  fingerprint: string;
  path: string;
  ask: (row: Ticket) => Promise<JevResult>;
};

// Fetches missing and stale rows (every row with refresh) and saves after each
// one, so a crash keeps everything already paid for. A failed request is
// recorded and skipped; a failed save throws, because every later answer
// would be paid for and then lost.
export async function fillCache(
  rows: readonly Ticket[],
  start: Cache,
  { refresh, fingerprint, path, ask }: FillOptions,
): Promise<{ cache: Cache; errored: string[] }> {
  const staleCount = rows.filter((r) => isStale(start[r.id], r, fingerprint)).length;
  if (staleCount > 0) {
    console.error(`${staleCount} cached answers are stale (questions or ticket text changed); refetching`);
  }

  const todo = rows.filter((r) => refresh || !start[r.id] || isStale(start[r.id], r, fingerprint));
  let cache = start;
  const errored: string[] = [];
  for (const row of todo) {
    let result: JevResult;
    try {
      result = await ask(row);
    } catch (err) {
      errored.push(row.id);
      console.error(`${row.id} errored: ${errorMessage(err)}`);
      continue;
    }
    cache = { ...cache, [row.id]: { ...result, questions: fingerprint, request: requestFingerprint(row) } };
    try {
      await writeCache(path, cache);
    } catch (err) {
      throw new Error(`cache write failed after fetching ${row.id}; stopped before more requests: ${errorMessage(err)}`);
    }
    console.error(`fetched ${row.id}`);
  }
  return { cache, errored };
}

const errorMessage = (err: unknown) => (err instanceof Error ? err.message : String(err));
