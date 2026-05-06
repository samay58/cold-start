import type { ColdStartCard, ResolvedFact, SourcedText } from "./card";

const verificationSentinel = /\[needs_verification\]/i;
const forbiddenSynthesisPhrases = /\b(reportedly|industry sources suggest|rumored to|appears to be|is said to)\b/i;
const citationMarker = /\[([A-Za-z0-9_-]+)\]/g;

function validCitationIds(card: ColdStartCard): Set<string> {
  return new Set(card.citations.map((citation) => citation.id));
}

function nullFact<T>(): ResolvedFact<T> {
  return {
    value: null,
    status: "unknown",
    confidence: "low",
    citationIds: []
  };
}

function sanitizeFact<T>(fact: ResolvedFact<T>, validIds: Set<string>): ResolvedFact<T> {
  const citationIds = fact.citationIds.filter((citationId) => validIds.has(citationId));

  if (citationIds.length > 0) {
    return { ...fact, citationIds };
  }

  return nullFact();
}

function sanitizeCitationIds(citationIds: string[], validIds: Set<string>): string[] {
  return citationIds.filter((citationId) => validIds.has(citationId));
}

function visibleCitationMarkers(text: string): string[] {
  return Array.from(text.matchAll(citationMarker), (match) => match[1]).filter(
    (citationId): citationId is string => citationId !== undefined
  );
}

function supportedCitationIds(item: SourcedText, validIds: Set<string>): string[] {
  const visibleMarkers = visibleCitationMarkers(item.text);
  const declaredIds = new Set(item.citationIds);

  if (visibleMarkers.some((citationId) => !validIds.has(citationId) || !declaredIds.has(citationId))) {
    return [];
  }

  return item.citationIds.filter((citationId) => validIds.has(citationId) && visibleMarkers.includes(citationId));
}

function keepSupportedText(item: SourcedText, validIds: Set<string>): SourcedText | null {
  const citationIds = supportedCitationIds(item, validIds);

  if (citationIds.length === 0) {
    return null;
  }

  if (verificationSentinel.test(item.text)) {
    return null;
  }

  if (forbiddenSynthesisPhrases.test(item.text)) {
    return null;
  }

  return {
    ...item,
    citationIds
  };
}

function supportedTextItems(items: SourcedText[], validIds: Set<string>): SourcedText[] {
  return items.flatMap((item) => {
    const supported = keepSupportedText(item, validIds);
    return supported ? [supported] : [];
  });
}

export function sanitizeCardTrust(card: ColdStartCard): ColdStartCard {
  const validIds = validCitationIds(card);

  return {
    ...card,
    identity: {
      ...card.identity,
      name: sanitizeFact(card.identity.name, validIds),
      oneLiner: sanitizeFact(card.identity.oneLiner, validIds),
      hq: sanitizeFact(card.identity.hq, validIds),
      foundedYear: sanitizeFact(card.identity.foundedYear, validIds)
    },
    funding: {
      totalRaisedUsd: sanitizeFact(card.funding.totalRaisedUsd, validIds),
      lastRound: sanitizeFact(card.funding.lastRound, validIds),
      investors: sanitizeFact(card.funding.investors, validIds)
    },
    team: {
      founders: sanitizeFact(card.team.founders, validIds),
      keyExecs: sanitizeFact(card.team.keyExecs, validIds),
      headcount: sanitizeFact(card.team.headcount, validIds)
    },
    signals: card.signals.flatMap((signal) => {
      const citationIds = sanitizeCitationIds(signal.citationIds, validIds);
      return citationIds.length > 0 ? [{ ...signal, citationIds }] : [];
    })
  };
}

export function stripUnsupportedSynthesis(card: ColdStartCard): ColdStartCard {
  if (!card.synthesis) {
    return card;
  }

  const validIds = validCitationIds(card);
  const whyItMatters = keepSupportedText(card.synthesis.whyItMatters, validIds);

  if (!whyItMatters) {
    const { synthesis: _synthesis, ...cardWithoutSynthesis } = card;
    return cardWithoutSynthesis;
  }

  const synthesis = {
    whyItMatters,
    bullCase: supportedTextItems(card.synthesis.bullCase, validIds).slice(0, 3),
    bearCase: supportedTextItems(card.synthesis.bearCase, validIds).slice(0, 3),
    openQuestions: card.synthesis.openQuestions.filter((question) => question.trim().length > 0).slice(0, 3)
  };

  return { ...card, synthesis };
}

export function publicCard(card: ColdStartCard): Omit<ColdStartCard, "synthesis"> {
  const { synthesis: _synthesis, ...publicOnly } = stripUnsupportedSynthesis(sanitizeCardTrust(card));
  return publicOnly;
}
