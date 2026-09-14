// Only explicit, exact amounts cross this boundary. BigInt avoids rounding a
// decimal amount into a plausible but different integer during unit expansion.
export function normalizeExtractionInteger(value: unknown, usd = false): number | null {
  if (typeof value === "number") {
    return Number.isSafeInteger(value) && value >= 0 ? value : null;
  }
  if (typeof value !== "string" || value.length > 100) return null;

  let text = value.trim();
  if (usd) {
    text = text.replace(/^(?:US\$|USD\s*|\$)\s*/i, "").replace(/\s+USD$/i, "");
  }
  const match = /^(\d+|\d{1,3}(?:,\d{3})+)(?:\.(\d+))?(?:\s*(k|m|b|thousand|million|billion))?$/i.exec(text);
  if (!match || (!usd && match[3])) return null;

  const fraction = match[2] ?? "";
  const unit = match[3]?.toLowerCase();
  const multiplier = !unit ? 1n : /^(k|thousand)$/.test(unit) ? 1000n
    : /^(m|million)$/.test(unit) ? 1000000n : 1000000000n;
  const numerator = BigInt(match[1]!.replaceAll(",", "") + fraction) * multiplier;
  const denominator = 10n ** BigInt(fraction.length);
  if (numerator % denominator !== 0n) return null;
  const integer = numerator / denominator;
  return integer <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(integer) : null;
}
