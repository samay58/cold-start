import { howItWinsSchema } from "@cold-start/core";
import { z } from "zod";

export const POSITIVE_CHIPS = ["sharper-thesis", "better-comps", "more-honest", "deeper-evidence", "tighter", "better-voice"] as const;
export const INVERSE_CHIPS = ["slop", "generic", "padded", "template-question"] as const;

const eraBucketSchema = z.enum(["may-pre-gate", "june", "july-overhaul", "august-current"]);
const richnessBandSchema = z.enum(["thin", "medium", "rich"]);

export const poolEntrySchema = z.object({
  slug: z.string().min(1),
  richnessBand: richnessBandSchema,
  eraBucket: eraBucketSchema,
  control: z.boolean()
});

export const sessionPlanSchema = z.object({
  seed: z.string().min(1),
  groupSize: z.number().int().positive(),
  rounds: z.array(
    z.object({
      index: z.number().int().nonnegative(),
      slugs: z.array(z.string().min(1)),
      mixedBand: z.boolean()
    })
  )
});

export type SessionPlan = z.infer<typeof sessionPlanSchema>;

export const corpusIndexRowSchema = z.object({
  slug: z.string().min(1),
  name: z.string().min(1),
  domain: z.string().min(1),
  createdAt: z.string(),
  updatedAt: z.string(),
  eraBucket: eraBucketSchema,
  hasSynthesis: z.boolean(),
  sourceCount: z.number().int().nonnegative(),
  sourceQuality: z.record(z.number().int().nonnegative()),
  citationCount: z.number().int().nonnegative(),
  bullCount: z.number().int().nonnegative(),
  bearCount: z.number().int().nonnegative(),
  openQuestionCount: z.number().int().nonnegative(),
  sectionsPresent: z.array(z.string()),
  richnessScore: z.number(),
  richnessBand: richnessBandSchema,
  routing: z.record(z.string()).nullable(),
  costUsd: z.number().nullable()
});

export type CorpusIndexRow = z.infer<typeof corpusIndexRowSchema>;

export type CondensedView = {
  slug: string;
  name: string;
  callNumber: string;
  stats: { label: string; value: string }[];
  thesis: string | null;
  bullLead: string | null;
  bearLead: string | null;
  comps: string[];
  nextQuestion: string | null;
  sourceLine: string;
};

const quickPick = z.object({
  kind: z.literal("quick-pick"),
  roundIndex: z.number().int().nonnegative(),
  group: z.array(z.string()).min(3).max(6),
  winner: z.string(),
  runnerUp: z.string().optional(),
  chips: z.array(z.enum(POSITIVE_CHIPS)).default([]),
  note: z.string().default(""),
  knowsSpace: z.boolean().default(false)
});

const deepSingle = z.object({
  kind: z.literal("deep-single"),
  slug: z.string(),
  tier: z.enum(["S", "A", "B"]),
  layers: z.enum(["facts", "read", "both"]),
  chips: z.array(z.enum([...POSITIVE_CHIPS, ...INVERSE_CHIPS])).default([]),
  missingComps: z.array(z.string()).default([]),
  note: z.string().default(""),
  knowsSpace: z.boolean().default(false)
});

export const HOW_IT_WINS_RATINGS = ["ship", "weak", "slop"] as const;

const howItWinsRatingSchema = z.enum(HOW_IT_WINS_RATINGS);

const howItWins = z.object({
  kind: z.literal("how-it-wins"),
  slug: z.string(),
  pick: z.enum(["A", "B", "neither"]),
  ratings: z.object({ A: howItWinsRatingSchema, B: howItWinsRatingSchema }),
  note: z.string().default("")
});

const pair = z.object({
  kind: z.literal("pair"),
  pairId: z.string(),
  slug: z.string(),
  winner: z.enum(["A", "B"]),
  chips: z.array(z.enum([...POSITIVE_CHIPS, ...INVERSE_CHIPS])).default([]),
  note: z.string().default("")
});

// zod v3 rejects refined objects inside discriminatedUnion, so the quick-pick
// group invariants live on the union instead of the member.
export const ledgerEventInputSchema = z
  .discriminatedUnion("kind", [quickPick, deepSingle, pair, howItWins])
  .superRefine((event, ctx) => {
    if (event.kind !== "quick-pick") return;
    if (!event.group.includes(event.winner)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "winner must be in group" });
    }
    if (event.runnerUp && (!event.group.includes(event.runnerUp) || event.runnerUp === event.winner)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "runnerUp must be a non-winner group member" });
    }
  });

type LedgerEventInput = z.infer<typeof ledgerEventInputSchema>;
export type LedgerEvent = LedgerEventInput & { ts: string };

// The two writer arms of one card, frozen by scripts/how-it-wins-corpus.ts. The rig parses each
// read with the shipped schema, so a malformed file fails here rather than inside a component.
const howItWinsUsageSchema = z.object({
  inputTokens: z.number(),
  outputTokens: z.number(),
  estimatedCostUsd: z.number(),
  durationMs: z.number()
});

const howItWinsArmSchema = z.object({
  writer: z.string().min(1),
  preVerify: howItWinsSchema,
  read: howItWinsSchema,
  dropReason: z.enum(["running-dropped", "pair-dropped"]).optional(),
  editorSkipped: z.boolean(),
  fitRetried: z.boolean(),
  styleIssues: z.array(z.string()),
  usage: howItWinsUsageSchema
});

export const howItWinsFileSchema = z.object({
  slug: z.string().min(1),
  name: z.string().min(1),
  domain: z.string().min(1),
  editor: z.string().min(1),
  arms: z.object({ A: howItWinsArmSchema, B: howItWinsArmSchema }),
  key: z.object({ A: z.string().min(1), B: z.string().min(1) })
});

export const howItWinsIndexRowSchema = z.object({
  slug: z.string().min(1),
  name: z.string().min(1),
  domain: z.string().min(1),
  createdAt: z.string()
});

export type HowItWinsFile = z.infer<typeof howItWinsFileSchema>;
export type HowItWinsRating = (typeof HOW_IT_WINS_RATINGS)[number];
export const HOW_IT_WINS_RATING_LABEL: Record<HowItWinsRating, string> = {
  ship: "Ship",
  weak: "Weak",
  slop: "Slop"
};
