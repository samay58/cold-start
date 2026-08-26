export const GENERIC_PHRASES = [
  "large and growing",
  "massive market",
  "well positioned",
  "category-defining",
  "ai tailwinds",
  "significant opportunity",
  "clear enterprise demand"
];

function text(value) {
  return typeof value === "string" ? value : "";
}

function synthesisClaims(card) {
  const synthesis = card?.synthesis;
  if (!synthesis) {
    return [];
  }
  return [
    synthesis.whyItMatters,
    ...(synthesis.bullCase ?? []),
    ...(synthesis.bearCase ?? [])
  ].filter(Boolean);
}

function marketHasEvidence(card) {
  const market = card?.synthesis?.marketStructureAndTiming;
  return Boolean(market && Object.values(market).some(Boolean));
}

function emphasisTexts(card) {
  const emphasis = card?.synthesis?.emphasisRead;
  if (!emphasis || emphasis.status !== "read") {
    return [];
  }
  return [text(emphasis.loud?.text), text(emphasis.read?.text)].filter(Boolean);
}

// Citation markers are bracketed id lists like [c1], [fv3], or [c1, c2]: the same shape
// packages/core/src/citation-text.ts strips for display. A stored, filed read's text ALWAYS
// carries these, and their digits (e.g. "fv3") would otherwise satisfy the /[\d$%]/ specificity
// probe below on their own, letting a fully generic sentence pass just because it cites
// something. Strip markers before testing so the probe only sees the claim's own prose.
const citationMarkerPattern = /\s*\[[\w.-]+(?:,\s*[\w.-]+)*\]/g;

