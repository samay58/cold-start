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
  const normalized = (value ?? "").replace(/\s+/g, " ").trim();
  const safeFallback = fallback.replace(/\s+/g, " ").trim();
  if (!normalized) {
    return safeFallback;
  }

  const sentence = firstSentence(normalized);
  return clampAtWord(sentence || normalized, 220) || safeFallback;
}

function firstSentence(value: string): string {
  const match = value.match(/^(.+?[.!?])(?:\s|$)/);
  return (match?.[1] ?? value).trim();
}

function clampAtWord(value: string, maxLength: number): string {
  if (value.length <= maxLength) {
    return value;
  }

  const sliced = value.slice(0, maxLength + 1);
  const lastSpace = sliced.lastIndexOf(" ");
  const trimmed = (lastSpace > 80 ? sliced.slice(0, lastSpace) : value.slice(0, maxLength)).trim();
  return `${trimmed.replace(/[.,;:!?]+$/, "")}...`;
}
