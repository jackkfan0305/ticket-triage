import { expect, test } from "bun:test";
import { cacheStatus, type Cache } from "../scripts/cache";
import { makeAnswers } from "./helpers";

const FP = "abc123abc123";
const entry = (questions: string) => ({ model: "jev-test", questions, answers: makeAnswers() });

test("cacheStatus splits rows into fresh, missing, and stale ids", () => {
  const rows = [{ id: "a" }, { id: "b" }, { id: "c" }];
  const cache: Cache = { a: entry(FP), c: entry("old000old000") };

  expect(cacheStatus(rows, cache, FP)).toEqual({ fresh: ["a"], missing: ["b"], stale: ["c"] });
});
