import path from "node:path";
import { loadEnvConfig } from "@next/env";

/**
 * TYPESAFE_API_KEY lives in the repo-root .env, one level above the Next
 * project directory.
 *
 * Loading it from next.config.ts does not work: Next derives the server
 * runtime's process.env from the env files it finds in the project directory,
 * so a mutation made while the config is evaluated is discarded before any
 * request is served. Doing it here puts the load inside the route's own module
 * graph, which is the process that actually reads the value.
 */
loadEnvConfig(path.join(process.cwd(), ".."));

export const API_KEY_NAME = "TYPESAFE_API_KEY";

export const hasApiKey = (): boolean => Boolean(process.env[API_KEY_NAME]);
