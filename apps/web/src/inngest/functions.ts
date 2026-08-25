import {
  companySlugFromDomain,
  buildFirstPayoff,
  emphasisThinFileReason,
  howItWinsThinFileReason,
  type ColdStartCard,
  type EmphasisRead,
  type FirstPayoff,
  type GenerationTrace,
  type HowItWins,
  type HowItWinsJudgment,
  deriveLegacyResearchSectionsFromCard,
  RESEARCH_SECTION_DEFINITIONS_BY_ID,
  researchSectionJobKind,
  hasInvestorUsableProfile,
  type ResearchSectionId
} from "@cold-start/core";
import {
  createDb,
  findCardBySlug,
  findSourcesBySlug,
  freezeCurrentEditionForRefile,
  isCardSignalsFresh,
  markGenerationRun,
  markResearchSectionFailed,
  recordResearchRunEvent,
  recordCardEvidence,
  settleAlphaRunRequest,
  transitionGenerationRunById,
  updateGenerationRunTrace,
  upsertCard,
  upsertResearchSections
} from "@cold-start/db";
import {
  anthropicModel,
  createAnthropicClient,
  extractCompanyBlockClaims,
  extractCompanyClaims,
  fallbackResearchPlan,
  isTransientLlmError,
  modelForStage,
  type AnthropicTelemetrySink,
} from "@cold-start/llm";
import {
  extractedCardSectionsSchema,
  buildSeedProfileCard,
  blocksNeedingEnrichmentForSections,
  cardWithExtractedSections,
  enrichExtractedSectionsForDomain,
  evaluateSynthesisGate,
  generateCardForDomainWithTrace,
  applyProviderFactCandidates,
  synthesisEvidenceFingerprint,
  withheldCardForNoSurvivors,
  type EvidenceLedgerEntry,
  type ExtractedCardSections
} from "@cold-start/pipeline";
import {
  type ProviderFactCandidate,
  type ProviderSource
} from "@cold-start/providers";
import { canonicalCompanyDomain } from "../lib/domain";
import { webEnv } from "../lib/web-env";
import { boundedErrorMessage, rawErrorDetail } from "../lib/errors";
import { generationFailureCode } from "@cold-start/core";
import { pipelineBlockPatch } from "./block-enrichment-patch";
import { buildBlockEnrichmentRequestedEvent } from "./card-enrichment";
import { buildContactEnrichmentRequestedEvent, cardHasContactTargets } from "./contact-enrichment";
import { inngest, type WorkerEventContext } from "./client";
import {
  applyStableenrichWalletTrace,
  completedStep,
  generationMilestoneElapsedMs,
  mergeGenerationTrace,
  mergeTracePatch,
  requestedAtMsFromGenerationEvent,
  skippedStep,
  writeGenerationMilestoneValue
} from "./generation-trace";
import {
  cardWithTraceCost,
  createStepLlmTelemetryCollector,
  generateErrorTracePatch,
  generationModeForRun,
  generationRunLlmCostUsd,
  isRefileProfileStore,
  mergeBaseCardForStore,
  parseEventSectionId,
  progressSourceCategories,
  rawDomainForRun,
  rawSlugForRun,
  safeAgentcashWalletSnapshot,
  sourceEventSummaries,
  synthesizeCardStepBody,
  timed,
  verifySynthesisStepBody,
  type GenerationMode
} from "./generation-helpers";
import { runResearchSectionJobStep } from "./research-section-generation";
import {
  emphasisReadStepBody,
  fetchFounderVoiceStepBody,
  nextFounderVoiceIndex
} from "./emphasis-read";
import { howItWinsStepBody } from "./how-it-wins";
import {
  assertTerminalCardQuality,
  canStoreCardSnapshot,
  mutateCardWithRetry,
  noteSkippedUnderfilledSnapshot,
  prepareCardForStorage,
  prepareCardSnapshotForStorage,
  type CardWriteArgs
} from "./card-storage";
import {
  analysisSourceRefreshModeFromProcess,
  contactEnrichmentEnabled,
  directExaEnvFromProcess,
  emphasisReadEnabled,
  expandedDescriptionEnabled,
  founderVoiceEnvFromProcess,
  howItWinsEnabled,
  howItWinsModelsFromProcess,
  stableenrichEnvFromProcess
} from "./worker-env";
import {
  agentcashBudgetCeilingUsd,
  applyStableenrichEndpointYield,
  mergeEndpointFactCounts,
  remainingAgentcashBudgetUsd
} from "./provider-trace";
import {
  analysisSourceFetchPlan,
  fetchInitialSourcesForGeneration,
  fetchLateEnrichmentSources,
  providerSourcesFromStoredSources,
  recordSourcesForCard,
  sectionsWithSourceCitations,
  stableenrichLateEnrichmentSkipsForBlocks
} from "./source-fetching";

function analysisStateSignature(card: ColdStartCard | null) {
  return JSON.stringify(card?.synthesis ?? card?.synthesisWithheld);
}

