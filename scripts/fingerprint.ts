import { createHash } from "node:crypto";
import { QUESTIONS } from "../src/triage/questions";

// Detects a stale cache after teams.ts or questions.ts changes: a short hash of
// the current questions, so an entry fetched under old questions can be told apart.
export function questionsFingerprint(): string {
  return createHash("sha256").update(JSON.stringify(QUESTIONS)).digest("hex").slice(0, 12);
}
