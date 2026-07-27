import type { ColdStartCard } from "@cold-start/core";

// Evidence and card-fact payloads for the expanded company description. Mirrors
// person-read-evidence: citation ids come from the card so every id the model can cite
// resolves against citations[], and stored source text rides along keyed by URL.

const defaultMaxEvidenceItems = 12;
const maxEvidenceTextLength = 2000;

export type ExpandedDescriptionSourceEvidence = {
  citationId: string;
  title: string;
  url: string;
  text: string;
};

function normalizedUrl(url: string): string {
  return url.replace(/\/+$/, "").toLowerCase();
}

export function buildExpandedDescriptionEvidence(input: {
  card: Pick<ColdStartCard, "citations">;
  sources: Array<{ url: string; title: string; rawText: string }>;
  maxItems?: number;
}): ExpandedDescriptionSourceEvidence[] {
  const maxItems = input.maxItems ?? defaultMaxEvidenceItems;
  const textByUrl = new Map(input.sources.map((source) => [normalizedUrl(source.url), source.rawText]));
  const evidence: ExpandedDescriptionSourceEvidence[] = [];

  for (const citation of input.card.citations) {
    if (evidence.length >= maxItems) break;
    const text = textByUrl.get(normalizedUrl(citation.url)) ?? citation.snippet ?? "";
    if (!text.trim()) continue;
    evidence.push({
      citationId: citation.id,
      title: citation.title,
      url: citation.url,
      text: text.slice(0, maxEvidenceTextLength)
    });
  }

  return evidence;
}

// A compact projection of the card the memo may restate. Everything here is already cited on
// the card; the model is told to state nothing beyond it and the source evidence.
export function expandedDescriptionCardFacts(card: ColdStartCard) {
  return {
    name: card.identity.name.value,
    oneLiner: card.identity.oneLiner.value,
    description: card.identity.description?.value ?? null,
    hq: card.identity.hq.value,
    foundedYear: card.identity.foundedYear.value,
    status: card.identity.status,
    funding: {
      totalRaisedUsd: card.funding.totalRaisedUsd.value,
      lastRound: card.funding.lastRound.value,
      investors: card.funding.investors.value
    },
    team: {
      founders: (card.team.founders.value ?? []).map((person) => ({ name: person.name, role: person.role })),
      headcount: card.team.headcount.value
    },
    signals: card.signals.map((signal) => ({ title: signal.title, date: signal.date, category: signal.category })),
    comparables: card.comparables.map((comparable) => ({ name: comparable.name, oneLiner: comparable.oneLiner })),
    competitionFraming: card.competitionFraming?.value ?? null
  };
}
