import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import * as nextEnvModule from "@next/env";

// Robust to ESM/CJS interop differences: plain node surfaces the CJS named export directly,
// tsx nests the exports object one or two levels under .default.
const loadEnvConfig =
  nextEnvModule.loadEnvConfig ??
  nextEnvModule.default?.loadEnvConfig ??
  nextEnvModule.default?.default?.loadEnvConfig;
if (typeof loadEnvConfig !== "function") {
  throw new Error("Could not resolve loadEnvConfig from @next/env");
}

const scriptsDir = dirname(fileURLToPath(import.meta.url));

export const repoRoot = resolve(scriptsDir, "..");
export const webAppDir = resolve(repoRoot, "apps/web");

export function loadRepoRootEnv(projectDir = repoRoot) {
  return loadEnvConfig(projectDir, true, undefined, true);
}
