import path from "node:path";
import type { NextConfig } from "next";

// The repo-root .env is loaded in lib/env.ts, not here: Next rebuilds the
// server runtime's process.env from the project directory's own env files, so
// anything set while this config is evaluated is discarded before a request
// is ever served.

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
