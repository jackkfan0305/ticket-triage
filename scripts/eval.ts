import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { TypeSafeClient } from "@typesafe-ai/sdk";
import { parse } from "csv-parse/sync";
import { z } from "zod";
import { askJev } from "../src/triage/run";
import { PRIORITIES, TEAM_CHOICES } from "../src/types";
import { computeMetrics, type Metrics, type Scored } from "./metrics";
import { DEFAULT_PARAMS, decide, type PolicyParams } from "../src/triage/policy";
import { questionsFingerprint } from "./fingerprint";
import { CacheSchema, cacheStatus, DEFAULT_CONCURRENCY, fillCache, isStale, type Cache } from "./cache";

const EVALSET = new URL("../tests/fixtures/evalset.csv", import.meta.url);
const CACHE = fileURLToPath(new URL("../tests/fixtures/answers.json", import.meta.url));

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

async function loadRows(): Promise<EvalRow[]> {
  const records = parse(await Bun.file(EVALSET).text(), { columns: true, skip_empty_lines: true });
  return z.array(EvalRowSchema).parse(records);
}

async function loadCache(): Promise<Cache> {
  const file = Bun.file(CACHE);
  return (await file.exists()) ? CacheSchema.parse(await file.json()) : {};
}

// A stale entry (different questions or ticket text) never scores as current,
// even if a refetch attempt for it errored and left the old answer in place.
function score(rows: readonly EvalRow[], cache: Cache, params: PolicyParams, fingerprint: string): Scored[] {
  return rows.flatMap((r) => {
    const hit = cache[r.id];
    if (!hit || isStale(hit, r, fingerprint) || r.expected_priority === "" || r.expected_team === "") return [];
    return [{ expectedPriority: r.expected_priority, expectedTeam: r.expected_team, decision: decide(hit.answers, params) }];
  });
}

const pct = (x: number | null) => (x === null ? "n/a" : `${(x * 100).toFixed(1)}%`);

const secs = (ms: number) => `${(ms / 1000).toFixed(1)}s`;

// Per-request times are wall time under whatever concurrency ran, so they rise
// as workers are added; the total is what actually shortens. Median against max
// says whether a slow run was uniform or one outlier.
function timing(durations: readonly number[], totalMs: number, workers: number): string {
  if (durations.length === 0) return `no requests this run, ${secs(totalMs)} total`;
  const sorted = durations.toSorted((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)]!;
  const mean = Math.round(durations.reduce((a, b) => a + b, 0) / durations.length);
  return `${durations.length} requests in ${secs(totalMs)} at concurrency ${workers}: mean ${mean}ms, median ${median}ms, min ${sorted[0]}ms, max ${sorted.at(-1)}ms`;
}

function summary(m: Metrics, urgentCount: number, noneCount: number) {
  return {
    n: m.n,
    urgentRecall: pct(m.urgentRecall),
    urgentN: urgentCount,
    exact: pct(m.priorityExact),
    withinOne: pct(m.priorityWithinOne),
    routing: pct(m.routingAccuracy),
    needsTriage: pct(m.needsTriageRate),
    noneRecall: pct(m.noneRecall),
    noneN: noneCount,
  };
}

const steps = (from: number, to: number, by: number) =>
  Array.from({ length: Math.round((to - from) / by) + 1 }, (_, i) => Number((from + i * by).toFixed(2)));

// Priority and routing do not interact, so each gets its own sweep.
function sweepPriority(rows: readonly EvalRow[], cache: Cache, fingerprint: string) {
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
          return [{ urgent, high, normal, frustration, m: computeMetrics(score(rows, cache, params, fingerprint)) }];
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

function sweepRouting(rows: readonly EvalRow[], cache: Cache, fingerprint: string) {
  console.log("routing floor sweep");
  console.table(
    steps(0.3, 0.9, 0.05).map((floor) => {
      const m = computeMetrics(score(rows, cache, { ...DEFAULT_PARAMS, teamConfidenceFloor: floor }, fingerprint));
      return { floor, routing: pct(m.routingAccuracy), needsTriage: pct(m.needsTriageRate), noneRecall: pct(m.noneRecall) };
    }),
  );
}

const { values } = parseArgs({
  args: Bun.argv.slice(2),
  options: {
    refresh: { type: "boolean", default: false },
    sweep: { type: "boolean", default: false },
    concurrency: { type: "string", default: String(DEFAULT_CONCURRENCY) },
  },
});

const concurrency = Number(values.concurrency);
if (!Number.isInteger(concurrency) || concurrency < 1) {
  console.error(`--concurrency must be a positive integer, got "${values.concurrency}"`);
  process.exit(2);
}

const rows = await loadRows();
const fingerprint = questionsFingerprint();

const halfLabelled = rows.filter((r) => (r.expected_priority === "") !== (r.expected_team === "")).map((r) => r.id);
if (halfLabelled.length > 0) {
  console.error(`half-labelled rows skipped: ${halfLabelled.join(", ")}`);
}

if (values.sweep && values.refresh) {
  console.error("--sweep never calls the API; run --refresh on its own first");
  process.exit(1);
}

// --sweep is cache-only: it names what it cannot score instead of paying to fetch it.
const start = await loadCache();
let client: TypeSafeClient | undefined;
const runStarted = performance.now();
const { cache, errored, durations } = values.sweep
  ? { cache: start, errored: [] as string[], durations: [] as number[] }
  : await fillCache(rows, start, {
      refresh: values.refresh,
      fingerprint,
      path: CACHE,
      // Built on first use, so a run with nothing to fetch never creates a client.
      ask: (row) => askJev(row, (client ??= new TypeSafeClient())),
      concurrency,
    });
if (values.sweep) {
  const { missing, stale } = cacheStatus(rows, cache, fingerprint);
  if (missing.length > 0) console.error(`not cached, not scored: ${missing.join(", ")}`);
  if (stale.length > 0) console.error(`stale, not scored: ${stale.join(", ")}`);
}
// A refetch that errored leaves the previous answer on disk, so scoring it would
// mix old and new answers in one run. The disk keeps it; the scoring view drops it.
const scorable: Cache = Object.fromEntries(Object.entries(cache).filter(([id]) => !errored.includes(id)));
const scored = score(rows, scorable, DEFAULT_PARAMS, fingerprint);
const staleSkipped = rows.filter(
  (r) => r.expected_priority !== "" && r.expected_team !== "" && isStale(scorable[r.id], r, fingerprint),
).length;
console.log(
  `${Object.keys(cache).length}/${rows.length} cached, ${errored.length} errored this run, ${scored.length} labelled and scored, ${staleSkipped} skipped as stale`,
);
console.log(timing(durations, performance.now() - runStarted, concurrency));

if (scored.length === 0) {
  console.log("no labelled rows yet: fill expected_priority and expected_team in tests/fixtures/evalset.csv");
} else if (values.sweep) {
  sweepPriority(rows, scorable, fingerprint);
  sweepRouting(rows, scorable, fingerprint);
} else {
  const m = computeMetrics(scored);
  const urgentCount = scored.filter((r) => r.expectedPriority === "urgent").length;
  const noneCount = scored.filter((r) => r.expectedTeam === "none").length;
  console.table(summary(m, urgentCount, noneCount));
  console.log("misroutes (expected->got):", m.misroutes);
}
if (errored.length > 0) process.exitCode = 1;