export const generateCardHandler = async ({ event, runId, step }: WorkerEventContext) => {
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
  const requestedGenerationRunId =
    typeof event.data.generationRunId === "string" && event.data.generationRunId.trim()
      ? event.data.generationRunId.trim()
      : null;
  // Threaded from the route's forceRefresh flag (Task 3, profile-refile-and-editions). Only
  // isRefileProfileStore's basics+forceRefresh combination ever acts on it; every other jobKind
  // ignores it.
  const forceRefresh = event.data.forceRefresh === true;
  // The inline executor swallows a terminal enrichment-dispatch failure so a completed profile is
  // not reported to the user as a failure. Stamping the failure onto the step it belongs to stops
  // the trace from claiming a dispatch that never happened. Inngest's executor fails the step
  // itself, so its tools carry no warnings and this is a no-op there.
  const applySwallowedStepWarnings = () => {
    for (const warning of step.stepWarnings ?? []) {
      trace.steps = {
        ...trace.steps,
        [warning.stepId]: { status: "failed", message: warning.message }
      };
    }
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
    await step.run("mark-invalid-generation", async () => {
      const alphaSettlement = requestedGenerationRunId
        ? await settleAlphaRunRequest(db, {
            generationRunId: requestedGenerationRunId,
            outcome: "failed",
            failureCode: generationFailureCode(error),
            error: boundedErrorMessage(error)
          })
        : null;
      // Truthiness, not `applied`, on purpose: the fallback here is markGenerationRun's
      // slug-keyed upsert, which would insert a second failed row for a run that is already
      // terminal. An unapplied settlement means the row already reached a terminal status.
      if (alphaSettlement) {
        return alphaSettlement;
      }
      return markGenerationRun(db, {
        slug: rawSlugForRun(event.data.slug, event.data.domain),
        domain: rawDomainForRun(event.data.domain),
        mode,
        jobKind,
        status: "failed",
        error: boundedErrorMessage(error),
        traceJson: {
          ...trace,
          failure: {
            code: generationFailureCode(error),
            stage: currentStage,
            message: boundedErrorMessage(error),
            ...(error instanceof Error ? { className: error.name } : {}),
            ...(rawErrorDetail(error) !== undefined ? { detail: rawErrorDetail(error) } : {})
          }
        }
      });
    });
    throw error;
  }

  let generationRunDbId: string | null = null;
  const walletSnapshotBefore = await step.run("wallet-snapshot-before", () => safeAgentcashWalletSnapshot());
  applyStableenrichWalletTrace(trace, walletSnapshotBefore);
  const runningGenerationRun = await step.run("mark-generation-running", () =>
    requestedGenerationRunId
      ? transitionGenerationRunById(db, {
          id: requestedGenerationRunId,
          from: ["queued"],
          status: "running",
          traceJson: trace,
          ...(trace.inngest?.eventId ? { inngestEventId: trace.inngest.eventId } : {}),
          ...(trace.inngest?.runId ? { inngestRunId: trace.inngest.runId } : {})
        })
      : markGenerationRun(db, {
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
  if (requestedGenerationRunId && !runningGenerationRun) {
    throw new Error("generation run is no longer active");
  }
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
  let analysisStateAtRunStart: string | undefined;
  // A re-file run can store more than one snapshot in sequence (seed, then generated, then a
  // synchronous enriched pass) while isRefileProfileStore stays true throughout, since jobKind
  // and forceRefresh do not change mid-run. Only the first of those snapshots is the actual
  // supersession moment; freezing again on the second would archive this run's own seed card as
  // a phantom edition instead of the filing that was actually replaced. This flag bounds the
  // freeze to once per run in the common (non-crash) path; freezeCurrentEditionForRefile's own
  // generatedAt guard is what keeps a genuine step retry of the same store safe.
  let refileEditionFrozen = false;
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

  // One card-storage sequence for seed, generated, and enriched snapshots. Step ids are passed
  // in verbatim, not derived from a prefix: Inngest memoizes by step id, so changing them would
  // disrupt runs in flight during a deploy. Callers keep their own milestone writes.
  const storeCardSnapshot = async (input: {
    cardToStore: ColdStartCard;
    sources: ProviderSource[];
    steps: { upsert: string; evidence: string; sections: string; sources: string };
    event: { stepId: string; type: "card.partial" | "card.saved" | "card.enriched"; message: string; metadata?: Record<string, unknown> };
    skipNoteId: string;
    contactTrigger: string | null;
    extendSynthesisTtl?: boolean;
  }): Promise<{ card: ColdStartCard; milestoneMs: number } | null> => {
    if (!canStoreCardSnapshot(mode, input.cardToStore)) {
      noteSkippedUnderfilledSnapshot(trace, input.skipNoteId, input.cardToStore);
      return null;
    }
    // Spread, so a write on today's terms keeps its existing two-argument call shape and only a
    // run that must leave the synthesis TTL alone carries an options argument at all.
    const writeArgs: CardWriteArgs = input.extendSynthesisTtl === false
      ? [{ extendSynthesisTtl: false }]
      : [];
    const stored = await step.run(input.steps.upsert, async () => {
      // Re-file store semantics (spec: nothing stale survives): a re-file freezes the row it is
      // about to replace, then stores the fresh card wholesale, skipping the merge branch below
      // so old synthesis and old enrichment are discarded rather than carried forward.
      if (isRefileProfileStore({ jobKind, forceRefresh })) {
        if (!refileEditionFrozen) {
          await freezeCurrentEditionForRefile(db, input.cardToStore.slug, {
            supersededByRunId: generationRunDbId ?? null,
            appSchemaNote: `store@${new Date().toISOString().slice(0, 10)}`
          });
          refileEditionFrozen = true;
        }
        return {
          card: input.cardToStore,
          row: await upsertCard(db, input.cardToStore, ...writeArgs),
          milestoneMs: generationMilestoneElapsedMs(requestedAtMs)
        };
      }
      const mutated = await mutateCardWithRetry(
        db,
        input.cardToStore.slug,
        (current) => prepareCardSnapshotForStorage(mode, current, input.cardToStore, {
          preserveAnalysis: mode === "analysis"
            || analysisStateSignature(current) !== analysisStateAtRunStart
        }),
        ...writeArgs
      );
      return {
        card: mutated?.card ?? input.cardToStore,
        row: mutated?.row ?? await upsertCard(db, input.cardToStore, ...writeArgs),
        milestoneMs: generationMilestoneElapsedMs(requestedAtMs)
      };
    });
    const rowId = stored.row.id;
    await step.run(input.steps.evidence, () => recordCardEvidence(db, rowId, stored.card));
    await step.run(input.steps.sections, () => upsertResearchSections(db, deriveLegacyResearchSectionsFromCard(stored.card)));
    await step.run(input.steps.sources, () => recordSourcesForCard(db, rowId, input.sources));
    await recordEvent(input.event.stepId, input.event.type, input.event.message, {
      citationCount: stored.card.citations.length,
      sourceCount: input.sources.length,
      ...(input.event.metadata ?? {})
    }, null);
    if (input.contactTrigger) {
      await requestContactEnrichmentForStoredCard(stored.card, input.contactTrigger);
    }
    return { card: stored.card, milestoneMs: stored.milestoneMs };
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
    const emphasisModel = modelForStage("emphasis_read", defaultModel);
    const howItWinsModels = howItWinsModelsFromProcess(defaultModel);

    if (requestedSectionId) {
      currentStage = "generate-section";
      return await runResearchSectionJobStep({
        db,
        step,
        slug,
        domain,
        mode,
        jobKind,
        sectionId: requestedSectionId,
        generationRunDbId,
        client: anthropic,
        model: sectionModel,
        trace,
        recordEvent
      });
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
    analysisStateAtRunStart = analysisStateSignature(existingCard);
    const reuseExistingForAnalysis = mode === "analysis" && existingCard !== null && hasInvestorUsableProfile(existingCard);
    // Never replace a filed read with nothing (issue #10): a gate block or an all-claims-dropped
    // verify result must not overwrite a card that already carries a good synthesis read. Read
    // once here; both decision points below branch on it.
    const existingCardHasSynthesis = Boolean(existingCard?.synthesis);

    // Task 5.3: ANALYSIS_SOURCE_REFRESH gates the unconditional 13-probe stableenrich re-fetch on
    // the reuse branch. The signals-freshness DB read only fires for "skip-fresh" on the reuse
    // branch, since it is the only combination that needs it: "full" always re-fetches everything,
    // "targeted" always narrows regardless of freshness, and a non-reuse run always gets the full
    // fetch (analysisSourceFetchPlan short-circuits on !reuseExistingForAnalysis).
    const analysisSourceRefreshMode = analysisSourceRefreshModeFromProcess();
    const signalsFresh = reuseExistingForAnalysis && analysisSourceRefreshMode === "skip-fresh"
      ? await step.run("check-signals-freshness", () => isCardSignalsFresh(db, slug))
      : false;
    const sourceFetchPlan = analysisSourceFetchPlan({
      reuseExistingForAnalysis,
      signalsFresh,
      refreshMode: analysisSourceRefreshMode
    });

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
          agentcashBudgetCeiling,
          analysisSourceFetch: sourceFetchPlan,
          loadStoredSourcesForSkip: () => findSourcesBySlug(db, slug).then(providerSourcesFromStoredSources),
          reuseExistingForAnalysis
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
    const acceptedSources = sourceResult.value.sources.filter(Boolean) as ProviderSource[];
    const sourceEvent = await recordEvent("sources-fetched", "source.found", `Found ${sourceResult.value.sources.length} accepted sources`, {
      acceptedCount: sourceResult.value.sources.length,
      ...(mode === "analysis" ? { analysisSourceRefresh: sourceFetchPlan.kind } : {}),
      rejectedCount: sourceResult.value.trace.sourceGate.rejectedCount,
      directExaCount: sourceResult.value.trace.providers.directExa.sourceCount,
      stableenrichCount: sourceResult.value.trace.providers.stableenrich.sourceCount,
      sourceCategories: progressSourceCategories(sourceResult.value.sources),
      sources: sourceEventSummaries(acceptedSources)
    }, null);

    // Failure count is tracked for observability, but not converted into cost until live costs are measured.
    void sourceResult.value.failureCount;
    if (sourceResult.value.error) {
      throw new Error(sourceResult.value.error);
    }
    const providerFacts = sourceResult.value.providerFacts.filter(Boolean) as ProviderFactCandidate[];
    let seedCard: ColdStartCard | null = null;
    // Tracks whether a first-usable public card is already in the DB (seed or generated passed the
    // gate). When true, late block enrichment can run in an async worker so this worker frees its
    // Inngest slot at first usable. When false, the enriched card is the first usable one, so
    // enrichment stays synchronous here.
    let firstUsableStored = false;
    let firstPayoff: FirstPayoff | null = null;
    // First payoff is a best-effort early flourish, not on the critical path.
    // Build it off untrusted provider sources behind a guard so a malformed
    // source cannot abort the whole generation.
    const buildFirstPayoffSafely = (input: Parameters<typeof buildFirstPayoff>[0]): FirstPayoff | null => {
      try {
        return buildFirstPayoff(input);
      } catch (error) {
        console.warn("[generation] first payoff build failed; continuing without it", error);
        return null;
      }
    };

    if (mode === "basics") {
      firstPayoff = buildFirstPayoffSafely({
        slug,
        domain,
        sources: acceptedSources,
        generatedAtMs: Date.now(),
        ...(sourceEvent?.id ? { sourceEventId: sourceEvent.id } : {})
      });
      if (firstPayoff) {
        trace.firstPayoff = firstPayoff;
        await recordEvent(
          "first-payoff",
          firstPayoff.status === "substantive_first_read"
            ? "first_payoff.ready"
            : firstPayoff.status === "withheld"
              ? "first_payoff.withheld"
              : "first_payoff.receipt",
          firstPayoff.status === "substantive_first_read"
            ? "Early evidence ready"
            : firstPayoff.status === "withheld"
              ? "Source check held"
              : "Sources checked",
          { firstPayoff },
          null
        );
      }
    }

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
      firstPayoff = buildFirstPayoffSafely({
        slug,
        domain,
        sources: acceptedSources,
        card: seedCardToStore,
        generatedAtMs: Date.now(),
        ...(sourceEvent?.id ? { sourceEventId: sourceEvent.id } : {})
      });
      if (firstPayoff) {
        trace.firstPayoff = firstPayoff;
      }
      // A re-file never writes the seed card: the spec promise is that a re-file failing anywhere
      // leaves the filed profile exactly as it was, and the seed store is a partial, synthesis-
      // stripped hybrid that would otherwise clobber the live row mid-run, before the fresh
      // generated card is even ready. The old card stands live untouched until the generated
      // store below succeeds.
      const seedStore = isRefileProfileStore({ jobKind, forceRefresh })
        ? null
        : await storeCardSnapshot({
            cardToStore: seedCardToStore,
            sources: acceptedSources,
            steps: { upsert: "upsert-seed-card", evidence: "record-seed-card-evidence", sections: "record-seed-research-sections", sources: "record-seed-sources" },
            event: { stepId: "seed-card-saved", type: "card.partial", message: "Saved first usable company card", metadata: { firstPayoff } },
            skipNoteId: "skip-underfilled-seed-card",
            // Contact enrichment is dispatched once the enrichment path is decided below (or by the async
            // enrichment worker), so it reads the most complete card and is never double-dispatched.
            contactTrigger: null
          });
      if (seedStore) {
        firstUsableStored = true;
        writeGenerationMilestoneValue(trace, "seedCardMs", seedStore.milestoneMs);
        writeGenerationMilestoneValue(trace, "firstUsableCardMs", seedStore.milestoneMs);
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
        // Extraction and assembly only: synthesize and verify run as their own Inngest steps
        // (synthesize-card, verify-synthesis) below, once this step's pre-synthesis card is
        // stored in trace. Never spread synthesize/verify deps in here, for either mode.
        const generated = await generateCardForDomainWithTrace(domain, {
          researchPlan,
          providerFacts: options.providerFacts ?? providerFacts,
          ...(options.skipBlockEnrichment !== undefined ? { skipBlockEnrichment: options.skipBlockEnrichment } : {}),
          fetchSources: async () => options.sources ?? acceptedSources,
          extractSections: extractSectionsForCard(llmTelemetry.telemetry),
          enrichSections: enrichSectionsForCard(llmTelemetry.telemetry),
          costLines: llmTelemetry.costLines,
        });

        return {
          ok: true as const,
          card: generated.card,
          sections: generated.sections,
          sources: generated.sources,
          tracePatch: generated.tracePatch
        };
      } catch (error) {
        // Same split the synthesize and verify step bodies make: a transient transport failure
        // re-throws so the step layer retries it, while a semantic failure stays a memoized
        // {ok:false} outcome. Swallowing a 429 or a 529 here turned an outage into a permanent
        // run failure and burned the caller's allowance for it.
        if (isTransientLlmError(error)) {
          throw error;
        }
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
    // Set when this run must not write a card at all: a gate block over a slug that already has a
    // filed synthesis read (issue #10). The run still completes normally; it just skips
    // storeCardSnapshot below, so the existing stored card (and its synthesis) is untouched.
    let skipCardStore = false;
    // Set on the sibling case: synthesis ran and the verifier dropped every claim over a slug
    // that already has a filed read. The read is preserved either way, but whether the write
    // happens at all depends on the evidence comparison made once cardToStore exists below.
    let preserveFiledSynthesis = false;

    if (mode === "analysis") {
      currentStage = "evaluate-synthesis-gate";
      // Evaluated ahead of both LLM calls (deterministic, no timestamp) so a gate-blocked run
      // never pays for either. The card mutation this may apply (stamping synthesisWithheld with
      // its own timestamp) still happened inside the just-completed, now-memoized "generate-card"
      // step's card, matching the existing generatedAt-outside-a-step precedent in this file.
      const gateOutcome = evaluateSynthesisGate(generatedCard, { synthesisRequired: true });
      if (gateOutcome.blocked) {
        mergeTracePatch(trace, gateOutcome.tracePatch);
        trace.steps = {
          ...trace.steps,
          "synthesize-card": skippedStep("synthesis gate blocked: insufficient evidence"),
          "verify-synthesis": skippedStep("synthesis gate blocked: insufficient evidence"),
          "fetch-founder-voice": skippedStep("synthesis gate blocked: insufficient evidence"),
          "emphasis-read": skippedStep("synthesis gate blocked: insufficient evidence"),
          "how-it-wins": skippedStep("synthesis gate blocked: insufficient evidence")
        };
        if (existingCardHasSynthesis) {
          skipCardStore = true;
        } else {
          generatedCard = gateOutcome.card;
        }
      } else {
        await recordEvent("synthesis-started", "synthesis.started", "Reading the filed evidence", {}, null);

        currentStage = "synthesize-card";
        const synthesizeResult = await step.run("synthesize-card", async () => {
          const llmTelemetry = createStepLlmTelemetryCollector();
          const result = await timed(() =>
            synthesizeCardStepBody({
              card: generatedCard,
              client: anthropic,
              model: synthesisModel,
              telemetry: llmTelemetry.telemetry
            })
          );
          const llmTracePatch = llmTelemetry.tracePatch();
          return {
            value: result.value,
            tracePatch: {
              ...llmTracePatch,
              steps: {
                "synthesize-card": result.value.ok
                  ? completedStep(result.durationMs)
                  : { status: "failed" as const, durationMs: result.durationMs, message: result.value.error }
              }
            }
          };
        });
        mergeTracePatch(trace, synthesizeResult.tracePatch);
        if (!synthesizeResult.value.ok) {
          throw new Error(synthesizeResult.value.error);
        }
        const draft = synthesizeResult.value.value;

        // The Pay attention to row of the Lens: what the company and its founders are loud about, what
        // never appears in the filed record, and the smallest cited inference that asymmetry
        // supports. Runs between synthesize and verify so its claims ride the existing verify
        // call (packages/pipeline/src/generate-card.ts's verifyCardSynthesisDraft extras) rather
        // than paying for a second verifier round trip.
        //
        // The how-it-wins read runs as a second, concurrent closure below rather than after this
        // one: the monolith judge plus frozen writer cost their own model time, and nothing it
        // reads depends on the founder-voice citations the emphasis closure fetches. Both closures
        // are awaited together and joined once both settle, so a rejection from either always has
        // a handler. Neither writes the other's fields: emphasis owns generatedCard.citations,
        // sourcesToRecord, and trace.emphasis; how-it-wins owns only trace.howItWins.
        //
        // currentStage is the one genuinely shared write. Last-writer-wins is fine for the happy
        // path, but it is wrong for failure attribution: how-it-wins sets it and then awaits for
        // minutes while the emphasis closure overwrites it, so a how-it-wins failure would be
        // filed under "emphasis-read". Each closure therefore records its own stage as it moves,
        // and the join below stamps the FAILING closure's stage onto currentStage right before it
        // rethrows, so trace.failure.stage names the step that actually failed.
        const cardForHowItWins = generatedCard;
        let emphasisStage = "fetch-founder-voice";
        const howItWinsStage = "how-it-wins";

        const runEmphasisPipeline = async (): Promise<EmphasisRead | null> => {
          let emphasisDraft: EmphasisRead | null = null;
          if (emphasisReadEnabled()) {
            const thinFileReason = emphasisThinFileReason(generatedCard);
            if (thinFileReason) {
              emphasisDraft = { status: "thin_file" };
              mergeTracePatch(trace, { emphasis: { enabled: true, status: "thin_file", thinFileReason } });
              trace.steps = {
                ...trace.steps,
                "fetch-founder-voice": skippedStep(`thin file: ${thinFileReason}`),
                "emphasis-read": skippedStep(`thin file: ${thinFileReason}`)
              };
            } else {
              await recordEvent("emphasis-started", "emphasis.started", "Reading what they lead with", {}, null);
              currentStage = emphasisStage = "fetch-founder-voice";
              // A repeat analysis run can already carry fv-prefixed citations on generatedCard
              // (extraction reuse spreads the existing card's citations wholesale) and, separately,
              // on the stored existingCard row that storage will later merge this card against
              // (mergeByKey, last-wins by id). founderVoiceCitations always numbers a fresh batch
              // from 1, so a fresh id can collide with either source. Number this run's fresh set
              // past every fv index already in play so stale and fresh coexist without collision.
              const founderVoiceStartIndex = nextFounderVoiceIndex(generatedCard.citations, existingCard?.citations);
              const founderVoice = await step.run("fetch-founder-voice", async () => {
                const result = await timed(() =>
                  fetchFounderVoiceStepBody({
                    card: generatedCard,
                    env: founderVoiceEnvFromProcess(),
                    startIndex: founderVoiceStartIndex
                  })
                );
                return {
                  value: result.value,
                  tracePatch: { steps: { "fetch-founder-voice": completedStep(result.durationMs) } }
                };
              });
              mergeTracePatch(trace, founderVoice.tracePatch);
              mergeTracePatch(trace, {
                emphasis: {
                  enabled: true,
                  laneCounts: founderVoice.value.laneCounts,
                  laneFailures: founderVoice.value.laneFailures,
                  estimatedLaneCostUsd: founderVoice.value.estimatedCostUsd
                }
              });
              // Additive, never stripped mid-run: the synthesize-card step above already ran against
              // generatedCard's citations as they stood before this fetch, so its draft may
              // legitimately cite a stale fv id from a prior run. Removing that citation here would
              // make it vanish out from under the verifier, silently dropping an otherwise-supported
              // claim. emphasisReadStepBody below narrows only the digests it reads (this run's fresh
              // batch, stale excluded); the pruning that caps cross-run fv accumulation happens once,
              // after verify, once it is safe to know what actually survived (see the prune call
              // below verify-synthesis).
              generatedCard = {
                ...generatedCard,
                citations: [...generatedCard.citations, ...founderVoice.value.citations]
              };
              if (founderVoice.value.sources.length > 0) {
                sourcesToRecord = [...sourcesToRecord, ...founderVoice.value.sources];
              }

              currentStage = emphasisStage = "emphasis-read";
              const emphasisResult = await step.run("emphasis-read", async () => {
                const llmTelemetry = createStepLlmTelemetryCollector();
                const result = await timed(() =>
                  emphasisReadStepBody({
                    card: generatedCard,
                    client: anthropic,
                    model: emphasisModel,
                    telemetry: llmTelemetry.telemetry,
                    freshFounderVoiceCitations: founderVoice.value.citations
                  })
                );
                const llmTracePatch = llmTelemetry.tracePatch();
                return {
                  value: result.value,
                  tracePatch: {
                    ...llmTracePatch,
                    steps: {
                      "emphasis-read": result.value.ok
                        ? completedStep(result.durationMs)
                        : { status: "failed" as const, durationMs: result.durationMs, message: result.value.error }
                    }
                  }
                };
              });
              mergeTracePatch(trace, emphasisResult.tracePatch);
              // A semantic emphasis failure degrades to nothing_notable; it never fails the run.
              emphasisDraft = emphasisResult.value.ok ? emphasisResult.value.value : { status: "nothing_notable" };
            }
          } else {
            trace.steps = {
              ...trace.steps,
              "fetch-founder-voice": skippedStep("EMPHASIS_READ_ENABLED=false"),
              "emphasis-read": skippedStep("EMPHASIS_READ_ENABLED=false")
            };
          }
          return emphasisDraft;
        };

        const runHowItWinsPipeline = async (): Promise<{
          draft: HowItWins | null;
          meta: { editorSkipped?: boolean; fitRetried?: boolean; styleIssueCount?: number; judgment?: HowItWinsJudgment };
        }> => {
          if (!howItWinsEnabled()) {
            trace.steps = { ...trace.steps, "how-it-wins": skippedStep("HOW_IT_WINS_ENABLED=false") };
            return { draft: null, meta: {} };
          }
          // The same gate the emphasis read uses, run in code before any model call, so a thin
          // card pays for none of the judge or writer calls. Read off the pre-founder-voice
          // snapshot, which is the card this read is written from either way.
          const thinFileReason = howItWinsThinFileReason(cardForHowItWins);
          if (thinFileReason) {
            mergeTracePatch(trace, { howItWins: { enabled: true, status: "thin_file", thinFileReason } });
            trace.steps = { ...trace.steps, "how-it-wins": skippedStep(`thin file: ${thinFileReason}`) };
            return { draft: { status: "thin_file" }, meta: {} };
          }

          await recordEvent("how-it-wins-started", "how-it-wins.started", "Reading how it wins", {}, null);
          currentStage = howItWinsStage;
          const howItWinsResult = await step.run("how-it-wins", async () => {
            const llmTelemetry = createStepLlmTelemetryCollector();
            const result = await timed(() =>
              howItWinsStepBody({
                card: cardForHowItWins,
                client: anthropic,
                models: howItWinsModels,
                telemetry: llmTelemetry.telemetry
              })
            );
            const llmTracePatch = llmTelemetry.tracePatch();
            return {
              value: result.value,
              tracePatch: {
                ...llmTracePatch,
                steps: {
                  "how-it-wins": result.value.ok
                    ? completedStep(result.durationMs)
                    : { status: "failed" as const, durationMs: result.durationMs, message: result.value.error }
                }
              }
            };
          });
          mergeTracePatch(trace, howItWinsResult.tracePatch);
          // A semantic how-it-wins failure degrades to nothing_stands_out; it never fails the run.
          if (!howItWinsResult.value.ok) {
            return {
              draft: { status: "nothing_stands_out", inQuestion: [] },
              meta: howItWinsResult.value.judgment ? { judgment: howItWinsResult.value.judgment } : {}
            };
          }
          const stage = howItWinsResult.value.value;
          return {
            draft: stage.read,
            meta: {
              editorSkipped: stage.editorSkipped,
              fitRetried: stage.fitRetried,
              styleIssueCount: stage.styleIssues.length,
              ...(stage.judgment ? { judgment: stage.judgment } : {})
            }
          };
        };

        // allSettled rather than all, with the rejection rethrown by hand: a transient failure in
        // either closure must still fail the run (the same way a transient emphasis failure
        // always has), but waiting for both to settle first means the loser can never still be
        // writing trace, generatedCard, or a progress event while the failure path is already
        // unwinding. Every promise gets a handler either way, so neither rejection sits unhandled.
        const [emphasisSettled, howItWinsSettled] = await Promise.allSettled([
          runEmphasisPipeline(),
          runHowItWinsPipeline()
        ]);
        if (emphasisSettled.status === "rejected") {
          // Only one reason can be thrown. When both closures failed, the discarded one would
          // otherwise vanish from every surface, so it is logged before the emphasis error wins.
          if (howItWinsSettled.status === "rejected") {
            console.warn("[generation] how-it-wins also failed; rethrowing the emphasis failure instead", {
              slug,
              stage: howItWinsStage,
              error: boundedErrorMessage(howItWinsSettled.reason)
            });
          }
          currentStage = emphasisStage;
          throw emphasisSettled.reason;
        }
        if (howItWinsSettled.status === "rejected") {
          currentStage = howItWinsStage;
          throw howItWinsSettled.reason;
        }
        const emphasisDraft = emphasisSettled.value;
        const howItWinsDraft = howItWinsSettled.value.draft;
        const howItWinsMeta = howItWinsSettled.value.meta;

        await recordEvent(
          "verify-started",
          "verify.started",
          `Verifying ${draft.claimCountBeforeVerify} claim${draft.claimCountBeforeVerify === 1 ? "" : "s"} against sources`,
          { claimCount: draft.claimCountBeforeVerify },
          null
        );

        currentStage = "verify-synthesis";
        const verifyResult = await step.run("verify-synthesis", async () => {
          const llmTelemetry = createStepLlmTelemetryCollector();
          const result = await timed(() =>
            verifySynthesisStepBody({
              card: generatedCard,
              draft,
              ...(emphasisDraft?.status === "read" ? { emphasisRead: emphasisDraft } : {}),
              ...(howItWinsDraft?.status === "read" ? { howItWins: howItWinsDraft } : {}),
              client: anthropic,
              model: verifierModel,
              telemetry: llmTelemetry.telemetry,
              synthesisRequired: true
            })
          );
          const llmTracePatch = llmTelemetry.tracePatch();
          return {
            value: result.value,
            tracePatch: {
              ...llmTracePatch,
              steps: {
                "verify-synthesis": result.value.ok
                  ? completedStep(result.durationMs)
                  : { status: "failed" as const, durationMs: result.durationMs, message: result.value.error }
              }
            }
          };
        });
        mergeTracePatch(trace, verifyResult.tracePatch);
        if (!verifyResult.value.ok) {
          throw new Error(verifyResult.value.error);
        }

        const verified = verifyResult.value.value;
        if (verified.tracePatch.synthesis) {
          mergeTracePatch(trace, {
            synthesis: {
              ...verified.tracePatch.synthesis,
              ...(gateOutcome.gate ? { gate: gateOutcome.gate } : {})
            }
          });
        }
        const survivedClaimCount = verified.tracePatch.synthesis?.claimCountAfterVerify ?? 0;
        await recordEvent(
          "verify-complete",
          "verify.complete",
          `${survivedClaimCount} claim${survivedClaimCount === 1 ? "" : "s"} survived`,
          { claimCount: survivedClaimCount },
          null
        );

        // verified.emphasisRead is independent of verified.synthesis: the verifier evaluates the
        // emphasis claims in the same call regardless of whether every synthesis claim survived,
        // so this is computed unconditionally, before deciding whether the fresh synthesis (and
        // therefore the fresh emphasis read riding on it, attached below) actually lands anywhere.
        const finalEmphasis: EmphasisRead | undefined = emphasisDraft
          ? emphasisDraft.status === "read"
            ? verified.emphasisRead ?? { status: "nothing_notable" }
            : emphasisDraft
          : undefined;
        // Same shape for the how-it-wins read: a "read" draft takes whatever the verifier left of
        // it (a fully dropped one comes back as nothing_stands_out), any other draft passes
        // through as filed, and no draft at all means the read never ran this run.
        const finalHowItWins: HowItWins | undefined = howItWinsDraft
          ? howItWinsDraft.status === "read"
            ? verified.howItWins ?? { status: "nothing_stands_out", inQuestion: [] }
            : howItWinsDraft
          : undefined;

        if (verified.synthesis) {
          const { synthesisWithheld: _synthesisWithheld, ...cardWithoutWithheld } = generatedCard;
          generatedCard = {
            ...cardWithoutWithheld,
            synthesis: {
              ...verified.synthesis,
              ...(finalEmphasis ? { emphasisRead: finalEmphasis } : {}),
              ...(finalHowItWins ? { howItWins: finalHowItWins } : {})
            }
          };
        } else if (existingCardHasSynthesis) {
          // All claims dropped, but the slug already has a filed read: preserve it (issue #10)
          // instead of storing an empty result over it. The store decision is made below, once
          // the merged card exists and its evidence can be compared against the stored one. A
          // fresh finalEmphasis computed above rides on this dropped synthesis and never attaches
          // anywhere; the event below reports that honestly instead of "Emphasis read filed".
          preserveFiledSynthesis = true;
        } else {
          // All claims dropped and there is no existing read to fall back on: converge honestly
          // instead of throwing and forcing every re-click to re-pay for synthesis and fail the
          // same way. Stamps a synthesisWithheld record with the new "no-claims-survived" reason
          // so the extension renders it as a withheld read and the route's free pre-check can
          // answer a re-click for free once the evidence stops moving. A fresh finalEmphasis
          // computed above never attaches here either, same as the preserve branch above.
          generatedCard = withheldCardForNoSurvivors(generatedCard);
        }

        // A freshly filed "read" only actually lands on the stored card on the verified.synthesis
        // branch above (the one place that attaches finalEmphasis to generatedCard.synthesis); the
        // preserve-old-read and no-survivors branches both discard the fresh synthesis it rides on
        // wholesale, so a "read" there never lands anywhere. Report it as discarded, not filed, so
        // the event/trace trail matches what the stored card actually ends up carrying.
        const emphasisDiscarded = finalEmphasis?.status === "read" && !verified.synthesis;
        if (finalEmphasis) {
          const reportedStatus = emphasisDiscarded ? "discarded" : finalEmphasis.status;
          mergeTracePatch(trace, {
            emphasis: {
              enabled: true,
              status: reportedStatus,
              ...(verified.emphasisDropReason ? { dropReason: verified.emphasisDropReason } : {})
            }
          });
          await recordEvent(
            "emphasis-complete",
            "emphasis.complete",
            emphasisDiscarded
              ? "Emphasis read computed but not kept"
              : finalEmphasis.status === "read" ? "Emphasis read filed" : "No emphasis read",
            { status: reportedStatus, ...(verified.emphasisDropReason ? { dropReason: verified.emphasisDropReason } : {}) },
            null
          );
        }

        // Same discard rule as the emphasis read above: a freshly filed "read" only lands on the
        // stored card via the verified.synthesis branch, so on the preserve-old-read and
        // no-survivors branches it is reported as discarded rather than filed.
        const howItWinsDiscarded = finalHowItWins?.status === "read" && !verified.synthesis;
        if (finalHowItWins) {
          const reportedStatus = howItWinsDiscarded ? "discarded" : finalHowItWins.status;
          mergeTracePatch(trace, {
            howItWins: {
              enabled: true,
              status: reportedStatus,
              ...(verified.howItWinsDropReason ? { dropReason: verified.howItWinsDropReason } : {}),
              ...howItWinsMeta
            }
          });
          await recordEvent(
            "how-it-wins-complete",
            "how-it-wins.complete",
            howItWinsDiscarded
              ? "How it wins computed but not kept"
              : finalHowItWins.status === "read" ? "How it wins filed" : "No how-it-wins read",
            {
              status: reportedStatus,
              ...(verified.howItWinsDropReason ? { dropReason: verified.howItWinsDropReason } : {})
            },
            null
          );
        }

        // generatedCard.citations stays additive through the whole run above (nothing visible to
        // the draft or the verifier vanishes mid-run): the fv-citation prune that caps cross-run
        // accumulation runs once, downstream, inside prepareCardSnapshotForStorage
        // (apps/web/src/inngest/card-storage.ts), keyed to the MERGED card's own synthesis rather
        // than to this pre-merge working card. Pruning here instead would only be undone by that
        // merge's own citations union (its mergeByKey fallback re-adds anything missing from the
        // preferred side), which is exactly the bug that motivated moving the prune downstream.
      }

      generatedCard = cardWithTraceCost(generatedCard, trace);
    }

    // A re-file store's fresh card stands alone: excluding the run-start card from the merge base
    // is what makes old synthesis, old expandedDescription, old citations, old signals, old
    // comparables, and old person data drop instead of surviving through preserveExistingBasics.
    let cardToStore = prepareCardSnapshotForStorage(mode, mergeBaseCardForStore(existingCard, { jobKind, forceRefresh }), generatedCard);
    let analysisReadyMs: number | null = null;
    // Only the preserve branch below ever clears this. Every other path writes on today's terms.
    let extendSynthesisTtl = true;

    if (preserveFiledSynthesis) {
      // The verifier dropped every claim over a slug that already has a filed read. The merged
      // card carries that read forward either way, so the write always happens and this run's
      // fresher basics facts land. What the evidence decides is the synthesis TTL. Matching
      // evidence means the run found nothing new, so the filed read is still the honest best
      // answer and refreshing its TTL is what stops the next post-TTL click from re-paying
      // synthesis and verification for a verdict that cannot change. When the evidence moved,
      // store without extending: the read stays readable until its original expiry, and the next
      // click after that looks again.
      extendSynthesisTtl = existingCard !== null
        && synthesisEvidenceFingerprint(existingCard) === synthesisEvidenceFingerprint(cardToStore);
    }

    if (mode === "analysis") {
      // Every analysis run records the evidence it read, whatever the outcome. The hash has to
      // describe the card as stored, not the pre-merge generated one: /api/generate's free
      // re-click check hashes the stored card and compares it against this value, so stamping
      // anything else guarantees a miss and another paid run.
      trace.synthesis = {
        required: true,
        produced: false,
        claimCountBeforeVerify: 0,
        claimCountAfterVerify: 0,
        ...trace.synthesis,
        evidenceFingerprint: synthesisEvidenceFingerprint(cardToStore)
      };
    }

    // skipCardStore (issue #10): the synthesis gate blocked this run over a slug that already
    // carries a good read, so nothing this run produced is worth writing. No upsert, no
    // evidence/sections/sources write, no analysisReadyMs stamp; the run still completes below.
    const generatedStore = skipCardStore ? null : await storeCardSnapshot({
      cardToStore,
      sources: sourcesToRecord,
      steps: { upsert: "upsert-card", evidence: "record-card-evidence", sections: "record-research-sections", sources: "record-sources" },
      event: { stepId: "card-saved", type: "card.saved", message: "Saved cited company card" },
      skipNoteId: "skip-underfilled-generated-card",
      // Contacts are dispatched below once the enrichment path is decided (or by the async enrichment
      // worker), so they read the most complete card and are dispatched exactly once.
      contactTrigger: null,
      extendSynthesisTtl
    });
    if (generatedStore) {
      cardToStore = generatedStore.card;
      if (mode === "basics") {
        firstUsableStored = true;
        writeGenerationMilestoneValue(trace, "firstUsableCardMs", generatedStore.milestoneMs);
      } else {
        analysisReadyMs = generatedStore.milestoneMs;
      }
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
        if (!cardToStore.expandedDescription && expandedDescriptionEnabled()) {
          // No block work remains, but the expanded description is filed by the block worker.
          // Its early path files it and dispatches contacts itself, so contacts stay
          // dispatched exactly once and read the description-bearing card.
          await step.sendEvent(
            "request-block-enrichment",
            buildBlockEnrichmentRequestedEvent({
              domain,
              slug,
              requestedAtMs,
              parentGenerationRunId: generationRunDbId,
              parentInngestRunId: trace.inngest?.runId ?? null
            })
          );
          trace.steps = { ...trace.steps, "request-block-enrichment": completedStep(0) };
        } else {
          await requestContactEnrichmentForStoredCard(cardToStore, "stored-card");
        }
      } else if (firstUsableStored) {
        // A first-usable card is already stored, so the deeper block enrichment can run in an async
        // worker. Dispatching it frees this Inngest concurrency slot at first usable instead of
        // holding it through the ~70s enrichment, which is what lets queued generation requests start
        // sooner. The async worker stores the enriched card and dispatches contact enrichment.
        await step.sendEvent(
          "request-block-enrichment",
          buildBlockEnrichmentRequestedEvent({
            domain,
            slug,
            requestedAtMs,
            parentGenerationRunId: generationRunDbId,
            parentInngestRunId: trace.inngest?.runId ?? null
          })
        );
        trace.steps = {
          ...trace.steps,
          "request-block-enrichment": completedStep(0),
          "fetch-enrichment-sources": skippedStep("dispatched async card enrichment"),
          "enrich-card": skippedStep("dispatched async card enrichment")
        };
        await recordEvent("block-enrichment-requested", "source.enrichment", "Requested async card enrichment", {
          missingBlocks: lateEnrichmentBlocks
        }, null);
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
          skippedProbeNames: lateEnrichmentSkipProbeNames,
          sources: sourceEventSummaries(enrichmentSourceResult.value.sources)
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

        // Same exclusion as the generated-card merge above: a re-file's fresh card stands alone.
        cardToStore = prepareCardForStorage(mode, mergeBaseCardForStore(existingCard, { jobKind, forceRefresh }), generatedCard);
        assertTerminalCardQuality(mode, cardToStore);
        // Same reasoning as the complete-blocks branch: when the description is missing, the
        // block worker files it and owns the contact dispatch, so it is not triggered here.
        const descriptionNeedsWorker = !cardToStore.expandedDescription && expandedDescriptionEnabled();
        const enrichedStore = await storeCardSnapshot({
          cardToStore,
          sources: sourcesToRecord,
          steps: { upsert: "upsert-enriched-card", evidence: "record-enriched-card-evidence", sections: "record-enriched-research-sections", sources: "record-enriched-sources" },
          event: { stepId: "enriched-card-saved", type: "card.enriched", message: "Saved enriched company card" },
          skipNoteId: "skip-underfilled-enriched-card",
          contactTrigger: descriptionNeedsWorker ? null : "enriched-card"
        });
        if (enrichedStore) {
          cardToStore = enrichedStore.card;
          writeGenerationMilestoneValue(trace, "firstUsableCardMs", enrichedStore.milestoneMs);
          if (descriptionNeedsWorker) {
            await step.sendEvent(
              "request-block-enrichment",
              buildBlockEnrichmentRequestedEvent({
                domain,
                slug,
                requestedAtMs,
                parentGenerationRunId: generationRunDbId,
                parentInngestRunId: trace.inngest?.runId ?? null
              })
            );
            trace.steps = { ...trace.steps, "request-block-enrichment": completedStep(0) };
          }
        }
      }
    }

    if (mode === "analysis" && analysisReadyMs !== null) {
      writeGenerationMilestoneValue(trace, "analysisReadyMs", analysisReadyMs);
    }

    const walletSnapshotAfter = await step.run("wallet-snapshot-after", () => safeAgentcashWalletSnapshot());
    applyStableenrichWalletTrace(trace, walletSnapshotBefore, walletSnapshotAfter);
    applySwallowedStepWarnings();
    if (generationRunDbId) {
      await step.run("persist-generation-trace-before-complete", () =>
        updateGenerationRunTrace(db, {
          id: generationRunDbId,
          patch: (existingTrace) => mergeGenerationTrace(existingTrace, trace)
        }).catch((error) => {
          // Trace persistence is best-effort observability. It must never block the
          // terminal status write below, or a trace-write failure strands the run "running".
          console.warn("[generation] trace persist before complete failed; completing anyway", error);
          return null;
        })
      );
    }
    const finalGenerationCostUsd = generationRunLlmCostUsd(trace, cardToStore.generationCostUsd);
    await step.run("mark-generation-complete", async () => {
      if (generationRunDbId) {
        const alphaSettlement = await settleAlphaRunRequest(db, {
          generationRunId: generationRunDbId,
          outcome:
            mode === "analysis" && cardToStore.synthesisWithheld
              ? "withheld"
              : "complete",
          costUsd: String(finalGenerationCostUsd)
        });
        // `applied`, not truthiness: settle returns a record with applied:false when the request
        // already carries an outcome, and treating that as ownership would leave the run row in
        // whatever status it held. Falling through is safe because transitionGenerationRunById is
        // guarded on the row still being active, so it refuses to resurrect a retired run.
        if (alphaSettlement?.applied) {
          return alphaSettlement;
        }
        return transitionGenerationRunById(db, {
            id: generationRunDbId,
            from: ["queued", "running"],
            status: "complete",
            costUsd: finalGenerationCostUsd,
            ...(trace.inngest?.eventId ? { inngestEventId: trace.inngest.eventId } : {}),
            ...(trace.inngest?.runId ? { inngestRunId: trace.inngest.runId } : {})
          });
      }
      return markGenerationRun(db, {
            slug,
            domain,
            mode,
            jobKind,
            status: "complete",
            costUsd: finalGenerationCostUsd,
            traceJson: trace,
            ...(trace.inngest?.eventId ? { inngestEventId: trace.inngest.eventId } : {}),
            ...(trace.inngest?.runId ? { inngestRunId: trace.inngest.runId } : {})
          });
    });
    await recordEvent("generation-complete", "generation.complete", "Research run complete", {
      costUsd: finalGenerationCostUsd,
      mode
    }, null);

    return { slug: cardToStore.slug, mode };
  } catch (error) {
    trace.failure = {
      code: generationFailureCode(error),
      stage: currentStage,
      message: boundedErrorMessage(error),
      ...(error instanceof Error ? { className: error.name } : {}),
      ...(rawErrorDetail(error) !== undefined ? { detail: rawErrorDetail(error) } : {})
    };
    const walletSnapshotAfter = await step.run("wallet-snapshot-after", () => safeAgentcashWalletSnapshot());
    applyStableenrichWalletTrace(trace, walletSnapshotBefore, walletSnapshotAfter);
    applySwallowedStepWarnings();
    if (generationRunDbId) {
      await step.run("persist-generation-trace-before-fail", () =>
        updateGenerationRunTrace(db, {
          id: generationRunDbId,
          patch: (existingTrace) => mergeGenerationTrace(existingTrace, trace)
        }).catch((error) => {
          // Same invariant as the success path: a failed trace write must not stop the
          // run from reaching a terminal "failed" status below.
          console.warn("[generation] trace persist before fail failed; marking failed anyway", error);
          return null;
        })
      );
    }
    await step.run("mark-generation-failed", async () => {
      if (generationRunDbId) {
        const alphaSettlement = await settleAlphaRunRequest(db, {
          generationRunId: generationRunDbId,
          outcome: "failed",
          failureCode: trace.failure?.code ?? "unknown",
          costUsd: String(generationRunLlmCostUsd(trace)),
          error: boundedErrorMessage(error)
        });
        // Same reasoning as the success path: an unapplied settlement is not ownership, and the
        // id-guarded transition below refuses a row that is already terminal.
        if (alphaSettlement?.applied) {
          return alphaSettlement;
        }
        return transitionGenerationRunById(db, {
            id: generationRunDbId,
            from: ["queued", "running"],
            status: "failed",
            error: boundedErrorMessage(error),
            costUsd: generationRunLlmCostUsd(trace),
            ...(trace.inngest?.eventId ? { inngestEventId: trace.inngest.eventId } : {}),
            ...(trace.inngest?.runId ? { inngestRunId: trace.inngest.runId } : {})
          });
      }
      return markGenerationRun(db, {
            slug,
            domain,
            mode,
            jobKind,
            status: "failed",
            error: boundedErrorMessage(error),
            costUsd: generationRunLlmCostUsd(trace),
            traceJson: trace,
            ...(trace.inngest?.eventId ? { inngestEventId: trace.inngest.eventId } : {}),
            ...(trace.inngest?.runId ? { inngestRunId: trace.inngest.runId } : {})
          });
    });
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
};

export const generateCardFunction = inngest.createFunction(
  {
    id: "generate-card",
    triggers: { event: "card/generate.requested" }
  },
  generateCardHandler
);
