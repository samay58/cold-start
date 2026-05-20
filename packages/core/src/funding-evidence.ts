import type { Citation, ColdStartCard, ResolvedFact } from "./card";
import { sourceQualityRank } from "./source-quality";

export type CitationFundingEvidence = {
  amountLabel: string | null;
  amountUsd: number | null;
  body: string;
  citationIds: string[];
  meta: string;
  status: "closed" | "reported";
  title: string;
};

function normalizeCompanyTerm(value: string | null | undefined) {
  return (value ?? "")
    .toLowerCase()
    .replace(/^www\./, "")
    .replace(/\b(ai|inc|labs|company|corp|corporation|llc|ltd)\b/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function stripCitationMarkers(text: string) {
  return text
    .replace(/\s*\[(?:c|C)?[\w.-]+(?:,\s*(?:c|C)?[\w.-]+)*\]/g, "")
    .replace(/\s+([.,;:!?])/g, "$1")
    .replace(/\s{2,}/g, " ")
    .trim();
}

function domainFromHref(href: string) {
  try {
    return new URL(href).hostname.replace(/^www\./, "");
  } catch {
    return href;
  }
}

function formatCompactCurrency(value: number) {
  if (value >= 1_000_000_000) {
    return `$${Math.round(value / 100_000_000) / 10}B`;
  }

  if (value >= 1_000_000) {
    return `$${Math.round(value / 1_000_000)}M`;
  }

  return `$${value.toLocaleString()}`;
}

function clampText(value: string, maxLength: number) {
  const normalized = stripCitationMarkers(value).replace(/\s+/g, " ").trim();
  if (normalized.length <= maxLength) {
    return normalized;
  }

  const sliced = normalized.slice(0, maxLength + 1);
  const lastSpace = sliced.lastIndexOf(" ");
  const trimmed = (lastSpace > 80 ? sliced.slice(0, lastSpace) : normalized.slice(0, maxLength)).trim();
  return `${trimmed.replace(/[.,;:!?]+$/, "")}...`;
}

function sentenceFragments(value: string) {
  return value
    .replace(/\s+/g, " ")
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => sentence.trim())
    .filter(Boolean);
}

function compactCurrencyMatch(amount: string, unit: string) {
  const numeric = Number(amount.replace(/,/g, ""));
  if (!Number.isFinite(numeric)) {
    return null;
  }

  const normalizedUnit = unit.toLowerCase();
  const amountUsd = normalizedUnit.startsWith("b")
    ? numeric * 1_000_000_000
    : normalizedUnit.startsWith("m")
      ? numeric * 1_000_000
      : numeric;

  return {
    amountUsd,
    label: formatCompactCurrency(amountUsd),
  };
}

function fundingSentenceStatus(sentence: string): "closed" | "reported" | null {
  const normalized = sentence.toLowerCase();
  if (!/\b(funding|financing|raise|raised|round|investment|investor|stake|injection|valuation)\b/.test(normalized)) {
    return null;
  }

  const hasReportedIntent = /\b(seek|seeks|seeking|in talks|reportedly raising|nears|eyes|target|would|considering|pledged|pledge|up to|commitment)\b/.test(normalized);
  const hasClosedIntent = /\b(raised|secured|securing|closed|completed|nabs|announced|invested|injection|took a stake|led)\b/.test(normalized);

  if (hasReportedIntent && !hasClosedIntent) {
    return "reported";
  }

  if (hasClosedIntent) {
    return "closed";
  }

  if (hasReportedIntent) {
    return "reported";
  }

  return null;
}

function fundingTitle(status: CitationFundingEvidence["status"], amountLabel: string | null, body: string) {
  if (/intercontinental exchange|\bice\b/i.test(body)) {
    return amountLabel ? `ICE investment reported at ${amountLabel}` : "ICE investment reported";
  }

  if (status === "closed") {
    return amountLabel ? `Reported ${amountLabel} financing` : "Reported financing";
  }

  return amountLabel ? `Reported ${amountLabel} raise` : "Reported fundraising";
}

function evidenceSortRank(evidence: CitationFundingEvidence, citationsById: Map<string, Citation>) {
  const citation = citationsById.get(evidence.citationIds[0] ?? "");
  return {
    amount: evidence.amountUsd ?? 0,
    context: /\b(completed|closed|injection)\b/i.test(evidence.body)
      ? 2
      : /\b(raised|secured|securing|announced|nabs|invested|took a stake|led)\b/i.test(evidence.body)
        ? 1
        : 0,
    status: evidence.status === "closed" ? 1 : 0,
    source: citation ? sourceQualityRank(citation) : 0,
  };
}

function targetCompanyTerms(card: Pick<ColdStartCard, "citations"> & Partial<Pick<ColdStartCard, "domain" | "identity">>) {
  return Array.from(new Set([
    normalizeCompanyTerm(card.domain?.split(".")[0] ?? card.domain),
    normalizeCompanyTerm(card.domain),
    normalizeCompanyTerm(card.identity?.name.value),
  ].filter(Boolean)));
}

function sentenceLooksLikeCompetitorFunding(sentence: string, targetTerms: string[]) {
  const normalized = normalizeCompanyTerm(sentence);
  const mentionsTarget = targetTerms.some((term) => term.length >= 3 && normalized.includes(term));
  return !mentionsTarget && /\bcompetitor[s]?\b/i.test(sentence);
}

export function fundingEvidenceFromCitations(
  card: Pick<ColdStartCard, "citations"> & Partial<Pick<ColdStartCard, "domain" | "identity">>
): CitationFundingEvidence[] {
  const evidence: CitationFundingEvidence[] = [];
  const seen = new Set<string>();
  const targetTerms = targetCompanyTerms(card);

  for (const citation of card.citations) {
    const text = [citation.snippet, citation.title].filter((part): part is string => Boolean(part)).join(" ");
    if (!/\b(funding|fundraising|raised|round|investment|investor|valuation|stake|injection)\b/i.test(text)) {
      continue;
    }

    for (const sentence of sentenceFragments(text)) {
      const status = fundingSentenceStatus(sentence);
      if (!status) {
        continue;
      }
      if (sentenceLooksLikeCompetitorFunding(sentence, targetTerms)) {
        continue;
      }

      let bestAmount: { amountUsd: number; label: string; score: number; status: "closed" | "reported" } | null = null;
      const amountMatches = Array.from(sentence.matchAll(/\$([0-9][0-9,.]*)(?:\s|-)?(billion|bn|m|million|b)\b/gi));
      for (const match of amountMatches) {
        const matchIndex = match.index ?? 0;
        const beforeAmount = sentence.slice(Math.max(0, matchIndex - 30), matchIndex);
        const afterAmount = sentence.slice(matchIndex + match[0].length, matchIndex + match[0].length + 32);
        const immediateBefore = sentence.slice(Math.max(0, matchIndex - 16), matchIndex);
        if (/\b(valuation|valued|value)\b/i.test(beforeAmount) || /^\s*(?:post-money\s+)?(?:valuation|value)\b/i.test(afterAmount)) {
          continue;
        }

        const parsed = compactCurrencyMatch(match[1] ?? "", match[2] ?? "");
        if (!parsed) {
          continue;
        }

        const localContext = `${beforeAmount} ${afterAmount}`;
        let score = 0;
        let amountStatus = status;
        if (/\b(completed|injection|secured|securing|raised|round|funding|investment|invested)\b/i.test(localContext)) {
          score += 2;
          amountStatus = "closed";
        }
        if (/\b(completed with|secured|securing|raised)\s*$/i.test(immediateBefore)) {
          score += 3;
          amountStatus = "closed";
        }
        if (/\b(pledged|up to|commitment)\s*$/i.test(immediateBefore) || /^\s*(?:commitment|pledge)\b/i.test(afterAmount)) {
          score -= 2;
          amountStatus = "reported";
        }
        if (status === "reported" && /\b(seek|seeking|raising|raise|talks)\b/i.test(localContext)) {
          score += 1;
        }

        if (
          !bestAmount ||
          score > bestAmount.score ||
          (score === bestAmount.score && parsed.amountUsd > bestAmount.amountUsd)
        ) {
          bestAmount = { ...parsed, score, status: amountStatus };
        }
      }

      const body = clampText(sentence, 220);
      const amountLabel = bestAmount?.label ?? null;
      const amountUsd = bestAmount?.amountUsd ?? null;
      const evidenceStatus = bestAmount?.status ?? status;
      const key = `${evidenceStatus}:${amountLabel ?? "amount"}:${body.toLowerCase()}`;
      if (seen.has(key)) {
        continue;
      }

      seen.add(key);
      evidence.push({
        amountLabel,
        amountUsd,
        body,
        citationIds: [citation.id],
        meta: evidenceStatus === "closed" ? domainFromHref(citation.url) : `${domainFromHref(citation.url)} · reported`,
        status: evidenceStatus,
        title: fundingTitle(evidenceStatus, amountLabel, body),
      });
    }
  }

  const citationsById = new Map(card.citations.map((citation) => [citation.id, citation]));

  return evidence
    .sort((left, right) => {
      const leftRank = evidenceSortRank(left, citationsById);
      const rightRank = evidenceSortRank(right, citationsById);
      return (
        rightRank.status - leftRank.status ||
        rightRank.source - leftRank.source ||
        rightRank.context - leftRank.context ||
        Number(Boolean(right.amountUsd)) - Number(Boolean(left.amountUsd)) ||
        rightRank.amount - leftRank.amount
      );
    })
    .slice(0, 6);
}

function hasStructuredFunding(card: ColdStartCard) {
  return Boolean(
    card.funding.lastRound.value ||
      card.funding.totalRaisedUsd.value !== null ||
      (card.funding.rounds?.value?.length ?? 0) > 0 ||
      (card.funding.investors.value?.length ?? 0) > 0
  );
}

function inferredFact<T>(value: T, citationIds: string[]): ResolvedFact<T> {
  return {
    value,
    status: "inferred",
    confidence: "medium",
    citationIds,
  };
}

export function materializeFundingFromCitations(card: ColdStartCard): ColdStartCard {
  if (hasStructuredFunding(card)) {
    return card;
  }

  const closedEvidence = fundingEvidenceFromCitations(card).find((item) => item.status === "closed" && item.amountUsd !== null);
  if (!closedEvidence?.amountUsd) {
    return card;
  }

  const round: NonNullable<ColdStartCard["funding"]["lastRound"]["value"]> = {
    name: "Reported financing",
    amountUsd: closedEvidence.amountUsd,
    announcedAt: null,
    leadInvestors: [],
  };
  const roundFact = inferredFact(round, closedEvidence.citationIds);

  return {
    ...card,
    funding: {
      ...card.funding,
      lastRound: roundFact,
      rounds: inferredFact([round], closedEvidence.citationIds),
    },
  };
}
