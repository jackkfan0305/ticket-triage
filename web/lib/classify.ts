import { z } from "zod";
import { AnswersSchema } from "../../src/types";
import { ndjson } from "./ndjson";
import type { RunResult } from "./rows";

/**
 * One implementation, called by both the compose form and the ticket route.
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

/** What a line of the run stream can be. Parsed rather than trusted, for the
 *  same reason classify() parses: a shape the floor cannot read is a fault. */
const RunEventSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("open"), concurrency: z.number().int().positive() }),
  z.object({ type: z.literal("start"), id: z.string() }),
  z.object({
    type: z.literal("done"),
    id: z.string(),
    model: z.string(),
    answers: AnswersSchema,
    latencyMs: z.number(),
  }),
  z.object({ type: z.literal("error"), id: z.string(), error: z.string() }),
]);

export type RunEvent = z.infer<typeof RunEventSchema>;

export type RunTicket = { id: string; subject: string; body: string };

/**
 * Runs every ticket over one connection and yields each event as it lands.
 *
 * The pool lives on the server, so the browser's six-connection cap no longer
 * decides how many tickets are with the model. Aborting `signal` drops the
 * response, which the server reads as the run being abandoned.
 */
export async function* classifyRun(
  tickets: readonly RunTicket[],
  runId: string,
  signal: AbortSignal,
): AsyncGenerator<RunEvent> {
  const response = await fetch("/api/classify/run", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ runId, tickets }),
    signal,
  });

  if (!response.ok) {
    const payload = (await response.json().catch(() => ({}))) as { error?: string };
    throw new Error(payload.error ?? `Request failed (${response.status}).`);
  }
  if (!response.body) throw new Error("The run returned no stream.");

  for await (const line of ndjson(response.body)) yield RunEventSchema.parse(line);
}

/** Holds or releases a run already in flight. Failure to reach the server is
 *  reported by the run itself, so this one stays quiet. */
export async function setRunPaused(runId: string, paused: boolean): Promise<void> {
  await fetch("/api/classify/pause", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ runId, paused }),
    keepalive: true,
  }).catch(() => {});
}
