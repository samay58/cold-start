import type { ProviderSource, RetrievalIntent } from "@cold-start/providers";
import { sourceQualityRank } from "@cold-start/core";

export type EvidenceLedgerEntry = {
  id: string;
  url: string;
  title: string;
  sourceType: ProviderSource["sourceType"];
  fetchedAt: string;
  intents: RetrievalIntent[];
  authorityScore: number;
  rawText: string;
  supportingSnippets: string[];
};

export function buildEvidenceLedger(input: { domain: string; sources: ProviderSource[] }): EvidenceLedgerEntry[] {
  const entries = new Map<string, Omit<EvidenceLedgerEntry, "id">>();

  for (const source of input.sources) {
    const key = canonicalSourceKey(source.url);
    const existing = entries.get(key);
    const intents = mergeIntents(existing?.intents ?? [], source.intent);
    const rawText = existing?.rawText ? `${existing.rawText}\n\n${source.rawText}` : source.rawText;

    entries.set(key, {
      url: source.url,
      title: chooseTitle(existing?.title, source.title, source.url),
      sourceType: strongerSourceType(existing?.sourceType, source.sourceType),
      fetchedAt: newestIso(existing?.fetchedAt, source.fetchedAt),
      intents,
      authorityScore: Math.max(existing?.authorityScore ?? 0, authorityScore(source, input.domain)),
      rawText,
      supportingSnippets: supportSnippets(rawText),
    });
  }

  return Array.from(entries.values())
    .sort((left, right) => right.authorityScore - left.authorityScore || right.intents.length - left.intents.length)
    .map((entry, index) => ({ id: `e${index + 1}`, ...entry }));
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
  const qualityRank = sourceQualityRank(source);
  const hostBonus = source.sourceType !== "company_site" && sourceHostMatchesDomain(source.url, domain) ? 1 : 0;
  const intentBonus = source.intent === "funding" || source.intent === "independent_analysis" ? 1 : 0;

  return base[source.sourceType] + hostBonus + intentBonus + qualityRank;
}

function sourceHostMatchesDomain(url: string, domain: string) {
  try {
    const host = new URL(url).hostname.replace(/^www\./i, "").toLowerCase();
    const normalizedDomain = domain.replace(/^www\./i, "").toLowerCase();
    return host === normalizedDomain || host.endsWith(`.${normalizedDomain}`);
  } catch {
    return false;
  }
}

function supportSnippets(text: string) {
  const keywords = [
    "raised",
    "funding",
    "series",
    "valuation",
    "led by",
    "investor",
    "product",
    "platform",
    "customers",
    "what does",
  ];
  const sentences = text
    .replace(/\s+/g, " ")
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => sentence.trim())
    .filter(Boolean);
  const relevant = sentences.filter((sentence) => {
    const lower = sentence.toLowerCase();
    return keywords.some((keyword) => lower.includes(keyword));
  });

  return (relevant.length > 0 ? relevant : sentences).slice(0, 4);
}
