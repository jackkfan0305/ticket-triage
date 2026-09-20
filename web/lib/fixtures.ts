import { readFile } from "node:fs/promises";
import path from "node:path";
import { parse } from "csv-parse/sync";
import { AnswersSchema, type Answers, type Ticket } from "../../src/types";

export type CachedTicket = Ticket & { answers: Answers };
export type CachedRun = { model: string; tickets: CachedTicket[] };

const FIXTURES = path.join(process.cwd(), "..", "tests", "fixtures");

type CsvRow = { id: string; subject: string; body: string };
type CacheEntry = { model: string; answers: unknown };

/**
 * Reads the 60-ticket eval set and the cached Jev answers beside it. Server
 * only: the page passes the result to the client so the board has something to
 * render before any live run.
 */
export async function loadCachedRun(): Promise<CachedRun> {
  const [csv, json] = await Promise.all([
    readFile(path.join(FIXTURES, "evalset.csv"), "utf8"),
    readFile(path.join(FIXTURES, "answers.json"), "utf8"),
  ]);

  const rows = parse(csv, { columns: true, skip_empty_lines: true }) as CsvRow[];
  const cache = JSON.parse(json) as Record<string, CacheEntry>;

  const tickets: CachedTicket[] = [];
  const models = new Set<string>();

  for (const row of rows) {
    const entry = cache[row.id];
    if (!entry) continue; // a ticket with no cached answer has no evidence to show
    models.add(entry.model);
    tickets.push({
      id: row.id,
      subject: row.subject,
      body: row.body,
      answers: AnswersSchema.parse(entry.answers),
    });
  }

  return { model: [...models].join(", ") || "unknown", tickets };
}
