import { agentcashJson } from "../agentcash";
import { providerBudgetForEndpoint } from "../provider-budget";
import { allSettledLimited, supportedUrl } from "../stableenrich-utils";
import type { ProviderFactCandidate, ProviderResearchPlan, ProviderSource, RetrievalIntent, StableenrichEnv, StableenrichProbe } from "../types";
import { type EmailPattern, sourceSearchSubjectForDomain } from "@cold-start/core";

export type StableenrichEmailDiscovery = {
  name: string;
  role: string | null;
  discoverySource: "apollo" | "sec_edgar" | "exa" | "search_hint" | "people_hint" | null;
  emailFound: string | null;
  emailSource: "apollo_search" | "apollo_enrich" | "minerva" | "clado" | "hunter" | "exa" | null;
  hunterAttempts?: Array<{
    email: string;
    status: string | null;
    score: number | null;
    accepted: boolean;
  }>;
};

export type StableenrichEmailPatternResult = {
  observed: Array<{ email: string; fullName: string | null; sourceUrl: string | null }>;
  pattern: EmailPattern | null;
  patternAnchorCount: number;
  sources: ProviderSource[];
  failures: StableenrichProbeFailure[];
  endpoints: StableenrichSourcesResult["endpoints"];
  budgetCeilingHit?: boolean;
};

const stableenrichBaseUrl = "https://stableenrich.dev";

const stableenrichPaths = {
  STABLEENRICH_EXA_SEARCH_URL: "/api/exa/search",
  STABLEENRICH_EXA_SIMILAR_URL: "/api/exa/find-similar",
  STABLEENRICH_FIRECRAWL_URL: "/api/firecrawl/scrape",
  STABLEENRICH_ORG_ENRICH_URL: "/api/apollo/org-enrich",
  STABLEENRICH_APOLLO_ORG_SEARCH_URL: "/api/apollo/org-search",
  STABLEENRICH_APOLLO_PEOPLE_SEARCH_URL: "/api/apollo/people-search",
  STABLEENRICH_APOLLO_PEOPLE_ENRICH_URL: "/api/apollo/people-enrich",
  STABLEENRICH_HUNTER_EMAIL_VERIFIER_URL: "/api/hunter/email-verifier",
  STABLEENRICH_CLADO_CONTACTS_ENRICH_URL: "/api/clado/contacts-enrich",
  STABLEENRICH_MINERVA_ENRICH_URL: "/api/minerva/enrich",
} as const;

type StableenrichEndpointKey = keyof typeof stableenrichPaths;

export type AgentcashFetch = (input: { url: string; body: Record<string, unknown>; timeoutMs?: number }) => Promise<unknown>;

export type StableenrichProbeResult = {
  name: StableenrichProbe["name"];
  endpointUrl: string;
  result: unknown;
  durationMs?: number;
  metadata?: {
    domain?: string;
    personName?: string;
    role?: string;
    sourceUrl?: string;
    email?: string;
  };
};

type StableenrichProbeTier = "all" | "fast" | "enrichment";

export type AgentcashBudgetState = {
  maxUsd: number | null;
  spentUsd: number;
  ceilingHit: boolean;
  skippedEndpoints: StableenrichProbe["name"][];
};

const fastStableenrichProbeNames = new Set<StableenrichProbe["name"]>([
  "exa_funding_history",
  "exa_company_profile",
  "exa_management_team",
  "firecrawl_homepage",
  "org_enrichment"
]);

export function createAgentcashBudgetState(maxUsd?: number | null): AgentcashBudgetState {
  return {
    maxUsd: typeof maxUsd === "number" && Number.isFinite(maxUsd) && maxUsd >= 0 ? maxUsd : null,
    spentUsd: 0,
    ceilingHit: false,
    skippedEndpoints: []
  };
}

export function takeAgentcashBudget(state: AgentcashBudgetState | undefined, endpoint: StableenrichProbe["name"]) {
  if (!state || state.maxUsd === null) {
    return true;
  }

  const budget = providerBudgetForEndpoint("stableenrich", endpoint);
  if (state.spentUsd + budget.estimatedCostUsd > state.maxUsd) {
    state.ceilingHit = true;
    state.skippedEndpoints.push(endpoint);
    return false;
  }

  state.spentUsd = Number((state.spentUsd + budget.estimatedCostUsd).toFixed(6));
  return true;
}

