import { agentcashJson } from "./agentcash";
import type { ProviderSource, StableenrichEnv, StableenrichProbe } from "./types";

const requiredKeys = [
  "AGENTCASH_API_KEY",
  "STABLEENRICH_EXA_SEARCH_URL",
  "STABLEENRICH_EXA_SIMILAR_URL",
  "STABLEENRICH_FIRECRAWL_URL",
  "STABLEENRICH_ORG_ENRICH_URL",
  "STABLEENRICH_LINKEDIN_URL",
] as const;

type StableenrichRequiredKey = (typeof requiredKeys)[number];

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
  return requiredKeys.filter((key) => !env[key]);
}

export function buildStableenrichRequests(env: StableenrichEnv, domain: string): StableenrichProbe[] {
  const config = requireStableenrichConfig(env);

  return [
    {
      name: "exa_search_news",
      url: config.STABLEENRICH_EXA_SEARCH_URL,
      body: { query: `${domain} funding founders product launch`, numResults: 8 },
    },
    {
      name: "exa_find_similar",
      url: config.STABLEENRICH_EXA_SIMILAR_URL,
      body: { url: `https://${domain}`, numResults: 8 },
    },
    {
      name: "firecrawl_homepage",
      url: config.STABLEENRICH_FIRECRAWL_URL,
      body: { url: `https://${domain}`, paths: ["/", "/about", "/team", "/pricing"] },
    },
    {
      name: "org_enrichment",
      url: config.STABLEENRICH_ORG_ENRICH_URL,
      body: { domain },
    },
    {
      name: "linkedin_company",
      url: config.STABLEENRICH_LINKEDIN_URL,
      body: { domain },
    },
  ];
}

export async function runStableenrichProbe(input: {
  env: StableenrichEnv;
  domain: string;
  fetchImpl?: typeof fetch;
}): Promise<PromiseSettledResult<StableenrichProbeResult>[]> {
  const config = requireStableenrichConfig(input.env);
  const requests = buildStableenrichRequests(input.env, input.domain);

  return Promise.allSettled(
    requests.map(async (request) => {
      const agentcashInput = {
        url: request.url,
        apiKey: config.AGENTCASH_API_KEY,
        body: request.body,
      };

      try {
        return {
          name: request.name,
          endpointUrl: request.url,
          result: await agentcashJson<unknown>(
            input.fetchImpl ? { ...agentcashInput, fetchImpl: input.fetchImpl } : agentcashInput,
          ),
        };
      } catch (error) {
        throw {
          name: request.name,
          endpointUrl: request.url,
          error: error instanceof Error ? error.message : String(error),
        } satisfies StableenrichProbeFailure;
      }
    }),
  );
}

export async function fetchStableenrichSources(input: {
  env: StableenrichEnv;
  domain: string;
  fetchImpl?: typeof fetch;
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

function requireStableenrichConfig(env: StableenrichEnv): Record<StableenrichRequiredKey, string> {
  const missing = missingStableenrichConfig(env);
  if (missing.length > 0) {
    throw new Error(`Missing stableenrich config: ${missing.join(", ")}`);
  }

  return Object.fromEntries(requiredKeys.map((key) => [key, env[key]])) as Record<
    StableenrichRequiredKey,
    string
  >;
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
