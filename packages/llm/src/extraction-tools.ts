// The tools the extraction model is given: the wire schema for a full profile and for one
// block. A field added to the card changes this file, the parser and the card schema together.
import type { Tool } from "@anthropic-ai/sdk/resources/messages";
import { signalCategorySchema } from "@cold-start/core";

const EXTRACTION_TOOL_NAME = "emit_company_claims";
const BLOCK_EXTRACTION_TOOL_NAME = "emit_block_claims";

export const BLOCK_ENRICHMENT_IDS = ["description", "funding", "team", "signals", "comparables"] as const;
export type BlockEnrichmentId = (typeof BLOCK_ENRICHMENT_IDS)[number];
const nonEmptyStringSchema = { type: "string", minLength: 1 } as const;

const urlStringSchema = { type: "string", minLength: 1, format: "uri" } as const;

const emailStringSchema = { type: "string", minLength: 1, format: "email" } as const;

const nullableNonEmptyStringSchema = { anyOf: [nonEmptyStringSchema, { type: "null" }] } as const;

const nullableUrlStringSchema = { anyOf: [urlStringSchema, { type: "null" }] } as const;

const nullableEmailStringSchema = { anyOf: [emailStringSchema, { type: "null" }] } as const;

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
      citationIds: { type: "array", items: nonEmptyStringSchema }
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
    sourceUrl: nullableUrlStringSchema,
    email: nullableEmailStringSchema,
    githubUrl: nullableUrlStringSchema,
    xUrl: nullableUrlStringSchema,
    personalUrl: nullableUrlStringSchema
  },
  required: ["name", "role", "sourceUrl", "email", "githubUrl", "xUrl", "personalUrl"]
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

// Sentence budgets mirror extractionSystemPrompt and blockGuidance.description in
// extraction.ts, which are the actual enforcement point at the model level; the
// normalizers in extraction-parse.ts (normalizeOptionalDescriptionSentence,
// normalizeOptionalDescriptionSentences) are what clamp a non-compliant model
// response back into budget. Keep all three in sync: concept stays one
// complete sentence; serves and mechanism allow up to two complete sentences
// each, truncated on a sentence boundary, never mid-sentence.
const descriptionValueSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    shortDescription: nonEmptyStringSchema,
    expandedDescription: nullableNonEmptyStringSchema,
    concept: nullableNonEmptyStringSchema,
    serves: nullableNonEmptyStringSchema,
    mechanism: nullableNonEmptyStringSchema,
  },
  required: ["shortDescription", "expandedDescription", "concept", "serves", "mechanism"],
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
    websiteUrl: resolvedFactSchema(urlStringSchema),
    linkedinUrl: resolvedFactSchema(urlStringSchema),
    logoUrl: nullableUrlStringSchema,
    oneLiner: resolvedFactSchema(nonEmptyStringSchema),
    description: resolvedFactSchema(descriptionValueSchema),
    hq: resolvedFactSchema(hqValueSchema),
    foundedYear: resolvedFactSchema({ type: "integer", minimum: 1800, maximum: 2100 }),
    status: { type: "string", enum: ["private", "public", "acquired", "shutdown"] }
  },
  required: ["name", "logoUrl", "oneLiner", "description", "hq", "foundedYear", "status"]
} as const;

const fundingSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    totalRaisedUsd: resolvedFactSchema(nonnegativeIntegerSchema),
    lastRound: resolvedFactSchema(roundValueSchema),
    rounds: resolvedFactSchema({ type: "array", items: roundValueSchema }),
    investors: resolvedFactSchema({ type: "array", items: investorValueSchema })
  },
  required: ["totalRaisedUsd", "lastRound", "rounds", "investors"]
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
    category: { type: "string", enum: [...signalCategorySchema.options] },
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
    oneLiner: nonEmptyStringSchema,
    basis: nonEmptyStringSchema,
    confidence: { type: "string", enum: ["high", "medium", "low"] },
    citationIds: { type: "array", items: nonEmptyStringSchema }
  },
  // basis is required at the wire level for fresh extractions (the buyer-alternative
  // justification is the point of the field); packages/core's stored-card schema keeps it
  // optional so legacy cards extracted before this requirement still parse.
  required: ["name", "domain", "oneLiner", "basis"]
} as const;

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
      competitionFraming: resolvedFactSchema(nonEmptyStringSchema),
      citations: { type: "array", items: citationSchema }
    },
    required: ["identity", "funding", "team", "signals", "comparables", "citations"]
  }
} satisfies Tool;

const blockIdentityPatchSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    oneLiner: resolvedFactSchema(nonEmptyStringSchema),
    description: resolvedFactSchema(descriptionValueSchema),
  },
} as const;

const blockFundingPatchSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    totalRaisedUsd: resolvedFactSchema(nonnegativeIntegerSchema),
    lastRound: resolvedFactSchema(roundValueSchema),
    rounds: resolvedFactSchema({ type: "array", items: roundValueSchema }),
    investors: resolvedFactSchema({ type: "array", items: investorValueSchema }),
  },
} as const;

const blockTeamPatchSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    founders: resolvedFactSchema({ type: "array", items: personValueSchema }),
    keyExecs: resolvedFactSchema({ type: "array", items: personValueSchema }),
    headcount: resolvedFactSchema(headcountValueSchema),
  },
} as const;

export const blockEnrichmentTool = {
  name: BLOCK_EXTRACTION_TOOL_NAME,
  description: "Emit one block of cited company claims from the supplied public sources.",
  input_schema: {
    type: "object",
    additionalProperties: false,
    properties: {
      blockId: { type: "string", enum: BLOCK_ENRICHMENT_IDS },
      identity: blockIdentityPatchSchema,
      funding: blockFundingPatchSchema,
      team: blockTeamPatchSchema,
      signals: { type: "array", items: signalSchema },
      comparables: { type: "array", items: comparableSchema },
      competitionFraming: resolvedFactSchema(nonEmptyStringSchema),
      citations: { type: "array", items: citationSchema },
    },
    required: ["blockId", "citations"],
  }
} satisfies Tool;
