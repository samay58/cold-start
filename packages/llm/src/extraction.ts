import type Anthropic from "@anthropic-ai/sdk";
import type { Message, Tool } from "@anthropic-ai/sdk/resources/messages";
import {
  citationSchema as coreCitationSchema,
  clampCompleteDescriptionSentence,
  cleanDescriptionText,
  coldStartCardObjectSchema,
  comparableSchema as coreComparableSchema,
  completeDescriptionSentence,
  type CompanyDescription,
  descriptionSentences,
  firstDescriptionSentence,
  isWeakDescriptionLabel,
  signalCategorySchema,
  signalSchema as coreSignalSchema,
} from "@cold-start/core";
import { z } from "zod";
import { anthropicSystemCacheControl, createTracedAnthropicMessage, type AnthropicTelemetrySink } from "./anthropic";
import { withSchemaRetry } from "./llm-provider";
import {
  budgetEvidenceSources,
  compactEvidenceText,
  defaultExtractionEvidenceBudgetChars,
  evidenceBudgetCharsFromEnv
} from "./evidence-budget";
import { investorTasteKernel } from "./investor-taste-kernel";
import type { ResearchPlan } from "./research-plan";
import { parseToolUse, type ToolUseLike } from "./tool-use";

const EXTRACTION_TOOL_NAME = "emit_company_claims";
const BLOCK_EXTRACTION_TOOL_NAME = "emit_block_claims";
const maxPromptSources = 24;
const maxBlockPromptSources = 8;
const maxPromptSourceTextLength = 2200;
const maxBlockPromptSourceTextLength = 1400;
const maxPromptLedgerEntries = 20;
const maxBlockPromptLedgerEntries = 10;
const maxPromptSnippetLength = 420;
const extractionEvidenceBudgetChars = evidenceBudgetCharsFromEnv(
  process.env.EXTRACTION_EVIDENCE_BUDGET_CHARS,
  defaultExtractionEvidenceBudgetChars
);

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
    email: nullableEmailStringSchema
  },
  required: ["name", "role", "sourceUrl", "email"]
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
  required: ["name", "domain", "oneLiner"]
} as const;

export type ExtractionEvidence = {
  domain: string;
  researchPlan?: ResearchPlan;
  sources: Array<{ url: string; title: string; rawText: string; sourceType: string; intent?: string | null }>;
  evidenceLedger?: Array<{
    id: string;
    url: string;
    title: string;
    sourceType: string;
    intents: string[];
    authorityScore: number;
    supportingSnippets: string[];
  }>;
};

export function evidenceForExtractionPrompt(
  evidence: ExtractionEvidence,
  options: { scope?: "full" | "block" } = {}
): ExtractionEvidence {
  const isBlock = options.scope === "block";
  const ledgerLimit = isBlock ? maxBlockPromptLedgerEntries : maxPromptLedgerEntries;
  const sourceLimit = isBlock ? maxBlockPromptSources : maxPromptSources;
  const sourceTextLimit = isBlock ? maxBlockPromptSourceTextLength : maxPromptSourceTextLength;

  const evidenceLedger = evidence.evidenceLedger?.slice(0, ledgerLimit).map((entry) => ({
    ...entry,
    supportingSnippets: entry.supportingSnippets.map((snippet) => compactEvidenceText(snippet, maxPromptSnippetLength)),
  }));
  const priorityUrls = new Set(evidenceLedger?.map((entry) => entry.url) ?? []);
  const sourcePool =
    priorityUrls.size > 0 ? evidence.sources.filter((source, index) => priorityUrls.has(source.url) || index < 8) : evidence.sources;

  return {
    domain: evidence.domain,
    ...(evidence.researchPlan ? { researchPlan: evidence.researchPlan } : {}),
    ...(evidenceLedger ? { evidenceLedger } : {}),
    sources: budgetEvidenceSources({
      sources: sourcePool,
      itemLimit: sourceLimit,
      textLimit: sourceTextLimit,
      budgetChars: extractionEvidenceBudgetChars,
      getText: (source) => source.rawText,
      withText: (source, rawText) => ({ ...source, rawText }),
    }),
  };
}

