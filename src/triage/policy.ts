import type { Answers, Priority, TriageDecision } from "../types";
import { QUESTIONS } from "./questions";

export type PolicyParams = {
  junkBelow: number;
  securityAbove: number;
  outageAbove: number;
  weights: { impact: number; time: number; frustration: number };
  thresholds: { urgent: number; high: number; normal: number };
  teamConfidenceFloor: number;
  frustratedTagAt: number;
};

// Starting guesses from spec Section 3. Task 7 replaces them with swept values.
export const DEFAULT_PARAMS: PolicyParams = {
  junkBelow: 0.3,
  securityAbove: 0.7,
  outageAbove: 0.7,
  weights: { impact: 0.6, time: 0.3, frustration: 0.1 },
  thresholds: { urgent: 0.75, high: 0.5, normal: 0.25 },
  teamConfidenceFloor: 0.6,
  frustratedTagAt: 2,
};

// Normalise each Score to 0..1 by its top level, read from the question itself.
const top = (q: { criteria: readonly unknown[] }) => q.criteria.length - 1;

export function urgency(a: Answers, w: PolicyParams["weights"]): number {
  return (
    (w.impact * a.impact_severity.score) / top(QUESTIONS.impact_severity) +
    (w.time * a.time_pressure.score) / top(QUESTIONS.time_pressure) +
    (w.frustration * a.customer_frustration.score) / top(QUESTIONS.customer_frustration)
  );
}

function band(u: number, t: PolicyParams["thresholds"]): Priority {
  if (u >= t.urgent) return "urgent";
  if (u >= t.high) return "high";
  if (u >= t.normal) return "normal";
  return "low";
}

function route(t: Answers["team"], floor: number): { team: string | null; tags: string[] } {
  if (t.choice === "none") return { team: null, tags: ["needs-triage"] };
  if (t.confidence < floor) return { team: null, tags: ["needs-triage", `jev-guess-${t.choice}`] };
  return { team: t.choice, tags: [] };
}

export function decide(a: Answers, p: PolicyParams = DEFAULT_PARAMS): TriageDecision {
  const evidence = { ...a };
  if (a.has_request.noul < p.junkBelow) {
    return { priority: "low", team: null, tags: ["jev-triaged", "jev-p-low", "needs-triage", "jev-junk"], evidence };
  }

  // Gates are separate conditions, not weights, so a calm security report
  // cannot average itself down.
  const isSecurity = a.is_security_or_data_loss.noul > p.securityAbove;
  const isOutage = a.is_outage.noul > p.outageAbove;
  const priority = isSecurity || isOutage ? "urgent" : band(urgency(a, p.weights), p.thresholds);
  const routing = route(a.team, p.teamConfidenceFloor);

  return {
    priority,
    team: routing.team,
    tags: [
      "jev-triaged",
      `jev-p-${priority}`,
      ...routing.tags,
      ...(isSecurity ? ["jev-security"] : []),
      ...(a.customer_frustration.score >= p.frustratedTagAt ? ["jev-frustrated"] : []),
    ],
    evidence,
  };
}
