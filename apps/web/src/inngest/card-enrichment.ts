import {
  companySlugFromDomain,
  deriveLegacyResearchSectionsFromCard,
  type ColdStartCard,
  type GenerationTrace
} from "@cold-start/core";
import {
  createDb,
  findCardBySlug,
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
  extractCompanyBlockClaims,
  fallbackResearchPlan,
  modelForStage,
  synthesizeExpandedDescription,
} from "@cold-start/llm";
import {
  applyProviderFactCandidates,
  blocksNeedingEnrichmentForSections,
  buildExpandedDescriptionEvidence,
  cardWithExtractedSections,
  enrichExtractedSectionsForDomain,
  expandedDescriptionCardFacts,
  extractedCardSectionsSchema,
} from "@cold-start/pipeline";
import { stableenrichEnvFromProcess } from "./worker-env";
import { canonicalCompanyDomain } from "../lib/domain";
import { webEnv } from "../lib/web-env";
import { boundedErrorMessage, rawErrorDetail } from "../lib/errors";
import { generationFailureCode } from "../lib/failure-code";
import { pipelineBlockPatch } from "./block-enrichment-patch";
import {
  assertTerminalCardQuality,
  canStoreCardSnapshot,
  mutateCardWithRetry,
  noteSkippedUnderfilledSnapshot,
  prepareCardForStorage
} from "./card-storage";
import { inngest, type WorkerEventContext } from "./client";
import { createStepLlmTelemetryCollector, rawSlugForRun, stringValue, timed } from "./generation-helpers";
import { backgroundConcurrencyLimit, contactEnrichmentEnabled, expandedDescriptionEnabled } from "./worker-env";
import {
  buildContactEnrichmentRequestedEvent,
  cardHasContactTargets
} from "./contact-enrichment";
import {
  completedStep,
  mergeGenerationTrace,
  mergeTracePatch,
  requestedAtMsFromGenerationEvent,
  skippedStep
} from "./generation-trace";
import {
  agentcashBudgetCeilingUsd,
  applyStableenrichEndpointYield,
  mergeEndpointFactCounts,
  remainingAgentcashBudgetUsd
} from "./provider-trace";
import {
  fetchLateEnrichmentSources,
  mergeSources,
  providerSourcesFromStoredSources,
  recordSourcesForCard,
  sectionsWithSourceCitations,
  stableenrichLateEnrichmentSkipsForBlocks
} from "./source-fetching";

const BLOCK_ENRICHMENT_EVENT_NAME = "card/block-enrichment.requested" as const;

// The async block-enrichment runs the deep card enrichment (descriptions, signals, comparables,
// fuller funding/team) AFTER the main worker has already stored a first-usable card. Moving it off
// the main worker frees that Inngest concurrency slot at first-usable instead of holding it for the
// full ~70s enrichment, so queued generation requests start sooner. The mapping below mirrors the
// rare in-worker fallback in functions.ts (when the generated card misses the public gate, enrichment
// is still synchronous because the enriched card is then the first usable one).
export function buildBlockEnrichmentRequestedEvent(input: {
  domain: string;
  slug: string;
  requestedAtMs: number;
  parentGenerationRunId?: string | null;
  parentInngestRunId?: string | null;
}) {
  return {
    name: BLOCK_ENRICHMENT_EVENT_NAME,
    data: {
      domain: input.domain,
      slug: input.slug,
      requestedAtMs: input.requestedAtMs,
      ...(input.parentGenerationRunId ? { parentGenerationRunId: input.parentGenerationRunId } : {}),
      ...(input.parentInngestRunId ? { parentInngestRunId: input.parentInngestRunId } : {})
    }
  };
}

const cardEnrichmentConcurrency = backgroundConcurrencyLimit("INNGEST_CARD_ENRICHMENT_CONCURRENCY");

