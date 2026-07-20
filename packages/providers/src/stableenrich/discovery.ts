import { providerBudgetForEndpoint } from "../provider-budget";
import { type SecFormDOfficer, fetchSecFormD, isSecFormDResult } from "../sec-edgar";
import { allSettledLimited, extractUrlRecords, stringRecordValue, supportedUrl, workEmailValue } from "../stableenrich-utils";
import type { ProviderFactCandidate, ProviderSource, StableenrichEnv } from "../types";
import { APOLLO_LEADER_SENIORITIES, APOLLO_LEADER_TITLES, type AgentcashBudgetState, type AgentcashFetch, type StableenrichProbeFailure, type StableenrichProbeResult, fullName, providerSourceFromText, stableenrichEndpointUrl, stableenrichProbeTimeoutMs, takeAgentcashBudget } from "./core";
import { type PersonRecord, apolloOrganizationIdForDomain, dedupeByName, dedupePeopleInOrder, emailCandidatesForPerson, extractPeopleFromExaEmailResults, extractPeopleRecords, isLikelyPersonName, minervaRecordForPerson, peopleEnrichBody, peopleHintsFromSearchResults, personMetadata, personNameKey, personPath, rankPeople } from "./people";

export async function runExaEmailDiscovery(input: {
  env: StableenrichEnv;
  domain: string;
  companyName?: string | undefined;
  agentcashFetch: AgentcashFetch;
  budgetState?: AgentcashBudgetState | undefined;
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
    probes.filter(({ name }) => takeAgentcashBudget(input.budgetState, name)).map(async ({ name, query }): Promise<PromiseSettledResult<StableenrichProbeResult>> => {
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

export async function runSecEdgarDiscovery(input: {
  domain: string;
  companyName?: string | undefined;
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

export function namedLeadersWithSourceUrl(people: PersonRecord[]) {
  return rankPeople(people).filter((person) => {
    const name = person.name ?? fullName(person.firstName, person.lastName);
    return Boolean(name && person.sourceUrl);
  });
}

export const MAX_LEADERS_FOR_ENRICHMENT = providerBudgetForEndpoint("stableenrich", "apollo_people_enrich").maxCallsPerRun;

const MAX_FALLBACK_LEADERS = Math.min(
  providerBudgetForEndpoint("stableenrich", "minerva_enrich").maxCallsPerRun,
  providerBudgetForEndpoint("stableenrich", "clado_contacts_enrich").maxCallsPerRun
);

const MAX_HUNTER_CANDIDATES = providerBudgetForEndpoint("stableenrich", "hunter_email_verifier").maxCallsPerRun;

export async function runApolloPeopleDiscovery(input: {
  env: StableenrichEnv;
  domain: string;
  agentcashFetch: AgentcashFetch;
  budgetState?: AgentcashBudgetState | undefined;
}): Promise<{ people: PersonRecord[]; results: PromiseSettledResult<StableenrichProbeResult>[] }> {
  const results: PromiseSettledResult<StableenrichProbeResult>[] = [];
  const orgSearchUrl = stableenrichEndpointUrl(input.env, "STABLEENRICH_APOLLO_ORG_SEARCH_URL");
  let organizationId: string | null = null;

  if (takeAgentcashBudget(input.budgetState, "apollo_org_search")) {
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
  }

  const peopleSearchUrl = stableenrichEndpointUrl(input.env, "STABLEENRICH_APOLLO_PEOPLE_SEARCH_URL");
  if (takeAgentcashBudget(input.budgetState, "apollo_people_search")) {
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
  }

  return { people: [], results };
}

export async function runStableenrichPeopleFollowups(input: {
  env: StableenrichEnv;
  domain: string;
  results: PromiseSettledResult<StableenrichProbeResult>[];
  agentcashFetch: AgentcashFetch;
  budgetState?: AgentcashBudgetState | undefined;
}): Promise<PromiseSettledResult<StableenrichProbeResult>[]> {
  const cheapLeaders = peopleHintsFromSearchResults(input.results, input.domain);
  const skipApolloPeople = namedLeadersWithSourceUrl(cheapLeaders).length >= MAX_LEADERS_FOR_ENRICHMENT;
  const discovery = skipApolloPeople
    ? { people: [], results: [] as PromiseSettledResult<StableenrichProbeResult>[] }
    : await runApolloPeopleDiscovery({
        env: input.env,
        domain: input.domain,
        agentcashFetch: input.agentcashFetch,
        budgetState: input.budgetState
      });
  const leaders = rankPeople([
    ...cheapLeaders,
    ...discovery.people,
  ]).slice(0, MAX_LEADERS_FOR_ENRICHMENT);
  const followups = await runPeopleFollowupRequests({
    ...input,
    leaders,
    allowApolloEnrich: !skipApolloPeople
  });

  return [...discovery.results, ...followups];
}

export async function runPeopleFollowupRequests(input: {
  env: StableenrichEnv;
  domain: string;
  leaders: PersonRecord[];
  agentcashFetch: AgentcashFetch;
  allowApolloEnrich?: boolean | undefined;
  budgetState?: AgentcashBudgetState | undefined;
}): Promise<PromiseSettledResult<StableenrichProbeResult>[]> {
  const leaders = input.leaders;
  if (leaders.length === 0) {
    return [];
  }

  const peopleEnrichUrl = stableenrichEndpointUrl(input.env, "STABLEENRICH_APOLLO_PEOPLE_ENRICH_URL");
  const leadersForApolloEnrich = input.allowApolloEnrich === false
    ? []
    : leaders.filter(() => takeAgentcashBudget(input.budgetState, "apollo_people_enrich"));
  const enrichSettled = await allSettledLimited(
    leadersForApolloEnrich,
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
    budgetState: input.budgetState,
  });
  const minervaPeople = minervaSettled.flatMap((result) =>
    result.status === "fulfilled" ? extractPeopleRecords(result.value.result) : []
  );
  const cladoSettled = await runCladoEmailFallbackRequests({
    env: input.env,
    domain: input.domain,
    leaders: rankPeople([...fallbackLeaders, ...minervaPeople]).filter((person) => !workEmailValue(person.email, input.domain)).slice(0, MAX_FALLBACK_LEADERS),
    agentcashFetch: input.agentcashFetch,
    budgetState: input.budgetState,
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
  const peopleForVerification = dedupePeopleInOrder([
    ...leaders,
    ...rankPeople([...enrichedPeople, ...minervaPeople, ...cladoPeople])
  ])
    .filter((person) => !workEmailValue(person.email, input.domain))
    .filter((person) => {
      const key = personNameKey(person);
      return !key || !peopleWithEmailNames.has(key);
    });
  const candidates = peopleForVerification
    .flatMap((person) => emailCandidatesForPerson(person, input.domain).map((email) => ({ person, email })))
    .slice(0, MAX_HUNTER_CANDIDATES)
    .filter(() => takeAgentcashBudget(input.budgetState, "hunter_email_verifier"));

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
  budgetState?: AgentcashBudgetState | undefined;
}): Promise<PromiseSettledResult<StableenrichProbeResult>[]> {
  const leaders = input.leaders
    .filter((person) => person.linkedinUrl || person.name || person.firstName)
    .filter(() => takeAgentcashBudget(input.budgetState, "minerva_enrich"));
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
  budgetState?: AgentcashBudgetState | undefined;
}): Promise<PromiseSettledResult<StableenrichProbeResult>[]> {
  const leaders = input.leaders
    .filter((person) => person.linkedinUrl)
    .filter(() => takeAgentcashBudget(input.budgetState, "clado_contacts_enrich"));
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
