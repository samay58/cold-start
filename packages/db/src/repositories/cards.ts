import { and, desc, eq, sql } from "drizzle-orm";

import {
  coldStartCardObjectSchema,
  coldStartCardSchema,
  hasUsablePublicProfile,
  publicCard,
  type ColdStartCard,
  type ResearchSection
} from "@cold-start/core";

import type { ColdStartDb } from "../client";
import { cards, researchSections } from "../schema";
import type { GenerationMode } from "./generation-runs";
import { researchSectionFromRow } from "./shared";

type PublicCard = Omit<ColdStartCard, "synthesis" | "synthesisWithheld">;

export type PublicCardSummary = {
  slug: string;
  domain: string;
  name: string;
  generatedAt: string;
  sourceCount: number;
  totalRaisedUsd: number | null;
  lastRoundName: string | null;
  headcount: number | null;
  card: PublicCard;
  sections: ResearchSection[];
};

const identityTtlMs = 7 * 24 * 60 * 60 * 1000;
const signalsTtlMs = 6 * 60 * 60 * 1000;
const synthesisTtlMs = 24 * 60 * 60 * 1000;

type CardCacheMode = GenerationMode;
type CardCacheOptions = {
  mode?: CardCacheMode | undefined;
  now?: Date | undefined;
  allowStale?: boolean | undefined;
};
type CardCacheRow = {
  cardJson: unknown;
  domain: string;
  identityExpiresAt: Date;
  signalsExpiresAt: Date;
  synthesisExpiresAt: Date;
};

export type CardWriteOptions = {
  // Defaults to true, which is every caller today. Pass false to store a synthesis-bearing card
  // without moving synthesis_expires_at: the write lands the run's fresher basics facts while the
  // stored read still expires on its original schedule. Identity and signals TTLs always refresh.
  extendSynthesisTtl?: boolean | undefined;
};

const publicCardSchema = coldStartCardObjectSchema.omit({ synthesis: true, synthesisWithheld: true });
const cardMutationLocks = new Map<string, Promise<void>>();

export function cardExpiryDates(now = new Date()) {
  const time = now.getTime();

  return {
    identityExpiresAt: new Date(time + identityTtlMs),
    signalsExpiresAt: new Date(time + signalsTtlMs),
    synthesisExpiresAt: new Date(time + synthesisTtlMs)
  };
}

function isFreshCacheRow(row: CardCacheRow, options: CardCacheOptions = {}) {
  const now = options.now ?? new Date();
  const mode = options.mode ?? "analysis";

  if (row.identityExpiresAt <= now || row.signalsExpiresAt <= now) {
    return false;
  }

  return mode === "basics" || row.synthesisExpiresAt > now;
}

// Null means the stored row cannot be served: a card written before a schema change no longer
// satisfies today's schema, and throwing would 500 every read of that slug until someone
// intervenes. Callers treat null as a cache miss so the next visit regenerates the card. A row
// that does parse still has its domain invariant enforced by a throw; that one is a real
// corruption signal, not drift.
function parseCachedCard(row: CardCacheRow, slug: string, options: CardCacheOptions = {}): ColdStartCard | null {
  const parsed = coldStartCardSchema.safeParse(row.cardJson);
  if (!parsed.success) {
    console.warn("[repository] dropping unparsable stored card", {
      slug,
      issues: parsed.error.issues.slice(0, 3).map((issue) => ({
        path: issue.path.join("."),
        code: issue.code,
        message: issue.message
      }))
    });
    return null;
  }

  const card = parsed.data;
  if (typeof row.domain === "string" && card.domain !== row.domain) {
    throw new Error(`Card domain invariant failed: row=${row.domain} card=${card.domain}`);
  }
  return isFreshCacheRow(row, options) ? card : { ...card, cacheStatus: "stale" as const };
}

export async function findCardBySlug(db: ColdStartDb, slug: string, options: CardCacheOptions = {}): Promise<ColdStartCard | null> {
  const rows = await db
    .select({
      cardJson: cards.cardJson,
      domain: cards.domain,
      identityExpiresAt: cards.identityExpiresAt,
      signalsExpiresAt: cards.signalsExpiresAt,
      synthesisExpiresAt: cards.synthesisExpiresAt
    })
    .from(cards)
    .where(eq(cards.slug, slug))
    .limit(1);
  const row = rows[0];

  if (!row) {
    return null;
  }

  if (!options.allowStale && !isFreshCacheRow(row, options)) {
    return null;
  }

  return parseCachedCard(row, slug, options);
}

