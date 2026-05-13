import { agentcashJson } from "./agentcash";
import type {
  ProviderFactCandidate,
  ProviderResearchPlan,
  ProviderSource,
  RetrievalIntent,
  StableenrichEnv,
  StableenrichProbe
} from "./types";

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
  facts: ProviderFactCandidate[];
  failures: StableenrichProbeFailure[];
  endpoints: Array<{
    name: StableenrichProbe["name"];
    endpointUrl: string;
    status: "ok" | "failed";
    sourceCount: number;
    factCount: number;
    error?: string;
  }>;
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
  const facts = results.flatMap((result) => {
    if (result.status !== "fulfilled") {
      return [];
    }

    return providerFactsFromProbeResult(result.value);
  });

  const failures = results.flatMap((result) => {
    if (result.status === "fulfilled") {
      return [];
    }

    return stableenrichProbeFailure(result.reason);
  });
  const endpoints = results.map((result) => {
    if (result.status === "fulfilled") {
      return {
        name: result.value.name,
        endpointUrl: result.value.endpointUrl,
        status: "ok" as const,
        sourceCount: providerSourcesFromProbeResult(result.value).length,
        factCount: providerFactsFromProbeResult(result.value).length,
      };
    }

    const failure = stableenrichProbeFailure(result.reason)[0];
    return {
      name: failure?.name ?? "exa_funding_history",
      endpointUrl: failure?.endpointUrl ?? "stableenrich",
      status: "failed" as const,
      sourceCount: 0,
      factCount: 0,
      ...(failure?.error ? { error: failure.error } : {}),
    };
  });

  return { sources, facts, failures, endpoints };
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

