import { fileURLToPath } from "node:url";
import { loadEnvConfig } from "@next/env";
import type { NextConfig } from "next";

const repoRoot = fileURLToPath(new URL("../..", import.meta.url));

if (process.env.NODE_ENV !== "production") {
  loadEnvConfig(repoRoot, true);
}

const nextConfig: NextConfig = {
  outputFileTracingRoot: repoRoot,
  transpilePackages: [
    "@cold-start/core",
    "@cold-start/db",
    "@cold-start/llm",
    "@cold-start/pipeline",
    "@cold-start/providers",
    "@cold-start/ui",
  ],
};

export default nextConfig;
