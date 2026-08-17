import { agentcashJson } from "./agentcash";
import type { PeopleEmailHint, ProviderResearchPlan, ProviderSource, StableenrichEnv, StableenrichProbe } from "./types";
import { deriveEmailPattern } from "@cold-start/core";
import { type AgentcashFetch, type StableenrichEmailPatternResult, type StableenrichProbeFailure, type StableenrichProbeResult, type StableenrichSourcesResult, createAgentcashBudgetState, requireStableenrichConfig, runAgentcashProbeCall, runStableenrichProbe, stableenrichEndpointUrl, stableenrichProbeFailure, stableenrichProbeTimeoutMs, takeAgentcashBudget } from "./stableenrich/core";
import { MAX_LEADERS_FOR_ENRICHMENT, namedLeadersWithSourceUrl, runApolloPeopleDiscovery, runExaEmailDiscovery, runPeopleFollowupRequests, runSecEdgarDiscovery, runStableenrichPeopleFollowups } from "./stableenrich/discovery";
import { collectStableenrichSources } from "./stableenrich/facts";
import { extractPeopleFromExaEmailResults, peopleHintsFromProviderSources, peopleRecordsFromEmailHints, rankPeople, summarizeEmailDiscovery } from "./stableenrich/people";

const unavailableApolloProbeNames = [
  "apollo_org_search",
  "apollo_people_search",
  "apollo_people_enrich"
] as const;

function markUnavailableApolloProbes(
  budgetState: ReturnType<typeof createAgentcashBudgetState>,
  env: StableenrichEnv
) {
  const configured = new Set([
    ...(env.STABLEENRICH_APOLLO_ORG_SEARCH_URL ? ["apollo_org_search"] : []),
    ...(env.STABLEENRICH_APOLLO_PEOPLE_SEARCH_URL ? ["apollo_people_search"] : []),
    ...(env.STABLEENRICH_APOLLO_PEOPLE_ENRICH_URL ? ["apollo_people_enrich"] : [])
  ]);
  budgetState.skippedEndpoints.push(...unavailableApolloProbeNames.filter((name) => !configured.has(name)));
}

function withBudgetState(result: StableenrichSourcesResult, budgetState: ReturnType<typeof createAgentcashBudgetState>) {
  return {
    ...result,
    ...(budgetState.ceilingHit ? { budgetCeilingHit: true } : {}),
    skippedProbeNames: Array.from(new Set(budgetState.skippedEndpoints))
  };
}

export async function fetchStableenrichSources(input: {
  env: StableenrichEnv;
  domain: string;
  researchPlan?: ProviderResearchPlan | undefined;
  agentcashFetch?: AgentcashFetch | undefined;
  skipProbeNames?: StableenrichProbe["name"][] | undefined;
  maxBudgetUsd?: number | undefined;
}): Promise<StableenrichSourcesResult> {
  const budgetState = createAgentcashBudgetState(input.maxBudgetUsd);
  markUnavailableApolloProbes(budgetState, input.env);
  const results = await runStableenrichProbe({ ...input, budgetState });
  const followups = await runStableenrichPeopleFollowups({
    env: input.env,
    domain: input.domain,
    results,
    agentcashFetch: input.agentcashFetch ?? ((request) => agentcashJson<unknown>(request)),
    budgetState,
  });
  return withBudgetState(collectStableenrichSources([...results, ...followups]), budgetState);
}

export async function fetchStableenrichFastSources(input: {
  env: StableenrichEnv;
  domain: string;
  researchPlan?: ProviderResearchPlan | undefined;
  agentcashFetch?: AgentcashFetch | undefined;
  skipProbeNames?: StableenrichProbe["name"][] | undefined;
  maxBudgetUsd?: number | undefined;
}): Promise<StableenrichSourcesResult> {
  const budgetState = createAgentcashBudgetState(input.maxBudgetUsd);
  markUnavailableApolloProbes(budgetState, input.env);
  const results = await runStableenrichProbe({ ...input, tier: "fast", budgetState });
  return withBudgetState(collectStableenrichSources(results), budgetState);
}

export async function fetchStableenrichEnrichmentSources(input: {
  env: StableenrichEnv;
  domain: string;
  researchPlan?: ProviderResearchPlan | undefined;
  agentcashFetch?: AgentcashFetch | undefined;
  skipProbeNames?: StableenrichProbe["name"][] | undefined;
  maxBudgetUsd?: number | undefined;
}): Promise<StableenrichSourcesResult> {
  const budgetState = createAgentcashBudgetState(input.maxBudgetUsd);
  markUnavailableApolloProbes(budgetState, input.env);
  const results = await runStableenrichProbe({ ...input, tier: "enrichment", budgetState });
  const followups = await runStableenrichPeopleFollowups({
    env: input.env,
    domain: input.domain,
    results,
    agentcashFetch: input.agentcashFetch ?? ((request) => agentcashJson<unknown>(request)),
    budgetState,
  });
  return withBudgetState(collectStableenrichSources([...results, ...followups]), budgetState);
}

