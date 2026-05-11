import type { ColdStartCard } from "./card";

type CardWithCitations = Pick<ColdStartCard, "citations">;

export function hasCitedSources(card: CardWithCitations): boolean {
  return card.citations.length > 0;
}

export function analysisBlockedReason(card: CardWithCitations): string | null {
  if (!hasCitedSources(card)) {
    return "Profile needs cited sources before analysis.";
  }

  return null;
}

export function canRunInvestorAnalysis(card: CardWithCitations): boolean {
  return analysisBlockedReason(card) === null;
}
