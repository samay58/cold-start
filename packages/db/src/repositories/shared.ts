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

// Fail soft on stored enum/content drift instead of throwing, so one corrupt row never 500s the
// whole sections query. This mirrors the generation-trace read path, which already drops corrupt
// rows with a structured warn rather than failing the request.
export function researchSectionFromRow(row: ResearchSectionRow): ResearchSection | null {
  const sectionId = researchSectionIdSchema.safeParse(row.sectionId);
  const status = researchSectionStatusSchema.safeParse(row.status);
  const visibility = researchSectionVisibilitySchema.safeParse(row.visibility);
  const content = row.contentJson === null || row.contentJson === undefined
    ? { success: true as const, data: null }
    : researchSectionContentSchema.safeParse(row.contentJson);

  if (!sectionId.success || !status.success || !visibility.success || !content.success) {
    console.warn("[repository] dropping corrupt research section row", { slug: row.slug, sectionId: row.sectionId });
    return null;
  }

  return {
    slug: row.slug,
    domain: row.domain,
    sectionId: sectionId.data,
    visibility: visibility.data,
    status: status.data,
    content: content.data,
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
