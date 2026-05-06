import type Anthropic from "@anthropic-ai/sdk";
import type { Message, Tool } from "@anthropic-ai/sdk/resources/messages";
import { coldStartCardSchema } from "@cold-start/core";
import { z } from "zod";

const EXTRACTION_TOOL_NAME = "emit_company_claims";

const resolvedFactSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    value: {},
    status: { type: "string", enum: ["verified", "mixed", "inferred", "unknown"] },
    confidence: { type: "string", enum: ["high", "medium", "low"] },
    citationIds: { type: "array", items: { type: "string" } }
  },
  required: ["value", "status", "confidence", "citationIds"]
} as const;

const citationSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    id: { type: "string" },
    url: { type: "string" },
    title: { type: "string" },
    fetchedAt: { type: "string" },
    sourceType: {
      type: "string",
      enum: ["company_site", "news", "filing", "enrichment", "github", "rdap", "other"]
    },
    snippet: { type: "string" }
  },
  required: ["id", "url", "title", "fetchedAt", "sourceType"]
} as const;

const identitySchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    name: resolvedFactSchema,
    logoUrl: { type: ["string", "null"] },
    oneLiner: resolvedFactSchema,
    hq: resolvedFactSchema,
    foundedYear: resolvedFactSchema,
    status: { type: "string", enum: ["private", "public", "acquired", "shutdown"] }
  },
  required: ["name", "logoUrl", "oneLiner", "hq", "foundedYear", "status"]
} as const;

const fundingSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    totalRaisedUsd: resolvedFactSchema,
    lastRound: resolvedFactSchema,
    investors: resolvedFactSchema
  },
  required: ["totalRaisedUsd", "lastRound", "investors"]
} as const;

const teamSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    founders: resolvedFactSchema,
    keyExecs: resolvedFactSchema,
    headcount: resolvedFactSchema
  },
  required: ["founders", "keyExecs", "headcount"]
} as const;

const signalSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    title: { type: "string" },
    url: { type: "string" },
    date: { type: "string" },
    source: { type: "string" },
    category: { type: "string", enum: ["news", "hiring", "launch", "funding", "filing", "github", "other"] },
    citationIds: { type: "array", items: { type: "string" } }
  },
  required: ["title", "url", "date", "source", "category", "citationIds"]
} as const;

const comparableSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    name: { type: "string" },
    domain: { type: "string" },
    oneLiner: { type: "string" }
  },
  required: ["name", "domain", "oneLiner"]
} as const;

export type ExtractionEvidence = {
  domain: string;
  sources: Array<{ url: string; title: string; rawText: string; sourceType: string }>;
};

export const extractedCardSectionsSchema = coldStartCardSchema.pick({
  identity: true,
  funding: true,
  team: true,
  signals: true,
  comparables: true,
  citations: true
});

export type ExtractedCardSections = z.infer<typeof extractedCardSectionsSchema>;

export const extractionTool = {
  name: EXTRACTION_TOOL_NAME,
  description: "Emit only company claims supported by the provided public sources.",
  input_schema: {
    type: "object",
    additionalProperties: false,
    properties: {
      identity: identitySchema,
      funding: fundingSchema,
      team: teamSchema,
      signals: { type: "array", items: signalSchema },
      comparables: { type: "array", items: comparableSchema },
      citations: { type: "array", items: citationSchema }
    },
    required: ["identity", "funding", "team", "signals", "comparables", "citations"]
  }
} satisfies Tool;

type ToolUseLike = {
  type: string;
  name?: string;
  input?: unknown;
  id?: string;
  text?: string;
};

export function parseExtractionToolUse(message: { content: ToolUseLike[] }) {
  const toolUse = message.content.find((block) => block.type === "tool_use" && block.name === EXTRACTION_TOOL_NAME);
  if (!toolUse) {
    throw new Error("No emit_company_claims tool use returned");
  }

  if (toolUse.input === undefined) {
    throw new Error("emit_company_claims tool use returned no input");
  }

  return extractedCardSectionsSchema.parse(toolUse.input);
}

export async function extractCompanyClaims(input: {
  client: Anthropic;
  model: string;
  evidence: ExtractionEvidence;
}) {
  const response: Message = await input.client.messages.create({
    model: input.model,
    max_tokens: 4000,
    system: [
      {
        type: "text",
        text: "You extract investor-grade public company facts. Drop unsupported claims. Every material fact must map to a citation ID. Use null for missing facts.",
        cache_control: { type: "ephemeral" }
      }
    ],
    messages: [
      {
        role: "user",
        content: [
          {
            type: "text",
            text: JSON.stringify(input.evidence)
          }
        ]
      }
    ],
    tools: [extractionTool],
    tool_choice: { type: "tool", name: EXTRACTION_TOOL_NAME }
  });

  return parseExtractionToolUse(response);
}
