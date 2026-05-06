import type { ResolvedFact } from "@cold-start/core";
import { CitationMarker } from "./CitationMarker";

const undisclosedText = "not publicly disclosed";
const numberFormatter = new Intl.NumberFormat("en-US");

function formatPrimitive(value: string | number | boolean): string {
  if (typeof value === "number") {
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
  if (typeof value.name === "string" && ("amountUsd" in value || "announcedAt" in value || "leadInvestors" in value)) {
    const amount = typeof value.amountUsd === "number" ? numberFormatter.format(value.amountUsd) : null;
    const leads = Array.isArray(value.leadInvestors) ? value.leadInvestors.map(formatValue).join(", ") : null;

    return compact([value.name, amount, typeof value.announcedAt === "string" ? value.announcedAt : null, leads]).join(", ");
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
    return `${numberFormatter.format(value.value)} as of ${value.asOf}`;
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

export function FactRow<T>({ label, fact, mono = false }: { label: string; fact: ResolvedFact<T>; mono?: boolean }) {
  return (
    <div className="cs-fact-row">
      <div className="cs-fact-label">{label}</div>
      <div className={mono ? "cs-fact-value cs-mono" : "cs-fact-value"}>
        {formatValue(fact.value)}
        {fact.citationIds.map((id) => (
          <CitationMarker id={id} key={id} />
        ))}
      </div>
    </div>
  );
}
