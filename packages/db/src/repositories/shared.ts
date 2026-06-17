import {
  researchSectionContentSchema,
  researchSectionIdSchema,
  researchSectionStatusSchema,
  researchSectionVisibilitySchema,
  type ResearchSection
} from "@cold-start/core";

export type ResearchSectionRow = {
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

function jsonStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string" && item.trim().length > 0) : [];
}

export function researchSectionFromRow(row: ResearchSectionRow): ResearchSection {
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
