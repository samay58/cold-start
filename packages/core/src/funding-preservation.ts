import type { ColdStartCard, ResolvedFact } from "./card";

type Funding = ColdStartCard["funding"];
type Round = NonNullable<Funding["lastRound"]["value"]>;

export function preserveKnownFundingAmounts(preferred: Funding, fallback: Funding): Funding {
  const known = [
    ...(fallback.lastRound.value ? [{ round: fallback.lastRound.value, fact: fallback.lastRound }] : []),
    ...(fallback.rounds?.value ?? []).map((round) => ({ round, fact: fallback.rounds! })),
  ].filter(({ round, fact }) => round.amountUsd !== null && fact.citationIds.length > 0);

  function restore(round: Round, sources: ResolvedFact<unknown>[]): Round {
    if (round.amountUsd !== null || !round.announcedAt) return round;
    // A stage label alone is not an event identity: a company can announce
    // multiple seed rounds. Never transfer an old amount to a different date.
    const matches = known.filter((candidate) =>
      candidate.round.name.trim().toLowerCase() === round.name.trim().toLowerCase()
      && candidate.round.announcedAt === round.announcedAt);
    const amounts = new Set(matches.map(({ round }) => round.amountUsd));
    if (amounts.size !== 1) return round;
    sources.push(...matches.map(({ fact }) => fact));
    return { ...round, amountUsd: matches[0]!.round.amountUsd };
  }

  function metadata<T>(fact: ResolvedFact<T>, value: T, sources: ResolvedFact<unknown>[]): ResolvedFact<T> {
    if (sources.length === 0) return fact;
    const statuses = ["unknown", "inferred", "mixed", "verified"] as const;
    const confidences = ["low", "medium", "high"] as const;
    const all = [fact, ...sources];
    return {
      value,
      status: statuses[Math.min(...all.map((item) => statuses.indexOf(item.status)))]!,
      confidence: confidences[Math.min(...all.map((item) => confidences.indexOf(item.confidence)))]!,
      citationIds: Array.from(new Set(all.flatMap((item) => item.citationIds))),
    };
  }

  const lastSources: ResolvedFact<unknown>[] = [];
  const lastRound = preferred.lastRound.value
    ? metadata(preferred.lastRound, restore(preferred.lastRound.value, lastSources), lastSources)
    : preferred.lastRound;
  const roundSources: ResolvedFact<unknown>[] = [];
  const rounds = preferred.rounds?.value
    ? metadata(preferred.rounds, preferred.rounds.value.map((round) => restore(round, roundSources)), roundSources)
    : preferred.rounds;
  return { ...preferred, lastRound, ...(rounds ? { rounds } : {}) };
}
