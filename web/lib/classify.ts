import { AnswersSchema } from "../../src/types";
import type { RunResult } from "./rows";

/**
 * One implementation, called by both the floor's run and the ticket route.
 *
 * A response whose shape does not match must throw rather than score as zero:
 * an answer the schema cannot read is a broken contract, not a low-confidence
 * classification.
 */
export async function classify(ticket: { subject: string; body: string }): Promise<RunResult> {
  const response = await fetch("/api/classify", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(ticket),
  });
  const payload = (await response.json()) as {
    model?: string;
    answers?: unknown;
    latencyMs?: number;
    error?: string;
  };
  if (!response.ok) throw new Error(payload.error ?? `Request failed (${response.status}).`);
  return {
    model: payload.model ?? "unknown",
    answers: AnswersSchema.parse(payload.answers),
    latencyMs: payload.latencyMs ?? 0,
  };
}
