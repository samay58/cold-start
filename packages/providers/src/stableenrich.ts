import { agentcashJson } from "./agentcash";
import { providerBudgetForEndpoint } from "./provider-budget";
import { fetchSecFormD, isSecFormDResult, type SecFormDOfficer } from "./sec-edgar";
import {
  allSettledLimited,
  cleanEmailPart,
  domainFromUrl,
  emailValue,
  escapeRegExp,
  extractUrlRecords,
  integerValue,
  numberValue,
  objectRecord,
  parseJsonOrNull,
  stringRecordValue,
  stringValue,
  supportedUrl,
  truncateText,
  urlFromDomain,
  workEmailValue
} from "./stableenrich-utils";
import type {
  PeopleEmailHint,
  ProviderFactCandidate,
  ProviderResearchPlan,
  ProviderSource,
  RetrievalIntent,
  StableenrichEnv,
  StableenrichProbe
} from "./types";

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
type AgentcashFetch = (input: { url: string; body: Record<string, unknown>; timeoutMs?: number }) => Promise<unknown>;

type StableenrichProbeResult = {
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
    durationMs?: number;
    error?: string;
  }>;
  emailDiscovery?: StableenrichEmailDiscovery[];
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
        person_seniorities: APOLLO_LEADER_SENIORITIES,
        person_titles: APOLLO_LEADER_TITLES,
        per_page: 25,
        page: 1,
      },
    },
  ];
}

const APOLLO_LEADER_SENIORITIES = ["founder", "c_suite", "owner", "partner", "head", "vp", "director"];
const APOLLO_LEADER_TITLES = [
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
  peopleHints?: PeopleEmailHint[];
  agentcashFetch?: AgentcashFetch;
  companyName?: string;
}): Promise<StableenrichSourcesResult> {
  requireStableenrichConfig(input.env);
  const agentcashFetch = input.agentcashFetch ?? ((request) => agentcashJson<unknown>(request));
  const [discovery, secFormD, exaEmails] = await Promise.all([
    runApolloPeopleDiscovery({ env: input.env, domain: input.domain, agentcashFetch }),
    runSecEdgarDiscovery({ domain: input.domain, ...(input.companyName ? { companyName: input.companyName } : {}) }),
    runExaEmailDiscovery({
      env: input.env,
      domain: input.domain,
      agentcashFetch,
      ...(input.companyName ? { companyName: input.companyName } : {}),
    }),
  ]);
  const hintedPeople = rankPeople(peopleRecordsFromEmailHints(input.peopleHints ?? []));
  const discoveredPeople = [
    ...peopleHintsFromProviderSources(input.sourceHints, input.domain),
    ...discovery.people,
    ...secFormD.people,
    ...exaEmails.people,
  ];
  const leaders = (hintedPeople.length > 0 ? hintedPeople : rankPeople(discoveredPeople)).slice(0, MAX_LEADERS_FOR_ENRICHMENT);
  const followups = await runPeopleFollowupRequests({
    env: input.env,
    domain: input.domain,
    leaders,
    agentcashFetch,
  });
  const collected = collectStableenrichSources([...discovery.results, ...followups, ...exaEmails.results]);
  const extraSources = [...secFormD.sources];
  const extraFacts = [...secFormD.facts];
  return {
    ...collected,
    sources: [...collected.sources, ...extraSources],
    facts: [...collected.facts, ...extraFacts],
    emailDiscovery: summarizeEmailDiscovery(leaders, [...discovery.results, ...followups, ...exaEmails.results], {
      secOfficers: secFormD.officers,
      exaPeople: exaEmails.people,
    }),
  };
}

const EXA_EMAIL_GENERIC_LOCAL_PARTS = new Set([
  "info", "support", "hello", "contact", "sales", "press", "media", "team",
  "help", "admin", "noreply", "no-reply", "donotreply", "do-not-reply",
  "marketing", "legal", "privacy", "security", "abuse", "postmaster",
  "billing", "accounts", "careers", "jobs", "hr", "people", "ops",
  "founders", "investors", "ir", "feedback", "news",
  "jane", "john", "example", "test", "demo", "sample", "your-name", "yourname",
  "firstname", "first", "lastname", "last", "name", "user", "username",
]);

async function runExaEmailDiscovery(input: {
  env: StableenrichEnv;
  domain: string;
  companyName?: string;
  agentcashFetch: AgentcashFetch;
}): Promise<{
  people: PersonRecord[];
  results: PromiseSettledResult<StableenrichProbeResult>[];
}> {
  const exaUrl = stableenrichEndpointUrl(input.env, "STABLEENRICH_EXA_SEARCH_URL");
  const companyTerm = input.companyName?.trim() || input.domain.split(".")[0] || input.domain;

  const probes: Array<{ name: "exa_email_search" | "exa_leader_discovery"; query: string }> = [
    {
      name: "exa_email_search",
      query: `"@${input.domain}" founder OR CEO OR CTO OR CFO OR cofounder OR contact email`,
    },
    {
      name: "exa_leader_discovery",
      query: `"${companyTerm}" "${input.domain}" founder OR CEO OR CTO OR cofounder OR "led by" OR "co-founded"`,
    },
  ];

  const settled = await Promise.all(
    probes.map(async ({ name, query }): Promise<PromiseSettledResult<StableenrichProbeResult>> => {
      const startedAt = Date.now();
      try {
        const result = await input.agentcashFetch({
          url: exaUrl,
          body: {
            query,
            numResults: 8,
            contents: {
              text: true,
              highlights: { highlightsPerUrl: 3, numSentences: 3 },
            },
          },
          timeoutMs: stableenrichProbeTimeoutMs(name),
        });
        return {
          status: "fulfilled",
          value: {
            name,
            endpointUrl: exaUrl,
            result,
            durationMs: Date.now() - startedAt,
            metadata: { domain: input.domain },
          },
        };
      } catch (error) {
        return {
          status: "rejected",
          reason: {
            name,
            endpointUrl: exaUrl,
            error: error instanceof Error ? error.message : String(error),
          } satisfies StableenrichProbeFailure,
        };
      }
    }),
  );

  const fulfilled = settled.flatMap((entry) => (entry.status === "fulfilled" ? [entry.value] : []));
  const peopleFromEmails = fulfilled
    .filter((probe) => probe.name === "exa_email_search")
    .flatMap((probe) => extractPeopleFromExaEmailResults(probe.result, input.domain));
  const peopleFromLeaders = fulfilled
    .filter((probe) => probe.name === "exa_leader_discovery")
    .flatMap((probe) => extractLeadersFromExaResults(probe.result, input.domain));

  return { people: [...peopleFromEmails, ...peopleFromLeaders], results: settled };
}

