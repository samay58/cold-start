import { agentcashJson } from "./agentcash";
import type { PeopleEmailHint, ProviderResearchPlan, ProviderSource, StableenrichEnv, StableenrichProbe } from "./types";
import { deriveEmailPattern } from "@cold-start/core";
import { type AgentcashFetch, type StableenrichEmailPatternResult, type StableenrichProbeFailure, type StableenrichProbeResult, type StableenrichSourcesResult, createAgentcashBudgetState, requireStableenrichConfig, runStableenrichProbe, stableenrichEndpointUrl, stableenrichProbeTimeoutMs, takeAgentcashBudget } from "./stableenrich/core";
import { MAX_LEADERS_FOR_ENRICHMENT, namedLeadersWithSourceUrl, runApolloPeopleDiscovery, runExaEmailDiscovery, runPeopleFollowupRequests, runSecEdgarDiscovery, runStableenrichPeopleFollowups } from "./stableenrich/discovery";
import { collectStableenrichSources } from "./stableenrich/facts";
import { extractPeopleFromExaEmailResults, peopleHintsFromProviderSources, peopleRecordsFromEmailHints, rankPeople, summarizeEmailDiscovery } from "./stableenrich/people";

export async function fetchStableenrichSources(input: {
  env: StableenrichEnv;
  domain: string;
  researchPlan?: ProviderResearchPlan | undefined;
  agentcashFetch?: AgentcashFetch | undefined;
  skipProbeNames?: StableenrichProbe["name"][] | undefined;
  maxBudgetUsd?: number | undefined;
}): Promise<StableenrichSourcesResult> {
  const budgetState = createAgentcashBudgetState(input.maxBudgetUsd);
  const results = await runStableenrichProbe({ ...input, budgetState });
  const followups = await runStableenrichPeopleFollowups({
    env: input.env,
    domain: input.domain,
    results,
    agentcashFetch: input.agentcashFetch ?? ((request) => agentcashJson<unknown>(request)),
    budgetState,
  });
  return { ...collectStableenrichSources([...results, ...followups]), ...(budgetState.ceilingHit ? { budgetCeilingHit: true } : {}) };
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
  const results = await runStableenrichProbe({ ...input, tier: "fast", budgetState });
  return { ...collectStableenrichSources(results), ...(budgetState.ceilingHit ? { budgetCeilingHit: true } : {}) };
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
  const results = await runStableenrichProbe({ ...input, tier: "enrichment", budgetState });
  const followups = await runStableenrichPeopleFollowups({
    env: input.env,
    domain: input.domain,
    results,
    agentcashFetch: input.agentcashFetch ?? ((request) => agentcashJson<unknown>(request)),
    budgetState,
  });
  return { ...collectStableenrichSources([...results, ...followups]), ...(budgetState.ceilingHit ? { budgetCeilingHit: true } : {}) };
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
  const skipApolloPeople = namedLeadersWithSourceUrl(cheapLeaders).length >= MAX_LEADERS_FOR_ENRICHMENT;
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
    allowApolloEnrich: !skipApolloPeople,
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
    const result = await agentcashFetch({
      url: endpointUrl,
      body: {
        query: `"@${input.domain}" founder OR CEO OR CTO OR CFO OR cofounder OR contact email`,
        numResults: 8,
        contents: {
          text: true,
          highlights: { highlightsPerUrl: 3, numSentences: 3 }
        }
      },
      timeoutMs: stableenrichProbeTimeoutMs("exa_email_search")
    });
    settled = {
      status: "fulfilled",
      value: {
        name: "exa_email_search",
        endpointUrl,
        result,
        durationMs: Date.now() - startedAt,
        metadata: { domain: input.domain }
      }
    };
  } catch (error) {
    settled = {
      status: "rejected",
      reason: {
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
export type { StableenrichEmailDiscovery, StableenrichEmailPatternResult, StableenrichProbeFailure, StableenrichSourcesResult } from "./stableenrich/core";
