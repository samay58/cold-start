import {
  fetchStableenrichPeopleEmailSources,
  fetchStableenrichSources,
  missingStableenrichConfig,
  type StableenrichEnv,
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

const enriched = await fetchStableenrichSources({ env, domain });
console.log(
  JSON.stringify({
    endpoint: "stableenrich_full_structured_output",
    status: "ok",
    sourceCount: enriched.sources.length,
    factCount: enriched.facts.length,
    failureCount: enriched.failures.length,
    endpoints: enriched.endpoints,
    factPaths: Array.from(new Set(enriched.facts.map((fact) => fact.path))).sort(),
    teamFacts: enriched.facts.filter((fact) => fact.path === "team.founders" || fact.path === "team.keyExecs"),
  }),
);

const contact = await fetchStableenrichPeopleEmailSources({ env, domain, sourceHints: enriched.sources });
console.log(
  JSON.stringify({
    endpoint: "stableenrich_people_email_discovery",
    status: "ok",
    sourceCount: contact.sources.length,
    factCount: contact.facts.length,
    failureCount: contact.failures.length,
    sources: contact.sources.map((source) => ({
      url: source.url,
      title: source.title,
      sourceType: source.sourceType,
      intent: source.intent,
      rawTextSample: source.rawText.slice(0, 600),
    })),
    emailDiscovery: contact.emailDiscovery ?? [],
    teamFacts: contact.facts.filter((fact) => fact.path === "team.founders" || fact.path === "team.keyExecs"),
  }, null, 2),
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
  setIfPresent(env, "STABLEENRICH_APOLLO_ORG_SEARCH_URL", process.env.STABLEENRICH_APOLLO_ORG_SEARCH_URL);
  setIfPresent(env, "STABLEENRICH_APOLLO_PEOPLE_SEARCH_URL", process.env.STABLEENRICH_APOLLO_PEOPLE_SEARCH_URL);
  setIfPresent(env, "STABLEENRICH_APOLLO_PEOPLE_ENRICH_URL", process.env.STABLEENRICH_APOLLO_PEOPLE_ENRICH_URL);
  setIfPresent(env, "STABLEENRICH_HUNTER_EMAIL_VERIFIER_URL", process.env.STABLEENRICH_HUNTER_EMAIL_VERIFIER_URL);
  setIfPresent(env, "STABLEENRICH_CLADO_CONTACTS_ENRICH_URL", process.env.STABLEENRICH_CLADO_CONTACTS_ENRICH_URL);
  setIfPresent(env, "STABLEENRICH_MINERVA_ENRICH_URL", process.env.STABLEENRICH_MINERVA_ENRICH_URL);
  return env;
}

function setIfPresent(env: StableenrichEnv, key: keyof StableenrichEnv, value: string | undefined) {
  if (value) {
    env[key] = value;
  }
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
