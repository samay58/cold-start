import type { ColdStartCard, GenerationTrace } from "@cold-start/core";
import {
  filterSourcesForDomain,
  sourceGateTrace,
  type BlockEnrichmentId,
  type ExtractedCardSections
} from "@cold-start/pipeline";
import {
  fetchDirectExaFundamentalsSources,
  fetchStableenrichEnrichmentSources,
  fetchStableenrichFastSources,
  fetchStableenrichSources,
  type DirectExaEnv,
  type ProviderFactCandidate,
  type ProviderResearchPlan,
  type ProviderSource,
  type StableenrichEnv,
  type StableenrichProbeName,
  type StableenrichSourcesResult
} from "@cold-start/providers";
import { recordSource, type ColdStartDb, type StoredSource } from "@cold-start/db";

import type { webEnv } from "../lib/web-env";
import { boundedErrorMessage } from "../lib/errors";
import { directExaEnabled, type AnalysisSourceRefreshMode } from "./worker-env";
import { withStableenrichEndpointBudgets } from "./provider-trace";

type GenerationMode = "basics" | "analysis";

type SourceFetchTrace = {
  providers: NonNullable<GenerationTrace["providers"]> & {
    directExa: NonNullable<NonNullable<GenerationTrace["providers"]>["directExa"]>;
    stableenrich: NonNullable<NonNullable<GenerationTrace["providers"]>["stableenrich"]>;
  };
  sourceGate: NonNullable<GenerationTrace["sourceGate"]>;
};

export function mergeSources(...groups: ProviderSource[][]): ProviderSource[] {
  const byUrl = new Map<string, ProviderSource>();

  for (const source of groups.flat()) {
    if (!byUrl.has(source.url)) {
      byUrl.set(source.url, source);
    }
  }

  return Array.from(byUrl.values());
}

// Persist the fetched sources against a stored card. Shared by the basics/analysis worker and the
// async contact-enrichment worker so the field mapping stays in one place.
export function recordSourcesForCard(db: ColdStartDb, cardId: string, sources: ProviderSource[]) {
  return Promise.all(
    sources.map((source) =>
      recordSource(db, {
        cardId,
        url: source.url,
        title: source.title,
        sourceType: source.sourceType,
        fetchedAt: source.fetchedAt,
        rawText: source.rawText,
        imageUrl: source.imageUrl ?? null,
      }),
    ),
  );
}

export function providerSourcesFromStoredSources(storedSources: StoredSource[]): ProviderSource[] {
  return storedSources.map((source) => ({
    url: source.url,
    title: source.title,
    sourceType: source.sourceType,
    fetchedAt: source.fetchedAt,
    rawText: source.rawText,
    imageUrl: source.imageUrl ?? null
  }));
}

export function sectionsWithSourceCitations(card: ColdStartCard, sources: ProviderSource[]): ExtractedCardSections {
  const citations = [...card.citations];
  const existingUrls = new Set(citations.map((citation) => citation.url));
  let sourceIndex = 1;

  for (const source of sources.filter((candidate) => candidate.sourceType !== "enrichment").slice(0, 12)) {
    if (existingUrls.has(source.url)) {
      continue;
    }

    let id = `s${sourceIndex}`;
    sourceIndex += 1;
    while (citations.some((citation) => citation.id === id)) {
      id = `s${sourceIndex}`;
      sourceIndex += 1;
    }

    citations.push({
      id,
      url: source.url,
      title: source.title,
      fetchedAt: source.fetchedAt,
      sourceType: source.sourceType,
      ...(source.rawText ? { snippet: source.rawText.slice(0, 700) } : {})
    });
    existingUrls.add(source.url);
  }

  return {
    identity: card.identity,
    funding: card.funding,
    team: card.team,
    signals: card.signals,
    comparables: card.comparables,
    citations
  };
}

