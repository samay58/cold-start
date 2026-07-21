import {
  firstSentence as coreFirstSentence,
  formatCompactUsd,
  sentenceCount as coreSentenceCount,
  type ColdStartCard
} from "@cold-start/core";

// The generic Lens run-failure notice. A withheld synthesis record (see
// packages/core/src/card.ts) is always the honest, specific signal for missing evidence; this
// stays reserved for a real run failure with no such record.
export const LENS_RUN_FAILED_NOTICE = "Investor Lens run failed.";

export function formatElapsed(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  const remainder = String(seconds % 60).padStart(2, "0");
  return `${minutes}:${remainder}`;
}

export function relativeTimeFromNow(iso: string, nowMs: number = Date.now()): string {
  const parsed = Date.parse(iso);
  if (Number.isNaN(parsed)) {
    return "earlier";
  }

  const diffMs = Math.max(0, nowMs - parsed);
  const minute = 60_000;
  const hour = 3_600_000;
  const day = 86_400_000;

  if (diffMs < minute) {
    return "just now";
  }
  if (diffMs < hour) {
    const minutes = Math.round(diffMs / minute);
    return `${minutes} minute${minutes === 1 ? "" : "s"} ago`;
  }
  if (diffMs < day) {
    const hours = Math.round(diffMs / hour);
    return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  }

  const days = Math.round(diffMs / day);
  return `${days} day${days === 1 ? "" : "s"} ago`;
}

function formatCompactCurrency(value: number | null | undefined): string {
  if (typeof value !== "number") {
    return "Not found";
  }

  return formatCompactUsd(value);
}

export function formatOptionalNumber(value: number | null | undefined): string | null {
  return typeof value === "number" ? value.toLocaleString() : null;
}

export function formatOptionalCurrency(value: number | null | undefined): string | null {
  return typeof value === "number" ? formatCompactCurrency(value) : null;
}

export function compactProfileSummary(value: string | null | undefined, fallback: string): string {
  const normalized = cleanSummaryText(value ?? "");
  const safeFallback = cleanSummaryText(fallback);
  if (!normalized) {
    return safeFallback;
  }

  const sentence = firstSentence(normalized);
  return completeSentence(sentence || normalized || safeFallback);
}

type ProfileSummaryCard = {
  domain: string;
  identity: Pick<ColdStartCard["identity"], "description" | "oneLiner">;
};
type ProfileDescriptionValue = NonNullable<NonNullable<ColdStartCard["identity"]["description"]>["value"]>;

export function profileSummaryCopy(card: ProfileSummaryCard): { fullSummary: string; summary: string } {
  const description = card.identity.description?.value;
  const summary = compactProfileSummary(description?.shortDescription ?? card.identity.oneLiner.value, card.domain);
  const expanded = completeSentence(description?.expandedDescription ?? "");
  const structuredFallback = structuredDescriptionFallback(description);
  const fullSummary = meaningfullyLonger(expanded, summary)
    ? expanded
    : meaningfullyLonger(structuredFallback, summary)
      ? structuredFallback
      : summary;

  return { fullSummary, summary };
}

function cleanSummaryText(value: string): string {
  return value
    .replace(/\s+/g, " ")
    .replace(/\.{3,}|…/gu, ".")
    .replace(/\s+([.,;:!?])/g, "$1")
    .replace(/\.{2,}/g, ".")
    .replace(/\s*[,;:-]+\s*$/u, "")
    .trim();
}

// Delegates to the shared abbreviation-aware splitter in @cold-start/core so
// this stays in sync with description normalization and person reads instead
// of carrying its own regex that treats abbreviation periods as sentence ends.
function firstSentence(value: string): string {
  return coreFirstSentence(value);
}

function completeSentence(value: string): string {
  const cleaned = cleanSummaryText(value).replace(/[,:;]+$/, "").trim();
  if (!cleaned) {
    return cleaned;
  }

  return /[.!?]$/.test(cleaned) ? cleaned : `${cleaned}.`;
}

function structuredDescriptionFallback(description: ProfileDescriptionValue | null | undefined): string {
  if (!description) {
    return "";
  }

  const parts = [
    description.concept,
    description.serves,
    description.mechanism
  ].map((part) => completeSentence(part ?? "")).filter(Boolean);
  return Array.from(new Set(parts)).join(" ");
}

function meaningfullyLonger(candidate: string, summary: string): boolean {
  const normalizedCandidate = normalizeForComparison(candidate);
  const normalizedSummary = normalizeForComparison(summary);
  if (!normalizedCandidate || normalizedCandidate === normalizedSummary) {
    return false;
  }

  const extraLength = cleanSummaryText(candidate).length - cleanSummaryText(summary).length;
  return extraLength >= 36 || sentenceCount(candidate) > sentenceCount(summary);
}

function sentenceCount(value: string): number {
  return coreSentenceCount(cleanSummaryText(value));
}

function normalizeForComparison(value: string): string {
  return cleanSummaryText(value).toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}
