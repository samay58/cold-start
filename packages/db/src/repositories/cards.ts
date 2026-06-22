import { desc, eq } from "drizzle-orm";

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

type PublicCard = Omit<ColdStartCard, "synthesis">;

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
  identityExpiresAt: Date;
  signalsExpiresAt: Date;
  synthesisExpiresAt: Date;
};

const publicCardSchema = coldStartCardObjectSchema.omit({ synthesis: true });

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

function parseCachedCard(row: CardCacheRow, options: CardCacheOptions = {}) {
  const parsed = coldStartCardSchema.parse(row.cardJson);
  return isFreshCacheRow(row, options) ? parsed : { ...parsed, cacheStatus: "stale" as const };
}

export async function findCardBySlug(db: ColdStartDb, slug: string, options: CardCacheOptions = {}): Promise<ColdStartCard | null> {
  const rows = await db
    .select({
      cardJson: cards.cardJson,
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

  return parseCachedCard(row, options);
}

export async function findPublicCardBySlug(db: ColdStartDb, slug: string, options: CardCacheOptions = { mode: "basics" }): Promise<Omit<ColdStartCard, "synthesis"> | null> {
  const rows = await db
    .select({
      cardJson: cards.cardJson,
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

  return publicCardSchema.parse(publicCard(parseCachedCard(row, cacheOptions)));
}

export async function listPublicCardSummaries(db: ColdStartDb): Promise<PublicCardSummary[]> {
  const [cardRows, sectionRows] = await Promise.all([
    db
      .select({ cardJson: cards.cardJson })
      .from(cards)
      .orderBy(desc(cards.generatedAt)),
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

    if (!parsed.success) {
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

export async function upsertCard(db: ColdStartDb, card: ColdStartCard) {
  const cardToStore = card.cacheStatus === "stale" ? { ...card, cacheStatus: "hit" as const } : card;
  const generatedAt = new Date(cardToStore.generatedAt);
  const now = new Date();
  const expiresAt = cardExpiryDates(now);
  const persistedCacheStatus: "hit" | "partial" | "miss" = card.cacheStatus === "stale" ? "hit" : card.cacheStatus;

  const [row] = await db
    .insert(cards)
    .values({
      slug: cardToStore.slug,
      domain: cardToStore.domain,
      cardJson: cardToStore,
      cacheStatus: persistedCacheStatus,
      generationCostUsd: String(cardToStore.generationCostUsd),
      generatedAt,
      ...expiresAt
    })
    .onConflictDoUpdate({
      target: cards.slug,
      set: {
        cardJson: cardToStore,
        cacheStatus: persistedCacheStatus,
        generationCostUsd: String(cardToStore.generationCostUsd),
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
