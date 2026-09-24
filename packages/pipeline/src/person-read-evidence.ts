import { readableSourceText, SOURCE_SNIPPET_MAX_LENGTH, sourceSnippet, splitIntoSentences, type ColdStartCard } from "@cold-start/core";
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
// sourceSnippet cuts the window to its cap at a sentence; gathering past the cap is wasted work.
const SNIPPET_BUDGET = SOURCE_SNIPPET_MAX_LENGTH;
// How far back from the name the window may start, so the sentence that names the person leads.
const maxLeadBeforeName = 200;
// A list entry's marker: a dash, bullet, bar or semicolon before a name. Page lists flattened onto
// one line keep these, and they are the only place a sentence may be cut at another person's name.
const listMarker = /(?:^|\s)(?:[-–—•*|·;])\s*$/;

function includesName(text: string, lowerName: string): boolean {
  return text.toLowerCase().includes(lowerName);
}

// Where the entry for another person starts in a flattened list: the list marker before the
// earliest later name that follows one. A name joined by "and" or a comma is part of the sentence.
function listEntryCut(sentence: string, from: number, others: string[]): number {
  const lower = sentence.toLowerCase();
  let cut = sentence.length;
  for (const other of others) {
    for (let index = lower.indexOf(other, from); index >= 0 && index < cut; index = lower.indexOf(other, index + 1)) {
      const before = sentence.slice(0, index);
      if (listMarker.test(before)) {
        cut = before.replace(listMarker, "").length;
        break;
      }
    }
  }
  return cut;
}

// Where this person's own list entry starts, when an earlier entry in the same flattened list
// names someone else.
function listEntryStart(sentence: string, at: number, others: string[]): number {
  const lead = sentence.slice(0, at);
  const lower = lead.toLowerCase();
  const lastOther = Math.max(-1, ...others.map((other) => {
    const index = lower.lastIndexOf(other);
    return index < 0 ? -1 : index + other.length;
  }));
  if (lastOther < 0) return 0;
  const markers = [...lead.slice(lastOther).matchAll(/(?:^|\s)[-–—•*|·;]\s+/g)];
  const last = markers.at(-1);
  return last ? lastOther + last.index + last[0].length : 0;
}

// The text about a person, or null when the text never names them. The window starts at the
// sentence that names the person (on a team page, their line) and takes whole sentences from
// there. It stops before a sentence or line that names another person on the card and not this
// one, and inside a flattened list it stops before the next person's entry, so on a team page the
// model sees only this person. A sentence that names two people stays whole: cutting it at the
// second name left "Ivan Zhao and".
function textAboutPerson(text: string, name: string, otherNames: string[] = []): string | null {
  const needle = name.trim().toLowerCase();
  if (!needle) return null;
  const others = otherNames.map((other) => other.trim().toLowerCase()).filter((other) => other && !needle.includes(other));

  const lines = text.split("\n");
  const lineIndex = lines.findIndex((line) => includesName(line, needle));
  if (lineIndex < 0) return null;
  const lineSentences = splitIntoSentences(lines[lineIndex]!);
  const first = lineSentences.findIndex((sentence) => includesName(sentence, needle));
  // The name can straddle a boundary the splitter chose; the whole line is then the unit.
  const units = first < 0 ? [lines[lineIndex]!.trim()] : lineSentences.slice(first);

  const opening = units[0]!;
  const at = opening.toLowerCase().indexOf(needle);
  let start = listEntryStart(opening, Math.max(at, 0), others);
  if (at - start > maxLeadBeforeName) start = opening.lastIndexOf(" ", at - maxLeadBeforeName / 2) + 1;
  const nameEnd = Math.max(at, 0) + needle.length;
  // A person listed as an entry ("- Blake Layton: Head of Sales - ...") gets that entry alone: an
  // entry ends where the next one begins, whoever it names.
  const isListEntry = listMarker.test(opening.slice(0, Math.max(at, 0)));
  const nextEntry = isListEntry ? opening.slice(nameEnd).search(/\s[-–—•*|·;]\s/) : -1;
  const cut = Math.min(listEntryCut(opening, nameEnd, others), nextEntry < 0 ? opening.length : nameEnd + nextEntry);
  const window = [opening.slice(start, cut).trim().replace(/^[-–—•*|·]\s+/, "")];
  if (isListEntry || cut < opening.length) return sourceSnippet(window[0]!);

  const following = [...units.slice(1), ...lines.slice(lineIndex + 1).flatMap((line) => splitIntoSentences(line))];
  let length = window[0]!.length;
  for (const unit of following) {
    if (length >= SNIPPET_BUDGET) break;
    if (!includesName(unit, needle) && others.some((other) => includesName(unit, other))) break;
    window.push(unit);
    length += unit.length + 1;
  }
  return sourceSnippet(window.join(" "));
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

  const people = uniquePeople(input.people);
  return people.map((person) => {
    const otherNames = people.filter((other) => other !== person).map((other) => other.name).filter((other) => other.trim());
    const evidence: PersonReadEvidence["evidence"] = [];
    // A cited page can arrive as its snippet, a provider fact and its stored row; send it once, as
    // the fullest text any of them gives. The snippet is tried first and is often the shortest.
    const add = (item: PersonReadEvidence["evidence"][number]) => {
      const index = evidence.findIndex((existing) => existing.citationId === item.citationId);
      if (index < 0) evidence.push(item);
      else if (item.text.length > evidence[index]!.text.length) evidence[index] = item;
    };

    for (const citation of input.citations) {
      if (evidence.length >= maxEvidence) break;
      const text = textAboutPerson(citation.snippet ?? "", person.name, otherNames);
      if (!text) continue;
      add({ citationId: citation.id, title: citation.title, url: citation.url, text });
    }

    for (const candidate of input.candidates) {
      if (evidence.length >= maxEvidence) break;
      const text = textAboutPerson(readableSourceText(candidate.rawText), person.name, otherNames);
      if (!text) continue;
      const citationId = citationIdForUrl(input.citations, candidate.citationUrl);
      if (!citationId) continue;
      add({ citationId, title: candidate.citationTitle, url: candidate.citationUrl, text });
    }

    for (const source of input.sources) {
      if (evidence.length >= maxEvidence) break;
      const text = textAboutPerson(readableSourceText(source.rawText), person.name, otherNames);
      if (!text) continue;
      const citationId = citationIdForUrl(input.citations, source.url);
      if (!citationId) continue;
      add({ citationId, title: source.title, url: source.url, text });
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
