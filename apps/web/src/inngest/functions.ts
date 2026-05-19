import {
  companySlugFromDomain,
  type ColdStartCard,
  type GenerationTrace,
  type GenerationTraceStep,
  hasUsablePublicProfile,
  type ResolvedFact
} from "@cold-start/core";
import { createDb, findCardBySlug, markGenerationRun, recordCardEvidence, recordSource, upsertCard } from "@cold-start/db";
import {
  anthropicModel,
  createAnthropicClient,
  extractCompanyBlockClaims,
  extractCompanyClaims,
  fallbackResearchPlan,
  synthesizeCard,
  verifySynthesis,
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
  type BlockEnrichmentPatch,
  type EvidenceLedgerEntry,
  type ExtractedCardSections,
  type GenerateCardTracePatch
} from "@cold-start/pipeline";
import {
  fetchDirectExaFundamentalsSources,
  fetchStableenrichEnrichmentSources,
  fetchStableenrichFastSources,
  fetchStableenrichPeopleEmailSources,
  fetchStableenrichSources,
  type DirectExaEnv,
  type ProviderFactCandidate,
  type ProviderSource,
  type StableenrichPeopleEmailHint,
  type StableenrichEnv
} from "@cold-start/providers";
import { canonicalCompanyDomain } from "../lib/domain";
import { webEnv } from "../lib/env";
import { boundedErrorMessage } from "../lib/errors";
import { inngest } from "./client";

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

function stableenrichEnvFromProcess(): StableenrichEnv {
  return readEnvSubset(STABLEENRICH_ENV_KEYS);
}

