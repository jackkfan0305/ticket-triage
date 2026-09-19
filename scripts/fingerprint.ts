import { createHash } from "node:crypto";
import { QUESTIONS } from "../src/triage/questions";
import { jevState } from "../src/triage/run";
import type { Ticket } from "../src/types";

const shortHash = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex").slice(0, 12);

// Detects a stale cache after teams.ts or questions.ts changes: a short hash of
// the current questions, so an entry fetched under old questions can be told apart.
export function questionsFingerprint(): string {
  return shortHash(QUESTIONS);
}

// Detects a ticket edited under the same id: a short hash of the state sent to Jev.
export function requestFingerprint(ticket: Pick<Ticket, "subject" | "body">): string {
  return shortHash(jevState(ticket));
}