function stableenrichExaSkipsForDirectCoverage(input: {
  directSources: ProviderSource[];
  domain: string;
}): StableenrichProbeName[] {
  if (input.directSources.length === 0) {
    return [];
  }

  const sourceGate = filterSourcesForDomain({ domain: input.domain, sources: input.directSources });
  const coveredIntents = new Set(
    sourceGate.accepted.flatMap((source) => (source.intent ? [source.intent] : []))
  );
  const skips: StableenrichProbeName[] = [];
  if (coveredIntents.has("company_profile")) {
    skips.push("exa_company_profile");
  }
  if (coveredIntents.has("funding")) {
    skips.push("exa_funding_history");
  }
  if (coveredIntents.has("management_team")) {
    skips.push("exa_management_team");
  }
  if (coveredIntents.has("recent_signals")) {
    skips.push("exa_recent_signals");
  }
  return skips;
}

const stableenrichLateEnrichmentProbeNames: StableenrichProbeName[] = [
  "exa_recent_signals",
  "exa_competition",
  "exa_independent_analysis",
  "exa_customer_proof",
  "exa_product_proof",
  "exa_find_similar",
  "firecrawl_about",
  "firecrawl_team"
];

const stableenrichLateEnrichmentProbesByBlock: Record<BlockEnrichmentId, StableenrichProbeName[]> = {
  description: ["exa_independent_analysis", "exa_product_proof", "firecrawl_about"],
  funding: ["exa_recent_signals", "exa_independent_analysis"],
  team: ["firecrawl_about", "firecrawl_team"],
  signals: ["exa_recent_signals", "exa_customer_proof", "exa_independent_analysis"],
  comparables: ["exa_competition", "exa_find_similar", "exa_independent_analysis"]
};

export function stableenrichLateEnrichmentSkipsForBlocks(blocks: BlockEnrichmentId[]): StableenrichProbeName[] {
  const allowed = new Set(blocks.flatMap((block) => stableenrichLateEnrichmentProbesByBlock[block]));
  return stableenrichLateEnrichmentProbeNames.filter((name) => !allowed.has(name));
}

// Task 5.3: ANALYSIS_SOURCE_REFRESH routing. "full" runs the unconditional 13-probe stableenrich
// fetch (today's behavior, the default). "targeted" narrows to the 3-probe signals group
// (exa_recent_signals, exa_customer_proof, exa_independent_analysis) via the same
// stableenrichLateEnrichmentSkipsForBlocks helper the late-enrichment path already uses. "skip"
// makes no stableenrich fetch at all and substitutes stored sources for the reuse branch.
export type AnalysisSourceFetchPlan =
  | { kind: "full" }
  | { kind: "targeted" }
  | { kind: "skip" };

// Pure given (reuseExistingForAnalysis, signalsFresh, refreshMode): no Inngest step, no DB, no
// network. A run that is NOT reusing an existing extraction (first analysis run, or the existing
// card fails hasInvestorUsableProfile) always gets the full fetch regardless of the flag -- the
// flag only ever narrows a *re*-fetch on top of reused extraction, never a first fetch, since
// there is no prior evidence to fall back on. Task 5.1 established that verifySynthesis only ever
// reads card.citations, so narrowing this fetch cannot change what verify sees beyond which
// citations get merged in.
export function analysisSourceFetchPlan(input: {
  reuseExistingForAnalysis: boolean;
  signalsFresh: boolean;
  refreshMode: AnalysisSourceRefreshMode;
}): AnalysisSourceFetchPlan {
  if (!input.reuseExistingForAnalysis) {
    return { kind: "full" };
  }

  if (input.refreshMode === "targeted") {
    return { kind: "targeted" };
  }

  if (input.refreshMode === "skip-fresh") {
    return input.signalsFresh ? { kind: "skip" } : { kind: "targeted" };
  }

  return { kind: "full" };
}

