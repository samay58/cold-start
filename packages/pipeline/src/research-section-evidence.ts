import { readableSourceText, type ColdStartCard } from "@cold-start/core";
import type { ResearchSectionEvidenceSource } from "@cold-start/llm";

function normalizedUrlKey(value: string) {
  try {
    const url = new URL(value);
    url.hash = "";
    url.search = "";
    url.pathname = url.pathname.replace(/\/+$/, "") || "/";
    return url.toString().toLowerCase();
  } catch {
    return value.toLowerCase();
  }
}

// The evidence a research section reads: one item per card citation, the stored page's readable
// text where the source is stored, and the citation's snippet where it is not.
export function evidenceForSection(card: ColdStartCard, storedSources: Array<{ url: string; rawText: string }>): ResearchSectionEvidenceSource[] {
  const sourcesByUrl = new Map(storedSources.map((source) => [normalizedUrlKey(source.url), source]));

  return card.citations.flatMap((citation) => {
    const source = sourcesByUrl.get(normalizedUrlKey(citation.url));
    const text = readableSourceText(source?.rawText) || citation.snippet || "";
    if (!text.trim()) {
      return [];
    }

    return [{
      citationId: citation.id,
      url: citation.url,
      title: citation.title,
      sourceType: citation.sourceType,
      text
    }];
  });
}
