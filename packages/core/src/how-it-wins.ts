/*
 * The vocabulary and shape of the "How it wins" read. Eighty ways a company can win, in
 * thirteen groups, in the order the Lens edge draws them. Model-only: Cold Start decides the
 * read from the card's evidence; nothing here is user-editable.
 */
import { z } from "zod";
import { emphasisThinFileReason } from "./emphasis-read";

export type HowItWinsGroupId =
  | "accumulation" | "price" | "time" | "uniqueness" | "offense" | "defense" | "deception"
  | "timing" | "accreditation" | "collaboration" | "speed_and_scale" | "ease" | "transformation";

// Meanings are the prompt vocabulary and the single display source for every strategy note.
// The model selects a strategy; it never rewrites that strategy's meaning.
const GROUP_SOURCE = [
  {
    id: "accumulation", name: "Accumulation", entries: [
      ["usership", "Usership", "A critical mass of users makes the product more useful to each of them."],
      ["completeness", "Completeness", "One tool covers everything the buyer needs, so nothing else is required."],
      ["aggregation", "Aggregation", "An environment or marketplace built for broad participation."],
      ["diversification", "Diversification", "Low dependency on any one stream of customers, suppliers, or money."],
      ["omnipresence", "Omnipresence", "Available everywhere it might be needed and accepted by default."],
      ["cloning", "Cloning", "Expands by replicating identical copies of itself."]
    ]
  },
  {
    id: "price", name: "Price", entries: [
      ["affordability", "Affordability", "Costs less than the alternatives."],
      ["luxury", "Luxury", "Costs deliberately more, often labor-intensive or a status marker."],
      ["skimming", "Skimming", "Takes a large volume of tiny transactions or resources."],
      ["bundling", "Bundling", "Comes packaged free with something people already want."]
    ]
  },
  {
    id: "time", name: "Time", entries: [
      ["heritage", "Heritage", "A legacy that spans generations."],
      ["craftsmanship", "Craftsmanship", "Spends more time, precision, and attention than competitors do."],
      ["organic", "Organic", "Grows through a natural process that cannot be accelerated."],
      ["endurance", "Endurance", "Keeps operating continuously over a long period."]
    ]
  },
  {
    id: "uniqueness", name: "Uniqueness", entries: [
      ["specialization", "Specialization", "Strong competence in a narrow niche."],
      ["versatility", "Versatility", "General competence adapted to many tasks."],
      ["hybrid", "Hybrid", "Competence in two distinct areas, or two strengths not usually found together."],
      ["divergence", "Divergence", "Creativity and difference from the norm."],
      ["authenticity", "Authenticity", "Traceable to its source where counterfeits are common."],
      ["rarity", "Rarity", "Naturally limited in quantity."],
      ["scarcity", "Scarcity", "Artificially limited in quantity."],
      ["secrecy", "Secrecy", "Hard to copy because the knowledge is protected or the parts cannot be disentangled."],
      ["irreverence", "Irreverence", "Contrarian and counter-cultural, disregarding tradition."]
    ]
  },
  {
    id: "offense", name: "Offense", entries: [
      ["violence", "Violence", "Destroys or consumes the opponent through force."],
      ["litigation", "Litigation", "Weakens opponents through legal burden."],
      ["nettlesomeness", "Nettlesomeness", "Causes the opponent to make mistakes."],
      ["sabotage", "Sabotage", "Creates weaknesses in the opponent's structure or defenses."],
      ["parasitism", "Parasitism", "Extracts or hijacks resources from a host."],
      ["scavenging", "Scavenging", "Opportunistically takes in dying or weakened prey."],
      ["espionage", "Espionage", "Acquires the opponent's secrets."],
      ["swarming", "Swarming", "A concentrated attack from many individually weak agents."],
      ["highest_bidder", "Highest bidder", "Overpays or outbids competitors to secure exclusivity."],
      ["chokepoint", "Chokepoint", "Controls a passage that competitors or prey must pass through."],
      ["puppeteering", "Puppeteering", "Takes over a host's behavior and directs it."]
    ]
  },
  {
    id: "defense", name: "Defense", entries: [
      ["deterrence", "Deterrence", "Projects a credible threat of retaliation."],
      ["reliability", "Reliability", "Reduces maintenance and downtime."],
      ["predictability", "Predictability", "A repeatable process with little deviation."],
      ["unpredictability", "Unpredictability", "Creates surprise, confusion, or variability."],
      ["decentralization", "Decentralization", "Redundancy and distributed competence remove single points of failure."],
      ["security", "Security", "Resists theft, confiscation, and unwanted access."],
      ["privacy", "Privacy", "Protects against unwanted disclosure."],
      ["durability", "Durability", "Physically strong and resistant to damage."],
      ["neutrality", "Neutrality", "Displays long-term non-belligerence and offers a safe haven."],
      ["obscurity", "Obscurity", "Survives by remaining unknown or undetected."],
      ["antifragility", "Antifragility", "Gets stronger when exposed to stress or usage."]
    ]
  },
  {
    id: "deception", name: "Deception", entries: [
      ["camouflage", "Camouflage", "Blends into the surrounding environment."],
      ["mimicry", "Mimicry", "Superficially adopts another's characteristics to mislead."],
      ["decoy", "Decoy", "Distracts or misleads adversaries."],
      ["lure", "Lure", "Sets attractive traps."],
      ["infiltration", "Infiltration", "Gets past defenses without notice."]
    ]
  },
  {
    id: "timing", name: "Timing", entries: [
      ["first_mover", "First-mover", "Acts first to gain an advantage."],
      ["second_mover", "Second-mover", "Moves quickly to copy the first mover."],
      ["last_mover", "Last-mover", "Waits until opponents have spent themselves on failed approaches."]
    ]
  },
  {
    id: "accreditation", name: "Accreditation", entries: [
      ["monopoly", "Monopoly", "Control of a resource or market approved by a governing body."],
      ["prestige", "Prestige", "Endorsed by authoritative sources through awards, degrees, or recognition."],
      ["curation", "Curation", "Selective, with a particular ability to choose and group."]
    ]
  },
  {
    id: "collaboration", name: "Collaboration", entries: [
      ["union", "Union", "Reduces friction between potential competitors through a common set of rules."],
      ["alliance", "Alliance", "A partnership with some benefits of a union while staying independent."],
      ["emergence", "Emergence", "The wisdom of a crowd."],
      ["centralization", "Centralization", "A single decision-making entity."],
      ["standardization", "Standardization", "Emergent alignment that reduces friction."],
      ["symbiosis", "Symbiosis", "A mutually beneficial dependency between two organisms."],
      ["herding", "Herding", "Many individuals grouping to protect against larger competitors."],
      ["distributed_ownership", "Distributed ownership", "Owned by the community."],
      ["transparency", "Transparency", "An open and visible process that invites trust."]
    ]
  },
  {
    id: "speed_and_scale", name: "Speed and scale", entries: [
      ["iteration", "Iteration", "Iterates and changes quickly."],
      ["efficiency", "Efficiency", "Uses fewer resources than competitors for similar capability."],
      ["agility", "Agility", "Adapts easily to a changing environment."],
      ["precision", "Precision", "High accuracy and exactness in performance or output."],
      ["blitzing", "Blitzing", "A sudden, concentrated expenditure of intense resources."],
      ["composability", "Composability", "Components and systems assemble in different configurations."],
      ["modularity", "Modularity", "Independent units that combine in different ways."]
    ]
  },
  {
    id: "ease", name: "Ease", entries: [
      ["intuitiveness", "Intuitiveness", "Easy to use and understand without instruction."],
      ["fun", "Fun", "Provides enjoyment and amusement."],
      ["simplicity", "Simplicity", "Few points of failure and a minimal design."],
      ["low_friction", "Low-friction", "Minimal resistance or hassle in use."],
      ["charm", "Charm", "Creates loyalty and warmth through personality or aesthetics."]
    ]
  },
  {
    id: "transformation", name: "Transformation", entries: [
      ["malleability", "Malleability", "Changes appearance or form; easily modified or customized."],
      ["metamorphosis", "Metamorphosis", "Transforms between states optimized for different functions."],
      ["copycat", "Copycat", "Replicates another's method or style."]
    ]
  }
] as const;

