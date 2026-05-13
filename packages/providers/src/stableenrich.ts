import { agentcashJson } from "./agentcash";
import type { ProviderResearchPlan, ProviderSource, RetrievalIntent, StableenrichEnv, StableenrichProbe } from "./types";

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

export function buildStableenrichRequests(env: StableenrichEnv, domain: string, researchPlan?: ProviderResearchPlan): StableenrichProbe[] {
  requireStableenrichConfig(env);
  const queries = researchPlan?.searchQueries;

  return [
    {
      name: "exa_funding_history",
      url: stableenrichEndpointUrl(env, "STABLEENRICH_EXA_SEARCH_URL"),
      body: {
        query: queries?.funding ?? `${domain} funding raised Series valuation investors led by latest round total raised`,
        numResults: 8,
      },
    },
    {
      name: "exa_company_profile",
      url: stableenrichEndpointUrl(env, "STABLEENRICH_EXA_SEARCH_URL"),
      body: {
        query: queries?.companyProfile ?? `${domain} what does the company do product customers platform investor profile`,
        numResults: 6,
      },
    },
    {
      name: "exa_recent_signals",
      url: stableenrichEndpointUrl(env, "STABLEENRICH_EXA_SEARCH_URL"),
      body: {
        query: `${domain} recent launch customers hiring funding product partnership traction`,
        numResults: 6,
      },
    },
    {
      name: "exa_independent_analysis",
      url: stableenrichEndpointUrl(env, "STABLEENRICH_EXA_SEARCH_URL"),
      body: {
        query: queries?.independentAnalysis ?? `${domain} independent analysis Sacra blog market map deep dive`,
        numResults: 6,
      },
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
  researchPlan?: ProviderResearchPlan;
  agentcashFetch?: AgentcashFetch;
}): Promise<PromiseSettledResult<StableenrichProbeResult>[]> {
  requireStableenrichConfig(input.env);
  const requests = buildStableenrichRequests(input.env, input.domain, input.researchPlan);
  const agentcashFetch = input.agentcashFetch ?? ((request) => agentcashJson<unknown>(request));

  return Promise.allSettled(requests.map(async (request) => {
    try {
      return {
        name: request.name,
        endpointUrl: request.url,
        result: await agentcashFetch({ url: request.url, body: request.body }),
      };
    } catch (error) {
      throw {
        name: request.name,
        endpointUrl: request.url,
        error: error instanceof Error ? error.message : String(error),
      } satisfies StableenrichProbeFailure;
    }
  }));
}

export async function fetchStableenrichSources(input: {
  env: StableenrichEnv;
  domain: string;
  researchPlan?: ProviderResearchPlan;
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

    return providerSourcesFromProbeResult(result.value);
  });

  const failures = results.flatMap((result) => {
    if (result.status === "fulfilled") {
      return [];
    }

    return stableenrichProbeFailure(result.reason);
  });

  return { sources, failures };
}

function providerSourcesFromProbeResult(result: StableenrichProbeResult): ProviderSource[] {
  const intent = intentForProbe(result.name);
  const sourceType = sourceTypeForProbe(result.name);

  if (isExaSearchProbe(result.name)) {
    const sources = exaResultSources(result.result, { intent, sourceType });
    if (sources.length > 0) {
      return sources;
    }
  }

  return [
    providerSourceFromText({
      url: `agentcash:${result.name}`,
      title: result.name,
      sourceType,
      rawText: JSON.stringify(result.result),
      ...(intent ? { intent } : {}),
    }),
  ];
}

export function providerSourceFromText(input: {
  url: string;
  title: string;
  sourceType: ProviderSource["sourceType"];
  rawText: string;
  intent?: RetrievalIntent;
  publishedAt?: string;
}): ProviderSource {
  return {
    ...input,
    fetchedAt: new Date().toISOString(),
  };
}

function isExaSearchProbe(name: StableenrichProbe["name"]) {
  return name === "exa_funding_history" || name === "exa_company_profile" || name === "exa_recent_signals" || name === "exa_independent_analysis";
}

function sourceTypeForProbe(name: StableenrichProbe["name"]): ProviderSource["sourceType"] {
  if (name === "firecrawl_homepage") {
    return "company_site";
  }

  if (isExaSearchProbe(name)) {
    return "news";
  }

  return "enrichment";
}

function intentForProbe(name: StableenrichProbe["name"]): RetrievalIntent {
  switch (name) {
    case "exa_funding_history":
      return "funding";
    case "exa_company_profile":
      return "company_profile";
    case "exa_recent_signals":
      return "recent_signals";
    case "exa_independent_analysis":
      return "independent_analysis";
    case "exa_find_similar":
      return "comparables";
    case "firecrawl_homepage":
      return "homepage";
    case "org_enrichment":
      return "firmographics";
  }
}

function exaResultSources(
  payload: unknown,
  metadata: { intent: RetrievalIntent; sourceType: ProviderSource["sourceType"] },
): ProviderSource[] {
  return extractUrlRecords(payload)
    .map((record) => {
      const url = stringRecordValue(record, "url");
      if (!url) {
        return undefined;
      }

      const publishedAt = stringRecordValue(record, "publishedDate");

      return providerSourceFromText({
        url,
        title: stringRecordValue(record, "title") ?? stringRecordValue(record, "name") ?? url,
        sourceType: metadata.sourceType,
        rawText: JSON.stringify(record),
        intent: metadata.intent,
        ...(publishedAt ? { publishedAt } : {}),
      });
    })
    .filter((source): source is ProviderSource => source !== undefined);
}

function extractUrlRecords(payload: unknown): Record<string, unknown>[] {
  const records: Record<string, unknown>[] = [];
  const seen = new Set<unknown>();

  function visit(value: unknown) {
    if (!value || typeof value !== "object" || seen.has(value)) {
      return;
    }

    seen.add(value);

    if (Array.isArray(value)) {
      for (const item of value) {
        visit(item);
      }
      return;
    }

    const record = value as Record<string, unknown>;
    if (typeof record.url === "string" && record.url.startsWith("http")) {
      records.push(record);
      return;
    }

    for (const nested of Object.values(record)) {
      visit(nested);
    }
  }

  visit(payload);
  return dedupeRecordsByUrl(records);
}

function dedupeRecordsByUrl(records: Record<string, unknown>[]) {
  const byUrl = new Map<string, Record<string, unknown>>();
  for (const record of records) {
    const url = stringRecordValue(record, "url");
    if (url && !byUrl.has(url)) {
      byUrl.set(url, record);
    }
  }
  return Array.from(byUrl.values());
}

function stringRecordValue(record: Record<string, unknown>, key: string) {
  const value = record[key];
  return typeof value === "string" && value.trim().length > 0 ? value : undefined;
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