export const extractionSystemPrompt = [
  investorTasteKernel,
  "You extract investor-grade public company facts from a structured evidence ledger and raw public sources.",
  "Drop unsupported claims. Every material fact must map to citation IDs. Use null for missing facts.",
  "Funding standard: build a round ledger first. Include rounds only when amount, round name, date, or investors are explicitly supported. totalRaisedUsd may be used only when explicitly stated by a cited source or mechanically reconciled from a complete cited round ledger; otherwise return null or mixed.",
  "Description standard: identity.description.shortDescription must be one complete sentence, roughly 18 to 24 words and no more than about 170 characters, that explains what the company actually does and who it serves. It is the card lead, not a product-page overview.",
  "identity.description.expandedDescription must be two or three complete sentences in plain English. Explain what the company does, who uses or buys it, what workflow or pain it addresses, and the nuance that matters. Use concrete nouns, clean causal language, and no brochure copy.",
  "Use identity.description.concept for the non-obvious product idea, serves for buyer and use case, and mechanism for product and technology when sources support those details. Keep each structured field to one complete sentence and one idea.",
  "Use identity.websiteUrl for the canonical public website when a provider or source returns it. Use identity.linkedinUrl only for the company LinkedIn page, never a person profile.",
  "identity.oneLiner is a backwards-compatible display alias for description.shortDescription. It should be the same kind of short complete sentence, not a paragraph.",
  "Do not write generic category labels such as answer engine, AI-native ERP, copilot, or platform unless the cited sources make that the most precise description.",
  "Never end any description field with an incomplete phrase. Never use literal ellipses or trailing dots to imply omitted text.",
  "Never stuff feature lists into the overview. If a source lists ten capabilities, extract the underlying workflow and leave the details for concept, buyer and use case, or product and technology.",
  "Ban brochure language: innovative, comprehensive, seamless, robust, advanced, trusted by, commitment to, designed to enhance, and with ease. Replace with the supported fact or omit the sentence.",
  "One signal per underlying event. When several sources cover the same announcement, emit it once and cite every supporting source in that signal's citationIds. Never emit one signal per article.",
  "Treat source incentives as evidence: independent technical and independent analysis sources should shape qualitative framing more than press releases; company-authored sources are strongest for exact product mechanics, not evaluative claims.",
  "Prefer primary company pages for product mechanics, recent funding/news sources for round data, and independent analysis for market framing. Surface conflicts as mixed rather than averaging."
].join(" ");

export const extractedCardSectionsSchema = coldStartCardObjectSchema.pick({
  identity: true,
  funding: true,
  team: true,
  signals: true,
  comparables: true,
  citations: true
});

export type ExtractedCardSections = z.infer<typeof extractedCardSectionsSchema>;

const blockEnrichmentPatchSchema = z.object({
  blockId: z.enum(BLOCK_ENRICHMENT_IDS),
  identity: z.object({
    oneLiner: coldStartCardObjectSchema.shape.identity.shape.oneLiner.optional(),
    description: coldStartCardObjectSchema.shape.identity.shape.description.optional(),
  }).optional(),
  funding: z.object({
    totalRaisedUsd: coldStartCardObjectSchema.shape.funding.shape.totalRaisedUsd.optional(),
    lastRound: coldStartCardObjectSchema.shape.funding.shape.lastRound.optional(),
    rounds: coldStartCardObjectSchema.shape.funding.shape.rounds.optional(),
    investors: coldStartCardObjectSchema.shape.funding.shape.investors.optional(),
  }).optional(),
  team: z.object({
    founders: coldStartCardObjectSchema.shape.team.shape.founders.optional(),
    keyExecs: coldStartCardObjectSchema.shape.team.shape.keyExecs.optional(),
    headcount: coldStartCardObjectSchema.shape.team.shape.headcount.optional(),
  }).optional(),
  signals: z.array(coreSignalSchema).optional(),
  comparables: z.array(coreComparableSchema).optional(),
  citations: z.array(coreCitationSchema),
});

