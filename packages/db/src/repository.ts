import { and, desc, eq, inArray, lt } from "drizzle-orm";

import { coldStartCardSchema, publicCard, type ColdStartCard, type GenerationJobKind, type GenerationTrace, type ResolvedFact } from "@cold-start/core";

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
export type GenerationMode = "basics" | "analysis";
type GenerationStatus = "queued" | "running" | "complete" | "failed";
type ActiveGenerationStatus = Extract<GenerationStatus, "queued" | "running">;
const publicCardSchema = coldStartCardSchema.omit({ synthesis: true });
export const generationRunStaleAfterMs = 15 * 60 * 1000;

export type GenerationRunSummary = {
  slug: string;
  domain: string;
  mode: GenerationMode;
  jobKind?: GenerationJobKind | string;
  status: GenerationStatus;
  id?: string;
  error?: string | null;
  costUsd?: string | null;
  traceJson?: GenerationTrace | null;
  inngestEventId?: string | null;
  inngestRunId?: string | null;
  startedAt?: Date;
  completedAt?: Date | null;
};

type GenerationRunRow = {
  slug: string;
  domain: string;
  mode: GenerationMode;
  jobKind?: string;
  status: GenerationStatus;
  id?: string;
  error?: string | null;
  costUsd?: string | null;
  traceJson?: GenerationTrace | null;
  inngestEventId?: string | null;
  inngestRunId?: string | null;
  startedAt?: Date;
  completedAt?: Date | null;
};
type GenerationRunResultRow = Omit<GenerationRunRow, "traceJson"> & { traceJson?: unknown };

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
  slug: string,
  mode: GenerationMode = "analysis"
): Promise<(GenerationRunSummary & { status: ActiveGenerationStatus }) | null> {
  const rows = await db
    .select({
      id: generationRuns.id,
      slug: generationRuns.slug,
      domain: generationRuns.domain,
      mode: generationRuns.mode,
      jobKind: generationRuns.jobKind,
      status: generationRuns.status,
      error: generationRuns.error,
      costUsd: generationRuns.costUsd,
      traceJson: generationRuns.traceJson,
      inngestEventId: generationRuns.inngestEventId,
      inngestRunId: generationRuns.inngestRunId,
      startedAt: generationRuns.startedAt,
      completedAt: generationRuns.completedAt
    })
    .from(generationRuns)
    .where(and(eq(generationRuns.slug, slug), eq(generationRuns.mode, mode), inArray(generationRuns.status, ["queued", "running"])))
    .orderBy(desc(generationRuns.startedAt))
    .limit(1);
  const row = rows[0];

  if (!row || (row.status !== "queued" && row.status !== "running")) {
    return null;
  }

  return generationRunSummary(row) as GenerationRunSummary & { status: ActiveGenerationStatus };
}

export async function findLatestGenerationRunBySlug(
  db: ColdStartDb,
  slug: string,
  mode: GenerationMode = "analysis"
): Promise<GenerationRunSummary | null> {
  const rows = await db
    .select({
      id: generationRuns.id,
      slug: generationRuns.slug,
      domain: generationRuns.domain,
      mode: generationRuns.mode,
      jobKind: generationRuns.jobKind,
      status: generationRuns.status,
      error: generationRuns.error,
      costUsd: generationRuns.costUsd,
      traceJson: generationRuns.traceJson,
      inngestEventId: generationRuns.inngestEventId,
      inngestRunId: generationRuns.inngestRunId,
      startedAt: generationRuns.startedAt,
      completedAt: generationRuns.completedAt
    })
    .from(generationRuns)
    .where(and(eq(generationRuns.slug, slug), eq(generationRuns.mode, mode)))
    .orderBy(desc(generationRuns.startedAt))
    .limit(1);
  const row = rows[0];

  return row ? generationRunSummary(row) : null;
}

