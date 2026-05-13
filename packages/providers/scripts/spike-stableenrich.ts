import {
  collectStableenrichSources,
  missingStableenrichConfig,
  runStableenrichProbe,
  type StableenrichEnv,
  type StableenrichProbeFailure,
} from "../src/index";

const domain = process.argv[2] ?? "cartesia.ai";
const env = stableenrichEnvFromProcess();
const missing = missingStableenrichConfig(env);

if (missing.length > 0) {
  console.log(
    JSON.stringify({
      status: "skipped",
      reason: "missing_stableenrich_config",
      missing,
    }),
  );
  process.exit(0);
}

const beforeBalance = await agentcashBalance();
if (beforeBalance !== null) {
  console.log(JSON.stringify({ endpoint: "agentcash_balance", status: "before", balance: beforeBalance }));
}

const results = await runStableenrichProbe({ env, domain });

for (const result of results) {
  if (result.status === "fulfilled") {
    console.log(
      JSON.stringify({
        endpoint: result.value.name,
        endpointUrl: result.value.endpointUrl,
        status: "ok",
      }),
    );
  } else {
    const failure = stableenrichProbeFailure(result.reason);
    console.log(
      JSON.stringify({
        endpoint: failure?.name,
        endpointUrl: failure?.endpointUrl,
        status: "failed",
        error: failure?.error ?? (result.reason instanceof Error ? result.reason.message : String(result.reason)),
      }),
    );
  }
}

const collected = collectStableenrichSources(results);
console.log(
  JSON.stringify({
    endpoint: "stableenrich_structured_output",
    status: "ok",
    sourceCount: collected.sources.length,
    factCount: collected.facts.length,
    failureCount: collected.failures.length,
    factPaths: Array.from(new Set(collected.facts.map((fact) => fact.path))).sort(),
  }),
);

const afterBalance = await agentcashBalance();
if (afterBalance !== null) {
  console.log(
    JSON.stringify({
      endpoint: "agentcash_balance",
      status: "after",
      balance: afterBalance,
      delta: beforeBalance !== null ? Number((afterBalance - beforeBalance).toFixed(6)) : null,
    }),
  );
}

function stableenrichEnvFromProcess(): StableenrichEnv {
  const env: StableenrichEnv = {};
  setIfPresent(env, "STABLEENRICH_BASE_URL", process.env.STABLEENRICH_BASE_URL);
  setIfPresent(env, "STABLEENRICH_EXA_SEARCH_URL", process.env.STABLEENRICH_EXA_SEARCH_URL);
  setIfPresent(env, "STABLEENRICH_EXA_SIMILAR_URL", process.env.STABLEENRICH_EXA_SIMILAR_URL);
  setIfPresent(env, "STABLEENRICH_FIRECRAWL_URL", process.env.STABLEENRICH_FIRECRAWL_URL);
  setIfPresent(env, "STABLEENRICH_ORG_ENRICH_URL", process.env.STABLEENRICH_ORG_ENRICH_URL);
  return env;
}

function setIfPresent(env: StableenrichEnv, key: keyof StableenrichEnv, value: string | undefined) {
  if (value) {
    env[key] = value;
  }
}

function stableenrichProbeFailure(reason: unknown): StableenrichProbeFailure | undefined {
  if (!reason || typeof reason !== "object") {
    return undefined;
  }

  const candidate = reason as Partial<StableenrichProbeFailure>;
  if (candidate.name && candidate.endpointUrl && candidate.error) {
    return {
      name: candidate.name,
      endpointUrl: candidate.endpointUrl,
      error: candidate.error,
    };
  }

  return undefined;
}

async function agentcashBalance(): Promise<number | null> {
  try {
    const child = await import("node:child_process");
    const { promisify } = await import("node:util");
    const execFile = promisify(child.execFile);
    const { stdout } = await execFile("npx", ["agentcash@latest", "balance", "--format", "json"], { timeout: 30_000 });
    const parsed = JSON.parse(stdout) as { success?: boolean; data?: { balance?: number } };
    return parsed.success === true && typeof parsed.data?.balance === "number" ? parsed.data.balance : null;
  } catch {
    return null;
  }
}