function extractLeadersFromExaResults(payload: unknown, _domain: string): PersonRecord[] {
  const records = extractUrlRecords(payload);
  const out = new Map<string, PersonRecord>();

  for (const record of records) {
    const url = stringRecordValue(record, "url") ?? "";
    const text = [stringRecordValue(record, "title") ?? "", stringRecordValue(record, "text") ?? "", stringRecordValue(record, "summary") ?? "", Array.isArray(record.highlights) ? record.highlights.filter((h): h is string => typeof h === "string").join("\n") : ""].join("\n");
    if (!text) continue;

    const candidates = leadershipNameCandidates(text);
    for (const { name, role } of candidates) {
      const key = name.toLowerCase();
      if (out.has(key)) continue;
      const [firstName, ...rest] = name.split(/\s+/).filter(Boolean);
      if (!firstName) continue;
      out.set(key, {
        name,
        firstName,
        ...(rest.length > 0 ? { lastName: rest.join(" ") } : {}),
        ...(role ? { role } : {}),
        ...(url && supportedUrl(url) ? { sourceUrl: url } : {}),
      });
    }
  }

  // Don't return excessive candidates. Limit to top 6 to keep Hunter spend bounded.
  return Array.from(out.values()).slice(0, 6);
}

function leadershipNameCandidates(rawText: string): Array<{ name: string; role: string | null }> {
  const text = rawText.replace(/\s+/g, " ");
  const out: Array<{ name: string; role: string | null }> = [];
  // Pattern A: "Chris Hladczuk, Co-Founder and CEO". Name followed by comma-title.
  const namedAfterPattern = /\b([A-Z][a-zA-Z'’]+(?:\s+[A-Z][a-zA-Z'’]+){1,2}),\s+((?:Co-?Founder|Founder|CEO|CTO|CFO|COO|CPO|CRO|CMO|President|Chief [A-Z][a-z]+ Officer|Managing Partner|General Partner|Head of [A-Z][a-z]+)(?:\s+(?:and|&)\s+[A-Z][A-Za-z]+(?:\s+[A-Z][a-z]+)?)?)/g;
  let match: RegExpExecArray | null;
  while ((match = namedAfterPattern.exec(text)) !== null) {
    const name = (match[1] ?? "").trim();
    const role = (match[2] ?? "").trim();
    if (!isLikelyPersonName(name)) continue;
    out.push({ name, role });
  }
  // Pattern B: "CEO Chris Hladczuk" or "Co-Founder Nick Puljic". Title then name.
  const titleBeforePattern = /(Co-?Founder|Founder|CEO|CTO|CFO|COO|CPO|CRO|CMO|President|Chief [A-Z][a-z]+ Officer|Managing Partner|General Partner)\s+([A-Z][a-zA-Z'’]+(?:\s+[A-Z][a-zA-Z'’]+){1,2})/g;
  while ((match = titleBeforePattern.exec(text)) !== null) {
    const role = (match[1] ?? "").trim();
    const name = (match[2] ?? "").trim();
    if (!isLikelyPersonName(name)) continue;
    out.push({ name, role });
  }
  return dedupeByName(out);
}

const PLACE_OR_BRAND_TOKENS = new Set([
  "united", "states", "america", "kingdom", "york", "francisco", "angeles", "london",
  "europe", "asia", "africa", "australia", "canada", "mexico", "germany", "france",
  "lodge", "ventures", "partners", "capital", "fund", "funds", "company", "park",
  "email", "format", "profile", "group", "holdings", "series", "round", "team",
  "investors", "venture", "valuation",
]);

function isLikelyPersonName(name: string): boolean {
  if (/[\n\r\t]/.test(name)) return false;
  if (!/^[A-Z][a-z]/.test(name)) return false;
  const words = name.split(/\s+/).filter(Boolean);
  if (words.length < 2 || words.length > 3) return false;
  for (const word of words) {
    if (!/^[A-Z][a-zA-Z'’]+$/.test(word)) return false;
    if (PLACE_OR_BRAND_TOKENS.has(word.toLowerCase())) return false;
  }
  if (/\b(Inc|LLC|Corp|Ltd)\b/.test(name)) return false;
  return true;
}

function dedupeByName<T extends { name: string }>(entries: T[]): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const entry of entries) {
    const key = entry.name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(entry);
  }
  return out;
}

