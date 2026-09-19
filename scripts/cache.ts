import { z } from "zod";
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