export type BlockEnrichmentPatch = z.infer<typeof blockEnrichmentPatchSchema>;

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
      citations: { type: "array", items: citationSchema },
    },
    required: ["blockId", "citations"],
  }
} satisfies Tool;

export function parseExtractionToolUse(message: { content: ToolUseLike[] }) {
  return parseToolUse(message, EXTRACTION_TOOL_NAME, extractedCardSectionsSchema, normalizeExtractionInput);
}

export function parseBlockEnrichmentToolUse(message: { content: ToolUseLike[] }) {
  return parseToolUse(message, BLOCK_EXTRACTION_TOOL_NAME, blockEnrichmentPatchSchema, normalizeBlockEnrichmentInput);
}

function normalizeExtractionInput(input: unknown) {
  if (!input || typeof input !== "object") {
    return input;
  }

  const root = input as Record<string, unknown>;
  const normalizedRoot: Record<string, unknown> = {
    ...root,
    identity: normalizeIdentity(root.identity),
    funding: normalizeFunding(root.funding),
    team: normalizeTeam(root.team),
    signals: filterArray(root.signals, coreSignalSchema),
    comparables: filterArray(root.comparables, coreComparableSchema),
    citations: filterArray(root.citations, coreCitationSchema),
  };
  return normalizedRoot;
}

function normalizeBlockEnrichmentInput(input: unknown) {
  if (!input || typeof input !== "object") {
    return input;
  }

  const root = input as Record<string, unknown>;
  const normalizedRoot: Record<string, unknown> = {
    blockId: root.blockId,
    citations: filterArray(root.citations, coreCitationSchema),
  };

  const identity = normalizeBlockIdentity(root.identity);
  const funding = normalizeBlockFunding(root.funding);
  const team = normalizeBlockTeam(root.team);

  if (identity) {
    normalizedRoot.identity = identity;
  }
  if (funding) {
    normalizedRoot.funding = funding;
  }
  if (team) {
    normalizedRoot.team = team;
  }
  if ("signals" in root) {
    normalizedRoot.signals = filterArray(root.signals, coreSignalSchema);
  }
  if ("comparables" in root) {
    normalizedRoot.comparables = filterArray(root.comparables, coreComparableSchema);
  }

  return normalizedRoot;
}

function normalizeBlockIdentity(input: unknown) {
  const record = objectRecord(input);
  const output: Record<string, unknown> = {};

  if ("oneLiner" in record) {
    output.oneLiner = normalizeFact(record.oneLiner);
  }
  if ("description" in record) {
    output.description = normalizeFact(record.description, normalizeDescriptionValue);
  }

  return Object.keys(output).length > 0 ? output : null;
}

function normalizeBlockFunding(input: unknown) {
  const record = objectRecord(input);
  const output: Record<string, unknown> = {};

  if ("totalRaisedUsd" in record) {
    output.totalRaisedUsd = normalizeFact(record.totalRaisedUsd);
  }
  if ("lastRound" in record) {
    output.lastRound = normalizeFact(record.lastRound, normalizeRoundValue);
  }
  if ("rounds" in record) {
    output.rounds = normalizeFact(record.rounds, normalizeRoundArray);
  }
  if ("investors" in record) {
    output.investors = normalizeFact(record.investors, normalizeInvestorArray);
  }

  return Object.keys(output).length > 0 ? output : null;
}

function normalizeBlockTeam(input: unknown) {
  const record = objectRecord(input);
  const output: Record<string, unknown> = {};

  if ("founders" in record) {
    output.founders = normalizeFact(record.founders, normalizePersonArray);
  }
  if ("keyExecs" in record) {
    output.keyExecs = normalizeFact(record.keyExecs, normalizePersonArray);
  }
  if ("headcount" in record) {
    output.headcount = normalizeFact(record.headcount);
  }

  return Object.keys(output).length > 0 ? output : null;
}

