// Single source of truth for compact USD and human month-year formatting. Core cannot import
// @cold-start/ui, so this lives here; ui and the extension delegate to it instead of carrying
// their own formatting logic (previously two independently-drifting implementations).

const MILLION = 1_000_000;
const TEN_MILLION = 10_000_000;
const BILLION = 1_000_000_000;

function roundToOneDecimal(value: number): number {
  return Math.round(value * 10) / 10;
}

function trimTrailingZero(value: string): string {
  return value.endsWith(".0") ? value.slice(0, -2) : value;
}

// Precision bands: under $10M keeps one decimal ($6,250,000 -> "$6.3M", trailing ".0" trimmed
// so $6,000,000 -> "$6M"); at and above $10M rounds to a whole million ($12,400,000 -> "$12M");
// billions keep one decimal at the 100M granularity, matching the prior extension behavior.
export function formatCompactUsd(value: number): string {
  const sign = value < 0 ? "-" : "";
  const abs = Math.abs(value);

  if (abs >= BILLION) {
    return `${sign}$${trimTrailingZero(roundToOneDecimal(abs / BILLION).toFixed(1))}B`;
  }

  if (abs >= TEN_MILLION) {
    return `${sign}$${Math.round(abs / MILLION)}M`;
  }

  if (abs >= MILLION) {
    return `${sign}$${trimTrailingZero(roundToOneDecimal(abs / MILLION).toFixed(1))}M`;
  }

  return `${sign}$${abs.toLocaleString("en-US")}`;
}

const monthYearFormatter = new Intl.DateTimeFormat("en-US", {
  month: "short",
  year: "numeric",
  timeZone: "UTC"
});

// Parses an ISO date or a bare year and renders "Jul 2019". Non-parseable input passes through
// unchanged rather than throwing, since upstream data is not always a clean ISO date.
export function formatMonthYear(value: string): string {
  if (/^\d{4}$/.test(value)) {
    return value;
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return monthYearFormatter.format(parsed);
}
