import { z } from "zod";
import { companyDescriptionSchema } from "./intelligence";

export const citationSchema = z.object({
  id: z.string().min(1),
  url: z.string().url(),
  title: z.string().min(1),
  fetchedAt: z.string().datetime(),
  sourceType: z.enum(["company_site", "news", "filing", "enrichment", "github", "rdap", "other"]),
  snippet: z.string().optional(),
  sourceQuality: z.object({
    tier: z.enum([
      "independent_technical",
      "independent_analysis",
      "independent_report",
      "primary_company",
      "press_release",
      "enrichment",
      "unknown"
    ]),
    label: z.string().min(1),
    rationale: z.string().min(1),
    incentive: z.string().min(1)
  }).optional()
});

export const confidenceSchema = z.enum(["high", "medium", "low"]);
export const factStatusSchema = z.enum(["verified", "mixed", "inferred", "unknown"]);

export const resolvedFactSchema = <T extends z.ZodTypeAny>(valueSchema: T) =>
  z.object({
    value: valueSchema.nullable(),
    status: factStatusSchema,
    confidence: confidenceSchema,
    citationIds: z.array(z.string().min(1))
  });

export const roundSchema = z.object({
  name: z.string().min(1),
  amountUsd: z.number().int().positive().nullable(),
  announcedAt: z.string().min(1).nullable(),
  leadInvestors: z.array(z.string().min(1))
});

export const investorSchema = z.object({
  name: z.string().min(1),
  domain: z.string().min(1).nullable()
});

export const personSchema = z.object({
  name: z.string().min(1),
  role: z.string().min(1).nullable(),
  sourceUrl: z.string().url().nullable(),
  email: z.string().email().nullable().optional()
});

// One taxonomy for signal categories. Every consumer (the extraction wire contract, the
// extension's runtime gate) derives from signalCategorySchema.options so the set cannot drift
// apart by hand.
export const signalCategorySchema = z.enum(["news", "hiring", "launch", "funding", "filing", "github", "other"]);
export type SignalCategory = z.infer<typeof signalCategorySchema>;

export const signalSchema = z.object({
  title: z.string().min(1),
  url: z.string().url(),
  date: z.string().min(1),
  source: z.string().min(1),
  category: signalCategorySchema,
  citationIds: z.array(z.string().min(1))
});

export const comparableSchema = z.object({
  name: z.string().min(1),
  domain: z.string().min(1),
  oneLiner: z.string().min(1),
  basis: z.string().min(1).optional(),
  confidence: confidenceSchema.optional(),
  citationIds: z.array(z.string().min(1)).optional()
});

export const sourcedTextSchema = z.object({
  text: z.string().min(1),
  citationIds: z.array(z.string().min(1))
});

export const marketStructureAndTimingSchema = z.object({
  buyerBudget: sourcedTextSchema.nullable(),
  painSeverity: sourcedTextSchema.nullable(),
  adoptionTrigger: sourcedTextSchema.nullable(),
  marketStructure: sourcedTextSchema.nullable(),
  profitPool: sourcedTextSchema.nullable(),
  expansionPath: sourcedTextSchema.nullable(),
  timingRisk: sourcedTextSchema.nullable()
});

// Fixed, shared taxonomy for open questions. The model assigns one category per
// question so the labels stay consistent across every card; a client-side keyword
// guess would not. `null` is reserved for legacy cards generated before categories.
export const questionCategorySchema = z.enum([
  "buyer_budget",
  "adoption_proof",
  "durability",
  "unit_economics",
  "technical_edge",
  "market_timing",
  "trust_regulation"
]);
export type QuestionCategory = z.infer<typeof questionCategorySchema>;

export const openQuestionSchema = z.object({
  question: z.string().min(1),
  category: questionCategorySchema.nullable().catch(null),
  testsBelief: z.string().min(1).optional(),
  evidenceBasis: z.string().min(1).optional(),
  wouldChangeReadIf: z.string().min(1).optional()
});
export type OpenQuestion = z.infer<typeof openQuestionSchema>;

