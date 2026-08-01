import { formatCompactUsd, formatMonthYear } from "@cold-start/core";

const undisclosedText = "not publicly disclosed";
const mediumDateFormatter = new Intl.DateTimeFormat("en-US", {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: "UTC"
});

export function formatCompactCurrency(value: number | null | undefined): string {
  if (typeof value !== "number") {
    return undisclosedText;
  }

  return formatCompactUsd(value);
}

export function formatShortDate(value: string | null | undefined): string {
  if (!value) {
    return undisclosedText;
  }

  return formatMonthYear(value);
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
