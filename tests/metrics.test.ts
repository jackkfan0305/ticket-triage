import { expect, test } from "bun:test";
import { computeMetrics, type Scored } from "../scripts/metrics";
import type { Priority, TeamChoice } from "../src/types";

const row = (expectedPriority: Priority, expectedTeam: TeamChoice, priority: Priority, team: string | null): Scored => ({
  expectedPriority,
  expectedTeam,
  decision: { priority, team, tags: [], evidence: {} },
});

test("computes every metric over a small mixed set", () => {
  const m = computeMetrics([
    row("urgent", "billing", "urgent", "billing"), // exact, routed right
    row("urgent", "technical_support", "high", "onboarding"), // within one, misrouted
    row("normal", "none", "normal", null), // exact, correctly unrouted
    row("low", "sales", "urgent", null), // three bands off, unrouted
  ]);
  expect(m).toEqual({
    n: 4,
    priorityExact: 0.5,
    priorityWithinOne: 0.75,
    urgentRecall: 0.5,
    routingAccuracy: 0.5,
    needsTriageRate: 0.5,
    noneRecall: 1,
    misroutes: { "technical_support->onboarding": 1 },
  });
});

test("routing a ticket labelled none counts as a misroute", () => {
  expect(computeMetrics([row("low", "none", "low", "billing")]).misroutes).toEqual({ "none->billing": 1 });
});

test("empty input gives null rates rather than NaN", () => {
  expect(computeMetrics([])).toEqual({
    n: 0,
    priorityExact: null,
    priorityWithinOne: null,
    urgentRecall: null,
    routingAccuracy: null,
    needsTriageRate: null,
    noneRecall: null,
    misroutes: {},
  });
});
