import {
  emptyResearchSectionForCard,
  hasUsablePublicProfile,
  RESEARCH_SECTION_DEFINITIONS_BY_ID,
  researchSectionCitationIssues,
  researchSectionHasReaderFacingEvidence,
  type ColdStartCard,
  type GenerationTrace,
  type ResearchSection,
  type ResearchSectionId
} from "@cold-start/core";
import { findCardBySlug, findSourcesBySlug, markGenerationRun, upsertResearchSection, type ColdStartDb } from "@cold-start/db";
import {
  createAnthropicClient,
  isTransientLlmError,
  synthesizeResearchSection,
  type ResearchSectionEvidenceSource
} from "@cold-start/llm";
import { boundedErrorMessage } from "../lib/errors";
import type { GenerationStepTools } from "./client";
import {
  createStepLlmTelemetryCollector,
  generationRunAnthropicCostUsd,
  timed,
  type GenerationMode
} from "./generation-helpers";
import { completedStep, mergeTracePatch } from "./generation-trace";

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

async function generateStoredResearchSection(input: {
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

type GenerateStepTools = GenerationStepTools;

// The section-job path of the generate-card function. Step ids ("generate-section",
// "upsert-generated-section", "mark-section-generation-complete") and event names are frozen:
// Inngest memoizes by step id, so changing them would disrupt runs in flight during a deploy.
export async function runResearchSectionJobStep(input: {
  db: ColdStartDb;
  step: GenerateStepTools;
  slug: string;
  domain: string;
  mode: GenerationMode;
  jobKind: GenerationTrace["jobKind"];
  sectionId: ResearchSectionId;
  generationRunDbId: string | null;
  client: ReturnType<typeof createAnthropicClient>;
  model: string;
  trace: GenerationTrace;
  recordEvent: (
    name: string,
    type: string,
    message: string,
    metadata: Record<string, unknown>,
    sectionId: ResearchSectionId | null
  ) => Promise<unknown>;
}): Promise<{ slug: string; mode: GenerationMode; sectionId: ResearchSectionId }> {
  const { db, step, slug, domain, mode, jobKind, sectionId, generationRunDbId, client, model, trace, recordEvent } = input;
  const sectionResult = await step.run("generate-section", async () => {
    const llmTelemetry = createStepLlmTelemetryCollector();
    const result = await timed(async () => {
      try {
        const section = await generateStoredResearchSection({
          db,
          slug,
          domain,
          sectionId,
          runId: generationRunDbId,
          client,
          model,
          telemetry: llmTelemetry.telemetry
        });

        return {
          ok: true as const,
          value: section
        };
      } catch (error) {
        // Same split as the synthesize/verify step bodies in generation-helpers.ts: a transient
        // transport failure re-throws so Inngest re-executes the step on retry instead of
        // memoizing a permanent {ok:false} for what may be a passing outage.
        if (isTransientLlmError(error)) {
          throw error;
        }
        return {
          ok: false as const,
          error: boundedErrorMessage(error)
        };
      }
    });
    const llmTracePatch = llmTelemetry.tracePatch();

    return {
      value: result.value,
      tracePatch: {
        ...llmTracePatch,
        steps: {
          "generate-section": result.value.ok
            ? completedStep(result.durationMs)
            : { status: "failed" as const, durationMs: result.durationMs, message: result.value.error }
        }
      }
    };
  });
  mergeTracePatch(trace, sectionResult.tracePatch);
  // The `"ok" in ...` guard is not dead code: Inngest replays a memoized step result across
  // deploys, so a run started on an older build can return `value` as the raw section instead
  // of today's `{ ok, value }` envelope. Handle both shapes (see the replayed-step-result test).
  if ("ok" in sectionResult.value && !sectionResult.value.ok) {
    throw new Error(sectionResult.value.error);
  }
  const generatedSection = "ok" in sectionResult.value
    ? sectionResult.value.value
    : sectionResult.value;

  // Tie this section pass to the section model. Only "deep" when the LLM actually ran;
  // the empty-evidence path above returns a section with no call, so it reads "derived".
  // Attribute the run's Anthropic spend (the lone LLM call here is this section) to it.
  const sectionLlmRan = (trace.llm?.calls ?? []).some((call) => call.label.startsWith("research-section:"));
  const sectionTraceStatus = generatedSection.status === "available"
    ? "available"
    : generatedSection.status === "failed"
      ? "failed"
      : "empty";
  trace.sections = [{
    sectionId: sectionId,
    provenance: sectionLlmRan ? "deep" : "derived",
    status: sectionTraceStatus,
    estimatedCostUsd: generationRunAnthropicCostUsd(trace)
  }];
  if (sectionLlmRan) {
    for (const call of trace.llm?.calls ?? []) {
      if (call.label.startsWith("research-section:")) {
        call.sectionId = sectionId;
      }
    }
  }

  await step.run("upsert-generated-section", () => upsertResearchSection(db, generatedSection));
  await recordEvent(
    "section-saved",
    generatedSection.status === "available" ? "section.available" : "section.empty",
    generatedSection.status === "available"
      ? `Saved ${RESEARCH_SECTION_DEFINITIONS_BY_ID[sectionId].title}`
      : `No strong evidence found for ${RESEARCH_SECTION_DEFINITIONS_BY_ID[sectionId].title}`,
    {
      citationCount: generatedSection.citationIds.length,
      sourceCount: generatedSection.sourceIds.length,
      status: generatedSection.status
    },
    sectionId
  );
  await step.run("mark-section-generation-complete", () =>
    markGenerationRun(db, {
      slug,
      domain,
      mode,
      jobKind,
      status: "complete",
      costUsd: generationRunAnthropicCostUsd(trace),
      traceJson: trace,
      ...(trace.inngest?.eventId ? { inngestEventId: trace.inngest.eventId } : {}),
      ...(trace.inngest?.runId ? { inngestRunId: trace.inngest.runId } : {})
    })
  );

  return { slug, mode, sectionId: sectionId };
}
