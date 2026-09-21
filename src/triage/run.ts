import { TypeSafeClient } from "@typesafe-ai/sdk";
import { AnswersSchema, type Answers, type Ticket } from "../types";
import { QUESTIONS } from "./questions";

export type JevResult = { model: string; answers: Answers };

// The per-ticket state sent with every request; the eval cache fingerprints it.
export const jevState = (ticket: Pick<Ticket, "subject" | "body">) => ({ ticket: { subject: ticket.subject, body: ticket.body } });

// One request carries every question; they are independent, so Jev runs them in
// parallel. Throws on API failure (after the SDK's retries) or on a response that
// does not match AnswersSchema, so a shape change never scores as zero.
export async function askJev(ticket: Ticket, client = new TypeSafeClient()): Promise<JevResult> {
  const res = await client.systemOne({
    state: jevState(ticket),
    questions: QUESTIONS,
  });
  return { model: res.model, answers: AnswersSchema.parse(res.answers) };
}
