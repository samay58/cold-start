import { agentcashJson } from "./agentcash";
import type { ProviderSource, StableenrichEnv, StableenrichProbe } from "./types";

const stableenrichBaseUrl = "https://stableenrich.dev";
const stableenrichPaths = {
  STABLEENRICH_EXA_SEARCH_URL: "/api/exa/search",
  STABLEENRICH_EXA_SIMILAR_URL: "/api/exa/find-similar",
  STABLEENRICH_FIRECRAWL_URL: "/api/firecrawl/scrape",
  STABLEENRICH_ORG_ENRICH_URL: "/api/apollo/org-enrich",
} as const;

type StableenrichEndpointKey = keyof typeof stableenrichPaths;
type AgentcashFetch = (input: { url: string; body: Record<string, unknown> }) => Promise<unknown>;

type StableenrichProbeResult = {
  name: StableenrichProbe["name"];
  endpointUrl: string;
  result: unknown;
};

export type StableenrichProbeFailure = {
  name: StableenrichProbe["name"];
  endpointUrl: string;
  error: string;
};

export type StableenrichSourcesResult = {
  sources: ProviderSource[];
  failures: StableenrichProbeFailure[];
};

export function missingStableenrichConfig(env: StableenrichEnv): string[] {
  return Object.keys(stableenrichPaths).filter((key) => {
    const value = env[key as StableenrichEndpointKey];
    return value !== undefined && value.trim().length === 0;
  });
}

export function buildStableenrichRequests(env: StableenrichEnv, domain: string): StableenrichProbe[] {
  requireStableenrichConfig(env);

  return [
    {
      name: "exa_search_news",
      url: stableenrichEndpointUrl(env, "STABLEENRICH_EXA_SEARCH_URL"),
      body: { query: `${domain} funding founders product launch`, numResults: 8 },
    },
    {
      name: "exa_find_similar",
      url: stableenrichEndpointUrl(env, "STABLEENRICH_EXA_SIMILAR_URL"),
      body: { url: `https://${domain}`, numResults: 8 },
    },
    {
      name: "firecrawl_homepage",
      url: stableenrichEndpointUrl(env, "STABLEENRICH_FIRECRAWL_URL"),
      body: { url: `https://${domain}` },
    },
    {
      name: "org_enrichment",
      url: stableenrichEndpointUrl(env, "STABLEENRICH_ORG_ENRICH_URL"),
      body: { domain },
    },
  ];
}

export async function runStableenrichProbe(input: {
  env: StableenrichEnv;
  domain: string;
  agentcashFetch?: AgentcashFetch;
}): Promise<PromiseSettledResult<StableenrichProbeResult>[]> {
  requireStableenrichConfig(input.env);
  const requests = buildStableenrichRequests(input.env, input.domain);
  const agentcashFetch = input.agentcashFetch ?? ((request) => agentcashJson<unknown>(request));
  const results: PromiseSettledResult<StableenrichProbeResult>[] = [];

  for (const request of requests) {
    try {
      results.push({
        status: "fulfilled",
        value: {
          name: request.name,
          endpointUrl: request.url,
          result: await agentcashFetch({ url: request.url, body: request.body }),
        },
      });
    } catch (error) {
      results.push({
        status: "rejected",
        reason: {
          name: request.name,
          endpointUrl: request.url,
          error: error instanceof Error ? error.message : String(error),
        } satisfies StableenrichProbeFailure,
      });
    }
  }

  return results;
}

export async function fetchStableenrichSources(input: {
  env: StableenrichEnv;
  domain: string;
  agentcashFetch?: AgentcashFetch;
}): Promise<StableenrichSourcesResult> {
  const results = await runStableenrichProbe(input);
  return collectStableenrichSources(results);
}

export function collectStableenrichSources(
  results: PromiseSettledResult<StableenrichProbeResult>[],
): StableenrichSourcesResult {
  const sources = results.flatMap((result) => {
    if (result.status !== "fulfilled") {
      return [];
    }

    const sourceType: ProviderSource["sourceType"] =
      result.value.name === "firecrawl_homepage"
        ? "company_site"
        : result.value.name === "exa_search_news"
          ? "news"
          : "enrichment";

    return [
      providerSourceFromText({
        url: `agentcash:${result.value.name}`,
        title: result.value.name,
        sourceType,
        rawText: JSON.stringify(result.value.result),
      }),
    ];
  });

  const failures = results.flatMap((result) => {
    if (result.status === "fulfilled") {
      return [];
    }

    return stableenrichProbeFailure(result.reason);
  });

  return { sources, failures };
}

export function providerSourceFromText(input: {
  url: string;
  title: string;
  sourceType: ProviderSource["sourceType"];
  rawText: string;
}): ProviderSource {
  return {
    ...input,
    fetchedAt: new Date().toISOString(),
  };
}

function requireStableenrichConfig(env: StableenrichEnv) {
  const missing = missingStableenrichConfig(env);
  if (missing.length > 0) {
    throw new Error(`Missing stableenrich config: ${missing.join(", ")}`);
  }
}

function stableenrichEndpointUrl(env: StableenrichEnv, key: StableenrichEndpointKey) {
  const override = env[key]?.trim();
  if (override) {
    return override;
  }

  const baseUrl = env.STABLEENRICH_BASE_URL?.trim() || stableenrichBaseUrl;
  return `${baseUrl.replace(/\/+$/, "")}${stableenrichPaths[key]}`;
}

function stableenrichProbeFailure(reason: unknown): StableenrichProbeFailure[] {
  if (!reason || typeof reason !== "object") {
    return [];
  }

  const candidate = reason as Partial<StableenrichProbeFailure>;
  if (candidate.name && candidate.endpointUrl && candidate.error) {
    return [
      {
        name: candidate.name,
        endpointUrl: candidate.endpointUrl,
        error: candidate.error,
      },
    ];
  }

  return [];
}
