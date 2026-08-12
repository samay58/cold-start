/*
 * Pure logic for the emphasis read (the sixth Lens category). The thin-file gate runs in
 * code before any model call or paid lane fetch, so a thin card costs nothing. Digests give
 * the LLM stage what each filed source is, says, and leads with, without shipping raw pages.
 */
import type { Citation, ColdStartCard } from "./card";
import { sourceQualityForSource } from "./source-quality";
import { takeSentences } from "./sentences";

export type EmphasisThinFileReason = "too-few-sources" | "no-company-authored";
export type EmphasisSourceClass =
  | "founder-authored"
  | "company-authored"
  | "reporting"
  | "independent"
  | "unknown";

export type EmphasisSourceDigest = {
  citationId: string;
  sourceClass: EmphasisSourceClass;
  headline: string;
  leadsWith: string;
};

const EMPHASIS_MIN_NON_ENRICHMENT_CITATIONS = 4;

function isEnrichmentLike(citation: Citation) {
  return citation.sourceType === "enrichment" || citation.sourceType === "rdap";
}

function tierFor(citation: Citation, targetDomain: string) {
  return (citation.sourceQuality ?? sourceQualityForSource(citation, { targetDomain })).tier;
}

export function emphasisSourceClass(citation: Citation, targetDomain: string): EmphasisSourceClass {
  const tier = tierFor(citation, targetDomain);
  if (tier === "founder_authored") return "founder-authored";
  if (tier === "primary_company" || tier === "press_release") return "company-authored";
  if (tier === "independent_technical" || tier === "independent_analysis") return "independent";
  if (tier === "independent_report" || citation.sourceType === "news" || citation.sourceType === "filing") return "reporting";
  return "unknown";
}

// The spec's triggers, verbatim: almost no sources, or zero company-authored ones. Runs on
// the card alone, before founder voice is fetched, so founder_authored never influences it.
export function emphasisThinFileReason(card: ColdStartCard): EmphasisThinFileReason | null {
  const substantive = card.citations.filter((citation) => !isEnrichmentLike(citation));
  if (substantive.length < EMPHASIS_MIN_NON_ENRICHMENT_CITATIONS) {
    return "too-few-sources";
  }

  const companyAuthored = substantive.filter((citation) => {
    const sourceClass = emphasisSourceClass(citation, card.domain);
    return sourceClass === "company-authored" || sourceClass === "founder-authored";
  });
  return companyAuthored.length === 0 ? "no-company-authored" : null;
}

export function emphasisSourceDigests(card: ColdStartCard): EmphasisSourceDigest[] {
  return card.citations
    .filter((citation) => !isEnrichmentLike(citation))
    .map((citation) => ({
      citationId: citation.id,
      sourceClass: emphasisSourceClass(citation, card.domain),
      headline: citation.title,
      leadsWith: takeSentences(citation.snippet ?? "", 2).join(" ").trim()
    }));
}
