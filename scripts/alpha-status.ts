#!/usr/bin/env tsx

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { Client } from "pg";

import {
  databaseUrl,
  dateBefore,
  fetchAgentCashAccounts,
  hasFlag,
  loadProductionEnv,
  parseCliArguments,
  runCli,
  safeError,
  valueFor
} from "./alpha-common";
import { readDatabaseEvidence } from "./alpha-status/db";
import { formatAlphaStatusReport } from "./alpha-status/format";
import { buildAlphaStatusReport } from "./alpha-status/report";

// The reader, builder and formatter live under scripts/alpha-status/; this file is the CLI.
export { buildAlphaStatusReport } from "./alpha-status/report";
export { formatAlphaStatusReport } from "./alpha-status/format";
export type { AlphaStatusReport, AlphaStatusReportInputs } from "./alpha-status/types";

const HELP = `Report friend-alpha funnel, allowance, reliability, and spend evidence.

Usage:
  npm run alpha:status -- --since 7d
  npm run alpha:status -- --since 7d --json
  npm run alpha:status -- --gate

Options:
  --since <duration>  Reporting window, default 7d
  --json              Emit stable machine-readable JSON
  --gate              Exit 2 unless software failures, stale runs, AgentCash accounting,
                      wallet floor, and extension compatibility checks pass
  --help              Show this help

Environment:
  ALPHA_SUPPORTED_EXTENSION_VERSIONS   Comma-separated accepted versions
  ALPHA_PROFILE_WORST_CASE_USD         Per-profile AgentCash exposure anchor
  ALPHA_LENS_WORST_CASE_USD            Per-Lens AgentCash exposure anchor

If cost anchors are unset, the report uses the existing wallet-status $0.30
conservative provider-run estimate and labels it as an estimate.`;

export async function main(argv = process.argv.slice(2)): Promise<void> {
  const args = parseCliArguments(argv);
  if (hasFlag(args, "--help")) {
    console.log(HELP);
    return;
  }

  const sinceLabel = valueFor(args, "--since") ?? "7d";
  const now = new Date();
  const sinceAt = dateBefore(now, sinceLabel, "--since");
  const json = hasFlag(args, "--json");
  const gate = hasFlag(args, "--gate");

  loadProductionEnv();
  const compatibility = supportedCompatibility();
  const costs = costAnchors();
  const client = new Client({ connectionString: databaseUrl() });
  await client.connect();
  let databaseEvidence: Awaited<ReturnType<typeof readDatabaseEvidence>>;
  try {
    databaseEvidence = await readDatabaseEvidence(client, sinceAt);
  } finally {
    await client.end();
  }

  const wallet = await fetchAgentCashAccounts()
    .then((accounts) => ({
      balance: accounts.find((account) => account.network.toLowerCase() === "base")?.balance ?? null,
      error: null
    }))
    .catch((error: unknown) => ({
      balance: null,
      error: safeError(error)
    }));

  const report = buildAlphaStatusReport({
    now,
    sinceLabel,
    sinceAt,
    ...databaseEvidence,
    walletBalanceUsd: wallet.balance,
    walletError: wallet.error,
    supportedVersions: compatibility.versions,
    compatibilitySource: compatibility.source,
    profileCostAnchorUsd: costs.profile,
    lensCostAnchorUsd: costs.lens,
    costAnchorSource: costs.source
  });

  console.log(json ? JSON.stringify(report, null, 2) : formatAlphaStatusReport(report));
  if (gate && !report.gate.passed) {
    process.exitCode = 2;
  }
}

function supportedCompatibility(): { versions: string[]; source: string } {
  const configured = process.env.ALPHA_SUPPORTED_EXTENSION_VERSIONS
    ?.split(",")
    .map((version) => version.trim())
    .filter(Boolean);
  if (configured?.length) {
    return { versions: [...new Set(configured)], source: "ALPHA_SUPPORTED_EXTENSION_VERSIONS" };
  }
  const packageJson = JSON.parse(
    readFileSync(resolve(process.cwd(), "apps/extension/package.json"), "utf8")
  ) as { version?: unknown };
  if (typeof packageJson.version !== "string" || !packageJson.version) {
    throw new Error("Unable to derive the current extension version.");
  }
  return {
    versions: [packageJson.version],
    source: "apps/extension/package.json current build"
  };
}

function costAnchors(): {
  profile: number;
  lens: number;
  source: string;
} {
  const configuredProfile = optionalPositiveNumber(process.env.ALPHA_PROFILE_WORST_CASE_USD);
  const configuredLens = optionalPositiveNumber(process.env.ALPHA_LENS_WORST_CASE_USD);
  const profile = configuredProfile ?? 0.3;
  const lens = configuredLens ?? profile;
  const source = configuredProfile !== null
    ? configuredLens !== null
      ? "configured alpha worst-case anchors"
      : "configured profile anchor; Lens inherits profile anchor"
    : "wallet-status conservative $0.30 provider-run estimate";
  return { profile, lens, source };
}

function optionalPositiveNumber(raw: string | undefined): number | null {
  if (raw === undefined) return null;
  const value = Number(raw);
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error("Alpha cost anchors must be positive numbers.");
  }
  return value;
}

runCli(import.meta.url, main);
