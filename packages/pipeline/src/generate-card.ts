import {
  type ColdStartCard,
  coldStartCardSchema,
  sanitizeCardTrust,
  type SourcedText,
  stripUnsupportedSynthesis
} from "@cold-start/core";
import { applyVerifierResults, type VerificationResult } from "@cold-start/llm";
import type { ProviderSource } from "@cold-start/providers";
import { totalGenerationCost } from "./cost";
import { resolveIdentityFromInput } from "./resolve-identity";

const unknown = {
  value: null,
  status: "unknown" as const,
  confidence: "low" as const,
  citationIds: []
};

export function buildSkeletonCard(input: string): ColdStartCard {
  const identity = resolveIdentityFromInput(input);
  return {
    ...identity,
    generatedAt: new Date().toISOString(),
    generationCostUsd: 0,
    cacheStatus: "miss",
    identity: {
      name: unknown,
      logoUrl: null,
      oneLiner: unknown,
      hq: unknown,
      foundedYear: unknown,
      status: "private"
    },
    funding: {
      totalRaisedUsd: unknown,
      lastRound: unknown,
      investors: unknown
    },
    team: {
      founders: unknown,
      keyExecs: unknown,
      headcount: unknown
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

export type GenerateCardDeps = {
  fetchSources(domain: string): Promise<ProviderSource[]>;
  extractSections(input: { domain: string; sources: ProviderSource[] }): Promise<ExtractedCardSections>;
  synthesize?(card: ColdStartCard): Promise<ColdStartCard["synthesis"]>;
  verify?(
    claims: SourcedText[],
    sources: Array<{ id: string; url: string; title: string; snippet?: string }>
  ): Promise<VerificationResult[]>;
};

function synthesisClaims(synthesis: NonNullable<ColdStartCard["synthesis"]>): SourcedText[] {
  return [synthesis.whyItMatters, ...synthesis.bullCase, ...synthesis.bearCase];
}

export async function generateCardForDomain(domain: string, deps: GenerateCardDeps): Promise<ColdStartCard> {
  const skeleton = buildSkeletonCard(domain);
  const sources = await deps.fetchSources(skeleton.domain);
  const sections = await deps.extractSections({ domain: skeleton.domain, sources });

  let card: ColdStartCard = coldStartCardSchema.parse({
    ...skeleton,
    ...sections,
    generatedAt: new Date().toISOString(),
    generationCostUsd: totalGenerationCost([
      { label: "stableenrich", usd: 0.04 },
      { label: "extraction", usd: 0.03 }
    ]),
    cacheStatus: "miss"
  });

  const synthesis = deps.synthesize ? await deps.synthesize(card) : undefined;
  if (synthesis) {
    let verifiedSynthesis: ColdStartCard["synthesis"] = synthesis;

    if (deps.verify) {
      const citationSources = card.citations.map((citation) => ({
        id: citation.id,
        url: citation.url,
        title: citation.title,
        ...(citation.snippet ? { snippet: citation.snippet } : {})
      }));
      const results = await deps.verify(synthesisClaims(synthesis), citationSources);
      const verifiedWhyItMatters = applyVerifierResults([synthesis.whyItMatters], results);
      const [whyItMatters] = verifiedWhyItMatters;
      verifiedSynthesis =
        verifiedWhyItMatters.length === 1 && whyItMatters
          ? {
              ...synthesis,
              whyItMatters,
              bullCase: applyVerifierResults(synthesis.bullCase, results),
              bearCase: applyVerifierResults(synthesis.bearCase, results)
            }
          : undefined;
    }

    if (verifiedSynthesis) {
      card = { ...card, synthesis: verifiedSynthesis };
    }
  }

  return finalizeGeneratedCard(coldStartCardSchema.parse(card));
}
