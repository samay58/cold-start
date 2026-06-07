import { and, desc, eq, inArray, lt } from "drizzle-orm";

import {
  coldStartCardObjectSchema,
  coldStartCardSchema,
  generationTraceSchema,
  hasUsablePublicProfile,
  publicCard,
  researchSectionContentSchema,
  researchSectionIdSchema,
  researchSectionStatusSchema,
  researchSectionVisibilitySchema,
  type ColdStartCard,
  type GenerationJobKind,
  type GenerationTrace,
  type ResearchSection,
  type ResearchSectionId,
  type ResolvedFact
} from "@cold-start/core";

import type { ColdStartDb } from "./client";
import { cards, citations, claims, generationRuns, researchRunEvents, researchSections, sources } from "./schema";

type PublicClaim = {
  path: string;
  fact: ResolvedFact<unknown>;
};

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

type SourceType = "company_site" | "news" | "filing" | "enrichment" | "github" | "rdap" | "other";
export type GenerationMode = "basics" | "analysis";
type GenerationStatus = "queued" | "running" | "complete" | "failed";
type ActiveGenerationStatus = Extract<GenerationStatus, "queued" | "running">;
const publicCardSchema = coldStartCardObjectSchema.omit({ synthesis: true });
export const generationRunStaleAfterMs = 15 * 60 * 1000;
export const researchSectionRunStaleAfterMs = 15 * 60 * 1000;

