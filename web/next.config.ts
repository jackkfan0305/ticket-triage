import path from "node:path";
import { loadEnvConfig } from "@next/env";
import type { NextConfig } from "next";

// TYPESAFE_API_KEY lives in the repo root .env, which Next would not otherwise
// see from web/. Loading it here keeps one copy of the secret.
loadEnvConfig(path.join(process.cwd(), ".."));

const config: NextConfig = {
  // the repo root, not web/: src/ has to stay inside the root or the imports
  // below cannot resolve
  turbopack: { root: path.join(import.meta.dirname, "..") },
  // web/ is its own package, so src/triage/policy.ts sits outside the Next root.
  // externalDir lets the compiler pull it in instead of copying the file.
  experimental: { externalDir: true },
  // this repo keeps its own agent instructions; do not generate a second set
  agentRules: false,
};

export default config;
