import type { ColdStartCard } from "@cold-start/core";
import { createDb, findCardBySlug, recordCardEvidence, upsertCard } from "@cold-start/db";
import {
  anthropicModel,
  createAnthropicClient,
  extractCompanyClaims,
  synthesizeCard,
  verifySynthesis,
} from "@cold-start/llm";
import { generateCardForDomain, type ExtractedCardSections } from "@cold-start/pipeline";
import { fetchStableenrichSources, type StableenrichEnv } from "@cold-start/providers";
import { webEnv } from "../lib/env";
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

export const generateCardFunction = inngest.createFunction(
  { id: "generate-card" },
  { event: "card/generate.requested" },
  async ({ event, step }) => {
    const domain = String(event.data.domain);
    const { DATABASE_URL } = webEnv();
    const anthropic = createAnthropicClient();
    const model = anthropicModel();
    const stableEnv = stableenrichEnvFromProcess();

    const clean = await step.run("generate-card", () =>
      generateCardForDomain(domain, {
        fetchSources: async (candidateDomain) => {
          const { sources, failures } = await fetchStableenrichSources({
            env: stableEnv,
            domain: candidateDomain,
          });
          // Failure details are intentionally not converted into cost lines until live costs are measured.
          void failures;
          return sources;
        },
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

    const db = createDb(DATABASE_URL);
    const row = await step.run("upsert-card", () => upsertCard(db, clean));
    await step.run("record-card-evidence", () => recordCardEvidence(db, row.id, clean));

    return { slug: clean.slug };
  },
);

export async function getCachedCard(slug: string) {
  const db = createDb(webEnv().DATABASE_URL);
  return findCardBySlug(db, slug);
}
