import {
  clampCompleteDescriptionSentence,
  cleanDescriptionText,
  completeDescriptionSentence,
  descriptionSentences,
  firstDescriptionSentence,
  isWeakDescriptionLabel,
  type ColdStartCard,
  type ResolvedFact
} from "@cold-start/core";
import type { ProviderFactCandidate } from "@cold-start/providers";

export type ProviderFactMergeTrace = {
  candidateCount: number;
  appliedCount: number;
  citationCount: number;
  paths: string[];
  appliedByEndpoint: Record<string, number>;
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

function statusRank(status: ResolvedFact<unknown>["status"]) {
  return { unknown: 0, inferred: 1, mixed: 2, verified: 3 }[status];
}

function confidenceRank(confidence: ResolvedFact<unknown>["confidence"]) {
  return { low: 1, medium: 2, high: 3 }[confidence];
}

function sameComparable(left: { domain: string }, right: { domain: string }) {
  return left.domain.replace(/^www\./i, "").toLowerCase() === right.domain.replace(/^www\./i, "").toLowerCase();
}

function sameSignal(left: { url: string; title: string }, right: { url: string; title: string }) {
  return (
    left.url.replace(/\/$/, "").toLowerCase() === right.url.replace(/\/$/, "").toLowerCase() ||
    left.title.trim().toLowerCase() === right.title.trim().toLowerCase()
  );
}

type Person = NonNullable<ColdStartCard["team"]["founders"]["value"]>[number];

function personKey(person: Person) {
  return person.name.trim().toLowerCase();
}

function samePerson(left: Person, right: Person) {
  return personKey(left) === personKey(right);
}

function mergePerson(left: Person, right: Person): Person {
  return {
    name: left.name,
    role: left.role ?? right.role,
    sourceUrl: left.sourceUrl ?? right.sourceUrl,
    ...mergeEmail(left, right),
    ...mergeChannel("githubUrl", left, right),
    ...mergeChannel("xUrl", left, right),
    ...mergeChannel("personalUrl", left, right),
  };
}

// Prefer an observed address over an inferred guess for the same person.
function mergeEmail(left: Person, right: Person): Pick<Person, "email" | "emailStatus"> | Record<string, never> {
  const observed = [left, right].find((person) => person.email && person.emailStatus === "observed");
  const chosen = observed ?? [left, right].find((person) => person.email);
  if (!chosen?.email) {
    return {};
  }
  return { email: chosen.email, emailStatus: chosen.emailStatus ?? null };
}

function mergeChannel(key: "githubUrl" | "xUrl" | "personalUrl", left: Person, right: Person): Partial<Person> {
  const value = left[key] ?? right[key];
  return value ? { [key]: value } : {};
}

function appendPeople(
  existing: ResolvedFact<Person[]>,
  candidate: ProviderFactCandidate<Person[]>,
  citationId: string,
): ResolvedFact<Person[]> {
  const people = existing.value ? [...existing.value] : [];
  for (const person of candidate.value) {
    const index = people.findIndex((current) => samePerson(current, person));
    if (index >= 0) {
      const current = people[index];
      if (current) {
        people[index] = mergePerson(current, person);
      }
      continue;
    }
    people.push(person);
  }

  return {
    value: people,
    status: !existing.value || statusRank(candidate.status) > statusRank(existing.status) ? candidate.status : existing.status,
    confidence: !existing.value || confidenceRank(candidate.confidence) > confidenceRank(existing.confidence) ? candidate.confidence : existing.confidence,
    citationIds: Array.from(new Set([...existing.citationIds, citationId])),
  };
}

function candidateKey(candidate: ProviderFactCandidate) {
  return `${candidate.endpoint}:${candidate.citationUrl}`;
}

function citationTitle(candidate: ProviderFactCandidate) {
  return candidate.citationTitle.trim() || `${candidate.provider} ${candidate.endpoint}`;
}

function firstSentence(value: string | null | undefined, maxLength = 180) {
  if (!value) {
    return null;
  }

  const trimmed = cleanDescriptionText(value);
  if (!trimmed) {
    return null;
  }

  const sentence = completeDescriptionSentence(firstDescriptionSentence(trimmed));
  if (!sentence) {
    return null;
  }
  if (sentence.length <= maxLength) {
    return sentence;
  }

  return clampCompleteDescriptionSentence(sentence, maxLength);
}

function expandedDescription(value: string | null | undefined) {
  if (!value) {
    return null;
  }

  const cleaned = cleanDescriptionText(value);
  if (!cleaned) {
    return null;
  }

  const sentences = descriptionSentences(cleaned, 3);
  const joined = sentences.join(" ");
  return joined ? completeDescriptionSentence(joined) : null;
}

type DescriptionValue = NonNullable<NonNullable<ColdStartCard["identity"]["description"]>["value"]>;

function sanitizeDescriptionValue(value: DescriptionValue): DescriptionValue | null {
  const shortDescription = firstSentence(value.shortDescription);
  if (!shortDescription || isWeakDescriptionLabel(shortDescription)) {
    return null;
  }

  return {
    shortDescription,
    expandedDescription: expandedDescription(value.expandedDescription),
    concept: firstSentence(value.concept),
    serves: firstSentence(value.serves),
    mechanism: firstSentence(value.mechanism),
  };
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
        appliedByEndpoint: {},
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
    signals: [...sections.signals],
    comparables: [...sections.comparables],
  };
  const appliedPaths: string[] = [];
  const appliedByEndpoint: Record<string, number> = {};

  function markApplied(candidate: ProviderFactCandidate) {
    appliedPaths.push(candidate.path);
    appliedByEndpoint[candidate.endpoint] = (appliedByEndpoint[candidate.endpoint] ?? 0) + 1;
  }

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
    markApplied(candidate);
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
          markApplied(candidate);
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
        if (shouldFill(next.identity.description)) {
          const descriptionCandidate = candidate as ProviderFactCandidate<DescriptionValue>;
          const sanitizedValue = sanitizeDescriptionValue(descriptionCandidate.value);
          if (!sanitizedValue) {
            break;
          }
          const citationId = citationIdFor(descriptionCandidate);
          const sanitizedFact = resolved({ ...descriptionCandidate, value: sanitizedValue }, citationId);
          next.identity.description = sanitizedFact;
          if (shouldFill(next.identity.oneLiner)) {
            next.identity.oneLiner = {
              ...sanitizedFact,
              value: sanitizedValue.shortDescription,
            };
          }
          markApplied(candidate);
        }
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
      case "team.founders": {
        const citationId = citationIdFor(candidate);
        next.team.founders = appendPeople(
          next.team.founders,
          candidate as ProviderFactCandidate<Person[]>,
          citationId,
        );
        markApplied(candidate);
        break;
      }
      case "team.keyExecs": {
        const citationId = citationIdFor(candidate);
        next.team.keyExecs = appendPeople(
          next.team.keyExecs,
          candidate as ProviderFactCandidate<Person[]>,
          citationId,
        );
        markApplied(candidate);
        break;
      }
      case "team.headcount":
        applyFact(candidate as ProviderFactCandidate<NonNullable<ColdStartCard["team"]["headcount"]["value"]>>, () => shouldFill(next.team.headcount), (fact) => {
          next.team.headcount = fact;
        });
        break;
      case "signals": {
        const signal = candidate.value as ColdStartCard["signals"][number];
        if (next.signals.some((existing) => sameSignal(existing, signal))) {
          break;
        }
        const citationId = citationIdFor(candidate);
        next.signals.push({
          ...signal,
          citationIds: Array.from(new Set([...(signal.citationIds ?? []), citationId])),
        });
        markApplied(candidate);
        break;
      }
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
        markApplied(candidate);
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
      appliedByEndpoint,
    },
  };
}
