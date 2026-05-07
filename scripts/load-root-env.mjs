import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import nextEnv from "@next/env";

const { loadEnvConfig } = nextEnv;

const scriptsDir = dirname(fileURLToPath(import.meta.url));

export const repoRoot = resolve(scriptsDir, "..");
export const webAppDir = resolve(repoRoot, "apps/web");

export function loadRepoRootEnv(projectDir = repoRoot) {
  return loadEnvConfig(projectDir, true, undefined, true);
}
