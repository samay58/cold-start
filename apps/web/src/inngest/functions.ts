import { companySlugFromDomain, type ColdStartCard, type ResolvedFact } from "@cold-start/core";
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
import { generateCardForDomain, type ExtractedCardSections } from "@cold-start/pipeline";
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

function generationModeForRun(input: unknown): GenerationMode {
  return input === "analysis" ? "analysis" : "basics";
}

function directExaEnabled() {
  return process.env.FAST_BASICS_ENABLED !== "false";
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
  async ({ event, step }) => {
    const { DATABASE_URL } = webEnv();
    const db = createDb(DATABASE_URL);

    let domain: string;
    let slug: string;
    const mode = generationModeForRun(event.data.mode);

    try {
      domain = canonicalCompanyDomain(event.data.domain);
      slug = companySlugFromDomain(domain);
    } catch (error) {
      await step.run("mark-invalid-generation", () =>
        markGenerationRun(db, {
          slug: rawSlugForRun(event.data.slug),
          domain: rawDomainForRun(event.data.domain),
          mode,
          status: "failed",
          error: boundedErrorMessage(error)
        })
      );
      throw error;
    }

    await step.run("mark-generation-running", () => markGenerationRun(db, { slug, domain, mode, status: "running" }));

    try {
      const anthropic = createAnthropicClient();
      const model = anthropicModel();
      const stableEnv = stableenrichEnvFromProcess();
      const directExaEnv = directExaEnvFromProcess();
      const researchPlan = await step.run("plan-research", async () => {
        if (mode === "basics") {
          return fallbackResearchPlan(domain);
        }

        try {
          return await planCompanyResearch({ client: anthropic, model, domain });
        } catch {
          return fallbackResearchPlan(domain);
        }
      });

      const sourceResult = await step.run("fetch-sources", async () => {
        const [directResult, stableResult] = await Promise.allSettled([
          directExaEnabled()
            ? fetchDirectExaFundamentalsSources({ env: directExaEnv, domain })
            : Promise.resolve({ sources: [], failures: [], skipped: true }),
          fetchStableenrichSources({ env: stableEnv, domain, researchPlan }),
        ]);

        const directSources = directResult.status === "fulfilled" ? directResult.value.sources : [];
        const stableSources = stableResult.status === "fulfilled" ? stableResult.value.sources : [];
        const sources = mergeSources(directSources, stableSources);
        const failures = [
          ...(directResult.status === "fulfilled"
            ? directResult.value.failures
            : [{ name: "exa_direct_company" as const, endpointUrl: "https://api.exa.ai/search", error: boundedErrorMessage(directResult.reason) }]),
          ...(stableResult.status === "fulfilled"
            ? stableResult.value.failures
            : [{ name: "stableenrich" as const, endpointUrl: "stableenrich", error: boundedErrorMessage(stableResult.reason) }]),
        ];

        if (sources.length === 0) {
          const details = failures
            .map((failure) => `${failure.name}: ${boundedErrorMessage(failure.error)}`)
            .join("; ");
          throw new Error(`No provider sources returned; failures: ${failures.length}${details ? `; ${details}` : ""}`);
        }

        return { sources, failureCount: failures.length };
      });

      // Failure count is tracked for observability, but not converted into cost until live costs are measured.
      void sourceResult.failureCount;

      const clean = await step.run("generate-card", () =>
        generateCardForDomain(domain, {
          researchPlan,
          fetchSources: async () => sourceResult.sources,
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
        }),
      );

      if (mode === "analysis" && !clean.synthesis) {
        throw new Error("analysis synthesis was not produced");
      }

      const existingCard = mode === "analysis" ? await step.run("load-existing-card", () => findCardBySlug(db, slug)) : null;
      const cardToStore =
        mode === "basics"
          ? { ...clean, cacheStatus: "partial" as const }
          : { ...preserveExistingBasics(existingCard, clean), cacheStatus: "hit" as const };
      const row = await step.run("upsert-card", () => upsertCard(db, cardToStore));
      await step.run("record-card-evidence", () => recordCardEvidence(db, row.id, cardToStore));
      await step.run("record-sources", () =>
        Promise.all(
          sourceResult.sources.map((source) =>
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
        markGenerationRun(db, { slug, domain, mode, status: "complete", costUsd: cardToStore.generationCostUsd })
      );

      return { slug: cardToStore.slug, mode };
    } catch (error) {
      await step.run("mark-generation-failed", () =>
        markGenerationRun(db, { slug, domain, mode, status: "failed", error: boundedErrorMessage(error) })
      );
      throw error;
    }
  },
);

export async function getCachedCard(slug: string) {
  const db = createDb(webEnv().DATABASE_URL);
  return findCardBySlug(db, slug);
}
