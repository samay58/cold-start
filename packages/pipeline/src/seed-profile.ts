import {
  type ColdStartCard,
  coldStartCardSchema,
  materializeFundingFromCitations,
  type ResolvedFact,
  sanitizeCardTrust,
  stripUnsupportedSynthesis
} from "@cold-start/core";
import type { ProviderFactCandidate, ProviderSource } from "@cold-start/providers";
import type { EvidenceLedgerEntry } from "./evidence-ledger";
import { applyProviderFactCandidates } from "./provider-facts";
import { resolveIdentityFromInput } from "./resolve-identity";

export const extractedCardSectionsSchema = coldStartCardSchema.pick({
  identity: true,
  funding: true,
  team: true,
  signals: true,
  comparables: true,
  citations: true
});

export type ExtractedCardSections = Pick<
  ColdStartCard,
  "identity" | "funding" | "team" | "signals" | "comparables" | "citations"
>;

export type SeedProfileTrace = {
  providerFactCandidateCount: number;
  providerFactAppliedCount: number;
  providerFactPaths: string[];
  citationCount: number;
  fallbackFields: string[];
};

type CitationSourceType = ColdStartCard["citations"][number]["sourceType"];

export function unknownFact<T>(): ResolvedFact<T> {
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

export function fallbackSectionsFromEvidence(
  skeleton: ColdStartCard,
  evidenceLedger: EvidenceLedgerEntry[]
): ExtractedCardSections | null {
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
      websiteUrl: unknownFact<NonNullable<NonNullable<ColdStartCard["identity"]["websiteUrl"]>["value"]>>(),
      linkedinUrl: unknownFact<NonNullable<NonNullable<ColdStartCard["identity"]["linkedinUrl"]>["value"]>>(),
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
  const trusted = stripUnsupportedSynthesis(sanitizeCardTrust(materializeFundingFromCitations(card)));
  return {
    ...trusted,
    comparables: trusted.comparables.filter((comparable) => isUsableComparableForCompany(trusted, comparable)),
  };
}

function isUsableComparableForCompany(card: ColdStartCard, comparable: ColdStartCard["comparables"][number]) {
  const targetTerms = comparableTargetTerms(card);
  const comparableName = normalizeComparableName(comparable.name);
  if (!comparableName) {
    return false;
  }

  return !targetTerms.some((term) => comparableName === term || comparableName.startsWith(`${term} `));
}

function comparableTargetTerms(card: ColdStartCard) {
  const terms = [
    card.domain.split(".")[0] ?? card.domain,
    card.identity.name.value,
  ].filter((term): term is string => typeof term === "string" && term.trim().length > 0);

  return Array.from(new Set(terms.map(normalizeComparableName).filter((term) => term.length >= 3)));
}

function normalizeComparableName(value: string) {
  return value
    .toLowerCase()
    .replace(/\b(ai|inc|labs|company|corp|corporation|llc|ltd)\b/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function sectionsFromCard(card: ColdStartCard): ExtractedCardSections {
  return {
    identity: card.identity,
    funding: card.funding,
    team: card.team,
    signals: card.signals,
    comparables: card.comparables,
    citations: card.citations
  };
}

function bestSeedSource(sources: ProviderSource[]) {
  return (
    sources.find((source) => source.intent === "homepage") ??
    sources.find((source) => source.intent === "company_profile") ??
    sources[0] ??
    null
  );
}

function sourceCitation(source: ProviderSource): ColdStartCard["citations"][number] {
  return {
    id: "seed1",
    url: source.url,
    title: source.title || source.url,
    fetchedAt: source.fetchedAt,
    sourceType: source.sourceType,
    snippet: source.rawText.replace(/\s+/g, " ").trim().slice(0, 280)
  };
}

function cleanSeedTitle(title: string, domain: string) {
  const normalized = title
    .replace(/\s+[-|]\s+.*$/, "")
    .replace(/\b(home|homepage|official site)\b/gi, "")
    .replace(/\s+/g, " ")
    .trim();
  return normalized.length >= 2 && !normalized.includes("http") ? normalized : readableNameFromDomain(domain);
}

function cleanSeedSummary(rawText: string, domain: string) {
  const firstLine = rawText
    .split(/\r?\n/)
    .map((line) => line.replace(/[#*_`>\[\]()]|https?:\/\/\S+/g, " ").replace(/\s+/g, " ").trim())
    .find((line) => {
      const lower = line.toLowerCase();
      return (
        line.length >= 24 &&
        line.length <= 180 &&
        !lower.includes("cookie") &&
        !lower.includes("javascript") &&
        !lower.includes("captcha") &&
        !isDomainPlaceholderLike(line, domain)
      );
    });

  return firstLine ?? null;
}

function isDomainPlaceholderLike(value: string, domain: string) {
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .replace(/\/$/, "");
  return normalized === domain.toLowerCase() || normalized.replace(/\s+/g, "") === domain.toLowerCase();
}

export function buildSeedProfileCard(input: {
  domain: string;
  sources: ProviderSource[];
  providerFacts: ProviderFactCandidate[];
}): { card: ColdStartCard; sections: ExtractedCardSections; trace: SeedProfileTrace } {
  const skeleton = buildSkeletonCard(input.domain);
  let sections = extractedCardSectionsSchema.parse(sectionsFromCard(skeleton));
  const providerFactMerge = applyProviderFactCandidates(sections, input.providerFacts);
  sections = extractedCardSectionsSchema.parse(providerFactMerge.sections);

  const fallbackFields: string[] = [];
  const seedSource = bestSeedSource(input.sources);
  if (seedSource) {
    const existingCitation = sections.citations.length > 0 ? null : sourceCitation(seedSource);
    if (existingCitation) {
      sections = { ...sections, citations: [existingCitation] };
    }
    const citationId = existingCitation?.id ?? sections.citations[0]?.id;

    if (citationId && sections.identity.name.value === null) {
      sections = {
        ...sections,
        identity: {
          ...sections.identity,
          name: {
            value: cleanSeedTitle(seedSource.title, skeleton.domain),
            status: "inferred",
            confidence: "low",
            citationIds: [citationId]
          }
        }
      };
      fallbackFields.push("identity.name");
    }

    if (citationId && sections.identity.websiteUrl?.value === null) {
      sections = {
        ...sections,
        identity: {
          ...sections.identity,
          websiteUrl: {
            value: `https://${skeleton.domain}`,
            status: "inferred",
            confidence: "low",
            citationIds: [citationId]
          }
        }
      };
      fallbackFields.push("identity.websiteUrl");
    }

    const seedSummary = cleanSeedSummary(seedSource.rawText, skeleton.domain);
    if (citationId && seedSummary && sections.identity.oneLiner.value === null) {
      sections = {
        ...sections,
        identity: {
          ...sections.identity,
          oneLiner: {
            value: seedSummary,
            status: "inferred",
            confidence: "low",
            citationIds: [citationId]
          }
        }
      };
      fallbackFields.push("identity.oneLiner");
    }
  }

  const card = finalizeGeneratedCard(coldStartCardSchema.parse({
    ...skeleton,
    generatedAt: new Date().toISOString(),
    identity: sections.identity,
    funding: sections.funding,
    team: sections.team,
    signals: sections.signals,
    comparables: sections.comparables,
    citations: sections.citations
  }));

  return {
    card,
    sections: extractedCardSectionsSchema.parse(sectionsFromCard(card)),
    trace: {
      providerFactCandidateCount: providerFactMerge.trace.candidateCount,
      providerFactAppliedCount: providerFactMerge.trace.appliedCount,
      providerFactPaths: providerFactMerge.trace.paths,
      citationCount: card.citations.length,
      fallbackFields
    }
  };
}
