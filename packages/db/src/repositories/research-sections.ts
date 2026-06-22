import { and, eq, lt } from "drizzle-orm";

import type { ResearchSection, ResearchSectionId } from "@cold-start/core";

import type { ColdStartDb } from "../client";
import { researchSections } from "../schema";
import { researchSectionFromRow } from "./shared";

export const researchSectionRunStaleAfterMs = 15 * 60 * 1000;

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

  return rows.flatMap((row) => researchSectionFromRow(row) ?? []);
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
