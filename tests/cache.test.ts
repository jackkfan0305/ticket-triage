import { expect, test } from "bun:test";
import { cacheStatus, type Cache } from "../scripts/cache";
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
