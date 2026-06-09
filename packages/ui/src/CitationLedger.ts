import type { Citation } from "@cold-start/core";
import { sourceQualityForSource, sourceQualityTierRank } from "@cold-start/core";

export type CitationSourceClass = "independent" | "reporting" | "company";

export function sourceClassForCitation(citation: Citation): CitationSourceClass {
  const tier = (citation.sourceQuality ?? sourceQualityForSource(citation)).tier;

  if (tier === "independent_technical" || tier === "independent_analysis") {
    return "independent";
  }

  if (tier === "independent_report") {
    return "reporting";
  }

  return "company";
}

export type CitationLedgerEntry = {
  citation: Citation;
  /** 1-based reader-facing index, shared by inline markers and the source ledger. */
  displayIndex: number;
  sourceClass: CitationSourceClass;
};

export type CitationLedger = ReadonlyMap<string, CitationLedgerEntry>;

function citationRank(citation: Citation) {
  return sourceQualityTierRank((citation.sourceQuality ?? sourceQualityForSource(citation)).tier);
}

export function sortedUniqueCitations(citations: Citation[]): Citation[] {
  const seen = new Set<string>();

  return [...citations]
    .sort((left, right) => citationRank(right) - citationRank(left))
    .filter((citation) => {
      if (seen.has(citation.id)) {
        return false;
      }

      seen.add(citation.id);
      return true;
    });
}

// The display order is the same tier-ranked order the source ledger renders in, so an
// inline [3] is always the third row of the ledger.
export function buildCitationLedger(citations: Citation[]): CitationLedger {
  const ledger = new Map<string, CitationLedgerEntry>();

  sortedUniqueCitations(citations).forEach((citation, index) => {
    ledger.set(citation.id, {
      citation,
      displayIndex: index + 1,
      sourceClass: sourceClassForCitation(citation)
    });
  });

  return ledger;
}

export function citationHostname(url: string | null | undefined): string | null {
  if (!url) {
    return null;
  }

  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}
