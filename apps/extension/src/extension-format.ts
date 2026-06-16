import type { ColdStartCard } from "@cold-start/core";

export const INSUFFICIENT_EVIDENCE_NOTICE =
  "Not enough verified evidence for an investor lens yet.";

export function formatElapsed(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  const remainder = String(seconds % 60).padStart(2, "0");
  return `${minutes}:${remainder}`;
}

function formatCompactCurrency(value: number | null | undefined): string {
  if (typeof value !== "number") {
    return "Not found";
  }

  if (value >= 1_000_000_000) {
    return `$${Math.round(value / 100_000_000) / 10}B`;
  }

  if (value >= 1_000_000) {
    return `$${Math.round(value / 1_000_000)}M`;
  }

  return `$${value.toLocaleString()}`;
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

function firstSentence(value: string): string {
  const match = value.match(/^(.+?[.!?])(?:\s|$)/);
  return (match?.[1] ?? value).trim();
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
  return (cleanSummaryText(value).match(/[^.!?]+[.!?]+(?:\s|$)/g) ?? []).length;
}

function normalizeForComparison(value: string): string {
  return cleanSummaryText(value).toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}
