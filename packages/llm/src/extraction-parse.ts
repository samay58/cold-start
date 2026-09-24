// Reading the extraction model's reply: the tool call is parsed against the card schema after
// normalizing what models get wrong (quoted numbers, stray fields, malformed list items).
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
  normalizeExactInteger as normalizeExtractionInteger,
  safePublicImageUrl,
  safeWebUrl,
  signalSchema as coreSignalSchema,
} from "@cold-start/core";
import { z } from "zod";
import { BLOCK_ENRICHMENT_IDS, blockEnrichmentTool, extractionTool } from "./extraction-tools";
import { parseToolUse, type ToolUseLike } from "./tool-use";

export const extractedCardSectionsSchema = coldStartCardObjectSchema.pick({
  identity: true,
  funding: true,
  team: true,
  signals: true,
  comparables: true,
  competitionFraming: true,
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
  competitionFraming: coldStartCardObjectSchema.shape.competitionFraming,
  citations: z.array(coreCitationSchema),
});

export type BlockEnrichmentPatch = z.infer<typeof blockEnrichmentPatchSchema>;

export function parseExtractionToolUse(message: { content: ToolUseLike[] }) {
  return parseToolUse(message, extractionTool.name, extractedCardSectionsSchema, normalizeExtractionInput);
}

export function parseBlockEnrichmentToolUse(message: { content: ToolUseLike[] }) {
  return parseToolUse(message, blockEnrichmentTool.name, blockEnrichmentPatchSchema, normalizeBlockEnrichmentInput);
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
    ...("competitionFraming" in root ? { competitionFraming: normalizeFact(root.competitionFraming) } : {}),
    citations: filterArray(root.citations, coreCitationSchema),
  };
  return isolateOptionalFacts(normalizedRoot, false);
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
  if ("competitionFraming" in root) {
    normalizedRoot.competitionFraming = normalizeFact(root.competitionFraming);
  }

  return isolateOptionalFacts(normalizedRoot, true);
}

function isolateOptionalFacts(root: Record<string, unknown>, block: boolean) {
  for (const section of ["identity", "funding", "team"] as const) {
    const facts = objectRecord(root[section]);
    const schemas = coldStartCardObjectSchema.shape[section].shape;
    for (const [key, schema] of Object.entries(schemas)) {
      if (!(key in facts) || key === "status" || key === "logoUrl") continue;
      // The initial profile still needs a valid identity. Background patches
      // can omit any fact and retain the version already on the saved card.
      if (!block && section === "identity" && (key === "name" || key === "oneLiner")) continue;
      if (!schema.safeParse(facts[key]).success) facts[key] = unknownFact();
    }
  }
  if ("competitionFraming" in root && !coldStartCardObjectSchema.shape.competitionFraming.safeParse(root.competitionFraming).success) {
    root.competitionFraming = unknownFact();
  }
  return root;
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
    output.totalRaisedUsd = normalizeFact(record.totalRaisedUsd, normalizeUsd);
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
    output.headcount = normalizeFact(record.headcount, normalizeHeadcount);
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
    logoUrl: safePublicImageUrl(record.logoUrl),
    oneLiner: oneLiner.value === null && descriptionValue
      ? { ...description, value: descriptionValue.shortDescription }
      : oneLiner,
    description,
    hq: normalizeFact(record.hq),
    foundedYear: normalizeFact(record.foundedYear, (value) => normalizeExtractionInteger(value)),
    status: status === "public" || status === "acquired" || status === "shutdown" ? status : "private",
  };
}

const maxServesMechanismSentences = 2;

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
    serves: normalizeOptionalDescriptionSentences(record.serves, maxServesMechanismSentences),
    mechanism: normalizeOptionalDescriptionSentences(record.mechanism, maxServesMechanismSentences),
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

// Same normalization as normalizeOptionalDescriptionSentence, but keeps up to
// maxSentences complete sentences instead of just the first. Truncation
// always lands on a sentence boundary from the abbreviation-aware splitter,
// never mid-sentence.
function normalizeOptionalDescriptionSentences(value: unknown, maxSentences: number): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const sentences = descriptionSentences(cleanDescriptionText(value), maxSentences);
  return completeDescriptionSentence(sentences.join(" "));
}

function clampCompleteSentence(value: string, maxLength: number): string {
  return clampCompleteDescriptionSentence(value, maxLength) ?? value;
}

function normalizeFunding(input: unknown) {
  const record = objectRecord(input);

  return {
    totalRaisedUsd: normalizeFact(record.totalRaisedUsd, normalizeUsd),
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
    headcount: normalizeFact(record.headcount, normalizeHeadcount),
  };
}

function normalizeUsd(value: unknown) {
  return normalizeExtractionInteger(value, true);
}

function normalizeHeadcount(value: unknown) {
  const record = objectRecord(value);
  const count = normalizeExtractionInteger(record.value);
  return count === null ? null : { value: count, asOf: record.asOf };
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
    amountUsd: normalizeUsd(record.amountUsd) ?? null,
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
        sourceUrl: urlValue(record.sourceUrl),
        email: emailValue(record.email),
        githubUrl: urlValue(record.githubUrl),
        xUrl: urlValue(record.xUrl),
        personalUrl: urlValue(record.personalUrl),
      };
    })
    .filter(
      (
        person
      ): person is {
        name: string;
        role: string | null;
        sourceUrl: string | null;
        email: string | null;
        githubUrl: string | null;
        xUrl: string | null;
        personalUrl: string | null;
      } => person !== null
    );
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

function urlValue(value: unknown) {
  return safeWebUrl(value);
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