export type GenerationRunSummary = {
  slug: string;
  domain: string;
  mode: GenerationMode;
  jobKind: GenerationJobKind | string;
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

export type GenerationRunStatusSummary = Omit<GenerationRunSummary, "traceJson" | "inngestEventId" | "inngestRunId">;

type GenerationRunRow = {
  slug: string;
  domain: string;
  mode: GenerationMode;
  jobKind: string;
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

type GenerationRunStatusResultRow = Omit<GenerationRunResultRow, "traceJson" | "inngestEventId" | "inngestRunId">;
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

type ResearchSectionRow = {
  slug: string;
  domain: string;
  sectionId: string;
  visibility: string;
  status: string;
  contentJson: unknown;
  citationIds: unknown;
  sourceIds: unknown;
  runId?: string | null;
  error?: string | null;
  generatedAt?: Date | null;
  staleAt?: Date | null;
  createdAt?: Date;
  updatedAt?: Date;
};

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

function jsonStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string" && item.trim().length > 0) : [];
}

function researchSectionFromRow(row: ResearchSectionRow): ResearchSection {
  const status = researchSectionStatusSchema.parse(row.status);
  const content = row.contentJson === null || row.contentJson === undefined ? null : researchSectionContentSchema.parse(row.contentJson);
  return {
    slug: row.slug,
    domain: row.domain,
    sectionId: researchSectionIdSchema.parse(row.sectionId),
    visibility: researchSectionVisibilitySchema.parse(row.visibility),
    status,
    content,
    citationIds: jsonStringArray(row.citationIds),
    sourceIds: jsonStringArray(row.sourceIds),
    runId: row.runId ?? null,
    error: row.error ?? null,
    generatedAt: row.generatedAt ? row.generatedAt.toISOString() : null,
    staleAt: row.staleAt ? row.staleAt.toISOString() : null,
    ...(row.createdAt ? { createdAt: row.createdAt.toISOString() } : {}),
    ...(row.updatedAt ? { updatedAt: row.updatedAt.toISOString() } : {})
  };
}

export async function findResearchSectionsBySlug(db: ColdStartDb, slug: string): Promise<ResearchSection[]> {
  const rows = await db
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
    .where(eq(researchSections.slug, slug));

  return rows.map(researchSectionFromRow);
}

export async function upsertResearchSection(db: ColdStartDb, section: ResearchSection): Promise<ResearchSection | null> {
  const now = new Date();
  const [row] = await db
    .insert(researchSections)
    .values({
      slug: section.slug,
      domain: section.domain,
      sectionId: section.sectionId,
      visibility: section.visibility,
      status: section.status,
      contentJson: section.content,
      citationIds: section.citationIds,
      sourceIds: section.sourceIds,
      runId: section.runId,
      error: section.error,
      generatedAt: section.generatedAt ? new Date(section.generatedAt) : null,
      staleAt: section.staleAt ? new Date(section.staleAt) : null,
      updatedAt: now
    })
    .onConflictDoUpdate({
      target: [researchSections.slug, researchSections.sectionId],
      set: {
        domain: section.domain,
        visibility: section.visibility,
        status: section.status,
        contentJson: section.content,
        citationIds: section.citationIds,
        sourceIds: section.sourceIds,
        runId: section.runId,
        error: section.error,
        generatedAt: section.generatedAt ? new Date(section.generatedAt) : null,
        staleAt: section.staleAt ? new Date(section.staleAt) : null,
        updatedAt: now
      }
    })
    .returning();

  return row ? researchSectionFromRow(row) : null;
}

export async function upsertResearchSections(db: ColdStartDb, sectionsToWrite: ResearchSection[]): Promise<void> {
  for (const section of sectionsToWrite) {
    await upsertResearchSection(db, section);
  }
}

export async function markResearchSectionRunning(
  db: ColdStartDb,
  input: { slug: string; domain: string; sectionId: ResearchSectionId; visibility: "public" | "gated"; runId?: string | null }
) {
  return upsertResearchSection(db, {
    slug: input.slug,
    domain: input.domain,
    sectionId: input.sectionId,
    visibility: input.visibility,
    status: "running",
    content: null,
    citationIds: [],
    sourceIds: [],
    runId: input.runId ?? null,
    error: null,
    generatedAt: null,
    staleAt: null
  });
}

export async function markResearchSectionFailed(
  db: ColdStartDb,
  input: { slug: string; domain: string; sectionId: ResearchSectionId; visibility: "public" | "gated"; error: string; runId?: string | null }
) {
  return upsertResearchSection(db, {
    slug: input.slug,
    domain: input.domain,
    sectionId: input.sectionId,
    visibility: input.visibility,
    status: "failed",
    content: null,
    citationIds: [],
    sourceIds: [],
    runId: input.runId ?? null,
    error: input.error,
    generatedAt: new Date().toISOString(),
    staleAt: null
  });
}

export async function retireStaleResearchSections(db: ColdStartDb, input: { slug: string; now?: Date; staleAfterMs?: number }) {
  const now = input.now ?? new Date();
  const cutoff = new Date(now.getTime() - (input.staleAfterMs ?? researchSectionRunStaleAfterMs));
  const rows = await db
    .update(researchSections)
    .set({
      status: "failed",
      error: "stale section run retired after 15 minutes",
      updatedAt: now
    })
    .where(and(eq(researchSections.slug, input.slug), eq(researchSections.status, "running"), lt(researchSections.updatedAt, cutoff)))
    .returning();

  return rows.length;
}

export async function findActiveGenerationRunBySlug(
  db: ColdStartDb,
  slug: string,
  mode: GenerationMode,
  jobKind?: GenerationJobKind
): Promise<(GenerationRunSummary & { status: ActiveGenerationStatus }) | null> {
  const filters = [
    eq(generationRuns.slug, slug),
    eq(generationRuns.mode, mode),
    ...(jobKind ? [eq(generationRuns.jobKind, jobKind)] : []),
    inArray(generationRuns.status, ["queued", "running"])
  ];
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
    .where(and(...filters))
    .orderBy(desc(generationRuns.startedAt))
    .limit(1);
  const row = rows[0];

  if (!row || (row.status !== "queued" && row.status !== "running")) {
    return null;
  }

  return generationRunSummary(row) as GenerationRunSummary & { status: ActiveGenerationStatus };
}

export async function findActiveGenerationRunStatusBySlug(
  db: ColdStartDb,
  slug: string,
  mode: GenerationMode,
  jobKind?: GenerationJobKind
): Promise<(GenerationRunStatusSummary & { status: ActiveGenerationStatus }) | null> {
  const filters = [
    eq(generationRuns.slug, slug),
    eq(generationRuns.mode, mode),
    ...(jobKind ? [eq(generationRuns.jobKind, jobKind)] : []),
    inArray(generationRuns.status, ["queued", "running"])
  ];
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
      startedAt: generationRuns.startedAt,
      completedAt: generationRuns.completedAt
    })
    .from(generationRuns)
    .where(and(...filters))
    .orderBy(desc(generationRuns.startedAt))
    .limit(1);
  const row = rows[0];

  if (!row || (row.status !== "queued" && row.status !== "running")) {
    return null;
  }

  return generationRunStatusSummary(row) as GenerationRunStatusSummary & { status: ActiveGenerationStatus };
}

export type ProviderFailureSummary = {
  failedCount: number;
  topReason: string | null;
  topEndpoint: string | null;
  startedAt: Date | null;
};

export type StoredSource = {
  id: string;
  url: string;
  title: string;
  sourceType: SourceType;
  fetchedAt: string;
  rawText: string;
};

export type SourceSummary = Omit<StoredSource, "rawText"> & {
  domain: string;
  snippet: string;
};

