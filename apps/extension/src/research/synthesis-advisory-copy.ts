import type { SynthesisAdvisory, SynthesisGateReason } from "@cold-start/core";

const SOURCE_TYPE_LABELS: Record<string, string> = {
  company_site: "company site",
  news: "news",
  filing: "filing",
  github: "GitHub",
  rdap: "domain registration",
  other: "other"
};

// Plain-language mapping from the gate's reason and advisory codes (see
// packages/core/src/synthesis-evidence.ts) to what an investor reader needs to know: what is
// missing, not that something broke. Reasons are why synthesis was withheld; advisories carry
// the same evidence-composition signal whether synthesis was withheld or filed, so
// LensWithheldCard and InvestorReadCard's live posture line both read this module rather than
// keeping their own copies. Typed as exhaustive records (not the loose Record<string, string>
// this replaced) so a new SynthesisGateReason or SynthesisAdvisory value fails the build here
// instead of silently rendering nothing.
export const REASON_COPY: Record<SynthesisGateReason, string> = {
  "citation-floor": "Fewer than 8 cited sources survived.",
  "no-usable-source-type": "Only enrichment records are cited so far.",
  "no-claims-survived": "Analysis ran; no claim survived verification against its sources."
};

const ADVISORY_COPY: Record<SynthesisAdvisory, (nonEnrichmentSourceTypes: readonly string[]) => string> = {
  "single-source-class": (nonEnrichmentSourceTypes) => {
    const [onlySourceType] = nonEnrichmentSourceTypes;
    const label = onlySourceType ? SOURCE_TYPE_LABELS[onlySourceType] ?? onlySourceType : null;
    return label ? `Only ${label} coverage is cited so far.` : "Only one source class is cited so far.";
  },
  "no-funding-evidence": () => "No funding evidence is cited yet.",
  "no-named-team": () => "No named team member is cited yet."
};

export function isSynthesisGateReason(value: string): value is SynthesisGateReason {
  return value in REASON_COPY;
}

export function isSynthesisAdvisory(value: string): value is SynthesisAdvisory {
  return value in ADVISORY_COPY;
}

export function advisoryCopy(advisory: SynthesisAdvisory, nonEnrichmentSourceTypes: readonly string[]): string {
  return ADVISORY_COPY[advisory](nonEnrichmentSourceTypes);
}
