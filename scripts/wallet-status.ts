#!/usr/bin/env tsx
// One-shot wallet observability. Prints per-network AgentCash balance, last-24h Anthropic spend,
// last-24h provider failure counts, and a "runs remaining at current burn rate" estimate. Read-only.
//
// Usage: npm run wallet:status (uses .env.production.migrate.local for DATABASE_URL)
//
// This is the daily-eyeball-it tool. Run it before a generation push, run it after, run it when
// the app feels broken. The wallet draining without warning is what made the 2026-05-26 inkeep run
// "useless": every provider failed silently with INSUFFICIENT_BALANCE.

import { existsSync, readFileSync } from "node:fs";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { resolve } from "node:path";

import { Client } from "pg";

const execFileAsync = promisify(execFile);

type WalletAccount = {
  network: string;
  address: string;
  balance: number;
  depositLink: string;
};

type WalletAccountsResponse = {
  success: boolean;
  data?: { accounts: WalletAccount[]; totalBalance?: number };
  error?: unknown;
};

type RunCostRow = {
  cost_usd: string | null;
  trace_json: {
    providers?: {
      stableenrich?: {
        endpoints?: Array<{ name: string; status: string }>;
      };
    };
  } | null;
  status: string;
  started_at: Date;
};

function loadEnvFile(path: string) {
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    const match = line.match(/^([A-Z0-9_]+)\s*=\s*(.*)$/);
    if (!match || process.env[match[1]]) continue;
    process.env[match[1]] = match[2].trim().replace(/^['"]|['"]$/g, "");
  }
}

function loadLocalEnv() {
  loadEnvFile(resolve(process.cwd(), ".env.production.migrate.local"));
  if (!process.env.DATABASE_URL) {
    loadEnvFile(resolve(process.cwd(), ".env.local"));
  }
}

async function fetchWallet(): Promise<WalletAccount[]> {
  // Resolve agentcash through npx so this works without a global install.
  const { stdout } = await execFileAsync("npx", ["--no-install", "agentcash", "accounts", "--format", "json"], {
    env: process.env,
    timeout: 30_000,
  });
  const parsed = JSON.parse(stdout) as WalletAccountsResponse;
  if (!parsed.success || !parsed.data?.accounts) {
    throw new Error(`agentcash accounts failed: ${JSON.stringify(parsed.error ?? parsed)}`);
  }
  return parsed.data.accounts;
}

async function fetchLast24hRuns(client: Client): Promise<RunCostRow[]> {
  const result = await client.query<RunCostRow>(
    `select cost_usd, trace_json, status, started_at
       from generation_runs
      where started_at >= now() - interval '24 hours'
      order by started_at desc`
  );
  return result.rows;
}

function summarizeRuns(rows: RunCostRow[]) {
  let anthropicCost = 0;
  let costCount = 0;
  const providerFailures = new Map<string, number>();
  const statusCounts = new Map<string, number>();

  for (const row of rows) {
    statusCounts.set(row.status, (statusCounts.get(row.status) ?? 0) + 1);

    if (row.cost_usd) {
      const cost = Number(row.cost_usd);
      if (Number.isFinite(cost)) {
        anthropicCost += cost;
        costCount += 1;
      }
    }

    const endpoints = row.trace_json?.providers?.stableenrich?.endpoints ?? [];
    for (const endpoint of endpoints) {
      if (endpoint.status === "failed") {
        const key = endpoint.name;
        providerFailures.set(key, (providerFailures.get(key) ?? 0) + 1);
      }
    }
  }

  return {
    runCount: rows.length,
    statusCounts,
    anthropicCost,
    costCount,
    avgAnthropicCost: costCount > 0 ? anthropicCost / costCount : 0,
    providerFailures,
  };
}

function formatUsd(value: number) {
  return `$${value.toFixed(4)}`;
}

function rankedFailures(map: Map<string, number>, limit = 5) {
  return [...map.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit);
}

async function main() {
  loadLocalEnv();

  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL missing. Source .env.production.migrate.local or .env.local first.");
  }

  const walletPromise = fetchWallet().catch((error: unknown) => {
    console.warn("[wallet:status] agentcash accounts failed:", error instanceof Error ? error.message : error);
    return null;
  });

  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  let runs: RunCostRow[];
  try {
    runs = await fetchLast24hRuns(client);
  } finally {
    await client.end();
  }

  const wallet = await walletPromise;
  const summary = summarizeRuns(runs);

  console.log("Wallet (AgentCash, per network)");
  if (wallet) {
    let baseBalance = 0;
    for (const account of wallet) {
      const flag = account.balance < 1 ? "  <-- low" : "";
      console.log(`  ${account.network.padEnd(8)} ${formatUsd(account.balance)}  ${account.address}${flag}`);
      if (account.network === "base") baseBalance = account.balance;
    }
    const refillLink = wallet.find((account) => account.network === "base")?.depositLink;
    if (refillLink) {
      console.log(`  Base deposit: ${refillLink}`);
    }

    // "Runs remaining" estimate. Average stableenrich AgentCash cost is roughly $0.20-$0.40 per
    // run based on the registry timeoutMs / estimatedCostUsd pairs (~14 paid endpoints, mostly
    // $0.01-$0.03 each). Use $0.30 as a conservative point estimate.
    const estimatedRunCost = 0.3;
    const runsRemaining = Math.floor(baseBalance / estimatedRunCost);
    console.log(`  Estimated runs remaining on Base (~$${estimatedRunCost.toFixed(2)} each): ${runsRemaining}`);
  } else {
    console.log("  (unable to query agentcash accounts)");
  }

  console.log("\nLast 24h (production)");
  console.log(`  Runs: ${summary.runCount}`);
  for (const [status, count] of summary.statusCounts) {
    console.log(`    ${status}: ${count}`);
  }
  console.log(`  Anthropic spend: ${formatUsd(summary.anthropicCost)} across ${summary.costCount} runs`);
  if (summary.avgAnthropicCost > 0) {
    console.log(`  Avg Anthropic / run: ${formatUsd(summary.avgAnthropicCost)}`);
  }

  console.log(`\nTop stableenrich failures (last 24h)`);
  const top = rankedFailures(summary.providerFailures);
  if (top.length === 0) {
    console.log("  (none)");
  } else {
    for (const [name, count] of top) {
      console.log(`  ${name.padEnd(28)} ${count}`);
    }
    const totalFailures = [...summary.providerFailures.values()].reduce((sum, n) => sum + n, 0);
    console.log(`  Total failed probes: ${totalFailures}`);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