export type ResearchRunEvent = {
  id: string;
  runId: string;
  slug: string;
  domain: string;
  sectionId: ResearchSectionId | null;
  type: string;
  message: string;
  metadata: Record<string, unknown>;
  createdAt: string;
};

type ResearchRunEventRow = {
  id: string;
  runId: string;
  slug: string;
  domain: string;
  sectionId?: string | null;
  type: string;
  message: string;
  metadata: unknown;
  createdAt: Date;
};

export async function findSourcesBySlug(db: ColdStartDb, slug: string): Promise<StoredSource[]> {
  const rows = await db
    .select({
      id: sources.id,
      url: sources.url,
      title: sources.title,
      sourceType: sources.sourceType,
      fetchedAt: sources.fetchedAt,
      rawText: sources.rawText
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
    rawText: row.rawText
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
      rawText: sources.rawText
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
    snippet: compactSnippet(row.rawText)
  }));
}

function researchRunEventFromRow(row: ResearchRunEventRow): ResearchRunEvent {
  return {
    id: row.id,
    runId: row.runId,
    slug: row.slug,
    domain: row.domain,
    sectionId: row.sectionId ? researchSectionIdSchema.parse(row.sectionId) : null,
    type: row.type,
    message: row.message,
    metadata: row.metadata && typeof row.metadata === "object" && !Array.isArray(row.metadata)
      ? row.metadata as Record<string, unknown>
      : {},
    createdAt: row.createdAt.toISOString()
  };
}

export async function recordResearchRunEvent(
  db: ColdStartDb,
  input: {
    runId: string;
    slug: string;
    domain: string;
    sectionId?: ResearchSectionId | null;
    type: string;
    message: string;
    metadata?: Record<string, unknown>;
  }
): Promise<ResearchRunEvent | null> {
  const [row] = await db
    .insert(researchRunEvents)
    .values({
      runId: input.runId,
      slug: input.slug,
      domain: input.domain,
      sectionId: input.sectionId ?? null,
      type: input.type,
      message: input.message,
      metadata: input.metadata ?? {}
    })
    .returning();

  return row ? researchRunEventFromRow(row) : null;
}

export async function findResearchRunEventsBySlug(
  db: ColdStartDb,
  slug: string,
  options: { limit?: number } = {}
): Promise<ResearchRunEvent[]> {
  const rows = await db
    .select({
      id: researchRunEvents.id,
      runId: researchRunEvents.runId,
      slug: researchRunEvents.slug,
      domain: researchRunEvents.domain,
      sectionId: researchRunEvents.sectionId,
      type: researchRunEvents.type,
      message: researchRunEvents.message,
      metadata: researchRunEvents.metadata,
      createdAt: researchRunEvents.createdAt
    })
    .from(researchRunEvents)
    .where(eq(researchRunEvents.slug, slug))
    .orderBy(desc(researchRunEvents.createdAt))
    .limit(options.limit ?? 30);

  return rows.map(researchRunEventFromRow);
}

export async function findResearchRunEventsByRunId(
  db: ColdStartDb,
  runId: string,
  options: { limit?: number } = {}
): Promise<ResearchRunEvent[]> {
  const rows = await db
    .select({
      id: researchRunEvents.id,
      runId: researchRunEvents.runId,
      slug: researchRunEvents.slug,
      domain: researchRunEvents.domain,
      sectionId: researchRunEvents.sectionId,
      type: researchRunEvents.type,
      message: researchRunEvents.message,
      metadata: researchRunEvents.metadata,
      createdAt: researchRunEvents.createdAt
    })
    .from(researchRunEvents)
    .where(eq(researchRunEvents.runId, runId))
    .orderBy(desc(researchRunEvents.createdAt))
    .limit(options.limit ?? 12);

  return rows.map(researchRunEventFromRow);
}

