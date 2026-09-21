import { expect, test } from "bun:test";
import { mkdtemp, readdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { cacheStatus, CacheSchema, fillCache, writeCache, type Cache } from "../scripts/cache";
import { requestFingerprint } from "../scripts/fingerprint";
import { makeAnswers } from "./helpers";

const FP = "abc123abc123";
const ticket = (id: string, body = "please refund me") => ({ id, subject: "refund", body });
const entry = (questions: string, t = ticket("x")) => ({
  model: "jev-test",
  questions,
  request: requestFingerprint(t),
  answers: makeAnswers(),
});

test("cacheStatus splits rows into fresh, missing, and stale ids", () => {
  const rows = [ticket("a"), ticket("b"), ticket("c")];
  const cache: Cache = { a: entry(FP, rows[0]), c: entry("old000old000", rows[2]) };

  expect(cacheStatus(rows, cache, FP)).toEqual({ fresh: ["a"], missing: ["b"], stale: ["c"] });
});

test("an entry is stale when its ticket text was edited under the same id", () => {
  const cache: Cache = { a: entry(FP, ticket("a", "old body")) };

  expect(cacheStatus([ticket("a", "new body")], cache, FP).stale).toEqual(["a"]);
});

test("an entry without a request fingerprint is stale", () => {
  const { request: _, ...legacy } = entry(FP, ticket("a"));

  expect(cacheStatus([ticket("a")], { a: legacy }, FP).stale).toEqual(["a"]);
});

const tempDir = () => mkdtemp(join(tmpdir(), "cache-test-"));

test("writeCache replaces the cache file and leaves no temp file behind", async () => {
  const dir = await tempDir();
  const path = join(dir, "answers.json");
  await writeFile(path, "{}\n");
  const cache: Cache = { a: entry(FP, ticket("a")) };

  await writeCache(path, cache);

  expect(CacheSchema.parse(await Bun.file(path).json())).toEqual(cache);
  expect(await readdir(dir)).toEqual(["answers.json"]);
});

test("fillCache stops asking once a cache write fails", async () => {
  const dir = await tempDir();
  await writeFile(join(dir, "not-a-dir"), "");
  const path = join(dir, "not-a-dir", "answers.json");
  let asked = 0;
  const ask = async () => {
    asked++;
    return { model: "jev-test", answers: makeAnswers() };
  };

  const run = fillCache([ticket("a"), ticket("b")], {}, { refresh: false, fingerprint: FP, path, ask });

  await expect(run).rejects.toThrow("cache write failed");
  expect(asked).toBe(1);
});
