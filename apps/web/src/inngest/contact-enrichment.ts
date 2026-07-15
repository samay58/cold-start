import {
  companySlugFromDomain,
  deriveLegacyResearchSectionsFromCard,
  type ColdStartCard,
  type GenerationLlmCallTrace,
  type GenerationTrace
} from "@cold-start/core";
import {
  createDb,
  findCardBySlug,
  findGenerationRunById,
  findSourcesBySlug,
  recordCardEvidence,
  recordResearchRunEvent,
  updateGenerationRunTrace,
  upsertCard,
  upsertResearchSections
} from "@cold-start/db";
import {
  anthropicModel,
  createAnthropicClient,
  modelForStage,
  synthesizePersonReads,
  type AnthropicTelemetrySink
} from "@cold-start/llm";
import {
  applyProviderFactCandidates,
  attachPersonReads,
  buildEmailPatternContactFacts,
  buildGithubContactFacts,
  buildPersonReadEvidence,
  cardWithExtractedSections,
  extractedCardSectionsSchema,
  filterSourcesForDomain,
  sourceGateTrace,
  type CostLine,
  type ExtractedCardSections
} from "@cold-start/pipeline";
import {
  agentcashWalletSnapshot,
  createPeopleEmailWebset,
  fetchDirectExaContactSources,
  fetchGithubContacts,
  fetchStableenrichEmailPatternSources,
  fetchStableenrichPeopleEmailSources,
  isGithubContactsResult,
  pollPeopleEmailWebset,
  type DirectExaEnv,
  type PeopleEmailHint,
  type ProviderFactCandidate,
  type ProviderSource,
  type StableenrichEnv,
  type WebsetsPeopleEmailResult
} from "@cold-start/providers";

import { canonicalCompanyDomain } from "../lib/domain";
import { webEnv } from "../lib/env";
import { boundedErrorMessage } from "../lib/errors";
import {
  canStoreCardSnapshot,
  noteSkippedUnderfilledSnapshot,
  prepareCardSnapshotForStorage
} from "./card-storage";
import { inngest } from "./client";
import {
  backgroundConcurrencyLimit,
  contactEnrichmentEnabled,
  directExaEnabled,
  directExaEnvFromProcess,
  githubTokenFromProcess,
  personReadsEnabled,
  stableenrichEnvFromProcess,
  websetsEnvFromProcess,
  type ContactEnrichmentTier
} from "./env";
import {
  completedStep,
  applyStableenrichWalletTrace,
  generationMilestoneElapsedMs,
  llmTracePatchFromCalls,
  mergeContactEnrichmentTrace,
  mergeTracePatch,
  requestedAtMsFromGenerationEvent,
  skippedStep,
  writeGenerationMilestoneValue,
  type ProviderTrace
} from "./generation-trace";
import {
  agentcashBudgetCeilingUsd,
  applyStableenrichEndpointYield,
  failedStableenrichEndpoint,
  remainingAgentcashBudgetUsd,
  withStableenrichEndpointBudgets
} from "./provider-trace";
import {
  mergeSources,
  providerSourcesFromStoredSources,
  recordSourcesForCard,
  sectionsWithSourceCitations
} from "./source-fetching";

const CONTACT_ENRICHMENT_EVENT_NAME = "card/contact-enrichment.requested" as const;

type TimedResult<T> = { durationMs: number; value: T };