export async function retireStaleGenerationRuns(
  db: ColdStartDb,
  input: {
    slug: string;
    mode?: GenerationMode;
    now?: Date;
    staleAfterMs?: number;
  }
) {
  const mode = input.mode ?? "analysis";
  const now = input.now ?? new Date();
  const staleAfterMs = input.staleAfterMs ?? generationRunStaleAfterMs;
  const cutoff = new Date(now.getTime() - staleAfterMs);
  const minutes = Math.round(staleAfterMs / 60000);
  const retired = await db
    .update(generationRuns)
    .set({
      status: "failed",
      error: `stale generation run retired after ${minutes} minutes`,
      completedAt: now
    })
    .where(
      and(
        eq(generationRuns.slug, input.slug),
        eq(generationRuns.mode, mode),
        inArray(generationRuns.status, ["queued", "running"]),
        lt(generationRuns.startedAt, cutoff)
      )
    )
    .returning();

  return retired.length;
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
    ...(publicOnly.identity.description ? [{ path: "identity.description", fact: publicOnly.identity.description }] : []),
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
    await runEvidenceWrites(db, [deleteCitations, deleteClaims, insertClaims], async (tx) => {
      await tx.delete(citations).where(eq(citations.cardId, cardId));
      await tx.delete(claims).where(eq(claims.cardId, cardId));
      await tx.insert(claims).values(
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
    });
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

  await runEvidenceWrites(db, [deleteCitations, deleteClaims, insertCitations, insertClaims], async (tx) => {
    await tx.delete(citations).where(eq(citations.cardId, cardId));
    await tx.delete(claims).where(eq(claims.cardId, cardId));
    await tx.insert(citations).values(
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
    await tx.insert(claims).values(
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
  });
}

async function runEvidenceWrites(
  db: ColdStartDb,
  batchItems: unknown[],
  transactionWrites: (tx: ColdStartDb) => Promise<void>
) {
  if ("batch" in db && typeof db.batch === "function") {
    await db.batch(batchItems as never);
    return;
  }

  if ("transaction" in db && typeof db.transaction === "function") {
    await db.transaction(transactionWrites as never);
    return;
  }

  throw new Error("Database adapter must support batch or transaction writes");
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
    mode?: GenerationMode;
    jobKind?: GenerationJobKind;
    status: GenerationStatus;
    error?: string;
    costUsd?: number;
    traceJson?: GenerationTrace;
    inngestEventId?: string;
    inngestRunId?: string;
  }
) {
  const mode = input.mode ?? "analysis";
  const jobKind = input.jobKind ?? mode;
  const values = {
    slug: input.slug,
    domain: input.domain,
    mode,
    jobKind,
    status: input.status,
    ...(input.error !== undefined ? { error: input.error } : {}),
    ...(input.costUsd !== undefined ? { costUsd: String(input.costUsd) } : {}),
    ...(input.traceJson !== undefined ? { traceJson: input.traceJson } : {}),
    ...(input.inngestEventId !== undefined ? { inngestEventId: input.inngestEventId } : {}),
    ...(input.inngestRunId !== undefined ? { inngestRunId: input.inngestRunId } : {}),
    ...(input.status === "complete" || input.status === "failed" ? { completedAt: new Date() } : {})
  };

  if (input.status === "complete" || input.status === "failed") {
    const [updated] = await db
      .update(generationRuns)
      .set(values)
      .where(and(eq(generationRuns.slug, input.slug), eq(generationRuns.mode, mode), inArray(generationRuns.status, ["queued", "running"])))
      .returning();

    if (updated) {
      return updated;
    }
  }

  if (input.status === "running") {
    const [updated] = await db
      .update(generationRuns)
      .set(values)
      .where(and(eq(generationRuns.slug, input.slug), eq(generationRuns.mode, mode), eq(generationRuns.status, "queued")))
      .returning();

    if (updated) {
      return updated;
    }
  }

  const [row] = await db
    .insert(generationRuns)
    .values(values)
    .returning();

  return row;
}

function generationRunSummary(row: GenerationRunResultRow): GenerationRunSummary {
  return {
    ...(row.id !== undefined ? { id: row.id } : {}),
    slug: row.slug,
    domain: row.domain,
    mode: row.mode,
    ...(row.jobKind !== undefined ? { jobKind: row.jobKind } : {}),
    status: row.status,
    ...(row.error !== undefined ? { error: row.error } : {}),
    ...(row.costUsd !== undefined ? { costUsd: row.costUsd } : {}),
    ...(row.traceJson !== undefined ? { traceJson: row.traceJson as GenerationTrace | null } : {}),
    ...(row.inngestEventId !== undefined ? { inngestEventId: row.inngestEventId } : {}),
    ...(row.inngestRunId !== undefined ? { inngestRunId: row.inngestRunId } : {}),
    ...(row.startedAt !== undefined ? { startedAt: row.startedAt } : {}),
    ...(row.completedAt !== undefined ? { completedAt: row.completedAt } : {})
  };
}
