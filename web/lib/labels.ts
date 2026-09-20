import { QUESTIONS } from "../../src/triage/questions";
import { TEAM_IDS } from "../../src/config/teams";

export const GATE_KEYS = ["has_request", "is_security_or_data_loss", "is_outage"] as const;
export type GateKey = (typeof GATE_KEYS)[number];

export const GATE_LABEL: Record<GateKey, string> = {
  has_request: "Genuine request (has_request)",
  is_security_or_data_loss: "Security / data loss",
  is_outage: "Service outage",
};

export const SCORE_KEYS = ["impact_severity", "time_pressure", "customer_frustration"] as const;
export type ScoreKey = (typeof SCORE_KEYS)[number];

export const SCORE_LABEL: Record<ScoreKey, string> = {
  impact_severity: "Impact severity",
  time_pressure: "Time pressure",
  customer_frustration: "Customer frustration",
};

/** Criteria text comes from the questions the model was actually asked. */
export const CRITERIA: Record<ScoreKey, readonly string[]> = {
  impact_severity: QUESTIONS.impact_severity.criteria,
  time_pressure: QUESTIONS.time_pressure.criteria,
  customer_frustration: QUESTIONS.customer_frustration.criteria,
};

/** Top level of each score, read from the question rather than hardcoded. */
export const TOP: Record<ScoreKey, number> = {
  impact_severity: CRITERIA.impact_severity.length - 1,
  time_pressure: CRITERIA.time_pressure.length - 1,
  customer_frustration: CRITERIA.customer_frustration.length - 1,
};

export const TEAM_OPTIONS = [...TEAM_IDS, "none"] as const;

export const PRIORITY_FILTERS = ["all", "urgent", "high", "normal", "low", "needs-triage"] as const;
export type FilterKey = (typeof PRIORITY_FILTERS)[number];

export const humanTeam = (team: string) => team.replace(/_/g, " ");
