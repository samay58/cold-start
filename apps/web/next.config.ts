import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { loadEnvConfig } from "@next/env";
import type { NextConfig } from "next";

const repoRoot = fileURLToPath(new URL("../..", import.meta.url));

if (process.env.NODE_ENV !== "production") {
  loadEnvConfig(repoRoot, true);
}

function packageJsonPath(packageName: string) {
  const parts = packageName.startsWith("@") ? packageName.split("/").slice(0, 2) : [packageName];
  return join(repoRoot, "node_modules", ...parts, "package.json");
}

function packageNameFromJsonPath(path: string) {
  const dir = dirname(path);
  const name = dir.split("node_modules/").at(-1);
  return name || null;
}

function agentcashRuntimeGlobs() {
  const seen = new Set<string>();

  function visitPackageJson(path: string, packageName?: string) {
    if (packageName) {
      seen.add(packageName);
    }

    if (!existsSync(path)) {
      return;
    }

    const pkg = JSON.parse(readFileSync(path, "utf8")) as {
      dependencies?: Record<string, string>;
      peerDependencies?: Record<string, string>;
      peerDependenciesMeta?: Record<string, { optional?: boolean }>;
    };
    for (const dependency of Object.keys(pkg.dependencies ?? {})) {
      visit(dependency);
    }
    for (const dependency of Object.keys(pkg.peerDependencies ?? {})) {
      if (pkg.peerDependenciesMeta?.[dependency]?.optional !== true) {
        visit(dependency);
      }
    }
  }

  function visit(packageName: string) {
    if (seen.has(packageName)) {
      return;
    }

    seen.add(packageName);
    visitPackageJson(packageJsonPath(packageName));
  }

  function visitNestedPackages(dir: string) {
    if (!existsSync(dir)) {
      return;
    }

    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);
      if (!entry.isDirectory()) {
        continue;
      }

      if (entry.name.startsWith("@")) {
        visitNestedPackages(path);
        continue;
      }

      const packageJson = join(path, "package.json");
      const packageName = packageNameFromJsonPath(packageJson);
      if (packageName) {
        visitPackageJson(packageJson, packageName);
      }

      visitNestedPackages(join(path, "node_modules"));
    }
  }

  visit("agentcash");
  visitNestedPackages(join(repoRoot, "node_modules", "agentcash", "node_modules"));

  return Array.from(seen)
    .sort()
    .map((packageName) => `../../node_modules/${packageName}/**/*`);
}

const nextConfig: NextConfig = {
  outputFileTracingRoot: repoRoot,
  outputFileTracingIncludes: {
    "/api/inngest": agentcashRuntimeGlobs(),
  },
  serverExternalPackages: ["agentcash"],
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
