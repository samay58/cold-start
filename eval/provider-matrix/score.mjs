// Pure scoring functions for the provider-matrix replay harness. Dependency-free (the one
// import below is itself plain JS) so score.test.mjs runs under the root
// `node --test eval/**/*.test.mjs` pass. Schema validity is the runner's job (it calls the real
// stage functions, which zod-parse); these functions judge the parsed output against the frozen
// bundle and the production reference card.

import { signalClusterStats } from "../../packages/core/src/signal-clusters.mjs";
import { genericPhraseCount, hasConcreteTension, hasTestableQuestion, GENERIC_PHRASES } from "../investor-lens/score.mjs";

function resolvedFactEntries(sections) {
  const entries = [];
  const groups = [
    ["identity", sections?.identity],
    ["funding", sections?.funding],
    ["team", sections?.team],
  ];

  for (const [groupName, group] of groups) {
    if (!group || typeof group !== "object") {
      continue;
    }
    for (const [field, value] of Object.entries(group)) {
      if (value && typeof value === "object" && "citationIds" in value && "value" in value) {
        entries.push({ path: `${groupName}.${field}`, fact: value });
      }
    }
  }

  return entries;
}

// Citation discipline: every non-null fact carries citation ids that resolve to the emitted
// citations[], and every emitted citation URL exists in the bundle the model was shown.
export function scoreCitationDiscipline(sections, bundleSourceUrls) {
  const citationIds = new Set((sections?.citations ?? []).map((citation) => citation.id));
  const urlSet = new Set(bundleSourceUrls);
  const violations = [];

  for (const { path, fact } of resolvedFactEntries(sections)) {
    if (fact.value === null) {
      continue;
    }
    if (!Array.isArray(fact.citationIds) || fact.citationIds.length === 0) {
      violations.push(`${path}: non-null fact without citations`);
      continue;
    }
    for (const citationId of fact.citationIds) {
      if (!citationIds.has(citationId)) {
        violations.push(`${path}: citation id ${citationId} missing from citations[]`);
      }
    }
  }

  for (const item of [...(sections?.signals ?? []), ...(sections?.comparables ?? [])]) {
    for (const citationId of item.citationIds ?? []) {
      if (!citationIds.has(citationId)) {
        violations.push(`signals/comparables: citation id ${citationId} missing from citations[]`);
      }
    }
  }

  let unresolvedUrls = 0;
  const citations = sections?.citations ?? [];
  for (const citation of citations) {
    if (!urlSet.has(citation.url)) {
      unresolvedUrls += 1;
      violations.push(`citation ${citation.id}: url not present in bundle (${citation.url})`);
    }
  }

  const factCount = resolvedFactEntries(sections).filter(({ fact }) => fact.value !== null).length;
  return {
    factCount,
    citationCount: citations.length,
    unresolvedUrls,
    violations,
    violationRate: factCount + citations.length > 0 ? Number((violations.length / (factCount + citations.length)).toFixed(4)) : 0,
  };
}

function numberVariants(value) {
  const raw = String(value);
  const variants = new Set([raw]);
  variants.add(Number(value).toLocaleString("en-US"));
  if (value >= 1_000_000_000 && value % 100_000_000 === 0) {
    variants.add(`${value / 1_000_000_000} billion`);
    variants.add(`$${value / 1_000_000_000}B`);
    variants.add(`$${value / 1_000_000_000} billion`);
  }
  if (value >= 1_000_000 && value % 100_000 === 0) {
    variants.add(`${value / 1_000_000} million`);
    variants.add(`$${value / 1_000_000}M`);
    variants.add(`$${value / 1_000_000} million`);
  }
  return Array.from(variants);
}

