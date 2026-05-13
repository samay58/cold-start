import {
  companySlugFromDomain,
  type ColdStartCard,
  type GenerationTrace,
  type GenerationTraceStep,
  type ResolvedFact
} from "@cold-start/core";
import { createDb, findCardBySlug, markGenerationRun, recordCardEvidence, recordSource, upsertCard } from "@cold-start/db";
import {
  anthropicModel,
  createAnthropicClient,
  extractCompanyClaims,
  fallbackResearchPlan,
  planCompanyResearch,
  synthesizeCard,
  verifySynthesis,
} from "@cold-start/llm";
import {
  filterSourcesForDomain,
  GenerateCardTraceError,
  generateCardForDomainWithTrace,
  sourceGateTrace,
  type ExtractedCardSections,
  type GenerateCardTracePatch
} from "@cold-start/pipeline";
import {
  fetchDirectExaFundamentalsSources,
  fetchStableenrichSources,
  type DirectExaEnv,
  type ProviderSource,
  type StableenrichEnv
} from "@cold-start/providers";
import { canonicalCompanyDomain } from "../lib/domain";
import { webEnv } from "../lib/env";
import { boundedErrorMessage } from "../lib/errors";
import { inngest } from "./client";

function stableenrichEnvFromProcess(): StableenrichEnv {
  const baseUrl = process.env.STABLEENRICH_BASE_URL;
  const exaSearchUrl = process.env.STABLEENRICH_EXA_SEARCH_URL;
  const exaSimilarUrl = process.env.STABLEENRICH_EXA_SIMILAR_URL;
  const firecrawlUrl = process.env.STABLEENRICH_FIRECRAWL_URL;
  const orgEnrichUrl = process.env.STABLEENRICH_ORG_ENRICH_URL;

  return {
    ...(baseUrl ? { STABLEENRICH_BASE_URL: baseUrl } : {}),
    ...(exaSearchUrl ? { STABLEENRICH_EXA_SEARCH_URL: exaSearchUrl } : {}),
    ...(exaSimilarUrl ? { STABLEENRICH_EXA_SIMILAR_URL: exaSimilarUrl } : {}),
    ...(firecrawlUrl ? { STABLEENRICH_FIRECRAWL_URL: firecrawlUrl } : {}),
    ...(orgEnrichUrl ? { STABLEENRICH_ORG_ENRICH_URL: orgEnrichUrl } : {}),
  };
}

function directExaEnvFromProcess(): DirectExaEnv {
  const apiKey = process.env.DIRECT_EXA_API_KEY;
  const baseUrl = process.env.DIRECT_EXA_BASE_URL;

  return {
    ...(apiKey ? { DIRECT_EXA_API_KEY: apiKey } : {}),
    ...(baseUrl ? { DIRECT_EXA_BASE_URL: baseUrl } : {}),
  };
}

type GenerationMode = "basics" | "analysis";
type TimedResult<T> = { durationMs: number; value: T };
type GenerationTracePatch = Partial<Omit<GenerationTrace, "jobKind" | "mode">>;

function generationModeForRun(input: unknown): GenerationMode {
  return input === "analysis" ? "analysis" : "basics";
}

function directExaEnabled() {
  return process.env.FAST_BASICS_ENABLED !== "false";
}

async function timed<T>(fn: () => Promise<T> | T): Promise<TimedResult<T>> {
  const startedAt = Date.now();
  const value = await fn();
  return { durationMs: Date.now() - startedAt, value };
}

function mergeTracePatch(trace: GenerationTrace, patch?: GenerationTracePatch | GenerateCardTracePatch) {
  if (!patch) {
    return;
  }

  if ("inngest" in patch && patch.inngest) {
    trace.inngest = { ...trace.inngest, ...patch.inngest };
  }

  if ("steps" in patch && patch.steps) {
    trace.steps = { ...trace.steps, ...patch.steps };
  }

  if ("providers" in patch && patch.providers) {
    trace.providers = patch.providers;
  }

  if ("sourceGate" in patch && patch.sourceGate) {
    trace.sourceGate = patch.sourceGate;
  }

  if ("extraction" in patch && patch.extraction) {
    trace.extraction = patch.extraction;
  }

  if ("synthesis" in patch && patch.synthesis) {
    trace.synthesis = patch.synthesis;
  }

  if ("failure" in patch && patch.failure) {
    trace.failure = patch.failure;
  }
}

