import type { ColdStartCard, ResolvedFact } from "@cold-start/core";

// Drop fact citation refs that do not resolve to a citation in citations[], nulling any fact that
// loses all of its refs. This is a no-op for well-formed cards (every ref already resolves); it only
// fires when an upstream step (LLM extraction, block enrichment, provider facts) attaches a fact ref
// without registering its citation. Apply it before every coldStartCardSchema.parse on assembled
// card input: without it the parse throws a ZodError that crashes the whole generation run.
export function withResolvedCitationRefs(card: ColdStartCard): ColdStartCard {
  const validIds = new Set(card.citations.map((citation) => citation.id));

  const fixFact = <T>(fact: ResolvedFact<T>): ResolvedFact<T> => {
    const citationIds = fact.citationIds.filter((id) => validIds.has(id));
    if (citationIds.length === fact.citationIds.length) {
      return fact;
    }
    if (fact.value !== null && citationIds.length === 0) {
      return { value: null, status: "unknown", confidence: fact.confidence, citationIds: [] };
    }
    return { ...fact, citationIds };
  };

  return {
    ...card,
    identity: {
      ...card.identity,
      name: fixFact(card.identity.name),
      ...(card.identity.websiteUrl ? { websiteUrl: fixFact(card.identity.websiteUrl) } : {}),
      ...(card.identity.linkedinUrl ? { linkedinUrl: fixFact(card.identity.linkedinUrl) } : {}),
      oneLiner: fixFact(card.identity.oneLiner),
      ...(card.identity.description ? { description: fixFact(card.identity.description) } : {}),
      hq: fixFact(card.identity.hq),
      foundedYear: fixFact(card.identity.foundedYear)
    },
    funding: {
      ...card.funding,
      totalRaisedUsd: fixFact(card.funding.totalRaisedUsd),
      lastRound: fixFact(card.funding.lastRound),
      ...(card.funding.rounds ? { rounds: fixFact(card.funding.rounds) } : {}),
      investors: fixFact(card.funding.investors)
    },
    team: {
      founders: fixFact(card.team.founders),
      keyExecs: fixFact(card.team.keyExecs),
      headcount: fixFact(card.team.headcount)
    },
    signals: card.signals.flatMap((signal) => {
      const citationIds = signal.citationIds.filter((id) => validIds.has(id));
      return citationIds.length > 0 ? [{ ...signal, citationIds }] : [];
    }),
    comparables: card.comparables.map((comparable) =>
      comparable.citationIds
        ? { ...comparable, citationIds: comparable.citationIds.filter((id) => validIds.has(id)) }
        : comparable
    )
  };
}