// Tolerant read shape: accept a legacy bare string (pre-category cards) or a
// structured entry, and normalize both to { question, category }.
const openQuestionEntrySchema = z.union([
  openQuestionSchema,
  z.string().min(1).transform((question): OpenQuestion => ({ question, category: null }))
]);

export const synthesisSchema = z.object({
  whyItMatters: sourcedTextSchema,
  bullCase: z.array(sourcedTextSchema),
  bearCase: z.array(sourcedTextSchema),
  openQuestions: z.array(openQuestionEntrySchema),
  marketStructureAndTiming: marketStructureAndTimingSchema.optional()
});

export const coldStartCardObjectSchema = z.object({
  slug: z.string().min(1),
  domain: z.string().min(1),
  generatedAt: z.string().datetime(),
  generationCostUsd: z.number().nonnegative(),
  cacheStatus: z.enum(["hit", "partial", "miss", "stale"]),
  identity: z.object({
    name: resolvedFactSchema(z.string().min(1)),
    websiteUrl: resolvedFactSchema(z.string().url()).optional(),
    linkedinUrl: resolvedFactSchema(z.string().url()).optional(),
    logoUrl: z.string().url().nullable(),
    oneLiner: resolvedFactSchema(z.string().min(1)),
    description: resolvedFactSchema(companyDescriptionSchema).optional(),
    hq: resolvedFactSchema(z.object({ city: z.string().min(1), country: z.string().min(1) })),
    foundedYear: resolvedFactSchema(z.number().int().min(1800).max(2100)),
    status: z.enum(["private", "public", "acquired", "shutdown"])
  }),
  funding: z.object({
    totalRaisedUsd: resolvedFactSchema(z.number().int().nonnegative()),
    lastRound: resolvedFactSchema(roundSchema),
    rounds: resolvedFactSchema(z.array(roundSchema)).optional(),
    investors: resolvedFactSchema(z.array(investorSchema))
  }),
  team: z.object({
    founders: resolvedFactSchema(z.array(personSchema)),
    keyExecs: resolvedFactSchema(z.array(personSchema)),
    headcount: resolvedFactSchema(z.object({ value: z.number().int().nonnegative(), asOf: z.string().min(1) }))
  }),
  signals: z.array(signalSchema),
  comparables: z.array(comparableSchema),
  citations: z.array(citationSchema),
  synthesis: synthesisSchema.optional()
});

function isCitationBearingObject(value: unknown): value is { value?: unknown; citationIds: string[] } {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }

  const record = value as Record<string, unknown>;
  return Array.isArray(record.citationIds);
}

function validateCitationRefs(input: unknown, validIds: Set<string>, ctx: z.RefinementCtx, path: Array<string | number>) {
  if (isCitationBearingObject(input)) {
    const citationIds = input.citationIds;
    if ("value" in input && input.value !== null && citationIds.length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Non-null resolved facts require citation refs",
        path: [...path, "citationIds"]
      });
    }

    citationIds.forEach((citationId, index) => {
      if (!validIds.has(citationId)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Citation ref does not resolve: ${citationId}`,
          path: [...path, "citationIds", index]
        });
      }
    });
  }

  if (Array.isArray(input)) {
    input.forEach((item, index) => validateCitationRefs(item, validIds, ctx, [...path, index]));
    return;
  }

  if (!input || typeof input !== "object") {
    return;
  }

  Object.entries(input).forEach(([key, value]) => validateCitationRefs(value, validIds, ctx, [...path, key]));
}

export const coldStartCardSchema = coldStartCardObjectSchema.superRefine((card, ctx) => {
  const validIds = new Set(card.citations.map((citation) => citation.id));
  validateCitationRefs(card, validIds, ctx, []);
});

export type Citation = z.infer<typeof citationSchema>;
export type ColdStartCard = z.infer<typeof coldStartCardSchema>;
export type ResolvedFact<T> = {
  value: T | null;
  status: z.infer<typeof factStatusSchema>;
  confidence: z.infer<typeof confidenceSchema>;
  citationIds: string[];
};
export type SourcedText = z.infer<typeof sourcedTextSchema>;
