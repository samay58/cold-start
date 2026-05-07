#!/usr/bin/env node
import { spawn, spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { createRequire } from "node:module";

import { loadRepoRootEnv, repoRoot } from "./load-root-env.mjs";

const require = createRequire(import.meta.url);

function runMigration() {
  console.log("[dev:full] applying database migrations...");
  const result = spawnSync("npm", ["run", "db:migrate", "-w", "@cold-start/db"], {
    cwd: repoRoot,
    env: process.env,
    stdio: "inherit",
  });

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

function concurrentlyBinPath() {
  const packageJsonPath = require.resolve("concurrently/package.json");
  return resolve(dirname(packageJsonPath), "dist/bin/concurrently.js");
}

loadRepoRootEnv();
runMigration();

const child = spawn(
  process.execPath,
  [
    concurrentlyBinPath(),
    "--kill-others-on-fail",
    "--names",
    "web,inngest",
    "--prefix-colors",
    "cyan,magenta",
    "npm run dev",
    "npm run dev:inngest",
  ],
  {
    cwd: repoRoot,
    env: process.env,
    stdio: "inherit",
  },
);

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }

  process.exit(code ?? 1);
});
