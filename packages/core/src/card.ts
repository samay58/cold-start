import { z } from "zod";
import { companyDescriptionSchema } from "./intelligence";
import { safePublicImageUrl, safeWebUrl } from "./external-url";
import { howItWinsSchema } from "./how-it-wins";

const webUrlSchema = z.string().max(2_048).refine((value) => safeWebUrl(value) !== null, {
  message: "Expected a safe HTTP(S) URL"
});
const publicImageUrlSchema = z.preprocess(
  (value) => safePublicImageUrl(value),
  z.string().url().nullable()
);

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
      "founder_authored",
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
  sourceUrl: webUrlSchema.nullable(),
  email: z.string().email().nullable().optional(),
  // Provenance for `email`: "observed" = the exact address appeared in a public
  // source (e.g. a GitHub commit); "inferred" = constructed from the domain email
  // pattern and never seen directly. Stripped from the public card alongside email.
  emailStatus: z.enum(["observed", "inferred"]).nullable().optional(),
  // Short private provenance for inferred addresses, such as the winning domain pattern
  // and number of observed anchors. Meaningless without email, so publicCard strips it too.
  emailBasis: z.string().min(1).nullable().optional(),
  // Public professional presence. Public-safe (unlike email), so it survives publicCard().
  githubUrl: webUrlSchema.nullable().optional(),
  xUrl: webUrlSchema.nullable().optional(),
  personalUrl: webUrlSchema.nullable().optional(),
  // Extension-tier person insight (investor-taste-kernel voice), not a public sourced
  // fact. Nested so the field is literally named `citationIds`: validateCitationRefs
  // below only validates arrays with that exact property name. Stripped from the
  // public card alongside email/emailStatus.
  read: z.object({
    text: z.string().min(1),
    citationIds: z.array(z.string().min(1)).min(1)
  }).nullable().optional()
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

// The sixth Lens category: what the company and its founders are loud about, what never
// appears in the filed record, and the smallest inference that asymmetry supports. Quiet is
// a plain string scoped to the file ("Nothing filed shows..."), so it carries no citations;
// Loud and Read cite like any synthesis claim. thin_file is decided in code before any model
// call; nothing_notable is model-decided and also the fallback when the verifier kills a read.
export const emphasisReadFiledSchema = z.object({
  status: z.literal("read"),
  loud: sourcedTextSchema,
  quiet: z.string().min(1),
  read: sourcedTextSchema,
  wouldChangeIf: z.string().min(1)
});

export const emphasisReadSchema = z.discriminatedUnion("status", [
  emphasisReadFiledSchema,
  z.object({ status: z.literal("thin_file") }),
  z.object({ status: z.literal("nothing_notable") })
]);
export type EmphasisRead = z.infer<typeof emphasisReadSchema>;
export type EmphasisReadFiled = z.infer<typeof emphasisReadFiledSchema>;

// The synthesis prompt's "use null when sources do not support a field" license reaches one
// level deeper than the claim: models sometimes null the text inside the claim object
// ({text: null}) instead of the claim itself. That shape means the same honest absence, so it
// normalizes to an absent claim instead of failing the parse after synthesis was paid for. A
// claim with real text but malformed citations is a contradictory partial and stays invalid.
const timingClaimSchema = z.preprocess((value) => {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return value;
  }
  const text = (value as { text?: unknown }).text;
  return typeof text === "string" && text.length > 0 ? value : null;
}, sourcedTextSchema.nullable());

export const marketStructureAndTimingSchema = z.object({
  buyerBudget: timingClaimSchema,
  painSeverity: timingClaimSchema,
  adoptionTrigger: timingClaimSchema,
  marketStructure: timingClaimSchema,
  profitPool: timingClaimSchema,
  expansionPath: timingClaimSchema,
  timingRisk: timingClaimSchema
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
  emphasisRead: emphasisReadSchema.optional(),
  howItWins: howItWinsSchema.optional(),
  // The synthesis prompt tells the model "use null when sources do not support a field" for the
  // fields inside this container; models sometimes null the whole container instead of its seven
  // fields. Coerce that null to undefined before validating so it means the same thing as an
  // omitted key, rather than a permanent parse failure (packages/llm/src/synthesis.ts prompt and
  // tool schema already tolerate this per-field; this preprocess extends the same tolerance to
  // the container itself without widening the parsed type away from `| undefined`).
  marketStructureAndTiming: z.preprocess(
    (value) => (value === null ? undefined : value),
    marketStructureAndTimingSchema.optional()
  // A container whose seven claims all normalized away carries nothing; collapse it to
  // undefined so downstream surfaces see one absence shape instead of two.
  ).transform((value) =>
    value && Object.values(value).some((claim) => claim !== null) ? value : undefined
  )
});

// Durable record of a synthesis-floor block: written by the pipeline when the gate refuses
// to run synthesis for insufficient evidence, cleared the next time a run produces synthesis.
// Metadata about the run, not a citation-bearing fact, so it carries no `citationIds` field
// and validateCitationRefs below skips it like any other plain value. Stripped from the
// public card alongside synthesis.
export const synthesisWithheldSchema = z.object({
  at: z.string().datetime(),
  reasons: z.array(z.string()),
  advisories: z.array(z.string()),
  citationCount: z.number().int().nonnegative(),
  sourceTypeCount: z.number().int().nonnegative()
});

// The long-form company description behind the header's "(more)" affordance: a short plain
// memo saying what the company makes and who uses it, how it makes money, and where it sits
// among the players around it. Descriptive only; bull, bear, and risk language stays in the
// gated synthesis. Grounded in card citations like any other citation-bearing block, so
// validateCitationRefs covers it. Absent means the surface falls back to the one-liner tier
// inside identity.description.
export const expandedDescriptionSchema = z.object({
  paragraphs: z.array(z.string().min(1)).min(1).max(4),
  citationIds: z.array(z.string().min(1)).min(1)
});
export type ExpandedDescription = z.infer<typeof expandedDescriptionSchema>;

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
    logoUrl: publicImageUrlSchema,
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
  // One sentence naming the specific competitive slice this company sits in and how crowded
  // that slice is. Citation-backed like every other resolved fact; extracted only when cited
  // evidence supports it, never invented market commentary. Card JSON only, no normalized rows.
  competitionFraming: resolvedFactSchema(z.string().min(1)).optional(),
  expandedDescription: expandedDescriptionSchema.optional(),
  citations: z.array(citationSchema),
  synthesis: synthesisSchema.optional(),
  synthesisWithheld: synthesisWithheldSchema.optional()
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

export const coldStartCardSchema = coldStartCardObjectSchema
  .superRefine((card, ctx) => {
    const validIds = new Set(card.citations.map((citation) => citation.id));
    validateCitationRefs(card, validIds, ctx, []);
  })
  // A filed read and a withheld record describe the same slot and cannot both be true. The
  // storage merge already drops the withheld record whenever synthesis survives; this keeps any
  // other write path from storing a card the extension would have to guess about.
  .refine((card) => !(card.synthesis && card.synthesisWithheld), {
    message: "a card carries either synthesis or synthesisWithheld, never both",
    path: ["synthesisWithheld"]
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
export type SynthesisWithheld = z.infer<typeof synthesisWithheldSchema>;
