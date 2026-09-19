import { z } from "zod";
import { TEAM_IDS } from "./config/teams";

export type Ticket = {
  id: string;
  subject: string;
  body: string;
};

// Zendesk's own four values, so the deferred writer is a field copy.
export const PRIORITIES = ["low", "normal", "high", "urgent"] as const;
export type Priority = (typeof PRIORITIES)[number];

export const TEAM_CHOICES = [...TEAM_IDS, "none"] as const;
export type TeamChoice = (typeof TEAM_CHOICES)[number];

export type TriageDecision = {
  priority: Priority;
  team: string | null; // null means no confident match
  tags: string[];
  evidence: Record<string, unknown>; // raw Jev answers, kept for audit and tuning
};

const probability = z.number().min(0).max(1);

// looseObject everywhere: unknown fields pass through, so evidence stays complete.
const noulAnswer = z.looseObject({ type: z.literal("noul"), noul: probability });

const scoreAnswer = (levels: number) =>
  z.looseObject({
    type: z.literal("score"),
    score: z.number().min(0).max(levels - 1),
    confidence: probability,
    probabilities: z.record(z.string(), probability),
  });

const teamAnswer = z.looseObject({
  type: z.literal("choice"),
  choice: z.enum(TEAM_CHOICES),
  confidence: probability,
  probabilities: z.record(z.string(), probability),
});

export const AnswersSchema = z.looseObject({
  has_request: noulAnswer,
  is_security_or_data_loss: noulAnswer,
  is_outage: noulAnswer,
  impact_severity: scoreAnswer(5),
  time_pressure: scoreAnswer(4),
  customer_frustration: scoreAnswer(4),
  team: teamAnswer,
});

export type Answers = z.infer<typeof AnswersSchema>;