// The literal union of all 80 ids, computed directly off the const vocabulary above rather
// than through the runtime map/flatMap below, so the type does not depend on TypeScript
// carrying literal types through those chained calls.
type HowItWinsStrategyIdLiteral = (typeof GROUP_SOURCE)[number]["entries"][number][0];

const STRATEGY_IDS = GROUP_SOURCE.flatMap((group) => group.entries.map((entry) => entry[0])) as [
  HowItWinsStrategyIdLiteral,
  ...HowItWinsStrategyIdLiteral[]
];

export const howItWinsStrategyIdSchema = z.enum(STRATEGY_IDS);
export type HowItWinsStrategyId = z.infer<typeof howItWinsStrategyIdSchema>;
export type HowItWinsStrategy = { id: HowItWinsStrategyId; name: string; group: HowItWinsGroupId; meaning: string };

export const HOW_IT_WINS_GROUPS: ReadonlyArray<{ id: HowItWinsGroupId; name: string; strategies: readonly HowItWinsStrategy[] }> =
  GROUP_SOURCE.map((group) => ({
    id: group.id,
    name: group.name,
    strategies: group.entries.map(([id, name, meaning]) => ({ id, name, group: group.id, meaning }) as HowItWinsStrategy)
  }));
export const HOW_IT_WINS_STRATEGIES: readonly HowItWinsStrategy[] = HOW_IT_WINS_GROUPS.flatMap((group) => group.strategies);
export const HOW_IT_WINS_STRATEGY_COUNT = HOW_IT_WINS_STRATEGIES.length;

