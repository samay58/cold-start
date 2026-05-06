import { fileURLToPath } from "node:url";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  outputFileTracingRoot: fileURLToPath(new URL("../..", import.meta.url)),
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