// Faithfulness on the most hallucination-prone field: every funding amount the model emitted
// must appear somewhere in the bundle text, in raw, comma, or humanized-millions form.
export function scoreFundingFaithfulness(sections, bundleText) {
  const amounts = [];
  const funding = sections?.funding;
  if (funding?.totalRaisedUsd?.value !== null && funding?.totalRaisedUsd?.value !== undefined) {
    amounts.push(funding.totalRaisedUsd.value);
  }
  const rounds = Array.isArray(funding?.rounds?.value) ? funding.rounds.value : [];
  const lastRound = funding?.lastRound?.value;
  for (const round of [...rounds, ...(lastRound ? [lastRound] : [])]) {
    if (typeof round?.amountUsd === "number") {
      amounts.push(round.amountUsd);
    }
  }

  let matched = 0;
  const misses = [];
  for (const amount of amounts) {
    if (numberVariants(amount).some((variant) => bundleText.includes(variant))) {
      matched += 1;
    } else {
      misses.push(amount);
    }
  }

  return {
    checked: amounts.length,
    matched,
    misses,
    matchRate: amounts.length > 0 ? Number((matched / amounts.length).toFixed(4)) : null,
  };
}

const fillRateFields = [
  ["identity", "name"],
  ["identity", "oneLiner"],
  ["identity", "description"],
  ["identity", "hq"],
  ["identity", "foundedYear"],
  ["funding", "totalRaisedUsd"],
  ["funding", "lastRound"],
  ["funding", "investors"],
  ["team", "founders"],
  ["team", "headcount"],
];

export function scoreFillRate(sections) {
  let filled = 0;
  for (const [group, field] of fillRateFields) {
    const fact = sections?.[group]?.[field];
    const value = fact?.value;
    const isFilled = Array.isArray(value) ? value.length > 0 : value !== null && value !== undefined;
    if (isFilled) {
      filled += 1;
    }
  }
  return { filled, total: fillRateFields.length, fillRate: Number((filled / fillRateFields.length).toFixed(4)) };
}

// Signal redundancy: how many distinct events the emitted signals describe, clustered with the
// exact pure function the pipeline uses. A model that extracts one signal per article instead of
// one per event scores well below 1 here (granola regressed to 0.3 before the pipeline dedup).
export function scoreSignalRedundancy(sections, options = {}) {
  return signalClusterStats(sections?.signals ?? [], options);
}

export function scoreExtraction({ sections, bundleSourceUrls, bundleText, companyDomain }) {
  return {
    citationDiscipline: scoreCitationDiscipline(sections, bundleSourceUrls),
    fundingFaithfulness: scoreFundingFaithfulness(sections, bundleText),
    fillRate: scoreFillRate(sections),
    signalRedundancy: scoreSignalRedundancy(sections, { companyDomain }),
  };
}

// Verify replay runs against the production card's SURVIVING synthesis claims (production
// judged all of them supported), so candidate disagreement here is the false-DROP direction.
// False-keep needs the pre-verify drops, which production does not persist.
export function scoreVerify({ results, claims }) {
  const total = claims.length;
  const byIndex = new Map();
  for (const result of results) {
    if (typeof result.claimIndex === "number") {
      byIndex.set(result.claimIndex, result);
    }
  }
  // Mirror production applyVerifierResults: when the verifier omits claimIndex, match results
  // back to claims by text + citation ids instead of scoring them as drops.
  const byKey = new Map();
  for (const result of results) {
    if (typeof result.claimIndex !== "number") {
      byKey.set(JSON.stringify([result.text, [...(result.citationIds ?? [])].sort()]), result);
    }
  }
  const resultForClaim = (claim, index) =>
    byIndex.get(index) ?? byKey.get(JSON.stringify([claim.text, [...claim.citationIds].sort()]));

  let supported = 0;
  let echoViolations = 0;
  for (let index = 0; index < claims.length; index += 1) {
    const result = resultForClaim(claims[index], index);
    if (result?.status === "supported") {
      supported += 1;
    }
    if (result) {
      const expected = JSON.stringify([...claims[index].citationIds].sort());
      const actual = JSON.stringify([...(result.citationIds ?? [])].sort());
      if (expected !== actual) {
        echoViolations += 1;
      }
    }
  }

  return {
    claimCount: total,
    resultCount: results.length,
    supportedRate: total > 0 ? Number((supported / total).toFixed(4)) : null,
    falseDropRate: total > 0 ? Number(((total - supported) / total).toFixed(4)) : null,
    echoViolations,
    claimIndexCoverage: results.length > 0 ? Number((byIndex.size / results.length).toFixed(4)) : null,
  };
}

const citationMarkerRegex = /\[([A-Za-z0-9_-]+)\]/g;