function selectStableenrichRequests(input: {
  env: StableenrichEnv;
  domain: string;
  researchPlan?: ProviderResearchPlan | undefined;
  tier?: StableenrichProbeTier | undefined;
  skipProbeNames?: StableenrichProbe["name"][] | undefined;
  budgetState?: AgentcashBudgetState | undefined;
}) {
  const tier = input.tier ?? "all";
  const skipProbeNames = new Set(input.skipProbeNames ?? []);
  return buildStableenrichRequests(input.env, input.domain, input.researchPlan).filter((request) => {
    if (skipProbeNames.has(request.name)) {
      return false;
    }

    if (tier !== "all") {
      const isFast = fastStableenrichProbeNames.has(request.name);
      if (tier === "fast" ? !isFast : isFast) {
        return false;
      }
    }

    return takeAgentcashBudget(input.budgetState, request.name);
  });
}

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
    durationMs?: number;
    error?: string;
  }>;
  emailDiscovery?: StableenrichEmailDiscovery[];
  budgetCeilingHit?: boolean;
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
  const searchSubject = sourceSearchSubjectForDomain(domain);

  return [
    {
      name: "exa_funding_history",
      url: stableenrichEndpointUrl(env, "STABLEENRICH_EXA_SEARCH_URL"),
      body: {
        query: queries?.funding ?? `${searchSubject} funding raised Series valuation investors led by latest round total raised`,
        numResults: 8,
      },
    },
    {
      name: "exa_company_profile",
      url: stableenrichEndpointUrl(env, "STABLEENRICH_EXA_SEARCH_URL"),
      body: {
        query: queries?.companyProfile ?? `${searchSubject} what does the company do product customers platform investor profile`,
        numResults: 5,
      },
    },
    {
      name: "exa_management_team",
      url: stableenrichEndpointUrl(env, "STABLEENRICH_EXA_SEARCH_URL"),
      body: {
        query: queries?.managementTeam ?? `${searchSubject} founders CEO leadership management team contact email`,
        numResults: 5,
      },
    },
    {
      name: "exa_recent_signals",
      url: stableenrichEndpointUrl(env, "STABLEENRICH_EXA_SEARCH_URL"),
      body: {
        query: queries?.recentSignals ?? `${searchSubject} recent launch customers hiring funding product partnership traction`,
        numResults: 5,
      },
    },
    {
      name: "exa_competition",
      url: stableenrichEndpointUrl(env, "STABLEENRICH_EXA_SEARCH_URL"),
      body: {
        query: queries?.comparables ?? `${searchSubject} competitors alternatives similar companies market map`,
        numResults: 5,
      },
    },
    {
      name: "exa_independent_analysis",
      url: stableenrichEndpointUrl(env, "STABLEENRICH_EXA_SEARCH_URL"),
      body: {
        query:
          queries?.independentAnalysis ??
          `${searchSubject} independent analysis market map deep dive analyst report technical benchmark expert transcript investor research revenue funding traction customers`,
        numResults: 6,
      },
    },
    {
      // Customer proof and product proof are judgment evidence, not fact fill. They feed
      // the Lens and research sections; neither runs in the basics fast tier.
      name: "exa_customer_proof",
      url: stableenrichEndpointUrl(env, "STABLEENRICH_EXA_SEARCH_URL"),
      body: {
        query:
          queries?.customerProof ??
          `${searchSubject} customer case study deployment results rollout named customer in production`,
        numResults: 5,
      },
    },
    {
      name: "exa_product_proof",
      url: stableenrichEndpointUrl(env, "STABLEENRICH_EXA_SEARCH_URL"),
      body: {
        query:
          queries?.productProof ??
          `${searchSubject} technical documentation github repository benchmark API architecture how it works`,
        numResults: 5,
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
      name: "firecrawl_about",
      url: stableenrichEndpointUrl(env, "STABLEENRICH_FIRECRAWL_URL"),
      body: { url: `https://${domain}/about` },
    },
    {
      name: "firecrawl_team",
      url: stableenrichEndpointUrl(env, "STABLEENRICH_FIRECRAWL_URL"),
      body: { url: `https://${domain}/team` },
    },
    {
      name: "org_enrichment",
      url: stableenrichEndpointUrl(env, "STABLEENRICH_ORG_ENRICH_URL"),
      body: { domain },
    },
  ];
}

export const APOLLO_LEADER_SENIORITIES = ["founder", "c_suite", "owner", "partner", "head", "vp", "director"];

