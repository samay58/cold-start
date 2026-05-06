import {
  type ColdStartCard,
  coldStartCardSchema,
  type ResolvedFact,
  sanitizeCardTrust,
  type SourcedText,
  synthesisSchema,
  stripUnsupportedSynthesis
} from "@cold-start/core";
import { applyVerifierResults, type VerificationResult } from "@cold-start/llm";
import type { ProviderSource } from "@cold-start/providers";
import { type CostLine, totalGenerationCost } from "./cost";
import { resolveIdentityFromInput } from "./resolve-identity";

export const extractedCardSectionsSchema = coldStartCardSchema.pick({
  identity: true,
  funding: true,
  team: true,
  signals: true,
  comparables: true,
  citations: true
});

type CardSynthesis = NonNullable<ColdStartCard["synthesis"]>;
type VerificationSource = { id: string; url: string; title: string; snippet?: string };

function unknownFact<T>(): ResolvedFact<T> {
  return {
    value: null,
    status: "unknown",
    confidence: "low",
    citationIds: []
  };
}

export function buildSkeletonCard(input: string): ColdStartCard {
  const identity = resolveIdentityFromInput(input);
  return {
    ...identity,
    generatedAt: new Date().toISOString(),
    generationCostUsd: 0,
    cacheStatus: "miss",
    identity: {
      name: unknownFact<NonNullable<ColdStartCard["identity"]["name"]["value"]>>(),
      logoUrl: null,
      oneLiner: unknownFact<NonNullable<ColdStartCard["identity"]["oneLiner"]["value"]>>(),
      hq: unknownFact<NonNullable<ColdStartCard["identity"]["hq"]["value"]>>(),
      foundedYear: unknownFact<NonNullable<ColdStartCard["identity"]["foundedYear"]["value"]>>(),
      status: "private"
    },
    funding: {
      totalRaisedUsd: unknownFact<NonNullable<ColdStartCard["funding"]["totalRaisedUsd"]["value"]>>(),
      lastRound: unknownFact<NonNullable<ColdStartCard["funding"]["lastRound"]["value"]>>(),
      investors: unknownFact<NonNullable<ColdStartCard["funding"]["investors"]["value"]>>()
    },
    team: {
      founders: unknownFact<NonNullable<ColdStartCard["team"]["founders"]["value"]>>(),
      keyExecs: unknownFact<NonNullable<ColdStartCard["team"]["keyExecs"]["value"]>>(),
      headcount: unknownFact<NonNullable<ColdStartCard["team"]["headcount"]["value"]>>()
    },
    signals: [],
    comparables: [],
    citations: []
  };
}

export function finalizeGeneratedCard(card: ColdStartCard): ColdStartCard {
  return stripUnsupportedSynthesis(sanitizeCardTrust(card));
}

export type ExtractedCardSections = Pick<
  ColdStartCard,
  "identity" | "funding" | "team" | "signals" | "comparables" | "citations"
>;

type BaseGenerateCardDeps = {
  fetchSources(domain: string): Promise<ProviderSource[]>;
  extractSections(input: { domain: string; sources: ProviderSource[] }): Promise<ExtractedCardSections>;
  costLines?: CostLine[];
};

type WithoutSynthesisDeps = {
  synthesize?: never;
  verify?: never;
};

type WithSynthesisDeps = {
  synthesize(card: ColdStartCard): Promise<CardSynthesis>;
  verify(claims: SourcedText[], sources: VerificationSource[]): Promise<VerificationResult[]>;
};

export type GenerateCardDeps = BaseGenerateCardDeps & (WithoutSynthesisDeps | WithSynthesisDeps);

function synthesisClaims(synthesis: CardSynthesis): SourcedText[] {
  return [synthesis.whyItMatters, ...synthesis.bullCase, ...synthesis.bearCase];
}

export async function generateCardForDomain(domain: string, deps: GenerateCardDeps): Promise<ColdStartCard> {
  const skeleton = buildSkeletonCard(domain);
  const sources = await deps.fetchSources(skeleton.domain);
  const sections = extractedCardSectionsSchema.parse(await deps.extractSections({ domain: skeleton.domain, sources }));

  let card: ColdStartCard = coldStartCardSchema.parse({
    slug: skeleton.slug,
    domain: skeleton.domain,
    generatedAt: new Date().toISOString(),
    generationCostUsd: totalGenerationCost(deps.costLines ?? []),
    cacheStatus: skeleton.cacheStatus,
    identity: sections.identity,
    funding: sections.funding,
    team: sections.team,
    signals: sections.signals,
    comparables: sections.comparables,
    citations: sections.citations
  });

  if (deps.synthesize && deps.verify) {
    const synthesis = synthesisSchema.parse(await deps.synthesize(card));
    const citationSources = card.citations.map((citation) => ({
      id: citation.id,
      url: citation.url,
      title: citation.title,
      ...(citation.snippet ? { snippet: citation.snippet } : {})
    }));
    const results = await deps.verify(synthesisClaims(synthesis), citationSources);
    const verifiedWhyItMatters = applyVerifierResults([synthesis.whyItMatters], results);
    const [whyItMatters] = verifiedWhyItMatters;
    const verifiedSynthesis =
      verifiedWhyItMatters.length === 1 && whyItMatters
        ? {
            ...synthesis,
            whyItMatters,
            bullCase: applyVerifierResults(synthesis.bullCase, results),
            bearCase: applyVerifierResults(synthesis.bearCase, results)
          }
        : undefined;

    if (verifiedSynthesis) {
      card = { ...card, synthesis: verifiedSynthesis };
    }
  }

  return finalizeGeneratedCard(coldStartCardSchema.parse(card));
}
