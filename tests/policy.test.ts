import { describe, expect, test } from "bun:test";
import { DEFAULT_PARAMS, decide, type PolicyParams } from "../src/triage/policy";
import { type AnswerOverrides, makeAnswers } from "./helpers";

const P: PolicyParams = {
  junkBelow: 0.3,
  securityAbove: 0.7,
  outageAbove: 0.7,
  weights: { impact: 0.6, time: 0.3, frustration: 0.1 },
  thresholds: { urgent: 0.75, high: 0.5, normal: 0.25 },
  teamConfidenceFloor: 0.6,
  frustratedTagAt: 2,
};

const run = (o: AnswerOverrides, p: PolicyParams = P) => decide(makeAnswers(o), p);

describe("gates", () => {
  test("junk wins over every other gate", () => {
    expect(run({ hasRequest: 0.1, security: 0.99, outage: 0.99 })).toMatchObject({
      priority: "low",
      team: null,
      tags: ["jev-triaged", "jev-p-low", "needs-triage", "jev-junk"],
    });
  });

  test("has_request exactly at the floor is not junk", () => {
    expect(run({ hasRequest: 0.3 }).tags).not.toContain("jev-junk");
  });

  test("a calm security report is urgent and still routed", () => {
    expect(run({ security: 0.9 })).toMatchObject({
      priority: "urgent",
      team: "billing",
      tags: ["jev-triaged", "jev-p-urgent", "jev-security"],
    });
  });

  test("security exactly at the gate does not fire", () => {
    expect(run({ security: 0.7 }).priority).toBe("low");
  });

  test("an outage is urgent without a security tag", () => {
    expect(run({ outage: 0.9 })).toMatchObject({ priority: "urgent", tags: ["jev-triaged", "jev-p-urgent"] });
  });
});

describe("weighted urgency", () => {
  test.each([
    [{ impact: 4, time: 3 }, "urgent"], // 0.60 + 0.30
    [{ impact: 3, time: 1 }, "high"], // 0.45 + 0.10
    [{ impact: 2 }, "normal"], // 0.30
    [{ impact: 1 }, "low"], // 0.15
    [{ frustration: 3 }, "low"], // 0.10: shouting alone cannot raise priority
  ] as const)("%o -> %s", (o, priority) => {
    expect(run(o).priority).toBe(priority);
  });

  test.each([
    [3, "urgent"],
    [2, "high"],
    [1, "normal"],
    [0, "low"],
  ] as const)("thresholds are inclusive: impact %d alone at weight 1 -> %s", (impact, priority) => {
    const impactOnly = { ...P, weights: { impact: 1, time: 0, frustration: 0 } };
    expect(run({ impact }, impactOnly).priority).toBe(priority);
  });

  test("a sum that lands on a threshold in exact arithmetic reaches it despite float error", () => {
    // 0.45 + 0.15 + 0.075 is 0.75, but floats give 0.7499999999999999.
    expect(decide(makeAnswers({ impact: 3, time: 2, frustration: 3 }), DEFAULT_PARAMS).priority).toBe("urgent");
  });
});

describe("frustration tag", () => {
  test("tags at the threshold, not below it", () => {
    expect(run({ frustration: 2 }).tags).toContain("jev-frustrated");
    expect(run({ frustration: 1.99 }).tags).not.toContain("jev-frustrated");
  });
});

describe("routing", () => {
  test("none leaves the ticket unrouted", () => {
    expect(run({ team: "none" })).toMatchObject({ team: null, tags: ["jev-triaged", "jev-p-low", "needs-triage"] });
  });

  test("low confidence records the suppressed guess", () => {
    expect(run({ team: "onboarding", teamConfidence: 0.59 })).toMatchObject({
      team: null,
      tags: ["jev-triaged", "jev-p-low", "needs-triage", "jev-guess-onboarding"],
    });
  });

  test("confidence exactly at the floor routes", () => {
    expect(run({ team: "onboarding", teamConfidence: 0.6 }).team).toBe("onboarding");
  });
});

describe("purity and evidence", () => {
  test("evidence is a complete copy of the answers, and the input is untouched", () => {
    const answers = makeAnswers({ impact: 2 });
    const before = structuredClone(answers);
    const decision = decide(answers, P);
    expect(decision.evidence).toEqual(before);
    expect(decision.evidence).not.toBe(answers);
    expect(answers).toEqual(before);
  });

  test("default thresholds are ordered", () => {
    const t = DEFAULT_PARAMS.thresholds;
    expect(t.urgent > t.high && t.high > t.normal).toBe(true);
  });
});