export const APOLLO_LEADER_TITLES = [
  "Founder",
  "Co-Founder",
  "Cofounder",
  "CEO",
  "Chief Executive Officer",
  "President",
  "Managing Partner",
  "CTO",
  "Chief Technology Officer",
  "CFO",
  "Chief Financial Officer",
  "COO",
  "Chief Operating Officer",
  "CPO",
  "Chief Product Officer",
  "CRO",
  "Chief Revenue Officer",
  "CMO",
  "Chief Marketing Officer",
  "Chief Scientist",
  "Chief Architect",
  "VP Engineering",
  "VP Product",
  "VP Sales",
  "Head of Engineering",
  "Head of Product",
  "Head of Sales",
];

export async function runStableenrichProbe(input: {
  env: StableenrichEnv;
  domain: string;
  researchPlan?: ProviderResearchPlan | undefined;
  agentcashFetch?: AgentcashFetch | undefined;
  tier?: StableenrichProbeTier | undefined;
  skipProbeNames?: StableenrichProbe["name"][] | undefined;
  maxBudgetUsd?: number | undefined;
  budgetState?: AgentcashBudgetState | undefined;
  requests?: StableenrichProbe[] | undefined;
}): Promise<PromiseSettledResult<StableenrichProbeResult>[]> {
  requireStableenrichConfig(input.env);
  const budgetState = input.budgetState ?? createAgentcashBudgetState(input.maxBudgetUsd);
  const requests = input.requests ?? selectStableenrichRequests({
    env: input.env,
    domain: input.domain,
    researchPlan: input.researchPlan,
    tier: input.tier,
    skipProbeNames: input.skipProbeNames,
    budgetState
  });
  const agentcashFetch = input.agentcashFetch ?? ((request) => agentcashJson<unknown>(request));

  return allSettledLimited(requests, async (request) => {
    try {
      const startedAt = Date.now();
      const result = await agentcashFetch({ url: request.url, body: request.body, timeoutMs: stableenrichProbeTimeoutMs(request.name) });
      return {
        name: request.name,
        endpointUrl: request.url,
        metadata: { domain: input.domain },
        result,
        durationMs: Date.now() - startedAt,
      };
    } catch (error) {
      throw {
        name: request.name,
        endpointUrl: request.url,
        error: error instanceof Error ? error.message : String(error),
      } satisfies StableenrichProbeFailure;
    }
  });
}

export function stableenrichProbeTimeoutMs(name: StableenrichProbe["name"]) {
  const configured = Number.parseInt(process.env.STABLEENRICH_AGENTCASH_TIMEOUT_MS ?? "", 10);
  if (Number.isFinite(configured) && configured > 0) {
    return configured;
  }

  return providerBudgetForEndpoint("stableenrich", name).timeoutMs;
}

export function providerSourceFromText(input: {
  url: string;
  title: string;
  sourceType: ProviderSource["sourceType"];
  rawText: string;
  intent?: RetrievalIntent;
  publishedAt?: string;
  imageUrl?: string | null;
}): ProviderSource {
  return {
    ...input,
    fetchedAt: new Date().toISOString(),
  };
}

export function isExaSearchProbe(name: StableenrichProbe["name"]) {
  return (
    name === "exa_funding_history" ||
    name === "exa_company_profile" ||
    name === "exa_management_team" ||
    name === "exa_recent_signals" ||
    name === "exa_competition" ||
    name === "exa_independent_analysis" ||
    name === "exa_customer_proof" ||
    name === "exa_product_proof" ||
    name === "exa_find_similar" ||
    name === "exa_email_search" ||
    name === "exa_leader_discovery"
  );
}

export function fullName(firstName: string | undefined, lastName: string | undefined) {
  return [firstName, lastName].filter(Boolean).join(" ").trim() || null;
}

export function providerFact<T>(
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

export function addStringFact(
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

export function addUrlFact(
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

export function stableenrichCitationUrl(endpointUrl: string, domain: string | null) {
  const url = new URL(endpointUrl);
  if (domain) {
    url.searchParams.set("domain", domain);
  }
  return url.toString();
}

export function requireStableenrichConfig(env: StableenrichEnv) {
  const missing = missingStableenrichConfig(env);
  if (missing.length > 0) {
    throw new Error(`Missing stableenrich config: ${missing.join(", ")}`);
  }
}

export function stableenrichEndpointUrl(env: StableenrichEnv, key: StableenrichEndpointKey) {
  const override = env[key]?.trim();
  if (override) {
    return override;
  }

  const baseUrl = env.STABLEENRICH_BASE_URL?.trim() || stableenrichBaseUrl;
  return `${baseUrl.replace(/\/+$/, "")}${stableenrichPaths[key]}`;
}

export function stableenrichProbeFailure(reason: unknown): StableenrichProbeFailure[] {
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
