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
import type { ProviderResearchPlan, ProviderSource } from "@cold-start/providers";
import { type CostLine, totalGenerationCost } from "./cost";
import { buildEvidenceLedger, type EvidenceLedgerEntry } from "./evidence-ledger";
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
  researchPlan?: ProviderResearchPlan;
  fetchSources(domain: string, researchPlan?: ProviderResearchPlan): Promise<ProviderSource[]>;
  extractSections(input: {
    domain: string;
    researchPlan?: ProviderResearchPlan;
    sources: ProviderSource[];
    evidenceLedger: EvidenceLedgerEntry[];
  }): Promise<ExtractedCardSections>;
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

async function verifiedSynthesisForCard(
  card: ColdStartCard,
  deps: WithSynthesisDeps
): Promise<CardSynthesis | undefined> {
  try {
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
    const bullCaseOffset = 1;
    const bearCaseOffset = bullCaseOffset + synthesis.bullCase.length;

    return verifiedWhyItMatters.length === 1 && whyItMatters
      ? {
          ...synthesis,
          whyItMatters,
          bullCase: applyVerifierResults(synthesis.bullCase, results, bullCaseOffset),
          bearCase: applyVerifierResults(synthesis.bearCase, results, bearCaseOffset)
        }
      : undefined;
  } catch {
    return undefined;
  }
}

export async function generateCardForDomain(domain: string, deps: GenerateCardDeps): Promise<ColdStartCard> {
  const skeleton = buildSkeletonCard(domain);
  const sources = await deps.fetchSources(skeleton.domain, deps.researchPlan);
  const evidenceLedger = buildEvidenceLedger({ domain: skeleton.domain, sources });
  const extractionInput = {
    domain: skeleton.domain,
    ...(deps.researchPlan ? { researchPlan: deps.researchPlan } : {}),
    sources,
    evidenceLedger
  };
  const sections = extractedCardSectionsSchema.parse(
    await deps.extractSections(extractionInput)
  );

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
    const verifiedSynthesis = await verifiedSynthesisForCard(card, {
      synthesize: deps.synthesize,
      verify: deps.verify
    });
    if (verifiedSynthesis) {
      card = { ...card, synthesis: verifiedSynthesis };
    }
  }

  return finalizeGeneratedCard(coldStartCardSchema.parse(card));
}
