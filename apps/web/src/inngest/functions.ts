import {
  companySlugFromDomain,
  type ColdStartCard,
  type GenerationTrace,
  type GenerationLlmCallTrace,
  deriveLegacyResearchSectionsFromCard,
  emptyResearchSectionForCard,
  RESEARCH_SECTION_DEFINITIONS_BY_ID,
  researchSectionCitationIssues,
  researchSectionHasReaderFacingEvidence,
  hasInvestorUsableProfile,
  hasUsablePublicProfile,
  publicProfileQuality,
  researchSectionIdSchema,
  type ResearchSection,
  type ResearchSectionId,
  type ResolvedFact
} from "@cold-start/core";
import {
  createDb,
  findSourcesBySlug,
  findCardBySlug,
  markGenerationRun,
  markResearchSectionFailed,
  recordResearchRunEvent,
  recordCardEvidence,
  recordSource,
  updateGenerationRunTrace,
  upsertCard,
  upsertResearchSection,
  upsertResearchSections,
  type StoredSource,
  type ColdStartDb
} from "@cold-start/db";
import {
  anthropicModel,
  anthropicModelForStage,
  createAnthropicClient,
  extractCompanyBlockClaims,
  extractCompanyClaims,
  fallbackResearchPlan,
  synthesizeResearchSection,
  synthesizeCard,
  verifySynthesis,
  type ResearchSectionEvidenceSource,
} from "@cold-start/llm";
import {
  filterSourcesForDomain,
  GenerateCardTraceError,
  extractedCardSectionsSchema,
  buildSeedProfileCard,
  cardWithExtractedSections,
  enrichExtractedSectionsForDomain,
  generateCardForDomainWithTrace,
  applyProviderFactCandidates,
  sourceGateTrace,
  totalGenerationCost,
  type BlockEnrichmentPatch,
  type CostLine,
  type EvidenceLedgerEntry,
  type ExtractedCardSections,
  type GenerateCardTracePatch
} from "@cold-start/pipeline";
import {
  fetchDirectExaContactSources,
  fetchDirectExaFundamentalsSources,
  fetchStableenrichEnrichmentSources,
  fetchStableenrichFastSources,
  fetchStableenrichPeopleEmailSources,
  fetchStableenrichSources,
  fetchWebsetsPeopleEmailSources,
  providerBudgetForEndpoint,
  type DirectExaEnv,
  type PeopleEmailHint,
  type ProviderFactCandidate,
  type ProviderSource,
  type StableenrichEnv,
  type StableenrichProbeName,
  type WebsetsEnv,
  agentcashWalletSnapshot
} from "@cold-start/providers";
import { canonicalCompanyDomain } from "../lib/domain";
import { webEnv } from "../lib/env";
import { boundedErrorMessage } from "../lib/errors";
import { inngest } from "./client";
import {
  applyStableenrichWalletTrace,
  completedStep,
  generationMilestoneElapsedMs,
  mergeGenerationTrace,
  mergeTracePatch,
  requestedAtMsFromGenerationEvent,
  skippedStep,
  writeGenerationMilestoneValue,
  type ProviderTrace
} from "./generation-trace";

function readEnvSubset<K extends string>(keys: readonly K[]): Partial<Record<K, string>> {
  const out: Partial<Record<K, string>> = {};
  for (const key of keys) {
    const value = process.env[key];
    if (value) {
      out[key] = value;
    }
  }
  return out;
}

const STABLEENRICH_ENV_KEYS = [
  "STABLEENRICH_BASE_URL",
  "STABLEENRICH_EXA_SEARCH_URL",
  "STABLEENRICH_EXA_SIMILAR_URL",
  "STABLEENRICH_FIRECRAWL_URL",
  "STABLEENRICH_ORG_ENRICH_URL",
  "STABLEENRICH_APOLLO_ORG_SEARCH_URL",
  "STABLEENRICH_APOLLO_PEOPLE_SEARCH_URL",
  "STABLEENRICH_APOLLO_PEOPLE_ENRICH_URL",
  "STABLEENRICH_HUNTER_EMAIL_VERIFIER_URL",
  "STABLEENRICH_CLADO_CONTACTS_ENRICH_URL",
  "STABLEENRICH_MINERVA_ENRICH_URL",
] as const satisfies ReadonlyArray<keyof StableenrichEnv>;

const DIRECT_EXA_ENV_KEYS = [
  "DIRECT_EXA_API_KEY",
  "DIRECT_EXA_BASE_URL",
] as const satisfies ReadonlyArray<keyof DirectExaEnv>;

const WEBSETS_ENV_KEYS = [
  "EXA_WEBSETS_API_KEY",
  "EXA_WEBSETS_BASE_URL",
] as const satisfies ReadonlyArray<keyof WebsetsEnv>;

const PUBLIC_RESEARCH_SECTION_IDS = ["buyer", "customer_proof", "traction", "financing", "competition", "product"] as const;
const GATED_RESEARCH_SECTION_IDS = ["why_it_matters", "market", "risks"] as const;

function stableenrichEnvFromProcess(): StableenrichEnv {
  return readEnvSubset(STABLEENRICH_ENV_KEYS);
}

function directExaEnvFromProcess(): DirectExaEnv {
  return readEnvSubset(DIRECT_EXA_ENV_KEYS);
}

function websetsEnvFromProcess(): WebsetsEnv {
  return readEnvSubset(WEBSETS_ENV_KEYS);
}

type GenerationMode = "basics" | "analysis";
type TimedResult<T> = { durationMs: number; value: T };
type ContactEnrichmentTier = "named-only" | "full" | "off";

const CONTACT_ENRICHMENT_EVENT_NAME = "card/contact-enrichment.requested" as const;

function generationModeForRun(input: unknown): GenerationMode {
  return input === "analysis" ? "analysis" : "basics";
}

function directExaEnabled() {
  return process.env.FAST_BASICS_ENABLED !== "false";
}

export function contactEnrichmentEnabled(input: {
  CONTACT_ENRICHMENT_ENABLED: boolean;
  CONTACT_ENRICHMENT_TIER: ContactEnrichmentTier;
}) {
  return input.CONTACT_ENRICHMENT_ENABLED && input.CONTACT_ENRICHMENT_TIER !== "off";
}

export function buildContactEnrichmentRequestedEvent(input: {
  domain: string;
  slug: string;
  requestedAtMs: number;
  tier: ContactEnrichmentTier;
  parentGenerationRunId?: string | null;
  parentInngestRunId?: string | null;
}) {
  return {
    name: CONTACT_ENRICHMENT_EVENT_NAME,
    data: {
      domain: input.domain,
      slug: input.slug,
      requestedAtMs: input.requestedAtMs,
      tier: input.tier,
      ...(input.parentGenerationRunId ? { parentGenerationRunId: input.parentGenerationRunId } : {}),
      ...(input.parentInngestRunId ? { parentInngestRunId: input.parentInngestRunId } : {})
    }
  };
}

async function timed<T>(fn: () => Promise<T> | T): Promise<TimedResult<T>> {
  const startedAt = Date.now();
  const value = await fn();
  return { durationMs: Date.now() - startedAt, value };
}

async function safeAgentcashWalletSnapshot() {
  try {
    return {
      ok: true as const,
      snapshot: await agentcashWalletSnapshot()
    };
  } catch (error) {
    return {
      ok: false as const,
      error: boundedErrorMessage(error)
    };
  }
}

function generateErrorTracePatch(error: unknown): GenerateCardTracePatch {
  return error instanceof GenerateCardTraceError ? error.tracePatch : {};
}

function rawDomainForRun(input: unknown): string {
  if (typeof input !== "string" || input.trim().length === 0) {
    return "invalid-domain";
  }

  return input.trim().slice(0, 253);
}

function mergeSources(...groups: ProviderSource[][]): ProviderSource[] {
  const byUrl = new Map<string, ProviderSource>();

  for (const source of groups.flat()) {
    if (!byUrl.has(source.url)) {
      byUrl.set(source.url, source);
    }
  }

  return Array.from(byUrl.values());
}

function providerSourcesFromStoredSources(storedSources: StoredSource[]): ProviderSource[] {
  return storedSources.map((source) => ({
    url: source.url,
    title: source.title,
    sourceType: source.sourceType,
    fetchedAt: source.fetchedAt,
    rawText: source.rawText
  }));
}

