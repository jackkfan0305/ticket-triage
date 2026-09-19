import { parseArgs } from "node:util";
import { TypeSafeClient } from "@typesafe-ai/sdk";
import { parse } from "csv-parse/sync";
import { z } from "zod";
import { askJev } from "../src/triage/run";
import { AnswersSchema, PRIORITIES, TEAM_CHOICES } from "../src/types";

const EVALSET = new URL("../tests/fixtures/evalset.csv", import.meta.url);
const CACHE = new URL("../tests/fixtures/answers.json", import.meta.url);

const EvalRowSchema = z.object({
  id: z.string().min(1),
  subject: z.string(),
  body: z.string(),
  src_priority: z.string(),
  src_queue: z.string(),
  expected_priority: z.union([z.enum(PRIORITIES), z.literal("")]),
  expected_team: z.union([z.enum(TEAM_CHOICES), z.literal("")]),
});
type EvalRow = z.infer<typeof EvalRowSchema>;

const CacheSchema = z.record(z.string(), z.object({ model: z.string(), answers: AnswersSchema }));
type Cache = z.infer<typeof CacheSchema>;

async function loadRows(): Promise<EvalRow[]> {
  const records = parse(await Bun.file(EVALSET).text(), { columns: true, skip_empty_lines: true });
  return z.array(EvalRowSchema).parse(records);
}

async function loadCache(): Promise<Cache> {
  const file = Bun.file(CACHE);
  return (await file.exists()) ? CacheSchema.parse(await file.json()) : {};
}

async function fillCache(
  rows: readonly EvalRow[],
  start: Cache,
  refresh: boolean,
): Promise<{ cache: Cache; errored: string[] }> {
  const todo = rows.filter((r) => refresh || !start[r.id]);
  if (todo.length === 0) return { cache: start, errored: [] };

  const client = new TypeSafeClient();
  let cache = start;
  const errored: string[] = [];
  for (const row of todo) {
    try {
      cache = { ...cache, [row.id]: await askJev(row, client) };
      // Written after every ticket so a crash keeps everything already paid for.
      await Bun.write(CACHE, `${JSON.stringify(cache, null, 2)}\n`);
      console.error(`fetched ${row.id}`);
    } catch (err) {
      errored.push(row.id);
      console.error(`${row.id} errored: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  return { cache, errored };
}

const { values } = parseArgs({
  args: Bun.argv.slice(2),
  options: { refresh: { type: "boolean", default: false } },
});

const rows = await loadRows();
const { cache, errored } = await fillCache(rows, await loadCache(), values.refresh);
console.log(`${Object.keys(cache).length}/${rows.length} cached, ${errored.length} errored this run`);
if (errored.length > 0) process.exitCode = 1;
