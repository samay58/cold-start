import {
  companySlugFromDomain,
  type ColdStartCard,
  type GenerationTrace,
  type GenerationLlmCallTrace,
  deriveLegacyResearchSectionsFromCard,
  RESEARCH_SECTION_DEFINITIONS_BY_ID,
  researchSectionJobKind,
  hasInvestorUsableProfile,
  researchSectionIdSchema,
  type ResearchSectionId
} from "@cold-start/core";
import {
  createDb,
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
  type ColdStartDb
} from "@cold-start/db";
import {
  anthropicModel,
  createAnthropicClient,
  extractCompanyBlockClaims,
  extractCompanyClaims,
  fallbackResearchPlan,
  modelForStage,
  synthesizeCard,
  verifySynthesis,
  type AnthropicTelemetrySink,
} from "@cold-start/llm";
import {
  GenerateCardTraceError,
  extractedCardSectionsSchema,
  buildSeedProfileCard,
  blocksNeedingEnrichmentForSections,
  cardWithExtractedSections,
  enrichExtractedSectionsForDomain,
  generateCardForDomainWithTrace,
  applyProviderFactCandidates,
  type BlockEnrichmentPatch,
  type CostLine,
  type EvidenceLedgerEntry,
  type ExtractedCardSections,
  type GenerateCardTracePatch
} from "@cold-start/pipeline";
import {
  type ProviderFactCandidate,
  type ProviderSource,
  agentcashWalletSnapshot
} from "@cold-start/providers";
import { canonicalCompanyDomain } from "../lib/domain";
import { webEnv } from "../lib/env";
import { boundedErrorMessage } from "../lib/errors";
import { buildContactEnrichmentRequestedEvent, cardHasContactTargets } from "./contact-enrichment";
import { inngest } from "./client";
import {
  applyStableenrichWalletTrace,
  anthropicGenerationCostUsdFromTrace,
  completedStep,
  generationMilestoneElapsedMs,
  llmTracePatchFromCalls,
  mergeGenerationTrace,
  mergeTracePatch,
  requestedAtMsFromGenerationEvent,
  skippedStep,
  writeGenerationMilestoneValue
} from "./generation-trace";
import { generateStoredResearchSection } from "./research-section-generation";
import {
  assertTerminalCardQuality,
  canStoreCardSnapshot,
  noteSkippedUnderfilledSnapshot,
  prepareCardForStorage,
  prepareCardSnapshotForStorage
} from "./card-storage";
import {
  contactEnrichmentEnabled,
  directExaEnvFromProcess,
  stableenrichEnvFromProcess
} from "./env";
import {
  agentcashBudgetCeilingUsd,
  applyStableenrichEndpointYield,
  mergeEndpointFactCounts,
  remainingAgentcashBudgetUsd
} from "./provider-trace";
import {
  fetchInitialSourcesForGeneration,
  fetchLateEnrichmentSources,
  stableenrichLateEnrichmentSkipsForBlocks
} from "./source-fetching";

export { preserveExistingBasics, prepareCardForStorage, underfilledBasicsErrorMessage } from "./card-storage";
export { buildContactEnrichmentRequestedEvent, contactEnrichmentFunction } from "./contact-enrichment";
export { contactEnrichmentEnabled } from "./env";

type GenerationMode = "basics" | "analysis";
type TimedResult<T> = { durationMs: number; value: T };

