import type { ColdStartCard, ResolvedFact } from "./card";

// "no-claims-survived" is not produced by synthesisGateDecision below (the gate runs before
// synthesis is attempted). It is stamped by the pipeline when synthesis ran but the verifier
// dropped every claim (packages/pipeline/src/generate-card.ts, withheldCardForNoSurvivors), a
// distinct outcome from the gate blocking outright. Listed here so it shares one reason union
// with the gate reasons, which is what forces apps/extension/src/research/synthesis-advisory-copy.ts's
// exhaustive REASON_COPY map to carry its copy.
export type SynthesisGateReason = "citation-floor" | "no-usable-source-type" | "no-claims-survived";
export type SynthesisAdvisory = "single-source-class" | "no-funding-evidence" | "no-named-team";

export type SynthesisEvidenceSignals = {
  citationCount: number;
  nonEnrichmentSourceTypes: string[];
  hasFundingEvidence: boolean;
  hasNamedTeamMember: boolean;
};

export type SynthesisGateDecision = {
  blocked: boolean;
  reasons: SynthesisGateReason[];
  advisories: SynthesisAdvisory[];
  signals: SynthesisEvidenceSignals;
};

function hasCitedFact(fact: ResolvedFact<unknown> | undefined) {
  return Boolean(fact?.value !== null && fact?.value !== undefined && fact.citationIds.length > 0);
}

export function synthesisEvidenceSignals(card: ColdStartCard): SynthesisEvidenceSignals {
  const nonEnrichmentSourceTypes = [
    ...new Set(
      card.citations
        .filter((citation) => citation.sourceType !== "enrichment")
        .map((citation) => citation.sourceType)
    )
  ];
  const hasFundingEvidence = hasCitedFact(card.funding.totalRaisedUsd) || hasCitedFact(card.funding.lastRound);
  const hasNamedTeamMember = [
    ...(card.team.founders.value ?? []),
    ...(card.team.keyExecs.value ?? [])
  ].some((teamMember) => teamMember.name.trim().length > 0);

  return {
    citationCount: card.citations.length,
    nonEnrichmentSourceTypes,
    hasFundingEvidence,
    hasNamedTeamMember
  };
}

// Pulled out of synthesisGateDecision so the extension can read the same advisory signal live,
// off a card that already carries synthesis (no gate re-run, no minCitations input needed: none
// of the three advisories depend on citation count). LensWithheldCard reads the frozen
// SynthesisWithheld.advisories captured at gate time instead of calling this; the two paths
// never blend on one surface.
export function synthesisAdvisoriesFromSignals(signals: SynthesisEvidenceSignals): SynthesisAdvisory[] {
  const advisories: SynthesisAdvisory[] = [];

  if (signals.nonEnrichmentSourceTypes.length < 2) {
    advisories.push("single-source-class");
  }
  if (!signals.hasFundingEvidence) {
    advisories.push("no-funding-evidence");
  }
  if (!signals.hasNamedTeamMember) {
    advisories.push("no-named-team");
  }

  return advisories;
}

export function synthesisGateDecision(card: ColdStartCard, minCitations: number): SynthesisGateDecision {
  const signals = synthesisEvidenceSignals(card);
  const reasons: SynthesisGateReason[] = [];

  if (signals.citationCount < minCitations) {
    reasons.push("citation-floor");
  }
  if (signals.nonEnrichmentSourceTypes.length < 1) {
    reasons.push("no-usable-source-type");
  }

  return {
    blocked: reasons.length > 0,
    reasons,
    advisories: synthesisAdvisoriesFromSignals(signals),
    signals
  };
}