function withoutCitationMarkers(value) {
  return value.replace(citationMarkerPattern, "");
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function howItWinsTexts(card) {
  const howItWins = card?.synthesis?.howItWins;
  if (!howItWins || howItWins.status === "thin_file") {
    return [];
  }
  if (howItWins.status === "nothing_stands_out") {
    return [
      text(howItWins.sentence),
      ...(howItWins.inQuestion ?? []).map((entry) => text(entry.note))
    ].filter(Boolean).map(withoutCitationMarkers);
  }
  return [
    text(howItWins.sentence),
    ...(howItWins.running ?? []).map((entry) => text(entry.note)),
    text(howItWins.pair?.note),
    ...(howItWins.next ?? []).map((entry) => text(entry.note)),
    ...(howItWins.inQuestion ?? []).map((entry) => text(entry.note))
  ].filter(Boolean).map(withoutCitationMarkers);
}

export function genericPhraseCount(card) {
  const haystack = [
    ...synthesisClaims(card).map((claim) => text(claim.text)),
    ...emphasisTexts(card),
    ...howItWinsTexts(card)
  ].map((claim) => claim.toLowerCase()).join("\n");
  return GENERIC_PHRASES.filter((phrase) => haystack.includes(phrase)).length;
}

export function emphasisIsSpecificOrEmpty(card) {
  const emphasis = card?.synthesis?.emphasisRead;
  if (!emphasis || emphasis.status !== "read") {
    return true;
  }
  const readText = withoutCitationMarkers(text(emphasis.read?.text));
  const companyName = text(card?.identity?.name?.value).toLowerCase();
  // Word-boundary match: a short company name (e.g. "Exa") would otherwise false-pass on any
  // substring hit ("expand", "exact") that has nothing to do with the company itself.
  const nameHit = Boolean(companyName) && new RegExp(`\\b${escapeRegExp(companyName)}\\b`, "i").test(readText);
  return /[\d$%]/.test(readText) || nameHit;
}

// A capitalised word past the sentence's own opening is usually a named thing (a competitor,
// a customer, a product) carried into the read, not just a capital letter from grammar.
function hasCapitalizedWordAfterFirst(value) {
  const words = value.trim().split(/\s+/).filter(Boolean);
  return words.slice(1).some((word) => /^[A-Z]/.test(word.replace(/^[^A-Za-z]+/, "")));
}

export function howItWinsSentenceIsSpecificOrEmpty(card) {
  const howItWins = card?.synthesis?.howItWins;
  if (!howItWins || howItWins.status !== "read") {
    return true;
  }
  const sentence = withoutCitationMarkers(text(howItWins.sentence));
  const companyName = text(card?.identity?.name?.value).toLowerCase();
  const nameHit = Boolean(companyName) && new RegExp(`\\b${escapeRegExp(companyName)}\\b`, "i").test(sentence);
  return /[\d$%]/.test(sentence) || nameHit || hasCapitalizedWordAfterFirst(sentence);
}

function tallyStrategies(cards, pick) {
  const counts = {};
  for (const card of cards) {
    const strategies = new Set(pick(card.synthesis.howItWins).map((entry) => entry.strategy));
    for (const strategy of strategies) {
      counts[strategy] = (counts[strategy] ?? 0) + 1;
    }
  }
  const share = {};
  for (const [strategy, count] of Object.entries(counts)) {
    share[strategy] = count / cards.length;
  }
  return { counts, share };
}

// Runs once per card: dedupe a card's own strategies before tallying, since a strategy should
// count once toward a card's frequency even if the model somehow repeats it. Running share is
// over read cards. In-question share is over every judged card (read or nothing_stands_out), since
// both carry an in-question list and the panel shows it either way: the same four "maybe" labels
// on every company (2026-08-26: alliance, first_mover, efficiency, divergence on 5 to 6 of 9) is
// the same staleness as one running label everywhere, just on the other side of the crown.
export function strategyFrequency(cards) {
  const status = (card) => card?.synthesis?.howItWins?.status;
  const reads = (cards ?? []).filter((card) => status(card) === "read");
  const judged = (cards ?? []).filter((card) => status(card) === "read" || status(card) === "nothing_stands_out");
  const running = tallyStrategies(reads, (howItWins) => howItWins.running ?? []);
  const inQuestion = tallyStrategies(judged, (howItWins) => howItWins.inQuestion ?? []);
  return {
    reads: reads.length,
    counts: running.counts,
    share: running.share,
    judged: judged.length,
    inQuestionCounts: inQuestion.counts,
    inQuestionShare: inQuestion.share
  };
}

function offendersOver(share, maxShare) {
  return Object.entries(share)
    .filter(([, strategyShare]) => strategyShare > maxShare)
    .map(([strategy, strategyShare]) => ({ strategy, share: strategyShare }));
}

// A strategy leaning on most reads is the read going stale, not the company's real edge.
// Only meaningful once there is enough of a corpus to trust; skip the check below minReads.
// The in-question list gets the same test at the same share, over judged cards.
export function strategyFrequencyGate(cards, { maxShare = 0.5, minReads = 10 } = {}) {
  const { reads, share, judged, inQuestionShare } = strategyFrequency(cards);
  const offenders = reads < minReads ? [] : offendersOver(share, maxShare);
  const inQuestionOffenders = judged < minReads ? [] : offendersOver(inQuestionShare, maxShare);
  return {
    passed: offenders.length === 0 && inQuestionOffenders.length === 0,
    offenders,
    inQuestionOffenders,
    reads,
    judged
  };
}

export function hasConcreteTension(card) {
  const bull = text(card?.synthesis?.bullCase?.[0]?.text);
  const bear = text(card?.synthesis?.bearCase?.[0]?.text);
  return Boolean(bull && bear && /\b(break|risk|unless|if|fails|incumbent|substitute|budget|workflow)\b/i.test(bear));
}

export function hasTestableQuestion(card) {
  const question = text(card?.synthesis?.openQuestions?.[0]?.question);
  return /\b(who|which|what|can|how)\b/i.test(question) &&
    /\b(budget|buyer|workflow|retention|margin|adoption|proof|customer|competitor|incumbent)\b/i.test(question);
}

export function scoreInvestorLens({ extensionCard, publicCard }) {
  const genericCount = genericPhraseCount(extensionCard);
  const publicOmitsSynthesis = !publicCard || publicCard.synthesis === undefined;
  const extensionHasSynthesis = Boolean(extensionCard?.synthesis);
  const whyCare = text(extensionCard?.synthesis?.whyItMatters?.text);
  const nonGenericWhyCare = Boolean(whyCare) && genericCount === 0;
  const timingSupportedOrAbsent = marketHasEvidence(extensionCard) || extensionCard?.synthesis?.marketStructureAndTiming === undefined;
  const caseHasTension = hasConcreteTension(extensionCard);
  const firstQuestionIsTestable = hasTestableQuestion(extensionCard);

  const checks = {
    extensionHasSynthesis,
    publicOmitsSynthesis,
    nonGenericWhyCare,
    caseHasTension,
    firstQuestionIsTestable,
    timingSupportedOrAbsent,
    genericPhraseCountLow: genericCount <= 1,
    emphasisSpecificOrEmpty: emphasisIsSpecificOrEmpty(extensionCard),
    howItWinsSentenceSpecificOrEmpty: howItWinsSentenceIsSpecificOrEmpty(extensionCard)
  };

  return {
    checks,
    genericPhraseCount: genericCount,
    passed: Object.values(checks).every(Boolean)
  };
}
