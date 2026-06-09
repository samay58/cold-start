import type { Citation, ColdStartCard, ResolvedFact, SourcedText } from "./card";
import { sourceQualityForSource } from "./source-quality";

const verificationSentinel = /\[needs_verification\]/i;
const forbiddenSynthesisPhrases = /\b(reportedly|industry sources suggest|rumored to|appears to be|is said to)\b/i;
const citationMarker = /\[([A-Za-z0-9_-]+)\]/g;

function validCitationIds(card: ColdStartCard): Set<string> {
  return new Set(card.citations.map((citation) => citation.id));
}

function citationsById(card: ColdStartCard): Map<string, Citation> {
  return new Map(card.citations.map((citation) => [citation.id, citation]));
}

function nullFact<T>(): ResolvedFact<T> {
  return {
    value: null,
    status: "unknown",
    confidence: "low",
    citationIds: []
  };
}

function sanitizeFact<T>(
  fact: ResolvedFact<T>,
  validIds: Set<string>,
  citations: Map<string, Citation>,
  options: { downgradeSingleSource?: boolean } = {},
): ResolvedFact<T> {
  const citationIds = fact.citationIds.filter((citationId) => validIds.has(citationId));

  if (citationIds.length === 0) {
    return nullFact();
  }

  const sanitized = { ...fact, citationIds };
  if (sanitized.value === null) {
    return sanitized;
  }

  const factCitations = citationIds.flatMap((citationId) => {
    const citation = citations.get(citationId);
    return citation ? [citation] : [];
  });
  const vendorOnly = factCitations.length > 0 && factCitations.every((citation) => citation.sourceType === "enrichment");
  const singleSourceSensitive = options.downgradeSingleSource === true && new Set(citationIds).size < 2;

  if (!vendorOnly && !singleSourceSensitive) {
    return sanitized;
  }

  return {
    ...sanitized,
    status: vendorOnly ? "inferred" : sanitized.status,
    confidence: "low",
  };
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

function supportedMarketStructureAndTiming(
  market: NonNullable<ColdStartCard["synthesis"]>["marketStructureAndTiming"],
  validIds: Set<string>
): NonNullable<ColdStartCard["synthesis"]>["marketStructureAndTiming"] {
  if (!market) {
    return undefined;
  }

  const filtered = {
    buyerBudget: market.buyerBudget ? keepSupportedText(market.buyerBudget, validIds) : null,
    painSeverity: market.painSeverity ? keepSupportedText(market.painSeverity, validIds) : null,
    adoptionTrigger: market.adoptionTrigger ? keepSupportedText(market.adoptionTrigger, validIds) : null,
    marketStructure: market.marketStructure ? keepSupportedText(market.marketStructure, validIds) : null,
    profitPool: market.profitPool ? keepSupportedText(market.profitPool, validIds) : null,
    expansionPath: market.expansionPath ? keepSupportedText(market.expansionPath, validIds) : null,
    timingRisk: market.timingRisk ? keepSupportedText(market.timingRisk, validIds) : null
  };

  return Object.values(filtered).some(Boolean) ? filtered : undefined;
}

export function sanitizeCardTrust(card: ColdStartCard): ColdStartCard {
  const validIds = validCitationIds(card);
  const citations = citationsById(card);

  return {
    ...card,
    citations: card.citations.map((citation) => ({
      ...citation,
      sourceQuality: citation.sourceQuality ?? sourceQualityForSource(citation)
    })),
    identity: {
      ...card.identity,
      name: sanitizeFact(card.identity.name, validIds, citations),
      ...(card.identity.websiteUrl ? { websiteUrl: sanitizeFact(card.identity.websiteUrl, validIds, citations) } : {}),
      ...(card.identity.linkedinUrl ? { linkedinUrl: sanitizeFact(card.identity.linkedinUrl, validIds, citations) } : {}),
      oneLiner: sanitizeFact(card.identity.oneLiner, validIds, citations),
      ...(card.identity.description ? { description: sanitizeFact(card.identity.description, validIds, citations) } : {}),
      hq: sanitizeFact(card.identity.hq, validIds, citations),
      foundedYear: sanitizeFact(card.identity.foundedYear, validIds, citations)
    },
    funding: {
      totalRaisedUsd: sanitizeFact(card.funding.totalRaisedUsd, validIds, citations, { downgradeSingleSource: true }),
      lastRound: sanitizeFact(card.funding.lastRound, validIds, citations),
      ...(card.funding.rounds ? { rounds: sanitizeFact(card.funding.rounds, validIds, citations) } : {}),
      investors: sanitizeFact(card.funding.investors, validIds, citations)
    },
    team: {
      founders: sanitizeFact(card.team.founders, validIds, citations),
      keyExecs: sanitizeFact(card.team.keyExecs, validIds, citations),
      headcount: sanitizeFact(card.team.headcount, validIds, citations, { downgradeSingleSource: true })
    },
    signals: card.signals.flatMap((signal) => {
      const citationIds = sanitizeCitationIds(signal.citationIds, validIds);
      return citationIds.length > 0 ? [{ ...signal, citationIds }] : [];
    }),
    comparables: card.comparables.map((comparable) => ({
      ...comparable,
      ...(comparable.citationIds ? { citationIds: sanitizeCitationIds(comparable.citationIds, validIds) } : {})
    }))
  };
}

export function stripUnsupportedSynthesis(card: ColdStartCard): ColdStartCard {
  if (!card.synthesis) {
    return card;
  }

  const validIds = validCitationIds(card);
  const whyItMatters = keepSupportedText(card.synthesis.whyItMatters, validIds);
  const marketStructureAndTiming = supportedMarketStructureAndTiming(card.synthesis.marketStructureAndTiming, validIds);

  if (!whyItMatters) {
    const { synthesis: _synthesis, ...cardWithoutSynthesis } = card;
    return cardWithoutSynthesis;
  }

  const synthesis = {
    whyItMatters,
    bullCase: supportedTextItems(card.synthesis.bullCase, validIds).slice(0, 3),
    bearCase: supportedTextItems(card.synthesis.bearCase, validIds).slice(0, 3),
    openQuestions: card.synthesis.openQuestions.filter((entry) => entry.question.trim().length > 0).slice(0, 3),
    ...(marketStructureAndTiming ? { marketStructureAndTiming } : {})
  };

  return { ...card, synthesis };
}

export function publicCard(card: ColdStartCard): Omit<ColdStartCard, "synthesis"> {
  const { synthesis: _synthesis, ...publicOnly } = stripUnsupportedSynthesis(sanitizeCardTrust(card));
  return {
    ...publicOnly,
    team: {
      founders: stripPersonEmails(publicOnly.team.founders),
      keyExecs: stripPersonEmails(publicOnly.team.keyExecs),
      headcount: publicOnly.team.headcount
    }
  };
}

type TeamPeopleFact = ColdStartCard["team"]["founders"];

function stripPersonEmails(fact: TeamPeopleFact): TeamPeopleFact {
  if (!fact.value) {
    return fact;
  }

  return {
    ...fact,
    value: fact.value.map((person) => {
      const { email: _email, ...publicPerson } = person;
      return publicPerson;
    })
  };
}
