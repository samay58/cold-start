import { firstSentence, takeSentences } from "./sentences";

const INCOMPLETE_ENDING_WORDS = new Set([
  "about",
  "across",
  "after",
  "against",
  "and",
  "around",
  "as",
  "at",
  "between",
  "by",
  "for",
  "from",
  "in",
  "into",
  "of",
  "on",
  "or",
  "over",
  "through",
  "to",
  "toward",
  "under",
  "with",
  "without"
]);

const WEAK_DESCRIPTION_LABEL_WORDS = new Set([
  "ai",
  "agent",
  "answer",
  "browser",
  "company",
  "copilot",
  "erp",
  "infrastructure",
  "platform",
  "security",
  "software",
  "solution",
  "startup",
  "tool"
]);

export function cleanDescriptionText(value: string): string {
  return value
    .replace(/\s+/g, " ")
    .replace(/\.{3,}|…/gu, ".")
    .replace(/\s+([.,;:!?])/g, "$1")
    .replace(/\.{2,}/g, ".")
    .trim()
    .replace(/\s*[,;:-]+\s*$/u, "")
    .trim();
}

export function hasIncompleteDescriptionEnding(value: string): boolean {
  const words = value.toLowerCase().replace(/[.!?]+$/u, "").split(/\s+/).filter(Boolean);
  const last = words.at(-1)?.replace(/[^a-z0-9-]/g, "");
  return !last || INCOMPLETE_ENDING_WORDS.has(last);
}

export function completeDescriptionSentence(value: string | null | undefined): string | null {
  const cleaned = cleanDescriptionText(value ?? "");
  if (!cleaned || hasIncompleteDescriptionEnding(cleaned)) {
    return null;
  }

  return /[.!?]$/.test(cleaned) ? cleaned : `${cleaned}.`;
}

// Delegates to the shared abbreviation-aware splitter in ./sentences so this
// module, the extraction normalizer, person-read validation, and the
// extension's profile formatting all agree on what a sentence boundary is.
export function firstDescriptionSentence(value: string): string {
  return firstSentence(value);
}

export function descriptionSentences(value: string, limit: number): string[] {
  return takeSentences(value, limit);
}

export function clampCompleteDescriptionSentence(value: string, maxLength: number): string | null {
  if (value.length <= maxLength) {
    return completeDescriptionSentence(value);
  }

  const clipped = value.slice(0, maxLength + 1);
  const boundary = clipped.lastIndexOf(" ");
  const trimmed = (boundary > 90 ? clipped.slice(0, boundary) : value.slice(0, maxLength)).trim();
  return completeDescriptionSentence(trimmed.replace(/[.,;:!?]+$/u, ""));
}

export function isWeakDescriptionLabel(value: string): boolean {
  const normalized = cleanDescriptionText(value).toLowerCase();
  const words = normalized.split(/\s+/).filter(Boolean);
  if (words.length < 4) {
    return true;
  }
  if (/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(normalized)) {
    return true;
  }

  return words.length <= 5 && words.every((word) =>
    WEAK_DESCRIPTION_LABEL_WORDS.has(word.replace(/[^a-z0-9-]/g, ""))
  );
}
