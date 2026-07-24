import { execFile } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { promisify } from "node:util";

import { createDb, type ColdStartDb } from "@cold-start/db";

const execFileAsync = promisify(execFile);

const DURATION_PATTERN = /^(\d+)(m|h|d)$/;
const DEFAULT_INVITE_ORIGIN = "https://cold-start.semitechie.vc";

export type CliArguments = {
  flags: Set<string>;
  values: Map<string, string>;
  positionals: string[];
};

export type WalletAccount = {
  network: string;
  balance: number;
};

export function parseCliArguments(argv: readonly string[]): CliArguments {
  const flags = new Set<string>();
  const values = new Map<string, string>();
  const positionals: string[] = [];

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (!argument.startsWith("--")) {
      positionals.push(argument);
      continue;
    }

    const equalsIndex = argument.indexOf("=");
    if (equalsIndex > 2) {
      values.set(argument.slice(0, equalsIndex), argument.slice(equalsIndex + 1));
      continue;
    }

    const next = argv[index + 1];
    if (next !== undefined && !next.startsWith("--")) {
      values.set(argument, next);
      index += 1;
      continue;
    }
    flags.add(argument);
  }

  return { flags, values, positionals };
}

export function hasFlag(args: CliArguments, name: string): boolean {
  return args.flags.has(name);
}

export function valueFor(args: CliArguments, name: string): string | undefined {
  return args.values.get(name);
}

export function requiredValue(args: CliArguments, name: string): string {
  const value = valueFor(args, name)?.trim();
  if (!value) {
    throw new Error(`${name} is required. Run with --help for usage.`);
  }
  return value;
}

export function boundedInteger(
  raw: string | undefined,
  fallback: number,
  options: { name: string; min: number; max: number }
): number {
  const value = raw === undefined ? fallback : Number(raw);
  if (!Number.isInteger(value) || value < options.min || value > options.max) {
    throw new Error(
      `${options.name} must be an integer from ${options.min} to ${options.max}.`
    );
  }
  return value;
}

export function durationMs(raw: string, name = "duration"): number {
  const match = DURATION_PATTERN.exec(raw.trim());
  if (!match) {
    throw new Error(`${name} must use a whole-number duration such as 30m, 12h, or 7d.`);
  }

  const amount = Number(match[1]);
  const unitMs = match[2] === "m"
    ? 60_000
    : match[2] === "h"
      ? 3_600_000
      : 86_400_000;
  const value = amount * unitMs;
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error(`${name} must be greater than zero.`);
  }
  return value;
}

export function dateBefore(now: Date, raw: string, name = "duration"): Date {
  return new Date(now.getTime() - durationMs(raw, name));
}

export function dateAfter(now: Date, raw: string, name = "duration"): Date {
  return new Date(now.getTime() + durationMs(raw, name));
}

export function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export function createInviteSecret(): string {
  return randomBytes(32).toString("base64url");
}

export function inviteUrl(secret: string, origin = process.env.ALPHA_INVITE_ORIGIN): string {
  const normalizedOrigin = (origin?.trim() || DEFAULT_INVITE_ORIGIN).replace(/\/+$/, "");
  const url = new URL("/alpha", normalizedOrigin);
  url.hash = `invite=${encodeURIComponent(secret)}`;
  return url.toString();
}

export function loadProductionEnv(cwd = process.cwd()): void {
  loadEnvFile(resolve(cwd, ".env.production.migrate.local"));
  if (!process.env.DATABASE_URL) {
    loadEnvFile(resolve(cwd, ".env.local"));
  }
}

export function databaseUrl(): string {
  const value = process.env.DATABASE_URL?.trim();
  if (!value) {
    throw new Error(
      "DATABASE_URL is missing. Add it to .env.production.migrate.local or source the production environment."
    );
  }
  return value;
}

export async function withAlphaDb<Result>(
  operation: (db: ColdStartDb) => Promise<Result>
): Promise<Result> {
  const url = databaseUrl();
  const db = createDb(url);
  try {
    return await operation(db);
  } finally {
    if (isLocalPostgresUrl(url)) {
      const localClient = (db as unknown as {
        $client?: { end: () => Promise<void> };
      }).$client;
      await localClient?.end();
    }
  }
}

export async function fetchAgentCashAccounts(): Promise<WalletAccount[]> {
  const { stdout } = await execFileAsync(
    "npx",
    ["--no-install", "agentcash", "accounts", "--format", "json"],
    { env: process.env, timeout: 30_000, maxBuffer: 1_000_000 }
  );
  const parsed = JSON.parse(stdout) as {
    success?: boolean;
    data?: { accounts?: Array<{ network?: unknown; balance?: unknown }> };
    error?: unknown;
  };
  if (!parsed.success || !Array.isArray(parsed.data?.accounts)) {
    throw new Error(`AgentCash account query failed: ${safeError(parsed.error)}`);
  }

  return parsed.data.accounts.flatMap((account) => {
    const network = typeof account.network === "string" ? account.network : null;
    const balance = typeof account.balance === "number" ? account.balance : Number(account.balance);
    return network && Number.isFinite(balance) ? [{ network, balance }] : [];
  });
}

export function safeError(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  return "unknown error";
}

function loadEnvFile(path: string): void {
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    const match = line.match(/^([A-Z0-9_]+)\s*=\s*(.*)$/);
    if (!match || process.env[match[1]]) continue;
    process.env[match[1]] = match[2].trim().replace(/^['"]|['"]$/g, "");
  }
}

function isLocalPostgresUrl(databaseUrl: string): boolean {
  try {
    const url = new URL(databaseUrl);
    return ["localhost", "127.0.0.1", "::1"].includes(url.hostname);
  } catch {
    return false;
  }
}
