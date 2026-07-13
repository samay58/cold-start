import type { ColdStartCard } from "./card";
import { sentenceCount } from "./sentences";

type CardForQuality = Pick<ColdStartCard, "citations" | "comparables" | "domain" | "funding" | "identity" | "signals" | "team">;

const MIN_STRUCTURED_PROFILE_FACTS = 4;
const MIN_VISIBLE_PROFILE_FACTS = 2;
const MIN_SOURCE_BACKED_CITATIONS = 3;
const MAX_OVERVIEW_LENGTH = 260;

export type PublicProfileQuality = {
  hasCitations: boolean;
  hasName: boolean;
  hasSummary: boolean;
  structuredFactCount: number;
  minimumStructuredFactCount: number;
  visibleFactCount: number;
  minimumVisibleFactCount: number;
  isAnalysisReady: boolean;
};

export type InvestorProfileQuality = PublicProfileQuality & {
  conciseOverview: boolean;
  sourceBackedCitationCount: number;
  minimumSourceBackedCitationCount: number;
  hasInvestorEvidence: boolean;
  isInvestorReady: boolean;
};

function hasCitedSources(card: Pick<ColdStartCard, "citations">): boolean {
  return card.citations.length > 0;
}

function hasPeople(card: CardForQuality) {
  return Boolean((card.team.founders.value?.length ?? 0) > 0 || (card.team.keyExecs.value?.length ?? 0) > 0);
}

function hasFunding(card: CardForQuality) {
  return Boolean(
    card.funding.lastRound.value ||
      card.funding.totalRaisedUsd.value !== null ||
      (card.funding.rounds?.value?.length ?? 0) > 0 ||
      (card.funding.investors.value?.length ?? 0) > 0
  );
}

function hasInvestorEvidence(card: CardForQuality) {
  return Boolean(hasFunding(card) || hasPeople(card) || card.signals.length > 0 || card.comparables.length > 0);
}

function normalizedText(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .replace(/\/$/, "");
}

function isDomainPlaceholder(value: string | null | undefined, domain: string) {
  if (!value) {
    return true;
  }

  const normalizedValue = normalizedText(value);
  const normalizedDomain = normalizedText(domain);

  return (
    normalizedValue === normalizedDomain ||
    normalizedValue === `www.${normalizedDomain}` ||
    (normalizedValue.includes(".") && normalizedValue.replace(/\s+/g, "") === normalizedDomain)
  );
}

function hasUsefulName(card: CardForQuality) {
  return !isDomainPlaceholder(card.identity.name.value, card.domain);
}

function hasUsefulText(value: string | null | undefined, domain: string) {
  if (!value) {
    return false;
  }

  const trimmed = value.trim();
  return trimmed.length >= 12 && !isDomainPlaceholder(trimmed, domain);
}

function hasSummary(card: CardForQuality) {
  const description = card.identity.description?.value;
  return Boolean(
    hasUsefulText(card.identity.oneLiner.value, card.domain) ||
      hasUsefulText(description?.shortDescription, card.domain) ||
      hasUsefulText(description?.concept, card.domain) ||
      hasUsefulText(description?.serves, card.domain) ||
      hasUsefulText(description?.mechanism, card.domain)
  );
}

function overviewText(card: CardForQuality) {
  return card.identity.description?.value?.shortDescription ?? card.identity.oneLiner.value ?? "";
}

function hasConciseOverview(card: CardForQuality) {
  const overview = overviewText(card).trim();
  return overview.length > 0 && overview.length <= MAX_OVERVIEW_LENGTH && sentenceCount(overview) <= 2;
}

function citationHost(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./i, "").toLowerCase();
  } catch {
    return "";
  }
}

function isVendorOnlyCitation(citation: ColdStartCard["citations"][number]) {
  const host = citationHost(citation.url);
  return citation.sourceType === "enrichment" || host === "stableenrich.dev" || host.endsWith(".stableenrich.dev");
}

function sourceBackedCitationCount(card: CardForQuality) {
  return card.citations.filter((citation) => !isVendorOnlyCitation(citation)).length;
}

export function publicProfileStructuredFactCount(card: CardForQuality): number {
  return [
    Boolean(card.identity.websiteUrl?.value),
    Boolean(card.identity.hq.value),
    Boolean(card.identity.foundedYear.value),
    hasFunding(card),
    Boolean(card.team.headcount.value),
    hasPeople(card),
    card.signals.length > 0,
    card.comparables.length > 0,
  ].filter(Boolean).length;
}

export function publicProfileVisibleFactCount(card: CardForQuality): number {
  return [
    Boolean(card.identity.hq.value),
    Boolean(card.identity.foundedYear.value),
    hasFunding(card),
    Boolean(card.team.headcount.value),
    hasPeople(card),
  ].filter(Boolean).length;
}

export function publicProfileQuality(card: CardForQuality): PublicProfileQuality {
  const structuredFactCount = publicProfileStructuredFactCount(card);
  const visibleFactCount = publicProfileVisibleFactCount(card);
  const quality = {
    hasCitations: hasCitedSources(card),
    hasName: hasUsefulName(card),
    hasSummary: hasSummary(card),
    structuredFactCount,
    visibleFactCount,
    minimumStructuredFactCount: MIN_STRUCTURED_PROFILE_FACTS,
    minimumVisibleFactCount: MIN_VISIBLE_PROFILE_FACTS,
  };

  return {
    ...quality,
    isAnalysisReady: Boolean(
      quality.hasCitations &&
        quality.hasName &&
        quality.hasSummary &&
        structuredFactCount >= MIN_STRUCTURED_PROFILE_FACTS &&
        visibleFactCount >= MIN_VISIBLE_PROFILE_FACTS
    ),
  };
}

export function hasUsablePublicProfile(card: CardForQuality): boolean {
  return publicProfileQuality(card).isAnalysisReady;
}

export function investorProfileQuality(card: CardForQuality): InvestorProfileQuality {
  const publicQuality = publicProfileQuality(card);
  const backedCitationCount = sourceBackedCitationCount(card);
  const conciseOverview = hasConciseOverview(card);
  const hasInvestorEvidenceValue = hasInvestorEvidence(card);

  return {
    ...publicQuality,
    conciseOverview,
    sourceBackedCitationCount: backedCitationCount,
    minimumSourceBackedCitationCount: MIN_SOURCE_BACKED_CITATIONS,
    hasInvestorEvidence: hasInvestorEvidenceValue,
    isInvestorReady: Boolean(
      publicQuality.isAnalysisReady &&
        conciseOverview &&
        backedCitationCount >= MIN_SOURCE_BACKED_CITATIONS &&
        hasInvestorEvidenceValue
    ),
  };
}

export function hasInvestorUsableProfile(card: CardForQuality): boolean {
  return investorProfileQuality(card).isInvestorReady;
}

export function analysisBlockedReason(card: CardForQuality): string | null {
  const quality = investorProfileQuality(card);

  if (!quality.hasCitations) {
    return "profile needs cited sources before analysis";
  }

  if (!publicProfileQuality(card).isAnalysisReady) {
    return "profile needs more structured facts before analysis";
  }

  if (quality.sourceBackedCitationCount < MIN_SOURCE_BACKED_CITATIONS) {
    return "profile needs source-backed evidence before analysis";
  }

  if (!quality.conciseOverview) {
    return "profile needs a concise overview before analysis";
  }

  if (!quality.hasInvestorEvidence) {
    return "profile needs investor evidence before analysis";
  }

  return null;
}

export function canRunInvestorAnalysis(card: CardForQuality): boolean {
  return analysisBlockedReason(card) === null;
}
