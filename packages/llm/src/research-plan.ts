import type Anthropic from "@anthropic-ai/sdk";
import type { Message, Tool } from "@anthropic-ai/sdk/resources/messages";
import { z } from "zod";
import { createTracedAnthropicMessage, type AnthropicTelemetrySink } from "./anthropic";
import { researchPlannerSystemPrompt } from "./investor-taste-kernel";

const RESEARCH_PLAN_TOOL_NAME = "emit_research_plan";

const nonEmptyStringSchema = { type: "string", minLength: 1 } as const;

const priorityQuestionSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    question: nonEmptyStringSchema,
    why: nonEmptyStringSchema,
    sourceHint: nonEmptyStringSchema,
  },
  required: ["question", "why", "sourceHint"],
} as const;

const searchQueriesSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    funding: nonEmptyStringSchema,
    companyProfile: nonEmptyStringSchema,
    managementTeam: nonEmptyStringSchema,
    recentSignals: nonEmptyStringSchema,
    comparables: nonEmptyStringSchema,
    independentAnalysis: nonEmptyStringSchema,
  },
  required: ["funding", "companyProfile", "managementTeam", "recentSignals", "comparables", "independentAnalysis"],
} as const;

const researchPlanZodSchema = z.object({
  companyArchetype: z.string().min(1),
  priorityQuestions: z.array(z.object({
    question: z.string().min(1),
    why: z.string().min(1),
    sourceHint: z.string().min(1),
  })).min(3).max(6),
  searchQueries: z.object({
    funding: z.string().min(1),
    companyProfile: z.string().min(1),
    managementTeam: z.string().min(1),
    recentSignals: z.string().min(1),
    comparables: z.string().min(1),
    independentAnalysis: z.string().min(1),
  }),
  presentationFocus: z.array(z.string().min(1)).min(2).max(5),
});

export type ResearchPlan = z.infer<typeof researchPlanZodSchema>;

export const researchPlanTool = {
  name: RESEARCH_PLAN_TOOL_NAME,
  description: "Emit a compact investor research plan for one company domain.",
  input_schema: {
    type: "object",
    additionalProperties: false,
    properties: {
      companyArchetype: nonEmptyStringSchema,
      priorityQuestions: { type: "array", minItems: 3, maxItems: 6, items: priorityQuestionSchema },
      searchQueries: searchQueriesSchema,
      presentationFocus: { type: "array", minItems: 2, maxItems: 5, items: nonEmptyStringSchema },
    },
    required: ["companyArchetype", "priorityQuestions", "searchQueries", "presentationFocus"],
  },
} satisfies Tool;

type ToolUseLike = {
  type: string;
  name?: string;
  input?: unknown;
};

export function fallbackResearchPlan(domain: string): ResearchPlan {
  return {
    companyArchetype: "private technology company",
    priorityQuestions: [
      {
        question: "What does the company actually sell, and who owns the budget?",
        why: "A precise buyer and workflow matter more than a generic category label.",
        sourceHint: "Homepage, product pages, customer pages, and independent product analysis.",
      },
      {
        question: "What public proof exists beyond company positioning?",
        why: "Adoption, customers, usage, hiring, and independent analysis separate substance from PR.",
        sourceHint: "Independent reporting, technical analysis, customer pages, hiring pages, and analyst posts.",
      },
      {
        question: "What changed in the latest financing round?",
        why: "Round cadence, lead investor quality, valuation, and use of proceeds reveal the company trajectory.",
        sourceHint: "Recent funding coverage, company announcements, investor posts, and data enrichment.",
      },
    ],
    searchQueries: {
      funding: `${domain} funding history latest round valuation investors total raised`,
      companyProfile: `${domain} product customers buyer workflow what does the company do`,
      managementTeam: `${domain} founders CEO management team leadership contact email`,
      recentSignals: `${domain} recent launch customers hiring funding product partnership traction`,
      comparables: `${domain} competitors alternatives similar companies market map`,
      independentAnalysis: `${domain} independent analysis technical deep dive Sacra Substack market map`,
    },
    presentationFocus: ["product mechanism", "source quality", "funding cadence", "public proof gaps"],
  };
}

export function parseResearchPlanToolUse(message: { content: ToolUseLike[] }): ResearchPlan {
  const toolUse = message.content.find((block) => block.type === "tool_use" && block.name === RESEARCH_PLAN_TOOL_NAME);
  if (!toolUse) {
    throw new Error("No emit_research_plan tool use returned");
  }

  if (toolUse.input === undefined) {
    throw new Error("emit_research_plan tool use returned no input");
  }

  return researchPlanZodSchema.parse(toolUse.input);
}

export async function planCompanyResearch(input: {
  client: Anthropic;
  model: string;
  domain: string;
  telemetry?: AnthropicTelemetrySink;
}): Promise<ResearchPlan> {
  const response: Message = await createTracedAnthropicMessage({
    client: input.client,
    label: "research-plan",
    model: input.model,
    stage: "research_plan",
    telemetry: input.telemetry,
    params: {
      model: input.model,
      max_tokens: 1200,
      temperature: 0,
      system: [
        {
          type: "text",
          text: researchPlannerSystemPrompt,
          cache_control: { type: "ephemeral" },
        },
      ],
      messages: [{ role: "user", content: `Domain: ${input.domain}` }],
      tools: [researchPlanTool],
      tool_choice: { type: "tool", name: RESEARCH_PLAN_TOOL_NAME },
    },
  });

  return parseResearchPlanToolUse(response);
}
