import type { ColdStartCard } from "@cold-start/core";
import type { PersonReadEvidence, PersonReadResult } from "@cold-start/llm";
import type { ProviderFactCandidate } from "@cold-start/providers";
import type { SectionsWithFacts } from "./provider-facts";

/*
 * Build per-person evidence for the person_read LLM stage from what contact enrichment
 * already holds: stored citations, applied provider-fact candidates, and raw sources. Every
 * evidence entry must resolve to a citationId already present in the caller's citations list;
 * candidates and sources whose URL never became a citation are excluded rather than inventing
 * a new id.
 */

type CardPerson = NonNullable<ColdStartCard["team"]["founders"]["value"]>[number];

const defaultMaxEvidencePerPerson = 8;
const maxEvidenceTextLength = 700;

function mentionsName(text: string, name: string): boolean {
  const needle = name.trim().toLowerCase();
  if (!needle) {
    return false;
  }
  return text.toLowerCase().includes(needle);
}

function citationIdForUrl(citations: Array<{ id: string; url: string }>, url: string): string | null {
  return citations.find((citation) => citation.url === url)?.id ?? null;
}

export function buildPersonReadEvidence(input: {
  people: CardPerson[];
  citations: Array<{ id: string; title: string; url: string; snippet?: string }>;
  candidates: ProviderFactCandidate[];
  sources: Array<{ url: string; title: string; rawText: string }>;
  maxEvidencePerPerson?: number;
}): PersonReadEvidence[] {
  const maxEvidence = input.maxEvidencePerPerson ?? defaultMaxEvidencePerPerson;

  return input.people.map((person) => {
    const evidence: PersonReadEvidence["evidence"] = [];

    for (const citation of input.citations) {
      if (evidence.length >= maxEvidence) break;
      if (!citation.snippet || !mentionsName(citation.snippet, person.name)) continue;
      evidence.push({
        citationId: citation.id,
        title: citation.title,
        url: citation.url,
        text: citation.snippet.slice(0, maxEvidenceTextLength)
      });
    }

    for (const candidate of input.candidates) {
      if (evidence.length >= maxEvidence) break;
      if (!candidate.rawText || !mentionsName(candidate.rawText, person.name)) continue;
      const citationId = citationIdForUrl(input.citations, candidate.citationUrl);
      if (!citationId) continue;
      evidence.push({
        citationId,
        title: candidate.citationTitle,
        url: candidate.citationUrl,
        text: candidate.rawText.slice(0, maxEvidenceTextLength)
      });
    }

    for (const source of input.sources) {
      if (evidence.length >= maxEvidence) break;
      if (!mentionsName(source.rawText, person.name)) continue;
      const citationId = citationIdForUrl(input.citations, source.url);
      if (!citationId) continue;
      evidence.push({
        citationId,
        title: source.title,
        url: source.url,
        text: source.rawText.slice(0, maxEvidenceTextLength)
      });
    }

    return {
      name: person.name,
      role: person.role,
      channels: {
        githubUrl: person.githubUrl ?? null,
        xUrl: person.xUrl ?? null,
        personalUrl: person.personalUrl ?? null
      },
      evidence
    };
  });
}

export function attachPersonReads(sections: SectionsWithFacts, reads: PersonReadResult[]): SectionsWithFacts {
  const readByName = new Map(reads.map((result) => [result.name.trim().toLowerCase(), result.read]));

  function withReads(people: CardPerson[]): CardPerson[] {
    return people.map((person) => {
      const key = person.name.trim().toLowerCase();
      if (!readByName.has(key)) {
        return person;
      }
      return { ...person, read: readByName.get(key) ?? null };
    });
  }

  return {
    ...sections,
    team: {
      ...sections.team,
      founders: {
        ...sections.team.founders,
        value: sections.team.founders.value ? withReads(sections.team.founders.value) : sections.team.founders.value
      },
      keyExecs: {
        ...sections.team.keyExecs,
        value: sections.team.keyExecs.value ? withReads(sections.team.keyExecs.value) : sections.team.keyExecs.value
      }
    }
  };
}