type NormalizedFact<T = unknown> = {
  value: T | null;
  status: "verified" | "mixed" | "inferred" | "unknown";
  confidence: "high" | "medium" | "low";
  citationIds: string[];
};

function unknownFact<T = unknown>(): NormalizedFact<T> {
  return {
    value: null,
    status: "unknown",
    confidence: "low",
    citationIds: [],
  };
}

function normalizeIdentity(input: unknown) {
  const record = objectRecord(input);
  const status = record.status;
  const description = normalizeFact(record.description, normalizeDescriptionValue);
  const oneLiner = normalizeFact(record.oneLiner);
  const descriptionValue = description.value;

  return {
    name: normalizeFact(record.name),
    ...("websiteUrl" in record ? { websiteUrl: normalizeFact(record.websiteUrl) } : {}),
    ...("linkedinUrl" in record ? { linkedinUrl: normalizeFact(record.linkedinUrl) } : {}),
    logoUrl: typeof record.logoUrl === "string" ? record.logoUrl : null,
    oneLiner: oneLiner.value === null && descriptionValue
      ? { ...description, value: descriptionValue.shortDescription }
      : oneLiner,
    description,
    hq: normalizeFact(record.hq),
    foundedYear: normalizeFact(record.foundedYear),
    status: status === "public" || status === "acquired" || status === "shutdown" ? status : "private",
  };
}

function normalizeDescriptionValue(value: unknown): CompanyDescription | null {
  const record = objectRecord(value);
  const shortDescription = normalizeShortDescription(record.shortDescription);
  if (!shortDescription) {
    return null;
  }

  return {
    shortDescription,
    expandedDescription: normalizeExpandedDescription(record.expandedDescription),
    concept: normalizeOptionalDescriptionSentence(record.concept),
    serves: normalizeOptionalDescriptionSentence(record.serves),
    mechanism: normalizeOptionalDescriptionSentence(record.mechanism),
  };
}

function normalizeShortDescription(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const sentence = completeDescriptionSentence(firstDescriptionSentence(cleanDescriptionText(value)));
  if (!sentence || isWeakDescriptionLabel(sentence)) {
    return null;
  }

  return clampCompleteSentence(sentence, 170);
}

function normalizeExpandedDescription(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const cleaned = cleanDescriptionText(value);
  const sentences = descriptionSentences(cleaned, 3);
  return completeDescriptionSentence(sentences.join(" "));
}

function normalizeOptionalDescriptionSentence(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  return completeDescriptionSentence(firstDescriptionSentence(cleanDescriptionText(value)));
}

function clampCompleteSentence(value: string, maxLength: number): string {
  return clampCompleteDescriptionSentence(value, maxLength) ?? value;
}

function normalizeFunding(input: unknown) {
  const record = objectRecord(input);

  return {
    totalRaisedUsd: normalizeFact(record.totalRaisedUsd),
    lastRound: normalizeFact(record.lastRound, normalizeRoundValue),
    rounds: normalizeFact(record.rounds, normalizeRoundArray),
    investors: normalizeFact(record.investors, normalizeInvestorArray),
  };
}

function normalizeTeam(input: unknown) {
  const record = objectRecord(input);

  return {
    founders: normalizeFact(record.founders, normalizePersonArray),
    keyExecs: normalizeFact(record.keyExecs, normalizePersonArray),
    headcount: normalizeFact(record.headcount),
  };
}

function normalizeFact<T = unknown>(
  input: unknown,
  normalizeValue: (value: unknown) => T | null | undefined = (value) => value as T
): NormalizedFact<T> {
  const record = objectRecord(input);
  const citationIds = Array.isArray(record.citationIds)
    ? record.citationIds.filter((citationId): citationId is string => typeof citationId === "string" && citationId.length > 0)
    : [];
  const status = record.status;
  const confidence = record.confidence;

  if (
    !(
      status === "verified" ||
      status === "mixed" ||
      status === "inferred" ||
      status === "unknown"
    ) ||
    !(confidence === "high" || confidence === "medium" || confidence === "low")
  ) {
    return unknownFact();
  }

  const value = normalizeValue(record.value);
  if (value === undefined) {
    return unknownFact();
  }

  if (value !== null && citationIds.length === 0) {
    return unknownFact();
  }

  return {
    value,
    status: value === null ? "unknown" : status,
    confidence: value === null ? "low" : confidence,
    citationIds: value === null ? [] : citationIds,
  };
}