function extractPeopleFromExaEmailResults(payload: unknown, domain: string): PersonRecord[] {
  const records = extractUrlRecords(payload);
  const emailDomain = domain.replace(/^www\./i, "").toLowerCase();
  const emailRegex = new RegExp(`([A-Za-z0-9._+\\-]+)@${emailDomain.replace(/[.\\\\]/g, "\\$&")}`, "gi");
  const found = new Map<string, PersonRecord>();

  for (const record of records) {
    const url = stringRecordValue(record, "url") ?? "";
    const title = stringRecordValue(record, "title") ?? "";
    const text = stringRecordValue(record, "text") ?? stringRecordValue(record, "summary") ?? "";
    const highlights = Array.isArray(record.highlights) ? record.highlights.filter((h): h is string => typeof h === "string").join("\n") : "";
    const haystack = [title, text, highlights].join("\n");
    if (!haystack) continue;

    emailRegex.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = emailRegex.exec(haystack)) !== null) {
      const local = (match[1] ?? "").toLowerCase();
      if (!local || EXA_EMAIL_GENERIC_LOCAL_PARTS.has(local)) continue;
      const email = `${local}@${emailDomain}`;
      if (found.has(email)) continue;

      const person = personFromEmailMention({
        local,
        email,
        snippet: haystack,
        title,
        sourceUrl: url,
      });
      if (person) {
        found.set(email, person);
      }
    }
  }

  return Array.from(found.values());
}

function personFromEmailMention(input: {
  local: string;
  email: string;
  snippet: string;
  title: string;
  sourceUrl: string;
}): PersonRecord | null {
  const fromLocal = nameGuessFromLocalPart(input.local);
  const fromSnippet = nameGuessFromSnippet(input.snippet, input.local) ?? nameGuessFromSnippet(input.title, input.local);
  const best = fromSnippet ?? fromLocal;
  if (!best) {
    return null;
  }
  const [firstName, ...rest] = best.split(/\s+/).filter(Boolean);
  if (!firstName) return null;
  const lastName = rest.join(" ").trim();
  return {
    name: best,
    firstName,
    ...(lastName ? { lastName } : {}),
    email: input.email,
    emailStatus: "verified",
    ...(input.sourceUrl && supportedUrl(input.sourceUrl) ? { sourceUrl: input.sourceUrl } : {}),
  };
}

function nameGuessFromLocalPart(local: string): string | null {
  if (local.includes(".")) {
    const parts = local.split(".").filter(Boolean);
    if (parts.length >= 2) {
      return parts.map(titleCase).join(" ");
    }
  }
  if (/^[a-z]+$/.test(local) && local.length >= 3) {
    return titleCase(local);
  }
  return null;
}

function nameGuessFromSnippet(text: string, local: string): string | null {
  const namePattern = /\b([A-Z][a-z'’]+(?:\s+[A-Z][a-z'’]+){1,2})\b/g;
  const candidates: string[] = [];
  let match: RegExpExecArray | null;
  while ((match = namePattern.exec(text)) !== null) {
    const candidate = match[1]?.trim();
    if (!candidate) continue;
    if (!isLikelyPersonName(candidate)) continue;
    candidates.push(candidate);
  }
  if (candidates.length === 0) return null;

  const localFirst = local.split(".")[0]?.toLowerCase();
  const matched = candidates.find((candidate) => {
    const firstWord = candidate.split(/\s+/)[0]?.toLowerCase() ?? "";
    return localFirst && firstWord.startsWith(localFirst.slice(0, Math.min(localFirst.length, 4)));
  });
  return matched ?? null;
}

function titleCase(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1).toLowerCase();
}

async function runSecEdgarDiscovery(input: {
  domain: string;
  companyName?: string;
}): Promise<{
  people: PersonRecord[];
  officers: SecFormDOfficer[];
  sources: ProviderSource[];
  facts: ProviderFactCandidate[];
}> {
  if (process.env.SEC_EDGAR_DISABLED === "true") {
    return { people: [], officers: [], sources: [], facts: [] };
  }
  try {
    const result = await fetchSecFormD({ domain: input.domain, ...(input.companyName ? { companyName: input.companyName } : {}) });
    if (!isSecFormDResult(result)) {
      return { people: [], officers: [], sources: [], facts: [] };
    }
    const people = result.officers.map((officer): PersonRecord => ({
      name: officer.fullName,
      firstName: officer.firstName,
      lastName: officer.lastName,
      ...(officer.titleHint ? { role: officer.titleHint } : officer.relationships.length > 0 ? { role: officer.relationships[0] ?? "Officer" } : {}),
      sourceUrl: result.formUrl,
    }));
    const fetchedAt = new Date().toISOString();
    const citationTitle = `SEC Form D filing ${result.accessionNumber}`;
    const sources: ProviderSource[] = [
      providerSourceFromText({
        url: result.formUrl,
        title: citationTitle,
        sourceType: "filing",
        intent: "management_team",
        rawText: JSON.stringify({ cik: result.cik, filedAt: result.filedAt, officers: result.officers }),
        ...(result.filedAt ? { publishedAt: result.filedAt } : {}),
      }),
    ];
    const facts: ProviderFactCandidate[] = result.officers.map((officer) => {
      const role = officer.titleHint ?? officer.relationships[0] ?? "Officer";
      const path = personPath(role);
      return {
        path,
        value: [
          {
            name: officer.fullName,
            role,
            sourceUrl: result.formUrl,
          },
        ],
        status: "verified",
        confidence: "high",
        sourceType: "filing",
        provider: "sec_edgar",
        endpoint: result.formUrl,
        citationUrl: result.formUrl,
        citationTitle,
        fetchedAt,
        rawText: JSON.stringify({ cik: result.cik, officer }),
      } satisfies ProviderFactCandidate;
    });
    return { people, officers: result.officers, sources, facts };
  } catch {
    return { people: [], officers: [], sources: [], facts: [] };
  }
}