function providerFactsFromProbeResult(result: StableenrichProbeResult): ProviderFactCandidate[] {
  if (result.name === "org_enrichment") {
    return orgEnrichmentFacts(result);
  }

  if (result.name === "exa_find_similar") {
    return comparableFacts(result);
  }

  return [];
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

function orgEnrichmentFacts(result: StableenrichProbeResult): ProviderFactCandidate[] {
  const fetchedAt = new Date().toISOString();
  const root = objectRecord(result.result);
  const organization = root ? objectRecord(root.organization) : null;
  if (!organization) {
    return [];
  }

  const domain = stringValue(organization.domain) ?? domainFromUrl(stringValue(organization.website_url));
  const citationUrl = stableenrichCitationUrl(result.endpointUrl, domain);
  const citationTitle = domain ? `Apollo org enrichment for ${domain}` : "Apollo org enrichment";
  const rawText = JSON.stringify(root);
  const facts: ProviderFactCandidate[] = [];

  addStringFact(facts, "identity.name", stringValue(organization.name), result, { citationUrl, citationTitle, fetchedAt, rawText, confidence: "high" });
  addUrlFact(facts, "identity.websiteUrl", stringValue(organization.website_url) ?? urlFromDomain(domain), result, {
    citationUrl,
    citationTitle,
    fetchedAt,
    rawText,
    confidence: "high",
  });
  addUrlFact(facts, "identity.linkedinUrl", stringValue(organization.linkedin_url), result, {
    citationUrl,
    citationTitle,
    fetchedAt,
    rawText,
    confidence: "medium",
  });
  addUrlFact(facts, "identity.logoUrl", stringValue(organization.logo_url), result, {
    citationUrl,
    citationTitle,
    fetchedAt,
    rawText,
    confidence: "medium",
  });

  const city = stringValue(organization.city);
  const country = stringValue(organization.country);
  if (city && country) {
    facts.push(providerFact("identity.hq", { city, country }, result, { citationUrl, citationTitle, fetchedAt, rawText, confidence: "medium" }));
  }

  const foundedYear = integerValue(organization.founded_year);
  if (foundedYear !== null && foundedYear >= 1800 && foundedYear <= 2100) {
    facts.push(providerFact("identity.foundedYear", foundedYear, result, { citationUrl, citationTitle, fetchedAt, rawText, confidence: "medium" }));
  }

  const shortDescription = stringValue(organization.short_description) ?? stringValue(organization.seo_description);
  if (shortDescription) {
    facts.push(
      providerFact(
        "identity.description",
        {
          shortDescription,
          concept: null,
          serves: null,
          mechanism: null,
        },
        result,
        { citationUrl, citationTitle, fetchedAt, rawText, confidence: "medium" },
      ),
    );
  }

  const totalFunding = integerValue(organization.total_funding);
  if (totalFunding !== null && totalFunding > 0) {
    facts.push(providerFact("funding.totalRaisedUsd", totalFunding, result, { citationUrl, citationTitle, fetchedAt, rawText, confidence: "low" }));
  }

  const latestStage = stringValue(organization.latest_funding_stage);
  const latestDate = stringValue(organization.latest_funding_round_date);
  if (latestStage || latestDate) {
    facts.push(
      providerFact(
        "funding.lastRound",
        {
          name: latestStage ?? "Latest round",
          amountUsd: null,
          announcedAt: latestDate,
          leadInvestors: [],
        },
        result,
        { citationUrl, citationTitle, fetchedAt, rawText, confidence: "low" },
      ),
    );
  }

  const headcount = integerValue(organization.estimated_num_employees);
  if (headcount !== null && headcount >= 0) {
    facts.push(
      providerFact("team.headcount", { value: headcount, asOf: fetchedAt.slice(0, 10) }, result, {
        citationUrl,
        citationTitle,
        fetchedAt,
        rawText,
        confidence: "low",
      }),
    );
  }

  return facts;
}

function comparableFacts(result: StableenrichProbeResult): ProviderFactCandidate[] {
  const fetchedAt = new Date().toISOString();
  return extractUrlRecords(result.result).flatMap((record) => {
    const url = stringRecordValue(record, "url");
    if (!url) {
      return [];
    }

    const domain = domainFromUrl(url);
    if (!domain) {
      return [];
    }

    const title = stringRecordValue(record, "title") ?? stringRecordValue(record, "name") ?? domain;
    const text = stringRecordValue(record, "text") ?? stringRecordValue(record, "summary") ?? title;
    return [
      providerFact(
        "comparables",
        {
          name: comparableName(title, domain),
          domain,
          oneLiner: truncateText(text, 180),
          basis: "Similar web and market context from Exa find-similar",
          confidence: "medium",
        },
        result,
        {
          citationUrl: url,
          citationTitle: title,
          fetchedAt,
          rawText: JSON.stringify(record),
          confidence: "medium",
          sourceType: "news",
        },
      ),
    ];
  });
}

function providerFact<T>(
  path: ProviderFactCandidate<T>["path"],
  value: T,
  result: StableenrichProbeResult,
  options: {
    citationUrl: string;
    citationTitle: string;
    fetchedAt: string;
    rawText?: string;
    confidence: ProviderFactCandidate["confidence"];
    sourceType?: ProviderSource["sourceType"];
  },
): ProviderFactCandidate<T> {
  return {
    path,
    value,
    status: "inferred",
    confidence: options.confidence,
    sourceType: options.sourceType ?? "enrichment",
    provider: "stableenrich",
    endpoint: result.name,
    citationUrl: options.citationUrl,
    citationTitle: options.citationTitle,
    fetchedAt: options.fetchedAt,
    ...(options.rawText ? { rawText: options.rawText } : {}),
  };
}

function addStringFact(
  facts: ProviderFactCandidate[],
  path: ProviderFactCandidate<string>["path"],
  value: string | null,
  result: StableenrichProbeResult,
  options: {
    citationUrl: string;
    citationTitle: string;
    fetchedAt: string;
    rawText: string;
    confidence: ProviderFactCandidate["confidence"];
  },
) {
  if (value) {
    facts.push(providerFact(path, value, result, options));
  }
}

function addUrlFact(
  facts: ProviderFactCandidate[],
  path: ProviderFactCandidate<string>["path"],
  value: string | null,
  result: StableenrichProbeResult,
  options: {
    citationUrl: string;
    citationTitle: string;
    fetchedAt: string;
    rawText: string;
    confidence: ProviderFactCandidate["confidence"];
  },
) {
  if (value && supportedUrl(value)) {
    facts.push(providerFact(path, value, result, options));
  }
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
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

function objectRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function stringValue(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function integerValue(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.round(value);
  }

  if (typeof value === "string") {
    const cleaned = value.replace(/[$,]/g, "").trim();
    const parsed = Number(cleaned);
    return Number.isFinite(parsed) ? Math.round(parsed) : null;
  }

  return null;
}

function supportedUrl(value: string) {
  try {
    const parsed = new URL(value);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

function urlFromDomain(domain: string | null) {
  return domain ? `https://${domain}` : null;
}

function domainFromUrl(value: string | null | undefined) {
  if (!value) {
    return null;
  }

  try {
    return new URL(value.startsWith("http") ? value : `https://${value}`).hostname.replace(/^www\./i, "").toLowerCase();
  } catch {
    return null;
  }
}

function stableenrichCitationUrl(endpointUrl: string, domain: string | null) {
  const url = new URL(endpointUrl);
  if (domain) {
    url.searchParams.set("domain", domain);
  }
  return url.toString();
}

function comparableName(title: string, domain: string) {
  const clean = title.split(/[|-]/)[0]?.trim();
  if (clean && clean.length <= 80) {
    return clean;
  }

  return domain
    .split(".")[0]
    ?.split(/[-_]+/)
    .filter(Boolean)
    .map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`)
    .join(" ") || domain;
}

function truncateText(value: string, maxLength: number) {
  const normalized = value.replace(/\s+/g, " ").trim();
  if (normalized.length <= maxLength) {
    return normalized;
  }

  return `${normalized.slice(0, maxLength - 1).trim()}.`;
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
