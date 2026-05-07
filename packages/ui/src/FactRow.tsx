import type { ResolvedFact } from "@cold-start/core";
import { CitationMarker } from "./CitationMarker";

const undisclosedText = "not publicly disclosed";
const numberFormatter = new Intl.NumberFormat("en-US");
const compactUsdFormatter = new Intl.NumberFormat("en-US", {
  compactDisplay: "short",
  maximumFractionDigits: 1,
  notation: "compact",
  style: "currency",
  currency: "USD"
});
const shortDateFormatter = new Intl.DateTimeFormat("en-US", {
  month: "short",
  year: "numeric",
  timeZone: "UTC"
});
const mediumDateFormatter = new Intl.DateTimeFormat("en-US", {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: "UTC"
});

type FundingRoundLike = {
  name: string;
  amountUsd: number | null;
  announcedAt: string | null;
  leadInvestors: string[];
};

function isYear(value: number) {
  return Number.isInteger(value) && value >= 1800 && value <= 2100;
}

function trimCurrency(value: string) {
  return value.replace(".0", "");
}

export function formatCompactCurrency(value: number | null | undefined): string {
  if (typeof value !== "number") {
    return undisclosedText;
  }

  return trimCurrency(compactUsdFormatter.format(value));
}

export function formatShortDate(value: string | null | undefined): string {
  if (!value) {
    return undisclosedText;
  }

  if (/^\d{4}$/.test(value)) {
    return value;
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return shortDateFormatter.format(parsed);
}

export function formatMediumDate(value: string | null | undefined): string {
  if (!value) {
    return undisclosedText;
  }

  if (/^\d{4}$/.test(value)) {
    return value;
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return mediumDateFormatter.format(parsed).replace(",", "");
}

function isFundingRound(value: Record<string, unknown>): value is FundingRoundLike {
  return (
    typeof value.name === "string" &&
    ("amountUsd" in value || "announcedAt" in value || "leadInvestors" in value)
  );
}

function formatPrimitive(value: string | number | boolean): string {
  if (typeof value === "number") {
    if (isYear(value)) {
      return String(value);
    }

    return numberFormatter.format(value);
  }

  return String(value);
}

function compact(parts: Array<string | null | undefined>): string[] {
  return parts.flatMap((part) => {
    const trimmed = part?.trim();
    return trimmed ? [trimmed] : [];
  });
}

function formatObject(value: Record<string, unknown>): string {
  if (isFundingRound(value)) {
    const amount = typeof value.amountUsd === "number" ? formatCompactCurrency(value.amountUsd) : null;
    const leads = Array.isArray(value.leadInvestors) ? value.leadInvestors.map(formatValue).join(", ") : null;

    return compact([value.name, amount, typeof value.announcedAt === "string" ? formatShortDate(value.announcedAt) : null, leads]).join(" · ");
  }

  if (typeof value.name === "string" && ("role" in value || "sourceUrl" in value)) {
    return compact([value.name, typeof value.role === "string" ? value.role : null]).join(", ");
  }

  if (typeof value.name === "string") {
    return value.name;
  }

  if (typeof value.city === "string" || typeof value.country === "string") {
    return compact([String(value.city ?? ""), String(value.country ?? "")]).join(", ");
  }

  if (typeof value.value === "number" && typeof value.asOf === "string") {
    return `${numberFormatter.format(value.value)} as of ${formatShortDate(value.asOf)}`;
  }

  return Object.entries(value)
    .flatMap(([key, entry]) => {
      if (entry === null || entry === undefined) {
        return [];
      }

      if (Array.isArray(entry)) {
        return entry.length > 0 ? [`${key}: ${entry.map(formatValue).join(", ")}`] : [];
      }

      return [`${key}: ${formatValue(entry)}`];
    })
    .join(", ");
}

export function formatValue(value: unknown): string {
  if (value === null || value === undefined) {
    return undisclosedText;
  }

  if (Array.isArray(value)) {
    const formatted = value.map(formatValue).filter((item) => item !== undisclosedText && item.length > 0);
    return formatted.length > 0 ? formatted.join("; ") : undisclosedText;
  }

  if (typeof value === "object") {
    const formatted = formatObject(value as Record<string, unknown>);
    return formatted.length > 0 ? formatted : undisclosedText;
  }

  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return formatPrimitive(value);
  }

  return String(value);
}

export function FactRow<T>({
  label,
  fact,
  mono = false,
  format
}: {
  label: string;
  fact: ResolvedFact<T>;
  mono?: boolean;
  format?: (value: T | null) => string;
}) {
  return (
    <div className="cs-fact-row">
      <div className="cs-fact-label">{label}</div>
      <div className={mono ? "cs-fact-value cs-mono" : "cs-fact-value"}>
        {format ? format(fact.value) : formatValue(fact.value)}
        {fact.citationIds.map((id) => (
          <CitationMarker id={id} key={id} />
        ))}
      </div>
    </div>
  );
}
