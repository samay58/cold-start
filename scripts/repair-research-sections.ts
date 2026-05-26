import { coldStartCardSchema, mergeStoredResearchSectionsWithLegacy, researchSectionCitationIssues, researchSectionHasReaderFacingEvidence, type ColdStartCard, type ResearchSection } from "@cold-start/core";
import { cards, createDb, researchSections } from "@cold-start/db";

type Finding = {
  slug: string;
  domain: string;
  sectionId: string;
  action: "insert_missing" | "mark_empty" | "keep";
  reason: string;
};

function applyMode() {
  return process.argv.includes("--apply");
}

function hasVendorOnlyEvidence(card: ColdStartCard, section: ResearchSection) {
  return section.status === "available" && !researchSectionHasReaderFacingEvidence(card, section);
}

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is required");
  }

  const db = createDb(databaseUrl);
  const cardRows = await db.select({ cardJson: cards.cardJson }).from(cards);
  const sectionRows = await db
    .select({
      slug: researchSections.slug,
      domain: researchSections.domain,
      sectionId: researchSections.sectionId,
      visibility: researchSections.visibility,
      status: researchSections.status,
      content: researchSections.contentJson,
      citationIds: researchSections.citationIds,
      sourceIds: researchSections.sourceIds,
      runId: researchSections.runId,
      error: researchSections.error,
      generatedAt: researchSections.generatedAt,
      staleAt: researchSections.staleAt
    })
    .from(researchSections);
  const sectionsBySlug = new Map<string, ResearchSection[]>();

  for (const row of sectionRows) {
    const section = {
      slug: row.slug,
      domain: row.domain,
      sectionId: row.sectionId,
      visibility: row.visibility,
      status: row.status,
      content: row.content ?? null,
      citationIds: Array.isArray(row.citationIds) ? row.citationIds : [],
      sourceIds: Array.isArray(row.sourceIds) ? row.sourceIds : [],
      runId: row.runId ?? null,
      error: row.error ?? null,
      generatedAt: row.generatedAt ? row.generatedAt.toISOString() : null,
      staleAt: row.staleAt ? row.staleAt.toISOString() : null
    } as ResearchSection;
    sectionsBySlug.set(section.slug, [...(sectionsBySlug.get(section.slug) ?? []), section]);
  }

  const findings: Finding[] = [];
  const writes: ResearchSection[] = [];

  for (const row of cardRows) {
    const parsed = coldStartCardSchema.safeParse(row.cardJson);
    if (!parsed.success) {
      continue;
    }

    const card = parsed.data;
    const storedSections = sectionsBySlug.get(card.slug) ?? [];
    const merged = mergeStoredResearchSectionsWithLegacy({ card, storedSections });

    for (const section of merged) {
      const hadStored = storedSections.some((stored) => stored.sectionId === section.sectionId);
      const citationIssues = researchSectionCitationIssues(card, section);
      const shouldEmpty = hasVendorOnlyEvidence(card, section) || citationIssues.length > 0;

      if (!hadStored) {
        findings.push({
          slug: card.slug,
          domain: card.domain,
          sectionId: section.sectionId,
          action: "insert_missing",
          reason: "section row missing"
        });
        writes.push(section);
        continue;
      }

      if (shouldEmpty) {
        findings.push({
          slug: card.slug,
          domain: card.domain,
          sectionId: section.sectionId,
          action: "mark_empty",
          reason: citationIssues[0] ?? "available section has only enrichment citations"
        });
        writes.push({
          ...section,
          status: "empty",
          content: { status: "empty", summary: null, items: [], questions: [], confidence: "low" },
          citationIds: [],
          sourceIds: [],
          error: null,
          staleAt: null
        });
      }
    }
  }

  if (applyMode()) {
    for (const section of writes) {
      await db
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
          staleAt: section.staleAt ? new Date(section.staleAt) : null
        })
        .onConflictDoUpdate({
          target: [researchSections.slug, researchSections.sectionId],
          set: {
            status: section.status,
            contentJson: section.content,
            citationIds: section.citationIds,
            sourceIds: section.sourceIds,
            error: section.error,
            staleAt: section.staleAt ? new Date(section.staleAt) : null,
            updatedAt: new Date()
          }
        });
    }
  }

  console.log(JSON.stringify({
    mode: applyMode() ? "apply" : "dry-run",
    cardsScanned: cardRows.length,
    findings: findings.length,
    writes: writes.length,
    sample: findings.slice(0, 25)
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
