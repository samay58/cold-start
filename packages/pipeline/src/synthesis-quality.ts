import type { ColdStartCard, SourcedText } from "@cold-start/core";

type CardSynthesis = NonNullable<ColdStartCard["synthesis"]>;

export type SynthesisUsefulnessResult = {
  synthesis: CardSynthesis;
  droppedClaimCount: number;
};

const GENERIC_CLAIM_PATTERN =
  /\b(large and growing|massive market|well positioned|category[- ]defining|mission[- ]critical|ai tailwinds|market tailwinds|broad tailwinds|clear enterprise demand|significant opportunity)\b/i;
const CONCRETE_PROOF_PATTERN =
  /\b(buyer|budget|workflow|customer|deployment|retention|margin|pricing|incumbent|substitute|competitor|uses|replaces|integrates|production|team|developer|operator|physician|agent|seat|contract)\b/i;
const FUNDING_AS_TRACTION_PATTERN =
  /\b(raised|funding|series [a-z]|round|valuation|investor|backed by)\b/i;
const TRACTION_PATTERN = /\b(traction|adoption|demand|momentum|customer demand|market demand)\b/i;
const TIMING_PATTERN = /\b(timing|why now|tailwind|inflection|recent funding|category momentum|ai tailwinds)\b/i;
const TIMING_MECHANISM_PATTERN =
  /\b(regulation|mandate|cost curve|latency|budget migration|platform shift|workflow trigger|procurement|compliance|model capability|distribution shift|customer urgency)\b/i;
const THIN_COMPETITION_PATTERN = /\b(competition|competitive|competitor|incumbent|substitute)\b/i;
const COMPETITION_DETAIL_PATTERN = /\b(from|against|versus|including|such as|workflow|budget|buyer|incumbent|substitute|replaces)\b/i;

function usefulClaim(claim: SourcedText, kind: "case" | "market") {
  const text = claim.text.replace(/\[[^\]]+\]/g, "").trim();

  if (GENERIC_CLAIM_PATTERN.test(text) && !CONCRETE_PROOF_PATTERN.test(text)) {
    return false;
  }

  if (FUNDING_AS_TRACTION_PATTERN.test(text) && TRACTION_PATTERN.test(text) && !/\binvestor demand\b/i.test(text)) {
    return false;
  }

  if (kind === "market" && TIMING_PATTERN.test(text) && !TIMING_MECHANISM_PATTERN.test(text)) {
    return false;
  }

  if (THIN_COMPETITION_PATTERN.test(text) && !COMPETITION_DETAIL_PATTERN.test(text)) {
    return false;
  }

  return true;
}

function filterClaims(claims: SourcedText[]) {
  const accepted: SourcedText[] = [];
  let dropped = 0;
  for (const claim of claims) {
    if (usefulClaim(claim, "case")) {
      accepted.push(claim);
    } else {
      dropped += 1;
    }
  }
  return { accepted, dropped };
}

function filterMarketClaim(claim: SourcedText | null) {
  if (!claim) {
    return { claim, dropped: 0 };
  }
  if (usefulClaim(claim, "market")) {
    return { claim, dropped: 0 };
  }
  return { claim: null, dropped: 1 };
}

export function applySynthesisUsefulnessGate(synthesis: CardSynthesis): SynthesisUsefulnessResult {
  const bull = filterClaims(synthesis.bullCase);
  const bear = filterClaims(synthesis.bearCase);
  let droppedClaimCount = bull.dropped + bear.dropped;

  if (!synthesis.marketStructureAndTiming) {
    return {
      synthesis: {
        ...synthesis,
        bullCase: bull.accepted,
        bearCase: bear.accepted
      },
      droppedClaimCount
    };
  }

  const buyerBudget = filterMarketClaim(synthesis.marketStructureAndTiming.buyerBudget);
  const painSeverity = filterMarketClaim(synthesis.marketStructureAndTiming.painSeverity);
  const adoptionTrigger = filterMarketClaim(synthesis.marketStructureAndTiming.adoptionTrigger);
  const marketStructure = filterMarketClaim(synthesis.marketStructureAndTiming.marketStructure);
  const profitPool = filterMarketClaim(synthesis.marketStructureAndTiming.profitPool);
  const expansionPath = filterMarketClaim(synthesis.marketStructureAndTiming.expansionPath);
  const timingRisk = filterMarketClaim(synthesis.marketStructureAndTiming.timingRisk);
  droppedClaimCount += buyerBudget.dropped + painSeverity.dropped + adoptionTrigger.dropped + marketStructure.dropped +
    profitPool.dropped + expansionPath.dropped + timingRisk.dropped;
  const market = {
    buyerBudget: buyerBudget.claim,
    painSeverity: painSeverity.claim,
    adoptionTrigger: adoptionTrigger.claim,
    marketStructure: marketStructure.claim,
    profitPool: profitPool.claim,
    expansionPath: expansionPath.claim,
    timingRisk: timingRisk.claim
  };

  const { marketStructureAndTiming: _marketStructureAndTiming, ...synthesisWithoutMarket } = synthesis;
  return {
    synthesis: {
      ...synthesisWithoutMarket,
      bullCase: bull.accepted,
      bearCase: bear.accepted,
      ...(Object.values(market).some(Boolean) ? { marketStructureAndTiming: market } : {})
    },
    droppedClaimCount
  };
}
