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
