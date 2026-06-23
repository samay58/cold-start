const GENERIC_PHRASES = [
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

function genericPhraseCount(card) {
  const haystack = synthesisClaims(card).map((claim) => text(claim.text).toLowerCase()).join("\n");
  return GENERIC_PHRASES.filter((phrase) => haystack.includes(phrase)).length;
}

function hasConcreteTension(card) {
  const bull = text(card?.synthesis?.bullCase?.[0]?.text);
  const bear = text(card?.synthesis?.bearCase?.[0]?.text);
  return Boolean(bull && bear && /\b(break|risk|unless|if|fails|incumbent|substitute|budget|workflow)\b/i.test(bear));
}

function hasTestableQuestion(card) {
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
    genericPhraseCountLow: genericCount <= 1
  };

  return {
    checks,
    genericPhraseCount: genericCount,
    passed: Object.values(checks).every(Boolean)
  };
}
