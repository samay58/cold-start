import type { ProviderSource, RetrievalIntent } from "@cold-start/providers";
import { readableSourceText, sourceQualityRank, sourceSnippet } from "@cold-start/core";

export type EvidenceLedgerEntry = {
  id: string;
  url: string;
  title: string;
  sourceType: ProviderSource["sourceType"];
  fetchedAt: string;
  intents: RetrievalIntent[];
  authorityScore: number;
  // The page's own opening, cut to the snippet cap from the readable text of every stored row for
  // this URL; absent when none of them has text.
  snippet?: string;
  // When the source says it was published; absent when no stored row for this URL carries a date.
  publishedAt?: string;
};

export function buildEvidenceLedger(input: { domain: string; sources: ProviderSource[] }): EvidenceLedgerEntry[] {
  const entries = new Map<string, Omit<EvidenceLedgerEntry, "id">>();
  const texts = new Map<string, string>();

  for (const source of input.sources) {
    const key = canonicalSourceKey(source.url);
    const existing = entries.get(key);
    const intents = mergeIntents(existing?.intents ?? [], source.intent);
    const text = [texts.get(key), readableSourceText(source.rawText)].filter(Boolean).join("\n\n");
    texts.set(key, text);

    entries.set(key, {
      url: source.url,
      title: chooseTitle(existing?.title, source.title, source.url),
      sourceType: strongerSourceType(existing?.sourceType, source.sourceType),
      fetchedAt: newestIso(existing?.fetchedAt, source.fetchedAt),
      intents,
      authorityScore: Math.max(existing?.authorityScore ?? 0, authorityScore(source, input.domain)),
      ...(text ? { snippet: sourceSnippet(text) } : {}),
      ...((existing?.publishedAt ?? source.publishedAt) ? { publishedAt: existing?.publishedAt ?? source.publishedAt } : {}),
    });
  }

  return Array.from(entries.values())
    .sort((left, right) => right.authorityScore - left.authorityScore || right.intents.length - left.intents.length)
    .map((entry, index) => ({ id: `e${index + 1}`, ...entry }));
}

// What a cited source contributes to its citation: the source's publish date, and the page's own
// text as the snippet only where the extraction model wrote none. The model's note holds the fact
// it cited; a page's opening is often headline and navigation, and verifying claims against it
// kept about half as many true claims in the September 2026 comparison on 12 cards.
export function withSourcePageDetails<T extends { url: string; snippet?: string | undefined; publishedAt?: string | undefined }>(
  citations: T[],
  ledger: EvidenceLedgerEntry[]
): T[] {
  const byKey = new Map(ledger.map((entry) => [canonicalSourceKey(entry.url), entry]));
  return citations.map((citation) => {
    const entry = byKey.get(canonicalSourceKey(citation.url));
    const snippet = citation.snippet?.trim() ? undefined : entry?.snippet;
    return {
      ...citation,
      ...(snippet ? { snippet } : {}),
      ...(entry?.publishedAt ? { publishedAt: entry.publishedAt } : {})
    };
  });
}

function canonicalSourceKey(url: string) {
  try {
    const parsed = new URL(url);
    parsed.hash = "";
    parsed.search = "";
    return parsed.toString().replace(/\/+$/, "");
  } catch {
    return url;
  }
}

function mergeIntents(existing: RetrievalIntent[], next: RetrievalIntent | undefined) {
  const intents = new Set(existing);
  if (next) {
    intents.add(next);
  }
  return Array.from(intents);
}

function chooseTitle(existing: string | undefined, next: string, url: string) {
  if (existing && existing !== url) {
    return existing;
  }
  return next || existing || url;
}

function strongerSourceType(
  existing: ProviderSource["sourceType"] | undefined,
  next: ProviderSource["sourceType"],
): ProviderSource["sourceType"] {
  if (!existing) {
    return next;
  }

  const rank: Record<ProviderSource["sourceType"], number> = {
    filing: 6,
    company_site: 5,
    news: 4,
    github: 3,
    rdap: 2,
    enrichment: 1,
    other: 0,
  };

  return rank[next] > rank[existing] ? next : existing;
}

function newestIso(existing: string | undefined, next: string) {
  if (!existing) {
    return next;
  }

  return Date.parse(next) > Date.parse(existing) ? next : existing;
}

function authorityScore(source: ProviderSource, domain: string) {
  const base: Record<ProviderSource["sourceType"], number> = {
    filing: 6,
    company_site: 4,
    news: 4,
    github: 3,
    rdap: 2,
    enrichment: 1,
    other: 1,
  };
  return base[source.sourceType] + sourceQualityRank(source, { targetDomain: domain });
}
