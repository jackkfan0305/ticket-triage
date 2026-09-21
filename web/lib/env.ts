import path from "node:path";
import { loadEnvConfig } from "@next/env";

export const API_KEY_NAME = "TYPESAFE_API_KEY";

/**
 * Where the repo-root .env lives.
 *
 * next.config.ts pins this at build time from its own location. Deriving it
 * from process.cwd() is not safe: the dev server does not always run with the
 * project directory as its cwd (launched detached it can be "/"), and then the
 * lookup silently resolves to a directory with no .env in it.
 */
export function resolveRoot(pinned = process.env.TRIAGE_REPO_ROOT, cwd = process.cwd()): string {
  return pinned ?? path.join(cwd, "..");
}

/**
 * TYPESAFE_API_KEY lives in the repo-root .env, one level above the Next
 * project directory, so Next never loads it on its own.
 *
 * Read lazily rather than once at module load. Next rebuilds the server
 * runtime's process.env across reloads, so a value injected by a one-time
 * side effect disappears after the first hot update and never comes back.
 * forceReload defeats @next/env's own cache, which would otherwise make the
 * reload a no-op.
 */
export function apiKey(): string | undefined {
  const direct = process.env[API_KEY_NAME];
  if (direct) return direct;

  loadEnvConfig(resolveRoot(), undefined, undefined, true);
  return process.env[API_KEY_NAME];
}

export const hasApiKey = (): boolean => Boolean(apiKey());

/**
 * How many tickets a run sends to the model at once.
 *
 * 8 holds 100 tickets at 2.58s wall and 199ms a ticket, which is Jev's real
 * judgment time. Higher works too, now that the client has a dispatcher that
 * survives concurrency (see jev-client.ts), but Jev publishes 1,200 requests a
 * minute and 8 already sustains roughly twice that in a burst; a 1000-ticket
 * run at a larger number is where a 429 and the SDK's backoff would show up.
 *
 * Read after apiKey(), which loads the repo-root .env into process.env; before
 * that this sees only what Next injected.
 */
export const DEFAULT_CONCURRENCY = 8;

export function concurrency(raw = process.env.TRIAGE_CONCURRENCY): number {
  const parsed = Number(raw);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : DEFAULT_CONCURRENCY;
}
