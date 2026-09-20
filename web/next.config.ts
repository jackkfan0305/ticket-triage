import type { NextConfig } from "next";

// web/ is its own package, so policy.ts lives outside the Next root.
// externalDir lets the compiler pull it in instead of copying the file.
const config: NextConfig = {
  experimental: { externalDir: true },
  // this repo keeps its own agent instructions; do not generate a second set
  agentRules: false,
};

export default config;
