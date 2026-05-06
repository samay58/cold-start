import {
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
