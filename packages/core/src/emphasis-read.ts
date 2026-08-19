/*
 * Pure logic for the emphasis read (the Pay attention to row of the Lens). The thin-file gate runs in
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
// the card alone, before founder voice is fetched for THIS run, so a fresh fetch never
// influences it. But a repeat analysis run's working card keeps every founder_authored ("fv"-
// prefixed) citation a PRIOR run fetched, additive across runs (apps/web/src/inngest/
// emphasis-read.ts), so this gate excludes founder-authored citations explicitly rather than
// trusting card.citations to be prior-run-clean. Without the exclusion, a card whose only
// non-enrichment evidence is a prior run's founder-voice fetch would clear the gate on evidence
// this run never independently earned.
export function emphasisThinFileReason(card: ColdStartCard): EmphasisThinFileReason | null {
  const substantive = card.citations.filter((citation) => {
    if (isEnrichmentLike(citation)) return false;
    return emphasisSourceClass(citation, card.domain) !== "founder-authored";
  });
  if (substantive.length < EMPHASIS_MIN_NON_ENRICHMENT_CITATIONS) {
    return "too-few-sources";
  }

  const companyAuthored = substantive.filter(
    (citation) => emphasisSourceClass(citation, card.domain) === "company-authored"
  );
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
