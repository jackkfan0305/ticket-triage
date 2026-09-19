import { expect, test } from "bun:test";
import { questionsFingerprint, requestFingerprint } from "../scripts/fingerprint";

test("is a 12-char hex string, stable across calls", () => {
  const a = questionsFingerprint();
  expect(a).toMatch(/^[0-9a-f]{12}$/);
  expect(questionsFingerprint()).toBe(a);
});

test("request fingerprint changes when the subject or body changes", () => {
  const base = requestFingerprint({ subject: "s", body: "b" });
  expect(base).toMatch(/^[0-9a-f]{12}$/);
  expect(requestFingerprint({ subject: "s", body: "b" })).toBe(base);
  expect(requestFingerprint({ subject: "s2", body: "b" })).not.toBe(base);
  expect(requestFingerprint({ subject: "s", body: "b2" })).not.toBe(base);
});