function directExaEnvFromProcess(): DirectExaEnv {
  return readEnvSubset(DIRECT_EXA_ENV_KEYS);
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

  if ("milestones" in patch && patch.milestones) {
    trace.milestones = { ...trace.milestones, ...patch.milestones };
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

function peopleHintsFromSections(sections: ExtractedCardSections): StableenrichPeopleEmailHint[] {
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

function peopleEmailCount(sections: ExtractedCardSections) {
  return [
    ...(sections.team.founders.value ?? []),
    ...(sections.team.keyExecs.value ?? [])
  ].filter((person) => Boolean(person.email)).length;
}

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

export function prepareCardForStorage(mode: GenerationMode, existing: ColdStartCard | null, generated: ColdStartCard): ColdStartCard {
  const merged = preserveExistingBasics(existing, generated);
  return {
    ...merged,
    cacheStatus: mode === "analysis" || hasUsablePublicProfile(merged) ? "hit" : "partial",
  };
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

export const generateCardFunction = inngest.createFunction(
  { id: "generate-card" },
  { event: "card/generate.requested" },
  async ({ event, runId, step }) => {
    const { DATABASE_URL } = webEnv();
    const db = createDb(DATABASE_URL);
    const functionStartedAt = Date.now();

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

      currentStage = "fetch-sources";
      const sourceResult = await step.run("fetch-sources", async () => {
        const result = await timed(async () => {
          const [directResult, stableResult] = await Promise.allSettled([
            directExaEnabled()
              ? fetchDirectExaFundamentalsSources({ env: directExaEnv, domain })
              : Promise.resolve({ sources: [], failures: [], skipped: true }),
            mode === "basics"
              ? fetchStableenrichFastSources({ env: stableEnv, domain, researchPlan })
              : fetchStableenrichSources({ env: stableEnv, domain, researchPlan }),
          ]);

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
                endpoints:
                  stableResult.status === "fulfilled"
                    ? stableResult.value.endpoints
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

      // Failure count is tracked for observability, but not converted into cost until live costs are measured.
      void sourceResult.value.failureCount;
      if (sourceResult.value.error) {
        throw new Error(sourceResult.value.error);
      }
      const acceptedSources = sourceResult.value.sources.filter(Boolean) as ProviderSource[];
      const providerFacts = sourceResult.value.providerFacts.filter(Boolean) as ProviderFactCandidate[];
      const existingCard = await step.run("load-existing-card", () => findCardBySlug(db, slug));
      let seedCard: ColdStartCard | null = null;
      let seedSections: ExtractedCardSections | null = null;
      let contactProviderFacts: ProviderFactCandidate[] = [];
      let contactSources: ProviderSource[] = [];

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
                providerFactPaths: result.value.trace.providerFactPaths
              }
            }
          };
        });
        mergeTracePatch(trace, seedProfileResult.tracePatch);
        seedCard = seedProfileResult.value.card;
        seedSections = seedProfileResult.value.sections;

        const seedCardToStore = prepareCardForStorage(mode, existingCard, seedCard);
        const seedRow = await step.run("upsert-seed-card", () => upsertCard(db, seedCardToStore));
        await step.run("record-seed-card-evidence", () => recordCardEvidence(db, seedRow.id, seedCardToStore));
        trace.milestones = {
          ...trace.milestones,
          firstUsableCardMs: Date.now() - functionStartedAt
        };

        currentStage = "fetch-contact-sources";
        const contactSourceResult = await step.run("fetch-contact-sources", async () => {
          const result = await timed(async () => {
            const contactResult = await fetchStableenrichPeopleEmailSources({
              env: stableEnv,
              domain,
              sourceHints: acceptedSources,
              peopleHints: peopleHintsFromSections(seedSections ?? seedProfileResult.value.sections)
            });
            const sources = mergeSources(acceptedSources, contactResult.sources);
            const sourceGate = filterSourcesForDomain({ domain, sources });
            const initialStable = sourceResult.value.trace.providers.stableenrich;
            return {
              sources: sourceGate.accepted,
              providerFacts: contactResult.facts,
              trace: {
                providers: {
                  ...sourceResult.value.trace.providers,
                  stableenrich: {
                    sourceCount: (initialStable?.sourceCount ?? 0) + contactResult.sources.length,
                    factCount: (initialStable?.factCount ?? 0) + contactResult.facts.length,
                    failureCount: (initialStable?.failureCount ?? 0) + contactResult.failures.length,
                    endpoints: [...(initialStable?.endpoints ?? []), ...contactResult.endpoints]
                  },
                  mergedSourceCount: sources.length,
                  ...(contactResult.emailDiscovery && contactResult.emailDiscovery.length > 0
                    ? { emailDiscovery: contactResult.emailDiscovery }
                    : {})
                },
                sourceGate: sourceGateTrace(sourceGate)
              }
            };
          });

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
        contactProviderFacts = contactSourceResult.value.providerFacts;
        contactSources = contactSourceResult.value.sources;

        currentStage = "enrich-contacts";
        const contactEnriched = await step.run("enrich-contacts", async () => {
          const result = await timed(async () => {
            const providerFactMerge = applyProviderFactCandidates(seedSections ?? seedProfileResult.value.sections, contactProviderFacts);
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

        seedSections = contactEnriched.value.sections;
        seedCard = cardWithExtractedSections(seedCard, seedSections);
        const contactCardToStore = prepareCardForStorage(mode, existingCard, seedCard);
        const contactRow = await step.run("upsert-contact-card", () => upsertCard(db, contactCardToStore));
        await step.run("record-contact-card-evidence", () => recordCardEvidence(db, contactRow.id, contactCardToStore));
        trace.milestones = {
          ...trace.milestones,
          contactsReadyMs: Date.now() - functionStartedAt
        };
        await step.run("record-contact-sources", () =>
          Promise.all(
            contactSources.map((source) =>
              recordSource(db, {
                cardId: contactRow.id,
                url: source.url,
                title: source.title,
                sourceType: source.sourceType,
                fetchedAt: source.fetchedAt,
                rawText: source.rawText,
              }),
            ),
          ),
        );
      }

      const extractSectionsForCard = async ({ domain: candidateDomain, sources, evidenceLedger }: {
        domain: string;
        sources: ProviderSource[];
        evidenceLedger: EvidenceLedgerEntry[];
      }): Promise<ExtractedCardSections> =>
        extractCompanyClaims({
          client: anthropic,
          model,
          evidence: { domain: candidateDomain, researchPlan, sources, evidenceLedger },
        });
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
            model,
            block,
            evidence: {
              domain: candidateDomain,
              researchPlan,
              sources,
              evidenceLedger,
              currentSections,
            },
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
        const result = await timed(() => runCardAttempt({ skipBlockEnrichment: mode === "basics" }));
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
      let generatedCard: ColdStartCard = clean.value.card;
      let generatedSections = clean.value.sections;
      let sourcesToRecord = clean.value.sources;

      if (mode === "basics" && !hasUsablePublicProfile(generatedCard)) {
        trace.steps = {
          ...trace.steps,
          "repair-underfilled-basics": {
            status: "skipped",
            message: `partial profile kept; ${acceptedSources.length} accepted sources, user can manually regenerate`
          }
        };
      }

      if (mode === "basics") {
        sourcesToRecord = mergeSources(sourcesToRecord, contactSources);
        if (contactProviderFacts.length > 0) {
          currentStage = "merge-contacts-into-card";
          const contactMerged = await step.run("merge-contacts-into-card", async () => {
            const result = await timed(async () => {
              const providerFactMerge = applyProviderFactCandidates(generatedSections, contactProviderFacts);
              return {
                sections: extractedCardSectionsSchema.parse(providerFactMerge.sections),
                providerFactMerge
              };
            });

            return {
              value: result.value,
              tracePatch: {
                steps: {
                  "merge-contacts-into-card": {
                    ...completedStep(result.durationMs),
                    message: `${peopleEmailCount(result.value.sections)} verified work emails`
                  }
                }
              }
            };
          });
          mergeTracePatch(trace, contactMerged.tracePatch);

          generatedSections = contactMerged.value.sections;
          generatedCard = cardWithExtractedSections(generatedCard, generatedSections);
          if (trace.extraction) {
            trace.extraction = {
              ...trace.extraction,
              sourceCount: sourcesToRecord.length,
              citationCount: generatedSections.citations.length,
              providerFactCandidateCount:
                (trace.extraction.providerFactCandidateCount ?? 0) + contactMerged.value.providerFactMerge.trace.candidateCount,
              providerFactAppliedCount:
                (trace.extraction.providerFactAppliedCount ?? 0) + contactMerged.value.providerFactMerge.trace.appliedCount,
              providerFactPaths: [
                ...(trace.extraction.providerFactPaths ?? []),
                ...contactMerged.value.providerFactMerge.trace.paths
              ]
            };
          }
        }
      }

      let cardToStore = prepareCardForStorage(mode, existingCard, generatedCard);
      let row = await step.run("upsert-card", () => upsertCard(db, cardToStore));
      await step.run("record-card-evidence", () => recordCardEvidence(db, row.id, cardToStore));
      await step.run("record-sources", () =>
        Promise.all(
          sourcesToRecord.map((source) =>
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

      if (mode === "basics") {
        currentStage = "fetch-enrichment-sources";
        const enrichmentSourceResult = await step.run("fetch-enrichment-sources", async () => {
          const result = await timed(async () => {
            const stableResult = await fetchStableenrichEnrichmentSources({ env: stableEnv, domain, researchPlan });
            const sources = mergeSources(acceptedSources, contactSources, stableResult.sources);
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
                    endpoints: [...(initialStable?.endpoints ?? []), ...stableResult.endpoints]
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
        sourcesToRecord = mergeSources(enrichmentSourceResult.value.sources, contactSources);
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
            ...(enriched.value.trace ? { blockEnrichment: enriched.value.trace } : {})
          };
        }

        cardToStore = prepareCardForStorage(mode, existingCard, generatedCard);
        row = await step.run("upsert-enriched-card", () => upsertCard(db, cardToStore));
        await step.run("record-enriched-card-evidence", () => recordCardEvidence(db, row.id, cardToStore));
        await step.run("record-enriched-sources", () =>
          Promise.all(
            sourcesToRecord.map((source) =>
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
      }

      if (mode === "analysis") {
        trace.milestones = {
          ...trace.milestones,
          analysisReadyMs: Date.now() - functionStartedAt
        };
      }

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
