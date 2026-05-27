const ellipsis = "...";

export const defaultExtractionEvidenceBudgetChars = 24_000;

type EvidenceBudgetSource = {
  sourceType: string;
  intent?: string | null;
};

export function evidenceBudgetCharsFromEnv(value: string | undefined, fallback = defaultExtractionEvidenceBudgetChars) {
  if (!value) {
    return fallback;
  }

  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export function compactEvidenceText(value: string, maxLength: number) {
  const collapsed = value.replace(/\s+/g, " ").trim();
  if (maxLength <= 0) {
    return "";
  }
  if (collapsed.length <= maxLength) {
    return collapsed;
  }
  if (maxLength <= ellipsis.length) {
    return collapsed.slice(0, maxLength);
  }

  const bodyLimit = maxLength - ellipsis.length;
  const slice = collapsed.slice(0, bodyLimit + 1);
  const lastSpace = slice.lastIndexOf(" ");
  const truncated = lastSpace > 0 ? slice.slice(0, lastSpace) : collapsed.slice(0, bodyLimit);
  const output = `${truncated.trim()}${ellipsis}`;

  return output.length <= maxLength ? output : `${collapsed.slice(0, bodyLimit)}${ellipsis}`.slice(0, maxLength);
}

export function budgetEvidenceSources<T extends EvidenceBudgetSource>(input: {
  sources: T[];
  itemLimit: number;
  textLimit: number;
  budgetChars: number;
  getText(source: T): string;
  withText(source: T, text: string): T;
}) {
  const ranked = input.sources
    .map((source, index) => ({ source, index, rank: evidenceSourceTrustRank(source) }))
    .sort((left, right) => right.rank - left.rank || left.index - right.index)
    .slice(0, input.itemLimit);

  let remainingBudget = Math.max(0, Math.floor(input.budgetChars));
  const output: T[] = [];

  for (const candidate of ranked) {
    if (remainingBudget <= 0) {
      break;
    }

    const text = compactEvidenceText(input.getText(candidate.source), Math.min(input.textLimit, remainingBudget));
    remainingBudget -= text.length;
    output.push(input.withText(candidate.source, text));
  }

  return output;
}

function evidenceSourceTrustRank(source: EvidenceBudgetSource) {
  const sourceType = source.sourceType.toLowerCase();
  const intent = source.intent?.toLowerCase();

  if (sourceType === "filing") {
    return 50;
  }
  if (sourceType === "independent_analysis" || intent === "independent_analysis") {
    return 40;
  }
  if (sourceType === "company_site") {
    return 30;
  }
  if (sourceType === "news") {
    return 20;
  }
  if (sourceType === "github") {
    return 18;
  }
  if (sourceType === "rdap") {
    return 12;
  }
  if (sourceType === "enrichment") {
    return 0;
  }

  return 10;
}