function sectionsWithSourceCitations(card: ColdStartCard, sources: ProviderSource[]): ExtractedCardSections {
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

function peopleHintsFromSections(sections: ExtractedCardSections): PeopleEmailHint[] {
  return [
    ...(sections.team.founders.value ?? []),
    ...(sections.team.keyExecs.value ?? [])
  ].map((person) => ({
    name: person.name,
    role: person.role,
    sourceUrl: person.sourceUrl,
    email: person.email ?? null
  }));
}

function peopleHintsFromCard(card: ColdStartCard): PeopleEmailHint[] {
  return [
    ...(card.team.founders.value ?? []),
    ...(card.team.keyExecs.value ?? [])
  ].map((person) => ({
    name: person.name,
    role: person.role,
    sourceUrl: person.sourceUrl,
    email: person.email ?? null
  }));
}

function cardHasContactTargets(card: ColdStartCard, tier: ContactEnrichmentTier) {
  if (tier === "full") {
    return true;
  }

  return peopleHintsFromCard(card).some((person) =>
    Boolean(person.name?.trim()) && !person.email
  );
}

function peopleEmailCount(sections: ExtractedCardSections) {
  return [
    ...(sections.team.founders.value ?? []),
    ...(sections.team.keyExecs.value ?? [])
  ].filter((person) => Boolean(person.email)).length;
}

function recordLlmCall(trace: GenerationTrace, costLines: CostLine[], call: GenerationLlmCallTrace) {
  const calls = [...(trace.llm?.calls ?? []), call];
  const totalEstimatedCostUsd = Number(
    calls.reduce((sum, item) => sum + (item.estimatedCostUsd ?? 0), 0).toFixed(6)
  );
  trace.llm = {
    calls,
    ...(totalEstimatedCostUsd > 0 ? { totalEstimatedCostUsd } : {})
  };

  if (call.estimatedCostUsd !== undefined && call.estimatedCostUsd > 0) {
    costLines.push({
      label: `anthropic:${call.stage}:${call.label}:${call.model}`,
      usd: call.estimatedCostUsd
    });
  }
  trace.costUsdAnthropic = totalEstimatedCostUsd;
}

async function recordSourcesForCard(db: ColdStartDb, cardId: string, sources: ProviderSource[]) {
  return Promise.all(
    sources.map((source) =>
      recordSource(db, {
        cardId,
        url: source.url,
        title: source.title,
        sourceType: source.sourceType,
        fetchedAt: source.fetchedAt,
        rawText: source.rawText,
      }),
    ),
  );
}

function normalizedUrlKey(value: string) {
  try {
    const url = new URL(value);
    url.hash = "";
    url.search = "";
    url.pathname = url.pathname.replace(/\/+$/, "") || "/";
    return url.toString().toLowerCase();
  } catch {
    return value.toLowerCase();
  }
}

function evidenceForSection(card: ColdStartCard, storedSources: Awaited<ReturnType<typeof findSourcesBySlug>>): ResearchSectionEvidenceSource[] {
  const sourcesByUrl = new Map(storedSources.map((source) => [normalizedUrlKey(source.url), source]));

  return card.citations.flatMap((citation) => {
    const source = sourcesByUrl.get(normalizedUrlKey(citation.url));
    const text = source?.rawText || citation.snippet || "";
    if (!text.trim()) {
      return [];
    }

    return [{
      citationId: citation.id,
      url: citation.url,
      title: citation.title,
      sourceType: citation.sourceType,
      text
    }];
  });
}

function citationIdsFromSectionContent(content: NonNullable<ResearchSection["content"]>) {
  return Array.from(new Set([
    ...content.items.flatMap((item) => item.citationIds),
    ...(content.napkinMath?.buyers.citationIds ?? []),
    ...(content.napkinMath?.annualSpend.citationIds ?? [])
  ]));
}

function sectionFromGeneratedContent(card: ColdStartCard, sectionId: ResearchSectionId, content: NonNullable<ResearchSection["content"]>, runId: string | null): ResearchSection {
  const definition = RESEARCH_SECTION_DEFINITIONS_BY_ID[sectionId];
  const citationIds = citationIdsFromSectionContent(content);
  const section: ResearchSection = {
    slug: card.slug,
    domain: card.domain,
    sectionId,
    visibility: definition.visibility,
    status: content.status === "available" && citationIds.length > 0 ? "available" : "empty",
    content: content.status === "available" && citationIds.length > 0 ? content : {
      status: "empty",
      summary: null,
      items: [],
      questions: [],
      confidence: "low"
    },
    citationIds,
    sourceIds: citationIds,
    runId,
    error: null,
    generatedAt: new Date().toISOString(),
    staleAt: null
  };
  const citationIssues = researchSectionCitationIssues(card, section);
  if (citationIssues.length > 0) {
    throw new Error(citationIssues[0]);
  }

  if (section.status === "available" && !researchSectionHasReaderFacingEvidence(card, section)) {
    return generatedEmptySection(card, sectionId, runId);
  }

  return section;
}

function generatedEmptySection(card: ColdStartCard, sectionId: ResearchSectionId, runId: string | null): ResearchSection {
  return {
    ...emptyResearchSectionForCard(card, sectionId),
    runId,
    generatedAt: new Date().toISOString()
  };
}

function failedStableenrichEndpoint(reason: unknown) {
  return {
    name: "stableenrich" as const,
    endpointUrl: "stableenrich",
    status: "failed" as const,
    sourceCount: 0,
    factCount: 0,
    error: boundedErrorMessage(reason)
  };
}

type StableenrichEndpointTraceInput = NonNullable<NonNullable<NonNullable<GenerationTrace["providers"]>["stableenrich"]>["endpoints"]>[number];

function mergeEndpointFactCounts(
  left: Record<string, number> | undefined,
  right: Record<string, number> | undefined
) {
  const out: Record<string, number> = { ...(left ?? {}) };
  for (const [endpoint, count] of Object.entries(right ?? {})) {
    out[endpoint] = (out[endpoint] ?? 0) + count;
  }
  return out;
}

function withStableenrichEndpointBudgets(
  endpoints: StableenrichEndpointTraceInput[],
  appliedByEndpoint: Record<string, number> = {}
): StableenrichEndpointTraceInput[] {
  return endpoints.map((endpoint) => {
    try {
      const budget = providerBudgetForEndpoint("stableenrich", endpoint.name as StableenrichProbeName);
      return {
        ...endpoint,
        factsAppliedCount: appliedByEndpoint[endpoint.name] ?? endpoint.factsAppliedCount ?? 0,
        estimatedCostUsd: budget.estimatedCostUsd,
        expectedFacts: budget.expectedFacts,
        stopCondition: budget.stopCondition
      };
    } catch {
      return {
        ...endpoint,
        factsAppliedCount: appliedByEndpoint[endpoint.name] ?? endpoint.factsAppliedCount ?? 0
      };
    }
  });
}

function applyStableenrichEndpointYield(trace: GenerationTrace, appliedByEndpoint?: Record<string, number>) {
  if (!trace.providers?.stableenrich?.endpoints || !appliedByEndpoint) {
    return;
  }

  trace.providers = {
    ...trace.providers,
    stableenrich: {
      ...trace.providers.stableenrich,
      endpoints: withStableenrichEndpointBudgets(trace.providers.stableenrich.endpoints, appliedByEndpoint)
    }
  };
}

function agentcashBudgetCeilingUsd(input: {
  mode: GenerationMode;
  override?: number | undefined;
}) {
  if (typeof input.override === "number" && Number.isFinite(input.override) && input.override >= 0) {
    return input.override;
  }

  return input.mode === "analysis" ? 0.5 : 0.3;
}

function stableenrichEndpointBudgetUsd(endpoints: StableenrichEndpointTraceInput[] | undefined) {
  return (endpoints ?? []).reduce((sum, endpoint) => sum + (endpoint.estimatedCostUsd ?? 0), 0);
}

function remainingAgentcashBudgetUsd(input: {
  ceilingUsd: number;
  endpoints?: StableenrichEndpointTraceInput[] | undefined;
}) {
  return Math.max(0, Number((input.ceilingUsd - stableenrichEndpointBudgetUsd(input.endpoints)).toFixed(6)));
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

async function fetchContactSourcesForBasics(input: {
  acceptedSources: ProviderSource[];
  directExaEnv: DirectExaEnv;
  domain: string;
  initialProviders: ProviderTrace;
  maxStableenrichBudgetUsd?: number | undefined;
  peopleHints: PeopleEmailHint[];
  stableEnv: StableenrichEnv;
  websetsEnabled: boolean;
  websetsEnv: WebsetsEnv;
  websetsExternalId?: string;
}) {
  const useWebsetsContactPath = input.websetsEnabled && Boolean(input.websetsEnv.EXA_WEBSETS_API_KEY?.trim());
  const [directContactResult, stableContactResult, websetsContactResult] = await Promise.allSettled([
    directExaEnabled()
      ? fetchDirectExaContactSources({ env: input.directExaEnv, domain: input.domain, peopleHints: input.peopleHints })
      : Promise.resolve({ sources: [], facts: [], failures: [], skipped: true }),
    useWebsetsContactPath
      ? Promise.resolve({
          sources: [],
          facts: [],
          failures: [],
          endpoints: [
            {
              name: "stableenrich" as const,
              endpointUrl: "stableenrich",
              status: "skipped" as const,
              sourceCount: 0,
              factCount: 0,
              error: "EXA_WEBSETS_CONTACTS_ENABLED=true"
            }
          ],
          emailDiscovery: [],
          budgetCeilingHit: false
        })
      : fetchStableenrichPeopleEmailSources({
          env: input.stableEnv,
          domain: input.domain,
          sourceHints: input.acceptedSources,
          peopleHints: input.peopleHints,
          maxBudgetUsd: input.maxStableenrichBudgetUsd
        }),
    useWebsetsContactPath
      ? fetchWebsetsPeopleEmailSources({
          env: input.websetsEnv,
          domain: input.domain,
          peopleHints: input.peopleHints,
          ...(input.websetsExternalId ? { externalId: input.websetsExternalId } : {})
        })
      : Promise.resolve({
          sources: [],
          facts: [],
          failures: [],
          skipped: true,
          emailDiscovery: [],
          trace: {
            skipped: true,
            sourceCount: 0,
            factCount: 0,
            failureCount: 0
          }
        })
  ]);
  const directContactSources = directContactResult.status === "fulfilled" ? directContactResult.value.sources : [];
  const directContactFacts = directContactResult.status === "fulfilled" ? directContactResult.value.facts : [];
  const directContactFailureCount = directContactResult.status === "fulfilled" ? directContactResult.value.failures.length : 1;
  const stableContactSources = stableContactResult.status === "fulfilled" ? stableContactResult.value.sources : [];
  const stableContactFacts = stableContactResult.status === "fulfilled" ? stableContactResult.value.facts : [];
  const websetsContactSources = websetsContactResult.status === "fulfilled" ? websetsContactResult.value.sources : [];
  const websetsContactFacts = websetsContactResult.status === "fulfilled" ? websetsContactResult.value.facts : [];
  const websetsTrace = websetsContactResult.status === "fulfilled"
    ? websetsContactResult.value.trace
    : {
        skipped: false,
        sourceCount: 0,
        factCount: 0,
        failureCount: 1
      };
  const stableContactFailures = stableContactResult.status === "fulfilled"
    ? stableContactResult.value.failures
    : [{ name: "stableenrich" as const, endpointUrl: "stableenrich", error: boundedErrorMessage(stableContactResult.reason) }];
  const stableContactEndpoints = stableContactResult.status === "fulfilled"
    ? withStableenrichEndpointBudgets(stableContactResult.value.endpoints)
    : [failedStableenrichEndpoint(stableContactResult.reason)];
  const sources = mergeSources(input.acceptedSources, directContactSources, stableContactSources, websetsContactSources);
  const sourceGate = filterSourcesForDomain({ domain: input.domain, sources });
  const initialDirectExa = input.initialProviders.directExa ?? { skipped: true, sourceCount: 0, failureCount: 0 };
  const initialStable = input.initialProviders.stableenrich;
  const stableEmailDiscovery = stableContactResult.status === "fulfilled"
    ? stableContactResult.value.emailDiscovery ?? []
    : [];
  const websetsEmailDiscovery = websetsContactResult.status === "fulfilled"
    ? websetsContactResult.value.emailDiscovery ?? []
    : [];

  return {
    sources: sourceGate.accepted,
    providerFacts: [...websetsContactFacts, ...stableContactFacts, ...directContactFacts],
    trace: {
      providers: {
        ...input.initialProviders,
        directExa: {
          skipped: initialDirectExa.skipped && (directContactResult.status === "fulfilled" ? directContactResult.value.skipped : false),
          sourceCount: initialDirectExa.sourceCount + directContactSources.length,
          failureCount: initialDirectExa.failureCount + directContactFailureCount
        },
        stableenrich: {
          sourceCount: (initialStable?.sourceCount ?? 0) + stableContactSources.length,
          factCount: (initialStable?.factCount ?? 0) + stableContactFacts.length,
          failureCount: (initialStable?.failureCount ?? 0) + stableContactFailures.length,
          endpoints: [...(initialStable?.endpoints ?? []), ...stableContactEndpoints],
          ...(stableContactResult.status === "fulfilled" && stableContactResult.value.budgetCeilingHit ? { budgetCeilingHit: true } : {})
        },
        websets: websetsTrace,
        mergedSourceCount: sources.length,
        ...([...websetsEmailDiscovery, ...stableEmailDiscovery].length > 0
          ? { emailDiscovery: [...websetsEmailDiscovery, ...stableEmailDiscovery] }
          : {})
      },
      sourceGate: sourceGateTrace(sourceGate)
    }
  };
}

function stringValue(input: unknown): string | null {
  return typeof input === "string" && input.trim().length > 0 ? input.trim() : null;
}

export const contactEnrichmentFunction = inngest.createFunction(
  { id: "contact-enrichment" },
  { event: CONTACT_ENRICHMENT_EVENT_NAME },
  async ({ event, runId, step }) => {
    const runtimeEnv = webEnv();
    const { DATABASE_URL } = runtimeEnv;
    const db = createDb(DATABASE_URL);
    const requestedAtMs = requestedAtMsFromGenerationEvent(event);
    const parentGenerationRunId = stringValue(event.data.parentGenerationRunId);
    const trace: GenerationTrace = {
      jobKind: "basics",
      mode: "basics",
      inngest: {
        ...(typeof event.id === "string" ? { eventId: event.id } : {}),
        ...(typeof runId === "string" ? { runId } : {})
      },
      steps: {}
    };

    let domain = "invalid-domain";
    let slug = rawSlugForRun(event.data.slug);
    let currentStage = "canonicalize-domain";

    const eventRunId = () =>
      parentGenerationRunId ?? trace.inngest?.runId ?? `contacts:${slug}`;
    const recordEvent = (
      name: string,
      type: string,
      message: string,
      metadata: Record<string, unknown> = {}
    ) =>
      step.run(`contact-event-${name}`, () =>
        recordResearchRunEvent(db, {
          runId: eventRunId(),
          slug,
          domain,
          sectionId: null,
          type,
          message,
          metadata
        }).catch(() => null)
      );

    try {
      domain = canonicalCompanyDomain(event.data.domain);
      slug = companySlugFromDomain(domain);
    } catch (error) {
      trace.failure = {
        stage: currentStage,
        message: boundedErrorMessage(error),
        ...(error instanceof Error ? { className: error.name } : {})
      };
      await recordEvent("invalid-domain", "contacts.failed", boundedErrorMessage(error));
      throw error;
    }

    if (!contactEnrichmentEnabled(runtimeEnv)) {
      trace.steps = {
        ...trace.steps,
        "contact-enrichment": skippedStep("CONTACT_ENRICHMENT_ENABLED=false")
      };
      await recordEvent("disabled", "contacts.skipped", "Contact enrichment disabled", {
        tier: runtimeEnv.CONTACT_ENRICHMENT_TIER
      });
      return { slug, skipped: "disabled" };
    }

    await recordEvent("started", "contacts.started", "Started async contact enrichment", {
      tier: runtimeEnv.CONTACT_ENRICHMENT_TIER
    });

    try {
      currentStage = "load-card";
      const existingCard = await step.run("load-card", () => findCardBySlug(db, slug, { allowStale: true }));
      if (!existingCard) {
        trace.steps = {
          ...trace.steps,
          "load-card": skippedStep("card not found")
        };
        await recordEvent("missing-card", "contacts.skipped", "No stored card found for contact enrichment");
        return { slug, skipped: "card_not_found" };
      }

      currentStage = "load-sources";
      const acceptedSources = await step.run("load-sources", async () =>
        providerSourcesFromStoredSources(await findSourcesBySlug(db, slug))
      );
      const baseSections = extractedCardSectionsSchema.parse(
        sectionsWithSourceCitations(existingCard, acceptedSources)
      );
      const peopleHints = peopleHintsFromSections(baseSections);
      if (runtimeEnv.CONTACT_ENRICHMENT_TIER === "named-only" && peopleHints.length === 0) {
        trace.steps = {
          ...trace.steps,
          "contact-enrichment": skippedStep("no named people to verify")
        };
        await recordEvent("no-people", "contacts.skipped", "No named people found for contact enrichment");
        return { slug, skipped: "no_named_people" };
      }

      const stableEnv = stableenrichEnvFromProcess();
      const directExaEnv = directExaEnvFromProcess();
      const websetsEnv = websetsEnvFromProcess();
      currentStage = "fetch-contact-sources";
      const contactSourceResult = await step.run("fetch-contact-sources", async () => {
        const result = await timed(() =>
          fetchContactSourcesForBasics({
            acceptedSources,
            directExaEnv,
            domain,
            initialProviders: {},
            maxStableenrichBudgetUsd: agentcashBudgetCeilingUsd({
              mode: "basics",
              override: runtimeEnv.PER_RUN_AGENTCASH_BUDGET_USD
            }),
            peopleHints,
            stableEnv,
            websetsEnabled: runtimeEnv.EXA_WEBSETS_CONTACTS_ENABLED,
            websetsEnv,
            websetsExternalId: `cold-start-contact-${slug}-${parentGenerationRunId ?? trace.inngest?.runId ?? requestedAtMs}`
          })
        );

        return {
          value: result.value,
          tracePatch: {
            steps: {
              "fetch-contact-sources": completedStep(result.durationMs)
            },
            providers: result.value.trace.providers,
            sourceGate: result.value.trace.sourceGate
          }
        };
      });
      mergeTracePatch(trace, contactSourceResult.tracePatch);
      await recordEvent("sources-fetched", "source.contacts", "Checked people and email sources", {
        sourceCount: contactSourceResult.value.sources.length,
        providerFactCount: contactSourceResult.value.providerFacts.length
      });

      currentStage = "enrich-contacts";
      const contactEnriched = await step.run("enrich-contacts", async () => {
        const result = await timed(() => {
          const providerFactMerge = applyProviderFactCandidates(baseSections, contactSourceResult.value.providerFacts);
          return {
            sections: extractedCardSectionsSchema.parse(providerFactMerge.sections),
            providerFactMerge
          };
        });

        return {
          value: result.value,
          tracePatch: {
            steps: {
              "enrich-contacts": {
                ...completedStep(result.durationMs),
                message: `${peopleEmailCount(result.value.sections)} verified work emails`
              }
            }
          }
        };
      });
      mergeTracePatch(trace, contactEnriched.tracePatch);
      applyStableenrichEndpointYield(trace, contactEnriched.value.providerFactMerge.trace.appliedByEndpoint);

      const contactCard = cardWithExtractedSections(existingCard, contactEnriched.value.sections);
      const cardToStore = prepareCardSnapshotForStorage("basics", existingCard, contactCard);
      let contactsReadyMs: number | null = null;
      if (canStoreCardSnapshot("basics", cardToStore)) {
        const contactStore = await step.run("upsert-contact-card", async () => ({
          row: await upsertCard(db, cardToStore),
          milestoneMs: generationMilestoneElapsedMs(requestedAtMs)
        }));
        contactsReadyMs = contactStore.milestoneMs;
        const contactRow = contactStore.row;
        await step.run("record-contact-card-evidence", () => recordCardEvidence(db, contactRow.id, cardToStore));
        await step.run("record-contact-research-sections", () => upsertResearchSections(db, deriveLegacyResearchSectionsFromCard(cardToStore)));
        await step.run("record-contact-sources", () =>
          recordSourcesForCard(db, contactRow.id, mergeSources(acceptedSources, contactSourceResult.value.sources))
        );
      } else {
        noteSkippedUnderfilledSnapshot(trace, "skip-underfilled-contact-card", cardToStore);
      }

      writeGenerationMilestoneValue(
        trace,
        "contactsReadyMs",
        contactsReadyMs ?? generationMilestoneElapsedMs(requestedAtMs)
      );
      if (parentGenerationRunId) {
        await step.run("update-parent-contact-trace", () =>
          updateGenerationRunTrace(db, {
            id: parentGenerationRunId,
            patch: (existingTrace) => mergeGenerationTrace(existingTrace, trace)
          })
        );
      }

      await recordEvent("complete", "contacts.enriched", `Found ${peopleEmailCount(contactEnriched.value.sections)} verified work emails`, {
        emailCount: peopleEmailCount(contactEnriched.value.sections)
      });
      return { slug, emailCount: peopleEmailCount(contactEnriched.value.sections) };
    } catch (error) {
      trace.failure = {
        stage: currentStage,
        message: boundedErrorMessage(error),
        ...(error instanceof Error ? { className: error.name } : {})
      };
      await recordEvent("failed", "contacts.failed", boundedErrorMessage(error), {
        stage: currentStage
      });
      throw error;
    }
  }
);

function preserveFact<T>(existing: ResolvedFact<T>, next: ResolvedFact<T>): ResolvedFact<T> {
  return next.value === null && existing.value !== null ? existing : next;
}

function preserveOptionalFact<T>(
  existing: ResolvedFact<T> | undefined,
  next: ResolvedFact<T> | undefined,
): ResolvedFact<T> | undefined {
  if (!next) {
    return existing;
  }
  if (!existing) {
    return next;
  }
  return next.value === null && existing.value !== null ? existing : next;
}

export function preserveExistingBasics(existing: ColdStartCard | null, next: ColdStartCard): ColdStartCard {
  if (!existing) {
    return next;
  }

  const citations = new Map(existing.citations.map((citation) => [citation.id, citation]));
  next.citations.forEach((citation) => citations.set(citation.id, citation));
  const synthesis = next.synthesis ?? existing.synthesis;
  const websiteUrl = preserveOptionalFact(existing.identity.websiteUrl, next.identity.websiteUrl);
  const linkedinUrl = preserveOptionalFact(existing.identity.linkedinUrl, next.identity.linkedinUrl);
  const description = preserveOptionalFact(existing.identity.description, next.identity.description);
  const rounds = preserveOptionalFact(existing.funding.rounds, next.funding.rounds);

  return {
    ...next,
    ...(synthesis ? { synthesis } : {}),
    identity: {
      ...next.identity,
      name: preserveFact(existing.identity.name, next.identity.name),
      ...(websiteUrl ? { websiteUrl } : {}),
      ...(linkedinUrl ? { linkedinUrl } : {}),
      oneLiner: preserveFact(existing.identity.oneLiner, next.identity.oneLiner),
      ...(description ? { description } : {}),
      hq: preserveFact(existing.identity.hq, next.identity.hq),
      foundedYear: preserveFact(existing.identity.foundedYear, next.identity.foundedYear),
    },
    funding: {
      ...next.funding,
      totalRaisedUsd: preserveFact(existing.funding.totalRaisedUsd, next.funding.totalRaisedUsd),
      lastRound: preserveFact(existing.funding.lastRound, next.funding.lastRound),
      ...(rounds ? { rounds } : {}),
      investors: preserveFact(existing.funding.investors, next.funding.investors),
    },
    team: {
      founders: preserveFact(existing.team.founders, next.team.founders),
      keyExecs: preserveFact(existing.team.keyExecs, next.team.keyExecs),
      headcount: preserveFact(existing.team.headcount, next.team.headcount),
    },
    signals: next.signals.length > 0 ? next.signals : existing.signals,
    comparables: next.comparables.length > 0 ? next.comparables : existing.comparables,
    citations: Array.from(citations.values()),
  };
}

function prepareCardSnapshotForStorage(mode: GenerationMode, existing: ColdStartCard | null, generated: ColdStartCard): ColdStartCard {
  const merged = preserveExistingBasics(existing, generated);
  return {
    ...merged,
    cacheStatus: mode === "analysis" || hasUsablePublicProfile(merged) ? "hit" : "partial",
  };
}

export function prepareCardForStorage(mode: GenerationMode, existing: ColdStartCard | null, generated: ColdStartCard): ColdStartCard {
  const merged = prepareCardSnapshotForStorage(mode, existing, generated);
  assertTerminalCardQuality(mode, merged);
  return {
    ...merged,
    cacheStatus: "hit"
  };
}

export function underfilledBasicsErrorMessage(card: ColdStartCard) {
  const quality = publicProfileQuality(card);
  const gaps = [
    !quality.hasCitations ? "citations" : null,
    !quality.hasName ? "name" : null,
    !quality.hasSummary ? "summary" : null,
    quality.structuredFactCount < quality.minimumStructuredFactCount ? "structured facts" : null,
    quality.visibleFactCount < quality.minimumVisibleFactCount ? "visible facts" : null
  ].filter(Boolean);
  return [
    "generated basics underfilled public profile",
    `(${quality.structuredFactCount}/${quality.minimumStructuredFactCount} structured facts,`,
    `${quality.visibleFactCount}/${quality.minimumVisibleFactCount} visible facts,`,
    `${card.citations.length} citations${gaps.length > 0 ? `; missing ${gaps.join(", ")}` : ""})`
  ].join(" ");
}

function canStoreCardSnapshot(mode: GenerationMode, card: ColdStartCard) {
  return mode !== "basics" || hasUsablePublicProfile(card);
}

function noteSkippedUnderfilledSnapshot(trace: GenerationTrace, stepName: string, card: ColdStartCard) {
  trace.steps = {
    ...trace.steps,
    [stepName]: {
      status: "skipped",
      message: `${underfilledBasicsErrorMessage(card)}; continuing enrichment without saving a partial card`
    }
  };
}

function assertTerminalCardQuality(mode: GenerationMode, card: ColdStartCard) {
  if (mode === "basics" && !hasUsablePublicProfile(card)) {
    throw new Error(underfilledBasicsErrorMessage(card));
  }
}

function pipelineBlockPatch(input: Awaited<ReturnType<typeof extractCompanyBlockClaims>>): BlockEnrichmentPatch {
  const patch: BlockEnrichmentPatch = { citations: input.citations };

  if (input.identity) {
    const identity: NonNullable<BlockEnrichmentPatch["identity"]> = {};
    if (input.identity.oneLiner) {
      identity.oneLiner = input.identity.oneLiner;
    }
    if (input.identity.description) {
      identity.description = input.identity.description;
    }
    if (Object.keys(identity).length > 0) {
      patch.identity = identity;
    }
  }

  if (input.funding) {
    const funding: NonNullable<BlockEnrichmentPatch["funding"]> = {};
    if (input.funding.totalRaisedUsd) {
      funding.totalRaisedUsd = input.funding.totalRaisedUsd;
    }
    if (input.funding.lastRound) {
      funding.lastRound = input.funding.lastRound;
    }
    if (input.funding.rounds) {
      funding.rounds = input.funding.rounds;
    }
    if (input.funding.investors) {
      funding.investors = input.funding.investors;
    }
    if (Object.keys(funding).length > 0) {
      patch.funding = funding;
    }
  }

  if (input.team) {
    const team: NonNullable<BlockEnrichmentPatch["team"]> = {};
    if (input.team.founders) {
      team.founders = input.team.founders;
    }
    if (input.team.keyExecs) {
      team.keyExecs = input.team.keyExecs;
    }
    if (input.team.headcount) {
      team.headcount = input.team.headcount;
    }
    if (Object.keys(team).length > 0) {
      patch.team = team;
    }
  }

  if (input.signals) {
    patch.signals = input.signals;
  }
  if (input.comparables) {
    patch.comparables = input.comparables;
  }

  return patch;
}

function rawSlugForRun(input: unknown): string {
  if (typeof input !== "string" || input.trim().length === 0) {
    return "unknown";
  }

  return input.trim().slice(0, 120);
}

function parseEventSectionId(input: unknown): ResearchSectionId | null {
  const parsed = researchSectionIdSchema.safeParse(input);
  return parsed.success ? parsed.data : null;
}

export const generateCardFunction = inngest.createFunction(
  { id: "generate-card" },
  { event: "card/generate.requested" },
  async ({ event, runId, step }) => {
    const runtimeEnv = webEnv();
    const { DATABASE_URL } = runtimeEnv;
    const db = createDb(DATABASE_URL);
    const requestedAtMs = requestedAtMsFromGenerationEvent(event);

    let domain: string;
    let slug: string;
    const mode = generationModeForRun(event.data.mode);
    const requestedSectionId = parseEventSectionId(event.data.sectionId);
    const jobKind: GenerationTrace["jobKind"] = requestedSectionId ? `section:${requestedSectionId}` : mode;
    const trace: GenerationTrace = {
      jobKind,
      mode,
      inngest: {
        ...(typeof event.id === "string" ? { eventId: event.id } : {}),
        ...(typeof runId === "string" ? { runId } : {})
      },
      steps: {}
    };

    try {
      domain = canonicalCompanyDomain(event.data.domain);
      slug = companySlugFromDomain(domain);
    } catch (error) {
      await step.run("mark-invalid-generation", () =>
        markGenerationRun(db, {
          slug: rawSlugForRun(event.data.slug),
          domain: rawDomainForRun(event.data.domain),
          mode,
          jobKind,
          status: "failed",
          error: boundedErrorMessage(error),
          traceJson: {
            ...trace,
            failure: {
              stage: "canonicalize-domain",
              message: boundedErrorMessage(error),
              ...(error instanceof Error ? { className: error.name } : {})
            }
          }
        })
      );
      throw error;
    }

    let generationRunDbId: string | null = null;
    const walletSnapshotBefore = await step.run("wallet-snapshot-before", () => safeAgentcashWalletSnapshot());
    applyStableenrichWalletTrace(trace, walletSnapshotBefore);
    const runningGenerationRun = await step.run("mark-generation-running", () =>
      markGenerationRun(db, {
        slug,
        domain,
        mode,
        jobKind,
        status: "running",
        traceJson: trace,
        ...(trace.inngest?.eventId ? { inngestEventId: trace.inngest.eventId } : {}),
        ...(trace.inngest?.runId ? { inngestRunId: trace.inngest.runId } : {})
      })
    );
    generationRunDbId = runningGenerationRun?.id ?? null;

    let currentStage = "plan-research";
    const eventRunId = () => generationRunDbId ?? trace.inngest?.runId ?? `${slug}:${jobKind}`;
    const recordEvent = (
      name: string,
      type: string,
      message: string,
      metadata: Record<string, unknown> = {},
      sectionId: ResearchSectionId | null = requestedSectionId
    ) =>
      step.run(`event-${name}`, () =>
        recordResearchRunEvent(db, {
          runId: eventRunId(),
          slug,
          domain,
          sectionId,
          type,
          message,
          metadata
        }).catch(() => null)
      );

    let contactEnrichmentRequested = false;
    const requestContactEnrichmentForStoredCard = async (card: ColdStartCard, trigger: string) => {
      if (contactEnrichmentRequested) {
        return;
      }

      if (!contactEnrichmentEnabled(runtimeEnv)) {
        contactEnrichmentRequested = true;
        trace.steps = {
          ...trace.steps,
          "request-contact-enrichment": skippedStep("CONTACT_ENRICHMENT_ENABLED=false")
        };
        return;
      }

      if (!cardHasContactTargets(card, runtimeEnv.CONTACT_ENRICHMENT_TIER)) {
        trace.steps = {
          ...trace.steps,
          "request-contact-enrichment": skippedStep("no named people needing work email yet")
        };
        return;
      }

      await step.sendEvent(
        "request-contact-enrichment",
        buildContactEnrichmentRequestedEvent({
          domain,
          slug,
          requestedAtMs,
          tier: runtimeEnv.CONTACT_ENRICHMENT_TIER,
          parentGenerationRunId: generationRunDbId,
          parentInngestRunId: trace.inngest?.runId ?? null
        })
      );
      contactEnrichmentRequested = true;
      trace.steps = {
        ...trace.steps,
        "request-contact-enrichment": completedStep(0)
      };
      await recordEvent("contact-enrichment-requested", "contacts.requested", "Requested async contact enrichment", {
        tier: runtimeEnv.CONTACT_ENRICHMENT_TIER,
        trigger
      }, null);
    };

    await recordEvent(
      "generation-started",
      requestedSectionId ? "section.started" : "generation.started",
      requestedSectionId
        ? `Started ${RESEARCH_SECTION_DEFINITIONS_BY_ID[requestedSectionId].title}`
        : `Started ${mode === "analysis" ? "investor analysis" : "company profile"}`
    );

    try {
      const anthropic = createAnthropicClient();
      const defaultModel = anthropicModel();
      const extractModel = anthropicModelForStage("extract_full", defaultModel);
      const blockModel = anthropicModelForStage("extract_block", defaultModel);
      const synthesisModel = anthropicModelForStage("synthesis", defaultModel);
      const verifierModel = anthropicModelForStage("verify", defaultModel);
      const costLines: CostLine[] = [];
      const telemetry = (call: GenerationLlmCallTrace) => recordLlmCall(trace, costLines, call);

      if (requestedSectionId) {
        currentStage = "generate-section";
        const sectionResult = await step.run("generate-section", async () => {
          const result = await timed(async () => {
            const existingCardForSection = await findCardBySlug(db, slug, { allowStale: true });
            if (!existingCardForSection || !hasUsablePublicProfile(existingCardForSection)) {
              throw new Error("profile not found");
            }

            const storedSources = await findSourcesBySlug(db, slug);
            const evidence = evidenceForSection(existingCardForSection, storedSources);
            if (evidence.length === 0) {
              return generatedEmptySection(
                existingCardForSection,
                requestedSectionId,
                generationRunDbId
              );
            }

            const content = await synthesizeResearchSection({
              client: anthropic,
              definition: RESEARCH_SECTION_DEFINITIONS_BY_ID[requestedSectionId],
              evidence,
              model: synthesisModel,
              company: {
                domain,
                name: existingCardForSection.identity.name.value ?? domain
              },
              telemetry
            });

            return sectionFromGeneratedContent(
              existingCardForSection,
              requestedSectionId,
              content,
              generationRunDbId
            );
          });

          return {
            value: result.value,
            tracePatch: {
              steps: {
                "generate-section": completedStep(result.durationMs)
              }
            }
          };
        });
        mergeTracePatch(trace, sectionResult.tracePatch);

        await step.run("upsert-generated-section", () => upsertResearchSection(db, sectionResult.value));
        await recordEvent(
          "section-saved",
          sectionResult.value.status === "available" ? "section.available" : "section.empty",
          sectionResult.value.status === "available"
            ? `Saved ${RESEARCH_SECTION_DEFINITIONS_BY_ID[requestedSectionId].title}`
            : `No strong evidence found for ${RESEARCH_SECTION_DEFINITIONS_BY_ID[requestedSectionId].title}`,
          {
            citationCount: sectionResult.value.citationIds.length,
            sourceCount: sectionResult.value.sourceIds.length,
            status: sectionResult.value.status
          },
          requestedSectionId
        );
        await step.run("mark-section-generation-complete", () =>
          markGenerationRun(db, {
            slug,
            domain,
            mode,
            jobKind,
            status: "complete",
            costUsd: totalGenerationCost(costLines),
            traceJson: trace,
            ...(trace.inngest?.eventId ? { inngestEventId: trace.inngest.eventId } : {}),
            ...(trace.inngest?.runId ? { inngestRunId: trace.inngest.runId } : {})
          })
        );

        return { slug, mode, sectionId: requestedSectionId };
      }

      const stableEnv = stableenrichEnvFromProcess();
      const directExaEnv = directExaEnvFromProcess();
      const agentcashBudgetCeiling = agentcashBudgetCeilingUsd({
        mode,
        override: runtimeEnv.PER_RUN_AGENTCASH_BUDGET_USD
      });
      const researchPlanResult = await step.run("plan-research", async () => {
        const result = await timed(async () => fallbackResearchPlan(domain));
        return {
          value: result.value,
          tracePatch: {
            steps: {
              "plan-research": completedStep(result.durationMs)
            }
          }
        };
      });
      mergeTracePatch(trace, researchPlanResult.tracePatch);
      const researchPlan = researchPlanResult.value;
      await recordEvent("research-plan-ready", "plan.ready", "Research plan ready", {
        queryCount: Object.keys(researchPlan.searchQueries).length
      }, null);
      const existingCard = await step.run("load-existing-card", () => findCardBySlug(db, slug, { allowStale: true }));
      const reuseExistingForAnalysis = mode === "analysis" && existingCard !== null && hasInvestorUsableProfile(existingCard);

      currentStage = "fetch-sources";
      const sourceResult = await step.run("fetch-sources", async () => {
        const result = await timed(async () => {
          let stableSkipProbeNames: StableenrichProbeName[] = [];
          const directPromise = directExaEnabled()
            ? fetchDirectExaFundamentalsSources({ env: directExaEnv, domain })
            : Promise.resolve({ sources: [], failures: [], skipped: true });
          let directResult: PromiseSettledResult<Awaited<ReturnType<typeof fetchDirectExaFundamentalsSources>>>;
          let stableResult: PromiseSettledResult<Awaited<ReturnType<typeof fetchStableenrichFastSources>>>;

          if (runtimeEnv.CHEAP_FIRST_EXA_ENABLED) {
            directResult = await Promise.resolve(directPromise).then(
              (value) => ({ status: "fulfilled" as const, value }),
              (reason) => ({ status: "rejected" as const, reason })
            );
            const directSourcesForCoverage = directResult.status === "fulfilled" ? directResult.value.sources : [];
            stableSkipProbeNames = stableenrichExaSkipsForDirectCoverage({ directSources: directSourcesForCoverage, domain });
            stableResult = await (
              mode === "basics"
                ? fetchStableenrichFastSources({
                    env: stableEnv,
                    domain,
                    researchPlan,
                    skipProbeNames: stableSkipProbeNames,
                    maxBudgetUsd: agentcashBudgetCeiling
                  })
                : fetchStableenrichSources({
                    env: stableEnv,
                    domain,
                    researchPlan,
                    skipProbeNames: stableSkipProbeNames,
                    maxBudgetUsd: agentcashBudgetCeiling
                  })
            ).then(
              (value) => ({ status: "fulfilled" as const, value }),
              (reason) => ({ status: "rejected" as const, reason })
            );
          } else {
            [directResult, stableResult] = await Promise.allSettled([
              directPromise,
              mode === "basics"
                ? fetchStableenrichFastSources({ env: stableEnv, domain, researchPlan, maxBudgetUsd: agentcashBudgetCeiling })
                : fetchStableenrichSources({ env: stableEnv, domain, researchPlan, maxBudgetUsd: agentcashBudgetCeiling }),
            ]);
          }

          const directSources = directResult.status === "fulfilled" ? directResult.value.sources : [];
          const stableSources = stableResult.status === "fulfilled" ? stableResult.value.sources : [];
          const stableFacts = stableResult.status === "fulfilled" ? stableResult.value.facts : [];
          const sources = mergeSources(directSources, stableSources);
          const sourceGate = filterSourcesForDomain({ domain, sources });
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
                failureCount: directResult.status === "fulfilled" ? directResult.value.failures.length : 1
              },
              stableenrich: {
                sourceCount: stableSources.length,
                factCount: stableFacts.length,
                failureCount: stableResult.status === "fulfilled" ? stableResult.value.failures.length : 1,
                ...(stableResult.status === "fulfilled" && stableResult.value.budgetCeilingHit ? { budgetCeilingHit: true } : {}),
                ...(stableSkipProbeNames.length > 0 ? { skippedProbeNames: stableSkipProbeNames } : {}),
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
              sources: [] as ProviderSource[],
              providerFacts: stableFacts as ProviderFactCandidate[],
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
              sources: [] as ProviderSource[],
              providerFacts: stableFacts as ProviderFactCandidate[],
              failureCount: failures.length,
              trace: sourceTrace,
              error: `No accepted provider sources returned; fetched: ${sources.length}; rejected: ${sourceGate.rejected.length}; failures: ${failures.length}${details ? `; ${details}` : ""}`
            };
          }

          return {
            sources: sourceGate.accepted,
            providerFacts: stableFacts as ProviderFactCandidate[],
            failureCount: failures.length,
            trace: sourceTrace,
            error: null
          };
        });
        return {
          value: result.value,
          tracePatch: {
            steps: {
              "fetch-sources": completedStep(result.durationMs)
            },
            providers: result.value.trace.providers,
            sourceGate: result.value.trace.sourceGate
          }
        };
      });
      mergeTracePatch(trace, sourceResult.tracePatch);
      await recordEvent("sources-fetched", "source.found", `Found ${sourceResult.value.sources.length} accepted sources`, {
        acceptedCount: sourceResult.value.sources.length,
        rejectedCount: sourceResult.value.trace.sourceGate.rejectedCount,
        directExaCount: sourceResult.value.trace.providers.directExa.sourceCount,
        stableenrichCount: sourceResult.value.trace.providers.stableenrich.sourceCount
      }, null);

      // Failure count is tracked for observability, but not converted into cost until live costs are measured.
      void sourceResult.value.failureCount;
      if (sourceResult.value.error) {
        throw new Error(sourceResult.value.error);
      }
      const acceptedSources = sourceResult.value.sources.filter(Boolean) as ProviderSource[];
      const providerFacts = sourceResult.value.providerFacts.filter(Boolean) as ProviderFactCandidate[];
      let seedCard: ColdStartCard | null = null;

      if (mode === "basics") {
        currentStage = "seed-profile-card";
        const seedProfileResult = await step.run("seed-profile-card", async () => {
          const result = await timed(() =>
            buildSeedProfileCard({
              domain,
              sources: acceptedSources,
              providerFacts
            })
          );
          return {
            value: result.value,
            tracePatch: {
              steps: {
                "seed-profile-card": {
                  ...completedStep(result.durationMs),
                  message: `${result.value.trace.providerFactAppliedCount} provider facts, ${result.value.trace.fallbackFields.length} fallback fields`
                }
              },
              extraction: {
                sourceCount: acceptedSources.length,
                evidenceCount: 0,
                citationCount: result.value.trace.citationCount,
                fallbackUsed: result.value.trace.fallbackFields.length > 0,
                providerFactCandidateCount: result.value.trace.providerFactCandidateCount,
                providerFactAppliedCount: result.value.trace.providerFactAppliedCount,
                providerFactPaths: result.value.trace.providerFactPaths,
                providerFactAppliedByEndpoint: result.value.trace.providerFactAppliedByEndpoint
              }
            }
          };
        });
        mergeTracePatch(trace, seedProfileResult.tracePatch);
        applyStableenrichEndpointYield(trace, seedProfileResult.value.trace.providerFactAppliedByEndpoint);
        seedCard = seedProfileResult.value.card;

        const seedCardToStore = prepareCardSnapshotForStorage(mode, existingCard, seedCard);
        if (canStoreCardSnapshot(mode, seedCardToStore)) {
          const seedStore = await step.run("upsert-seed-card", async () => ({
            row: await upsertCard(db, seedCardToStore),
            milestoneMs: generationMilestoneElapsedMs(requestedAtMs)
          }));
          const seedRow = seedStore.row;
          await step.run("record-seed-card-evidence", () => recordCardEvidence(db, seedRow.id, seedCardToStore));
          await step.run("record-seed-research-sections", () => upsertResearchSections(db, deriveLegacyResearchSectionsFromCard(seedCardToStore)));
          await step.run("record-seed-sources", () => recordSourcesForCard(db, seedRow.id, acceptedSources));
          await recordEvent("seed-card-saved", "card.partial", "Saved first usable company card", {
            citationCount: seedCardToStore.citations.length,
            sourceCount: acceptedSources.length
          }, null);
          writeGenerationMilestoneValue(trace, "seedCardMs", seedStore.milestoneMs);
          writeGenerationMilestoneValue(trace, "firstUsableCardMs", seedStore.milestoneMs);
          await requestContactEnrichmentForStoredCard(seedCardToStore, "seed-card");
        } else {
          noteSkippedUnderfilledSnapshot(trace, "skip-underfilled-seed-card", seedCardToStore);
        }
      }

      const extractSectionsForCard = async ({ domain: candidateDomain, sources, evidenceLedger }: {
        domain: string;
        sources: ProviderSource[];
        evidenceLedger: EvidenceLedgerEntry[];
      }): Promise<ExtractedCardSections> => {
        if (reuseExistingForAnalysis && existingCard) {
          return extractedCardSectionsSchema.parse(sectionsWithSourceCitations(existingCard, sources));
        }

        return extractCompanyClaims({
          client: anthropic,
          model: extractModel,
          evidence: { domain: candidateDomain, researchPlan, sources, evidenceLedger },
          telemetry,
        });
      };
      const enrichSectionsForCard = async ({ block, domain: candidateDomain, sources, evidenceLedger, currentSections }: {
        block: Parameters<typeof extractCompanyBlockClaims>[0]["block"];
        domain: string;
        sources: ProviderSource[];
        evidenceLedger: EvidenceLedgerEntry[];
        currentSections: ExtractedCardSections;
      }) =>
        pipelineBlockPatch(
          await extractCompanyBlockClaims({
            client: anthropic,
            model: blockModel,
            block,
            evidence: {
              domain: candidateDomain,
              researchPlan,
              sources,
              evidenceLedger,
              currentSections,
            },
            telemetry,
          })
        );
      const runCardAttempt = async (options: {
        skipBlockEnrichment?: boolean;
        sources?: ProviderSource[];
        providerFacts?: ProviderFactCandidate[];
      } = {}) => {
        try {
          const generated = await generateCardForDomainWithTrace(domain, {
            researchPlan,
            providerFacts: options.providerFacts ?? providerFacts,
            ...(options.skipBlockEnrichment !== undefined ? { skipBlockEnrichment: options.skipBlockEnrichment } : {}),
            fetchSources: async () => options.sources ?? acceptedSources,
            extractSections: extractSectionsForCard,
            enrichSections: enrichSectionsForCard,
            costLines,
            ...(mode === "analysis"
              ? {
                  synthesize: async (card: ColdStartCard) => synthesizeCard({ client: anthropic, model: synthesisModel, card, telemetry }),
                  verify: async (claims, sources) => verifySynthesis({ client: anthropic, model: verifierModel, claims, sources, telemetry }),
                  synthesisRequired: true,
                }
              : {}),
          });

          return {
            ok: true as const,
            card: generated.card,
            sections: generated.sections,
            sources: generated.sources,
            tracePatch: generated.tracePatch
          };
        } catch (error) {
          return {
            ok: false as const,
            error: boundedErrorMessage(error),
            tracePatch: generateErrorTracePatch(error)
          };
        }
      };

      currentStage = "generate-card";
      const clean = await step.run("generate-card", async () => {
        const result = await timed(() =>
          runCardAttempt({ skipBlockEnrichment: mode === "basics" || reuseExistingForAnalysis })
        );
        return {
          value: result.value,
          tracePatch: {
            ...result.value.tracePatch,
            steps: {
              "generate-card": completedStep(result.durationMs)
            }
          }
        };
      });
      mergeTracePatch(trace, clean.tracePatch);
      applyStableenrichEndpointYield(trace, clean.tracePatch.extraction?.providerFactAppliedByEndpoint);

      if (!clean.value.ok) {
        throw new Error(clean.value.error);
      }

      let generatedCard: ColdStartCard = clean.value.card;
      let generatedSections = clean.value.sections;
      let sourcesToRecord = clean.value.sources;

      let cardToStore = prepareCardSnapshotForStorage(mode, existingCard, generatedCard);
      let analysisReadyMs: number | null = null;

      if (canStoreCardSnapshot(mode, cardToStore)) {
        const stored = await step.run("upsert-card", async () => ({
          row: await upsertCard(db, cardToStore),
          milestoneMs: generationMilestoneElapsedMs(requestedAtMs)
        }));
        const storedRow = stored.row;
        await step.run("record-card-evidence", () => recordCardEvidence(db, storedRow.id, cardToStore));
        await step.run("record-research-sections", () => upsertResearchSections(db, deriveLegacyResearchSectionsFromCard(cardToStore)));
        await step.run("record-sources", () =>
          recordSourcesForCard(db, storedRow.id, sourcesToRecord),
        );
        await recordEvent("card-saved", "card.saved", "Saved cited company card", {
          citationCount: cardToStore.citations.length,
          sourceCount: sourcesToRecord.length
        }, null);
        if (mode === "basics") {
          writeGenerationMilestoneValue(trace, "firstUsableCardMs", stored.milestoneMs);
          await requestContactEnrichmentForStoredCard(cardToStore, "stored-card");
        } else {
          analysisReadyMs = stored.milestoneMs;
        }
      } else {
        noteSkippedUnderfilledSnapshot(trace, "skip-underfilled-generated-card", cardToStore);
      }

      if (mode === "basics") {
        currentStage = "fetch-enrichment-sources";
        const enrichmentSourceResult = await step.run("fetch-enrichment-sources", async () => {
          const result = await timed(async () => {
            const remainingBudgetUsd = remainingAgentcashBudgetUsd({
              ceilingUsd: agentcashBudgetCeiling,
              endpoints: trace.providers?.stableenrich?.endpoints
            });
            const stableResult = await fetchStableenrichEnrichmentSources({
              env: stableEnv,
              domain,
              researchPlan,
              maxBudgetUsd: remainingBudgetUsd
            });
            const sources = mergeSources(acceptedSources, stableResult.sources);
            const sourceGate = filterSourcesForDomain({ domain, sources });
            const initialStable = trace.providers?.stableenrich ?? sourceResult.value.trace.providers.stableenrich;
            return {
              sources: sourceGate.accepted,
              providerFacts: stableResult.facts,
              trace: {
                providers: {
                  ...sourceResult.value.trace.providers,
                  stableenrich: {
                    sourceCount: (initialStable?.sourceCount ?? 0) + stableResult.sources.length,
                    factCount: (initialStable?.factCount ?? 0) + stableResult.facts.length,
                    failureCount: (initialStable?.failureCount ?? 0) + stableResult.failures.length,
                    ...(initialStable?.budgetCeilingHit || stableResult.budgetCeilingHit ? { budgetCeilingHit: true } : {}),
                    endpoints: [...(initialStable?.endpoints ?? []), ...withStableenrichEndpointBudgets(stableResult.endpoints)]
                  },
                  mergedSourceCount: sources.length
                },
                sourceGate: sourceGateTrace(sourceGate)
              }
            };
          });

          return {
            value: result.value,
            tracePatch: {
              steps: {
                "fetch-enrichment-sources": completedStep(result.durationMs)
              },
              providers: result.value.trace.providers,
              sourceGate: result.value.trace.sourceGate
            }
          };
        });
        mergeTracePatch(trace, enrichmentSourceResult.tracePatch);
        await recordEvent("enrichment-sources-fetched", "source.enrichment", `Checked deeper enrichment sources`, {
          sourceCount: enrichmentSourceResult.value.sources.length,
          providerFactCount: enrichmentSourceResult.value.providerFacts.length
        }, null);

        currentStage = "enrich-card";
        const enriched = await step.run("enrich-card", async () => {
          const result = await timed(async () => {
            const providerFactMerge = applyProviderFactCandidates(generatedSections, enrichmentSourceResult.value.providerFacts);
            return enrichExtractedSectionsForDomain({
              domain,
              researchPlan,
              sections: providerFactMerge.sections,
              sources: enrichmentSourceResult.value.sources,
              enrichSections: enrichSectionsForCard
            }).then((enrichment) => ({ ...enrichment, providerFactMerge }));
          });

          return {
            value: result.value,
            tracePatch: {
              steps: {
                "enrich-card": completedStep(result.durationMs)
              }
            }
          };
        });
        mergeTracePatch(trace, enriched.tracePatch);

        generatedSections = enriched.value.sections;
        generatedCard = cardWithExtractedSections(generatedCard, generatedSections);
        sourcesToRecord = enrichmentSourceResult.value.sources;
        if (trace.extraction) {
          trace.extraction = {
            ...trace.extraction,
            sourceCount: sourcesToRecord.length,
            citationCount: generatedSections.citations.length,
            providerFactCandidateCount:
              (trace.extraction.providerFactCandidateCount ?? 0) + enriched.value.providerFactMerge.trace.candidateCount,
            providerFactAppliedCount:
              (trace.extraction.providerFactAppliedCount ?? 0) + enriched.value.providerFactMerge.trace.appliedCount,
            providerFactPaths: [
              ...(trace.extraction.providerFactPaths ?? []),
              ...enriched.value.providerFactMerge.trace.paths
            ],
            providerFactAppliedByEndpoint: mergeEndpointFactCounts(
              trace.extraction.providerFactAppliedByEndpoint,
              enriched.value.providerFactMerge.trace.appliedByEndpoint
            ),
            ...(enriched.value.trace ? { blockEnrichment: enriched.value.trace } : {})
          };
        }
        applyStableenrichEndpointYield(trace, enriched.value.providerFactMerge.trace.appliedByEndpoint);

        cardToStore = prepareCardForStorage(mode, existingCard, generatedCard);
        assertTerminalCardQuality(mode, cardToStore);
        const stored = await step.run("upsert-enriched-card", async () => ({
          row: await upsertCard(db, cardToStore),
          milestoneMs: generationMilestoneElapsedMs(requestedAtMs)
        }));
        const storedRow = stored.row;
        await step.run("record-enriched-card-evidence", () => recordCardEvidence(db, storedRow.id, cardToStore));
        await step.run("record-enriched-research-sections", () => upsertResearchSections(db, deriveLegacyResearchSectionsFromCard(cardToStore)));
        await step.run("record-enriched-sources", () =>
          recordSourcesForCard(db, storedRow.id, sourcesToRecord),
        );
        await recordEvent("enriched-card-saved", "card.enriched", "Saved enriched company card", {
          citationCount: cardToStore.citations.length,
          sourceCount: sourcesToRecord.length
        }, null);
        await requestContactEnrichmentForStoredCard(cardToStore, "enriched-card");
        writeGenerationMilestoneValue(trace, "firstUsableCardMs", stored.milestoneMs);
      }

      if (mode === "analysis" && analysisReadyMs !== null) {
        writeGenerationMilestoneValue(trace, "analysisReadyMs", analysisReadyMs);
      }

      const walletSnapshotAfter = await step.run("wallet-snapshot-after", () => safeAgentcashWalletSnapshot());
      applyStableenrichWalletTrace(trace, walletSnapshotBefore, walletSnapshotAfter);
      if (generationRunDbId) {
        await step.run("persist-generation-trace-before-complete", () =>
          updateGenerationRunTrace(db, {
            id: generationRunDbId,
            patch: (existingTrace) => mergeGenerationTrace(existingTrace, trace)
          })
        );
      }
      await step.run("mark-generation-complete", () =>
        markGenerationRun(db, {
          slug,
          domain,
          mode,
          jobKind,
          status: "complete",
          costUsd: cardToStore.generationCostUsd,
          ...(generationRunDbId ? {} : { traceJson: trace }),
          ...(trace.inngest?.eventId ? { inngestEventId: trace.inngest.eventId } : {}),
          ...(trace.inngest?.runId ? { inngestRunId: trace.inngest.runId } : {})
        })
      );
      await recordEvent("generation-complete", "generation.complete", "Research run complete", {
        costUsd: cardToStore.generationCostUsd,
        mode
      }, null);

      return { slug: cardToStore.slug, mode };
    } catch (error) {
      trace.failure = {
        stage: currentStage,
        message: boundedErrorMessage(error),
        ...(error instanceof Error ? { className: error.name } : {})
      };
      const walletSnapshotAfter = await step.run("wallet-snapshot-after", () => safeAgentcashWalletSnapshot());
      applyStableenrichWalletTrace(trace, walletSnapshotBefore, walletSnapshotAfter);
      if (generationRunDbId) {
        await step.run("persist-generation-trace-before-fail", () =>
          updateGenerationRunTrace(db, {
            id: generationRunDbId,
            patch: (existingTrace) => mergeGenerationTrace(existingTrace, trace)
          })
        );
      }
      await step.run("mark-generation-failed", () =>
        markGenerationRun(db, {
          slug,
          domain,
          mode,
          jobKind,
          status: "failed",
          error: boundedErrorMessage(error),
          ...(generationRunDbId ? {} : { traceJson: trace }),
          ...(trace.inngest?.eventId ? { inngestEventId: trace.inngest.eventId } : {}),
          ...(trace.inngest?.runId ? { inngestRunId: trace.inngest.runId } : {})
        })
      );
      await step.run("mark-research-sections-failed", () =>
        Promise.all(
          (requestedSectionId
            ? [requestedSectionId]
            : mode === "analysis" ? GATED_RESEARCH_SECTION_IDS : PUBLIC_RESEARCH_SECTION_IDS
          ).map((sectionId) =>
            markResearchSectionFailed(db, {
              slug,
              domain,
              sectionId,
              visibility: mode === "analysis" ? "gated" : "public",
              error: boundedErrorMessage(error),
              runId: generationRunDbId
            })
          )
        )
      );
      await recordEvent("generation-failed", requestedSectionId ? "section.failed" : "generation.failed", boundedErrorMessage(error), {
        stage: currentStage
      });
      throw error;
    }
  },
);
