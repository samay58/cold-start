import {
  type ColdStartCard,
  coldStartCardSchema,
  type GenerationTrace,
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
type CitationSourceType = ColdStartCard["citations"][number]["sourceType"];
export type GenerateCardTracePatch = Partial<Pick<GenerationTrace, "extraction" | "synthesis">>;

export class GenerateCardTraceError extends Error {
  constructor(
    message: string,
    readonly tracePatch: GenerateCardTracePatch,
    options?: { cause?: unknown }
  ) {
    super(message, options);
    this.name = "GenerateCardTraceError";
  }
}

function unknownFact<T>(): ResolvedFact<T> {
  return {
    value: null,
    status: "unknown",
    confidence: "low",
    citationIds: []
  };
}

function supportedCitationUrl(url: string) {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

function readableNameFromDomain(domain: string) {
  return domain
    .split(".")[0]
    ?.split(/[-_]+/)
    .filter(Boolean)
    .map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`)
    .join(" ") || domain;
}

function fallbackSectionsFromEvidence(skeleton: ColdStartCard, evidenceLedger: EvidenceLedgerEntry[]): ExtractedCardSections | null {
  const citationEntries = evidenceLedger.filter((entry) => supportedCitationUrl(entry.url)).slice(0, 8);
  if (citationEntries.length === 0) {
    return null;
  }

  const citations = citationEntries.map((entry, index) => ({
    id: `c${index + 1}`,
    url: entry.url,
    title: entry.title,
    fetchedAt: entry.fetchedAt,
    sourceType: entry.sourceType as CitationSourceType,
    snippet: entry.supportingSnippets[0] ?? entry.rawText.slice(0, 280)
  }));
  const firstCitation = citations[0];
  const firstCitationTitle = firstCitation?.title.trim();

  return {
    identity: {
      ...skeleton.identity,
      name: firstCitation
        ? {
            value: firstCitationTitle && firstCitationTitle !== firstCitation.url ? firstCitationTitle : readableNameFromDomain(skeleton.domain),
            status: "inferred",
            confidence: "low",
            citationIds: [firstCitation.id]
          }
        : skeleton.identity.name
    },
    funding: skeleton.funding,
    team: skeleton.team,
    signals: [],
    comparables: [],
    citations
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
  synthesisRequired?: boolean;
};

export type GenerateCardDeps = BaseGenerateCardDeps & (WithoutSynthesisDeps | WithSynthesisDeps);

function hasSynthesisDeps(deps: GenerateCardDeps): deps is BaseGenerateCardDeps & WithSynthesisDeps {
  return typeof deps.synthesize === "function" && typeof deps.verify === "function";
}

function synthesisClaims(synthesis: CardSynthesis): SourcedText[] {
  return [synthesis.whyItMatters, ...synthesis.bullCase, ...synthesis.bearCase];
}

async function verifiedSynthesisForCard(
  card: ColdStartCard,
  deps: WithSynthesisDeps
): Promise<{ synthesis?: CardSynthesis; tracePatch: GenerateCardTracePatch }> {
  const synthesis = synthesisSchema.parse(await deps.synthesize(card));
  const claimCountBeforeVerify = synthesisClaims(synthesis).length;
  const citationSources = card.citations.map((citation) => ({
    id: citation.id,
    url: citation.url,
    title: citation.title,
    ...(citation.snippet ? { snippet: citation.snippet } : {})
  }));
  const results = await deps.verify(synthesisClaims(synthesis), citationSources);
  const verifiedWhyItMatters = applyVerifierResults([synthesis.whyItMatters], results);
  const bullCaseOffset = 1;
  const bearCaseOffset = bullCaseOffset + synthesis.bullCase.length;
  let bullCase = applyVerifierResults(synthesis.bullCase, results, bullCaseOffset);
  let bearCase = applyVerifierResults(synthesis.bearCase, results, bearCaseOffset);
  let whyItMatters = verifiedWhyItMatters[0];

  if (!whyItMatters) {
    whyItMatters = bullCase[0] ?? bearCase[0];
    if (bullCase[0] === whyItMatters) {
      bullCase = bullCase.slice(1);
    } else if (bearCase[0] === whyItMatters) {
      bearCase = bearCase.slice(1);
    }
  }

  const tracePatch: GenerateCardTracePatch = {
    synthesis: {
      required: deps.synthesisRequired === true,
      produced: Boolean(whyItMatters),
      claimCountBeforeVerify,
      claimCountAfterVerify: whyItMatters ? 1 + bullCase.length + bearCase.length : 0
    }
  };

  return whyItMatters
    ? {
        tracePatch,
        synthesis: {
          ...synthesis,
          whyItMatters,
          bullCase,
          bearCase
        }
      }
    : { tracePatch };
}

export async function generateCardForDomainWithTrace(
  domain: string,
  deps: GenerateCardDeps
): Promise<{ card: ColdStartCard; tracePatch: GenerateCardTracePatch }> {
  const skeleton = buildSkeletonCard(domain);
  const sources = await deps.fetchSources(skeleton.domain, deps.researchPlan);
  const evidenceLedger = buildEvidenceLedger({ domain: skeleton.domain, sources });
  let fallbackUsed = false;
  const tracePatch: GenerateCardTracePatch = {};
  const extractionInput = {
    domain: skeleton.domain,
    ...(deps.researchPlan ? { researchPlan: deps.researchPlan } : {}),
    sources,
    evidenceLedger
  };
  let sections = extractedCardSectionsSchema.parse(
    await deps.extractSections(extractionInput)
  );

  if (sections.citations.length === 0) {
    const fallbackSections = fallbackSectionsFromEvidence(skeleton, evidenceLedger);
    if (!fallbackSections) {
      tracePatch.extraction = {
          sourceCount: sources.length,
          evidenceCount: evidenceLedger.length,
          citationCount: 0,
          fallbackUsed: false
      };

      throw new GenerateCardTraceError("No cited sources survived extraction", tracePatch);
    }

    fallbackUsed = true;
    sections = fallbackSections;
  }

  tracePatch.extraction = {
    sourceCount: sources.length,
    evidenceCount: evidenceLedger.length,
    citationCount: sections.citations.length,
    fallbackUsed
  };

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

  if (hasSynthesisDeps(deps)) {
    let verifiedSynthesis: CardSynthesis | undefined;

    try {
      const synthesisResult = await verifiedSynthesisForCard(card, deps);
      if (synthesisResult.tracePatch.synthesis) {
        tracePatch.synthesis = synthesisResult.tracePatch.synthesis;
      }
      verifiedSynthesis = synthesisResult.synthesis;
    } catch (error) {
      tracePatch.synthesis = {
        required: deps.synthesisRequired === true,
        produced: false,
        claimCountBeforeVerify: tracePatch.synthesis?.claimCountBeforeVerify ?? 0,
        claimCountAfterVerify: 0
      };

      if (deps.synthesisRequired) {
        throw new GenerateCardTraceError(boundedCardError(error), tracePatch, { cause: error });
      }
    }

    if (!verifiedSynthesis && deps.synthesisRequired) {
      if (!tracePatch.synthesis) {
        tracePatch.synthesis = {
          required: true,
          produced: false,
          claimCountBeforeVerify: 0,
          claimCountAfterVerify: 0
        };
      }

      throw new GenerateCardTraceError("No synthesis claims survived verification", tracePatch);
    }

    if (verifiedSynthesis) {
      card = { ...card, synthesis: verifiedSynthesis };
    }
  }

  return {
    card: finalizeGeneratedCard(coldStartCardSchema.parse(card)),
    tracePatch
  };
}

function boundedCardError(error: unknown) {
  if (error instanceof Error) {
    return error.message.slice(0, 1000);
  }

  return String(error).slice(0, 1000);
}

export async function generateCardForDomain(domain: string, deps: GenerateCardDeps): Promise<ColdStartCard> {
  const result = await generateCardForDomainWithTrace(domain, deps);
  return result.card;
}