const byId = new Map(HOW_IT_WINS_STRATEGIES.map((strategy) => [strategy.id, strategy]));
const normalizeName = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, "");
const byName = new Map(HOW_IT_WINS_STRATEGIES.map((strategy) => [normalizeName(strategy.name), strategy.id]));

export function howItWinsStrategyById(id: HowItWinsStrategyId): HowItWinsStrategy {
  const strategy = byId.get(id);
  if (!strategy) throw new Error(`Unknown strategy id: ${id}`);
  return strategy;
}
export function howItWinsStrategyIdForName(name: string): HowItWinsStrategyId | null {
  return byName.get(normalizeName(name)) ?? byId.get(name as HowItWinsStrategyId)?.id ?? null;
}

const citationIds = z.array(z.string().min(1));
export const howItWinsRunningSchema = z.object({
  strategy: howItWinsStrategyIdSchema,
  meaning: z.string().min(1),
  note: z.string().min(1),
  citationIds: citationIds.min(1)
});
export const howItWinsPairSchema = z.object({
  // Readonly so the inferred type accepts the `as const` tuple literal the LLM driver and
  // tests both construct (a plain mutable tuple type rejects a readonly one under strict TS).
  strategies: z.tuple([howItWinsStrategyIdSchema, howItWinsStrategyIdSchema]).readonly(),
  note: z.string().min(1),
  wrongIf: z.string().min(1),
  citationIds: citationIds.min(1)
});
export const howItWinsNextSchema = z.object({
  strategy: howItWinsStrategyIdSchema,
  note: z.string().min(1),
  citationIds
});
export const howItWinsInQuestionSchema = howItWinsNextSchema;

export const HOW_IT_WINS_DISPLAY_IN_QUESTION_MAX = 8;

// A plain object schema (no superRefine) so discriminatedUnion below can read its shape.
// z.discriminatedUnion needs a real ZodObject per branch, not the ZodEffects a superRefine
// produces, so the cross-field checks run through checkHowItWinsRead instead, applied both
// to the standalone read schema and to the "read" branch of the union.
const howItWinsReadObjectSchema = z.object({
  status: z.literal("read"),
  sentence: z.string().min(1),
  running: z.array(howItWinsRunningSchema).min(2).max(4),
  pair: howItWinsPairSchema.nullable(),
  next: z.array(howItWinsNextSchema).max(2),
  inQuestion: z.array(howItWinsInQuestionSchema).max(HOW_IT_WINS_DISPLAY_IN_QUESTION_MAX).default([]),
  wrongIf: z.string().min(1)
});