function normalizeRoundValue(value: unknown) {
  const record = objectRecord(value);
  if (typeof record.name !== "string" || record.name.trim().length === 0) {
    return null;
  }

  return {
    name: record.name.trim(),
    amountUsd: typeof record.amountUsd === "number" && Number.isInteger(record.amountUsd) && record.amountUsd > 0 ? record.amountUsd : null,
    announcedAt: typeof record.announcedAt === "string" && record.announcedAt.trim().length > 0 ? record.announcedAt.trim() : null,
    leadInvestors: stringArray(record.leadInvestors),
  };
}

function normalizeRoundArray(value: unknown) {
  if (!Array.isArray(value)) {
    return null;
  }

  return value.map(normalizeRoundValue).filter((round): round is NonNullable<ReturnType<typeof normalizeRoundValue>> => round !== null);
}

function normalizeInvestorArray(value: unknown) {
  if (!Array.isArray(value)) {
    return null;
  }

  return value
    .map((item) => {
      const record = objectRecord(item);
      if (typeof record.name !== "string" || record.name.trim().length === 0) {
        return null;
      }

      return {
        name: record.name.trim(),
        domain: typeof record.domain === "string" && record.domain.trim().length > 0 ? record.domain.trim() : null,
      };
    })
    .filter((investor): investor is { name: string; domain: string | null } => investor !== null);
}

function normalizePersonArray(value: unknown) {
  if (!Array.isArray(value)) {
    return null;
  }

  return value
    .map((item) => {
      const record = objectRecord(item);
      if (typeof record.name !== "string" || record.name.trim().length === 0) {
        return null;
      }

      return {
        name: record.name.trim(),
        role: typeof record.role === "string" && record.role.trim().length > 0 ? record.role.trim() : null,
        sourceUrl: typeof record.sourceUrl === "string" && record.sourceUrl.trim().length > 0 ? record.sourceUrl.trim() : null,
        email: emailValue(record.email),
      };
    })
    .filter((person): person is { name: string; role: string | null; sourceUrl: string | null; email: string | null } => person !== null);
}

function objectRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function stringArray(value: unknown) {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string" && item.trim().length > 0).map((item) => item.trim())
    : [];
}

function emailValue(value: unknown) {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed) ? trimmed : null;
}

function filterArray<T>(value: unknown, schema: z.ZodType<T>) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((item) => {
    const parsed = schema.safeParse(item);
    return parsed.success ? [parsed.data] : [];
  });
}

export async function extractCompanyClaims(input: {
  client: Anthropic;
  model: string;
  evidence: ExtractionEvidence;
  telemetry?: AnthropicTelemetrySink;
}) {
  return withSchemaRetry(input.model, async () => {
    const response: Message = await createTracedAnthropicMessage({
      client: input.client,
      label: "extract-company-claims",
      model: input.model,
      stage: "extract_full",
      telemetry: input.telemetry,
      params: {
        model: input.model,
        max_tokens: 4000,
        temperature: 0,
        system: [
          {
            type: "text",
            text: extractionSystemPrompt,
            cache_control: anthropicSystemCacheControl()
          }
        ],
        messages: [
          {
            role: "user",
            content: [
              {
                type: "text",
                text: JSON.stringify(evidenceForExtractionPrompt(input.evidence))
              }
            ]
          }
        ],
        tools: [extractionTool],
        tool_choice: { type: "tool", name: EXTRACTION_TOOL_NAME }
      },
    });

    return parseExtractionToolUse(response);
  });
}

