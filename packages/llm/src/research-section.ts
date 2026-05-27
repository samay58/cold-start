import type Anthropic from "@anthropic-ai/sdk";
import type { Tool } from "@anthropic-ai/sdk/resources/messages";
import {
  researchSectionContentSchema,
  type Citation,
  type GenerationLlmCallTrace,
  type ResearchSectionContent,
  type ResearchSectionDefinition
} from "@cold-start/core";
import { z } from "zod";
import { anthropicSystemCacheControl, createTracedAnthropicMessage, type AnthropicTelemetrySink } from "./anthropic";
import {
  budgetEvidenceSources,
  compactEvidenceText,
  defaultExtractionEvidenceBudgetChars,
  evidenceBudgetCharsFromEnv
} from "./evidence-budget";
import { investorTasteKernel } from "./investor-taste-kernel";

const TOOL_NAME = "emit_research_section";
const maxEvidenceItems = 18;
const maxEvidenceTextLength = 1400;
const researchEvidenceBudgetChars = evidenceBudgetCharsFromEnv(
  process.env.EXTRACTION_EVIDENCE_BUDGET_CHARS,
  defaultExtractionEvidenceBudgetChars
);

type EvidenceSource = {
  citationId: string;
  url: string;
  title: string;
  sourceType: Citation["sourceType"];
  intent?: string | null;
  text: string;
};

export type ResearchSectionSynthesisInput = {
  client: Anthropic;
  definition: ResearchSectionDefinition;
  evidence: EvidenceSource[];
  model: string;
  company: {
    domain: string;
    name: string;
  };
  telemetry?: AnthropicTelemetrySink;
};

const nonEmptyStringSchema = { type: "string", minLength: 1 } as const;
const citationIdsSchema = { type: "array", items: nonEmptyStringSchema } as const;

const sectionTool = {
  name: TOOL_NAME,
  description: "Emit one Cold Start research section using only supplied evidence.",
  input_schema: {
    type: "object",
    additionalProperties: false,
    properties: {
      status: { type: "string", enum: ["available", "empty"] },
      summary: { anyOf: [nonEmptyStringSchema, { type: "null" }] },
      items: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            label: nonEmptyStringSchema,
            text: nonEmptyStringSchema,
            citationIds: citationIdsSchema,
            meta: nonEmptyStringSchema
          },
          required: ["label", "text", "citationIds"]
        }
      },
      questions: { type: "array", items: nonEmptyStringSchema },
      confidence: { type: "string", enum: ["high", "medium", "low"] },
      competitorCountHighQuality: { type: "integer", minimum: 0 },
      crowdedness: { type: "string", enum: ["sparse", "moderate", "crowded", "brutally_crowded"] },
      napkinMath: {
        anyOf: [
          {
            type: "object",
            additionalProperties: false,
            properties: {
              formula: nonEmptyStringSchema,
              buyers: {
                type: "object",
                additionalProperties: false,
                properties: {
                  value: nonEmptyStringSchema,
                  basis: nonEmptyStringSchema,
                  citationIds: citationIdsSchema
                },
                required: ["value", "basis", "citationIds"]
              },
              annualSpend: {
                type: "object",
                additionalProperties: false,
                properties: {
                  value: nonEmptyStringSchema,
                  basis: nonEmptyStringSchema,
                  citationIds: citationIdsSchema
                },
                required: ["value", "basis", "citationIds"]
              },
              marketSize: {
                type: "object",
                additionalProperties: false,
                properties: {
                  value: nonEmptyStringSchema,
                  confidence: { type: "string", enum: ["high", "medium", "low"] }
                },
                required: ["value", "confidence"]
              },
              plainEnglish: nonEmptyStringSchema
            },
            required: ["formula", "buyers", "annualSpend", "marketSize", "plainEnglish"]
          },
          { type: "null" }
        ]
      },
      topDownCrossCheck: { anyOf: [nonEmptyStringSchema, { type: "null" }] }
    },
    required: ["status", "summary", "items", "questions", "confidence"]
  }
} satisfies Tool;

const toolUseSchema = z.object({
  type: z.string(),
  name: z.string().optional(),
  input: z.unknown().optional()
});

function truncate(value: string, maxLength: number) {
  return compactEvidenceText(value, maxLength);
}

export function evidenceForResearchSectionPrompt(evidence: EvidenceSource[]) {
  return budgetEvidenceSources({
    sources: evidence,
    itemLimit: maxEvidenceItems,
    textLimit: maxEvidenceTextLength,
    budgetChars: researchEvidenceBudgetChars,
    getText: (source) => source.text,
    withText: (source, text) => ({
      citationId: source.citationId,
      title: source.title,
      url: source.url,
      sourceType: source.sourceType,
      ...(source.intent ? { intent: source.intent } : {}),
      text: truncate(text, maxEvidenceTextLength)
    })
  });
}

function parseToolInput(message: { content: unknown[] }): ResearchSectionContent {
  const blocks = z.array(toolUseSchema).parse(message.content);
  const toolUse = blocks.find((block) => block.type === "tool_use" && block.name === TOOL_NAME);
  if (!toolUse || toolUse.input === undefined) {
    throw new Error("No research section tool use returned");
  }

  return researchSectionContentSchema.parse(toolUse.input);
}

export async function synthesizeResearchSection(input: ResearchSectionSynthesisInput): Promise<ResearchSectionContent> {
  const system = [
    investorTasteKernel,
    "You write one saved Cold Start research section.",
    "Use only the evidence JSON supplied by the user.",
    "Use citationIds exactly as provided. Do not invent citationIds.",
    "If evidence is too weak, return status empty, summary null, no items, no questions, and confidence low.",
    "Prefer fewer strong points over complete-looking filler."
  ].join("\n");

  const message = await createTracedAnthropicMessage({
    client: input.client,
    label: `research-section:${input.definition.id}`,
    model: input.model,
    stage: "synthesis",
    telemetry: input.telemetry,
    params: {
      model: input.model,
      max_tokens: 1800,
      temperature: 0,
      system: [{ type: "text", text: system, cache_control: anthropicSystemCacheControl() }],
      tool_choice: { type: "tool", name: TOOL_NAME },
      tools: [sectionTool],
      messages: [
        {
          role: "user",
          content: [
            `Company: ${input.company.name} (${input.company.domain})`,
            `Section: ${input.definition.title}`,
            input.definition.generationPrompt,
            "Evidence JSON:",
            JSON.stringify(evidenceForResearchSectionPrompt(input.evidence), null, 2)
          ].join("\n\n")
        }
      ]
    }
  });

  return parseToolInput(message);
}

export type ResearchSectionEvidenceSource = EvidenceSource;
export type ResearchSectionLlmCallTrace = GenerationLlmCallTrace;