function checkHowItWinsRead(value: z.infer<typeof howItWinsReadObjectSchema>, ctx: z.RefinementCtx) {
  const running = value.running.map((entry) => entry.strategy);
  if (new Set(running).size !== running.length) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["running"], message: "running strategies must be distinct" });
  }
  if (value.pair) {
    const [a, b] = value.pair.strategies;
    if (a === b) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["pair"], message: "pair strategies must differ" });
    for (const leg of [a, b]) {
      if (!running.includes(leg)) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["pair"], message: `pair leg ${leg} is not a running strategy` });
      }
    }
  }
  const next = value.next.map((entry) => entry.strategy);
  for (const entry of value.next) {
    if (running.includes(entry.strategy)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["next"], message: `${entry.strategy} is already running` });
    }
  }
  const inQuestion = value.inQuestion.map((entry) => entry.strategy);
  if (new Set(inQuestion).size !== inQuestion.length) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["inQuestion"], message: "in-question strategies must be distinct" });
  }
  for (const entry of value.inQuestion) {
    if (running.includes(entry.strategy)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["inQuestion"], message: `${entry.strategy} is already running` });
    }
    if (next.includes(entry.strategy)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["inQuestion"], message: `${entry.strategy} is already queued as not yet` });
    }
  }
}

export const howItWinsReadSchema = howItWinsReadObjectSchema.superRefine(checkHowItWinsRead);

// nothing_stands_out carries the model's own sentence naming the category when the model
// decided it; the sentence is absent when the verifier degraded a read in code, and the UI
// then falls back to its fixed empty copy.
export const howItWinsSchema = z.discriminatedUnion("status", [
  howItWinsReadObjectSchema,
  z.object({
    status: z.literal("nothing_stands_out"),
    sentence: z.string().min(1).optional(),
    inQuestion: z.array(howItWinsInQuestionSchema).max(HOW_IT_WINS_DISPLAY_IN_QUESTION_MAX).default([])
  }),
  z.object({ status: z.literal("thin_file") })
]).superRefine((value, ctx) => {
  if (value.status === "read") checkHowItWinsRead(value, ctx);
});
export type HowItWins = z.infer<typeof howItWinsSchema>;
export type HowItWinsRead = z.infer<typeof howItWinsReadSchema>;

// The same gate as the emphasis read, deliberately one implementation: a card too thin for
// one read is too thin for the other, and both run before any model call.
export const howItWinsThinFileReason = emphasisThinFileReason;

// Verifier degrade rules from the spec: the pair dies if its own note drops or either leg
// drops; the read degrades to nothing_stands_out if fewer than two running strategies survive.
export function applyHowItWinsVerification(
  read: HowItWinsRead,
  keep: { running: boolean[]; pair: boolean; inQuestion?: boolean[] }
): { howItWins: HowItWins; dropReason?: "running-dropped" | "pair-dropped" } {
  const running = read.running.filter((_, index) => keep.running[index] === true);
  const filedInQuestion = read.inQuestion ?? [];
  const inQuestionKeep = keep.inQuestion ?? filedInQuestion.map(() => true);
  const inQuestion = filedInQuestion.filter((entry, index) => {
    if (inQuestionKeep[index] !== true) return false;
    return !running.some((item) => item.strategy === entry.strategy)
      && !read.next.some((item) => item.strategy === entry.strategy);
  });
  if (running.length < 2) {
    return {
      howItWins: { status: "nothing_stands_out", inQuestion },
      dropReason: "running-dropped"
    };
  }
  const survivors = new Set(running.map((entry) => entry.strategy));
  const pairAlive = read.pair !== null && keep.pair && read.pair.strategies.every((leg) => survivors.has(leg));
  const pair = pairAlive ? read.pair : null;
  const dropped = running.length !== read.running.length || (read.pair !== null && !pairAlive);
  const howItWins: HowItWinsRead = { ...read, running, pair, inQuestion };
  return dropped ? { howItWins, dropReason: read.pair !== null && !pairAlive ? "pair-dropped" : "running-dropped" } : { howItWins };
}
