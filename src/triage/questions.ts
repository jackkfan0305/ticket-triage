import type { Questions } from "@typesafe-ai/sdk";
import { TEAMS } from "../config/teams";

// Each option carries its own scope and the neighbouring team's, so Jev sees the
// contrast instead of inferring it.
const teamCriteria = {
  ...Object.fromEntries(Object.entries(TEAMS).map(([id, t]) => [id, { owns: t.owns, not: t.not }])),
  none: "No team listed here owns this ticket.",
};

export const QUESTIONS = {
  has_request: {
    type: "noul",
    instructions: "`ticket` contains a genuine request or problem report from a person.",
    criteria: {
      true: "A person is asking for help, asking a question, or reporting a problem.",
      false: "An automated bounce, an out-of-office reply, marketing mail, or an empty message.",
    },
  },
  is_security_or_data_loss: {
    type: "noul",
    instructions:
      "`ticket` reports a security incident, unauthorised access, a data breach, or customer data that has been lost or corrupted.",
  },
  is_outage: {
    type: "noul",
    instructions:
      "`ticket` describes the service being down or unreachable overall, rather than one feature behaving wrongly.",
  },
  impact_severity: {
    type: "score",
    instructions: "How severe is the impact on the customer described in `ticket`?",
    criteria: [
      "Nothing is broken. The message asks a question, gives feedback, or requests something for later.",
      "Something is slower, uglier, or more awkward than it should be, and the customer can still do their work.",
      "A feature the customer needs is broken, and a workaround exists or is implied.",
      "The customer cannot do their work and mentions no workaround.",
      "The customer's whole organisation is blocked, or customer data is lost or corrupted.",
    ],
  },
  time_pressure: {
    type: "score",
    instructions: "How much time pressure does `ticket` express?",
    criteria: [
      "The message refers to no deadline or timeframe at all.",
      "The customer wants this resolved reasonably soon but names no date.",
      "The customer names a deadline some days away, or says the problem is getting worse.",
      "The customer names a deadline today or tomorrow, or says work has already stopped.",
    ],
  },
  customer_frustration: {
    type: "score",
    instructions: "How frustrated is the customer who wrote `ticket`?",
    criteria: [
      "Calm and matter of fact.",
      "Mildly annoyed but polite.",
      "Clearly frustrated; complains about the product or about previous support.",
      "Angry; threatens to cancel, escalate, or make the problem public.",
    ],
  },
  team: {
    type: "choice",
    instructions:
      "Which team should own `ticket`? Each option says what that team owns and what belongs to a neighbouring team instead.",
    criteria: teamCriteria,
  },
} satisfies Questions;
