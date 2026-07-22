import {
  companySlugFromDomain,
  buildFirstPayoff,
  type ColdStartCard,
  type FirstPayoff,
  type GenerationTrace,
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
  isCardSignalsFresh,
  markGenerationRun,
  markResearchSectionFailed,
  recordResearchRunEvent,
  recordCardEvidence,
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
  type EvidenceLedgerEntry,
  type ExtractedCardSections
} from "@cold-start/pipeline";
import {
  type ProviderFactCandidate,
  type ProviderSource
} from "@cold-start/providers";
import { canonicalCompanyDomain } from "../lib/domain";
import { webEnv } from "../lib/web-env";
import { boundedErrorMessage } from "../lib/errors";
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
  generationRunAnthropicCostUsd,
  parseEventSectionId,
  progressSourceCategories,
  rawDomainForRun,
  rawSlugForRun,
  safeAgentcashWalletSnapshot,
  sourceEventDomain,
  synthesizeCardStepBody,
  timed,
  verifySynthesisStepBody,
  type GenerationMode
} from "./generation-helpers";
import { runResearchSectionJobStep } from "./research-section-generation";
import {
  assertTerminalCardQuality,
  canStoreCardSnapshot,
  noteSkippedUnderfilledSnapshot,
  prepareCardForStorage,
  prepareCardSnapshotForStorage
} from "./card-storage";
import {
  analysisSourceRefreshModeFromProcess,
  contactEnrichmentEnabled,
  directExaEnvFromProcess,
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
  }): Promise<{ milestoneMs: number } | null> => {
    if (!canStoreCardSnapshot(mode, input.cardToStore)) {
      noteSkippedUnderfilledSnapshot(trace, input.skipNoteId, input.cardToStore);
      return null;
    }
    const stored = await step.run(input.steps.upsert, async () => ({
      row: await upsertCard(db, input.cardToStore),
      milestoneMs: generationMilestoneElapsedMs(requestedAtMs)
    }));
    const rowId = stored.row.id;
    await step.run(input.steps.evidence, () => recordCardEvidence(db, rowId, input.cardToStore));
    await step.run(input.steps.sections, () => upsertResearchSections(db, deriveLegacyResearchSectionsFromCard(input.cardToStore)));
    await step.run(input.steps.sources, () => recordSourcesForCard(db, rowId, input.sources));
    await recordEvent(input.event.stepId, input.event.type, input.event.message, {
      citationCount: input.cardToStore.citations.length,
      sourceCount: input.sources.length,
      ...(input.event.metadata ?? {})
    }, null);
    if (input.contactTrigger) {
      await requestContactEnrichmentForStoredCard(input.cardToStore, input.contactTrigger);
    }
    return { milestoneMs: stored.milestoneMs };
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
    const reuseExistingForAnalysis = mode === "analysis" && existingCard !== null && hasInvestorUsableProfile(existingCard);

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
          loadStoredSourcesForSkip: () => findSourcesBySlug(db, slug).then(providerSourcesFromStoredSources)
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
      sources: acceptedSources.slice(0, 12).map((source) => ({
        url: source.url,
        domain: sourceEventDomain(source.url),
        title: source.title,
        sourceType: source.sourceType,
        imageUrl: source.imageUrl ?? null
      }))
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
      const seedStore = await storeCardSnapshot({
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

    if (mode === "analysis") {
      currentStage = "evaluate-synthesis-gate";
      // Evaluated ahead of both LLM calls (deterministic, no timestamp) so a gate-blocked run
      // never pays for either. The card mutation this may apply (stamping synthesisWithheld with
      // its own timestamp) still happened inside the just-completed, now-memoized "generate-card"
      // step's card, matching the existing generatedAt-outside-a-step precedent in this file.
      const gateOutcome = evaluateSynthesisGate(generatedCard, { synthesisRequired: true });
      if (gateOutcome.blocked) {
        generatedCard = gateOutcome.card;
        mergeTracePatch(trace, gateOutcome.tracePatch);
        trace.steps = {
          ...trace.steps,
          "synthesize-card": skippedStep("synthesis gate blocked: insufficient evidence"),
          "verify-synthesis": skippedStep("synthesis gate blocked: insufficient evidence")
        };
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

        if (verified.synthesis) {
          const { synthesisWithheld: _synthesisWithheld, ...cardWithoutWithheld } = generatedCard;
          generatedCard = { ...cardWithoutWithheld, synthesis: verified.synthesis };
        } else {
          throw new Error("No synthesis claims survived verification");
        }
      }

      generatedCard = cardWithTraceCost(generatedCard, trace);
    }

    let cardToStore = prepareCardSnapshotForStorage(mode, existingCard, generatedCard);
    let analysisReadyMs: number | null = null;

    const generatedStore = await storeCardSnapshot({
      cardToStore,
      sources: sourcesToRecord,
      steps: { upsert: "upsert-card", evidence: "record-card-evidence", sections: "record-research-sections", sources: "record-sources" },
      event: { stepId: "card-saved", type: "card.saved", message: "Saved cited company card" },
      skipNoteId: "skip-underfilled-generated-card",
      // Contacts are dispatched below once the enrichment path is decided (or by the async enrichment
      // worker), so they read the most complete card and are dispatched exactly once.
      contactTrigger: null
    });
    if (generatedStore) {
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
        await requestContactEnrichmentForStoredCard(cardToStore, "stored-card");
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
        const enrichedStore = await storeCardSnapshot({
          cardToStore,
          sources: sourcesToRecord,
          steps: { upsert: "upsert-enriched-card", evidence: "record-enriched-card-evidence", sections: "record-enriched-research-sections", sources: "record-enriched-sources" },
          event: { stepId: "enriched-card-saved", type: "card.enriched", message: "Saved enriched company card" },
          skipNoteId: "skip-underfilled-enriched-card",
          contactTrigger: "enriched-card"
        });
        if (enrichedStore) {
          writeGenerationMilestoneValue(trace, "firstUsableCardMs", enrichedStore.milestoneMs);
        }
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
        }).catch((error) => {
          // Trace persistence is best-effort observability. It must never block the
          // terminal status write below, or a trace-write failure strands the run "running".
          console.warn("[generation] trace persist before complete failed; completing anyway", error);
          return null;
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
        }).catch((error) => {
          // Same invariant as the success path: a failed trace write must not stop the
          // run from reaching a terminal "failed" status below.
          console.warn("[generation] trace persist before fail failed; marking failed anyway", error);
          return null;
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
};

export const generateCardFunction = inngest.createFunction(
  {
    id: "generate-card",
    triggers: { event: "card/generate.requested" }
  },
  generateCardHandler
);