const blockGuidance: Record<BlockEnrichmentId, string> = {
  description:
    "Fill identity.description fields for both display layers and the structured product facts. shortDescription must be one complete sentence, roughly 18 to 24 words and under about 170 characters. expandedDescription must be two or three complete sentences explaining what the company does, who uses or buys it, what workflow or pain it addresses, and what nuance matters. Keep concept, serves, and mechanism as one complete sentence each. Never use literal ellipses or incomplete endings. Prefer primary product pages for product mechanics and independent product analysis for framing. Do not use category labels when concrete workflow language is available.",
  funding:
    "Build the funding ledger before any totals. For each cited round, capture the round name, the exact USD amount whenever the source states one (do not round-number guess; record explicit figures verbatim), the announcedAt date, and the named leads in leadInvestors. For funding.investors, enumerate every named investor across every round (leads and participating both), deduped, with their domain when the source provides it. For totalRaisedUsd, fill it only when a cited source states the cumulative total explicitly or when every round in the ledger has a cited amount you can sum without overlap. Prefer recent reporting from Reuters, Bloomberg, TechCrunch, The Information, Crunchbase News, PitchBook, and Forbes; company press releases and investor posts are acceptable for exact announcement facts. Demote aggregator pages that lack a primary citation.",
  team:
    "Extract founders, CEO, and current management team. Include public work emails only when explicitly present in cited professional sources or provider enrichment. Do not guess email patterns or personal email addresses.",
  signals:
    "Extract recent traction signals: launches, customers, hiring, partnerships, funding, filings, technical releases, and credible news. Prefer dated sources and avoid generic profile blurbs. One signal per underlying event: when several sources cover the same announcement, emit it once and cite every supporting source in that signal's citationIds, never one signal per article.",
  comparables:
    "Pick 3 to 5 real competitors or close adjacencies. For each one: domain must come from a cited source (Exa find-similar or competition search), oneLiner must be a concrete sentence drawn from that source's text describing what the company actually does (not the target), and basis must name one concrete overlap with the target: same buyer, same workflow, same product category, or named together in a market map. Forbid generic boilerplate like 'similar web result', 'find-similar', 'adjacent player'; forbid press-release positioning; forbid the target itself, alternate domains of the target, directories, blog posts, or app-store listings. If fewer than 3 sources support real overlap, return fewer rather than fabricate.",
};

export async function extractCompanyBlockClaims(input: {
  client: Anthropic;
  model: string;
  block: BlockEnrichmentId;
  evidence: ExtractionEvidence & { currentSections?: ExtractedCardSections };
  telemetry?: AnthropicTelemetrySink;
}) {
  return withSchemaRetry(input.model, async () => {
    const response: Message = await createTracedAnthropicMessage({
      client: input.client,
      label: `extract-block:${input.block}`,
      model: input.model,
      stage: "extract_block",
      telemetry: input.telemetry,
      params: {
        model: input.model,
        max_tokens: 1800,
        temperature: 0,
        system: [
          {
            type: "text",
            text: [
              investorTasteKernel,
              "You extract one Cold Start card block from public cited evidence.",
              "Return only claims supported by citations in this prompt. Use null or omit fields when evidence is missing.",
              "Do not backfill from general knowledge. Do not infer funding, leaders, emails, customers, or competitors without source support.",
              blockGuidance[input.block],
            ].join(" "),
            cache_control: anthropicSystemCacheControl(),
          }
        ],
        messages: [
          {
            role: "user",
            content: [
              {
                type: "text",
                text: JSON.stringify({
                  blockId: input.block,
                  ...evidenceForExtractionPrompt(input.evidence, { scope: "block" }),
                  ...(input.evidence.currentSections ? { currentSections: input.evidence.currentSections } : {}),
                })
              }
            ]
          }
        ],
        tools: [blockEnrichmentTool],
        tool_choice: { type: "tool", name: BLOCK_EXTRACTION_TOOL_NAME }
      },
    });

    return parseBlockEnrichmentToolUse(response);
  });
}
