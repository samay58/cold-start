import type { ColdStartCard, HowItWins, HowItWinsRead } from "@cold-start/core";
import type { VerificationFact, VerificationResult } from "@cold-start/llm";

import { howItWinsVerificationClaims, verificationFactsForClaims, verifiedHowItWins } from "./generate-card";

type VerificationSource = { id: string; url: string; title: string; snippet?: string };

export type VerifyHowItWinsFn = (
  claims: ReturnType<typeof howItWinsVerificationClaims>,
  sources: VerificationSource[],
  evidenceFacts: VerificationFact[]
) => Promise<VerificationResult[]>;

export type VerifiedHowItWinsOutcome = {
  howItWins: HowItWins;
  dropReason?: "running-dropped" | "pair-dropped";
  claimCount: number;
  verifiedRunningCount: number;
};

// The how-it-wins claims on their own, without the synthesis claims that ride the analysis run's
// verify call. Used when the read is written after the analysis run has already closed, so there
// is no shared verifier pass to attach to. Offset 0 because these claims are the whole batch;
// verifiedHowItWins reads its verdicts back in the same order howItWinsVerificationClaims appends
// them.
export async function verifyHowItWinsRead(input: {
  card: ColdStartCard;
  read: HowItWinsRead;
  verify: VerifyHowItWinsFn;
}): Promise<VerifiedHowItWinsOutcome> {
  const claims = howItWinsVerificationClaims(input.read);
  const sources: VerificationSource[] = input.card.citations.map((citation) => ({
    id: citation.id,
    url: citation.url,
    title: citation.title,
    ...(citation.snippet ? { snippet: citation.snippet } : {})
  }));
  const results = await input.verify(claims, sources, verificationFactsForClaims(input.card, claims));
  const outcome = verifiedHowItWins(input.read, results, 0);
  const verifiedRunningCount = outcome.howItWins.status === "read" ? outcome.howItWins.running.length : 0;
  return {
    howItWins: outcome.howItWins,
    ...(outcome.dropReason ? { dropReason: outcome.dropReason } : {}),
    claimCount: claims.length,
    verifiedRunningCount
  };
}

// Running notes whose cited evidence is not on the card at all. The verifier cannot support such
// a claim no matter what it says, so counting them separates a writer citation slip from a real
// verifier rejection when the read degrades.
export function howItWinsUncitableRunningCount(card: ColdStartCard, read: HowItWinsRead): number {
  const known = new Set(card.citations.map((citation) => citation.id));
  return read.running.filter((entry) => entry.citationIds.some((id) => !known.has(id))).length;
}
