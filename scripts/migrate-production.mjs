#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import { repoRoot } from "./load-root-env.mjs";

const confirmationEnv = "COLD_START_PRODUCTION_MIGRATION";
const checkOnly = process.argv.includes("--check");

function fail(message) {
  console.error(message);
  process.exit(1);
}

function readDotenvValue(filePath, key) {
  if (!existsSync(filePath)) {
    return undefined;
  }

  for (const line of readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const match = line.match(new RegExp(`^${key}\\s*=\\s*(.*)$`));
    if (!match) {
      continue;
    }

    const value = match[1].trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      return value.slice(1, -1);
    }

    return value;
  }

  return undefined;
}

function databaseHostname(databaseUrl) {
  try {
    return new URL(databaseUrl).hostname;
  } catch {
    return "";
  }
}

function isLocalDatabase(databaseUrl) {
  const hostname = databaseHostname(databaseUrl);
  return ["localhost", "127.0.0.1", "0.0.0.0", "host.docker.internal"].includes(hostname);
}

if (process.env[confirmationEnv] !== "1") {
  fail(`Set ${confirmationEnv}=1 to confirm you intend to migrate the production database.`);
}

const databaseUrl = process.env.DATABASE_URL?.trim() ?? "";
if (!databaseUrl) {
  fail("DATABASE_URL is empty. Export the production Neon pooled connection string before running this command.");
}

if (!databaseUrl.startsWith("postgres://") && !databaseUrl.startsWith("postgresql://")) {
  fail("DATABASE_URL must be a Postgres connection string.");
}

if (isLocalDatabase(databaseUrl)) {
  fail("Refusing to run a production migration against a local database URL.");
}

const localDatabaseUrl = readDotenvValue(resolve(repoRoot, ".env.local"), "DATABASE_URL")?.trim();
if (localDatabaseUrl && databaseUrl === localDatabaseUrl) {
  fail("Refusing to run a production migration with the same DATABASE_URL as .env.local.");
}

if (checkOnly) {
  console.log("Production migration preflight passed. DATABASE_URL value hidden.");
  process.exit(0);
}

console.log("Running production migration. DATABASE_URL value hidden.");
const result = spawnSync("npm", ["run", "db:migrate", "-w", "@cold-start/db"], {
  cwd: repoRoot,
  env: process.env,
  stdio: "inherit"
});

process.exit(result.status ?? 1);
