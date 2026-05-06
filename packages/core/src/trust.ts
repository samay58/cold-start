import type { ColdStartCard, ResolvedFact, SourcedText } from "./card";

const verificationSentinel = /\[needs_verification\]/i;
const forbiddenSynthesisPhrases = /\b(reportedly|industry sources suggest|rumored to|appears to be|is said to)\b/i;

function sanitizeFact<T>(fact: ResolvedFact<T>): ResolvedFact<T> {
  if (fact.citationIds.length > 0) {
    return fact;
  }

  return {
    value: null,
    status: "unknown",
    confidence: "low",
    citationIds: []
  };
}

function keepSupportedText(item: SourcedText): boolean {
  if (item.citationIds.length === 0) {
    return false;
  }

  if (verificationSentinel.test(item.text)) {
    return false;
  }

  return !forbiddenSynthesisPhrases.test(item.text);
}

export function sanitizeCardTrust(card: ColdStartCard): ColdStartCard {
  return {
    ...card,
    identity: {
      ...card.identity,
      name: sanitizeFact(card.identity.name),
      oneLiner: sanitizeFact(card.identity.oneLiner),
      hq: sanitizeFact(card.identity.hq),
      foundedYear: sanitizeFact(card.identity.foundedYear)
    },
    funding: {
      totalRaisedUsd: sanitizeFact(card.funding.totalRaisedUsd),
      lastRound: sanitizeFact(card.funding.lastRound),
      investors: sanitizeFact(card.funding.investors)
    },
    team: {
      founders: sanitizeFact(card.team.founders),
      keyExecs: sanitizeFact(card.team.keyExecs),
      headcount: sanitizeFact(card.team.headcount)
    }
  };
}

export function stripUnsupportedSynthesis(card: ColdStartCard): ColdStartCard {
  if (!card.synthesis) {
    return card;
  }

  if (!keepSupportedText(card.synthesis.whyItMatters)) {
    const { synthesis: _synthesis, ...cardWithoutSynthesis } = card;
    return cardWithoutSynthesis;
  }

  const synthesis = {
    whyItMatters: card.synthesis.whyItMatters,
    bullCase: card.synthesis.bullCase.filter(keepSupportedText).slice(0, 3),
    bearCase: card.synthesis.bearCase.filter(keepSupportedText).slice(0, 3),
    openQuestions: card.synthesis.openQuestions.filter((question) => question.trim().length > 0).slice(0, 3)
  };

  return { ...card, synthesis };
}

export function publicCard(card: ColdStartCard): Omit<ColdStartCard, "synthesis"> {
  const { synthesis: _synthesis, ...publicOnly } = stripUnsupportedSynthesis(sanitizeCardTrust(card));
  return publicOnly;
}
