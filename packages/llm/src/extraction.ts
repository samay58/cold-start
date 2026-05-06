import type Anthropic from "@anthropic-ai/sdk";
import type { Message, Tool } from "@anthropic-ai/sdk/resources/messages";
import { coldStartCardSchema } from "@cold-start/core";
import { z } from "zod";

const EXTRACTION_TOOL_NAME = "emit_company_claims";

const nonEmptyStringSchema = { type: "string", minLength: 1 } as const;

const urlStringSchema = { type: "string", minLength: 1, format: "uri" } as const;

const nullableNonEmptyStringSchema = { anyOf: [nonEmptyStringSchema, { type: "null" }] } as const;

const nullableUrlStringSchema = { anyOf: [urlStringSchema, { type: "null" }] } as const;

const nonnegativeIntegerSchema = { type: "integer", minimum: 0 } as const;

const nullablePositiveIntegerSchema = { type: ["integer", "null"], minimum: 1 } as const;

function resolvedFactSchema(valueSchema: Record<string, unknown>) {
  return {
    type: "object",
    additionalProperties: false,
    properties: {
      value: { anyOf: [valueSchema, { type: "null" }] },
      status: { type: "string", enum: ["verified", "mixed", "inferred", "unknown"] },
      confidence: { type: "string", enum: ["high", "medium", "low"] },
      citationIds: { type: "array", items: { type: "string" } }
    },
    required: ["value", "status", "confidence", "citationIds"]
  } as const;
}

const hqValueSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    city: nonEmptyStringSchema,
    country: nonEmptyStringSchema
  },
  required: ["city", "country"]
} as const;

const roundValueSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    name: nonEmptyStringSchema,
    amountUsd: nullablePositiveIntegerSchema,
    announcedAt: nullableNonEmptyStringSchema,
    leadInvestors: { type: "array", items: nonEmptyStringSchema }
  },
  required: ["name", "amountUsd", "announcedAt", "leadInvestors"]
} as const;

const investorValueSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    name: nonEmptyStringSchema,
    domain: nullableNonEmptyStringSchema
  },
  required: ["name", "domain"]
} as const;

const personValueSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    name: nonEmptyStringSchema,
    role: nullableNonEmptyStringSchema,
    sourceUrl: nullableUrlStringSchema
  },
  required: ["name", "role", "sourceUrl"]
} as const;

const headcountValueSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    value: nonnegativeIntegerSchema,
    asOf: nonEmptyStringSchema
  },
  required: ["value", "asOf"]
} as const;

const citationSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    id: nonEmptyStringSchema,
    url: urlStringSchema,
    title: nonEmptyStringSchema,
    fetchedAt: { type: "string", minLength: 1, format: "date-time" },
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
    name: resolvedFactSchema(nonEmptyStringSchema),
    logoUrl: nullableUrlStringSchema,
    oneLiner: resolvedFactSchema({ type: "string", maxLength: 120 }),
    hq: resolvedFactSchema(hqValueSchema),
    foundedYear: resolvedFactSchema({ type: "integer", minimum: 1800, maximum: 2100 }),
    status: { type: "string", enum: ["private", "public", "acquired", "shutdown"] }
  },
  required: ["name", "logoUrl", "oneLiner", "hq", "foundedYear", "status"]
} as const;

const fundingSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    totalRaisedUsd: resolvedFactSchema(nonnegativeIntegerSchema),
    lastRound: resolvedFactSchema(roundValueSchema),
    investors: resolvedFactSchema({ type: "array", items: investorValueSchema })
  },
  required: ["totalRaisedUsd", "lastRound", "investors"]
} as const;

const teamSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    founders: resolvedFactSchema({ type: "array", items: personValueSchema }),
    keyExecs: resolvedFactSchema({ type: "array", items: personValueSchema }),
    headcount: resolvedFactSchema(headcountValueSchema)
  },
  required: ["founders", "keyExecs", "headcount"]
} as const;

const signalSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    title: nonEmptyStringSchema,
    url: urlStringSchema,
    date: nonEmptyStringSchema,
    source: nonEmptyStringSchema,
    category: { type: "string", enum: ["news", "hiring", "launch", "funding", "filing", "github", "other"] },
    citationIds: { type: "array", items: nonEmptyStringSchema }
  },
  required: ["title", "url", "date", "source", "category", "citationIds"]
} as const;

const comparableSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    name: nonEmptyStringSchema,
    domain: nonEmptyStringSchema,
    oneLiner: nonEmptyStringSchema
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
