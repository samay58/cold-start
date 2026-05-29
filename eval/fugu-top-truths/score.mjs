const truthFields = ["truth", "whyRanked"];
const conflictFields = ["conflict", "whyHard", "workingResolution"];

export function validateTopTruthsOutput(output) {
  const issues = [];
  const truths = Array.isArray(output?.truths) ? output.truths : [];

  if (truths.length !== 5 || !hasRanksOneThroughFive(truths)) {
    issues.push({ code: "truth_count", message: "output must include exactly five truths ranked 1 through 5" });
  }

  if (
    truths.some(
      (truth) =>
        !truthFields.every((field) => nonEmptyString(truth?.[field])) ||
        !nonEmptyArray(truth?.evidenceStrong) ||
        !nonEmptyArray(truth?.evidenceWeakOrConflicted) ||
        !nonEmptyArray(truth?.sourceIds),
    )
  ) {
    issues.push({ code: "truth_support", message: "each truth needs ranking rationale, evidence, uncertainty, and source ids" });
  }

  if (!Array.isArray(output?.excludedClaims) || output.excludedClaims.length === 0) {
    issues.push({ code: "excluded_claim_count", message: "output must exclude at least one tempting claim" });
  }

  if (!nonEmptyArray(output?.evidenceStrong)) {
    issues.push({ code: "strong_evidence_missing", message: "output must summarize where evidence is strong" });
  }

  if (!nonEmptyArray(output?.evidenceConflictedOrWeak)) {
    issues.push({ code: "weak_evidence_missing", message: "output must summarize conflicted or weak evidence" });
  }

  if (!conflictFields.every((field) => nonEmptyString(output?.hardestConflict?.[field]))) {
    issues.push({ code: "hardest_conflict_missing", message: "output must name and resolve the hardest conflict" });
  }

  return issues;
}

export function scoreTopTruthsOutput(output, bundle = null) {
  const issues = validateTopTruthsOutput(output);
  const dimensions = {
    rankingDiscipline: dimensionScore("Ranking discipline", rankingDiscipline(output, issues)),
    supportQuality: dimensionScore("Support quality", supportQuality(output)),
    exclusionDiscipline: dimensionScore("Exclusion discipline", exclusionDiscipline(output)),
    conflictHandling: dimensionScore("Conflict handling", conflictHandling(output)),
    fillerControl: dimensionScore("Filler control", fillerControl(output)),
  };
  const total = Object.values(dimensions).reduce((sum, dimension) => sum + dimension.score, 0);

  return {
    total,
    maxTotal: 15,
    dimensions,
    issues,
    keepSignal: total >= 12 && issues.length === 0 ? "yes" : total >= 9 ? "conditional" : "no",
    // Reported as a SEPARATE axis, never folded into the 15-pt structural total. A model can
    // score well on structure and still cite sources that do not resolve or do not support the
    // claim. This is the guarantee the Fugu free-text path loses vs the Anthropic tool path.
    ...(bundle ? { integrity: scoreCitationIntegrity(output, bundle) } : {}),
  };
}

// Citation integrity, deterministic. Two checks:
//   resolution: every cited sourceId must exist in the frozen bundle (no fabricated refs).
//   support proxy: the cited sources' text should contain the truth's salient tokens (the
//     dollar figures, numbers, and distinctive capitalized terms it asserts). This is a cheap
//     automated proxy for "the source actually backs the claim"; a true verifier-style support
//     check (LLM judge) is the follow-up, run on a sample rather than every burn run.
export function scoreCitationIntegrity(output, bundle) {
  const bundleIds = new Set((bundle?.sources ?? []).map((source) => String(source.id)));
  const textById = new Map((bundle?.sources ?? []).map((source) => [String(source.id), normalizeForMatch(String(source.text ?? ""))]));
  const truths = Array.isArray(output?.truths) ? output.truths : [];
  const excluded = Array.isArray(output?.excludedClaims) ? output.excludedClaims : [];

  const referencedIds = [
    ...truths.flatMap((truth) => truth?.sourceIds ?? []),
    ...excluded.flatMap((claim) => claim?.sourceIds ?? []),
  ].map(String);
  const fabricatedIds = Array.from(new Set(referencedIds.filter((id) => !bundleIds.has(id))));
  const resolvedCount = referencedIds.filter((id) => bundleIds.has(id)).length;

  let truthsCited = 0;
  let truthsSupported = 0;
  for (const truth of truths) {
    const ids = (truth?.sourceIds ?? []).map(String).filter((id) => bundleIds.has(id));
    if (ids.length === 0) continue;
    truthsCited += 1;
    const citedText = ids.map((id) => textById.get(id) ?? "").join(" ");
    if (truthSupportedByText(truth?.truth ?? "", citedText)) {
      truthsSupported += 1;
    }
  }

  const totalTruths = truths.length || 0;
  let score = 3;
  if (fabricatedIds.length > 0) score = Math.min(score, fabricatedIds.length >= 3 ? 0 : 1);
  if (totalTruths > 0 && truthsCited < totalTruths) score = Math.min(score, 1);
  if (totalTruths > 0 && truthsSupported < Math.ceil(totalTruths * 0.6)) score = Math.min(score, 2);

  return {
    label: "Citation integrity",
    score,
    referenced: referencedIds.length,
    resolved: resolvedCount,
    fabricatedIds,
    truthsCited,
    truthsSupported,
    totalTruths,
    fabricationFree: fabricatedIds.length === 0,
  };
}