export function buildContactEnrichmentRequestedEvent(input: {
  domain: string;
  slug: string;
  requestedAtMs: number;
  tier: ContactEnrichmentTier;
  parentGenerationRunId?: string | null;
  parentInngestRunId?: string | null;
  // Default path (false) runs only the free GitHub reachability layer. deepFind=true
  // additionally spends the paid provider path (Websets + StableEnrich email probes)
  // to fill the ~26% of companies the free layer misses. See
  // docs/product/contact-enrichment-yield-and-design-2026-07-01.md.
  deepFind?: boolean;
}) {
  return {
    name: CONTACT_ENRICHMENT_EVENT_NAME,
    data: {
      domain: input.domain,
      slug: input.slug,
      requestedAtMs: input.requestedAtMs,
      tier: input.tier,
      ...(input.deepFind ? { deepFind: true } : {}),
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

function costLineForLlmCall(call: GenerationLlmCallTrace): CostLine | null {
  if (call.estimatedCostUsd !== undefined && call.estimatedCostUsd > 0) {
    return { label: `anthropic:${call.stage}:${call.label}:${call.model}`, usd: call.estimatedCostUsd };
  }
  return null;
}

function createStepLlmTelemetryCollector() {
  const calls: GenerationLlmCallTrace[] = [];
  const costLines: CostLine[] = [];
  const telemetry: AnthropicTelemetrySink = (call) => {
    calls.push(call);
    const costLine = costLineForLlmCall(call);
    if (costLine) {
      costLines.push(costLine);
    }
  };
  return { telemetry, costLines, tracePatch: () => llmTracePatchFromCalls(calls) };
}

function rawSlugForRun(input: unknown, domainInput?: unknown): string {
  if (typeof input !== "string" || input.trim().length === 0) {
    if (typeof domainInput === "string" && domainInput.trim().length > 0) {
      try {
        return companySlugFromDomain(canonicalCompanyDomain(domainInput)).slice(0, 120);
      } catch {
        return "unknown";
      }
    }

    return "unknown";
  }

  return input.trim().slice(0, 120);
}

function stringValue(input: unknown): string | null {
  return typeof input === "string" && input.trim().length > 0 ? input.trim() : null;
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

type CardPerson = NonNullable<ColdStartCard["team"]["founders"]["value"]>[number];

function peopleFromSections(sections: ExtractedCardSections): CardPerson[] {
  return [...(sections.team.founders.value ?? []), ...(sections.team.keyExecs.value ?? [])];
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

export function cardHasContactTargets(card: ColdStartCard, tier: ContactEnrichmentTier) {
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

export function emailPatternFallbackDecision(input: {
  contactEnrichmentEnabled: boolean;
  fallbackEnabled: boolean;
  githubPattern: string | null;
  githubObservedCount: number;
  hasNamedPersonWithoutEmail: boolean;
  remainingBudgetUsd: number;
}): { eligible: true } | { eligible: false; reason: string } {
  if (!input.contactEnrichmentEnabled) return { eligible: false, reason: "contact enrichment disabled" };
  if (!input.fallbackEnabled) return { eligible: false, reason: "EMAIL_PATTERN_FALLBACK_ENABLED=false" };
  if (input.githubPattern) return { eligible: false, reason: "GitHub pattern available" };
  if (input.githubObservedCount > 0) return { eligible: false, reason: "GitHub observed address available" };
  if (!input.hasNamedPersonWithoutEmail) return { eligible: false, reason: "no named person missing an email" };
  if (input.remainingBudgetUsd < 0.01) return { eligible: false, reason: "AgentCash budget below $0.01" };
  return { eligible: true };
}

async function safeAgentcashWalletSnapshot() {
  try {
    return { ok: true as const, snapshot: await agentcashWalletSnapshot() };
  } catch (error) {
    return { ok: false as const, error: boundedErrorMessage(error) };
  }
}

async function fetchContactSourcesForBasics(input: {
  acceptedSources: ProviderSource[];
  directExaEnv: DirectExaEnv;
  domain: string;
  initialProviders: ProviderTrace;
  maxStableenrichBudgetUsd?: number | undefined;
  peopleHints: PeopleEmailHint[];
  stableEnv: StableenrichEnv;
  // True when the caller runs the webset lifecycle (create early, poll durably). It suppresses
  // the StableEnrich email probes; websets results merge in after the durable poll.
  websetsOwnsEmailPath: boolean;
}) {
  const [directContactResult, stableContactResult] = await Promise.allSettled([
    directExaEnabled()
      ? fetchDirectExaContactSources({ env: input.directExaEnv, domain: input.domain, peopleHints: input.peopleHints })
      : Promise.resolve({ sources: [], facts: [], failures: [], skipped: true, requestCount: 0, estimatedCostUsd: 0 }),
    input.websetsOwnsEmailPath
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
  ]);
  const directContactSources = directContactResult.status === "fulfilled" ? directContactResult.value.sources : [];
  const directContactFacts = directContactResult.status === "fulfilled" ? directContactResult.value.facts : [];
  const directContactFailureCount = directContactResult.status === "fulfilled" ? directContactResult.value.failures.length : 1;
  const stableContactSources = stableContactResult.status === "fulfilled" ? stableContactResult.value.sources : [];
  const stableContactFacts = stableContactResult.status === "fulfilled" ? stableContactResult.value.facts : [];
  const stableContactFailures = stableContactResult.status === "fulfilled"
    ? stableContactResult.value.failures
    : [{ name: "stableenrich" as const, endpointUrl: "stableenrich", error: boundedErrorMessage(stableContactResult.reason) }];
  const stableContactEndpoints = stableContactResult.status === "fulfilled"
    ? withStableenrichEndpointBudgets(stableContactResult.value.endpoints)
    : [failedStableenrichEndpoint(stableContactResult.reason)];
  const sources = mergeSources(input.acceptedSources, directContactSources, stableContactSources);
  const sourceGate = filterSourcesForDomain({ domain: input.domain, sources });
  const initialDirectExa = input.initialProviders.directExa ?? { skipped: true, sourceCount: 0, failureCount: 0 };
  const directContactRequestCount = directContactResult.status === "fulfilled" ? directContactResult.value.requestCount ?? 0 : 0;
  const directContactCostUsd = directContactResult.status === "fulfilled" ? directContactResult.value.estimatedCostUsd ?? 0 : 0;
  const initialStable = input.initialProviders.stableenrich;
  const stableEmailDiscovery = stableContactResult.status === "fulfilled"
    ? stableContactResult.value.emailDiscovery ?? []
    : [];

  return {
    sources: sourceGate.accepted,
    providerFacts: [...stableContactFacts, ...directContactFacts],
    trace: {
      providers: {
        ...input.initialProviders,
        directExa: {
          skipped: initialDirectExa.skipped && (directContactResult.status === "fulfilled" ? directContactResult.value.skipped : false),
          sourceCount: initialDirectExa.sourceCount + directContactSources.length,
          failureCount: initialDirectExa.failureCount + directContactFailureCount,
          requestCount: (initialDirectExa.requestCount ?? 0) + directContactRequestCount,
          estimatedCostUsd: Number(((initialDirectExa.estimatedCostUsd ?? 0) + directContactCostUsd).toFixed(4))
        },
        stableenrich: {
          sourceCount: (initialStable?.sourceCount ?? 0) + stableContactSources.length,
          factCount: (initialStable?.factCount ?? 0) + stableContactFacts.length,
          failureCount: (initialStable?.failureCount ?? 0) + stableContactFailures.length,
          endpoints: [...(initialStable?.endpoints ?? []), ...stableContactEndpoints],
          ...(stableContactResult.status === "fulfilled" && stableContactResult.value.budgetCeilingHit ? { budgetCeilingHit: true } : {})
        },
        // The durable websets poll in contactEnrichmentFunction overwrites this node when the
        // websets path is active; here it only marks that no inline fetch happened.
        websets: { skipped: true, sourceCount: 0, factCount: 0, failureCount: 0 },
        mergedSourceCount: sources.length,
        ...(stableEmailDiscovery.length > 0 ? { emailDiscovery: stableEmailDiscovery } : {})
      },
      sourceGate: sourceGateTrace(sourceGate)
    }
  };
}

const contactEnrichmentConcurrency = backgroundConcurrencyLimit("INNGEST_CONTACT_ENRICHMENT_CONCURRENCY");

export const contactEnrichmentFunction = inngest.createFunction(
  {
    id: "contact-enrichment",
    ...(contactEnrichmentConcurrency ? { concurrency: { limit: contactEnrichmentConcurrency } } : {})
  },
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
      const parentGenerationRun = parentGenerationRunId
        ? await step.run("load-parent-generation-run", () => findGenerationRunById(db, parentGenerationRunId))
        : null;
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
      const websetsExternalId = `cold-start-contact-${slug}-${parentGenerationRunId ?? trace.inngest?.runId ?? requestedAtMs}`;
      // Paid contact providers (Websets + StableEnrich email probes) only run on an explicit
      // deep-find request. The standard basics path uses the free GitHub reachability layer only.
      const deepFind = event.data.deepFind === true;
      const websetsOwnsEmailPath = deepFind && runtimeEnv.EXA_WEBSETS_CONTACTS_ENABLED && Boolean(websetsEnv.EXA_WEBSETS_API_KEY?.trim());

      // Free layer, always first: harvest public @company-domain commit emails, attach them to
      // extracted people by name, and infer the rest from the domain pattern. Costs nothing.
      currentStage = "github-contacts";
      const githubStep = await step.run("github-contacts", async () => {
        const companyName = baseSections.identity.name.value ?? domain;
        const githubToken = githubTokenFromProcess();
        const result = await fetchGithubContacts({ domain, companyName, ...(githubToken ? { token: githubToken } : {}) });
        if (!isGithubContactsResult(result)) {
          return {
            facts: [] as ProviderFactCandidate[],
            sources: [] as ProviderSource[],
            observed: [],
            pattern: null,
            patternAnchorCount: 0,
            tracePatch: {
              providers: {
                github: { org: result.trace.org, reposChecked: result.trace.reposChecked, observedCount: 0, inferredCount: 0, pattern: null, requestCount: result.trace.requestCount, estimatedCostUsd: 0 as const }
              }
            }
          };
        }
        const facts = buildGithubContactFacts({
          domain,
          founders: baseSections.team.founders.value ?? [],
          keyExecs: baseSections.team.keyExecs.value ?? [],
          observed: result.observed,
          pattern: result.pattern,
          patternAnchorCount: result.patternAnchorCount,
          orgUrl: `https://github.com/${result.org}`,
          fetchedAt: new Date().toISOString()
        });
        const observedCount = facts.filter((fact) => Array.isArray(fact.value) && (fact.value[0] as { emailStatus?: string })?.emailStatus === "observed").length;
        return {
          facts,
          sources: result.sources,
          observed: result.observed,
          pattern: result.pattern,
          patternAnchorCount: result.patternAnchorCount,
          tracePatch: {
            providers: {
              github: {
                org: result.org,
                reposChecked: result.trace.reposChecked,
                observedCount,
                inferredCount: facts.length - observedCount,
                pattern: result.pattern,
                patternAnchorCount: result.patternAnchorCount,
                requestCount: result.trace.requestCount,
                estimatedCostUsd: 0 as const
              }
            }
          }
        };
      });
      mergeTracePatch(trace, githubStep.tracePatch);
      const githubFacts = githubStep.facts;
      const githubSources = githubStep.sources;
      await recordEvent("github-contacts", "source.contacts", "Checked public GitHub commit emails", {
        observedCount: githubStep.tracePatch.providers.github.observedCount,
        inferredCount: githubStep.tracePatch.providers.github.inferredCount
      });

      let paidProviderFacts: ProviderFactCandidate[] = [];
      let paidSources: ProviderSource[] = [];
      const agentcashBudgetUsd = agentcashBudgetCeilingUsd({
        mode: "basics",
        override: runtimeEnv.PER_RUN_AGENTCASH_BUDGET_USD
      });
      const parentStableenrichEndpoints = parentGenerationRun?.traceJson?.providers?.stableenrich?.endpoints;
      const fallbackBudgetRemainingUsd = remainingAgentcashBudgetUsd({
        ceilingUsd: agentcashBudgetUsd,
        endpoints: parentStableenrichEndpoints
      });
      const fallbackDecision = emailPatternFallbackDecision({
        contactEnrichmentEnabled: true,
        fallbackEnabled: runtimeEnv.EMAIL_PATTERN_FALLBACK_ENABLED,
        githubPattern: githubStep.pattern,
        githubObservedCount: githubStep.observed.length,
        hasNamedPersonWithoutEmail: peopleHints.some((person) => Boolean(person.name?.trim()) && !person.email),
        remainingBudgetUsd: fallbackBudgetRemainingUsd
      });

      if (fallbackDecision.eligible) {
        currentStage = "email-pattern-fallback";
        const fallbackStep = await step.run("email-pattern-fallback", async () => {
          const walletBefore = await safeAgentcashWalletSnapshot();
          const startedAt = Date.now();
          const result = await fetchStableenrichEmailPatternSources({
            env: stableEnv,
            domain,
            maxBudgetUsd: 0.01
          });
          const walletAfter = await safeAgentcashWalletSnapshot();
          const fallbackSourceUrl = result.observed.find((contact) => contact.sourceUrl)?.sourceUrl
            ?? result.sources[0]?.url
            ?? `https://${domain}`;
          const facts = buildEmailPatternContactFacts({
            domain,
            founders: baseSections.team.founders.value ?? [],
            keyExecs: baseSections.team.keyExecs.value ?? [],
            observed: result.observed,
            pattern: result.pattern,
            patternAnchorCount: result.patternAnchorCount,
            fallbackSourceUrl,
            fetchedAt: new Date().toISOString(),
            sourceType: "enrichment",
            provider: "stableenrich",
            endpoint: "exa_email_search",
            citationTitle: `${baseSections.identity.name.value ?? domain} email pattern source`
          });
          const observedCount = facts.filter((fact) =>
            Array.isArray(fact.value) && (fact.value[0] as { emailStatus?: string })?.emailStatus === "observed"
          ).length;
          return {
            result,
            facts,
            observedCount,
            walletBefore,
            walletAfter,
            durationMs: Date.now() - startedAt
          };
        });
        paidProviderFacts.push(...fallbackStep.facts);
        paidSources = mergeSources(paidSources, fallbackStep.result.sources);
        mergeTracePatch(trace, {
          steps: {
            "email-pattern-fallback": {
              ...completedStep(fallbackStep.durationMs),
              message: fallbackStep.result.pattern ? `pattern ${fallbackStep.result.pattern}` : "no pattern recovered"
            }
          },
          providers: {
            stableenrich: {
              sourceCount: fallbackStep.result.sources.length,
              factCount: fallbackStep.facts.length,
              failureCount: fallbackStep.result.failures.length,
              endpoints: withStableenrichEndpointBudgets(fallbackStep.result.endpoints),
              ...(fallbackStep.result.budgetCeilingHit ? { budgetCeilingHit: true } : {}),
              emailPatternFallback: {
                fired: true,
                hit: fallbackStep.result.pattern !== null,
                pattern: fallbackStep.result.pattern,
                observedCount: fallbackStep.observedCount,
                inferredCount: fallbackStep.facts.length - fallbackStep.observedCount
              }
            }
          }
        });
        applyStableenrichWalletTrace(trace, fallbackStep.walletBefore, fallbackStep.walletAfter);
        const fallbackTrace = trace.providers?.stableenrich?.emailPatternFallback;
        if (fallbackTrace && trace.providers?.stableenrich?.walletDeltaUsd !== undefined) {
          fallbackTrace.spendUsd = trace.providers.stableenrich.walletDeltaUsd;
        }
        await recordEvent(
          "email-pattern-fallback",
          fallbackStep.result.pattern ? "contacts.email-pattern.hit" : "contacts.email-pattern.miss",
          fallbackStep.result.pattern ? "Paid email pattern fallback recovered a pattern" : "Paid email pattern fallback found no pattern",
          {
            pattern: fallbackStep.result.pattern,
            observedCount: fallbackStep.observedCount,
            inferredCount: fallbackStep.facts.length - fallbackStep.observedCount,
            failureCount: fallbackStep.result.failures.length,
            spendUsd: trace.providers?.stableenrich?.walletDeltaUsd ?? null
          }
        );
      } else {
        trace.steps = {
          ...trace.steps,
          "email-pattern-fallback": skippedStep(fallbackDecision.reason)
        };
      }

      // Websets are async agent searches: create the webset first so it works while the other
      // contact providers run, then poll durably below. The old inline fetch gave it ~4.5s and
      // recorded 0 items on every production run.
      currentStage = "create-websets-contact-search";
      const websetCreated: { skipped: true; reason: string } | { skipped: false; websetId: string; dashboardUrl: string | null; endpointUrl: string } =
        websetsOwnsEmailPath
          ? await step.run("create-websets-contact-search", async () => {
              try {
                return await createPeopleEmailWebset({ env: websetsEnv, domain, peopleHints, externalId: websetsExternalId });
              } catch (error) {
                return { skipped: true as const, reason: boundedErrorMessage(error) };
              }
            })
          : { skipped: true, reason: deepFind ? "websets contacts disabled or EXA_WEBSETS_API_KEY missing" : "deep-find not requested" };

      if (deepFind) {
        currentStage = "fetch-contact-sources";
        const contactSourceResult = await step.run("fetch-contact-sources", async () => {
          const result = await timed(() =>
            fetchContactSourcesForBasics({
              acceptedSources,
              directExaEnv,
              domain,
              initialProviders: {},
              maxStableenrichBudgetUsd: remainingAgentcashBudgetUsd({
                ceilingUsd: agentcashBudgetUsd,
                endpoints: [
                  ...(parentStableenrichEndpoints ?? []),
                  ...(trace.providers?.stableenrich?.endpoints ?? [])
                ]
              }),
              peopleHints,
              stableEnv,
              websetsOwnsEmailPath
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
        paidProviderFacts = contactSourceResult.value.providerFacts;
        paidSources = contactSourceResult.value.sources;
        await recordEvent("sources-fetched", "source.contacts", "Checked people and email sources", {
          sourceCount: contactSourceResult.value.sources.length,
          providerFactCount: contactSourceResult.value.providerFacts.length
        });
      } else {
        trace.steps = {
          ...trace.steps,
          "fetch-contact-sources": skippedStep("deep-find not requested; free GitHub layer only")
        };
      }

      currentStage = "poll-websets-contact-search";
      let websetsLate: WebsetsPeopleEmailResult | null = null;
      if (!websetCreated.skipped) {
        const pollAttempts = Math.max(1, Math.min(20, runtimeEnv.WEBSETS_POLL_ATTEMPTS ?? 6));
        const pollIntervalSeconds = Math.max(1, Math.min(120, runtimeEnv.WEBSETS_POLL_INTERVAL_SECONDS ?? 20));
        let pollsMade = 0;

        for (let attempt = 1; attempt <= pollAttempts; attempt += 1) {
          await step.sleep(`websets-wait-${attempt}`, `${pollIntervalSeconds}s`);
          websetsLate = await step.run(`poll-websets-${attempt}`, () =>
            pollPeopleEmailWebset({
              env: websetsEnv,
              domain,
              peopleHints,
              websetId: websetCreated.websetId,
              dashboardUrl: websetCreated.dashboardUrl
            })
          );
          pollsMade = attempt;
          // Transient poll failures (timeouts, 5xx) do not end the window; the attempts cap
          // bounds the spend either way.
          if ((websetsLate.trace.acceptedEmailCount ?? 0) > 0) {
            break;
          }
        }

        if (websetsLate) {
          mergeTracePatch(trace, {
            providers: {
              websets: {
                ...websetsLate.trace,
                requestCount: 1 + pollsMade
              },
              ...(websetsLate.emailDiscovery.length > 0
                ? { emailDiscovery: [...(trace.providers?.emailDiscovery ?? []), ...websetsLate.emailDiscovery] }
                : {})
            }
          });
          await recordEvent(
            "websets-polled",
            "contacts.websets",
            `Websets returned ${websetsLate.trace.acceptedEmailCount ?? 0} verified emails after ${pollsMade} poll${pollsMade === 1 ? "" : "s"}`,
            {
              acceptedEmailCount: websetsLate.trace.acceptedEmailCount ?? 0,
              itemCount: websetsLate.trace.itemCount ?? 0,
              polls: pollsMade
            }
          );
        }
      }
      const websetsLateSources = websetsLate
        ? filterSourcesForDomain({ domain, sources: websetsLate.sources }).accepted
        : [];
      // GitHub facts first so an observed/inferred work email is present before the paid path
      // merges; the merge prefers any non-inferred address, so real paid emails still win.
      const contactProviderFacts = [...githubFacts, ...paidProviderFacts, ...(websetsLate?.facts ?? [])];

      currentStage = "enrich-contacts";
      const contactEnriched = await step.run("enrich-contacts", async () => {
        const result = await timed(() => {
          const providerFactMerge = applyProviderFactCandidates(baseSections, contactProviderFacts);
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
                message: `${peopleEmailCount(result.value.sections)} work emails`
              }
            }
          }
        };
      });
      mergeTracePatch(trace, contactEnriched.tracePatch);
      applyStableenrichEndpointYield(trace, contactEnriched.value.providerFactMerge.trace.appliedByEndpoint);

      currentStage = "person-reads";
      const peopleForReads = peopleFromSections(contactEnriched.value.sections);
      let sectionsWithReads = contactEnriched.value.sections;
      if (!personReadsEnabled() || peopleForReads.length === 0) {
        trace.steps = {
          ...trace.steps,
          "person-reads": skippedStep(!personReadsEnabled() ? "PERSON_READS_ENABLED=false" : "no people to read")
        };
      } else {
        const personReadsStep = await step.run("person-reads", async () => {
          const result = await timed(async () => {
            try {
              const anthropic = createAnthropicClient();
              const llmTelemetry = createStepLlmTelemetryCollector();
              const model = modelForStage("person_read", anthropicModel());
              const evidence = buildPersonReadEvidence({
                people: peopleForReads,
                citations: contactEnriched.value.sections.citations,
                candidates: contactProviderFacts,
                sources: mergeSources(acceptedSources, githubSources, paidSources, websetsLateSources)
              });
              const { reads } = await synthesizePersonReads({
                client: anthropic,
                companyName: baseSections.identity.name.value ?? domain,
                domain,
                people: evidence,
                model,
                telemetry: llmTelemetry.telemetry
              });
              return {
                sections: attachPersonReads(contactEnriched.value.sections, reads),
                message: `${reads.filter((read) => read.read !== null).length} person reads`,
                tracePatch: llmTelemetry.tracePatch()
              };
            } catch (error) {
              // Person reads are an enhancement, never a blocker: a structured warn and the
              // card write proceeds without them rather than failing (and retrying) the step.
              console.warn("[contact-enrichment] person reads failed; continuing without them", {
                stage: "person-reads",
                error: boundedErrorMessage(error)
              });
              return null;
            }
          });

          if (!result.value) {
            return {
              sections: contactEnriched.value.sections,
              tracePatch: {
                steps: {
                  "person-reads": {
                    status: "failed" as const,
                    durationMs: result.durationMs,
                    message: "person reads failed; card write proceeds without them"
                  }
                }
              }
            };
          }

          return {
            sections: result.value.sections,
            tracePatch: {
              ...result.value.tracePatch,
              steps: {
                "person-reads": { ...completedStep(result.durationMs), message: result.value.message }
              }
            }
          };
        });

        sectionsWithReads = personReadsStep.sections;
        mergeTracePatch(trace, personReadsStep.tracePatch);
      }

      const contactCard = cardWithExtractedSections(existingCard, sectionsWithReads);
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
          recordSourcesForCard(db, contactRow.id, mergeSources(acceptedSources, githubSources, paidSources, websetsLateSources))
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
            patch: (existingTrace) => mergeContactEnrichmentTrace(existingTrace, trace)
          }).catch((error) => {
            // Patching the parent run's trace is best-effort. A failure here must not fail
            // contact enrichment or poison the parent generation run's lifecycle.
            console.warn("[contact-enrichment] parent trace patch failed; continuing", error);
            return null;
          })
        );
      }

      await recordEvent("complete", "contacts.enriched", `Found ${peopleEmailCount(contactEnriched.value.sections)} work emails`, {
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
