import { expect, test } from "bun:test";
import { questionsFingerprint } from "../scripts/fingerprint";

test("is a 12-char hex string, stable across calls", () => {
  const a = questionsFingerprint();
  expect(a).toMatch(/^[0-9a-f]{12}$/);
  expect(questionsFingerprint()).toBe(a);
});