// Signals TTL only (6h), not the combined identity+signals(+synthesis) check isFreshCacheRow
// runs for cache reads. Used by the analysis source re-fetch policy (ANALYSIS_SOURCE_REFRESH) to
// decide whether the stableenrich signals probes are worth re-running on a reused-extraction
// analysis run. A missing row (no stored card yet) reads as not fresh.
export async function isCardSignalsFresh(db: ColdStartDb, slug: string, now = new Date()): Promise<boolean> {
  const rows = await db
    .select({ signalsExpiresAt: cards.signalsExpiresAt })
    .from(cards)
    .where(eq(cards.slug, slug))
    .limit(1);
  const row = rows[0];

  return row ? row.signalsExpiresAt > now : false;
}

export async function findPublicCardBySlug(db: ColdStartDb, slug: string, options: CardCacheOptions = { mode: "basics" }): Promise<PublicCard | null> {
  const rows = await db
    .select({
      cardJson: cards.cardJson,
      domain: cards.domain,
      identityExpiresAt: cards.identityExpiresAt,
      signalsExpiresAt: cards.signalsExpiresAt,
      synthesisExpiresAt: cards.synthesisExpiresAt
    })
    .from(cards)
    .where(eq(cards.slug, slug))
    .limit(1);
  const row = rows[0];

  if (!row) {
    return null;
  }

  const cacheOptions = { mode: options.mode ?? "basics", now: options.now, allowStale: options.allowStale };

  if (!options.allowStale && !isFreshCacheRow(row, cacheOptions)) {
    return null;
  }

  const parsed = parseCachedCard(row, slug, cacheOptions);
  return parsed ? publicCardSchema.parse(publicCard(parsed)) : null;
}

export async function listPublicCardSummaries(db: ColdStartDb): Promise<PublicCardSummary[]> {
  const [cardRows, sectionRows] = await Promise.all([
    db
      .select({ cardJson: cards.cardJson, domain: cards.domain })
      .from(cards)
      .orderBy(desc(cards.generatedAt))
      // Bounded read; revisit when the catalog approaches 500 filed cards.
      .limit(500),
    db
      .select({
        slug: researchSections.slug,
        domain: researchSections.domain,
        sectionId: researchSections.sectionId,
        visibility: researchSections.visibility,
        status: researchSections.status,
        contentJson: researchSections.contentJson,
        citationIds: researchSections.citationIds,
        sourceIds: researchSections.sourceIds,
        runId: researchSections.runId,
        error: researchSections.error,
        generatedAt: researchSections.generatedAt,
        staleAt: researchSections.staleAt,
        createdAt: researchSections.createdAt,
        updatedAt: researchSections.updatedAt
      })
      .from(researchSections)
      .where(eq(researchSections.visibility, "public"))
  ]);
  const sectionsBySlug = new Map<string, ResearchSection[]>();

  for (const row of sectionRows) {
    const section = researchSectionFromRow(row);
    if (!section) {
      continue;
    }
    sectionsBySlug.set(section.slug, [...(sectionsBySlug.get(section.slug) ?? []), section]);
  }

  return cardRows.flatMap((row) => {
    const parsed = coldStartCardSchema.safeParse(row.cardJson);

    if (!parsed.success || (typeof row.domain === "string" && parsed.data.domain !== row.domain)) {
      return [];
    }

    const card = publicCardSchema.parse(publicCard(parsed.data));

    if (!hasUsablePublicProfile(card)) {
      return [];
    }

    return [{
      slug: card.slug,
      domain: card.domain,
      name: card.identity.name.value ?? card.domain,
      generatedAt: card.generatedAt,
      sourceCount: card.citations.length,
      totalRaisedUsd: card.funding.totalRaisedUsd.value,
      lastRoundName: card.funding.lastRound.value?.name ?? null,
      headcount: card.team.headcount.value?.value ?? null,
      card,
      sections: sectionsBySlug.get(card.slug) ?? []
    }];
  });
}