function generationModeForRun(input: unknown): GenerationMode {
  if (input === undefined || input === null || input === "") {
    return "basics";
  }
  if (input === "basics" || input === "analysis") {
    return input;
  }

  throw new Error(`invalid generation mode: ${String(input).slice(0, 80)}`);
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

function costLineForLlmCall(call: GenerationLlmCallTrace): CostLine | null {
  if (call.estimatedCostUsd !== undefined && call.estimatedCostUsd > 0) {
    return {
      label: `anthropic:${call.stage}:${call.label}:${call.model}`,
      usd: call.estimatedCostUsd
    };
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

  return {
    telemetry,
    costLines,
    tracePatch: () => llmTracePatchFromCalls(calls)
  };
}

function generationRunAnthropicCostUsd(trace: GenerationTrace, fallback = 0) {
  // generation_runs.cost_usd is the estimated Anthropic generation cost. Observed AgentCash spend
  // stays in trace.costUsdAgentcash / trace.providers.stableenrich.walletDeltaUsd.
  return anthropicGenerationCostUsdFromTrace(trace) ?? fallback;
}

function cardWithTraceCost(card: ColdStartCard, trace: GenerationTrace) {
  const costUsd = anthropicGenerationCostUsdFromTrace(trace);
  return costUsd === undefined ? card : { ...card, generationCostUsd: costUsd };
}

const progressSourceCategoryOrder = [
  "company site",
  "docs",
  "funding coverage",
  "product page",
  "people source",
  "customer proof",
  "filing",
  "news",
  "database"
] as const;

type ProgressSourceCategory = typeof progressSourceCategoryOrder[number];

function sourceTextForProgress(source: ProviderSource) {
  return `${source.url} ${source.title} ${source.rawText ?? ""}`.toLowerCase();
}

function progressCategoryForSource(source: ProviderSource): ProgressSourceCategory | null {
  const text = sourceTextForProgress(source);

  if (source.sourceType === "company_site") {
    if (/\bdocs?\b|documentation|developer|api reference|quickstart|guide/.test(text)) {
      return "docs";
    }
    if (/\bproduct\b|\bpricing\b|\bplatform\b|\bapi\b/.test(text)) {
      return "product page";
    }
    return "company site";
  }

  if (source.sourceType === "news") {
    if (/\bfunding\b|\braised\b|series [a-z]\b|\bround\b|\binvestors?\b|\bvaluation\b/.test(text)) {
      return "funding coverage";
    }
    return "news";
  }

  if (source.sourceType === "filing") {
    return "filing";
  }

  if (source.sourceType === "github") {
    return "product page";
  }

  if (source.sourceType === "enrichment" || source.sourceType === "rdap") {
    return "database";
  }

  return null;
}

function progressSourceCategories(sources: ProviderSource[]) {
  const categories = new Set<ProgressSourceCategory>();

  for (const source of sources) {
    const category = progressCategoryForSource(source);
    if (category) {
      categories.add(category);
    }
  }

  return progressSourceCategoryOrder.filter((category) => categories.has(category));
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

function parseEventSectionId(input: unknown): ResearchSectionId | null {
  if (input === undefined || input === null || input === "") {
    return null;
  }

  const parsed = researchSectionIdSchema.safeParse(input);
  if (!parsed.success) {
    throw new Error(`invalid research section id: ${String(input).slice(0, 80)}`);
  }

  return parsed.data;
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
    let mode: GenerationMode = "basics";
    let requestedSectionId: ResearchSectionId | null = null;
    let jobKind: GenerationTrace["jobKind"] = "basics";
    const trace: GenerationTrace = {
      jobKind,
      mode,
      inngest: {
        ...(typeof event.id === "string" ? { eventId: event.id } : {}),
        ...(typeof runId === "string" ? { runId } : {})
      },
      steps: {}
    };

    let currentStage = "validate-mode";
    try {
      mode = generationModeForRun(event.data.mode);
      jobKind = mode;
      trace.mode = mode;
      trace.jobKind = jobKind;
      currentStage = "validate-section-id";
      requestedSectionId = parseEventSectionId(event.data.sectionId);
      jobKind = requestedSectionId ? researchSectionJobKind(requestedSectionId) : mode;
      trace.jobKind = jobKind;
      currentStage = "canonicalize-domain";
      domain = canonicalCompanyDomain(event.data.domain);
      slug = companySlugFromDomain(domain);
    } catch (error) {
      await step.run("mark-invalid-generation", () =>
        markGenerationRun(db, {
          slug: rawSlugForRun(event.data.slug, event.data.domain),
          domain: rawDomainForRun(event.data.domain),
          mode,
          jobKind,
          status: "failed",
          error: boundedErrorMessage(error),
          traceJson: {
            ...trace,
            failure: {
              stage: currentStage,
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

    currentStage = "plan-research";
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
      const extractModel = modelForStage("extract_full", defaultModel);
      const blockModel = modelForStage("extract_block", defaultModel);
      const synthesisModel = modelForStage("synthesis", defaultModel);
      const verifierModel = modelForStage("verify", defaultModel);
      const sectionModel = modelForStage("research_section", defaultModel);

      if (requestedSectionId) {
        currentStage = "generate-section";
        const sectionResult = await step.run("generate-section", async () => {
          const llmTelemetry = createStepLlmTelemetryCollector();
          const result = await timed(async () => {
            try {
              const section = await generateStoredResearchSection({
                db,
                slug,
                domain,
                sectionId: requestedSectionId,
                runId: generationRunDbId,
                client: anthropic,
                model: sectionModel,
                telemetry: llmTelemetry.telemetry
              });

              return {
                ok: true as const,
                value: section
              };
            } catch (error) {
              return {
                ok: false as const,
                error: boundedErrorMessage(error)
              };
            }
          });
          const llmTracePatch = llmTelemetry.tracePatch();

          return {
            value: result.value,
            tracePatch: {
              ...llmTracePatch,
              steps: {
                "generate-section": result.value.ok
                  ? completedStep(result.durationMs)
                  : { status: "failed" as const, durationMs: result.durationMs, message: result.value.error }
              }
            }
          };
        });
        mergeTracePatch(trace, sectionResult.tracePatch);
        if ("ok" in sectionResult.value && !sectionResult.value.ok) {
          throw new Error(sectionResult.value.error);
        }
        const generatedSection = "ok" in sectionResult.value
          ? sectionResult.value.value
          : sectionResult.value;

        // Tie this section pass to the section model. Only "deep" when the LLM actually ran;
        // the empty-evidence path above returns a section with no call, so it reads "derived".
        // Attribute the run's Anthropic spend (the lone LLM call here is this section) to it.
        const sectionLlmRan = (trace.llm?.calls ?? []).some((call) => call.label.startsWith("research-section:"));
        const sectionTraceStatus = generatedSection.status === "available"
          ? "available"
          : generatedSection.status === "failed"
            ? "failed"
            : "empty";
        trace.sections = [{
          sectionId: requestedSectionId,
          provenance: sectionLlmRan ? "deep" : "derived",
          status: sectionTraceStatus,
          estimatedCostUsd: generationRunAnthropicCostUsd(trace)
        }];
        if (sectionLlmRan) {
          for (const call of trace.llm?.calls ?? []) {
            if (call.label.startsWith("research-section:")) {
              call.sectionId = requestedSectionId;
            }
          }
        }

        await step.run("upsert-generated-section", () => upsertResearchSection(db, generatedSection));
        await recordEvent(
          "section-saved",
          generatedSection.status === "available" ? "section.available" : "section.empty",
          generatedSection.status === "available"
            ? `Saved ${RESEARCH_SECTION_DEFINITIONS_BY_ID[requestedSectionId].title}`
            : `No strong evidence found for ${RESEARCH_SECTION_DEFINITIONS_BY_ID[requestedSectionId].title}`,
          {
            citationCount: generatedSection.citationIds.length,
            sourceCount: generatedSection.sourceIds.length,
            status: generatedSection.status
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
            costUsd: generationRunAnthropicCostUsd(trace),
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
        const result = await timed(() =>
          fetchInitialSourcesForGeneration({
            mode,
            domain,
            researchPlan,
            runtimeEnv,
            stableEnv,
            directExaEnv,
            agentcashBudgetCeiling
          })
        );
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
        stableenrichCount: sourceResult.value.trace.providers.stableenrich.sourceCount,
        sourceCategories: progressSourceCategories(sourceResult.value.sources)
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

      const extractSectionsForCard = (telemetry: AnthropicTelemetrySink) => async ({ domain: candidateDomain, sources, evidenceLedger }: {
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
      const enrichSectionsForCard = (telemetry: AnthropicTelemetrySink) => async ({ block, domain: candidateDomain, sources, evidenceLedger, currentSections }: {
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
      const runCardAttempt = async (llmTelemetry: ReturnType<typeof createStepLlmTelemetryCollector>, options: {
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
            extractSections: extractSectionsForCard(llmTelemetry.telemetry),
            enrichSections: enrichSectionsForCard(llmTelemetry.telemetry),
            costLines: llmTelemetry.costLines,
            ...(mode === "analysis"
              ? {
                  synthesize: async (card: ColdStartCard) => synthesizeCard({ client: anthropic, model: synthesisModel, card, telemetry: llmTelemetry.telemetry }),
                  verify: async (claims, sources) => verifySynthesis({ client: anthropic, model: verifierModel, claims, sources, telemetry: llmTelemetry.telemetry }),
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
        const llmTelemetry = createStepLlmTelemetryCollector();
        const result = await timed(() =>
          runCardAttempt(llmTelemetry, { skipBlockEnrichment: mode === "basics" || reuseExistingForAnalysis })
        );
        const llmTracePatch = llmTelemetry.tracePatch();
        return {
          value: result.value,
          tracePatch: {
            ...result.value.tracePatch,
            ...llmTracePatch,
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

      let generatedCard: ColdStartCard = cardWithTraceCost(clean.value.card, trace);
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
        const lateEnrichmentBlocks = blocksNeedingEnrichmentForSections(generatedSections);
        const lateEnrichmentSkipProbeNames = stableenrichLateEnrichmentSkipsForBlocks(lateEnrichmentBlocks);
        if (lateEnrichmentBlocks.length === 0) {
          assertTerminalCardQuality(mode, cardToStore);
          trace.steps = {
            ...trace.steps,
            "fetch-enrichment-sources": skippedStep("generated card already filled enrichment blocks"),
            "enrich-card": skippedStep("generated card already filled enrichment blocks")
          };
        } else {
          currentStage = "fetch-enrichment-sources";
          const enrichmentSourceResult = await step.run("fetch-enrichment-sources", async () => {
            const result = await timed(() => {
              const remainingBudgetUsd = remainingAgentcashBudgetUsd({
                ceilingUsd: agentcashBudgetCeiling,
                endpoints: trace.providers?.stableenrich?.endpoints
              });
              return fetchLateEnrichmentSources({
                domain,
                researchPlan,
                acceptedSources,
                stableEnv,
                remainingBudgetUsd,
                missingBlocks: lateEnrichmentBlocks,
                initialProviders: sourceResult.value.trace.providers,
                currentStable: trace.providers?.stableenrich
              });
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
            providerFactCount: enrichmentSourceResult.value.providerFacts.length,
            missingBlocks: lateEnrichmentBlocks,
            skippedProbeNames: lateEnrichmentSkipProbeNames
          }, null);

          currentStage = "enrich-card";
          const enriched = await step.run("enrich-card", async () => {
            const llmTelemetry = createStepLlmTelemetryCollector();
            const result = await timed(async () => {
              try {
                const providerFactMerge = applyProviderFactCandidates(generatedSections, enrichmentSourceResult.value.providerFacts);
                const enrichment = await enrichExtractedSectionsForDomain({
                  domain,
                  researchPlan,
                  sections: providerFactMerge.sections,
                  sources: enrichmentSourceResult.value.sources,
                  enrichSections: enrichSectionsForCard(llmTelemetry.telemetry)
                });
                return {
                  ok: true as const,
                  value: { ...enrichment, providerFactMerge }
                };
              } catch (error) {
                return {
                  ok: false as const,
                  error: boundedErrorMessage(error)
                };
              }
            });
            const llmTracePatch = llmTelemetry.tracePatch();

            return {
              value: result.value,
              tracePatch: {
                ...llmTracePatch,
                steps: {
                  "enrich-card": result.value.ok
                    ? completedStep(result.durationMs)
                    : { status: "failed" as const, durationMs: result.durationMs, message: result.value.error }
                }
              }
            };
          });
          mergeTracePatch(trace, enriched.tracePatch);
          if (!enriched.value.ok) {
            throw new Error(enriched.value.error);
          }
          const enrichedValue = enriched.value.value;

          generatedSections = enrichedValue.sections;
          generatedCard = cardWithTraceCost(cardWithExtractedSections(generatedCard, generatedSections), trace);
          sourcesToRecord = enrichmentSourceResult.value.sources;
          if (trace.extraction) {
            trace.extraction = {
              ...trace.extraction,
              sourceCount: sourcesToRecord.length,
              citationCount: generatedSections.citations.length,
              providerFactCandidateCount:
                (trace.extraction.providerFactCandidateCount ?? 0) + enrichedValue.providerFactMerge.trace.candidateCount,
              providerFactAppliedCount:
                (trace.extraction.providerFactAppliedCount ?? 0) + enrichedValue.providerFactMerge.trace.appliedCount,
              providerFactPaths: [
                ...(trace.extraction.providerFactPaths ?? []),
                ...enrichedValue.providerFactMerge.trace.paths
              ],
              providerFactAppliedByEndpoint: mergeEndpointFactCounts(
                trace.extraction.providerFactAppliedByEndpoint,
                enrichedValue.providerFactMerge.trace.appliedByEndpoint
              ),
              ...(enrichedValue.trace ? { blockEnrichment: enrichedValue.trace } : {})
            };
          }
          applyStableenrichEndpointYield(trace, enrichedValue.providerFactMerge.trace.appliedByEndpoint);

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
      const finalGenerationCostUsd = generationRunAnthropicCostUsd(trace, cardToStore.generationCostUsd);
      await step.run("mark-generation-complete", () =>
        markGenerationRun(db, {
          slug,
          domain,
          mode,
          jobKind,
          status: "complete",
          costUsd: finalGenerationCostUsd,
          ...(generationRunDbId ? {} : { traceJson: trace }),
          ...(trace.inngest?.eventId ? { inngestEventId: trace.inngest.eventId } : {}),
          ...(trace.inngest?.runId ? { inngestRunId: trace.inngest.runId } : {})
        })
      );
      await recordEvent("generation-complete", "generation.complete", "Research run complete", {
        costUsd: finalGenerationCostUsd,
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
      if (requestedSectionId) {
        await step.run("mark-research-section-failed", () =>
          markResearchSectionFailed(db, {
            slug,
            domain,
            sectionId: requestedSectionId,
            visibility: RESEARCH_SECTION_DEFINITIONS_BY_ID[requestedSectionId].visibility,
            error: boundedErrorMessage(error),
            runId: generationRunDbId
          }).catch(() => null)
        );
      }
      await recordEvent("generation-failed", requestedSectionId ? "section.failed" : "generation.failed", boundedErrorMessage(error), {
        stage: currentStage
      });
      throw error;
    }
  },
);
