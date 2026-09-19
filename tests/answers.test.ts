import { describe, expect, test } from "bun:test";
import { AnswersSchema } from "../src/types";
import { makeAnswers } from "./helpers";

const live = {
  has_request: { type: "noul", noul: 0.86 },
  is_security_or_data_loss: { type: "noul", noul: 0.02 },
  is_outage: { type: "noul", noul: 0.04 },
  impact_severity: {
    type: "score",
    score: 2.7,
    confidence: 0.81,
    legend: { "0": "a", "1": "b", "2": "c", "3": "d", "4": "e" },
    probabilities: { "0": 0, "1": 0.05, "2": 0.2, "3": 0.75, "4": 0 },
  },
  time_pressure: { type: "score", score: 1, confidence: 0.9, legend: {}, probabilities: {} },
  customer_frustration: { type: "score", score: 0.4, confidence: 0.7, legend: {}, probabilities: {} },
  team: {
    type: "choice",
    choice: "account_access",
    confidence: 0.99,
    probabilities: { account_access: 0.99, none: 0.01 },
  },
};

describe("AnswersSchema", () => {
  test("accepts a response shaped like the live API", () => {
    expect(AnswersSchema.parse(live).team.choice).toBe("account_access");
  });

  test("keeps fields it does not know about, so evidence stays complete", () => {
    const withExtra = { ...live, team: { ...live.team, rationale_v2: "x" } };
    expect(AnswersSchema.parse(withExtra).team).toHaveProperty("rationale_v2", "x");
  });

  test("accepts the test fixture builder's output", () => {
    expect(() => AnswersSchema.parse(makeAnswers())).not.toThrow();
  });

  test.each([
    ["a missing question", (a: Record<string, unknown>) => ({ ...a, team: undefined })],
    ["a team outside the roster", (a: Record<string, unknown>) => ({ ...a, team: { ...live.team, choice: "legal" } })],
    ["a noul above 1", (a: Record<string, unknown>) => ({ ...a, is_outage: { type: "noul", noul: 1.2 } })],
    ["a score above its top level", (a: Record<string, unknown>) => ({ ...a, time_pressure: { ...live.time_pressure, score: 3.5 } })],
    ["a wrong answer type", (a: Record<string, unknown>) => ({ ...a, has_request: live.impact_severity })],
  ])("rejects %s", (_name, mutate) => {
    expect(() => AnswersSchema.parse(mutate(live))).toThrow();
  });
});