function normalizeForMatch(value) {
  return String(value).toLowerCase().replace(/\s+/g, " ");
}

function salientTokensFromClaim(claim) {
  const text = String(claim);
  const moneyAndNumbers = Array.from(text.matchAll(/\$?\d[\d.,]*\s?(?:billion|million|b|m|k|%)?/gi), (match) => match[0].toLowerCase().replace(/\s+/g, ""));
  const capitalized = Array.from(text.matchAll(/\b[A-Z][a-zA-Z0-9.&-]{3,}\b/g), (match) => match[0].toLowerCase());
  return { numbers: Array.from(new Set(moneyAndNumbers)), terms: Array.from(new Set(capitalized)) };
}

function truthSupportedByText(claim, citedText) {
  if (!citedText) return false;
  const citedDigits = citedText.replace(/,/g, "");
  const { numbers, terms } = salientTokensFromClaim(claim);
  const digitsOf = (token) => token.replace(/[^\d]/g, "");
  const bigNumbers = numbers.map(digitsOf).filter((digits) => digits.length >= 2);
  // If the claim asserts a multi-digit figure, that figure must appear in the cited source.
  // The company name matching everywhere is not evidence the number is supported.
  if (bigNumbers.length > 0) {
    return bigNumbers.some((digits) => citedDigits.includes(digits));
  }
  // No checkable number: fall back to distinctive capitalized-term overlap.
  return matchedTermRatio(terms, citedText) >= 0.34;
}

function matchedTermRatio(terms, citedText) {
  if (terms.length === 0) return 0;
  const matched = terms.filter((term) => citedText.includes(term)).length;
  return matched / terms.length;
}

function dimensionScore(label, score) {
  return { label, score: Math.max(0, Math.min(3, score)) };
}

function rankingDiscipline(output, issues) {
  if (issues.some((issue) => issue.code === "truth_count")) {
    return 0;
  }
  const truths = output?.truths ?? [];
  const rationales = truths.filter((truth) => wordCount(truth?.whyRanked) >= 10).length;
  return rationales === 5 ? 3 : rationales >= 3 ? 2 : rationales >= 1 ? 1 : 0;
}

function supportQuality(output) {
  const truths = Array.isArray(output?.truths) ? output.truths : [];
  const supported = truths.filter(
    (truth) =>
      nonEmptyArray(truth?.sourceIds) &&
      nonEmptyArray(truth?.evidenceStrong) &&
      nonEmptyArray(truth?.evidenceWeakOrConflicted),
  ).length;
  return supported === 5 ? 3 : supported >= 3 ? 2 : supported >= 1 ? 1 : 0;
}

function exclusionDiscipline(output) {
  const exclusions = Array.isArray(output?.excludedClaims) ? output.excludedClaims : [];
  const realExclusions = exclusions.filter((claim) => nonEmptyString(claim?.claim) && wordCount(claim?.whyExcluded) >= 6).length;
  return realExclusions >= 2 ? 3 : realExclusions === 1 ? 2 : exclusions.length > 0 ? 1 : 0;
}

function conflictHandling(output) {
  const conflict = output?.hardestConflict;
  if (!conflictFields.every((field) => nonEmptyString(conflict?.[field]))) {
    return 0;
  }
  const totalWords = conflictFields.reduce((sum, field) => sum + wordCount(conflict[field]), 0);
  return totalWords >= 18 ? 3 : totalWords >= 12 ? 2 : 1;
}

function fillerControl(output) {
  const text = JSON.stringify(output ?? {});
  const words = wordCount(text);
  const fillerHits = [
    "important because it is important",
    "game changer",
    ["best", "in", "class"].join("-"),
    ["world", "class"].join("-"),
    ["cutting", "edge"].join("-"),
    "del" + "ve",
    "further" + "more",
    "addition" + "ally",
  ].filter((phrase) => text.toLowerCase().includes(phrase)).length;

  if (fillerHits > 0 || words > 1200) {
    return 1;
  }
  return words < 160 ? 2 : 3;
}

function hasRanksOneThroughFive(truths) {
  return truths
    .map((truth) => truth?.rank)
    .sort((left, right) => left - right)
    .every((rank, index) => rank === index + 1);
}

function nonEmptyArray(value) {
  return Array.isArray(value) && value.some((item) => nonEmptyString(item));
}

function nonEmptyString(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function wordCount(value) {
  return String(value ?? "")
    .trim()
    .split(/\s+/)
    .filter(Boolean).length;
}
