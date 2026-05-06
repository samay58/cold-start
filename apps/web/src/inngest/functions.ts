import { companySlugFromDomain, type ColdStartCard } from "@cold-start/core";
import { createDb, findCardBySlug, markGenerationRun, recordCardEvidence, recordSource, upsertCard } from "@cold-start/db";
import {
  anthropicModel,
  createAnthropicClient,
  extractCompanyClaims,
  synthesizeCard,
  verifySynthesis,
} from "@cold-start/llm";
import { generateCardForDomain, type ExtractedCardSections } from "@cold-start/pipeline";
import { fetchStableenrichSources, type StableenrichEnv } from "@cold-start/providers";
import { canonicalCompanyDomain } from "../lib/domain";
import { webEnv } from "../lib/env";
import { boundedErrorMessage } from "../lib/errors";
import { inngest } from "./client";

function stableenrichEnvFromProcess(): StableenrichEnv {
  const agentcashApiKey = process.env.AGENTCASH_API_KEY;
  const exaSearchUrl = process.env.STABLEENRICH_EXA_SEARCH_URL;
  const exaSimilarUrl = process.env.STABLEENRICH_EXA_SIMILAR_URL;
  const firecrawlUrl = process.env.STABLEENRICH_FIRECRAWL_URL;
  const orgEnrichUrl = process.env.STABLEENRICH_ORG_ENRICH_URL;
  const linkedinUrl = process.env.STABLEENRICH_LINKEDIN_URL;

  return {
    ...(agentcashApiKey ? { AGENTCASH_API_KEY: agentcashApiKey } : {}),
    ...(exaSearchUrl ? { STABLEENRICH_EXA_SEARCH_URL: exaSearchUrl } : {}),
    ...(exaSimilarUrl ? { STABLEENRICH_EXA_SIMILAR_URL: exaSimilarUrl } : {}),
    ...(firecrawlUrl ? { STABLEENRICH_FIRECRAWL_URL: firecrawlUrl } : {}),
    ...(orgEnrichUrl ? { STABLEENRICH_ORG_ENRICH_URL: orgEnrichUrl } : {}),
    ...(linkedinUrl ? { STABLEENRICH_LINKEDIN_URL: linkedinUrl } : {}),
  };
}

function rawDomainForRun(input: unknown): string {
  if (typeof input !== "string" || input.trim().length === 0) {
    return "invalid-domain";
  }

  return input.trim().slice(0, 253);
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

    try {
      domain = canonicalCompanyDomain(event.data.domain);
      slug = companySlugFromDomain(domain);
    } catch (error) {
      await step.run("mark-invalid-generation", () =>
        markGenerationRun(db, {
          slug: rawSlugForRun(event.data.slug),
          domain: rawDomainForRun(event.data.domain),
          status: "failed",
          error: boundedErrorMessage(error)
        })
      );
      throw error;
    }

    await step.run("mark-generation-running", () => markGenerationRun(db, { slug, domain, status: "running" }));

    try {
      const anthropic = createAnthropicClient();
      const model = anthropicModel();
      const stableEnv = stableenrichEnvFromProcess();

      const sourceResult = await step.run("fetch-sources", async () => {
        const result = await fetchStableenrichSources({
          env: stableEnv,
          domain,
        });

        if (result.sources.length === 0) {
          throw new Error(`No provider sources returned; failures: ${result.failures.length}`);
        }

        return { sources: result.sources, failureCount: result.failures.length };
      });

      // Failure count is tracked for observability, but not converted into cost until live costs are measured.
      void sourceResult.failureCount;

      const clean = await step.run("generate-card", () =>
        generateCardForDomain(domain, {
          fetchSources: async () => sourceResult.sources,
          extractSections: async ({ domain: candidateDomain, sources }): Promise<ExtractedCardSections> =>
            extractCompanyClaims({
              client: anthropic,
              model,
              evidence: { domain: candidateDomain, sources },
            }),
          synthesize: async (card: ColdStartCard) => synthesizeCard({ client: anthropic, model, card }),
          verify: async (claims, sources) => verifySynthesis({ client: anthropic, model, claims, sources }),
        }),
      );

      const row = await step.run("upsert-card", () => upsertCard(db, clean));
      await step.run("record-card-evidence", () => recordCardEvidence(db, row.id, clean));
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
        markGenerationRun(db, { slug, domain, status: "complete", costUsd: clean.generationCostUsd })
      );

      return { slug: clean.slug };
    } catch (error) {
      await step.run("mark-generation-failed", () =>
        markGenerationRun(db, { slug, domain, status: "failed", error: boundedErrorMessage(error) })
      );
      throw error;
    }
  },
);

export async function getCachedCard(slug: string) {
  const db = createDb(webEnv().DATABASE_URL);
  return findCardBySlug(db, slug);
}
