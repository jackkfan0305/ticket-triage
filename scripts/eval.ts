import { parseArgs } from "node:util";
import { TypeSafeClient } from "@typesafe-ai/sdk";
import { parse } from "csv-parse/sync";
import { z } from "zod";
import { askJev } from "../src/triage/run";
import { AnswersSchema, PRIORITIES, TEAM_CHOICES } from "../src/types";
import { computeMetrics, type Metrics, type Scored } from "./metrics";
import { DEFAULT_PARAMS, decide, type PolicyParams } from "../src/triage/policy";

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

function score(rows: readonly EvalRow[], cache: Cache, params: PolicyParams): Scored[] {
  return rows.flatMap((r) => {
    const hit = cache[r.id];
    if (!hit || r.expected_priority === "" || r.expected_team === "") return [];
    return [{ expectedPriority: r.expected_priority, expectedTeam: r.expected_team, decision: decide(hit.answers, params) }];
  });
}

const pct = (x: number | null) => (x === null ? "n/a" : `${(x * 100).toFixed(1)}%`);

function summary(m: Metrics) {
  return {
    urgentRecall: pct(m.urgentRecall),
    exact: pct(m.priorityExact),
    withinOne: pct(m.priorityWithinOne),
    routing: pct(m.routingAccuracy),
    needsTriage: pct(m.needsTriageRate),
    noneRecall: pct(m.noneRecall),
  };
}

const steps = (from: number, to: number, by: number) =>
  Array.from({ length: Math.round((to - from) / by) + 1 }, (_, i) => Number((from + i * by).toFixed(2)));

// Priority and routing do not interact, so each gets its own sweep.
function sweepPriority(rows: readonly EvalRow[], cache: Cache) {
  const results = steps(0.6, 0.9, 0.05).flatMap((urgent) =>
    steps(0.35, 0.65, 0.05).flatMap((high) =>
      steps(0.1, 0.4, 0.05).flatMap((normal) =>
        [0, 0.1].flatMap((frustration) => {
          if (!(urgent > high && high > normal)) return [];
          const params = {
            ...DEFAULT_PARAMS,
            thresholds: { urgent, high, normal },
            weights: { ...DEFAULT_PARAMS.weights, frustration },
          };
          return [{ urgent, high, normal, frustration, m: computeMetrics(score(rows, cache, params)) }];
        }),
      ),
    ),
  );
  const ranked = results.toSorted(
    (a, b) =>
      (b.m.urgentRecall ?? -1) - (a.m.urgentRecall ?? -1) ||
      (b.m.priorityExact ?? -1) - (a.m.priorityExact ?? -1) ||
      (b.m.priorityWithinOne ?? -1) - (a.m.priorityWithinOne ?? -1),
  );
  console.log("priority sweep, top 20 by urgent recall then exact match");
  console.table(
    ranked.slice(0, 20).map(({ m, ...p }) => ({ ...p, urgentRecall: pct(m.urgentRecall), exact: pct(m.priorityExact), withinOne: pct(m.priorityWithinOne) })),
  );
}

function sweepRouting(rows: readonly EvalRow[], cache: Cache) {
  console.log("routing floor sweep");
  console.table(
    steps(0.3, 0.9, 0.05).map((floor) => {
      const m = computeMetrics(score(rows, cache, { ...DEFAULT_PARAMS, teamConfidenceFloor: floor }));
      return { floor, routing: pct(m.routingAccuracy), needsTriage: pct(m.needsTriageRate), noneRecall: pct(m.noneRecall) };
    }),
  );
}

const { values } = parseArgs({
  args: Bun.argv.slice(2),
  options: {
    refresh: { type: "boolean", default: false },
    sweep: { type: "boolean", default: false },
  },
});

const rows = await loadRows();
const { cache, errored } = await fillCache(rows, await loadCache(), values.refresh);
const labelled = score(rows, cache, DEFAULT_PARAMS).length;
console.log(
  `${Object.keys(cache).length}/${rows.length} cached, ${errored.length} errored this run, ${labelled} labelled and scored`,
);

if (labelled === 0) {
  console.log("no labelled rows yet: fill expected_priority and expected_team in tests/fixtures/evalset.csv");
} else if (values.sweep) {
  sweepPriority(rows, cache);
  sweepRouting(rows, cache);
} else {
  const m = computeMetrics(score(rows, cache, DEFAULT_PARAMS));
  console.table(summary(m));
  console.log("misroutes (expected->got):", m.misroutes);
}
if (errored.length > 0) process.exitCode = 1;