export async function upsertCard(db: ColdStartDb, card: ColdStartCard, options: CardWriteOptions = {}) {
  const cardToStore = card.cacheStatus === "stale" ? { ...card, cacheStatus: "hit" as const } : card;
  const generatedAt = new Date(cardToStore.generatedAt);
  const now = new Date();
  const expiresAt = cardExpiryDates(now);
  const persistedCacheStatus: "hit" | "partial" | "miss" = card.cacheStatus === "stale" ? "hit" : card.cacheStatus;
  // Only extend the synthesis TTL when this write actually carries synthesis and the caller wants
  // the window moved. A basics-only or withheld write has nothing fresh to serve for analysis
  // mode; granting it a full synthesis window anyway would misreport freshness on the next
  // analysis read. Identity/signals TTLs always refresh, on every write.
  const refreshSynthesisTtl = Boolean(cardToStore.synthesis) && options.extendSynthesisTtl !== false;
  const insertExpiresAt = refreshSynthesisTtl ? expiresAt : { ...expiresAt, synthesisExpiresAt: now };
  const updateExpiresAt: { identityExpiresAt: Date; signalsExpiresAt: Date; synthesisExpiresAt?: Date } = refreshSynthesisTtl
    ? expiresAt
    : { identityExpiresAt: expiresAt.identityExpiresAt, signalsExpiresAt: expiresAt.signalsExpiresAt };

  const [row] = await db
    .insert(cards)
    .values({
      slug: cardToStore.slug,
      domain: cardToStore.domain,
      cardJson: cardToStore,
      cacheStatus: persistedCacheStatus,
      generationCostUsd: String(cardToStore.generationCostUsd),
      generatedAt,
      ...insertExpiresAt,
      updatedAt: now
    })
    .onConflictDoUpdate({
      target: cards.slug,
      setWhere: eq(cards.domain, cardToStore.domain),
      set: {
        cardJson: cardToStore,
        cacheStatus: persistedCacheStatus,
        generationCostUsd: String(cardToStore.generationCostUsd),
        generatedAt,
        ...updateExpiresAt,
        version: sql`${cards.version} + 1`,
        updatedAt: now
      }
    })
    .returning();

  if (!row) {
    throw new Error(`Failed to upsert card for ${card.slug}`);
  }

  return row;
}

export async function mutateCard(
  db: ColdStartDb,
  slug: string,
  mutate: (current: ColdStartCard) => ColdStartCard,
  options: CardWriteOptions & { maxAttempts?: number | undefined } = {}
) {
  const maxAttempts = options.maxAttempts ?? 32;
  const previous = cardMutationLocks.get(slug) ?? Promise.resolve();
  let releaseLock: () => void = () => undefined;
  const currentLock = new Promise<void>((resolve) => {
    releaseLock = resolve;
  });
  const tail = previous.then(() => currentLock);
  cardMutationLocks.set(slug, tail);
  await previous;

  try {
    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
      const [existing] = await db
        .select({ cardJson: cards.cardJson, version: cards.version })
        .from(cards)
        .where(eq(cards.slug, slug))
        .limit(1);
      if (!existing) {
        return null;
      }

      const current = coldStartCardSchema.parse(existing.cardJson);
      const next = coldStartCardSchema.parse(mutate(current));
      if (next.slug !== current.slug || next.domain !== current.domain) {
        throw new Error(`Card mutation cannot change identity for ${slug}`);
      }
      const cardToStore = next.cacheStatus === "stale" ? { ...next, cacheStatus: "hit" as const } : next;
      const now = new Date();
      const expiresAt = cardExpiryDates(now);
      const refreshSynthesisTtl = Boolean(cardToStore.synthesis) && options.extendSynthesisTtl !== false;
      const [row] = await db
        .update(cards)
        .set({
          cardJson: cardToStore,
          cacheStatus: cardToStore.cacheStatus === "stale" ? "hit" : cardToStore.cacheStatus,
          generationCostUsd: String(cardToStore.generationCostUsd),
          generatedAt: new Date(cardToStore.generatedAt),
          identityExpiresAt: expiresAt.identityExpiresAt,
          signalsExpiresAt: expiresAt.signalsExpiresAt,
          ...(refreshSynthesisTtl ? { synthesisExpiresAt: expiresAt.synthesisExpiresAt } : {}),
          version: existing.version + 1,
          updatedAt: now
        })
        // The compare must stay on an integer column. Timestamps round-trip through JS at
        // millisecond precision while Postgres stores microseconds, so a timestamp equality
        // here silently never matches rows stamped by the column default.
        .where(and(eq(cards.slug, slug), eq(cards.version, existing.version)))
        .returning();

      if (row) {
        return { card: cardToStore, row };
      }

      const baseBackoffMs = Math.min(32, 2 ** Math.min(attempt, 5));
      const backoffMs = baseBackoffMs + Math.floor(Math.random() * baseBackoffMs);
      await new Promise((resolve) => setTimeout(resolve, backoffMs));
    }

    throw new Error(`Failed to update card for ${slug} after concurrent writes`);
  } finally {
    releaseLock();
    if (cardMutationLocks.get(slug) === tail) {
      cardMutationLocks.delete(slug);
    }
  }
}
