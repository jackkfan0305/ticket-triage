import { z } from "zod";
import { AnswersSchema } from "../src/types";

export const CacheSchema = z.record(z.string(), z.object({ model: z.string(), questions: z.string(), answers: AnswersSchema }));
export type Cache = z.infer<typeof CacheSchema>;
type Entry = Cache[string];

export const isStale = (entry: Entry | undefined, fingerprint: string): boolean =>
  entry !== undefined && entry.questions !== fingerprint;

// Which rows have a current cached answer, which have none, and which were
// fetched under different questions. Makes no requests.
export function cacheStatus(rows: readonly { id: string }[], cache: Cache, fingerprint: string) {
  const fresh: string[] = [];
  const missing: string[] = [];
  const stale: string[] = [];
  for (const { id } of rows) {
    const hit = cache[id];
    if (!hit) missing.push(id);
    else if (isStale(hit, fingerprint)) stale.push(id);
    else fresh.push(id);
  }
  return { fresh, missing, stale };
}
