import { decide, urgency, type PolicyParams } from "../../src/triage/policy";
import type { Answers, TriageDecision } from "../../src/types";
import { SCORE_KEYS, TOP, type FilterKey } from "./labels";

export type RunResult = { answers: Answers; latencyMs: number; model: string };

export type Row = {
  id: string;
  subject: string;
  body: string;
  /** the prior cached pass; null for a ticket the user wrote */
  cached: Answers | null;
  /** the most recent live pass, kept alongside cached so the two can be compared */
  live: RunResult | null;
  pending: boolean;
  own: boolean;
};

/** Live wins when it exists, so the board shows the freshest evidence. */
export const answersOf = (row: Row): Answers | null => row.live?.answers ?? row.cached;

export type Verdict = TriageDecision & {
  urgency: number;
  isSecurity: boolean;
  isOutage: boolean;
  isJunk: boolean;
};

/**
 * decide() imported straight from src/ is the single source of truth; this only
 * re-derives which branch it took so the evidence view can explain the result.
 */
export function verdictOf(answers: Answers, params: PolicyParams): Verdict {
  const decision = decide(answers, params);
  const isJunk = answers.has_request.noul < params.junkBelow;
  return {
    ...decision,
    urgency: urgency(answers, params.weights),
    isSecurity: !isJunk && answers.is_security_or_data_loss.noul > params.securityAbove,
    isOutage: !isJunk && answers.is_outage.noul > params.outageAbove,
    isJunk,
  };
}

export function matchesFilter(verdict: Verdict | null, filter: FilterKey): boolean {
  if (filter === "all") return true;
  if (verdict === null) return true; // a pending ticket stays put rather than vanishing
  if (filter === "needs-triage") return verdict.team === null;
  return verdict.priority === filter;
}

export function visibleRows(rows: readonly Row[], params: PolicyParams, filter: FilterKey): Row[] {
  return rows.filter((row) => {
    const answers = answersOf(row);
    return matchesFilter(answers ? verdictOf(answers, params) : null, filter);
  });
}

export type NearestEdge = { distance: number; name: string; at: number; above: boolean };

/** How close this ticket came to landing in a different band. */
export function nearestEdge(u: number, thresholds: PolicyParams["thresholds"]): NearestEdge {
  const edges = [
    { name: "normal", at: thresholds.normal },
    { name: "high", at: thresholds.high },
    { name: "urgent", at: thresholds.urgent },
  ];
  let best: NearestEdge | null = null;
  for (const edge of edges) {
    const distance = Math.abs(u - edge.at);
    if (best === null || distance < best.distance) {
      best = { distance, name: edge.name, at: edge.at, above: u >= edge.at };
    }
  }
  return best as NearestEdge;
}

export type Weakest = { key: string; confidence: number };

const WEAKEST_LABEL: Record<string, string> = {
  impact_severity: "impact",
  time_pressure: "time pressure",
  customer_frustration: "frustration",
};

/** The judgment the model was least sure of. */
export function leastCertain(answers: Answers): Weakest {
  const candidates: Weakest[] = [
    ...SCORE_KEYS.map((key) => ({ key: WEAKEST_LABEL[key] as string, confidence: answers[key].confidence })),
    { key: "team", confidence: answers.team.confidence },
  ];
  return candidates.reduce((a, b) => (b.confidence < a.confidence ? b : a));
}

/** Tags worth rendering: the rest either repeat the priority or sit on every row. */
export const meaningfulTags = (tags: readonly string[]) =>
  tags.filter((tag) => tag !== "jev-triaged" && !tag.startsWith("jev-p-"));

export const scoreTop = (key: (typeof SCORE_KEYS)[number]) => TOP[key];
