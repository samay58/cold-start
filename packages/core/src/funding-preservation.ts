import type { ColdStartCard, ResolvedFact } from "./card";

type Funding = ColdStartCard["funding"];
type Round = NonNullable<Funding["lastRound"]["value"]>;

type KnownRound = { round: Round; fact: ResolvedFact<unknown>; roundSpecific: boolean };

export function preserveKnownFundingAmounts(preferred: Funding, fallback: Funding): Funding {
  // A round entry carries no citations of its own, so a saved fact vouches for one specific round
  // only when it holds exactly that round. A multi-round ledger would put the sources for every
  // other round behind this round's dollar figure.
  const savedRounds = fallback.rounds?.value ?? [];
  const known: KnownRound[] = [
    ...(fallback.lastRound.value
      ? [{ round: fallback.lastRound.value, fact: fallback.lastRound, roundSpecific: true }]
      : []),
    ...savedRounds.map((round) => ({ round, fact: fallback.rounds!, roundSpecific: savedRounds.length === 1 })),
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
    const vouching = matches.filter(({ roundSpecific }) => roundSpecific);
    // An amount no saved fact can cite for this round alone stays unknown.
    if (vouching.length === 0) return round;
    sources.push(...vouching.map(({ fact }) => fact));
    return { ...round, amountUsd: matches[0]!.round.amountUsd };
  }

  function metadata<T>(fact: ResolvedFact<T>, value: T, sources: ResolvedFact<unknown>[]): ResolvedFact<T> {
    if (sources.length === 0) return fact;
    const statuses = ["unknown", "inferred", "mixed", "verified"] as const;
    const confidences = ["low", "medium", "high"] as const;
    // The restored amount's standing is the saved fact's standing, not the incoming fact's, and a
    // concrete dollar figure is never published as unknown: carrying it forward is an inference.
    const saved = statuses[Math.min(...sources.map((item) => statuses.indexOf(item.status)))]!;
    const all = [fact, ...sources];
    return {
      value,
      status: saved === "unknown" ? "inferred" : saved,
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