// Resolves the stableenrich portion of the fetch-sources step for analysis mode. Basics mode is
// untouched by the plan (always the fast tier, as today). Direct Exa is resolved separately by
// the caller and is unaffected by the plan in every branch: the flag only ever narrows or skips
// the AgentCash-billed stableenrich probes.
async function stableenrichSourcesForAnalysisPlan(input: {
  mode: GenerationMode;
  plan: AnalysisSourceFetchPlan;
  env: StableenrichEnv;
  domain: string;
  researchPlan: ProviderResearchPlan;
  skipProbeNames: StableenrichProbeName[];
  maxBudgetUsd: number | undefined;
  loadStoredSourcesForSkip: (() => Promise<ProviderSource[]>) | undefined;
}): Promise<StableenrichSourcesResult> {
  if (input.mode === "basics") {
    return fetchStableenrichFastSources({
      env: input.env,
      domain: input.domain,
      researchPlan: input.researchPlan,
      skipProbeNames: input.skipProbeNames,
      maxBudgetUsd: input.maxBudgetUsd
    });
  }

  if (input.plan.kind === "skip") {
    const sources = input.loadStoredSourcesForSkip ? await input.loadStoredSourcesForSkip() : [];
    return { sources, facts: [], failures: [], endpoints: [] };
  }

  if (input.plan.kind === "targeted") {
    return fetchStableenrichEnrichmentSources({
      env: input.env,
      domain: input.domain,
      researchPlan: input.researchPlan,
      skipProbeNames: stableenrichLateEnrichmentSkipsForBlocks(["signals"]),
      maxBudgetUsd: input.maxBudgetUsd
    });
  }

  return fetchStableenrichSources({
    env: input.env,
    domain: input.domain,
    researchPlan: input.researchPlan,
    skipProbeNames: input.skipProbeNames,
    maxBudgetUsd: input.maxBudgetUsd
  });
}