export const cardEnrichmentHandler = async ({ event, runId, step }: WorkerEventContext) => {
  const runtimeEnv = webEnv();
  const db = createDb(runtimeEnv.DATABASE_URL);
  const requestedAtMs = requestedAtMsFromGenerationEvent(event);
  const parentGenerationRunId = stringValue(event.data.parentGenerationRunId);
  const parentInngestRunId = stringValue(event.data.parentInngestRunId);
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
  let slug = rawSlugForRun(event.data.slug, event.data.domain);
  let currentStage = "canonicalize-domain";
  let contactRequested = false;

  const eventRunId = () => parentGenerationRunId ?? trace.inngest?.runId ?? `enrich:${slug}`;
  const recordEvent = (name: string, type: string, message: string, metadata: Record<string, unknown> = {}) =>
    step.run(`enrich-event-${name}`, () =>
      recordResearchRunEvent(db, { runId: eventRunId(), slug, domain, sectionId: null, type, message, metadata }).catch(() => null)
    );

  const patchParentTrace = async () => {
    if (!parentGenerationRunId) {
      return;
    }
    await step.run("update-parent-enrichment-trace", () =>
      updateGenerationRunTrace(db, {
        id: parentGenerationRunId,
        patch: (existingTrace) => mergeGenerationTrace(existingTrace, trace)
      }).catch((error) => {
        // Best-effort: a parent trace patch must never fail enrichment or strand the parent run.
        console.warn("[card-enrichment] parent trace patch failed; continuing", error);
        return null;
      })
    );
  };

  // Dispatch contact enrichment after the enriched card is stored, so contact enrichment reads the
  // block-enriched card and the two async card writes stay serial (no clobber).
  const requestContactEnrichment = async (card: ColdStartCard) => {
    if (contactRequested) {
      return;
    }
    contactRequested = true;
    if (!contactEnrichmentEnabled(runtimeEnv)) {
      trace.steps = { ...trace.steps, "request-contact-enrichment": skippedStep("CONTACT_ENRICHMENT_ENABLED=false") };
      return;
    }
    if (!cardHasContactTargets(card, runtimeEnv.CONTACT_ENRICHMENT_TIER)) {
      trace.steps = { ...trace.steps, "request-contact-enrichment": skippedStep("no named people needing work email yet") };
      return;
    }
    await step.sendEvent(
      "request-contact-enrichment",
      buildContactEnrichmentRequestedEvent({
        domain,
        slug,
        requestedAtMs,
        tier: runtimeEnv.CONTACT_ENRICHMENT_TIER,
        parentGenerationRunId,
        parentInngestRunId
      })
    );
    trace.steps = { ...trace.steps, "request-contact-enrichment": completedStep(0) };
    await recordEvent("contact-enrichment-requested", "contacts.requested", "Requested async contact enrichment", {
      tier: runtimeEnv.CONTACT_ENRICHMENT_TIER,
      trigger: "block-enrichment"
    });
  };

  // Best-effort long-form description behind the header's "(more)" affordance, generated here
  // so the basics critical path pays zero extra latency. A suppressed or failed draft falls
  // back to the short description and never blocks the contact dispatch that follows.
  const ensureExpandedDescription = async (
    card: ColdStartCard,
    sources: Array<{ url: string; title: string; rawText: string }>
  ): Promise<ColdStartCard> => {
    if (card.expandedDescription) {
      return card;
    }
    if (!expandedDescriptionEnabled()) {
      trace.steps = { ...trace.steps, "expand-description": skippedStep("EXPANDED_DESCRIPTION_ENABLED=false") };
      return card;
    }

    const described = await step.run("expand-description", async () => {
      const llmTelemetry = createStepLlmTelemetryCollector();
      const result = await timed(async () => {
        try {
          const synthesized = await synthesizeExpandedDescription({
            client: createAnthropicClient(),
            model: modelForStage("expanded_description", anthropicModel()),
            evidence: {
              companyName: card.identity.name.value ?? domain,
              domain,
              cardFacts: expandedDescriptionCardFacts(card),
              sources: buildExpandedDescriptionEvidence({ card, sources })
            },
            telemetry: llmTelemetry.telemetry
          });
          return {
            ok: true as const,
            description: synthesized.expandedDescription,
            suppressionReason: synthesized.suppressionReason
          };
        } catch (error) {
          return { ok: false as const, error: boundedErrorMessage(error) };
        }
      });
      return {
        value: result.value,
        tracePatch: {
          ...llmTelemetry.tracePatch(),
          steps: {
            "expand-description": result.value.ok
              ? {
                  status: "complete" as const,
                  durationMs: result.durationMs,
                  // A suppressed draft is a completed call with a fallback outcome; the reason
                  // must be readable from the trace, or prod suppressions are silent.
                  ...(result.value.suppressionReason ? { message: `draft suppressed: ${result.value.suppressionReason}` } : {})
                }
              : { status: "failed" as const, durationMs: result.durationMs, message: result.value.error }
          }
        }
      };
    });
    mergeTracePatch(trace, described.tracePatch);
    if (!described.value.ok || !described.value.description) {
      return card;
    }

    const description = described.value.description;
    const stored = await step.run("store-expanded-description", () =>
      mutateCardWithRetry(db, slug, (current) => ({ ...current, expandedDescription: description }))
    );
    await recordEvent("expanded-description-saved", "card.enriched", "Filed the expanded company description", {
      paragraphCount: description.paragraphs.length,
      citationCount: description.citationIds.length
    });
    return stored?.card ?? { ...card, expandedDescription: description };
  };

  try {
    domain = canonicalCompanyDomain(event.data.domain);
    slug = companySlugFromDomain(domain);
  } catch (error) {
    trace.failure = { code: generationFailureCode(error), stage: currentStage, message: boundedErrorMessage(error), ...(error instanceof Error ? { className: error.name } : {}), ...(rawErrorDetail(error) !== undefined ? { detail: rawErrorDetail(error) } : {}) };
    // enrichment.failed, not generation.failed: these events ride the parent run's trail, and
    // the parent basics run is already complete. Its own type keeps a background failure from
    // reading as a failed generation (the extension scopes run-level failure types only).
    await recordEvent("invalid-domain", "enrichment.failed", boundedErrorMessage(error));
    throw error;
  }

  try {
    currentStage = "load-card";
    const existingCard = await step.run("load-card", () => findCardBySlug(db, slug, { allowStale: true }));
    if (!existingCard) {
      trace.steps = { ...trace.steps, "enrich-card": skippedStep("card not found") };
      await recordEvent("missing-card", "generation.skipped", "No stored card found for enrichment");
      await patchParentTrace();
      return { slug, skipped: "card_not_found" };
    }

    currentStage = "load-sources";
    const acceptedSources = await step.run("load-sources", async () =>
      providerSourcesFromStoredSources(await findSourcesBySlug(db, slug))
    );
    const baseSections = extractedCardSectionsSchema.parse(sectionsWithSourceCitations(existingCard, acceptedSources));
    const missingBlocks = blocksNeedingEnrichmentForSections(baseSections);
    if (missingBlocks.length === 0) {
      trace.steps = { ...trace.steps, "enrich-card": skippedStep("stored card already filled enrichment blocks") };
      const describedCard = await ensureExpandedDescription(existingCard, acceptedSources);
      await requestContactEnrichment(describedCard);
      await patchParentTrace();
      return { slug, skipped: "no_missing_blocks" };
    }

    const anthropic = createAnthropicClient();
    const blockModel = modelForStage("extract_block", anthropicModel());
    const researchPlan = fallbackResearchPlan(domain);
    const stableEnv = stableenrichEnvFromProcess();
    const agentcashBudgetCeiling = agentcashBudgetCeilingUsd({ mode: "basics", override: runtimeEnv.PER_RUN_AGENTCASH_BUDGET_USD });
    const lateEnrichmentSkipProbeNames = stableenrichLateEnrichmentSkipsForBlocks(missingBlocks);

    currentStage = "fetch-enrichment-sources";
    const enrichmentSourceResult = await step.run("fetch-enrichment-sources", async () => {
      const result = await timed(() =>
        fetchLateEnrichmentSources({
          domain,
          researchPlan,
          acceptedSources,
          stableEnv,
          remainingBudgetUsd: remainingAgentcashBudgetUsd({ ceilingUsd: agentcashBudgetCeiling, endpoints: [] }),
          missingBlocks,
          initialProviders: { directExa: { skipped: true, sourceCount: 0, failureCount: 0 }, stableenrich: { sourceCount: 0, failureCount: 0 } },
          currentStable: undefined
        })
      );
      return {
        value: result.value,
        tracePatch: {
          steps: { "fetch-enrichment-sources": completedStep(result.durationMs) },
          providers: result.value.trace.providers,
          sourceGate: result.value.trace.sourceGate
        }
      };
    });
    mergeTracePatch(trace, enrichmentSourceResult.tracePatch);
    await recordEvent("enrichment-sources-fetched", "source.enrichment", "Checked deeper enrichment sources", {
      sourceCount: enrichmentSourceResult.value.sources.length,
      providerFactCount: enrichmentSourceResult.value.providerFacts.length,
      missingBlocks,
      skippedProbeNames: lateEnrichmentSkipProbeNames
    });

    currentStage = "enrich-card";
    const enriched = await step.run("enrich-card", async () => {
      const llmTelemetry = createStepLlmTelemetryCollector();
      const result = await timed(async () => {
        try {
          const providerFactMerge = applyProviderFactCandidates(baseSections, enrichmentSourceResult.value.providerFacts);
          const enrichment = await enrichExtractedSectionsForDomain({
            domain,
            researchPlan,
            sections: providerFactMerge.sections,
            sources: enrichmentSourceResult.value.sources,
            enrichSections: async ({ block, domain: candidateDomain, sources, evidenceLedger, currentSections }) =>
              pipelineBlockPatch(
                await extractCompanyBlockClaims({
                  client: anthropic,
                  model: blockModel,
                  block,
                  evidence: { domain: candidateDomain, researchPlan, sources, evidenceLedger, currentSections },
                  telemetry: llmTelemetry.telemetry
                })
              )
          });
          return { ok: true as const, value: { ...enrichment, providerFactMerge } };
        } catch (error) {
          return { ok: false as const, error: boundedErrorMessage(error) };
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
    applyStableenrichEndpointYield(trace, enrichedValue.providerFactMerge.trace.appliedByEndpoint);
    if (trace.extraction) {
      trace.extraction = {
        ...trace.extraction,
        providerFactAppliedByEndpoint: mergeEndpointFactCounts(
          trace.extraction.providerFactAppliedByEndpoint,
          enrichedValue.providerFactMerge.trace.appliedByEndpoint
        )
      };
    }

    // Merge the block-enriched sections onto a fresh read of the card so a concurrent contact write
    // is not clobbered; contact enrichment is dispatched only after this store, but the re-read keeps
    // the write order-independent.
    const enrichedCard = cardWithExtractedSections(existingCard, enrichedValue.sections);
    let cardToStore = prepareCardForStorage("basics", existingCard, enrichedCard);
    assertTerminalCardQuality("basics", cardToStore);
    if (canStoreCardSnapshot("basics", cardToStore)) {
      const storedResult = await step.run("upsert-enriched-card", async () => {
        const mutated = await mutateCardWithRetry(db, slug, (current) =>
          prepareCardForStorage(
            "basics",
            current,
            cardWithExtractedSections(current, enrichedValue.sections),
            { preferExisting: true, preserveAnalysis: true }
          )
        );
        return mutated ?? { card: cardToStore, row: await upsertCard(db, cardToStore) };
      });
      cardToStore = storedResult.card;
      const stored = storedResult.row;
      await step.run("record-enriched-card-evidence", () => recordCardEvidence(db, stored.id, cardToStore));
      await step.run("record-enriched-research-sections", () => upsertResearchSections(db, deriveLegacyResearchSectionsFromCard(cardToStore)));
      await step.run("record-enriched-sources", () =>
        recordSourcesForCard(db, stored.id, mergeSources(acceptedSources, enrichmentSourceResult.value.sources))
      );
      await recordEvent("enriched-card-saved", "card.enriched", "Saved enriched company card", {
        citationCount: cardToStore.citations.length,
        sourceCount: enrichmentSourceResult.value.sources.length
      });
    } else {
      noteSkippedUnderfilledSnapshot(trace, "skip-underfilled-enriched-card", cardToStore);
    }

    cardToStore = await ensureExpandedDescription(
      cardToStore,
      mergeSources(acceptedSources, enrichmentSourceResult.value.sources)
    );
    await requestContactEnrichment(cardToStore);
    await patchParentTrace();
    return { slug, enriched: true };
  } catch (error) {
    trace.failure = { code: generationFailureCode(error), stage: currentStage, message: boundedErrorMessage(error), ...(error instanceof Error ? { className: error.name } : {}), ...(rawErrorDetail(error) !== undefined ? { detail: rawErrorDetail(error) } : {}) };
    await recordEvent("enrichment-failed", "enrichment.failed", boundedErrorMessage(error), { stage: currentStage });
    await patchParentTrace();
    throw error;
  }
};

export const cardEnrichmentFunction = inngest.createFunction(
  {
    id: "card-block-enrichment",
    triggers: { event: BLOCK_ENRICHMENT_EVENT_NAME },
    ...(cardEnrichmentConcurrency ? { concurrency: { limit: cardEnrichmentConcurrency } } : {})
  },
  cardEnrichmentHandler
);