function visibleCitationMarkers(text) {
  return Array.from(String(text ?? "").matchAll(citationMarkerRegex), (match) => match[1]);
}

function synthesisClaimTexts(synthesis) {
  const market = synthesis?.marketStructureAndTiming;
  const marketClaims = market
    ? [
        market.buyerBudget,
        market.painSeverity,
        market.adoptionTrigger,
        market.marketStructure,
        market.profitPool,
        market.expansionPath,
        market.timingRisk
      ].filter(Boolean)
    : [];
  return [synthesis?.whyItMatters, ...(synthesis?.bullCase ?? []), ...(synthesis?.bearCase ?? []), ...marketClaims].filter(Boolean);
}

// Paired synthesis+verify replay: synthesis is a FRESH synthesizeCard output (not the production
// card's), verifierResults come from an immediate verifySynthesis judge pass over synthesis's own
// claims. citationMarkerViolations reimplements synthesis.ts's visible-marker regex in plain JS
// so this file stays dependency-free; a violation means the model printed a citation marker whose
// id does not resolve to the card's citations[], the same failure mode citedSynthesisSchema
// guards against at parse time in production.
export function scoreSynthesis({ synthesis, verifierResults, cardCitationIds }) {
  const cardCitationIdSet = new Set(cardCitationIds);
  const citationMarkerViolations = [];
  for (const claim of synthesisClaimTexts(synthesis)) {
    for (const marker of visibleCitationMarkers(claim.text)) {
      if (!cardCitationIdSet.has(marker)) {
        citationMarkerViolations.push(marker);
      }
    }
  }

  const judged = verifierResults.length;
  const supported = verifierResults.filter((result) => result.status === "supported").length;

  return {
    claimCounts: {
      bullCase: synthesis?.bullCase?.length ?? 0,
      bearCase: synthesis?.bearCase?.length ?? 0,
      openQuestions: synthesis?.openQuestions?.length ?? 0
    },
    citationMarkerViolations,
    verifierSurvivalRate: judged > 0 ? Number((supported / judged).toFixed(4)) : null,
    genericPhraseCount: genericPhraseCount({ synthesis }),
    hasConcreteTension: hasConcreteTension({ synthesis }),
    hasTestableQuestion: hasTestableQuestion({ synthesis })
  };
}

function genericPhraseCountInTexts(texts) {
  const haystack = texts
    .filter(Boolean)
    .map((value) => String(value).toLowerCase())
    .join("\n");
  return GENERIC_PHRASES.filter((phrase) => haystack.includes(phrase)).length;
}

// evidenceCitationIds is the section's evidence set (every citation id the model was shown), not
// the whole card's citations: a research-section citationId is a violation if it names a source
// the model was never given, even if that source exists somewhere else on the card.
export function scoreResearchSection({ content, evidenceCitationIds }) {
  const evidenceIdSet = new Set(evidenceCitationIds);
  const citationIdViolations = [];
  for (const item of content?.items ?? []) {
    for (const citationId of item.citationIds ?? []) {
      if (!evidenceIdSet.has(citationId)) {
        citationIdViolations.push(citationId);
      }
    }
  }

  const items = content?.items ?? [];
  return {
    status: content?.status ?? "empty",
    itemCount: items.length,
    citationIdViolations,
    genericPhraseCount: genericPhraseCountInTexts([content?.summary, ...items.map((item) => item.text)]),
    avgItemChars: items.length > 0 ? Number((items.reduce((sum, item) => sum + item.text.length, 0) / items.length).toFixed(1)) : 0
  };
}

export function aggregate(values) {
  const numbers = values.filter((value) => typeof value === "number" && Number.isFinite(value)).sort((a, b) => a - b);
  if (numbers.length === 0) {
    return null;
  }
  const at = (q) => numbers[Math.min(numbers.length - 1, Math.floor(q * numbers.length))];
  return {
    n: numbers.length,
    median: at(0.5),
    p25: at(0.25),
    p75: at(0.75),
    min: numbers[0],
    max: numbers[numbers.length - 1],
    mean: Number((numbers.reduce((sum, value) => sum + value, 0) / numbers.length).toFixed(6)),
  };
}
