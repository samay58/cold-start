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
  STABLEENRICH_APOLLO_PEOPLE_SEARCH_URL: "/api/apollo/people-search",
  STABLEENRICH_APOLLO_PEOPLE_ENRICH_URL: "/api/apollo/people-enrich",
  STABLEENRICH_HUNTER_EMAIL_VERIFIER_URL: "/api/hunter/email-verifier",
} as const;

type StableenrichEndpointKey = keyof typeof stableenrichPaths;
type AgentcashFetch = (input: { url: string; body: Record<string, unknown>; timeoutMs?: number }) => Promise<unknown>;

type StableenrichProbeResult = {
  name: StableenrichProbe["name"];
  endpointUrl: string;
  result: unknown;
  metadata?: {
    domain?: string;
    personName?: string;
    role?: string;
    sourceUrl?: string;
    email?: string;
  };
};

type StableenrichProbeTier = "all" | "fast" | "enrichment";

const fastStableenrichProbeNames = new Set<StableenrichProbe["name"]>([
  "exa_funding_history",
  "exa_company_profile",
  "exa_management_team",
  "firecrawl_homepage",
  "org_enrichment"
]);

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
        numResults: 5,
      },
    },
    {
      name: "exa_management_team",
      url: stableenrichEndpointUrl(env, "STABLEENRICH_EXA_SEARCH_URL"),
      body: {
        query: queries?.managementTeam ?? `${domain} founders CEO leadership management team contact email`,
        numResults: 5,
      },
    },
    {
      name: "exa_recent_signals",
      url: stableenrichEndpointUrl(env, "STABLEENRICH_EXA_SEARCH_URL"),
      body: {
        query: queries?.recentSignals ?? `${domain} recent launch customers hiring funding product partnership traction`,
        numResults: 5,
      },
    },
    {
      name: "exa_competition",
      url: stableenrichEndpointUrl(env, "STABLEENRICH_EXA_SEARCH_URL"),
      body: {
        query: queries?.comparables ?? `${domain} competitors alternatives similar companies market map`,
        numResults: 5,
      },
    },
    {
      name: "exa_independent_analysis",
      url: stableenrichEndpointUrl(env, "STABLEENRICH_EXA_SEARCH_URL"),
      body: {
        query: queries?.independentAnalysis ?? `${domain} independent analysis Sacra blog market map deep dive`,
        numResults: 4,
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
    {
      name: "apollo_people_search",
      url: stableenrichEndpointUrl(env, "STABLEENRICH_APOLLO_PEOPLE_SEARCH_URL"),
      body: {
        q_organization_domains: [domain],
        person_seniorities: ["founder", "c_suite", "owner", "partner", "head"],
        person_titles: ["Founder", "Co-Founder", "CEO", "Chief Executive Officer", "President", "Managing Partner"],
        per_page: 5,
        page: 1,
      },
    },
  ];
}