export async function fetchStableenrichPeopleEmailSources(input: {
  env: StableenrichEnv;
  domain: string;
  sourceHints: ProviderSource[];
  peopleHints?: PeopleEmailHint[] | undefined;
  agentcashFetch?: AgentcashFetch | undefined;
  companyName?: string | undefined;
  maxBudgetUsd?: number | undefined;
}): Promise<StableenrichSourcesResult> {
  requireStableenrichConfig(input.env);
  const agentcashFetch = input.agentcashFetch ?? ((request) => agentcashJson<unknown>(request));
  const budgetState = createAgentcashBudgetState(input.maxBudgetUsd);
  markUnavailableApolloProbes(budgetState, input.env);
  const hintedPeople = rankPeople(peopleRecordsFromEmailHints(input.peopleHints ?? []));
  const sourceHintPeople = peopleHintsFromProviderSources(input.sourceHints, input.domain);
  const [secFormD, exaEmails] = await Promise.all([
    runSecEdgarDiscovery({ domain: input.domain, ...(input.companyName ? { companyName: input.companyName } : {}) }),
    runExaEmailDiscovery({
      env: input.env,
      domain: input.domain,
      agentcashFetch,
      budgetState,
      ...(input.companyName ? { companyName: input.companyName } : {}),
    }),
  ]);
  const cheapLeaders = rankPeople([...hintedPeople, ...sourceHintPeople, ...secFormD.people]);
  const apolloSearchConfigured = Boolean(
    input.env.STABLEENRICH_APOLLO_ORG_SEARCH_URL &&
    input.env.STABLEENRICH_APOLLO_PEOPLE_SEARCH_URL
  );
  const skipApolloPeople =
    !apolloSearchConfigured ||
    namedLeadersWithSourceUrl(cheapLeaders).length >= MAX_LEADERS_FOR_ENRICHMENT;
  const discovery = skipApolloPeople
    ? { people: [], results: [] as PromiseSettledResult<StableenrichProbeResult>[] }
    : await runApolloPeopleDiscovery({ env: input.env, domain: input.domain, agentcashFetch, budgetState });
  const leaders = rankPeople([
    ...cheapLeaders,
    ...discovery.people,
    ...exaEmails.people,
  ]).slice(0, MAX_LEADERS_FOR_ENRICHMENT);
  const followups = await runPeopleFollowupRequests({
    env: input.env,
    domain: input.domain,
    leaders,
    agentcashFetch,
    allowApolloEnrich: !skipApolloPeople && Boolean(input.env.STABLEENRICH_APOLLO_PEOPLE_ENRICH_URL),
    budgetState,
  });
  const collected = collectStableenrichSources([...discovery.results, ...followups, ...exaEmails.results]);
  const extraSources = [...secFormD.sources];
  const extraFacts = [...secFormD.facts];
  return {
    ...collected,
    sources: [...collected.sources, ...extraSources],
    facts: [...collected.facts, ...extraFacts],
    ...(budgetState.ceilingHit ? { budgetCeilingHit: true } : {}),
    skippedProbeNames: Array.from(new Set(budgetState.skippedEndpoints)),
    emailDiscovery: summarizeEmailDiscovery(leaders, [...discovery.results, ...followups, ...exaEmails.results], {
      secOfficers: secFormD.officers,
      exaPeople: exaEmails.people,
    }),
  };
}

export async function fetchStableenrichEmailPatternSources(input: {
  env: StableenrichEnv;
  domain: string;
  agentcashFetch?: AgentcashFetch | undefined;
  maxBudgetUsd?: number | undefined;
}): Promise<StableenrichEmailPatternResult> {
  requireStableenrichConfig(input.env);
  const budgetState = createAgentcashBudgetState(input.maxBudgetUsd);
  if (!takeAgentcashBudget(budgetState, "exa_email_search")) {
    return {
      observed: [],
      pattern: null,
      patternAnchorCount: 0,
      sources: [],
      failures: [],
      endpoints: [],
      budgetCeilingHit: true
    };
  }

  const endpointUrl = stableenrichEndpointUrl(input.env, "STABLEENRICH_EXA_SEARCH_URL");
  const agentcashFetch = input.agentcashFetch ?? ((request) => agentcashJson<unknown>(request));
  let settled: PromiseSettledResult<StableenrichProbeResult>;
  const startedAt = Date.now();
  try {
    const value = await runAgentcashProbeCall({
      agentcashFetch,
      name: "exa_email_search",
      endpointUrl,
      body: {
        query: `"@${input.domain}" founder OR CEO OR CTO OR CFO OR cofounder OR contact email`,
        numResults: 8,
        contents: {
          text: true,
          highlights: { highlightsPerUrl: 3, numSentences: 3 }
        }
      },
      timeoutMs: stableenrichProbeTimeoutMs("exa_email_search"),
      metadata: { domain: input.domain }
    });
    settled = {
      status: "fulfilled",
      value: { ...value, durationMs: Date.now() - startedAt }
    };
  } catch (error) {
    const tracedFailure = stableenrichProbeFailure(error)[0];
    settled = {
      status: "rejected",
      reason: tracedFailure ?? {
        name: "exa_email_search",
        endpointUrl,
        error: error instanceof Error ? error.message : String(error)
      } satisfies StableenrichProbeFailure
    };
  }

  const collected = collectStableenrichSources([settled]);
  const observed = settled.status === "fulfilled"
    ? extractPeopleFromExaEmailResults(settled.value.result, input.domain).flatMap((person) =>
        person.email
          ? [{ email: person.email, fullName: person.name ?? null, sourceUrl: person.sourceUrl ?? null }]
          : []
      )
    : [];
  const patternResult = deriveEmailPattern(observed.map(({ email, fullName }) => ({ email, fullName })));
  return {
    observed,
    pattern: patternResult?.pattern ?? null,
    patternAnchorCount: patternResult?.anchorCount ?? 0,
    sources: collected.sources,
    failures: collected.failures,
    endpoints: collected.endpoints
  };
}

export { buildStableenrichRequests, missingStableenrichConfig, providerSourceFromText, runStableenrichProbe } from "./stableenrich/core";
export type { StableenrichSourcesResult } from "./stableenrich/core";
