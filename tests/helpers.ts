import type { Answers, TeamChoice } from "../src/types";

export type AnswerOverrides = {
  hasRequest?: number;
  security?: number;
  outage?: number;
  impact?: number;
  time?: number;
  frustration?: number;
  team?: TeamChoice;
  teamConfidence?: number;
};

const noul = (value: number) => ({ type: "noul" as const, noul: value });
const score = (value: number) => ({
  type: "score" as const,
  score: value,
  confidence: 0.9,
  legend: {},
  probabilities: {},
});

// Defaults describe a real, calm, low-impact billing request, so each test
// overrides only the signal it is about.
export function makeAnswers(o: AnswerOverrides = {}): Answers {
  return {
    has_request: noul(o.hasRequest ?? 0.95),
    is_security_or_data_loss: noul(o.security ?? 0.05),
    is_outage: noul(o.outage ?? 0.05),
    impact_severity: score(o.impact ?? 0),
    time_pressure: score(o.time ?? 0),
    customer_frustration: score(o.frustration ?? 0),
    team: {
      type: "choice",
      choice: o.team ?? "billing",
      confidence: o.teamConfidence ?? 0.9,
      probabilities: {},
    },
  };
}
