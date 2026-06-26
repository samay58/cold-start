import { and, desc, eq, inArray, lt, sql } from "drizzle-orm";

import { generationTraceSchema, type GenerationJobKind, type GenerationTrace } from "@cold-start/core";

import type { ColdStartDb } from "../client";
import { generationRuns } from "../schema";

export type GenerationMode = "basics" | "analysis";
type GenerationStatus = "queued" | "running" | "complete" | "failed";
type ActiveGenerationStatus = Extract<GenerationStatus, "queued" | "running">;
export const generationRunStaleAfterMs = 15 * 60 * 1000;

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

export type ProviderFailureSummary = {
  failedCount: number;
  topReason: string | null;
  topEndpoint: string | null;
  startedAt: Date | null;
};

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
    maxAttempts?: number;
  }
) {
  // Read-modify-write of one run's trace. The basics worker and the
  // contact-enrichment worker patch the same parent run concurrently, so their
  // patches must be serialized or one clobbers the other's milestones. The
  // production Neon HTTP driver supports neither interactive transactions nor
  // `FOR UPDATE`, so we serialize with optimistic concurrency instead: guard the
  // write on the trace being unchanged since the read, and on a miss re-read and
  // re-apply the patch onto the now-current trace. A trace write is best-effort
  // observability; callers must never let it block a run's terminal status.
  const maxAttempts = Math.max(1, input.maxAttempts ?? 3);

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
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
      .where(and(eq(generationRuns.id, input.id), traceJsonUnchanged(existing.traceJson)))
      .returning();

    if (row) {
      return row;
    }
    // Guard miss: a concurrent patch landed after our read. Loop to merge onto it.
  }

  return null;
}

// SQL guard that matches only when the stored trace still equals the value we
// read. `jsonb 'null'` (a stored JSON null) is distinct from a NULL column, so
// the absent-trace case is matched explicitly rather than via a jsonb compare.
function traceJsonUnchanged(value: unknown) {
  if (value === null || value === undefined) {
    return sql`${generationRuns.traceJson} is null`;
  }

  return sql`${generationRuns.traceJson} is not distinct from ${JSON.stringify(value)}::jsonb`;
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