// Pulls the latest generation_runs row for a slug, extracts a one-line summary of provider
// failures from its trace_json. Used by the card routes to surface failure context as response
// headers so extensions and curl callers can tell apart "thin card because no data exists" from
// "thin card because 25 of 26 enrichment lanes failed."
export async function latestProviderFailureSummary(
  db: ColdStartDb,
  slug: string
): Promise<ProviderFailureSummary> {
  const rows = await db
    .select({
      traceJson: generationRuns.traceJson,
      startedAt: generationRuns.startedAt
    })
    .from(generationRuns)
    .where(and(eq(generationRuns.slug, slug), inArray(generationRuns.jobKind, ["basics", "analysis"])))
    .orderBy(desc(generationRuns.startedAt))
    .limit(1);

  const row = rows[0];
  if (!row || !row.traceJson) {
    return { failedCount: 0, topReason: null, topEndpoint: null, startedAt: row?.startedAt ?? null };
  }

  const trace = safeParseTraceJson(row.traceJson, slug);
  const endpoints = (trace as { providers?: { stableenrich?: { endpoints?: Array<{ name: string; status: string; error?: string }> } } })?.providers?.stableenrich?.endpoints ?? [];
  const failed = endpoints.filter((endpoint) => endpoint.status === "failed");

  if (failed.length === 0) {
    return { failedCount: 0, topReason: null, topEndpoint: null, startedAt: row.startedAt };
  }

  const byName = new Map<string, number>();
  const reasons = new Map<string, number>();
  for (const endpoint of failed) {
    byName.set(endpoint.name, (byName.get(endpoint.name) ?? 0) + 1);
    const reason = categorizeProviderError(endpoint.error);
    reasons.set(reason, (reasons.get(reason) ?? 0) + 1);
  }

  const topEndpoint = [...byName.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
  const topReason = [...reasons.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;

  return {
    failedCount: failed.length,
    topReason,
    topEndpoint,
    startedAt: row.startedAt
  };
}

function categorizeProviderError(error: string | undefined): string {
  if (!error) return "unknown";
  if (/insufficient[_\s]balance/i.test(error) || /agentcash.*deposit/i.test(error)) return "insufficient_balance";
  if (/timed?[\s_-]?out|timeout/i.test(error)) return "timeout";
  if (/\b(4\d\d|unauthor|forbidden)\b/i.test(error)) return "auth_or_4xx";
  if (/\b5\d\d\b|server error|bad gateway/i.test(error)) return "upstream_5xx";
  if (/network|ENOTFOUND|ECONNRESET|ECONNREFUSED/i.test(error)) return "network";
  return "other";
}

export async function findLatestGenerationRunBySlug(
  db: ColdStartDb,
  slug: string,
  mode: GenerationMode,
  jobKind?: GenerationJobKind
): Promise<GenerationRunSummary | null> {
  const lookupJobKind = jobKind ?? mode;
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
    .where(and(eq(generationRuns.slug, slug), eq(generationRuns.mode, mode), eq(generationRuns.jobKind, lookupJobKind)))
    .orderBy(desc(generationRuns.startedAt))
    .limit(1);
  const row = rows[0];

  return row ? generationRunSummary(row) : null;
}

export async function findLatestGenerationRunStatusBySlug(
  db: ColdStartDb,
  slug: string,
  mode: GenerationMode,
  jobKind?: GenerationJobKind
): Promise<GenerationRunStatusSummary | null> {
  const lookupJobKind = jobKind ?? mode;
  const filters = [
    eq(generationRuns.slug, slug),
    eq(generationRuns.mode, mode),
    eq(generationRuns.jobKind, lookupJobKind)
  ];
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
      startedAt: generationRuns.startedAt,
      completedAt: generationRuns.completedAt
    })
    .from(generationRuns)
    .where(and(...filters))
    .orderBy(desc(generationRuns.startedAt))
    .limit(1);
  const row = rows[0];

  return row ? generationRunStatusSummary(row) : null;
}

export async function retireStaleGenerationRuns(
  db: ColdStartDb,
  input: {
    slug: string;
    mode: GenerationMode;
    jobKind?: GenerationJobKind;
    now?: Date;
    staleAfterMs?: number;
  }
) {
  const { mode } = input;
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
        ...(input.jobKind ? [eq(generationRuns.jobKind, input.jobKind)] : []),
        inArray(generationRuns.status, ["queued", "running"]),
        lt(generationRuns.startedAt, cutoff)
      )
    )
    .returning();

  return retired.length;
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

