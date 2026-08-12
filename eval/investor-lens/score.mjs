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

export function genericPhraseCount(card) {
  const haystack = [
    ...synthesisClaims(card).map((claim) => text(claim.text)),
    ...emphasisTexts(card)
  ].map((claim) => claim.toLowerCase()).join("\n");
  return GENERIC_PHRASES.filter((phrase) => haystack.includes(phrase)).length;
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
    emphasisSpecificOrEmpty: emphasisIsSpecificOrEmpty(extensionCard)
  };

  return {
    checks,
    genericPhraseCount: genericCount,
    passed: Object.values(checks).every(Boolean)
  };
}