const MAX_LEADERS_FOR_ENRICHMENT = 8;
const MAX_FALLBACK_LEADERS = 6;
const MAX_HUNTER_CANDIDATES = 36;

async function runApolloPeopleDiscovery(input: {
  env: StableenrichEnv;
  domain: string;
  agentcashFetch: AgentcashFetch;
}): Promise<{ people: PersonRecord[]; results: PromiseSettledResult<StableenrichProbeResult>[] }> {
  const results: PromiseSettledResult<StableenrichProbeResult>[] = [];
  const orgSearchUrl = stableenrichEndpointUrl(input.env, "STABLEENRICH_APOLLO_ORG_SEARCH_URL");
  let organizationId: string | null = null;

  try {
    const startedAt = Date.now();
    const result = await input.agentcashFetch({
      url: orgSearchUrl,
      body: {
        q_keywords: input.domain,
        per_page: 5,
        page: 1,
      },
      timeoutMs: stableenrichProbeTimeoutMs("apollo_org_search"),
    });
    results.push({
      status: "fulfilled",
      value: {
        name: "apollo_org_search",
        endpointUrl: orgSearchUrl,
        result,
        durationMs: Date.now() - startedAt,
        metadata: { domain: input.domain },
      },
    });
    organizationId = apolloOrganizationIdForDomain(result, input.domain);
  } catch (error) {
    results.push({
      status: "rejected",
      reason: {
        name: "apollo_org_search",
        endpointUrl: orgSearchUrl,
        error: error instanceof Error ? error.message : String(error),
      } satisfies StableenrichProbeFailure,
    });
  }

  const peopleSearchUrl = stableenrichEndpointUrl(input.env, "STABLEENRICH_APOLLO_PEOPLE_SEARCH_URL");
  try {
    const startedAt = Date.now();
    const result = await input.agentcashFetch({
      url: peopleSearchUrl,
      body: {
        ...(organizationId ? { organization_ids: [organizationId] } : { q_organization_domains: [input.domain] }),
        person_seniorities: APOLLO_LEADER_SENIORITIES,
        person_titles: APOLLO_LEADER_TITLES,
        per_page: 25,
        page: 1,
      },
      timeoutMs: stableenrichProbeTimeoutMs("apollo_people_search"),
    });
    const value: StableenrichProbeResult = {
      name: "apollo_people_search",
      endpointUrl: peopleSearchUrl,
      result,
      durationMs: Date.now() - startedAt,
      metadata: { domain: input.domain },
    };
    results.push({ status: "fulfilled", value });
    return { people: extractPeopleRecords(result), results };
  } catch (error) {
    results.push({
      status: "rejected",
      reason: {
        name: "apollo_people_search",
        endpointUrl: peopleSearchUrl,
        error: error instanceof Error ? error.message : String(error),
      } satisfies StableenrichProbeFailure,
    });
  }

  return { people: [], results };
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
        ...(result.value.durationMs !== undefined ? { durationMs: result.value.durationMs } : {}),
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
  ]).slice(0, MAX_LEADERS_FOR_ENRICHMENT);

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
        const startedAt = Date.now();
        return {
          name: "apollo_people_enrich" as const,
          endpointUrl: peopleEnrichUrl,
          result: await input.agentcashFetch({
            url: peopleEnrichUrl,
            body: peopleEnrichBody(person, input.domain),
            timeoutMs: stableenrichProbeTimeoutMs("apollo_people_enrich")
          }),
          durationMs: Date.now() - startedAt,
          metadata: { ...personMetadata(person), domain: input.domain },
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
  const fallbackLeaders = rankPeople([...leaders, ...enrichedPeople]).filter((person) => !workEmailValue(person.email, input.domain)).slice(0, MAX_FALLBACK_LEADERS);
  const minervaSettled = await runMinervaEmailFallbackRequests({
    env: input.env,
    domain: input.domain,
    leaders: fallbackLeaders,
    agentcashFetch: input.agentcashFetch,
  });
  const minervaPeople = minervaSettled.flatMap((result) =>
    result.status === "fulfilled" ? extractPeopleRecords(result.value.result) : []
  );
  const cladoSettled = await runCladoEmailFallbackRequests({
    env: input.env,
    domain: input.domain,
    leaders: rankPeople([...fallbackLeaders, ...minervaPeople]).filter((person) => !workEmailValue(person.email, input.domain)).slice(0, MAX_FALLBACK_LEADERS),
    agentcashFetch: input.agentcashFetch,
  });
  const cladoPeople = cladoSettled.flatMap((result) =>
    result.status === "fulfilled" ? extractPeopleRecords(result.value.result) : []
  );
  const peopleWithEmailNames = new Set(
    [...enrichedPeople, ...minervaPeople, ...cladoPeople]
      .filter((person) => workEmailValue(person.email, input.domain))
      .map((person) => personNameKey(person))
      .filter((key): key is string => key !== null)
  );
  const peopleForVerification = rankPeople([...leaders, ...enrichedPeople, ...minervaPeople, ...cladoPeople])
    .filter((person) => !workEmailValue(person.email, input.domain))
    .filter((person) => {
      const key = personNameKey(person);
      return !key || !peopleWithEmailNames.has(key);
    });
  const candidates = peopleForVerification
    .flatMap((person) => emailCandidatesForPerson(person, input.domain).map((email) => ({ person, email })))
    .slice(0, MAX_HUNTER_CANDIDATES);

  if (candidates.length === 0) {
    return [...enrichSettled, ...minervaSettled, ...cladoSettled];
  }

  const hunterUrl = stableenrichEndpointUrl(input.env, "STABLEENRICH_HUNTER_EMAIL_VERIFIER_URL");
  const hunterSettled = await allSettledLimited(
    candidates,
    async ({ person, email }) => {
      try {
        const startedAt = Date.now();
        return {
          name: "hunter_email_verifier" as const,
          endpointUrl: hunterUrl,
          result: await input.agentcashFetch({
            url: hunterUrl,
            body: { email },
            timeoutMs: stableenrichProbeTimeoutMs("hunter_email_verifier")
          }),
          durationMs: Date.now() - startedAt,
          metadata: {
            ...personMetadata(person),
            domain: input.domain,
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

  return [...enrichSettled, ...minervaSettled, ...cladoSettled, ...hunterSettled];
}

async function runMinervaEmailFallbackRequests(input: {
  env: StableenrichEnv;
  domain: string;
  leaders: PersonRecord[];
  agentcashFetch: AgentcashFetch;
}): Promise<PromiseSettledResult<StableenrichProbeResult>[]> {
  const leaders = input.leaders.filter((person) => person.linkedinUrl || person.name || person.firstName);
  if (leaders.length === 0) {
    return [];
  }

  const minervaUrl = stableenrichEndpointUrl(input.env, "STABLEENRICH_MINERVA_ENRICH_URL");
  return allSettledLimited(leaders, async (person) => {
    try {
      const startedAt = Date.now();
      return {
        name: "minerva_enrich" as const,
        endpointUrl: minervaUrl,
        result: await input.agentcashFetch({
          url: minervaUrl,
          body: {
            records: [minervaRecordForPerson(person)],
            match_condition_fields: ["professional_email"],
            return_fields: ["full_name", "linkedin_url", "linkedin_title", "professional_emails"],
          },
          timeoutMs: stableenrichProbeTimeoutMs("minerva_enrich"),
        }),
        durationMs: Date.now() - startedAt,
        metadata: { ...personMetadata(person), domain: input.domain },
      };
    } catch (error) {
      throw {
        name: "minerva_enrich" as const,
        endpointUrl: minervaUrl,
        error: error instanceof Error ? error.message : String(error),
      } satisfies StableenrichProbeFailure;
    }
  });
}

async function runCladoEmailFallbackRequests(input: {
  env: StableenrichEnv;
  domain: string;
  leaders: PersonRecord[];
  agentcashFetch: AgentcashFetch;
}): Promise<PromiseSettledResult<StableenrichProbeResult>[]> {
  const leaders = input.leaders.filter((person) => person.linkedinUrl);
  if (leaders.length === 0) {
    return [];
  }

  const cladoUrl = stableenrichEndpointUrl(input.env, "STABLEENRICH_CLADO_CONTACTS_ENRICH_URL");
  return allSettledLimited(leaders, async (person) => {
    try {
      const startedAt = Date.now();
      return {
        name: "clado_contacts_enrich" as const,
        endpointUrl: cladoUrl,
        result: await input.agentcashFetch({
          url: cladoUrl,
          body: {
            linkedin_url: person.linkedinUrl,
            email_enrichment: true,
          },
          timeoutMs: stableenrichProbeTimeoutMs("clado_contacts_enrich"),
        }),
        durationMs: Date.now() - startedAt,
        metadata: { ...personMetadata(person), domain: input.domain },
      };
    } catch (error) {
      throw {
        name: "clado_contacts_enrich" as const,
        endpointUrl: cladoUrl,
        error: error instanceof Error ? error.message : String(error),
      } satisfies StableenrichProbeFailure;
    }
  });
}

function stableenrichProbeTimeoutMs(name: StableenrichProbe["name"]) {
  const configured = Number.parseInt(process.env.STABLEENRICH_AGENTCASH_TIMEOUT_MS ?? "", 10);
  if (Number.isFinite(configured) && configured > 0) {
    return configured;
  }

  return providerBudgetForEndpoint("stableenrich", name).timeoutMs;
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
    result.name === "clado_contacts_enrich" ||
    result.name === "minerva_enrich" ||
    result.name === "hunter_email_verifier"
  ) {
    return peopleFacts(result);
  }

  if (result.name === "exa_email_search") {
    return exaEmailFacts(result);
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
    name === "exa_find_similar" ||
    name === "exa_email_search" ||
    name === "exa_leader_discovery"
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
    case "apollo_org_search":
    case "org_enrichment":
      return "firmographics";
    case "apollo_people_search":
    case "apollo_people_enrich":
    case "clado_contacts_enrich":
    case "minerva_enrich":
      return "management_team";
    case "hunter_email_verifier":
      return "email_verification";
    case "exa_email_search":
    case "exa_leader_discovery":
      return "management_team";
    default:
      return "company_profile";
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

function peopleFacts(result: StableenrichProbeResult): ProviderFactCandidate[] {
  if (result.name === "hunter_email_verifier") {
    return hunterEmailFact(result);
  }

  return extractPeopleRecords(result.result)
    .filter((person) => personMatchesProbeMetadata(person, result.metadata))
    .map((person) => withPersonMetadata(person, result.metadata))
    .filter((person) => isUsablePersonRecord(person))
    .flatMap((person) => personFactCandidates(person, result));
}

function exaEmailFacts(result: StableenrichProbeResult): ProviderFactCandidate[] {
  const domain = result.metadata?.domain;
  if (!domain) return [];
  const people = extractPeopleFromExaEmailResults(result.result, domain);
  if (people.length === 0) return [];
  const fetchedAt = new Date().toISOString();
  return people.flatMap((person) => {
    const name = person.name ?? fullName(person.firstName, person.lastName);
    const email = person.email;
    if (!name || !email) return [];
    const role = person.role ?? null;
    const path = personPath(role);
    const sourceUrl = person.sourceUrl ?? result.endpointUrl;
    return [
      {
        path,
        value: [
          {
            name,
            role,
            sourceUrl: person.sourceUrl ?? null,
            email,
          },
        ],
        status: "verified" as const,
        confidence: "high" as const,
        sourceType: "news" as const,
        provider: "stableenrich" as const,
        endpoint: result.endpointUrl,
        citationUrl: sourceUrl,
        citationTitle: `Exa email discovery: ${email}`,
        fetchedAt,
        rawText: JSON.stringify({ person, source: result.endpointUrl }),
      } satisfies ProviderFactCandidate,
    ];
  });
}

function hunterEmailFact(result: StableenrichProbeResult): ProviderFactCandidate[] {
  const metadata = result.metadata;
  const email = workEmailValue(metadata?.email, metadata?.domain) ?? workEmailValue(stringRecordValue(objectRecord(result.result) ?? {}, "email"), metadata?.domain);
  if (!metadata?.personName || !email || !isUsablePersonName(metadata.personName) || !isPersonEmailCandidate(email, metadata.domain) || !hunterVerificationAccepted(result.result)) {
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
  const email = workEmailValue(person.email, result.metadata?.domain);
  if (result.metadata?.personName && !email) {
    return [];
  }

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

function withPersonMetadata(person: PersonRecord, metadata: StableenrichProbeResult["metadata"]): PersonRecord {
  return {
    ...person,
    ...(person.name || !metadata?.personName ? {} : { name: metadata.personName }),
    ...(person.role || !metadata?.role ? {} : { role: metadata.role }),
    ...(person.linkedinUrl || person.sourceUrl || !metadata?.sourceUrl ? {} : { sourceUrl: metadata.sourceUrl }),
  };
}

function personMatchesProbeMetadata(person: PersonRecord, metadata: StableenrichProbeResult["metadata"]) {
  if (metadata?.personName && !isUsablePersonName(metadata.personName)) {
    return false;
  }

  if (!metadata?.personName) {
    return true;
  }

  const name = person.name ?? fullName(person.firstName, person.lastName);
  if (!name) {
    return true;
  }
  if (!isUsablePersonName(name)) {
    return false;
  }

  return samePersonName(name, metadata.personName);
}

function samePersonName(left: string, right: string) {
  const leftNormalized = normalizePersonName(left);
  const rightNormalized = normalizePersonName(right);
  if (!leftNormalized || !rightNormalized) {
    return false;
  }
  if (leftNormalized === rightNormalized) {
    return true;
  }

  const leftTokens = new Set(leftNormalized.split(" ").filter((token) => token.length > 1));
  const rightTokens = rightNormalized.split(" ").filter((token) => token.length > 1);
  return rightTokens.length >= 2 && rightTokens.every((token) => leftTokens.has(token));
}

function normalizePersonName(value: string) {
  return value.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function extractPeopleRecords(payload: unknown): PersonRecord[] {
  const root = objectRecord(payload);
  if (!root) {
    return [];
  }

  if (Array.isArray(root.results)) {
    return root.results
      .map((item) => minervaPersonRecord(item))
      .filter((person): person is PersonRecord => person !== null);
  }

  if (Array.isArray(root.data)) {
    return root.data
      .map((item) => cladoPersonRecord(item))
      .filter((person): person is PersonRecord => person !== null);
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

function minervaPersonRecord(value: unknown): PersonRecord | null {
  const record = objectRecord(value);
  if (!record) {
    return null;
  }
  if (record.is_match === false) {
    return null;
  }

  const professionalEmails = Array.isArray(record.professional_emails) ? record.professional_emails : [];
  const email = professionalEmails
    .flatMap((item) => {
      const emailRecord = objectRecord(item);
      return emailRecord ? [stringRecordValue(emailRecord, "email_address")] : [];
    })
    .find((candidate) => emailValue(candidate));
  const name = stringValue(record.full_name);
  const firstName = stringValue(record.first_name);
  const lastName = stringValue(record.last_name);
  const linkedinUrl = stringValue(record.linkedin_url);
  const role = stringValue(record.linkedin_title);
  if (!name && !firstName && !email) {
    return null;
  }

  return {
    ...(name ? { name } : {}),
    ...(firstName ? { firstName } : {}),
    ...(lastName ? { lastName } : {}),
    ...(role ? { role } : {}),
    ...(linkedinUrl ? { linkedinUrl } : {}),
    ...(email ? { email, emailStatus: "verified" } : {}),
  };
}

function cladoPersonRecord(value: unknown): PersonRecord | null {
  const record = objectRecord(value);
  if (!record) {
    return null;
  }
  const contacts = Array.isArray(record.contacts) ? record.contacts : [];
  const emailContact = contacts
    .map((item) => objectRecord(item))
    .filter((contact): contact is Record<string, unknown> => contact !== null)
    .find((contact) => contact.type === "email" && emailValue(contact.value) && numberValue(contact.rating) >= 70);
  const email = emailValue(emailContact?.value);
  if (!email) {
    return null;
  }

  return {
    email,
    emailStatus: numberValue(emailContact?.rating) >= 85 ? "verified" : "accept_all",
  };
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

function peopleRecordsFromEmailHints(hints: PeopleEmailHint[]): PersonRecord[] {
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

function summarizeEmailDiscovery(
  leaders: PersonRecord[],
  results: PromiseSettledResult<StableenrichProbeResult>[],
  context: { secOfficers?: SecFormDOfficer[]; exaPeople?: PersonRecord[] } = {},
): StableenrichEmailDiscovery[] {
  if (leaders.length === 0) {
    return [];
  }

  const domain = results.flatMap((result) =>
    result.status === "fulfilled" && result.value.metadata?.domain ? [result.value.metadata.domain] : [],
  )[0];
  const secNames = new Set(
    (context.secOfficers ?? []).map((officer) => officer.fullName.toLowerCase().trim()),
  );
  const exaNames = new Set(
    (context.exaPeople ?? [])
      .map((person) => (person.name ?? fullName(person.firstName, person.lastName) ?? "").toLowerCase().trim())
      .filter((name) => name.length > 0),
  );
  const exaEmailsByName = new Map(
    (context.exaPeople ?? [])
      .flatMap((person): Array<[string, string]> => {
        const email = workEmailValue(person.email, domain);
        if (!email) {
          return [];
        }
        const name = (person.name ?? fullName(person.firstName, person.lastName) ?? "").toLowerCase().trim();
        return name ? [[name, email]] : [];
      })
  );

  const entries = new Map<string, StableenrichEmailDiscovery>();
  for (const leader of leaders) {
    const name = leader.name ?? fullName(leader.firstName, leader.lastName);
    if (!name) {
      continue;
    }
    const key = name.toLowerCase().trim();
    if (entries.has(key)) {
      continue;
    }
    const discoverySource: StableenrichEmailDiscovery["discoverySource"] = secNames.has(key)
      ? "sec_edgar"
      : exaNames.has(key)
        ? "exa"
        : "apollo";
    const exaEmail = exaEmailsByName.get(key) ?? null;
    const leaderEmail = workEmailValue(leader.email, domain);
    const seedEmail = leaderEmail ?? exaEmail;
    const seedSource: StableenrichEmailDiscovery["emailSource"] = leaderEmail
      ? "apollo_search"
      : exaEmail
        ? "exa"
        : null;
    entries.set(key, {
      name,
      role: leader.role ?? null,
      discoverySource,
      emailFound: seedEmail ?? null,
      emailSource: seedSource,
      hunterAttempts: [],
    });
  }

  const upgradeWithEmail = (
    nameKey: string,
    email: string,
    source: StableenrichEmailDiscovery["emailSource"],
  ) => {
    const entry = entries.get(nameKey);
    if (!entry || entry.emailFound) {
      return;
    }
    entry.emailFound = email;
    entry.emailSource = source;
  };

  for (const result of results) {
    if (result.status !== "fulfilled") {
      continue;
    }
    const probe = result.value;
    if (probe.name === "apollo_people_enrich" || probe.name === "minerva_enrich" || probe.name === "clado_contacts_enrich") {
      const people = extractPeopleRecords(probe.result);
      const source: StableenrichEmailDiscovery["emailSource"] =
        probe.name === "apollo_people_enrich" ? "apollo_enrich" : probe.name === "minerva_enrich" ? "minerva" : "clado";
      for (const person of people) {
        const email = workEmailValue(person.email, probe.metadata?.domain);
        if (!email) {
          continue;
        }
        const name = person.name ?? fullName(person.firstName, person.lastName) ?? probe.metadata?.personName;
        if (!name) {
          continue;
        }
        upgradeWithEmail(name.toLowerCase().trim(), email, source);
      }
      continue;
    }
    if (probe.name === "hunter_email_verifier") {
      const personName = probe.metadata?.personName;
      const email = workEmailValue(probe.metadata?.email, probe.metadata?.domain);
      if (!personName || !email) {
        continue;
      }
      const key = personName.toLowerCase().trim();
      const entry = entries.get(key);
      if (!entry) {
        continue;
      }
      const record = objectRecord(probe.result);
      const status = stringValue(record?.status)?.toLowerCase() ?? null;
      const score = integerValue(record?.score);
      const accepted = hunterVerificationAccepted(probe.result);
      entry.hunterAttempts = entry.hunterAttempts ?? [];
      entry.hunterAttempts.push({ email, status, score, accepted });
      if (accepted && !entry.emailFound) {
        entry.emailFound = email;
        entry.emailSource = "hunter";
      }
    }
  }

  return Array.from(entries.values()).map((entry) => {
    const { hunterAttempts, ...rest } = entry;
    return hunterAttempts && hunterAttempts.length > 0 ? { ...rest, hunterAttempts } : rest;
  });
}

function rankPeople(people: PersonRecord[]) {
  const byKey = new Map<string, PersonRecord>();
  for (const person of people) {
    if (!isUsablePersonRecord(person)) {
      continue;
    }

    const name = person.name ?? fullName(person.firstName, person.lastName);
    if (!name) {
      continue;
    }
    const key = name.toLowerCase().trim();
    const current = byKey.get(key);
    const personScore = roleScoreForPerson(person.role);
    const currentScore = current ? roleScoreForPerson(current.role) : -1;
    if (!current || personScore > currentScore || (personScore === currentScore && !current.email && person.email)) {
      byKey.set(key, { ...person, name });
    }
  }

  return Array.from(byKey.values()).sort((left, right) => roleScoreForPerson(right.role) - roleScoreForPerson(left.role));
}

function apolloOrganizationIdForDomain(payload: unknown, domain: string) {
  const root = objectRecord(payload);
  if (!root) {
    return null;
  }
  const organizations = Array.isArray(root.organizations)
    ? root.organizations
    : Array.isArray(root.accounts)
      ? root.accounts
      : root.organization
        ? [root.organization]
        : [];
  const normalizedDomain = domain.toLowerCase().replace(/^www\./, "");
  for (const item of organizations) {
    const record = objectRecord(item);
    if (!record) {
      continue;
    }
    const candidateDomain =
      stringValue(record.primary_domain) ??
      stringValue(record.domain) ??
      domainFromUrl(stringValue(record.website_url));
    if (candidateDomain?.toLowerCase().replace(/^www\./, "") !== normalizedDomain) {
      continue;
    }

    const id = stringValue(record.id);
    if (id) {
      return id;
    }
  }

  return null;
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

function minervaRecordForPerson(person: PersonRecord) {
  const [firstName, ...rest] = (person.name ?? "").split(/\s+/);
  return {
    record_id: personNameKey(person) ?? person.linkedinUrl ?? person.email ?? "person",
    ...(person.linkedinUrl ? { linkedin_url: person.linkedinUrl } : {}),
    ...(person.name ? { full_name: person.name } : {}),
    ...(person.firstName ?? firstName ? { first_name: person.firstName ?? firstName } : {}),
    ...(person.lastName ?? rest.join(" ") ? { last_name: person.lastName ?? rest.join(" ") } : {}),
  };
}

function personMetadata(person: PersonRecord): NonNullable<StableenrichProbeResult["metadata"]> {
  const name = person.name ?? fullName(person.firstName, person.lastName);
  return {
    ...(name ? { personName: name } : {}),
    ...(person.role ? { role: person.role } : {}),
    ...(person.linkedinUrl || person.sourceUrl ? { sourceUrl: person.linkedinUrl ?? person.sourceUrl } : {}),
    ...(person.email ? { email: person.email } : {}),
  };
}

function emailCandidatesForPerson(person: PersonRecord, domain: string) {
  if (!isUsablePersonRecord(person)) {
    return [];
  }

  const first = cleanEmailPart(person.firstName ?? person.name?.split(/\s+/)[0]);
  const last = cleanEmailPart(person.lastName ?? person.name?.split(/\s+/).slice(1).join(""));
  if (!first) {
    return [];
  }
  const firstInitial = first.charAt(0);
  const companyLocalPart = cleanEmailPart(domain.split(".")[0]);

  return Array.from(new Set([
    `${first}@${domain}`,
    ...(last ? [
      `${first}.${last}@${domain}`,
      `${firstInitial}${last}@${domain}`,
      `${first}${last}@${domain}`,
      `${first}_${last}@${domain}`,
      `${firstInitial}.${last}@${domain}`,
    ] : []),
  ]))
    .filter((email) => isPersonEmailCandidate(email, domain, companyLocalPart))
    .slice(0, 6);
}

const GENERIC_PERSON_NAME_TOKENS = new Set([
  "about",
  "admin",
  "career",
  "careers",
  "ceo",
  "cfo",
  "chief",
  "cmo",
  "company",
  "contact",
  "coo",
  "cofounder",
  "cpo",
  "cro",
  "cto",
  "current",
  "email",
  "employee",
  "employees",
  "executive",
  "expert",
  "format",
  "formats",
  "founder",
  "founders",
  "hr",
  "jobs",
  "just",
  "leadership",
  "linkedin",
  "management",
  "official",
  "officer",
  "people",
  "profile",
  "profiles",
  "subscribe",
  "support",
  "team",
  "test",
  "title",
  "today",
]);

function isUsablePersonRecord(person: PersonRecord) {
  const name = person.name ?? fullName(person.firstName, person.lastName);
  return !name || isUsablePersonName(name);
}

function isUsablePersonName(value: string) {
  const tokens = normalizePersonName(value).split(" ").filter(Boolean);
  if (tokens.length < 2 || tokens.length > 4) {
    return false;
  }

  return tokens.every((token) => token.length > 1 && !GENERIC_PERSON_NAME_TOKENS.has(token));
}

function isPersonEmailCandidate(email: string, domain: string | undefined, companyLocalPart = cleanEmailPart(domain?.split(".")[0])) {
  const local = cleanEmailPart(email.split("@")[0]);
  return Boolean(local && !EXA_EMAIL_GENERIC_LOCAL_PARTS.has(local) && (!companyLocalPart || local !== companyLocalPart));
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

function hunterMinScore() {
  const configured = Number.parseInt(process.env.HUNTER_MIN_SCORE ?? "", 10);
  return Number.isFinite(configured) && configured > 0 ? configured : 70;
}

function hunterVerificationAccepted(payload: unknown) {
  const record = objectRecord(payload);
  const status = stringValue(record?.status)?.toLowerCase();
  const score = integerValue(record?.score);
  return status === "valid" || (status === "accept_all" && score !== null && score >= hunterMinScore());
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

function stableenrichCitationUrl(endpointUrl: string, domain: string | null) {
  const url = new URL(endpointUrl);
  if (domain) {
    url.searchParams.set("domain", domain);
  }
  return url.toString();
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
