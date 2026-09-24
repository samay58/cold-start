import { readableSourceText, snippetFromStoredSource } from "@cold-start/core";
import { desc, eq, sql } from "drizzle-orm";

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
  publishedAt?: string | null;
};

export type SourceSummary = Omit<StoredSource, "rawText" | "publishedAt"> & {
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
      imageUrl: sources.imageUrl,
      publishedAt: sources.publishedAt
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
    imageUrl: row.imageUrl,
    publishedAt: row.publishedAt?.toISOString() ?? null
  }));
}

function sourceDomain(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
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
    snippet: snippetFromStoredSource(row.rawText),
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
    publishedAt?: string | null;
  }
) {
  const parsedDate = input.publishedAt ? new Date(input.publishedAt) : null;
  const publishedAt = parsedDate && !Number.isNaN(parsedDate.getTime()) ? parsedDate : null;
  const insert = db.insert(sources).values({
    cardId: input.cardId,
    url: input.url,
    title: input.title,
    sourceType: input.sourceType,
    fetchedAt: new Date(input.fetchedAt),
    rawText: input.rawText,
    imageUrl: input.imageUrl ?? null,
    publishedAt
  });

  // A re-file keeps the card id, so the same URL arrives again. A row stored before page text was
  // requested (a title-only provider record) takes the new page text, and a row stored before
  // publish dates were kept takes the new date; nothing else about a stored row changes. One
  // statement, so it needs no transaction on Neon HTTP.
  const bringsText = readableSourceText(input.rawText) !== "";
  if (!bringsText && !publishedAt) {
    await insert.onConflictDoNothing();
    return;
  }
  const takesText = bringsText ? storedRowHasNoPageText : sql`false`;
  await insert.onConflictDoUpdate({
    target: [sources.cardId, sources.url],
    set: {
      rawText: sql`CASE WHEN ${takesText} THEN excluded.raw_text ELSE ${sources.rawText} END`,
      fetchedAt: sql`CASE WHEN ${takesText} THEN excluded.fetched_at ELSE ${sources.fetchedAt} END`,
      publishedAt: sql`COALESCE(${sources.publishedAt}, excluded.published_at)`
    },
    setWhere: sql`(${takesText}) OR (${sources.publishedAt} IS NULL AND excluded.published_at IS NOT NULL)`
  });
}

// The stored row carries no page text: it is empty, a JSON array of records, or a JSON record
// with no text, summary or highlights (readableSourceText gives nothing but the title). This
// matches on text instead of parsing JSON, so it runs on any Postgres version and a malformed
// row can never fail the insert. A record whose text sits under a nested key reads as having
// text here, so the row is kept rather than replaced; that errs toward keeping what is stored.
const storedRowHasNoPageText = sql`(
  btrim(${sources.rawText}) = ''
  OR ${sources.rawText} ~ '^\s*\[\s*[{"]'
  OR (
    ${sources.rawText} ~ '^\s*\{'
    AND ${sources.rawText} !~ '"(text|summary)"\s*:\s*"\s*[^"\s]'
    AND ${sources.rawText} !~ '"highlights"\s*:\s*\[\s*"'
  )
)`;