export async function fetchInitialSourcesForGeneration(input: {
  mode: GenerationMode;
  domain: string;
  researchPlan: ProviderResearchPlan;
  runtimeEnv: ReturnType<typeof webEnv>;
  stableEnv: StableenrichEnv;
  directExaEnv: DirectExaEnv;
  agentcashBudgetCeiling: number | null;
  analysisSourceFetch?: AnalysisSourceFetchPlan;
  loadStoredSourcesForSkip?: () => Promise<ProviderSource[]>;
}): Promise<{
  sources: ProviderSource[];
  providerFacts: ProviderFactCandidate[];
  failureCount: number;
  trace: SourceFetchTrace;
  error: string | null;
}> {
  const maxBudgetUsd = input.agentcashBudgetCeiling ?? undefined;
  const analysisSourceFetch = input.analysisSourceFetch ?? { kind: "full" as const };
  let stableSkipProbeNames: StableenrichProbeName[] = [];
  const directPromise = directExaEnabled()
    ? fetchDirectExaFundamentalsSources({ env: input.directExaEnv, domain: input.domain })
    : Promise.resolve({ sources: [], failures: [], skipped: true, requestCount: 0, estimatedCostUsd: 0 });
  let directResult: PromiseSettledResult<Awaited<ReturnType<typeof fetchDirectExaFundamentalsSources>>>;
  let stableResult: PromiseSettledResult<Awaited<ReturnType<typeof fetchStableenrichFastSources>>>;

  if (input.runtimeEnv.CHEAP_FIRST_EXA_ENABLED) {
    directResult = await Promise.resolve(directPromise).then(
      (value) => ({ status: "fulfilled" as const, value }),
      (reason) => ({ status: "rejected" as const, reason })
    );
    const directSourcesForCoverage = directResult.status === "fulfilled" ? directResult.value.sources : [];
    stableSkipProbeNames = stableenrichExaSkipsForDirectCoverage({ directSources: directSourcesForCoverage, domain: input.domain });
    stableResult = await stableenrichSourcesForAnalysisPlan({
      mode: input.mode,
      plan: analysisSourceFetch,
      env: input.stableEnv,
      domain: input.domain,
      researchPlan: input.researchPlan,
      skipProbeNames: stableSkipProbeNames,
      maxBudgetUsd,
      loadStoredSourcesForSkip: input.loadStoredSourcesForSkip
    }).then(
      (value) => ({ status: "fulfilled" as const, value }),
      (reason) => ({ status: "rejected" as const, reason })
    );
  } else {
    [directResult, stableResult] = await Promise.allSettled([
      directPromise,
      stableenrichSourcesForAnalysisPlan({
        mode: input.mode,
        plan: analysisSourceFetch,
        env: input.stableEnv,
        domain: input.domain,
        researchPlan: input.researchPlan,
        skipProbeNames: [],
        maxBudgetUsd,
        loadStoredSourcesForSkip: input.loadStoredSourcesForSkip
      }),
    ]);
  }

  const directSources = directResult.status === "fulfilled" ? directResult.value.sources : [];
  const stableSources = stableResult.status === "fulfilled" ? stableResult.value.sources : [];
  const stableFacts = stableResult.status === "fulfilled" ? stableResult.value.facts : [];
  const sources = mergeSources(directSources, stableSources);
  const sourceGate = filterSourcesForDomain({ domain: input.domain, sources });
  const failures = [
    ...(directResult.status === "fulfilled"
      ? directResult.value.failures
      : [{ name: "exa_direct_company" as const, endpointUrl: "https://api.exa.ai/search", error: boundedErrorMessage(directResult.reason) }]),
    ...(stableResult.status === "fulfilled"
      ? stableResult.value.failures
      : [{ name: "stableenrich" as const, endpointUrl: "stableenrich", error: boundedErrorMessage(stableResult.reason) }]),
  ];

  const sourceTrace = {
    providers: {
      directExa: {
        skipped: directResult.status === "fulfilled" ? directResult.value.skipped : false,
        sourceCount: directSources.length,
        failureCount: directResult.status === "fulfilled" ? directResult.value.failures.length : 1,
        requestCount: directResult.status === "fulfilled" ? directResult.value.requestCount : 0,
        estimatedCostUsd: directResult.status === "fulfilled" ? directResult.value.estimatedCostUsd : 0
      },
      stableenrich: {
        sourceCount: stableSources.length,
        factCount: stableFacts.length,
        failureCount: stableResult.status === "fulfilled" ? stableResult.value.failures.length : 1,
        ...(stableResult.status === "fulfilled" && stableResult.value.budgetCeilingHit ? { budgetCeilingHit: true } : {}),
        ...(stableSkipProbeNames.length > 0 ? { skippedProbeNames: stableSkipProbeNames } : {}),
        // Trace honesty for Task 5.3: which ANALYSIS_SOURCE_REFRESH branch actually ran this
        // fetch. Absent on basics runs (the plan never applies there). Lets shadow-run comparison
        // and the wait-surface progress copy tell "reused filed evidence" apart from "fetched
        // fresh" straight from the trace, without inferring it from probe/source counts.
        ...(input.mode !== "basics" ? { analysisSourceRefresh: analysisSourceFetch.kind } : {}),
        endpoints:
          stableResult.status === "fulfilled"
            ? withStableenrichEndpointBudgets(stableResult.value.endpoints)
            : [
                {
                  name: "stableenrich",
                  endpointUrl: "stableenrich",
                  status: "failed" as const,
                  sourceCount: 0,
                  factCount: 0,
                  error: boundedErrorMessage(stableResult.reason)
                }
              ]
      },
      mergedSourceCount: sources.length
    },
    sourceGate: sourceGateTrace(sourceGate)
  };

  // Wallet-exhaustion detection. AgentCash returns "INSUFFICIENT_BALANCE" inside the CLI
  // error envelope when the wallet runs dry. If multiple paid probes fail with that
  // signal, every downstream LLM call will be a waste of Anthropic spend producing thin
  // synthesis against near-zero evidence. Abort early with the deposit URL so the
  // operator can refill before the next run.
  const insufficientBalanceFailures = failures.filter((failure) =>
    /INSUFFICIENT_BALANCE|insufficient_balance|agentcash\.dev\/deposit/i.test(failure.error)
  );
  if (insufficientBalanceFailures.length >= 3) {
    const depositMatch = insufficientBalanceFailures[0]?.error.match(/https:\/\/agentcash\.dev\/deposit\/[A-Za-z0-9]+/);
    const depositLink = depositMatch?.[0] ?? "https://agentcash.dev";
    return {
      sources: [],
      providerFacts: stableFacts,
      failureCount: failures.length,
      trace: sourceTrace,
      error: `AgentCash wallet exhausted: ${insufficientBalanceFailures.length} of ${failures.length} provider probes failed with INSUFFICIENT_BALANCE. Refill at ${depositLink} and retry. (Aborting before LLM spend.)`
    };
  }

  if (sourceGate.accepted.length === 0) {
    const details = failures
      .map((failure) => `${failure.name}: ${boundedErrorMessage(failure.error)}`)
      .join("; ");
    return {
      sources: [],
      providerFacts: stableFacts,
      failureCount: failures.length,
      trace: sourceTrace,
      error: `No accepted provider sources returned; fetched: ${sources.length}; rejected: ${sourceGate.rejected.length}; failures: ${failures.length}${details ? `; ${details}` : ""}`
    };
  }

  return {
    sources: sourceGate.accepted,
    providerFacts: stableFacts,
    failureCount: failures.length,
    trace: sourceTrace,
    error: null
  };
}

