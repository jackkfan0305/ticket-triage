"use client";

import { useState } from "react";

import { decide, DEFAULT_PARAMS, urgency } from "../../src/triage/policy";
import { AnswersSchema } from "../../src/types";
import { QUESTIONS } from "../../src/triage/questions";

const raw = {
  has_request: { type: "noul", noul: 0.96 },
  is_security_or_data_loss: { type: "noul", noul: 0.02 },
  is_outage: { type: "noul", noul: 0.73 },
  impact_severity: { type: "score", score: 3, confidence: 0.98, probabilities: { "0": 0, "1": 0, "2": 0, "3": 0.98, "4": 0.02 } },
  time_pressure: { type: "score", score: 1, confidence: 0.97, probabilities: { "0": 0.02, "1": 0.97, "2": 0.01, "3": 0 } },
  customer_frustration: { type: "score", score: 0, confidence: 0.59, probabilities: { "0": 0.59, "1": 0.41, "2": 0, "3": 0 } },
  team: { type: "choice", choice: "technical_support", confidence: 1, probabilities: { technical_support: 1 } },
};

export function Spike() {
  const [outageAbove, setOutageAbove] = useState(DEFAULT_PARAMS.outageAbove);
  const answers = AnswersSchema.parse(raw);
  const d = decide(answers, { ...DEFAULT_PARAMS, outageAbove });
  return (
    <>
      <button id="bump" type="button" onClick={() => setOutageAbove(0.9)}>
        raise outage gate
      </button>
      <pre id="spike">
      {JSON.stringify(
          { priority: d.priority, team: d.team, tags: d.tags, urgency: urgency(answers, DEFAULT_PARAMS.weights), questions: Object.keys(QUESTIONS) },
        null,
        2,
        )}
      </pre>
    </>
  );
}
