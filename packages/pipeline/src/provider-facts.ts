import type { ColdStartCard, ResolvedFact } from "@cold-start/core";
import type { ProviderFactCandidate } from "@cold-start/providers";

export type ProviderFactMergeTrace = {
  candidateCount: number;
  appliedCount: number;
  citationCount: number;
  paths: string[];
};

export type SectionsWithFacts = Pick<ColdStartCard, "identity" | "funding" | "team" | "signals" | "comparables" | "citations">;

function resolved<T>(candidate: ProviderFactCandidate<T>, citationId: string): ResolvedFact<T> {
  return {
    value: candidate.value,
    status: candidate.status,
    confidence: candidate.confidence,
    citationIds: [citationId],
  };
}

function shouldFill<T>(fact: ResolvedFact<T> | undefined) {
  return !fact || fact.value === null || fact.citationIds.length === 0;
}

function sameComparable(left: { domain: string }, right: { domain: string }) {
  return left.domain.replace(/^www\./i, "").toLowerCase() === right.domain.replace(/^www\./i, "").toLowerCase();
}

function candidateKey(candidate: ProviderFactCandidate) {
  return `${candidate.endpoint}:${candidate.citationUrl}`;
}

function citationTitle(candidate: ProviderFactCandidate) {
  return candidate.citationTitle.trim() || `${candidate.provider} ${candidate.endpoint}`;
}

function providerCitationBuilder(sections: SectionsWithFacts) {
  const citations = [...sections.citations];
  const idsByKey = new Map<string, string>();
  for (const citation of citations) {
    idsByKey.set(citation.url, citation.id);
  }

  let providerIndex = 1;
  function citationIdFor(candidate: ProviderFactCandidate) {
    const existingId = idsByKey.get(candidate.citationUrl) ?? idsByKey.get(candidateKey(candidate));
    if (existingId) {
      idsByKey.set(candidateKey(candidate), existingId);
      return existingId;
    }

    let id = `p${providerIndex}`;
    providerIndex += 1;
    while (citations.some((citation) => citation.id === id)) {
      id = `p${providerIndex}`;
      providerIndex += 1;
    }

    citations.push({
      id,
      url: candidate.citationUrl,
      title: citationTitle(candidate),
      fetchedAt: candidate.fetchedAt,
      sourceType: candidate.sourceType,
      ...(candidate.rawText ? { snippet: candidate.rawText.slice(0, 280) } : {}),
    });
    idsByKey.set(candidate.citationUrl, id);
    idsByKey.set(candidateKey(candidate), id);
    return id;
  }

  return { citations, citationIdFor };
}

export function applyProviderFactCandidates(
  sections: SectionsWithFacts,
  candidates: ProviderFactCandidate[],
): { sections: SectionsWithFacts; trace: ProviderFactMergeTrace } {
  if (candidates.length === 0) {
    return {
      sections,
      trace: {
        candidateCount: 0,
        appliedCount: 0,
        citationCount: 0,
        paths: [],
      },
    };
  }

  const { citations, citationIdFor } = providerCitationBuilder(sections);
  const next: SectionsWithFacts = {
    ...sections,
    citations,
    identity: { ...sections.identity },
    funding: { ...sections.funding },
    team: { ...sections.team },
    comparables: [...sections.comparables],
  };
  const appliedPaths: string[] = [];

  function applyFact<T>(
    candidate: ProviderFactCandidate<T>,
    shouldApply: () => boolean,
    write: (fact: ResolvedFact<T>) => void,
  ) {
    if (!shouldApply()) {
      return;
    }
    const citationId = citationIdFor(candidate);
    write(resolved(candidate, citationId));
    appliedPaths.push(candidate.path);
  }

  for (const candidate of candidates) {
    switch (candidate.path) {
      case "identity.name":
        applyFact(candidate as ProviderFactCandidate<string>, () => shouldFill(next.identity.name), (fact) => {
          next.identity.name = fact;
        });
        break;
      case "identity.websiteUrl":
        applyFact(candidate as ProviderFactCandidate<string>, () => shouldFill(next.identity.websiteUrl), (fact) => {
          next.identity.websiteUrl = fact;
        });
        break;
      case "identity.linkedinUrl":
        applyFact(candidate as ProviderFactCandidate<string>, () => shouldFill(next.identity.linkedinUrl), (fact) => {
          next.identity.linkedinUrl = fact;
        });
        break;
      case "identity.logoUrl":
        if (!next.identity.logoUrl && typeof candidate.value === "string") {
          next.identity.logoUrl = candidate.value;
          appliedPaths.push(candidate.path);
        }
        break;
      case "identity.hq":
        applyFact(candidate as ProviderFactCandidate<NonNullable<ColdStartCard["identity"]["hq"]["value"]>>, () => shouldFill(next.identity.hq), (fact) => {
          next.identity.hq = fact;
        });
        break;
      case "identity.foundedYear":
        applyFact(candidate as ProviderFactCandidate<number>, () => shouldFill(next.identity.foundedYear), (fact) => {
          next.identity.foundedYear = fact;
        });
        break;
      case "identity.description":
        applyFact(candidate as ProviderFactCandidate<NonNullable<NonNullable<ColdStartCard["identity"]["description"]>["value"]>>, () => shouldFill(next.identity.description), (fact) => {
          next.identity.description = fact;
          if (shouldFill(next.identity.oneLiner)) {
            next.identity.oneLiner = {
              ...fact,
              value: fact.value?.shortDescription ?? null,
            };
          }
        });
        break;
      case "funding.totalRaisedUsd":
        applyFact(candidate as ProviderFactCandidate<number>, () => shouldFill(next.funding.totalRaisedUsd), (fact) => {
          next.funding.totalRaisedUsd = fact;
        });
        break;
      case "funding.lastRound":
        applyFact(candidate as ProviderFactCandidate<NonNullable<ColdStartCard["funding"]["lastRound"]["value"]>>, () => shouldFill(next.funding.lastRound), (fact) => {
          next.funding.lastRound = fact;
        });
        break;
      case "team.headcount":
        applyFact(candidate as ProviderFactCandidate<NonNullable<ColdStartCard["team"]["headcount"]["value"]>>, () => shouldFill(next.team.headcount), (fact) => {
          next.team.headcount = fact;
        });
        break;
      case "comparables": {
        const comparable = candidate.value as ColdStartCard["comparables"][number];
        if (next.comparables.some((existing) => sameComparable(existing, comparable))) {
          break;
        }
        const citationId = citationIdFor(candidate);
        next.comparables.push({
          ...comparable,
          citationIds: Array.from(new Set([...(comparable.citationIds ?? []), citationId])),
        });
        appliedPaths.push(candidate.path);
        break;
      }
    }
  }

  return {
    sections: next,
    trace: {
      candidateCount: candidates.length,
      appliedCount: appliedPaths.length,
      citationCount: citations.length - sections.citations.length,
      paths: Array.from(new Set(appliedPaths)).sort(),
    },
  };
}