export async function recordCardEvidence(db: ColdStartDb, cardId: string, card: ColdStartCard) {
  const publicOnly = publicCard(card);
  const publicClaims: PublicClaim[] = [
    { path: "identity.name", fact: publicOnly.identity.name },
    ...(publicOnly.identity.websiteUrl ? [{ path: "identity.websiteUrl", fact: publicOnly.identity.websiteUrl }] : []),
    ...(publicOnly.identity.linkedinUrl ? [{ path: "identity.linkedinUrl", fact: publicOnly.identity.linkedinUrl }] : []),
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
  const claimValues = publicClaims.map(({ path, fact }) => ({
    cardId,
    path,
    visibility: "public" as const,
    status: fact.status,
    confidence: fact.confidence,
    valueJson: fact.value,
    citationKeys: fact.citationIds
  }));
  const citationValues = publicOnly.citations.map((citation) => ({
    cardId,
    citationKey: citation.id,
    url: citation.url,
    title: citation.title,
    sourceType: citation.sourceType,
    ...(citation.snippet !== undefined ? { snippet: citation.snippet } : {}),
    fetchedAt: new Date(citation.fetchedAt)
  }));

  function buildWrites(adapter: ColdStartDb) {
    return [
      adapter.delete(citations).where(eq(citations.cardId, cardId)),
      adapter.delete(claims).where(eq(claims.cardId, cardId)),
      ...(citationValues.length > 0 ? [adapter.insert(citations).values(citationValues)] : []),
      adapter.insert(claims).values(claimValues)
    ];
  }

  if ("batch" in db && typeof db.batch === "function") {
    await db.batch(buildWrites(db) as never);
    return;
  }

  if ("transaction" in db && typeof db.transaction === "function") {
    await db.transaction(async (tx) => {
      for (const write of buildWrites(tx as unknown as ColdStartDb)) {
        await write;
      }
    });
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
    mode: GenerationMode;
    jobKind: GenerationJobKind;
    status: GenerationStatus;
    error?: string;
    costUsd?: number;
    traceJson?: GenerationTrace;
    inngestEventId?: string;
    inngestRunId?: string;
  }
) {
  const { mode, jobKind } = input;
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
      .where(and(eq(generationRuns.slug, input.slug), eq(generationRuns.mode, mode), eq(generationRuns.jobKind, jobKind), inArray(generationRuns.status, ["queued", "running"])))
      .returning();

    if (updated) {
      return updated;
    }
  }

  if (input.status === "running") {
    const [updated] = await db
      .update(generationRuns)
      .set(values)
      .where(and(eq(generationRuns.slug, input.slug), eq(generationRuns.mode, mode), eq(generationRuns.jobKind, jobKind), eq(generationRuns.status, "queued")))
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

export async function updateGenerationRunTrace(
  db: ColdStartDb,
  input: {
    id: string;
    patch: (trace: GenerationTrace | null) => GenerationTrace;
  }
) {
  const [existing] = await db
    .select({
      slug: generationRuns.slug,
      traceJson: generationRuns.traceJson
    })
    .from(generationRuns)
    .where(eq(generationRuns.id, input.id))
    .limit(1);

  if (!existing) {
    return null;
  }

  const traceJson = input.patch(safeParseTraceJson(existing.traceJson, existing.slug));
  const [row] = await db
    .update(generationRuns)
    .set({ traceJson })
    .where(eq(generationRuns.id, input.id))
    .returning();

  return row ?? null;
}

function safeParseTraceJson(value: unknown, slug: string): GenerationTrace | null {
  if (value === null || value === undefined) {
    return null;
  }

  const parsed = generationTraceSchema.safeParse(value);
  if (parsed.success) {
    return parsed.data as GenerationTrace;
  }

  console.warn("[repository] dropping corrupt traceJson", {
    slug,
    issues: parsed.error.issues.slice(0, 3).map((issue) => ({
      path: issue.path.join("."),
      code: issue.code,
      message: issue.message
    }))
  });
  return null;
}

function generationRunSummary(row: GenerationRunResultRow): GenerationRunSummary {
  return {
    ...(row.id !== undefined ? { id: row.id } : {}),
    slug: row.slug,
    domain: row.domain,
    mode: row.mode,
    jobKind: row.jobKind,
    status: row.status,
    ...(row.error !== undefined ? { error: row.error } : {}),
    ...(row.costUsd !== undefined ? { costUsd: row.costUsd } : {}),
    ...(row.traceJson !== undefined ? { traceJson: safeParseTraceJson(row.traceJson, row.slug) } : {}),
    ...(row.inngestEventId !== undefined ? { inngestEventId: row.inngestEventId } : {}),
    ...(row.inngestRunId !== undefined ? { inngestRunId: row.inngestRunId } : {}),
    ...(row.startedAt !== undefined ? { startedAt: row.startedAt } : {}),
    ...(row.completedAt !== undefined ? { completedAt: row.completedAt } : {})
  };
}

function generationRunStatusSummary(row: GenerationRunStatusResultRow): GenerationRunStatusSummary {
  return {
    ...(row.id !== undefined ? { id: row.id } : {}),
    slug: row.slug,
    domain: row.domain,
    mode: row.mode,
    jobKind: row.jobKind,
    status: row.status,
    ...(row.error !== undefined ? { error: row.error } : {}),
    ...(row.costUsd !== undefined ? { costUsd: row.costUsd } : {}),
    ...(row.startedAt !== undefined ? { startedAt: row.startedAt } : {}),
    ...(row.completedAt !== undefined ? { completedAt: row.completedAt } : {})
  };
}