export async function runStableenrichProbe(input: {
  env: StableenrichEnv;
  domain: string;
  researchPlan?: ProviderResearchPlan;
  agentcashFetch?: AgentcashFetch;
  tier?: StableenrichProbeTier;
}): Promise<PromiseSettledResult<StableenrichProbeResult>[]> {
  requireStableenrichConfig(input.env);
  const tier = input.tier ?? "all";
  const requests = buildStableenrichRequests(input.env, input.domain, input.researchPlan).filter((request) => {
    if (tier === "all") {
      return true;
    }

    const isFast = fastStableenrichProbeNames.has(request.name);
    return tier === "fast" ? isFast : !isFast;
  });
  const agentcashFetch = input.agentcashFetch ?? ((request) => agentcashJson<unknown>(request));

  return allSettledLimited(requests, async (request) => {
    try {
      return {
        name: request.name,
        endpointUrl: request.url,
        metadata: { domain: input.domain },
        result: await agentcashFetch({ url: request.url, body: request.body, timeoutMs: stableenrichProbeTimeoutMs(request.name) }),
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

export async function fetchStableenrichSources(input: {
  env: StableenrichEnv;
  domain: string;
  researchPlan?: ProviderResearchPlan;
  agentcashFetch?: AgentcashFetch;
}): Promise<StableenrichSourcesResult> {
  const results = await runStableenrichProbe(input);
  const followups = await runStableenrichPeopleFollowups({
    env: input.env,
    domain: input.domain,
    results,
    agentcashFetch: input.agentcashFetch ?? ((request) => agentcashJson<unknown>(request)),
  });
  return collectStableenrichSources([...results, ...followups]);
}

export async function fetchStableenrichFastSources(input: {
  env: StableenrichEnv;
  domain: string;
  researchPlan?: ProviderResearchPlan;
  agentcashFetch?: AgentcashFetch;
}): Promise<StableenrichSourcesResult> {
  const results = await runStableenrichProbe({ ...input, tier: "fast" });
  return collectStableenrichSources(results);
}

export async function fetchStableenrichEnrichmentSources(input: {
  env: StableenrichEnv;
  domain: string;
  researchPlan?: ProviderResearchPlan;
  agentcashFetch?: AgentcashFetch;
}): Promise<StableenrichSourcesResult> {
  const results = await runStableenrichProbe({ ...input, tier: "enrichment" });
  const followups = await runStableenrichPeopleFollowups({
    env: input.env,
    domain: input.domain,
    results,
    agentcashFetch: input.agentcashFetch ?? ((request) => agentcashJson<unknown>(request)),
  });
  return collectStableenrichSources([...results, ...followups]);
}

export async function fetchStableenrichPeopleEmailSources(input: {
  env: StableenrichEnv;
  domain: string;
  sourceHints: ProviderSource[];
  peopleHints?: StableenrichPeopleEmailHint[];
  agentcashFetch?: AgentcashFetch;
}): Promise<StableenrichSourcesResult> {
  requireStableenrichConfig(input.env);
  const leaders = rankPeople([
    ...peopleRecordsFromEmailHints(input.peopleHints ?? []),
    ...peopleHintsFromProviderSources(input.sourceHints, input.domain),
  ]).slice(0, 3);
  const followups = await runPeopleFollowupRequests({
    env: input.env,
    domain: input.domain,
    leaders,
    agentcashFetch: input.agentcashFetch ?? ((request) => agentcashJson<unknown>(request)),
  });
  return collectStableenrichSources(followups);
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

async function runStableenrichPeopleFollowups(input: {
  env: StableenrichEnv;
  domain: string;
  results: PromiseSettledResult<StableenrichProbeResult>[];
  agentcashFetch: AgentcashFetch;
}): Promise<PromiseSettledResult<StableenrichProbeResult>[]> {
  const peopleSearch = input.results.find(
    (result): result is PromiseFulfilledResult<StableenrichProbeResult> =>
      result.status === "fulfilled" && result.value.name === "apollo_people_search"
  );
  const peopleSearchPeople = peopleSearch ? extractPeopleRecords(peopleSearch.value.result) : [];

  const leaders = rankPeople([
    ...peopleSearchPeople,
    ...peopleHintsFromSearchResults(input.results, input.domain),
  ]).slice(0, 3);

  return runPeopleFollowupRequests({ ...input, leaders });
}

async function runPeopleFollowupRequests(input: {
  env: StableenrichEnv;
  domain: string;
  leaders: PersonRecord[];
  agentcashFetch: AgentcashFetch;
}): Promise<PromiseSettledResult<StableenrichProbeResult>[]> {
  const leaders = input.leaders;
  if (leaders.length === 0) {
    return [];
  }

  const peopleEnrichUrl = stableenrichEndpointUrl(input.env, "STABLEENRICH_APOLLO_PEOPLE_ENRICH_URL");
  const enrichSettled = await allSettledLimited(
    leaders,
    async (person) => {
      try {
        return {
          name: "apollo_people_enrich" as const,
          endpointUrl: peopleEnrichUrl,
          result: await input.agentcashFetch({
            url: peopleEnrichUrl,
            body: peopleEnrichBody(person, input.domain),
            timeoutMs: stableenrichProbeTimeoutMs("apollo_people_enrich")
          }),
          metadata: personMetadata(person),
        };
      } catch (error) {
        throw {
          name: "apollo_people_enrich" as const,
          endpointUrl: peopleEnrichUrl,
          error: error instanceof Error ? error.message : String(error),
        } satisfies StableenrichProbeFailure;
      }
    },
  );

  const enrichedPeople = enrichSettled.flatMap((result) =>
    result.status === "fulfilled" ? extractPeopleRecords(result.value.result) : []
  );
  const peopleWithEmailNames = new Set(
    enrichedPeople
      .filter((person) => emailValue(person.email))
      .map((person) => personNameKey(person))
      .filter((key): key is string => key !== null)
  );
  const peopleForVerification = rankPeople([...leaders, ...enrichedPeople])
    .filter((person) => !emailValue(person.email))
    .filter((person) => {
      const key = personNameKey(person);
      return !key || !peopleWithEmailNames.has(key);
    });
  const candidates = peopleForVerification
    .flatMap((person) => emailCandidatesForPerson(person, input.domain).map((email) => ({ person, email })))
    .slice(0, 9);

  if (candidates.length === 0) {
    return enrichSettled;
  }

  const hunterUrl = stableenrichEndpointUrl(input.env, "STABLEENRICH_HUNTER_EMAIL_VERIFIER_URL");
  const hunterSettled = await allSettledLimited(
    candidates,
    async ({ person, email }) => {
      try {
        return {
          name: "hunter_email_verifier" as const,
          endpointUrl: hunterUrl,
          result: await input.agentcashFetch({
            url: hunterUrl,
            body: { email },
            timeoutMs: stableenrichProbeTimeoutMs("hunter_email_verifier")
          }),
          metadata: {
            ...personMetadata(person),
            email,
          },
        };
      } catch (error) {
        throw {
          name: "hunter_email_verifier" as const,
          endpointUrl: hunterUrl,
          error: error instanceof Error ? error.message : String(error),
        } satisfies StableenrichProbeFailure;
      }
    },
  );

  return [...enrichSettled, ...hunterSettled];
}

async function allSettledLimited<T, R>(
  items: T[],
  task: (item: T) => Promise<R>,
): Promise<PromiseSettledResult<R>[]> {
  const limit = stableenrichAgentcashConcurrency(items.length);
  const results = new Array<PromiseSettledResult<R>>(items.length);
  let nextIndex = 0;

  async function worker() {
    while (true) {
      const index = nextIndex;
      nextIndex += 1;
      if (index >= items.length) {
        return;
      }

      try {
        results[index] = { status: "fulfilled", value: await task(items[index]!) };
      } catch (reason) {
        results[index] = { status: "rejected", reason };
      }
    }
  }

  await Promise.all(Array.from({ length: limit }, worker));
  return results;
}

function stableenrichAgentcashConcurrency(itemCount: number) {
  const configured = Number.parseInt(process.env.STABLEENRICH_AGENTCASH_CONCURRENCY ?? "", 10);
  const requested = Number.isFinite(configured) && configured > 0 ? configured : 3;
  return Math.max(1, Math.min(itemCount, requested));
}

function stableenrichProbeTimeoutMs(name: StableenrichProbe["name"]) {
  const configured = Number.parseInt(process.env.STABLEENRICH_AGENTCASH_TIMEOUT_MS ?? "", 10);
  if (Number.isFinite(configured) && configured > 0) {
    return configured;
  }

  if (name === "hunter_email_verifier") {
    return 15_000;
  }

  if (name === "firecrawl_homepage" || name === "firecrawl_about" || name === "firecrawl_team") {
    return 20_000;
  }

  return 30_000;
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

  if (
    result.name === "apollo_people_search" ||
    result.name === "apollo_people_enrich" ||
    result.name === "hunter_email_verifier"
  ) {
    return peopleFacts(result);
  }

  if (result.name === "exa_recent_signals") {
    return signalFacts(result);
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
  return (
    name === "exa_funding_history" ||
    name === "exa_company_profile" ||
    name === "exa_management_team" ||
    name === "exa_recent_signals" ||
    name === "exa_competition" ||
    name === "exa_independent_analysis" ||
    name === "exa_find_similar"
  );
}

function sourceTypeForProbe(name: StableenrichProbe["name"]): ProviderSource["sourceType"] {
  if (name === "firecrawl_homepage" || name === "firecrawl_about" || name === "firecrawl_team") {
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
    case "exa_management_team":
      return "management_team";
    case "exa_recent_signals":
      return "recent_signals";
    case "exa_competition":
      return "comparables";
    case "exa_independent_analysis":
      return "independent_analysis";
    case "exa_find_similar":
      return "comparables";
    case "firecrawl_homepage":
      return "homepage";
    case "firecrawl_about":
      return "company_profile";
    case "firecrawl_team":
      return "management_team";
    case "org_enrichment":
      return "firmographics";
    case "apollo_people_search":
    case "apollo_people_enrich":
      return "management_team";
    case "hunter_email_verifier":
      return "email_verification";
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

type PersonRecord = {
  id?: string;
  name?: string;
  firstName?: string;
  lastName?: string;
  role?: string;
  email?: string;
  emailStatus?: string;
  linkedinUrl?: string;
  sourceUrl?: string;
};

export type StableenrichPeopleEmailHint = {
  id?: string;
  name?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  role?: string | null;
  email?: string | null;
  sourceUrl?: string | null;
  linkedinUrl?: string | null;
};

function peopleFacts(result: StableenrichProbeResult): ProviderFactCandidate[] {
  if (result.name === "hunter_email_verifier") {
    return hunterEmailFact(result);
  }

  return extractPeopleRecords(result.result).flatMap((person) => personFactCandidates(person, result));
}

function hunterEmailFact(result: StableenrichProbeResult): ProviderFactCandidate[] {
  const metadata = result.metadata;
  const email = emailValue(metadata?.email) ?? emailValue(stringRecordValue(objectRecord(result.result) ?? {}, "email"));
  if (!metadata?.personName || !email || !hunterVerificationAccepted(result.result)) {
    return [];
  }

  const fetchedAt = new Date().toISOString();
  const role = metadata.role ?? null;
  return [
    providerFact(
      personPath(role),
      [
        {
          name: metadata.personName,
          role,
          sourceUrl: metadata.sourceUrl ?? null,
          email,
        },
      ],
      result,
      {
        citationUrl: stableenrichCitationUrl(result.endpointUrl, email),
        citationTitle: `Hunter email verification for ${email}`,
        fetchedAt,
        rawText: JSON.stringify(result.result),
        confidence: hunterVerificationConfidence(result.result),
      },
    ),
  ];
}

function personFactCandidates(person: PersonRecord, result: StableenrichProbeResult): ProviderFactCandidate[] {
  const name = person.name ?? fullName(person.firstName, person.lastName);
  if (!name) {
    return [];
  }

  const role = normalizedPersonRole(person.role);
  const email = emailValue(person.email);
  const fetchedAt = new Date().toISOString();
  const candidateSourceUrl = person.linkedinUrl ?? person.sourceUrl;
  const sourceUrl = candidateSourceUrl && supportedUrl(candidateSourceUrl) ? candidateSourceUrl : null;

  return [
    providerFact(
      personPath(role),
      [
        {
          name,
          role,
          sourceUrl,
          ...(email ? { email } : {}),
        },
      ],
      result,
      {
        citationUrl: peopleCitationUrl(result, person, email),
        citationTitle: `${result.name === "apollo_people_enrich" ? "Apollo people enrichment" : "Apollo people search"} for ${name}`,
        fetchedAt,
        rawText: JSON.stringify(result.result),
        confidence: email ? emailConfidence(person.emailStatus) : "medium",
      },
    ),
  ];
}

function extractPeopleRecords(payload: unknown): PersonRecord[] {
  const root = objectRecord(payload);
  if (!root) {
    return [];
  }

  const people = Array.isArray(root.people) ? root.people : Array.isArray(root.contacts) ? root.contacts : root.person ? [root.person] : [];
  return people
    .map((item): PersonRecord | null => {
      const record = objectRecord(item);
      if (!record) {
        return null;
      }

      const id = stringValue(record.id);
      const name = stringValue(record.name);
      const firstName = stringValue(record.first_name) ?? stringValue(record.firstName);
      const lastName = stringValue(record.last_name) ?? stringValue(record.lastName);
      const role = stringValue(record.title) ?? stringValue(record.role) ?? stringValue(record.headline);
      const email = stringValue(record.email);
      const emailStatus = stringValue(record.email_status) ?? stringValue(record.emailStatus);
      const linkedinUrl = stringValue(record.linkedin_url) ?? stringValue(record.linkedinUrl);

      return {
        ...(id ? { id } : {}),
        ...(name ? { name } : {}),
        ...(firstName ? { firstName } : {}),
        ...(lastName ? { lastName } : {}),
        ...(role ? { role } : {}),
        ...(email ? { email } : {}),
        ...(emailStatus ? { emailStatus } : {}),
        ...(linkedinUrl ? { linkedinUrl } : {}),
      };
    })
    .filter((person): person is PersonRecord => person !== null);
}

function peopleHintsFromSearchResults(
  results: PromiseSettledResult<StableenrichProbeResult>[],
  domain: string,
): PersonRecord[] {
  return results.flatMap((result) => {
    if (result.status !== "fulfilled" || !isExaSearchProbe(result.value.name)) {
      return [];
    }

    return extractUrlRecords(result.value.result).flatMap((record) => {
      const person = personHintFromSearchRecord(record, domain);
      return person ? [person] : [];
    });
  });
}

function peopleHintsFromProviderSources(sources: ProviderSource[], domain: string): PersonRecord[] {
  return sources.flatMap((source) => {
    const parsed = objectRecord(parseJsonOrNull(source.rawText));
    const record = {
      ...(parsed ?? {}),
      title: stringValue(parsed?.title) ?? source.title,
      url: stringValue(parsed?.url) ?? source.url,
      text: stringValue(parsed?.text) ?? stringValue(parsed?.summary) ?? source.rawText,
    };
    const person = personHintFromSearchRecord(record, domain);
    return person ? [person] : [];
  });
}

function personHintFromSearchRecord(record: Record<string, unknown>, domain: string): PersonRecord | null {
  const title = stringRecordValue(record, "title") ?? stringRecordValue(record, "name");
  if (!title) {
    return null;
  }

  const url = stringRecordValue(record, "url");
  const text = stringRecordValue(record, "text") ?? stringRecordValue(record, "summary") ?? "";
  const lowerTitle = title.toLowerCase();
  if (lowerTitle.includes("email format")) {
    return null;
  }

  const roleishTitle = /\b(co-?founder|founder|ceo|chief executive|leadership|management)\b/i.test(title);
  const looksCompanyRelevant =
    recordMentionsTargetCompany(`${title}\n${text}`, domain) &&
    (isLinkedInPersonUrl(url) || roleishTitle || /current|present|co-?founder|president|ceo/i.test(text));
  if (!looksCompanyRelevant) {
    return null;
  }

  const name = personNameFromSearchRecord(title, text);
  if (!name) {
    return null;
  }

  const [firstName, ...rest] = name.split(/\s+/);
  if (!firstName) {
    return null;
  }
  const lastName = rest.join(" ");
  const role = roleHintFromText(text, domain) ?? roleHintFromTitle(title);
  const sourceUrl = url && supportedUrl(url) ? url : undefined;
  return {
    name,
    firstName,
    ...(lastName ? { lastName } : {}),
    ...(role ? { role } : {}),
    ...(sourceUrl && isLinkedInPersonUrl(sourceUrl) ? { linkedinUrl: sourceUrl } : {}),
    ...(sourceUrl && !isLinkedInPersonUrl(sourceUrl) ? { sourceUrl } : {}),
  };
}

function peopleRecordsFromEmailHints(hints: StableenrichPeopleEmailHint[]): PersonRecord[] {
  return hints.flatMap((hint) => {
    const id = stringValue(hint.id);
    const name = stringValue(hint.name);
    const firstName = stringValue(hint.firstName) ?? name?.split(/\s+/)[0];
    const lastName = stringValue(hint.lastName) ?? name?.split(/\s+/).slice(1).join(" ");
    const role = stringValue(hint.role);
    const email = emailValue(hint.email);
    const sourceUrl = stringValue(hint.linkedinUrl) ?? stringValue(hint.sourceUrl);
    const supportedSourceUrl = sourceUrl && supportedUrl(sourceUrl) ? sourceUrl : null;

    if (!name && !firstName) {
      return [];
    }

    return [
      {
        ...(id ? { id } : {}),
        ...(name ? { name } : {}),
        ...(firstName ? { firstName } : {}),
        ...(lastName ? { lastName } : {}),
        ...(role ? { role } : {}),
        ...(email ? { email } : {}),
        ...(supportedSourceUrl && isLinkedInPersonUrl(supportedSourceUrl) ? { linkedinUrl: supportedSourceUrl } : {}),
        ...(supportedSourceUrl && !isLinkedInPersonUrl(supportedSourceUrl) ? { sourceUrl: supportedSourceUrl } : {}),
      },
    ];
  });
}

function personNameFromSearchRecord(title: string, text: string) {
  const titleName = title.split(/\s[-|]\s/)[0]?.trim();
  if (titleName && looksLikePersonName(titleName)) {
    return titleName;
  }

  const headingName = text.match(/^#\s+(.+)$/m)?.[1]?.trim();
  return headingName && looksLikePersonName(headingName) ? headingName : null;
}

function recordMentionsTargetCompany(value: string, domain: string) {
  const normalized = value.toLowerCase();
  return targetCompanyTerms(domain).some((term) => normalized.includes(term));
}

function targetCompanyTerms(domain: string) {
  const normalized = domain.toLowerCase();
  const bare = normalized.replace(/^www\./, "");
  const firstLabel = bare.split(".")[0] ?? bare;
  return Array.from(new Set([
    bare,
    bare.replace(/\./g, " "),
    ...(firstLabel.length >= 4 ? [firstLabel] : []),
  ].filter((term) => term.length >= 3)));
}

function looksLikePersonName(value: string) {
  const blocked = new Set([
    "about",
    "company",
    "technical",
    "founder",
    "co-founder",
    "ceo",
    "leadership",
    "team",
    "email",
    "format",
    "formats",
  ]);
  const parts = value.split(/\s+/).filter(Boolean);
  return (
    parts.length >= 2 &&
    parts.length <= 4 &&
    parts.every((part) => /^[A-Z][A-Za-z.'-]{1,}$/.test(part) && !blocked.has(part.toLowerCase()))
  );
}

function isLinkedInPersonUrl(value: string | undefined) {
  if (!value) {
    return false;
  }

  try {
    const parsed = new URL(value);
    return parsed.hostname.replace(/^www\./i, "").toLowerCase() === "linkedin.com" && parsed.pathname.startsWith("/in/");
  } catch {
    return false;
  }
}

function roleHintFromTitle(title: string) {
  const normalized = title.toLowerCase();
  if (normalized.includes("co-founder") || normalized.includes("cofounder")) {
    return "Co-Founder";
  }
  if (normalized.includes("founder")) {
    return "Founder";
  }
  if (normalized.includes("chief executive") || /\bceo\b/i.test(title)) {
    return "CEO";
  }
  return undefined;
}

function roleHintFromText(text: string, domain: string) {
  const companyTerms = targetCompanyTerms(domain)
    .map((term) => escapeRegExp(term).replace(/\s+/g, "[\\s-]+"))
    .join("|");
  if (!companyTerms) {
    return undefined;
  }

  const match = text.match(new RegExp(`(?:^|\\n)(?:#{1,4}\\s*)?(.{2,90}?)\\s+at\\s+\\[?(?:${companyTerms})\\]?`, "i"));
  const role = match?.[1]?.trim();
  return role && !looksLikePersonName(role) ? normalizedPersonRole(role) ?? role : undefined;
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function normalizedPersonRole(role: string | undefined) {
  const trimmed = role?.trim();
  if (!trimmed) {
    return null;
  }

  const normalized = trimmed.toLowerCase();
  const isCeo = normalized.includes("chief executive") || /\bceo\b/i.test(trimmed);
  if (normalized.includes("co-founder") || normalized.includes("cofounder")) {
    return isCeo ? "Co-Founder and CEO" : "Co-Founder";
  }
  if (normalized.includes("founder")) {
    return isCeo ? "Founder and CEO" : "Founder";
  }
  if (isCeo) {
    return "CEO";
  }
  return trimmed;
}

function roleScoreForPerson(role: string | undefined) {
  const normalized = role?.toLowerCase() ?? "";
  let score = 0;
  if (normalized.includes("founder") || normalized.includes("co-founder") || normalized.includes("cofounder")) {
    score += 8;
  }
  if (normalized.includes("chief") || normalized.includes("ceo")) {
    score += 6;
  }
  if (normalized.includes("president") || normalized.includes("owner") || normalized.includes("partner")) {
    score += 4;
  }
  if (normalized.includes("head") || normalized.includes("vp")) {
    score += 2;
  }
  return score;
}

function rankPeople(people: PersonRecord[]) {
  const byKey = new Map<string, PersonRecord>();
  for (const person of people) {
    const name = person.name ?? fullName(person.firstName, person.lastName);
    if (!name) {
      continue;
    }
    const key = `${name.toLowerCase()}:${person.linkedinUrl ?? person.sourceUrl ?? ""}`;
    const current = byKey.get(key);
    if (!current || roleScoreForPerson(person.role) > roleScoreForPerson(current.role) || (!current.email && person.email)) {
      byKey.set(key, { ...person, name });
    }
  }

  return Array.from(byKey.values()).sort((left, right) => roleScoreForPerson(right.role) - roleScoreForPerson(left.role));
}

function peopleEnrichBody(person: PersonRecord, domain: string) {
  if (person.id) {
    return { id: person.id, domain, reveal_personal_emails: false };
  }

  if (person.linkedinUrl) {
    return { linkedin_url: person.linkedinUrl, domain, reveal_personal_emails: false };
  }

  if (person.firstName || person.lastName) {
    return {
      ...(person.firstName ? { first_name: person.firstName } : {}),
      ...(person.lastName ? { last_name: person.lastName } : {}),
      domain,
      reveal_personal_emails: false,
    };
  }

  return { name: person.name, domain, reveal_personal_emails: false };
}

function personMetadata(person: PersonRecord): NonNullable<StableenrichProbeResult["metadata"]> {
  return {
    ...(person.name ? { personName: person.name } : {}),
    ...(person.role ? { role: person.role } : {}),
    ...(person.linkedinUrl || person.sourceUrl ? { sourceUrl: person.linkedinUrl ?? person.sourceUrl } : {}),
    ...(person.email ? { email: person.email } : {}),
  };
}

function emailCandidatesForPerson(person: PersonRecord, domain: string) {
  const first = cleanEmailPart(person.firstName ?? person.name?.split(/\s+/)[0]);
  const last = cleanEmailPart(person.lastName ?? person.name?.split(/\s+/).slice(1).join(""));
  if (!first) {
    return [];
  }
  const firstInitial = first.charAt(0);

  return Array.from(new Set([
    `${first}@${domain}`,
    ...(last ? [`${first}.${last}@${domain}`, `${first}${last}@${domain}`, `${firstInitial}${last}@${domain}`] : []),
  ])).slice(0, 3);
}

function cleanEmailPart(value: string | undefined) {
  const cleaned = value?.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");
  return cleaned && cleaned.length > 0 ? cleaned : null;
}

function personPath(role: string | null): ProviderFactCandidate["path"] {
  const normalized = role?.toLowerCase() ?? "";
  return normalized.includes("founder") || normalized.includes("co-founder") || normalized.includes("cofounder")
    ? "team.founders"
    : "team.keyExecs";
}

function peopleCitationUrl(result: StableenrichProbeResult, person: PersonRecord, email: string | null) {
  const sourceUrl = person.linkedinUrl ?? person.sourceUrl;
  if (sourceUrl && supportedUrl(sourceUrl)) {
    return sourceUrl;
  }

  const key = email ?? person.id ?? person.name ?? "person";
  return stableenrichCitationUrl(result.endpointUrl, key);
}

function hunterVerificationAccepted(payload: unknown) {
  const record = objectRecord(payload);
  const status = stringValue(record?.status)?.toLowerCase();
  const score = integerValue(record?.score);
  return status === "valid" || (status === "accept_all" && score !== null && score >= 70);
}

function hunterVerificationConfidence(payload: unknown): ProviderFactCandidate["confidence"] {
  const record = objectRecord(payload);
  const status = stringValue(record?.status)?.toLowerCase();
  const score = integerValue(record?.score);
  if (status === "valid" && score !== null && score >= 90) {
    return "high";
  }

  return "medium";
}

function emailConfidence(status: string | undefined): ProviderFactCandidate["confidence"] {
  const normalized = status?.toLowerCase() ?? "";
  if (normalized === "verified" || normalized === "valid") {
    return "high";
  }
  if (normalized === "guessed" || normalized === "unknown") {
    return "low";
  }
  return "medium";
}

function fullName(firstName: string | undefined, lastName: string | undefined) {
  return [firstName, lastName].filter(Boolean).join(" ").trim() || null;
}

function personNameKey(person: PersonRecord) {
  const name = person.name ?? fullName(person.firstName, person.lastName);
  return name ? name.toLowerCase().replace(/\s+/g, " ").trim() : null;
}

function signalFacts(result: StableenrichProbeResult): ProviderFactCandidate[] {
  const fetchedAt = new Date().toISOString();
  return extractUrlRecords(result.result).flatMap((record) => {
    const url = stringRecordValue(record, "url");
    if (!url || !supportedUrl(url)) {
      return [];
    }

    const title = stringRecordValue(record, "title") ?? stringRecordValue(record, "name");
    if (!title) {
      return [];
    }

    const text = stringRecordValue(record, "text") ?? stringRecordValue(record, "summary") ?? title;
    const publishedAt = stringRecordValue(record, "publishedDate") ?? stringRecordValue(record, "published_at");
    const sourceDomain = domainFromUrl(url) ?? "source";
    return [
      providerFact(
        "signals",
        {
          title: truncateText(title, 96),
          url,
          date: (publishedAt ?? fetchedAt).slice(0, 10),
          source: sourceDomain,
          category: signalCategory(`${title}\n${text}`),
          citationIds: [],
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

function signalCategory(value: string): "news" | "hiring" | "launch" | "funding" | "filing" | "github" | "other" {
  const normalized = value.toLowerCase();
  if (/\b(funding|raised|series|seed|valuation|investor|round)\b/.test(normalized)) {
    return "funding";
  }
  if (/\b(launch|launches|launched|released|introduces|unveils|announces|ships)\b/.test(normalized)) {
    return "launch";
  }
  if (/\b(hiring|jobs|careers|headcount|recruiting)\b/.test(normalized)) {
    return "hiring";
  }
  if (/\b(github|repository|repo|stars|commit)\b/.test(normalized)) {
    return "github";
  }
  if (/\b(sec|s-1|10-k|10-q|filing)\b/.test(normalized)) {
    return "filing";
  }
  return "news";
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

function parseJsonOrNull(value: string): unknown {
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return null;
  }
}

function emailValue(value: unknown): string | null {
  const candidate = stringValue(value);
  if (!candidate) {
    return null;
  }

  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(candidate) ? candidate : null;
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
