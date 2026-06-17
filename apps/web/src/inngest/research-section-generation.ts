import {
  emptyResearchSectionForCard,
  hasUsablePublicProfile,
  RESEARCH_SECTION_DEFINITIONS_BY_ID,
  researchSectionCitationIssues,
  researchSectionHasReaderFacingEvidence,
  type ColdStartCard,
  type ResearchSection,
  type ResearchSectionId
} from "@cold-start/core";
import { findCardBySlug, findSourcesBySlug, type ColdStartDb } from "@cold-start/db";
import {
  createAnthropicClient,
  synthesizeResearchSection,
  type ResearchSectionEvidenceSource
} from "@cold-start/llm";

function normalizedUrlKey(value: string) {
  try {
    const url = new URL(value);
    url.hash = "";
    url.search = "";
    url.pathname = url.pathname.replace(/\/+$/, "") || "/";
    return url.toString().toLowerCase();
  } catch {
    return value.toLowerCase();
  }
}

function evidenceForSection(card: ColdStartCard, storedSources: Awaited<ReturnType<typeof findSourcesBySlug>>): ResearchSectionEvidenceSource[] {
  const sourcesByUrl = new Map(storedSources.map((source) => [normalizedUrlKey(source.url), source]));

  return card.citations.flatMap((citation) => {
    const source = sourcesByUrl.get(normalizedUrlKey(citation.url));
    const text = source?.rawText || citation.snippet || "";
    if (!text.trim()) {
      return [];
    }

    return [{
      citationId: citation.id,
      url: citation.url,
      title: citation.title,
      sourceType: citation.sourceType,
      text
    }];
  });
}

function citationIdsFromSectionContent(content: NonNullable<ResearchSection["content"]>) {
  return Array.from(new Set([
    ...content.items.flatMap((item) => item.citationIds),
    ...(content.napkinMath?.buyers.citationIds ?? []),
    ...(content.napkinMath?.annualSpend.citationIds ?? [])
  ]));
}

function sectionFromGeneratedContent(card: ColdStartCard, sectionId: ResearchSectionId, content: NonNullable<ResearchSection["content"]>, runId: string | null): ResearchSection {
  const definition = RESEARCH_SECTION_DEFINITIONS_BY_ID[sectionId];
  const citationIds = citationIdsFromSectionContent(content);
  const section: ResearchSection = {
    slug: card.slug,
    domain: card.domain,
    sectionId,
    visibility: definition.visibility,
    status: content.status === "available" && citationIds.length > 0 ? "available" : "empty",
    content: content.status === "available" && citationIds.length > 0 ? content : {
      status: "empty",
      summary: null,
      items: [],
      confidence: "low"
    },
    citationIds,
    sourceIds: citationIds,
    runId,
    error: null,
    generatedAt: new Date().toISOString(),
    staleAt: null
  };
  const citationIssues = researchSectionCitationIssues(card, section);
  if (citationIssues.length > 0) {
    throw new Error(citationIssues[0]);
  }

  if (section.status === "available" && !researchSectionHasReaderFacingEvidence(card, section)) {
    return generatedEmptySection(card, sectionId, runId);
  }

  return section;
}

function generatedEmptySection(card: ColdStartCard, sectionId: ResearchSectionId, runId: string | null): ResearchSection {
  return {
    ...emptyResearchSectionForCard(card, sectionId),
    runId,
    generatedAt: new Date().toISOString()
  };
}

export async function generateStoredResearchSection(input: {
  db: ColdStartDb;
  slug: string;
  domain: string;
  sectionId: ResearchSectionId;
  runId: string | null;
  client: ReturnType<typeof createAnthropicClient>;
  model: string;
  telemetry: NonNullable<Parameters<typeof synthesizeResearchSection>[0]["telemetry"]>;
}): Promise<ResearchSection> {
  const existingCardForSection = await findCardBySlug(input.db, input.slug, { allowStale: true });
  if (!existingCardForSection || !hasUsablePublicProfile(existingCardForSection)) {
    throw new Error("profile not found");
  }

  const storedSources = await findSourcesBySlug(input.db, input.slug);
  const evidence = evidenceForSection(existingCardForSection, storedSources);
  if (evidence.length === 0) {
    return generatedEmptySection(
      existingCardForSection,
      input.sectionId,
      input.runId
    );
  }

  const content = await synthesizeResearchSection({
    client: input.client,
    definition: RESEARCH_SECTION_DEFINITIONS_BY_ID[input.sectionId],
    evidence,
    model: input.model,
    company: {
      domain: input.domain,
      name: existingCardForSection.identity.name.value ?? input.domain
    },
    telemetry: input.telemetry
  });

  return sectionFromGeneratedContent(
    existingCardForSection,
    input.sectionId,
    content,
    input.runId
  );
}