export async function fetchLateEnrichmentSources(input: {
  domain: string;
  researchPlan: ProviderResearchPlan;
  acceptedSources: ProviderSource[];
  stableEnv: StableenrichEnv;
  remainingBudgetUsd: number | null;
  missingBlocks: BlockEnrichmentId[];
  initialProviders: SourceFetchTrace["providers"];
  currentStable: SourceFetchTrace["providers"]["stableenrich"] | undefined;
}): Promise<{
  sources: ProviderSource[];
  providerFacts: ProviderFactCandidate[];
  trace: SourceFetchTrace;
}> {
  const maxBudgetUsd = input.remainingBudgetUsd ?? undefined;
  const lateEnrichmentSkipProbeNames = stableenrichLateEnrichmentSkipsForBlocks(input.missingBlocks);
  const stableResult = await fetchStableenrichEnrichmentSources({
    env: input.stableEnv,
    domain: input.domain,
    researchPlan: input.researchPlan,
    maxBudgetUsd,
    ...(lateEnrichmentSkipProbeNames.length > 0 ? { skipProbeNames: lateEnrichmentSkipProbeNames } : {})
  });
  const sources = mergeSources(input.acceptedSources, stableResult.sources);
  const sourceGate = filterSourcesForDomain({ domain: input.domain, sources });
  const initialStable = input.currentStable ?? input.initialProviders.stableenrich;
  return {
    sources: sourceGate.accepted,
    providerFacts: stableResult.facts,
    trace: {
      providers: {
        ...input.initialProviders,
        stableenrich: {
          sourceCount: (initialStable?.sourceCount ?? 0) + stableResult.sources.length,
          factCount: (initialStable?.factCount ?? 0) + stableResult.facts.length,
          failureCount: (initialStable?.failureCount ?? 0) + stableResult.failures.length,
          ...(initialStable?.budgetCeilingHit || stableResult.budgetCeilingHit ? { budgetCeilingHit: true } : {}),
          skippedProbeNames: Array.from(new Set([
            ...(initialStable?.skippedProbeNames ?? []),
            ...lateEnrichmentSkipProbeNames
          ])),
          endpoints: [...(initialStable?.endpoints ?? []), ...withStableenrichEndpointBudgets(stableResult.endpoints)]
        },
        mergedSourceCount: sources.length
      },
      sourceGate: sourceGateTrace(sourceGate)
    }
  };
}
