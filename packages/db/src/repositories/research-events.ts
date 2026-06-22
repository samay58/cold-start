import { desc, eq } from "drizzle-orm";

import { researchSectionIdSchema, type ResearchSectionId } from "@cold-start/core";

import type { ColdStartDb } from "../client";
import { researchRunEvents } from "../schema";

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

// Fail soft on a stored sectionId that no longer parses (taxonomy drift) rather than throwing and
// failing the whole events query, matching the generation-trace read path.
function researchRunEventFromRow(row: ResearchRunEventRow): ResearchRunEvent | null {
  let sectionId: ResearchSectionId | null = null;
  if (row.sectionId) {
    const parsed = researchSectionIdSchema.safeParse(row.sectionId);
    if (!parsed.success) {
      console.warn("[repository] dropping research event with corrupt sectionId", { slug: row.slug, sectionId: row.sectionId });
      return null;
    }
    sectionId = parsed.data;
  }

  return {
    id: row.id,
    runId: row.runId,
    slug: row.slug,
    domain: row.domain,
    sectionId,
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

  return rows.flatMap((row) => researchRunEventFromRow(row) ?? []);
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

  return rows.flatMap((row) => researchRunEventFromRow(row) ?? []);
}
