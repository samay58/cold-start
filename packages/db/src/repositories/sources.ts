import { desc, eq } from "drizzle-orm";

import type { ColdStartDb } from "../client";
import { cards, sources } from "../schema";

type SourceType = "company_site" | "news" | "filing" | "enrichment" | "github" | "rdap" | "other";

export type StoredSource = {
  id: string;
  url: string;
  title: string;
  sourceType: SourceType;
  fetchedAt: string;
  rawText: string;
  imageUrl?: string | null;
};

export type SourceSummary = Omit<StoredSource, "rawText"> & {
  domain: string;
  snippet: string;
};

export async function findSourcesBySlug(db: ColdStartDb, slug: string): Promise<StoredSource[]> {
  const rows = await db
    .select({
      id: sources.id,
      url: sources.url,
      title: sources.title,
      sourceType: sources.sourceType,
      fetchedAt: sources.fetchedAt,
      rawText: sources.rawText,
      imageUrl: sources.imageUrl
    })
    .from(sources)
    .innerJoin(cards, eq(sources.cardId, cards.id))
    .where(eq(cards.slug, slug));

  return rows.map((row) => ({
    id: row.id,
    url: row.url,
    title: row.title,
    sourceType: row.sourceType,
    fetchedAt: row.fetchedAt.toISOString(),
    rawText: row.rawText,
    imageUrl: row.imageUrl
  }));
}

function sourceDomain(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

function compactSnippet(rawText: string, maxLength = 360) {
  const normalized = rawText.replace(/\s+/g, " ").trim();
  if (normalized.length <= maxLength) {
    return normalized;
  }

  return `${normalized.slice(0, maxLength).trimEnd()}...`;
}

export async function findSourceSummariesBySlug(
  db: ColdStartDb,
  slug: string,
  options: { limit?: number } = {}
): Promise<SourceSummary[]> {
  const rows = await db
    .select({
      id: sources.id,
      url: sources.url,
      title: sources.title,
      sourceType: sources.sourceType,
      fetchedAt: sources.fetchedAt,
      rawText: sources.rawText,
      imageUrl: sources.imageUrl
    })
    .from(sources)
    .innerJoin(cards, eq(sources.cardId, cards.id))
    .where(eq(cards.slug, slug))
    .orderBy(desc(sources.fetchedAt))
    .limit(options.limit ?? 24);

  return rows.map((row) => ({
    id: row.id,
    url: row.url,
    title: row.title,
    domain: sourceDomain(row.url),
    sourceType: row.sourceType,
    fetchedAt: row.fetchedAt.toISOString(),
    snippet: compactSnippet(row.rawText),
    imageUrl: row.imageUrl
  }));
}

export async function recordSource(
  db: ColdStartDb,
  input: {
    cardId: string;
    url: string;
    title: string;
    sourceType: SourceType;
    fetchedAt: string;
    rawText: string;
    imageUrl?: string | null;
  }
) {
  await db
    .insert(sources)
    .values({
      cardId: input.cardId,
      url: input.url,
      title: input.title,
      sourceType: input.sourceType,
      fetchedAt: new Date(input.fetchedAt),
      rawText: input.rawText,
      imageUrl: input.imageUrl ?? null
    })
    .onConflictDoNothing();
}
