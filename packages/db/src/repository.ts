import { and, desc, eq, inArray } from "drizzle-orm";

import { coldStartCardSchema, publicCard, type ColdStartCard, type ResolvedFact } from "@cold-start/core";

import type { ColdStartDb } from "./client";
import { cards, citations, claims, generationRuns, sources } from "./schema";

type PublicClaim = {
  path: string;
  fact: ResolvedFact<unknown>;
};

const identityTtlMs = 7 * 24 * 60 * 60 * 1000;
const signalsTtlMs = 6 * 60 * 60 * 1000;
const synthesisTtlMs = 24 * 60 * 60 * 1000;

type SourceType = "company_site" | "news" | "filing" | "enrichment" | "github" | "rdap" | "other";
type GenerationStatus = "queued" | "running" | "complete" | "failed";
type ActiveGenerationStatus = Extract<GenerationStatus, "queued" | "running">;
const publicCardSchema = coldStartCardSchema.omit({ synthesis: true });

export function cardExpiryDates(now = new Date()) {
  const time = now.getTime();

  return {
    identityExpiresAt: new Date(time + identityTtlMs),
    signalsExpiresAt: new Date(time + signalsTtlMs),
    synthesisExpiresAt: new Date(time + synthesisTtlMs)
  };
}

export async function findCardBySlug(db: ColdStartDb, slug: string): Promise<ColdStartCard | null> {
  const rows = await db.select().from(cards).where(eq(cards.slug, slug)).limit(1);
  const row = rows[0];

  if (!row) {
    return null;
  }

  return coldStartCardSchema.parse(row.cardJson);
}

export async function findPublicCardBySlug(db: ColdStartDb, slug: string): Promise<Omit<ColdStartCard, "synthesis"> | null> {
  const rows = await db.select({ publicCardJson: cards.publicCardJson }).from(cards).where(eq(cards.slug, slug)).limit(1);
  const row = rows[0];

  if (!row) {
    return null;
  }

  return publicCardSchema.parse(row.publicCardJson);
}

export async function findActiveGenerationRunBySlug(
  db: ColdStartDb,
  slug: string
): Promise<{ slug: string; domain: string; status: ActiveGenerationStatus } | null> {
  const rows = await db
    .select({
      slug: generationRuns.slug,
      domain: generationRuns.domain,
      status: generationRuns.status
    })
    .from(generationRuns)
    .where(and(eq(generationRuns.slug, slug), inArray(generationRuns.status, ["queued", "running"])))
    .orderBy(desc(generationRuns.startedAt))
    .limit(1);
  const row = rows[0];

  if (!row || (row.status !== "queued" && row.status !== "running")) {
    return null;
  }

  return {
    slug: row.slug,
    domain: row.domain,
    status: row.status
  };
}

export async function upsertCard(db: ColdStartDb, card: ColdStartCard) {
  const publicOnly = publicCard(card);
  const generatedAt = new Date(card.generatedAt);
  const now = new Date();
  const expiresAt = cardExpiryDates(now);

  const [row] = await db
    .insert(cards)
    .values({
      slug: card.slug,
      domain: card.domain,
      cardJson: card,
      publicCardJson: publicOnly,
      cacheStatus: card.cacheStatus,
      generationCostUsd: String(card.generationCostUsd),
      generatedAt,
      ...expiresAt
    })
    .onConflictDoUpdate({
      target: cards.slug,
      set: {
        cardJson: card,
        publicCardJson: publicOnly,
        cacheStatus: card.cacheStatus,
        generationCostUsd: String(card.generationCostUsd),
        generatedAt,
        ...expiresAt,
        updatedAt: now
      }
    })
    .returning();

  if (!row) {
    throw new Error(`Failed to upsert card for ${card.slug}`);
  }

  return row;
}

export async function recordCardEvidence(db: ColdStartDb, cardId: string, card: ColdStartCard) {
  const publicOnly = publicCard(card);

  const publicClaims: PublicClaim[] = [
    { path: "identity.name", fact: publicOnly.identity.name },
    { path: "identity.oneLiner", fact: publicOnly.identity.oneLiner },
    { path: "identity.hq", fact: publicOnly.identity.hq },
    { path: "identity.foundedYear", fact: publicOnly.identity.foundedYear },
    { path: "funding.totalRaisedUsd", fact: publicOnly.funding.totalRaisedUsd },
    { path: "funding.lastRound", fact: publicOnly.funding.lastRound },
    { path: "funding.investors", fact: publicOnly.funding.investors },
    { path: "team.founders", fact: publicOnly.team.founders },
    { path: "team.keyExecs", fact: publicOnly.team.keyExecs },
    { path: "team.headcount", fact: publicOnly.team.headcount }
  ];

  const deleteCitations = db.delete(citations).where(eq(citations.cardId, cardId));
  const deleteClaims = db.delete(claims).where(eq(claims.cardId, cardId));
  const insertClaims = db.insert(claims).values(
    publicClaims.map(({ path, fact }) => ({
      cardId,
      path,
      visibility: "public" as const,
      status: fact.status,
      confidence: fact.confidence,
      valueJson: fact.value,
      citationKeys: fact.citationIds
    }))
  );

  if (publicOnly.citations.length === 0) {
    await db.batch([deleteCitations, deleteClaims, insertClaims]);
    return;
  }

  const insertCitations = db.insert(citations).values(
    publicOnly.citations.map((citation) => ({
      cardId,
      citationKey: citation.id,
      url: citation.url,
      title: citation.title,
      sourceType: citation.sourceType,
      ...(citation.snippet !== undefined ? { snippet: citation.snippet } : {}),
      fetchedAt: new Date(citation.fetchedAt)
    }))
  );

  await db.batch([deleteCitations, deleteClaims, insertCitations, insertClaims]);
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
      rawText: input.rawText
    })
    .onConflictDoNothing();
}

export async function markGenerationRun(
  db: ColdStartDb,
  input: {
    slug: string;
    domain: string;
    status: GenerationStatus;
    error?: string;
    costUsd?: number;
  }
) {
  const [row] = await db
    .insert(generationRuns)
    .values({
      slug: input.slug,
      domain: input.domain,
      status: input.status,
      ...(input.error !== undefined ? { error: input.error } : {}),
      ...(input.costUsd !== undefined ? { costUsd: String(input.costUsd) } : {}),
      ...(input.status === "complete" || input.status === "failed" ? { completedAt: new Date() } : {})
    })
    .returning();

  return row;
}
