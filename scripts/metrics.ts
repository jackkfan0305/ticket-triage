import { PRIORITIES, type Priority, type TeamChoice, type TriageDecision } from "../src/types";

export type Scored = { expectedPriority: Priority; expectedTeam: TeamChoice; decision: TriageDecision };

export type Metrics = {
  n: number;
  priorityExact: number | null;
  priorityWithinOne: number | null;
  urgentRecall: number | null; // weighted above the rest: a missed urgent costs a customer
  routingAccuracy: number | null; // over routed tickets only
  needsTriageRate: number | null;
  noneRecall: number | null; // did the no-match branch fire when it should
  misroutes: Record<string, number>; // "expected->got"
};

const rate = (hits: number, total: number): number | null => (total === 0 ? null : hits / total);
const rank = (p: Priority): number => PRIORITIES.indexOf(p);

export function computeMetrics(rows: readonly Scored[]): Metrics {
  const urgent = rows.filter((r) => r.expectedPriority === "urgent");
  const routed = rows.filter((r) => r.decision.team !== null);
  const none = rows.filter((r) => r.expectedTeam === "none");
  const wrong = routed.filter((r) => r.decision.team !== r.expectedTeam);
  const grouped = Object.groupBy(wrong, (r) => `${r.expectedTeam}->${r.decision.team}`);

  return {
    n: rows.length,
    priorityExact: rate(rows.filter((r) => r.decision.priority === r.expectedPriority).length, rows.length),
    priorityWithinOne: rate(
      rows.filter((r) => Math.abs(rank(r.decision.priority) - rank(r.expectedPriority)) <= 1).length,
      rows.length,
    ),
    urgentRecall: rate(urgent.filter((r) => r.decision.priority === "urgent").length, urgent.length),
    routingAccuracy: rate(routed.length - wrong.length, routed.length),
    needsTriageRate: rate(rows.length - routed.length, rows.length),
    noneRecall: rate(none.filter((r) => r.decision.team === null).length, none.length),
    misroutes: Object.fromEntries(Object.entries(grouped).map(([k, v]) => [k, v?.length ?? 0])),
  };
}
