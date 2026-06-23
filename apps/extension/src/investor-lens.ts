import {
  sourceQualityForSource,
  type Citation,
  type ColdStartCard,
  type SourcedText
} from "@cold-start/core";

export type SourcePosture = "company-authored" | "independent" | "reporting" | "enrichment" | "unknown";

export type InvestorReadDisplay = {
  whyItMightMatter: string;
  evidenceThatHolds: Array<{
    label: string;
    sourcePosture: SourcePosture;
  }>;
  whatCouldBreak: string;
  bestNextQuestion: string;
  evidenceStatus: string;
  supportedClaimCount: number;
  timingNotFound: boolean;
};

const TIMING_NOT_FOUND_COPY = "Timing not found";
const NO_SUPPORTED_BREAK_COPY = "No supported break-risk survived verification.";

function stripInvestorLensCitationMarkers(text: string) {
  return text
    .replace(/\s*\[(?:c|C)?[\w.-]+(?:,\s*(?:c|C)?[\w.-]+)*\]/g, "")
    .replace(/\s+([.,;:!?])/g, "$1")
    .replace(/\s{2,}/g, " ")
    .trim();
}

export function sourcePostureForCitation(citation: Citation | undefined): SourcePosture {
  if (!citation) {
    return "unknown";
  }

  if (citation.sourceType === "enrichment") {
    return "enrichment";
  }

  const tier = (citation.sourceQuality ?? sourceQualityForSource(citation)).tier;
  if (tier === "independent_technical" || tier === "independent_analysis") {
    return "independent";
  }

  if (tier === "independent_report" || citation.sourceType === "news" || citation.sourceType === "filing") {
    return "reporting";
  }

  if (citation.sourceType === "company_site" || tier === "primary_company" || tier === "press_release") {
    return "company-authored";
  }

  return "unknown";
}

export function timingIsNotFound(card: ColdStartCard) {
  const market = card.synthesis?.marketStructureAndTiming;
  if (!market) {
    return true;
  }

  return Object.values(market).every((claim) => claim === null);
}

function citationLookup(card: ColdStartCard) {
  return new Map(card.citations.map((citation) => [citation.id, citation]));
}

function strongestPosture(card: ColdStartCard, citationIds: readonly string[]): SourcePosture {
  const citations = citationLookup(card);
  const postures = citationIds.map((id) => sourcePostureForCitation(citations.get(id)));
  if (postures.includes("independent")) {
    return "independent";
  }
  if (postures.includes("reporting")) {
    return "reporting";
  }
  if (postures.includes("enrichment")) {
    return "enrichment";
  }
  if (postures.includes("company-authored")) {
    return "company-authored";
  }
  return "unknown";
}

function postureSummary(card: ColdStartCard, claims: SourcedText[]) {
  const citations = citationLookup(card);
  const postures = new Set<SourcePosture>();
  for (const claim of claims) {
    for (const citationId of claim.citationIds) {
      postures.add(sourcePostureForCitation(citations.get(citationId)));
    }
  }

  if (postures.has("independent")) {
    return "independent evidence";
  }
  if (postures.has("reporting")) {
    return "reported evidence";
  }
  if (postures.has("enrichment")) {
    return "enrichment evidence";
  }
  if (postures.has("company-authored")) {
    return "company-authored evidence";
  }
  return "source posture unknown";
}

function marketClaims(card: ColdStartCard): SourcedText[] {
  const market = card.synthesis?.marketStructureAndTiming;
  if (!market) {
    return [];
  }

  return Object.values(market).filter((claim): claim is SourcedText => Boolean(claim));
}

function supportedClaims(card: ColdStartCard) {
  if (!card.synthesis) {
    return [];
  }

  return [
    card.synthesis.whyItMatters,
    ...card.synthesis.bullCase,
    ...card.synthesis.bearCase,
    ...marketClaims(card)
  ];
}

function proofChips(card: ColdStartCard) {
  if (!card.synthesis) {
    return [];
  }

  const proofClaims = [card.synthesis.whyItMatters, ...card.synthesis.bullCase].slice(0, 3);
  return proofClaims.map((claim) => ({
    label: stripInvestorLensCitationMarkers(claim.text),
    sourcePosture: strongestPosture(card, claim.citationIds)
  }));
}

function evidenceStatusLine(card: ColdStartCard, claims: SourcedText[], timingMissing: boolean) {
  const claimCount = claims.length;
  const posture = postureSummary(card, claims);
  const timing = timingMissing ? ` · ${TIMING_NOT_FOUND_COPY}` : "";
  return `Lens filed · ${claimCount} supported ${claimCount === 1 ? "claim" : "claims"} · ${posture}${timing}`;
}

export function investorReadForCard(card: ColdStartCard): InvestorReadDisplay | null {
  if (!card.synthesis) {
    return null;
  }

  const claims = supportedClaims(card);
  const timingMissing = timingIsNotFound(card);

  return {
    whyItMightMatter: stripInvestorLensCitationMarkers(card.synthesis.whyItMatters.text),
    evidenceThatHolds: proofChips(card),
    whatCouldBreak: card.synthesis.bearCase[0]
      ? stripInvestorLensCitationMarkers(card.synthesis.bearCase[0].text)
      : NO_SUPPORTED_BREAK_COPY,
    bestNextQuestion: card.synthesis.openQuestions[0]?.question ?? "No ranked open question survived verification.",
    evidenceStatus: evidenceStatusLine(card, claims, timingMissing),
    supportedClaimCount: claims.length,
    timingNotFound: timingMissing
  };
}
