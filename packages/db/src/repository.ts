import { and, desc, eq, inArray, lt } from "drizzle-orm";

import {
  coldStartCardObjectSchema,
  coldStartCardSchema,
  generationTraceSchema,
  publicCard,
  type ColdStartCard,
  type GenerationJobKind,
  type GenerationTrace,
  type ResolvedFact
} from "@cold-start/core";

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
const publicCardSchema = coldStartCardObjectSchema.omit({ synthesis: true });
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

export type GenerationRunStatusSummary = Omit<GenerationRunSummary, "traceJson" | "inngestEventId" | "inngestRunId">;

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

type GenerationRunStatusResultRow = Omit<GenerationRunResultRow, "traceJson" | "inngestEventId" | "inngestRunId">;
type CardCacheMode = GenerationMode;
type CardCacheOptions = {
  mode?: CardCacheMode | undefined;
  now?: Date | undefined;
};
type CardCacheRow = {
  cardJson: unknown;
  publicCardJson?: unknown;
  identityExpiresAt: Date;
  signalsExpiresAt: Date;
  synthesisExpiresAt: Date;
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

  if (!isFreshCacheRow(row, options)) {
    return null;
  }

  return coldStartCardSchema.parse(row.cardJson);
}

export async function findPublicCardBySlug(db: ColdStartDb, slug: string, options: CardCacheOptions = { mode: "basics" }): Promise<Omit<ColdStartCard, "synthesis"> | null> {
  const rows = await db
    .select({
      cardJson: cards.cardJson,
      publicCardJson: cards.publicCardJson,
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

  if (!isFreshCacheRow(row, { mode: options.mode ?? "basics", now: options.now })) {
    return null;
  }

  return publicCardSchema.parse(publicCard(coldStartCardSchema.parse(row.cardJson)));
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

export async function findActiveGenerationRunStatusBySlug(
  db: ColdStartDb,
  slug: string,
  mode: GenerationMode = "analysis"
): Promise<(GenerationRunStatusSummary & { status: ActiveGenerationStatus }) | null> {
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
    .where(and(eq(generationRuns.slug, slug), eq(generationRuns.mode, mode), inArray(generationRuns.status, ["queued", "running"])))
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
    .where(eq(generationRuns.slug, slug))
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

export async function findLatestGenerationRunStatusBySlug(
  db: ColdStartDb,
  slug: string,
  mode: GenerationMode = "analysis"
): Promise<GenerationRunStatusSummary | null> {
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
    .where(and(eq(generationRuns.slug, slug), eq(generationRuns.mode, mode)))
    .orderBy(desc(generationRuns.startedAt))
    .limit(1);
  const row = rows[0];

  return row ? generationRunStatusSummary(row) : null;
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
    ...(row.jobKind !== undefined ? { jobKind: row.jobKind } : {}),
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
    ...(row.jobKind !== undefined ? { jobKind: row.jobKind } : {}),
    status: row.status,
    ...(row.error !== undefined ? { error: row.error } : {}),
    ...(row.costUsd !== undefined ? { costUsd: row.costUsd } : {}),
    ...(row.startedAt !== undefined ? { startedAt: row.startedAt } : {}),
    ...(row.completedAt !== undefined ? { completedAt: row.completedAt } : {})
  };
}
