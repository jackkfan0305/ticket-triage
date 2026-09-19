import { TypeSafeClient } from "@typesafe-ai/sdk";
import { AnswersSchema, type Answers, type Ticket } from "../types";
import { QUESTIONS } from "./questions";

export type JevResult = { model: string; answers: Answers };

// One request carries every question; they are independent, so Jev runs them in
// parallel. Throws on API failure (after the SDK's retries) or on a response that
// does not match AnswersSchema, so a shape change never scores as zero.
export async function askJev(ticket: Ticket, client = new TypeSafeClient()): Promise<JevResult> {
  const res = await client.systemOne({
    state: { ticket: { subject: ticket.subject, body: ticket.body } },
    questions: QUESTIONS,
  });
  return { model: res.model, answers: AnswersSchema.parse(res.answers) };
}
