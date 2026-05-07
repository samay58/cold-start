#!/usr/bin/env node
import { spawn } from "node:child_process";
import { createRequire } from "node:module";

import { loadRepoRootEnv, webAppDir } from "./load-root-env.mjs";
import { assertNoActiveDevServer, clearDevLock, writeDevLock } from "./next-dev-lock.mjs";

const command = process.argv[2] ?? "dev";
const args = process.argv.slice(3);
const require = createRequire(import.meta.url);

loadRepoRootEnv();

if (command === "build") {
  assertNoActiveDevServer();
}

if (command === "dev") {
  writeDevLock();
}

const child = spawn(process.execPath, [require.resolve("next/dist/bin/next"), command, ...args], {
  cwd: webAppDir,
  env: process.env,
  stdio: "inherit"
});

child.on("exit", (code, signal) => {
  if (command === "dev") {
    clearDevLock();
  }

  if (signal) {
    process.kill(process.pid, signal);
    return;
  }

  process.exit(code ?? 1);
});
