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
  sourceUrl: z.string().url().nullable()
});

export const signalSchema = z.object({
  title: z.string().min(1),
  url: z.string().url(),
  date: z.string().min(1),
  source: z.string().min(1),
  category: z.enum(["news", "hiring", "launch", "funding", "filing", "github", "other"]),
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

export const synthesisSchema = z.object({
  whyItMatters: sourcedTextSchema,
  bullCase: z.array(sourcedTextSchema),
  bearCase: z.array(sourcedTextSchema),
  openQuestions: z.array(z.string().min(1))
});

export const coldStartCardSchema = z.object({
  slug: z.string().min(1),
  domain: z.string().min(1),
  generatedAt: z.string().datetime(),
  generationCostUsd: z.number().nonnegative(),
  cacheStatus: z.enum(["hit", "partial", "miss"]),
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

export type Citation = z.infer<typeof citationSchema>;
export type ColdStartCard = z.infer<typeof coldStartCardSchema>;
export type ResolvedFact<T> = {
  value: T | null;
  status: z.infer<typeof factStatusSchema>;
  confidence: z.infer<typeof confidenceSchema>;
  citationIds: string[];
};
export type SourcedText = z.infer<typeof sourcedTextSchema>;
