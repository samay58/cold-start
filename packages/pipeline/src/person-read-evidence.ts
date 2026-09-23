import { readableSourceText, sourceSnippet, type ColdStartCard } from "@cold-start/core";
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
// How far back from the name the window may start, so the sentence that names the person leads.
const maxLeadBeforeName = 200;

// The text around the person's name, starting at the sentence that names them, or null when the
// text never names them. The model sees this window, so it always names the person.
function textAboutPerson(text: string, name: string): string | null {
  const needle = name.trim().toLowerCase();
  const at = needle ? text.toLowerCase().indexOf(needle) : -1;
  if (at < 0) return null;
  const before = text.slice(0, at);
  let start = Math.max(before.lastIndexOf(". "), before.lastIndexOf("! "), before.lastIndexOf("? ")) + 2;
  if (start < 2) start = 0;
  if (at - start > maxLeadBeforeName) start = text.lastIndexOf(" ", at - maxLeadBeforeName / 2) + 1;
  return sourceSnippet(text.slice(start));
}

function uniquePeople(people: CardPerson[]): CardPerson[] {
  const seen = new Set<string>();
  return people.filter((person) => {
    const key = person.name.trim().toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
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

  return uniquePeople(input.people).map((person) => {
    const evidence: PersonReadEvidence["evidence"] = [];

    for (const citation of input.citations) {
      if (evidence.length >= maxEvidence) break;
      const text = textAboutPerson(citation.snippet ?? "", person.name);
      if (!text) continue;
      evidence.push({ citationId: citation.id, title: citation.title, url: citation.url, text });
    }

    for (const candidate of input.candidates) {
      if (evidence.length >= maxEvidence) break;
      const text = textAboutPerson(readableSourceText(candidate.rawText), person.name);
      if (!text) continue;
      const citationId = citationIdForUrl(input.citations, candidate.citationUrl);
      if (!citationId) continue;
      evidence.push({ citationId, title: candidate.citationTitle, url: candidate.citationUrl, text });
    }

    for (const source of input.sources) {
      if (evidence.length >= maxEvidence) break;
      const text = textAboutPerson(readableSourceText(source.rawText), person.name);
      if (!text) continue;
      const citationId = citationIdForUrl(input.citations, source.url);
      if (!citationId) continue;
      evidence.push({ citationId, title: source.title, url: source.url, text });
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

// The trace line for the person-reads step: how many reads landed, and who was suppressed and why.
export function personReadsTraceMessage(reads: PersonReadResult[]): string {
  const landed = `${reads.filter((result) => result.read !== null).length} person reads`;
  const suppressed = reads.flatMap((result) => (result.suppressionReason ? [`${result.name} (${result.suppressionReason})`] : []));
  return suppressed.length > 0 ? `${landed}; suppressed: ${suppressed.join(", ")}` : landed;
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