function completedStep(durationMs: number): GenerationTraceStep {
  return { status: "complete", durationMs };
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

function preserveFact<T>(existing: ResolvedFact<T>, next: ResolvedFact<T>): ResolvedFact<T> {
  return next.value === null && existing.value !== null ? existing : next;
}

function preserveExistingBasics(existing: ColdStartCard | null, next: ColdStartCard): ColdStartCard {
  if (!existing) {
    return next;
  }

  const citations = new Map(existing.citations.map((citation) => [citation.id, citation]));
  next.citations.forEach((citation) => citations.set(citation.id, citation));

  return {
    ...next,
    identity: {
      ...next.identity,
      name: preserveFact(existing.identity.name, next.identity.name),
      oneLiner: preserveFact(existing.identity.oneLiner, next.identity.oneLiner),
      ...(existing.identity.description || next.identity.description
        ? {
            description: next.identity.description?.value === null && existing.identity.description?.value
              ? existing.identity.description
              : next.identity.description ?? existing.identity.description,
          }
        : {}),
      hq: preserveFact(existing.identity.hq, next.identity.hq),
      foundedYear: preserveFact(existing.identity.foundedYear, next.identity.foundedYear),
    },
    funding: {
      ...next.funding,
      totalRaisedUsd: preserveFact(existing.funding.totalRaisedUsd, next.funding.totalRaisedUsd),
      lastRound: preserveFact(existing.funding.lastRound, next.funding.lastRound),
      ...(existing.funding.rounds || next.funding.rounds
        ? {
            rounds: next.funding.rounds?.value === null && existing.funding.rounds?.value
              ? existing.funding.rounds
              : next.funding.rounds ?? existing.funding.rounds,
          }
        : {}),
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

function rawSlugForRun(input: unknown): string {
  if (typeof input !== "string" || input.trim().length === 0) {
    return "unknown";
  }

  return input.trim().slice(0, 120);
}

export const generateCardFunction = inngest.createFunction(
  { id: "generate-card" },
  { event: "card/generate.requested" },
  async ({ event, runId, step }) => {
    const { DATABASE_URL } = webEnv();
    const db = createDb(DATABASE_URL);

    let domain: string;
    let slug: string;
    const mode = generationModeForRun(event.data.mode);
    const trace: GenerationTrace = {
      jobKind: mode,
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
          jobKind: mode,
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

    await step.run("mark-generation-running", () =>
      markGenerationRun(db, {
        slug,
        domain,
        mode,
        jobKind: mode,
        status: "running",
        traceJson: trace,
        ...(trace.inngest?.eventId ? { inngestEventId: trace.inngest.eventId } : {}),
        ...(trace.inngest?.runId ? { inngestRunId: trace.inngest.runId } : {})
      })
    );

    let currentStage = "plan-research";
    try {
      const anthropic = createAnthropicClient();
      const model = anthropicModel();
      const stableEnv = stableenrichEnvFromProcess();
      const directExaEnv = directExaEnvFromProcess();
      const researchPlanResult = await step.run("plan-research", async () => {
        const result = await timed(async () => {
          if (mode === "basics") {
            return fallbackResearchPlan(domain);
          }

          try {
            return await planCompanyResearch({ client: anthropic, model, domain });
          } catch {
            return fallbackResearchPlan(domain);
          }
        });
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

      currentStage = "fetch-sources";
      const sourceResult = await step.run("fetch-sources", async () => {
        const result = await timed(async () => {
          const [directResult, stableResult] = await Promise.allSettled([
            directExaEnabled()
              ? fetchDirectExaFundamentalsSources({ env: directExaEnv, domain })
              : Promise.resolve({ sources: [], failures: [], skipped: true }),
            fetchStableenrichSources({ env: stableEnv, domain, researchPlan }),
          ]);

          const directSources = directResult.status === "fulfilled" ? directResult.value.sources : [];
          const stableSources = stableResult.status === "fulfilled" ? stableResult.value.sources : [];
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
                failureCount: stableResult.status === "fulfilled" ? stableResult.value.failures.length : 1
              },
              mergedSourceCount: sources.length
            },
            sourceGate: sourceGateTrace(sourceGate)
          };

          if (sourceGate.accepted.length === 0) {
            const details = failures
              .map((failure) => `${failure.name}: ${boundedErrorMessage(failure.error)}`)
              .join("; ");
            return {
              sources: [] as ProviderSource[],
              failureCount: failures.length,
              trace: sourceTrace,
              error: `No accepted provider sources returned; fetched: ${sources.length}; rejected: ${sourceGate.rejected.length}; failures: ${failures.length}${details ? `; ${details}` : ""}`
            };
          }

          return {
            sources: sourceGate.accepted,
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

      // Failure count is tracked for observability, but not converted into cost until live costs are measured.
      void sourceResult.value.failureCount;
      if (sourceResult.value.error) {
        throw new Error(sourceResult.value.error);
      }
      const acceptedSources = sourceResult.value.sources.filter(Boolean) as ProviderSource[];

      currentStage = "generate-card";
      const clean = await step.run("generate-card", async () => {
        const result = await timed(async () => {
          try {
            const generated = await generateCardForDomainWithTrace(domain, {
              researchPlan,
              fetchSources: async () => acceptedSources,
              extractSections: async ({ domain: candidateDomain, sources, evidenceLedger }): Promise<ExtractedCardSections> =>
                extractCompanyClaims({
                  client: anthropic,
                  model,
                  evidence: { domain: candidateDomain, researchPlan, sources, evidenceLedger },
                }),
              ...(mode === "analysis"
                ? {
                    synthesize: async (card: ColdStartCard) => synthesizeCard({ client: anthropic, model, card }),
                    verify: async (claims, sources) => verifySynthesis({ client: anthropic, model, claims, sources }),
                    synthesisRequired: true,
                  }
                : {}),
            });

            return {
              ok: true as const,
              card: generated.card,
              tracePatch: generated.tracePatch
            };
          } catch (error) {
            return {
              ok: false as const,
              error: boundedErrorMessage(error),
              tracePatch: generateErrorTracePatch(error)
            };
          }
        });
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

      if (!clean.value.ok) {
        throw new Error(clean.value.error);
      }

      if (mode === "analysis" && !clean.value.card.synthesis) {
        throw new Error("analysis synthesis was not produced");
      }

      const existingCard = mode === "analysis" ? await step.run("load-existing-card", () => findCardBySlug(db, slug)) : null;
      const cardToStore =
        mode === "basics"
          ? { ...clean.value.card, cacheStatus: "partial" as const }
          : { ...preserveExistingBasics(existingCard, clean.value.card), cacheStatus: "hit" as const };
      const row = await step.run("upsert-card", () => upsertCard(db, cardToStore));
      await step.run("record-card-evidence", () => recordCardEvidence(db, row.id, cardToStore));
      await step.run("record-sources", () =>
        Promise.all(
          acceptedSources.map((source) =>
            recordSource(db, {
              cardId: row.id,
              url: source.url,
              title: source.title,
              sourceType: source.sourceType,
              fetchedAt: source.fetchedAt,
              rawText: source.rawText,
            }),
          ),
        ),
      );

      await step.run("mark-generation-complete", () =>
        markGenerationRun(db, {
          slug,
          domain,
          mode,
          jobKind: mode,
          status: "complete",
          costUsd: cardToStore.generationCostUsd,
          traceJson: trace,
          ...(trace.inngest?.eventId ? { inngestEventId: trace.inngest.eventId } : {}),
          ...(trace.inngest?.runId ? { inngestRunId: trace.inngest.runId } : {})
        })
      );

      return { slug: cardToStore.slug, mode };
    } catch (error) {
      trace.failure = {
        stage: currentStage,
        message: boundedErrorMessage(error),
        ...(error instanceof Error ? { className: error.name } : {})
      };
      await step.run("mark-generation-failed", () =>
        markGenerationRun(db, {
          slug,
          domain,
          mode,
          jobKind: mode,
          status: "failed",
          error: boundedErrorMessage(error),
          traceJson: trace,
          ...(trace.inngest?.eventId ? { inngestEventId: trace.inngest.eventId } : {}),
          ...(trace.inngest?.runId ? { inngestRunId: trace.inngest.runId } : {})
        })
      );
      throw error;
    }
  },
);

export async function getCachedCard(slug: string) {
  const db = createDb(webEnv().DATABASE_URL);
  return findCardBySlug(db, slug);
}
