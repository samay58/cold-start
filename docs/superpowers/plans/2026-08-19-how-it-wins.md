# How It Wins Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the "How it wins" read end to end: schema, four-pass prompt, memoized analysis step, verifier hookup, the Lens folds (Why now into Why care; Bull and Bear into "The case"), the notched-edge crown with its motion, tests, an eval gate, and twenty real cards in the eval rig for a blind read, with production kept at `HOW_IT_WINS_ENABLED=false` until the blind read.

**Architecture:** `packages/core` owns the 80-strategy vocabulary, the `synthesis.howItWins` schema, and the verifier degrade rules. `packages/llm` owns the four-pass driver (writer model chain, hostile editor on a different provider) and the copy-shape checks. `apps/web/src/inngest` adds one memoized step `how-it-wins` between `emphasis-read` and `verify-synthesis`; its running and pair notes ride the existing verify call behind the emphasis claims. The extension's `investor-lens.ts` display model folds two rows and adds `howItWins`; a new `HowItWinsEdge.tsx` draws the crown over a pure geometry module. The eval scorer gains a strategy-frequency gate; a script writes twenty reads from frozen corpus evidence into `eval/curation/how-it-wins/` and a new `/eval/how-it-wins` route shows them for a blind verdict.

**Tech Stack:** TypeScript, zod, Next.js 15 (apps/web), Inngest step executor, React 19 + Vite (apps/extension), vitest + jsdom, Playwright, node:test for `eval/`.

**Spec:** `docs/superpowers/specs/2026-08-18-moat-read-design.md` (read it whole first; the mock is `docs/product/design/2026-08-18-moat-read-direction/gen.py`, the prompt experiment is `prompt-test/` in the same folder).

## Global Constraints

- No em dashes anywhere (code, comments, copy, prompts). Slopcheck every user-facing string and prompt file: `python3 ~/.claude/scripts/slopcheck.py <file>`; zero kill-list hits.
- Never attribute the framework's author inside the product. Never write "moat" in product copy.
- Banned micro-copy (a test asserts none of these render): `"cut"`, `"open to it"`, `"could be next"`, `"the pair"`, `"one of its"`, `"not this one"`. Readouts are strategy names alone; `"Standardization, not yet"` for a hollow mark; `"Wrong if"` for the rebuttal; `"N of 80 strategies"` for the count; `"pinned"` for the pin receipt.
- The read is model-only. No user annotation anywhere.
- No word caps on model copy. Certainty stated once per note. Meaning lines are complete sentences.
- The sentence at rest carries evidence plus mechanism. If the model cannot write it plainly, the read is `nothing_stands_out`.
- Ink only on the crown: no `--color-seal` anywhere in the crown CSS or SVG.
- Nothing animates at rest. The plate never changes height on hover. Notes never cover the sentence.
- Every collection surface that can reach zero items ships with that state fixture-covered.
- Remove before add: every task that adds a string, row, token, or file names what it removed.
- The writing standard and hostile editor prompts are used verbatim (a test diffs the code constants against `prompt-test/writing-standard.md` and `prompt-test/hostile-editor.md`).
- Inngest step ids and event names freeze once shipped: `how-it-wins` (step), `how-it-wins.started`, `how-it-wins.complete` (events).
- Contract version becomes `2026-08-19.how-it-wins-v1`. Extension rebuilds. Firefox build stays green.
- `npm run check` green by exit code, never piped through `tail`.
- Production keeps `HOW_IT_WINS_ENABLED=false` (set on Vercel before deploy) until Samay has blind-read twenty cards.

## Working tree

Sibling worktree so the root eslint sweep never sees it: `git worktree add ../cold-start-how-it-wins -b how-it-wins` then `npm ci` inside it. All paths below are relative to that worktree.

## File map

Create:
- `packages/core/src/how-it-wins.ts` (vocabulary, schema, degrade rules, thin-file alias), `packages/core/tests/how-it-wins.test.ts`
- `packages/llm/src/how-it-wins-prompts.ts` (verbatim standard and editor, task and slot text), `packages/llm/src/how-it-wins.ts` (four-pass driver, parsing, style checks), `packages/llm/tests/how-it-wins.test.ts`, `packages/llm/tests/fixtures/how-it-wins-irregular.json`
- `apps/web/src/inngest/how-it-wins.ts` (step body), `apps/web/tests/how-it-wins.test.ts`, `apps/web/tests/generate-analysis-how-it-wins-steps.test.ts`
- `apps/extension/src/research/how-it-wins-edge.ts` (pure geometry and copy), `apps/extension/src/research/HowItWinsEdge.tsx`, `apps/extension/src/styles/how-it-wins.css`, `apps/extension/tests/how-it-wins-edge.test.ts`, `apps/extension/tests/how-it-wins-edge.test.tsx`
- `scripts/how-it-wins-corpus.ts` (twenty reads from frozen corpus), `apps/web/src/app/eval/how-it-wins/page.tsx`, `apps/web/src/app/eval/how-it-wins/HowItWinsReview.tsx`, `apps/web/tests/eval-how-it-wins.test.ts`

Modify:
- `packages/core/src/card.ts` (synthesis gets `howItWins`), `packages/core/src/index.ts`, `packages/core/src/generation-trace.ts` (stage + trace block), `packages/core/api-contract.json`, `packages/core/src/alpha-analytics.ts` (add `the-case` category id)
- `packages/llm/src/llm-provider.ts` (stage `how_it_wins`), `packages/llm/src/index.ts`
- `packages/pipeline/src/generate-card.ts` (verify extras + degrade), `apps/web/src/inngest/generation-helpers.ts`, `apps/web/src/inngest/functions.ts`, `apps/web/src/inngest/worker-env.ts`
- `apps/extension/src/research/investor-lens.ts`, `investor-read-copy.ts`, `InvestorReadCard.tsx`, `AnalysisWaitInstrument.tsx`, `apps/extension/src/styles.css`, tests under `apps/extension/tests/` that name the old rows
- `apps/web/src/lib/card-face/model.ts` (`INVESTOR_READ_LABELS`), `apps/web/src/app/eval/LensView.tsx`, `apps/web/src/app/eval/types.ts`, `apps/web/src/app/eval/api/ledger/route.ts`
- `eval/investor-lens/score.mjs`, `eval/investor-lens/score.test.mjs`
- `.gitignore` (`eval/curation/how-it-wins/`), `DESIGN.md`, `CLAUDE.md`, `AGENTS.md`, `docs/anthropic-llm-call-map.md`, the spec

Removed as part of the folds: the `why-now` category and its `LensTiming` type, `timingDisplay`, `TIMING_FIELD_ORDER`, `timingIsNotFound` (if nothing else imports it), the `timing` disclosure id in the extension, the seven-field timing rendering in `LensCategoryBody`, the `must-be-true` and `could-break` categories (replaced by one `the-case`), the labels "If true" and "It breaks if" (replaced by "Bull" and "Bear"), the empty copy `LENS_TENSION_EMPTY_COPY.both` if unused. `marketStructureAndTiming` stays in the schema and prompt (the extension network layer still uses it as a run-completion signal); only its Lens row goes.

---

### Task 1: Core vocabulary, schema, degrade rules

**Files:**
- Create: `packages/core/src/how-it-wins.ts`, `packages/core/tests/how-it-wins.test.ts`
- Modify: `packages/core/src/card.ts` (synthesisSchema), `packages/core/src/index.ts`

**Interfaces produced:**
```ts
export type HowItWinsStrategyId = z.infer<typeof howItWinsStrategyIdSchema>; // 80 snake_case ids
export type HowItWinsStrategy = { id: HowItWinsStrategyId; name: string; group: HowItWinsGroupId; meaning: string };
export const HOW_IT_WINS_GROUPS: ReadonlyArray<{ id: HowItWinsGroupId; name: string; strategies: readonly HowItWinsStrategy[] }>;
export const HOW_IT_WINS_STRATEGIES: readonly HowItWinsStrategy[]; // 80, edge order
export const HOW_IT_WINS_STRATEGY_COUNT = 80;
export function howItWinsStrategyById(id: HowItWinsStrategyId): HowItWinsStrategy;
export function howItWinsStrategyIdForName(name: string): HowItWinsStrategyId | null; // case/punct-insensitive
export const howItWinsReadSchema, howItWinsSchema; export type HowItWins, HowItWinsRead;
export function applyHowItWinsVerification(read: HowItWinsRead, keep: { running: boolean[]; pair: boolean }): { howItWins: HowItWins; dropReason?: "running-dropped" | "pair-dropped" };
export const howItWinsThinFileReason = emphasisThinFileReason; // same gate, one implementation
```

- [ ] **Step 1: Write the failing tests** (`packages/core/tests/how-it-wins.test.ts`)

```ts
import { describe, expect, it } from "vitest";
import {
  HOW_IT_WINS_GROUPS, HOW_IT_WINS_STRATEGIES, applyHowItWinsVerification, howItWinsSchema,
  howItWinsStrategyIdForName, synthesisSchema
} from "../src";

const running = (strategy: string, id = "c1") => ({
  strategy, meaning: "It wins by doing one narrow thing better than anyone else.",
  note: `Twenty of its thirty-seven people work on that one problem [${id}].`, citationIds: [id]
});
const read = {
  status: "read" as const,
  sentence: "OpenAI and Anthropic cite its benchmarks by name in their model safety documents; dropping it later would show.",
  running: [running("hybrid"), running("chokepoint", "c2"), running("prestige", "c3")],
  pair: { strategies: ["hybrid", "chokepoint"] as const, note: "The method produces the named benchmarks the labs cite [c1][c2].", wrongIf: "A lab swaps evaluators without a visible change in its documentation.", citationIds: ["c1", "c2"] },
  next: [{ strategy: "standardization", note: "Only two labs have adopted it; a third lab or a standards body would have to converge on it.", citationIds: [] }],
  wrongIf: "A lab builds the evaluation in-house and stops citing outside benchmarks."
};

describe("how it wins vocabulary", () => {
  it("has 80 strategies in 13 groups with the fixed group sizes", () => {
    expect(HOW_IT_WINS_STRATEGIES).toHaveLength(80);
    expect(HOW_IT_WINS_GROUPS.map((g) => g.strategies.length)).toEqual([6, 4, 4, 9, 11, 11, 5, 3, 3, 9, 7, 5, 3]);
    expect(new Set(HOW_IT_WINS_STRATEGIES.map((s) => s.id)).size).toBe(80);
  });
  it("maps display names to ids loosely", () => {
    expect(howItWinsStrategyIdForName("Highest bidder")).toBe("highest_bidder");
    expect(howItWinsStrategyIdForName("low-friction")).toBe("low_friction");
    expect(howItWinsStrategyIdForName("Made up")).toBeNull();
  });
});

describe("howItWinsSchema", () => {
  it("round-trips all three statuses", () => {
    expect(howItWinsSchema.parse(read)).toEqual(read);
    expect(howItWinsSchema.parse({ status: "nothing_stands_out", sentence: "It competes the way most LLM tooling companies do." }).status).toBe("nothing_stands_out");
    expect(howItWinsSchema.parse({ status: "nothing_stands_out" }).status).toBe("nothing_stands_out");
    expect(howItWinsSchema.parse({ status: "thin_file" })).toEqual({ status: "thin_file" });
  });
  it("rejects a pair whose leg is not running, a duplicate running strategy, and a next that is already running", () => {
    expect(howItWinsSchema.safeParse({ ...read, pair: { ...read.pair, strategies: ["hybrid", "usership"] } }).success).toBe(false);
    expect(howItWinsSchema.safeParse({ ...read, running: [running("hybrid"), running("hybrid")] }).success).toBe(false);
    expect(howItWinsSchema.safeParse({ ...read, next: [{ strategy: "hybrid", note: "x", citationIds: [] }] }).success).toBe(false);
  });
  it("legacy synthesis without the field still parses", () => {
    const legacy = { whyItMatters: { text: "a [c1]", citationIds: ["c1"] }, bullCase: [], bearCase: [], openQuestions: [] };
    expect(synthesisSchema.parse(legacy).howItWins).toBeUndefined();
  });
});

describe("applyHowItWinsVerification", () => {
  it("keeps everything when every claim survives", () => {
    expect(applyHowItWinsVerification(read, { running: [true, true, true], pair: true })).toEqual({ howItWins: read });
  });
  it("kills the pair when a leg drops and keeps the running strategies", () => {
    const out = applyHowItWinsVerification(read, { running: [false, true, true], pair: true });
    expect(out.dropReason).toBe("pair-dropped");
    expect(out.howItWins.status).toBe("read");
    if (out.howItWins.status === "read") { expect(out.howItWins.pair).toBeNull(); expect(out.howItWins.running.map((r) => r.strategy)).toEqual(["chokepoint", "prestige"]); }
  });
  it("kills the pair when its own note drops", () => {
    expect(applyHowItWinsVerification(read, { running: [true, true, true], pair: false }).howItWins).toMatchObject({ status: "read", pair: null });
  });
  it("degrades to nothing_stands_out when fewer than two running survive", () => {
    expect(applyHowItWinsVerification(read, { running: [false, false, true], pair: true })).toEqual({ howItWins: { status: "nothing_stands_out" }, dropReason: "running-dropped" });
  });
});
```

- [ ] **Step 2: Run to verify failure**: `npm test -w @cold-start/core -- how-it-wins` fails (module missing).

- [ ] **Step 3: Implement `packages/core/src/how-it-wins.ts`**

```ts
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

type Entry = readonly [id: string, name: string, meaning: string];
const G = (id: HowItWinsGroupId, name: string, entries: readonly Entry[]) => ({ id, name, entries });

// Meanings are the prompt's vocabulary (one plain sentence each). The model writes its own
// meaning line per running strategy; these are never shown in the UI.
const GROUP_SOURCE = [
  G("accumulation", "Accumulation", [
    ["usership", "Usership", "A critical mass of users makes the product more useful to each of them."],
    ["completeness", "Completeness", "One tool covers everything the buyer needs, so nothing else is required."],
    ["aggregation", "Aggregation", "An environment or marketplace built for broad participation."],
    ["diversification", "Diversification", "Low dependency on any one stream of customers, suppliers, or money."],
    ["omnipresence", "Omnipresence", "Available everywhere it might be needed and accepted by default."],
    ["cloning", "Cloning", "Expands by replicating identical copies of itself."]
  ]),
  G("price", "Price", [
    ["affordability", "Affordability", "Costs less than the alternatives."],
    ["luxury", "Luxury", "Costs deliberately more, often labor-intensive or a status marker."],
    ["skimming", "Skimming", "Takes a large volume of tiny transactions or resources."],
    ["bundling", "Bundling", "Comes packaged free with something people already want."]
  ]),
  G("time", "Time", [
    ["heritage", "Heritage", "A legacy that spans generations."],
    ["craftsmanship", "Craftsmanship", "Spends more time, precision, and attention than competitors do."],
    ["organic", "Organic", "Grows through a natural process that cannot be accelerated."],
    ["endurance", "Endurance", "Keeps operating continuously over a long period."]
  ]),
  G("uniqueness", "Uniqueness", [
    ["specialization", "Specialization", "Strong competence in a narrow niche."],
    ["versatility", "Versatility", "General competence adapted to many tasks."],
    ["hybrid", "Hybrid", "Competence in two distinct areas, or two strengths not usually found together."],
    ["divergence", "Divergence", "Creativity and difference from the norm."],
    ["authenticity", "Authenticity", "Traceable to its source where counterfeits are common."],
    ["rarity", "Rarity", "Naturally limited in quantity."],
    ["scarcity", "Scarcity", "Artificially limited in quantity."],
    ["secrecy", "Secrecy", "Hard to copy because the knowledge is protected or the parts cannot be disentangled."],
    ["irreverence", "Irreverence", "Contrarian and counter-cultural, disregarding tradition."]
  ]),
  G("offense", "Offense", [
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
  ]),
  G("defense", "Defense", [
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
  ]),
  G("deception", "Deception", [
    ["camouflage", "Camouflage", "Blends into the surrounding environment."],
    ["mimicry", "Mimicry", "Superficially adopts another's characteristics to mislead."],
    ["decoy", "Decoy", "Distracts or misleads adversaries."],
    ["lure", "Lure", "Sets attractive traps."],
    ["infiltration", "Infiltration", "Gets past defenses without notice."]
  ]),
  G("timing", "Timing", [
    ["first_mover", "First-mover", "Acts first to gain an advantage."],
    ["second_mover", "Second-mover", "Moves quickly to copy the first mover."],
    ["last_mover", "Last-mover", "Waits until opponents have spent themselves on failed approaches."]
  ]),
  G("accreditation", "Accreditation", [
    ["monopoly", "Monopoly", "Control of a resource or market approved by a governing body."],
    ["prestige", "Prestige", "Endorsed by authoritative sources through awards, degrees, or recognition."],
    ["curation", "Curation", "Selective, with a particular ability to choose and group."]
  ]),
  G("collaboration", "Collaboration", [
    ["union", "Union", "Reduces friction between potential competitors through a common set of rules."],
    ["alliance", "Alliance", "A partnership with some benefits of a union while staying independent."],
    ["emergence", "Emergence", "The wisdom of a crowd."],
    ["centralization", "Centralization", "A single decision-making entity."],
    ["standardization", "Standardization", "Emergent alignment that reduces friction."],
    ["symbiosis", "Symbiosis", "A mutually beneficial dependency between two organisms."],
    ["herding", "Herding", "Many individuals grouping to protect against larger competitors."],
    ["distributed_ownership", "Distributed ownership", "Owned by the community."],
    ["transparency", "Transparency", "An open and visible process that invites trust."]
  ]),
  G("speed_and_scale", "Speed and scale", [
    ["iteration", "Iteration", "Iterates and changes quickly."],
    ["efficiency", "Efficiency", "Uses fewer resources than competitors for similar capability."],
    ["agility", "Agility", "Adapts easily to a changing environment."],
    ["precision", "Precision", "High accuracy and exactness in performance or output."],
    ["blitzing", "Blitzing", "A sudden, concentrated expenditure of intense resources."],
    ["composability", "Composability", "Components and systems assemble in different configurations."],
    ["modularity", "Modularity", "Independent units that combine in different ways."]
  ]),
  G("ease", "Ease", [
    ["intuitiveness", "Intuitiveness", "Easy to use and understand without instruction."],
    ["fun", "Fun", "Provides enjoyment and amusement."],
    ["simplicity", "Simplicity", "Few points of failure and a minimal design."],
    ["low_friction", "Low-friction", "Minimal resistance or hassle in use."],
    ["charm", "Charm", "Creates loyalty and warmth through personality or aesthetics."]
  ]),
  G("transformation", "Transformation", [
    ["malleability", "Malleability", "Changes appearance or form; easily modified or customized."],
    ["metamorphosis", "Metamorphosis", "Transforms between states optimized for different functions."],
    ["copycat", "Copycat", "Replicates another's method or style."]
  ])
] as const;

export const HOW_IT_WINS_GROUPS = GROUP_SOURCE.map((group) => ({
  id: group.id,
  name: group.name,
  strategies: group.entries.map(([id, name, meaning]) => ({ id, name, group: group.id, meaning }))
}));
export const HOW_IT_WINS_STRATEGIES = HOW_IT_WINS_GROUPS.flatMap((group) => group.strategies);
export const HOW_IT_WINS_STRATEGY_COUNT = HOW_IT_WINS_STRATEGIES.length;

const STRATEGY_IDS = HOW_IT_WINS_STRATEGIES.map((strategy) => strategy.id) as [string, ...string[]];
export const howItWinsStrategyIdSchema = z.enum(STRATEGY_IDS as [HowItWinsStrategyIdLiteral, ...HowItWinsStrategyIdLiteral[]]);
type HowItWinsStrategyIdLiteral = (typeof GROUP_SOURCE)[number]["entries"][number][0];
export type HowItWinsStrategyId = z.infer<typeof howItWinsStrategyIdSchema>;
export type HowItWinsStrategy = { id: HowItWinsStrategyId; name: string; group: HowItWinsGroupId; meaning: string };

const byId = new Map(HOW_IT_WINS_STRATEGIES.map((strategy) => [strategy.id, strategy as HowItWinsStrategy]));
const normalizeName = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, "");
const byName = new Map(HOW_IT_WINS_STRATEGIES.map((strategy) => [normalizeName(strategy.name), strategy.id as HowItWinsStrategyId]));

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
  strategies: z.tuple([howItWinsStrategyIdSchema, howItWinsStrategyIdSchema]),
  note: z.string().min(1),
  wrongIf: z.string().min(1),
  citationIds: citationIds.min(1)
});
export const howItWinsNextSchema = z.object({
  strategy: howItWinsStrategyIdSchema,
  note: z.string().min(1),
  citationIds
});

export const howItWinsReadSchema = z.object({
  status: z.literal("read"),
  sentence: z.string().min(1),
  running: z.array(howItWinsRunningSchema).min(2).max(4),
  pair: howItWinsPairSchema.nullable(),
  next: z.array(howItWinsNextSchema).max(2),
  wrongIf: z.string().min(1)
}).superRefine((value, ctx) => {
  const running = value.running.map((entry) => entry.strategy);
  if (new Set(running).size !== running.length) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["running"], message: "running strategies must be distinct" });
  if (value.pair) {
    const [a, b] = value.pair.strategies;
    if (a === b) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["pair"], message: "pair strategies must differ" });
    for (const leg of [a, b]) if (!running.includes(leg)) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["pair"], message: `pair leg ${leg} is not a running strategy` });
  }
  for (const entry of value.next) if (running.includes(entry.strategy)) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["next"], message: `${entry.strategy} is already running` });
});

// nothing_stands_out carries the model's own sentence naming the category when the model
// decided it; the sentence is absent when the verifier degraded a read in code, and the UI
// then falls back to its fixed empty copy.
export const howItWinsSchema = z.discriminatedUnion("status", [
  howItWinsReadSchema,
  z.object({ status: z.literal("nothing_stands_out"), sentence: z.string().min(1).optional() }),
  z.object({ status: z.literal("thin_file") })
]);
export type HowItWins = z.infer<typeof howItWinsSchema>;
export type HowItWinsRead = z.infer<typeof howItWinsReadSchema>;

// The same gate as the emphasis read, deliberately one implementation: a card too thin for
// one read is too thin for the other, and both run before any model call.
export const howItWinsThinFileReason = emphasisThinFileReason;

// Verifier degrade rules from the spec: the pair dies if its own note drops or either leg
// drops; the read degrades to nothing_stands_out if fewer than two running strategies survive.
export function applyHowItWinsVerification(
  read: HowItWinsRead,
  keep: { running: boolean[]; pair: boolean }
): { howItWins: HowItWins; dropReason?: "running-dropped" | "pair-dropped" } {
  const running = read.running.filter((_, index) => keep.running[index] === true);
  if (running.length < 2) return { howItWins: { status: "nothing_stands_out" }, dropReason: "running-dropped" };
  const survivors = new Set(running.map((entry) => entry.strategy));
  const pairAlive = read.pair !== null && keep.pair && read.pair.strategies.every((leg) => survivors.has(leg));
  const pair = pairAlive ? read.pair : null;
  const dropped = running.length !== read.running.length || (read.pair !== null && !pairAlive);
  const howItWins: HowItWinsRead = { ...read, running, pair };
  return dropped ? { howItWins, dropReason: read.pair !== null && !pairAlive ? "pair-dropped" : "running-dropped" } : { howItWins };
}
```
Note for the implementer: `dropReason` semantics: `"running-dropped"` when a running strategy was dropped but the read still stands (or degraded), `"pair-dropped"` when the pair died. When both happen (a leg dropped, killing the pair) report `"pair-dropped"` (the more visible loss). Match the tests above; adjust the last line so a leg drop that kills the pair reports `"pair-dropped"` and a leg drop with no pair reports `"running-dropped"`.

In `card.ts` add to `synthesisSchema`, after `emphasisRead`: `howItWins: howItWinsSchema.optional(),` (import from `./how-it-wins`). Add `export * from "./how-it-wins";` to `packages/core/src/index.ts`. Ensure `card.ts` does not create an import cycle (`how-it-wins.ts` imports only `./emphasis-read` and zod; `emphasis-read.ts` imports types from `./card`, type-only, fine).

- [ ] **Step 4: Run** `npm test -w @cold-start/core -- how-it-wins` and `npm run typecheck -w @cold-start/core`. Both pass.
- [ ] **Step 5: Confirm the public route strips it**: in `apps/web/tests` find the public card route test that asserts `synthesis` is absent (grep `synthesis` in `apps/web/tests/card-route*.test.ts` or `public-card*.test.ts`); add a fixture card whose synthesis carries `howItWins: { status: "read", ... }` and assert the public response body has no `synthesis` key and no `howItWins` string anywhere (`expect(JSON.stringify(body)).not.toContain("howItWins")`).
- [ ] **Step 6: Commit** `feat(core): how-it-wins vocabulary, schema, and degrade rules`

---

### Task 2: LLM stage plumbing and the four-pass driver

**Files:**
- Create: `packages/llm/src/how-it-wins-prompts.ts`, `packages/llm/src/how-it-wins.ts`, `packages/llm/tests/how-it-wins.test.ts`, `packages/llm/tests/fixtures/how-it-wins-irregular.json` (copy of `docs/product/design/2026-08-18-moat-read-direction/prompt-test/irregular-card.json`)
- Modify: `packages/core/src/generation-trace.ts` (`stage` union adds `"how_it_wins"`), `packages/llm/src/llm-provider.ts` (`stageEnvChain.how_it_wins: ["LLM_HOW_IT_WINS_MODEL", "LLM_SYNTHESIS_MODEL", "ANTHROPIC_SYNTHESIS_MODEL"]`, `LlmFallbackStage` adds `how_it_wins`, `stageFallbackEnv.how_it_wins: "LLM_HOW_IT_WINS_FALLBACK_MODEL"`), `packages/llm/src/index.ts` (`export * from "./how-it-wins";`)

**Interfaces produced:**
```ts
export const HOW_IT_WINS_WRITING_STANDARD: string; // verbatim prompt-test/writing-standard.md
export const HOW_IT_WINS_HOSTILE_EDITOR: string;   // verbatim prompt-test/hostile-editor.md
export const HOW_IT_WINS_DEFAULT_EDITOR_MODEL = "deepseek/deepseek-v4-pro";
export type HowItWinsModels = { writer: string; editor: string };
export type HowItWinsPassName = "reason" | "edit" | "editor" | "fit";
export type HowItWinsResult = { read: HowItWins; editorSkipped: boolean; fitRetried: boolean; styleIssues: string[] };
export async function synthesizeHowItWins(input: { client: Anthropic; models: HowItWinsModels; card: ColdStartCard; telemetry?: AnthropicTelemetrySink }): Promise<HowItWinsResult>;
export function parseHowItWinsDraft(text: string, card: ColdStartCard): { read: HowItWins } | { issues: string[] }; // JSON text -> schema, names -> ids, markers -> citationIds, citation existence
export function styleIssuesForRead(read: HowItWins): string[]; // fragments, repeated certainty, em dashes
export function textFromMessage(message: Message): string; // throws HowItWinsEmptyTextError when no text block
export class HowItWinsEmptyTextError extends Error {}
export function cardForHowItWinsPrompt(card: ColdStartCard): Omit<ColdStartCard, "synthesis" | "synthesisWithheld">;
```

Prompt text lives in `how-it-wins-prompts.ts` as template-literal constants: `HOW_IT_WINS_WRITING_STANDARD`, `HOW_IT_WINS_HOSTILE_EDITOR` (byte-for-byte copies of the two md files), plus:

```ts
export const HOW_IT_WINS_TASK_INTRO = `You are writing one read for Cold Start, an investor's side panel that shows a sourced profile of a startup. This read answers one question: how does this company win? Its vocabulary is a fixed list of 80 ways companies win (below). It is never a checklist. From the evidence, identify:
- the two to four ways this company is winning today, each tied to specific cited evidence [id];
- which one pair among them is unusual for a company in its category, and what specifically makes that pair hard for a competitor to copy;
- zero to two ways it could take but has not, each with the condition that would have to hold;
- what would change the read.
If the evidence shows nothing unusual, say that instead of inventing a pattern. Only claim what the cited evidence supports, and say which statements are inference rather than observation. Cite with the ids from the card, in square brackets, exactly as they appear on the card's citations (for example [c3]).
If a sentence could describe ten companies, it fails. Never use an em dash anywhere; use a period or a semicolon instead.`;

export const HOW_IT_WINS_PASS_1 = `PASS 1: ESTABLISH THE REASONING
Develop the analysis fully before optimizing the prose. For each important conclusion, explicitly identify: the relevant actor, the action or product, the causal mechanism, the supporting evidence, the assumptions, the uncertainty, the practical implication. Do not attempt to sound elegant or concise during this pass. Write prose, not JSON.`;

export const HOW_IT_WINS_SLOTS = `The finished read fills these slots in the panel. Every slot is complete, plain prose. There are no word limits; the limit is the reasoning itself, stated once.
- "status": "read" or "nothing_stands_out".
- "sentence": what appears at rest under the label "How it wins". One sentence in ordinary words that carries the stark evidence and the mechanism together, for example: "OpenAI and Anthropic cite its benchmarks by name in their model safety documents; dropping it later would show." A bare fact with no mechanism is not enough; a mechanism with no evidence is not allowed. If it cannot be written plainly, set status to "nothing_stands_out" and let "sentence" say so plainly for this company, naming its category (for example "It competes the way most LLM tooling companies do.").
- "running": two to four items {strategy, meaning, note}. "strategy" is the name from the list. "meaning" is one complete plain sentence saying what that way of winning means in general. "note" is plain prose: what this company does that fits it, the evidence with its citation ids in square brackets, and, once, at the end, in ordinary words, whether that is observed or inferred.
- "pair": {strategies: [two names from running], note, wrong_if} or null when no pair is unusual. "note": what the two are, why they hold together for this company, the mechanism that makes the pair hard to copy, the evidence with citation ids, and what is inferred. "wrong_if" is one sentence naming what would make the pair read wrong.
- "next": zero to two items {strategy, note}: a way it could take but has not, and the condition that would have to hold.
- "wrong_if": one sentence naming what would make the whole read wrong.
Return only JSON with those keys.`;

export const HOW_IT_WINS_PASS_2 = `PASS 2: EDIT WITHOUT DELETING REASONING
Rewrite this draft into clear, natural prose. Remove repetition and unnecessary words, but preserve every important causal link, qualification, distinction, and piece of evidence. Do not replace explanation with slogans, metaphors, labels, or compressed strategic language. A shorter sentence is not better if it forces the reader to infer the mechanism. State certainty once per note, at the end, in ordinary words. Meaning lines are complete sentences, never fragments.`;

export const HOW_IT_WINS_PASS_3_FRAME = `The draft is JSON that fills fixed slots in a product panel. Keep the same JSON keys and the same slots:`;

export const HOW_IT_WINS_PASS_4 = `PASS 4: FIT TO THE SURFACE
The read below is finished reasoning. It will be shown in a narrow side panel: one sentence at rest, and notes that open on hover. Cut words, never the actor, the mechanism, or the evidence. There are no word limits. Where a note repeats a certainty statement, state it once, at the end, in ordinary words. Remove repeated ideas and padding. Do not add hedges the draft did not have. Keep the same JSON keys. Return only the JSON.`;
```

- [ ] **Step 1: Write the failing tests** (`packages/llm/tests/how-it-wins.test.ts`)

Cover: (a) verbatim guard: `readFileSync("../../docs/product/design/2026-08-18-moat-read-direction/prompt-test/writing-standard.md")` equals `HOW_IT_WINS_WRITING_STANDARD` (resolve the path from `import.meta.url`); same for the editor. (b) `parseHowItWinsDraft` on a fixture JSON string using names ("Hybrid", "Chokepoint", "Prestige") and `[e1]`-style markers against the Irregular fixture card returns a read with ids and `citationIds` derived from markers; a note citing an id not on the card returns an issue; an unknown strategy name returns an issue; a running item with no marker returns an issue. (c) `styleIssuesForRead` flags a meaning line without a terminal period or under five words, flags a note with three or more certainty words (`inferred|inference|reported|observed`), flags an em dash. (d) `textFromMessage` throws `HowItWinsEmptyTextError` on `{ content: [{ type: "thinking", ... }] }`. (e) driver: mock `createTracedAnthropicMessage` (vi.mock of `../src/anthropic`) with a scripted sequence: pass 1 returns prose, pass 2 returns JSON, pass 3 (editor label) rejects with a non-transient error, pass 4 returns valid JSON; assert `synthesizeHowItWins` returns `{ read.status: "read", editorSkipped: true }` and that pass 4's model equals `models.writer` and pass 3's model equals `models.editor`; second scenario: pass 1 returns no text block on the first call and text on the second, assert `max_tokens` on the retry is 24000; third scenario: pass 4 returns JSON with a fragment meaning; the driver re-asks once (five calls total) with the issues in the user message and returns `fitRetried: true`.

- [ ] **Step 2: Run** `npm test -w @cold-start/llm -- how-it-wins` fails.

- [ ] **Step 3: Implement `packages/llm/src/how-it-wins.ts`**

Skeleton (fill it out fully; no placeholders):

```ts
export async function synthesizeHowItWins(input) {
  const { client, models, card, telemetry } = input;
  const cardJson = JSON.stringify(cardForHowItWinsPrompt(card));
  const vocabulary = HOW_IT_WINS_GROUPS.map((g) => `${g.name}: ${g.strategies.map((s) => `${s.name} (${s.meaning})`).join("; ")}`).join("\n");
  const task = `${HOW_IT_WINS_TASK_INTRO}\n\nThe 80 ways, in 13 groups:\n${vocabulary}\n\nThe company's card (facts, signals, citations with source snippets):\n${cardJson}`;
  const ask = (pass, model, system, user, maxTokens) => callWithEmptyTextRetry({ client, telemetry, label: `how-it-wins-${pass}`, model, system, user, maxTokens });
  const reasoning = await ask("reason", models.writer, `${HOW_IT_WINS_WRITING_STANDARD}\n\n${HOW_IT_WINS_PASS_1}`, task, 16000);
  const edited = await ask("edit", models.writer, `${HOW_IT_WINS_WRITING_STANDARD}\n\n${HOW_IT_WINS_PASS_2}\n\n${HOW_IT_WINS_SLOTS}`, `The draft:\n\n${reasoning}\n\nFor reference, the task and evidence the draft was written from:\n\n${task}`, 16000);
  let hostile = edited; let editorSkipped = false;
  try { hostile = await ask("editor", models.editor, `${HOW_IT_WINS_HOSTILE_EDITOR}\n\n${HOW_IT_WINS_PASS_3_FRAME}\n${HOW_IT_WINS_SLOTS}\nReturn only the revised JSON.`, `The draft:\n\n${edited}\n\nThe evidence the draft must stay within (do not add facts not in it):\n\n${cardJson}`, 8000); }
  catch (error) { if (isTransientLlmError(error)) throw error; editorSkipped = true; }
  const fitSystem = `${HOW_IT_WINS_WRITING_STANDARD}\n\n${HOW_IT_WINS_PASS_4}`;
  let fitted = await ask("fit", models.writer, fitSystem, hostile, 16000);
  let parsed = parseHowItWinsDraft(fitted, card);
  let styleIssues = "read" in parsed ? styleIssuesForRead(parsed.read) : [];
  let fitRetried = false;
  if ("issues" in parsed || styleIssues.length > 0) {
    const issues = "issues" in parsed ? parsed.issues : styleIssues;
    fitted = await ask("fit", models.writer, fitSystem, `${hostile}\n\nThe previous attempt had these problems; fix them and return only the JSON:\n- ${issues.join("\n- ")}`, 16000);
    fitRetried = true;
    parsed = parseHowItWinsDraft(fitted, card);
    styleIssues = "read" in parsed ? styleIssuesForRead(parsed.read) : [];
  }
  if ("issues" in parsed) throw new Error(`how-it-wins draft invalid: ${parsed.issues.join("; ")}`);
  return { read: stripEmDashes(parsed.read), editorSkipped, fitRetried, styleIssues };
}
```
Details:
- Every call goes through `createTracedAnthropicMessage({ client, label, model, stage: "how_it_wins", telemetry, params: { model, max_tokens, temperature: 0.2 (omit for the writer if the model rejects it; sonnet accepts), system: [{ type: "text", text: system, cache_control: anthropicSystemCacheControl() }], messages: [{ role: "user", content: user }] } })`. Wrap the writer calls in `withProviderFallback("how_it_wins", models.writer, ...)` like the emphasis stage; the editor call is not wrapped (a failure skips the pass).
- `callWithEmptyTextRetry`: on `HowItWinsEmptyTextError`, retry once with `max_tokens` 24000; rethrow on second failure.
- `parseHowItWinsDraft(text, card)`: strip code fences; `JSON.parse` (issue on failure); map `strategy` names via `howItWinsStrategyIdForName`; `citationIds` = `visibleCitationMarkers(note)` deduped for running, pair, next (import from `./tool-schema-fragments`); build the shape `{ status, sentence, running, pair: pair ? { strategies, note, wrongIf: pair.wrong_if, citationIds } : null, next, wrongIf: wrong_if }`; `howItWinsSchema.safeParse`; collect zod issues as strings; check every citation id exists on `card.citations` (issue otherwise). For `status: "nothing_stands_out"` return `{ read: { status, sentence } }` directly (sentence optional).
- `styleIssuesForRead`: for each running `meaning`: must match `/^[A-Z].*[.]$/` and have at least five words, else issue `running[i].meaning is a fragment: "..."`; for each note (running, pair, next) count `/\b(inferred|inference|reported|observed)\b/gi` matches, issue when >= 3 (`certainty stated more than once`); any U+2014 (em dash) character in any string is an issue. Sentence: must be at least 6 words and end with a period.
- `stripEmDashes` replaces `/\s*\u2014\s*/g` with `; ` in every string of the read (belt and braces; the checks above already re-ask).
- `textFromMessage` joins `text` blocks; throws `HowItWinsEmptyTextError` when the join is empty (thinking-only response or `stop_reason === "max_tokens"` with no text).

- [ ] **Step 4: Run** the llm tests and `npm run typecheck`. Pass.
- [ ] **Step 5: Slopcheck** `python3 ~/.claude/scripts/slopcheck.py packages/llm/src/how-it-wins-prompts.ts` (zero hits on the task, slot, and pass text; the two verbatim prompts are Samay's own words and are exempt if they trip anything; note it in the report if they do).
- [ ] **Step 6: Commit** `feat(llm): four-pass how-it-wins driver under the writing standard`

---

### Task 3: Pipeline step, verify hookup, trace, events, flag, contract

**Files:**
- Create: `apps/web/src/inngest/how-it-wins.ts`, `apps/web/tests/how-it-wins.test.ts`, `apps/web/tests/generate-analysis-how-it-wins-steps.test.ts`
- Modify: `packages/pipeline/src/generate-card.ts` (extras + `verifiedHowItWins`), `apps/web/src/inngest/generation-helpers.ts` (`verifySynthesisStepBody` accepts `howItWins?: HowItWinsRead`), `apps/web/src/inngest/functions.ts`, `apps/web/src/inngest/worker-env.ts` (`howItWinsEnabled()`, `howItWinsModelsFromProcess()`), `packages/core/src/generation-trace.ts` (`howItWins?: { enabled: boolean; status?: "read" | "thin_file" | "nothing_stands_out" | "discarded"; thinFileReason?: string; dropReason?: string; editorSkipped?: boolean; fitRetried?: boolean }`), `packages/core/api-contract.json` (`"version": "2026-08-19.how-it-wins-v1"`), `apps/extension/src/research/AnalysisWaitInstrument.tsx` (`"how-it-wins.started": 2, "how-it-wins.complete": 2` in `STAGE_INDEX_BY_EVENT_TYPE`), `docs/anthropic-llm-call-map.md` (one paragraph mirroring the emphasis entry)

**Interfaces produced:**
```ts
// worker-env.ts
export function howItWinsEnabled(): boolean;                 // process.env.HOW_IT_WINS_ENABLED !== "false"
export function howItWinsModelsFromProcess(defaultModel?: string): HowItWinsModels; // writer: modelForStage("how_it_wins", defaultModel), editor: process.env.LLM_HOW_IT_WINS_EDITOR_MODEL?.trim() || HOW_IT_WINS_DEFAULT_EDITOR_MODEL
// how-it-wins.ts (inngest)
export type HowItWinsStepResult = { ok: true; value: HowItWinsResult } | { ok: false; error: string };
export async function howItWinsStepBody(input: { card: ColdStartCard; client; models: HowItWinsModels; telemetry }): Promise<HowItWinsStepResult>;
// generate-card.ts
verifyCardSynthesisDraft(card, draft, deps, extras?: { emphasisRead?: EmphasisReadFiled; howItWins?: HowItWinsRead })
  -> adds `howItWins?: HowItWins; howItWinsDropReason?: "running-dropped" | "pair-dropped"` to the result
```

- [ ] **Step 1: Write the failing tests**
  - `apps/web/tests/how-it-wins.test.ts`: `howItWinsStepBody` returns `{ ok: false }` on a schema error thrown by a mocked `synthesizeHowItWins` and rethrows a transient error (mirror `emphasis-read.test.ts`'s pattern for `emphasisReadStepBody`).
  - `packages/pipeline/tests/generate-card.test.ts` (or a new sibling): `verifyCardSynthesisDraft` with `extras.howItWins` sends the running notes and pair note as claims after the emphasis claims (assert the `verify` mock received them at the expected indices) and applies `applyHowItWinsVerification` (a `not_supported` result on the pair note yields `pair: null` and `howItWinsDropReason: "pair-dropped"`; two dropped running notes yield `nothing_stands_out`).
  - `apps/web/tests/generate-analysis-how-it-wins-steps.test.ts`: clone the structure of `generate-analysis-emphasis-steps.test.ts` (mock `generateCardForDomainWithTrace`, `fetchFounderVoiceEvidence`, `synthesizeEmphasisRead`, and now `synthesizeHowItWins`; run the real `generateCardHandler` in mode `analysis`). Assert: step order includes `how-it-wins` between `emphasis-read` and `verify-synthesis`; events `how-it-wins.started` then `how-it-wins.complete` with `metadata.status: "read"`; `trace.howItWins.status === "read"`; the stored card's `synthesis.howItWins.status === "read"`. Second case: `HOW_IT_WINS_ENABLED=false` skips the step (trace step `skipped`, no events, `synthesizeHowItWins` never called). Third case: a thin card (fewer than four substantive citations) records `status: "thin_file"`, no model call, no events beyond none (mirror the emphasis thin-file case), and the stored card carries `howItWins: { status: "thin_file" }`.

- [ ] **Step 2: Run** the three test files; they fail.

- [ ] **Step 3: Implement**
  - `apps/web/src/inngest/how-it-wins.ts`: catch-and-memoize like `emphasisReadStepBody`; transient rethrows, semantic returns `{ ok: false, error: boundedErrorMessage(error) }`.
  - `functions.ts`, right after the emphasis block and before the `verify-started` event:
    ```ts
    let howItWinsDraft: HowItWins | null = null;
    let howItWinsMeta: { editorSkipped?: boolean; fitRetried?: boolean } = {};
    if (howItWinsEnabled()) {
      const thinFileReason = howItWinsThinFileReason(generatedCard);
      if (thinFileReason) {
        howItWinsDraft = { status: "thin_file" };
        mergeTracePatch(trace, { howItWins: { enabled: true, status: "thin_file", thinFileReason } });
        trace.steps = { ...trace.steps, "how-it-wins": skippedStep(`thin file: ${thinFileReason}`) };
      } else {
        await recordEvent("how-it-wins-started", "how-it-wins.started", "Reading how it wins", {}, null);
        currentStage = "how-it-wins";
        const howItWinsResult = await step.run("how-it-wins", async () => { /* same telemetry/timed shape as emphasis-read */ });
        mergeTracePatch(trace, howItWinsResult.tracePatch);
        if (howItWinsResult.value.ok) { howItWinsDraft = howItWinsResult.value.value.read; howItWinsMeta = { editorSkipped: howItWinsResult.value.value.editorSkipped, fitRetried: howItWinsResult.value.value.fitRetried }; }
        else howItWinsDraft = { status: "nothing_stands_out" };
      }
    } else {
      trace.steps = { ...trace.steps, "how-it-wins": skippedStep("HOW_IT_WINS_ENABLED=false") };
    }
    ```
    Pass `...(howItWinsDraft?.status === "read" ? { howItWins: howItWinsDraft } : {})` into `verifySynthesisStepBody`. After verify: `finalHowItWins = howItWinsDraft ? (howItWinsDraft.status === "read" ? verified.howItWins ?? { status: "nothing_stands_out" } : howItWinsDraft) : undefined`; attach on the `verified.synthesis` branch alongside `emphasisRead`; compute `howItWinsDiscarded` exactly like `emphasisDiscarded`; merge trace `{ howItWins: { enabled: true, status, dropReason?, ...howItWinsMeta } }`; record `how-it-wins.complete` with message `"How it wins filed"` / `"No how-it-wins read"` / `"How it wins computed but not kept"` and metadata `{ status, dropReason? }`. Add `"how-it-wins": skippedStep("synthesis gate blocked: insufficient evidence")` to the gate-blocked branch next to `emphasis-read`.
  - `generate-card.ts`: `const howItWinsClaims: SourcedText[] = howItWins ? [...howItWins.running.map((r) => ({ text: r.note, citationIds: r.citationIds })), ...(howItWins.pair ? [{ text: howItWins.pair.note, citationIds: howItWins.pair.citationIds }] : [])] : [];` appended after `emphasisClaims`; offset `howItWinsOffset = emphasisOffset + emphasisClaims.length`; `verifiedHowItWins(filed, results, offset)` computes `keep.running[i] = applyVerifierResults([claim], results, offset + i).length === 1`, `keep.pair = pair ? applyVerifierResults([pairClaim], results, offset + running.length).length === 1 : false`, then `applyHowItWinsVerification`. Return fields only when extras supplied (same discipline as `emphasisResultFields`).
  - The model for the writer: `const howItWinsModels = howItWinsModelsFromProcess(defaultModel);` next to `emphasisModel` in functions.ts.
  - Contract bump; call-map doc paragraph.

- [ ] **Step 4: Run** `npm test -w @cold-start/web -- how-it-wins`, `npm test -w @cold-start/pipeline`, `npm run typecheck`. Pass.
- [ ] **Step 5: Commit** `feat(web): how-it-wins step, verify hookup, events, flag, contract bump`

---

### Task 4: Lens folds (Why now into Why care; Bull and Bear into The case)

**Files:**
- Modify: `apps/extension/src/research/investor-lens.ts`, `apps/extension/src/research/investor-read-copy.ts`, `apps/extension/src/research/InvestorReadCard.tsx`, `packages/core/src/alpha-analytics.ts` (`lensCategorySchema` adds `"the-case"`; keep the old ids so older installed clients' events still validate), `apps/web/src/lib/card-face/model.ts` (`INVESTOR_READ_LABELS = ["Why care", "The case", "What to learn next", "Pay attention to", "How it wins"]`), tests: `apps/extension/tests/investor-lens.test.ts`, `investor-read-card.test.tsx`, `sidepanel-analysis.test.tsx`, `apps/extension/tests/e2e/sidepanel-ui.spec.ts`, `lens-gallery.spec.ts` (search for `must-be-true`, `could-break`, `why-now`, "If true", "It breaks if", "Why now"), `apps/web/tests/card-face-model.test.ts` and `record-exhibit.test.tsx` if they count teaser rows, `DESIGN.md` (Investor Lens Memo: rows list and the Section-label examples)

**Interfaces produced (investor-lens.ts):**
```ts
export type InvestorLensCategoryId = "why-care" | "the-case" | "learn-next" | "pay-attention";
export type HowItWinsDisplayState = "read" | "thin_file" | "nothing_stands_out" | "not_read";
export type HowItWinsDisplay = {
  state: HowItWinsDisplayState;
  sentence: string | null;              // read: the sentence; nothing_stands_out: model sentence or null
  running: Array<{ id: HowItWinsStrategyId; name: string; meaning: string; note: string }>; // note stripped of markers
  pair: { strategies: [HowItWinsStrategyId, HowItWinsStrategyId]; names: [string, string]; note: string; wrongIf: string } | null;
  next: Array<{ id: HowItWinsStrategyId; name: string; note: string }>;
  wrongIf: string | null;
  count: number;                        // running.length
};
export type InvestorReadDisplay = { receiptLine; lede; holds; breaks; nextQuestion; sources; independentlyBacked; emphasis; howItWins: HowItWinsDisplay };
```
Copy (`investor-read-copy.ts`), replacing `LENS_TENSION_LABEL`:
```ts
export const LENS_CASE_LABEL = { holds: "Bull", breaks: "Bear" } as const;
export const HOW_IT_WINS_COPY = {
  label: "How it wins",
  count: (n: number) => `${n} of 80 strategies`,
  notYet: "not yet",          // rendered as `${name}, not yet`
  wrongIf: "Wrong if",
  pinned: "pinned",
  thinFile: "Not enough filed",
  nothingStandsOut: "Nothing stands out yet."
} as const;
```
Removed: `LENS_TENSION_LABEL`, `LENS_TENSION_EMPTY_COPY.both` if unused (grep first), the `why-now` category, `LensTiming`, `timingDisplay`, `TIMING_FIELD_ORDER`, `timingIsNotFound` (grep `apps/extension/src` and tests; delete if only investor-lens.ts and its tests use it), the `timing` disclosure id and its `LensDisclosure` `row` union member.

- [ ] **Step 1: Update the tests first**: in `investor-lens.test.ts` assert `investorLensCategories(read)` returns four ids in order `why-care, the-case, learn-next, pay-attention`; assert the lede text ends with the timing beat when `adoptionTrigger` and/or `timingRisk` exist (`"<whyItMatters> <adoptionTrigger> <timingRisk>"`, markers stripped, sentences joined with a single space) and equals the bare lede when neither exists; assert `howItWins` display for a card with a filed read (`count: 3`, names resolved, notes stripped of markers), for `thin_file`, `nothing_stands_out` (with and without sentence), and a legacy card (`not_read`). In `investor-read-card.test.tsx` rename (a) to "presents every Lens point in four categories with Why care open by default", assert The case body renders both `data-side="holds"` and `data-side="breaks"` with `<em>Bull.</em>` and `<em>Bear.</em>`, and the "0-bear side" empty copy still renders inside The case; drop the Why now assertions; keep the emphasis tests. Update `sidepanel-analysis.test.tsx`'s "keeps Why now honest..." test to assert the lede has no timing beat when synthesis has no supported market timing. Update the two e2e specs' selectors.
- [ ] **Step 2: Run** `npm test -w @cold-start/extension -- investor` and see the failures.
- [ ] **Step 3: Implement** the model and card changes:
  - `investor-lens.ts`: `timingBeat(card): string | null` = adoptionTrigger text then timingRisk text (both `stripCitationMarkers`, trimmed, ensure each ends with a period), joined by a space; `lede: { text: [whyItMatters, beat].filter(Boolean).join(" ") }`; `howItWinsDisplayForCard(card)`; `investorLensCategories` returns the four categories with previews: The case preview = `read.holds?.text ?? read.breaks?.text ?? LENS_TENSION_EMPTY_COPY.holds` (a Bull line first, else the Bear line, else the empty copy).
  - `InvestorReadCard.tsx`: `LensCategoryBody` case `"the-case"` renders `<div aria-label="The case" className="cs-lens-tension">` with both `LensTensionSide`s (labels from `LENS_CASE_LABEL`); delete the `must-be-true`, `could-break`, and `why-now` branches; `LensDisclosureId` drops `"timing"`.
  - `alpha-analytics.ts`: add `"the-case"` to `lensCategorySchema` (keep the rest).
  - `card-face/model.ts` labels; fix any test counting five or six teaser rows.
  - `DESIGN.md` Investor Lens Memo: the packet is Why care, The case (Bull and Bear inside, led by the existing marks), What to learn next, Pay attention to; and How it wins on the edge (Task 6 writes that paragraph).
- [ ] **Step 4: Run** the extension tests, `npm run typecheck`, `npm run lint`, and `npm run knip` (knip flags anything left dead by the removals; delete it). Pass.
- [ ] **Step 5: Measure the plate**: `npm run qa:extension:gallery -w @cold-start/extension` before (on main) and after; record `.cs-investor-read` heights for the fixture with synthesis in the commit message. The plate must not be taller after the fold (it should be shorter until Task 6 adds the crown; the spec's ceiling is 580px against today's 575px at the gallery fixture width).
- [ ] **Step 6: Commit** `refactor(extension): fold Why now into Why care and Bull/Bear into The case`

---

### Task 5: Crown geometry and copy (pure module)

**Files:**
- Create: `apps/extension/src/research/how-it-wins-edge.ts`, `apps/extension/tests/how-it-wins-edge.test.ts`

**Interfaces produced:**
```ts
export const EDGE_GROUP_GAP_PX = 5; export const EDGE_HEIGHT_PX = 22; export const EDGE_TOP_PX = 3;
export const EDGE_MARK_WIDTH_PX = 4; export const EDGE_MARK_DEPTH_PX = 8; export const EDGE_HOLLOW_DEPTH_PX = 7;
export const EDGE_TARGET_REACH_PX = 6; export const EDGE_SIGMA_PX = 11; export const EDGE_MAGNIFICATION = 1.6;
export const EDGE_SPRING = { stiffness: 420, damping: 38 } as const;
export const EDGE_FALLBACK_WIDTH_PX = 320; // when the svg has no layout yet (jsdom, first paint)
export function edgePositions(width: number): number[]; // 80 x's, groups separated by the gap, scaled to fill width
export type EdgeTarget = { key: string; kind: "running" | "next" | "pair"; index: number; x: number; span?: [number, number] };
export function edgeTargets(display: HowItWinsDisplay, xs: number[]): EdgeTarget[]; // pair key "pair", x = midpoint of the two legs, span = [xLeft-2, xRight+2]
export function nearestTickIndex(xs: number[], x: number): number;
export function targetAt(targets: EdgeTarget[], display: HowItWinsDisplay, xs: number[], x: number): EdgeTarget | null; // running/next within reach; pair claims its span when the nearest tick is not itself a running mark
export function readoutText(display: HowItWinsDisplay, tick: number | null, target: EdgeTarget | null): { text: string; ink: boolean }; // rest -> count; pair -> "A + B"; running -> name; next -> "Name, not yet"; other -> name (grey)
export function magnification(distancePx: number): number; // 1 + 1.6 * exp(-d^2 / (2 * sigma^2))
export type SpringState = { x: number; v: number };
export function springStep(state: SpringState, target: number, dtSeconds: number, spring = EDGE_SPRING): SpringState;
export function springAtRest(state: SpringState, target: number): boolean; // |x - target| < 0.05 && |v| < 0.5
export type EdgeNote = { kicker: string; meaning: string | null; body: string; wrongIf: string | null };
export function noteFor(display: HowItWinsDisplay, target: EdgeTarget): EdgeNote; // running: kicker name, meaning; next: kicker `${name}, not yet`; pair: kicker "A and B", wrongIf
export function targetsInKeyboardOrder(targets: EdgeTarget[]): EdgeTarget[]; // by x
export function crownAriaLabel(display: HowItWinsDisplay): string; // "How it wins, 3 of 80 strategies"
export const BANNED_MICRO_COPY = ["cut", "open to it", "could be next", "the pair", "one of its", "not this one"] as const;
```

- [ ] **Step 1: Write the failing tests**: positions length 80, monotonic, first 0 and last equal to width, twelve gaps wider than the pitch; targets for the fixture display (three running, two next, one pair) yields six targets, pair at the midpoint; `readoutText` for each kind (`{ text: "3 of 80 strategies", ink: false }` at rest; `{ text: "Standardization, not yet", ink: true }` on a next; `{ text: "Hybrid + Chokepoint", ink: true }` on the pair; `{ text: "Craftsmanship", ink: false }` on an unmarked tick); `magnification(0)` is 2.6 and `magnification(33)` under 1.02; the spring converges from 0 to 100 within 600ms of 16ms steps without overshooting more than 1px; `noteFor` kicker for a next target is `"Standardization, not yet"` and for the pair includes `wrongIf`; a test that every string `readoutText`, `noteFor`, `crownAriaLabel`, and `HOW_IT_WINS_COPY` can produce contains none of `BANNED_MICRO_COPY` (case-insensitive, word-bounded for "cut").
- [ ] **Step 2: Run** and see failures.
- [ ] **Step 3: Implement** the module (port the geometry from `gen.py`'s `positions`, `nearestOf`, `retarget`, and the readout branch; the spring is a critically damped semi-implicit Euler: `a = -k (x - target) - c v; v += a dt; x += v dt` with `k = stiffness / mass(1)`, `c = damping`).
- [ ] **Step 4: Run** tests; pass. **Step 5: Commit** `feat(extension): how-it-wins edge geometry and readout model`

---

### Task 6: The crown component, CSS, and mount

**Files:**
- Create: `apps/extension/src/research/HowItWinsEdge.tsx`, `apps/extension/src/styles/how-it-wins.css`, `apps/extension/tests/how-it-wins-edge.test.tsx`
- Modify: `apps/extension/src/styles.css` (`@import "./styles/how-it-wins.css";` after `research-trail.css`), `apps/extension/src/research/InvestorReadCard.tsx` (mount the crown as the first child of `<article className="cs-investor-read">`, above the header, only when `read.howItWins.state !== "not_read"`), `apps/extension/tests/lens-card-fixtures.ts` or the gallery fixtures (add a card with a filed read, one with `nothing_stands_out`, one with `thin_file`), `apps/extension/tests/e2e/sidepanel-ui.spec.ts` (plate height check), `apps/extension/tests/e2e/lens-gallery.spec.ts` (screenshots of the three states plus a pinned note), `DESIGN.md` (crown paragraph)

**Component contract:**
```tsx
export function HowItWinsEdge({ display, prefersReducedMotion, onPin }: { display: HowItWinsDisplay; prefersReducedMotion: boolean | null; onPin?: (target: EdgeTarget | null) => void }): JSX.Element | null;
```
Markup:
```html
<div class="cs-how-it-wins" role="group" tabindex="0" aria-label="How it wins, 3 of 80 strategies" data-state="read" data-pinned="false" data-reduced-motion="false" data-hover="false">
  <div class="cs-how-it-wins-label"><b>How it wins</b><span class="cs-how-it-wins-readout" data-ink="false" aria-live="polite">3 of 80 strategies</span></div>
  <div class="cs-how-it-wins-edge"><svg aria-hidden="true"></svg></div>
  <p class="cs-how-it-wins-sentence">…</p>
  <ul class="cs-how-it-wins-targets cs-visually-hidden">        <!-- one button per target, keyboard order -->
    <li><button type="button" aria-describedby="…-note-hybrid">Hybrid</button><span id="…-note-hybrid">…note text…</span></li>
  </ul>
  <div class="cs-how-it-wins-note" data-open="true" data-placement="below" role="dialog" aria-label="Hybrid" style="--cs-hiw-anchor: 123px">
    <div class="cs-how-it-wins-kicker"><span><b>Hybrid.</b> It wins by …</span><small>pinned</small></div>
    <p>…</p>
    <div class="cs-how-it-wins-meta"><em>Wrong if</em> …</div>
  </div>
</div>
```
Behavior (port from `gen.py`, restructured):
- Geometry from `how-it-wins-edge.ts`. Width from a `ResizeObserver` on the svg (fallback `EDGE_FALLBACK_WIDTH_PX`).
- One `requestAnimationFrame` loop owned by a ref; it runs only while `hoverX !== null || scaleOpacity > 0 || arriving`; each frame: scale opacity eases toward 1 (140ms in) or 0 (200ms out after an 80ms leave delay), cursor `springStep`s toward `hoverX`, retarget, redraw the svg via `innerHTML` (rects and paths carry classes, no color literals: `.cs-hiw-rule`, `.cs-hiw-cut-fill`, `.cs-hiw-cut-wall`, `.cs-hiw-hollow`, `.cs-hiw-tick`, `.cs-hiw-tick[data-hot]`, `.cs-hiw-bracket`, `[data-hot]` and `[data-pinned]` attributes for weight), and writes the readout `textContent` and `data-ink` directly. React state changes only when `target` or `pinned` changes (so the note re-renders), never per frame.
- Arrival: on mount, if `display` key (`sentence + running ids + next ids`) is not in a module-level `Set` of arrived keys, wait 300ms then animate `arrive` 0 to 1 over 520ms ease-out (marks drop in staggered: mark i uses `clamp((t - i*40ms) / 220ms)`), bracket last via `stroke-dashoffset` 180ms; add the key to the set. Reduced motion: opacity 0 to 1 over 160ms, all together.
- Pointer: `onPointerMove` over the crown (ignoring the note) sets `hoverX`; over the sentence sets `hoverX` to the pair midpoint when a pair exists (else leaves it); `onPointerLeave` clears `hoverX` (the loop fades the scale after 80ms). Click on the crown toggles `pinned` when a target is under the cursor (or unpins). Escape unpins. ArrowLeft/ArrowRight (when the crown or one of its buttons has focus) step targets in x order, pin, park the cursor at the target, and set the scale to 1 (spring travel skipped). Enter toggles pin. Touch (`pointerType === "touch"`): a tap snaps to the nearest target and pins; a second tap on the same target unpins.
- Note: rendered when `target !== null`; `--cs-hiw-anchor` positions the caret; content swaps in place (key the inner content by target key with a 90ms opacity crossfade using CSS transitions on `data-swapping`; no framer-motion needed); open/close 120ms with a 4px rise (CSS transition on `data-open`); reduced motion: 100ms opacity only. `pinned` receipt in the corner when pinned.
- Reduced motion: no rAF loop for the cursor; hover still updates the nearest tick and readout instantly (compute on the event, redraw once); scale shows/hides without easing.
- No `--color-seal` anywhere. Pinned mark: depth +2px, walls 1.5px (attributes `data-pinned` on the paths).

CSS (`how-it-wins.css`), all colors via tokens; the crown has `position: relative; border-bottom: 1px solid var(--color-rule)`; the label row is body 12px/640 (label) and receipt 10.5px (readout); the sentence is body 12px/480/1.4; the note is `position: absolute; left: 13px; right: 13px; top: calc(100% + 5px); z-index: 5; background: var(--color-plate); border-radius: 6px; box-shadow: var(--shadow-popover); padding: 11px 13px 12px;` with the caret at `--cs-hiw-anchor`; the note kicker uses the memo's type roles (13px/450 body, kicker 12px/480 muted with a 600 ink name); `.cs-visually-hidden` (add if the codebase lacks one; grep first for an existing sr-only class and reuse it).

- [ ] **Step 1: Write the failing tests** (`how-it-wins-edge.test.tsx`, jsdom, same harness as `investor-read-card.test.tsx`): (a) renders all three statuses: read shows label, `"3 of 80 strategies"`, the sentence, and six target buttons; `nothing_stands_out` shows `"0 of 80 strategies"` and its sentence (or `HOW_IT_WINS_COPY.nothingStandsOut` when null) and zero target buttons; `thin_file` shows `"0 of 80 strategies"` and `"Not enough filed"`; `not_read` renders nothing (the component returns null and InvestorReadCard omits it). (b) readout per target kind via keyboard: focus the crown, ArrowRight pins the first target in x order and the readout shows its name with `data-ink="true"`; step to a next target shows `"Standardization, not yet"`; step to the pair shows `"Hybrid + Chokepoint"`. (c) the note opens below the sentence: after pinning, the note element exists with `data-open="true"`, `data-placement="below"`, `role="dialog"`, its kicker starts with the strategy name, and `sentence.compareDocumentPosition(note) & Node.DOCUMENT_POSITION_FOLLOWING` is truthy; the pair note contains `"Wrong if"`; the pinned receipt reads `"pinned"`. (d) keyboard order: repeated ArrowRight yields names in ascending x; ArrowLeft returns; Escape clears the pin and the readout returns to the count; Enter toggles. (e) reduced motion (`stubReducedMotion(true)`): `data-reduced-motion="true"`, `requestAnimationFrame` is never called during a keyboard walk, readout still updates. (f) the banned micro-copy test: render the read fixture, pin each target in turn, and assert `container.textContent` never contains a banned string (word-bounded "cut"), plus no U+2014 character. (g) the crown never renders `--color-seal` or the string `seal` in inline styles or classes.
- [ ] **Step 2: Run** and see failures.
- [ ] **Step 3: Implement** the component and CSS; mount it in `InvestorReadCard`; add the fixtures.
- [ ] **Step 4: Run** the jsdom tests, `npm run audit:css -w @cold-start/extension`, `npm run typecheck`, `npm run lint`. Pass.
- [ ] **Step 5: Playwright plate-height check**: in `sidepanel-ui.spec.ts` (mounted panel with a fixture that carries a filed read) measure `.cs-investor-read` height at rest, hover the edge at three x's, click to pin, and assert the height never changes; also assert the note's bounding box top is greater than or equal to the sentence's bounding box bottom (never covers it). Run `npm run qa:extension:ui -w @cold-start/extension`.
- [ ] **Step 6: Gallery**: extend `lens-gallery.spec.ts` with four shots (rest, hover on an unmarked tick, pinned running mark, pinned pair) and run `npm run qa:extension:gallery -w @cold-start/extension`. Look at every shot.
- [ ] **Step 7: Commit** `feat(extension): the How it wins crown on the Lens plate`

---

### Task 7: Eval scorer gate

**Files:**
- Modify: `eval/investor-lens/score.mjs`, `eval/investor-lens/score.test.mjs`

**Interfaces produced:**
```js
export function howItWinsTexts(card) // sentence + running notes + pair note + next notes, markers stripped
export function strategyFrequency(cards) // { reads: number, counts: Record<strategyId, number>, share: Record<strategyId, number> } over cards whose howItWins.status === "read"
export function strategyFrequencyGate(cards, { maxShare = 0.5, minReads = 10 } = {}) // { passed, offenders: [{ strategy, share }] , reads }
```
`genericPhraseCount` includes `howItWinsTexts`. `scoreInvestorLens` adds a check `howItWinsSentenceSpecificOrEmpty`: a filed read's sentence must contain a digit, `$`, `%`, a capitalized proper noun other than the sentence's first word, or the company name (the same spirit as `emphasisIsSpecificOrEmpty`).

- [ ] **Step 1: Tests**: `strategyFrequency` over five fixture cards (three with reads sharing `usership`) reports share 1.0 for `usership` and 0.33 for a strategy on one read; `strategyFrequencyGate` passes under `minReads` and fails with an offender when eleven reads all carry `usership`; `genericPhraseCount` counts a generic phrase inside a running note; the sentence check fails on "It wins by being the best platform." and passes on the Irregular sentence.
- [ ] **Step 2: Run** `node --test eval/investor-lens/score.test.mjs`; fails. **Step 3: Implement.** **Step 4: Run**; pass. **Step 5: Commit** `feat(eval): strategy-frequency gate and how-it-wins generic checks`

---

### Task 8: Twenty reads from frozen evidence, into the rig

**Files:**
- Create: `scripts/how-it-wins-corpus.ts`, `apps/web/src/app/eval/how-it-wins/page.tsx`, `apps/web/src/app/eval/how-it-wins/HowItWinsReview.tsx`, `apps/web/tests/eval-how-it-wins.test.ts`
- Modify: `package.json` (`"eval:how-it-wins": "tsx scripts/how-it-wins-corpus.ts"`), `.gitignore` (`eval/curation/how-it-wins/`), `apps/web/src/app/eval/types.ts` (`ledgerEventInputSchema` adds `{ kind: "how-it-wins", slug, verdict: "ship" | "weak" | "slop", note?: string }`), `apps/web/src/app/eval/api/ledger/route.ts` (accept it; reveal for its slug), `apps/web/src/app/eval/LensView.tsx` (a "How it wins" block: sentence, running with name and meaning and note, pair with Wrong if, next, wrong if), `apps/web/src/app/eval/rig-data.ts` (`readHowItWinsReads(dataDir)` and `nextHowItWinsSlug(reads, events)`), `docs/superpowers/specs/2026-08-11-corpus-eval-taste-rig-design.md` (one paragraph on the new route)

Script behavior (`scripts/how-it-wins-corpus.ts`):
- Self-loads `.env.local` (writer key, DeepSeek key). Reads `eval/curation/corpus/cards/*.json` (run `npm run eval:snapshot` first if the folder is empty; that script is read-only against prod). Flags: `--limit 20`, `--slugs a,b,c`, `--seed <string>` (default `how-it-wins-1`), `--writer` (default `claude-sonnet-5`), `--editor` (default `deepseek/deepseek-v4-pro`), `--out eval/curation/how-it-wins`, `--verify` (default on; `--no-verify` skips the verifier call).
- Selection: cards with `synthesis` present, non-thin by `howItWinsThinFileReason`, preferring `richnessBand` rich then medium, seeded shuffle (`createSeededRng` from `scripts/eval-curation-lib.ts`), take `limit`.
- Per card: `synthesizeHowItWins` with `createAnthropicClient()`; then `verifySynthesis` over the running and pair claims with the card's citation sources (import from `@cold-start/llm`, same call shape as `verifySynthesisStepBody` uses through `verifyCardSynthesisDraft`; the script calls `verifySynthesis` directly and applies `applyHowItWinsVerification`); writes `eval/curation/how-it-wins/<slug>.json` = `{ slug, name, domain, models, preVerify: HowItWins, read: HowItWins, dropReason, editorSkipped, fitRetried, styleIssues, usage: { inputTokens, outputTokens, estimatedCostUsd } }` and appends to `eval/curation/how-it-wins/index.json`. Prints one line per card: slug, status, count, cost. Runs cards sequentially (Anthropic rate limits; ~2 to 3 minutes per card).
- Slopcheck every written read: after the run the script shells `python3 ~/.claude/scripts/slopcheck.py` on each output file and prints hits (does not fail; the report lists them).

Rig route `/eval/how-it-wins`: gated like the others (`assertEvalRigEnabled`); shows the next unjudged read (from `index.json` order) with the company name and the plain read (`LensView`-style block: sentence in the Lede role, running as name + meaning + note, pair with Wrong if, next, wrong if), a verdict form (ship / weak / slop, optional note), POST to the ledger, `router.refresh()` to advance; when all are judged, "All twenty read." plus a standings table (counts per verdict). No model names shown (blind).

- [ ] **Step 1: Tests**: `apps/web/tests/eval-how-it-wins.test.ts`: `nextHowItWinsSlug` returns the first slug without a `how-it-wins` event; the ledger route accepts the new kind and appends it (tmpdir + `EVAL_RIG_DATA_DIR`, mirroring `eval-ledger-route.test.ts`). `scripts/how-it-wins-corpus.test.ts` (tsx --test): the selection function prefers rich then medium, is deterministic per seed, and skips thin cards.
- [ ] **Step 2: Run**; fail. **Step 3: Implement.** **Step 4: Run** tests and typecheck; pass.
- [ ] **Step 5: Produce the twenty**: `npm run eval:snapshot` (if the corpus is empty), then `set -a; source .env.local; set +a; npm run eval:how-it-wins -- --limit 20`. Read the printed table. Open `/eval/how-it-wins` locally (`EVAL_RIG_ENABLED=true EVAL_RIG_DATA_DIR=$PWD/eval/curation npm run dev`) and confirm the first read renders. Do not judge any of them.
- [ ] **Step 6: Commit** `feat(eval): how-it-wins corpus reads and rig review route` (the reads themselves are gitignored).

---

### Task 9: Motion tuning in the real panel

- [ ] **Step 1**: `npm run qa:extension:ui -w @cold-start/extension` serves the mounted side panel; load a fixture card with a filed read (add one to the ui harness fixtures if the gallery fixture is not reachable there). Open it in Chrome (claude-in-chrome or a manual tab), scrub the edge, pin, step with the keyboard, record a short GIF.
- [ ] **Step 2**: Tune, at most three iterations, only these values: `EDGE_SPRING`, `EDGE_SIGMA_PX`, `EDGE_MAGNIFICATION`, scale fade in/out, note open/crossfade durations, arrival stagger. Stop when it feels right; iteration four is avoidance.
- [ ] **Step 3**: Record the final values and why in the spec's Motion section (a short "Tuned 2026-08-19" list). Commit `tune(extension): how-it-wins crown motion values`.

---

### Task 10: Docs, slop gate, full check, spec deviations

- [ ] **Step 1**: Update `CLAUDE.md` and `AGENTS.md` (the `apps/extension` paragraph's Lens description: four categories plus How it wins on the edge; the emphasis-read sentence in "Background work" gains the `how-it-wins` step; the Common Commands table gains `eval:how-it-wins`; the flag list gains `HOW_IT_WINS_ENABLED`). Update `docs/anthropic-llm-call-map.md` if Task 3 did not. Update `README.md`'s env reference with `HOW_IT_WINS_ENABLED`, `LLM_HOW_IT_WINS_MODEL`, `LLM_HOW_IT_WINS_EDITOR_MODEL`, `LLM_HOW_IT_WINS_FALLBACK_MODEL`.
- [ ] **Step 2**: Slopcheck every touched copy and prompt file: `python3 ~/.claude/scripts/slopcheck.py apps/extension/src/research/investor-read-copy.ts apps/extension/src/research/how-it-wins-edge.ts apps/extension/src/research/HowItWinsEdge.tsx packages/llm/src/how-it-wins-prompts.ts apps/web/src/app/eval/how-it-wins/*.tsx docs/superpowers/specs/2026-08-18-moat-read-design.md` and `grep -rn $'\u2014' <every touched file>` for em dashes. Zero hits.
- [ ] **Step 3**: Spec update: record deviations (the sentence is unverified prose; `nothing_stands_out` sentence optional after a code degrade; the analytics enum keeps old ids; the crown's note is a crown-owned popover styled as the memo variant rather than the shared tooltip state machine, because the crown's spring cursor, retargeting, and pin are its own state; the writer defaults to the synthesis chain, `claude-sonnet-5` set through `LLM_HOW_IT_WINS_MODEL` for the twenty and recommended for prod), the tuned motion values, and the "The case" label decision as shipped.
- [ ] **Step 4**: Build the extension (`npm run build -w @cold-start/extension`), the Firefox build (`npm run build:firefox -w @cold-start/extension`), then `npm run check` from the worktree root and read the exit code (`echo $?`), never through `tail`.
- [ ] **Step 5**: Commit `docs: how-it-wins ships behind HOW_IT_WINS_ENABLED`, then merge `how-it-wins` into `main` fast-forward only, push, and set `HOW_IT_WINS_ENABLED=false` on Vercel production before the deploy lands (`vercel env add HOW_IT_WINS_ENABLED production` with value `false`), then verify with `vercel env ls production | grep HOW_IT_WINS`.
- [ ] **Step 6**: The report: what shipped, what was removed, what changed from the spec, what is left, the one or two least-sure things, in short plain sentences with numbers.

## Self-review

Spec coverage: schema and enum (T1), degrade (T1), four passes and empty-text guard and certainty/fragment checks (T2), step and events and flag and contract (T3), Lens folds and plate height (T4), the crown's form and every motion clause (T5, T6, T9), ergonomics (T6), tests list (T1 to T8), eval gate (T7), twenty cards in the rig with prod flag off (T8, T10). Not in v1 items are untouched.

Type consistency: `HowItWinsDisplay` (T4) is what `how-it-wins-edge.ts` (T5) and `HowItWinsEdge.tsx` (T6) consume; `HowItWinsRead` (T1) is what `verifiedHowItWins` (T3) and `synthesizeHowItWins` (T2) produce; `HowItWinsModels` (T2) is what `worker-env.ts` (T3) and the corpus script (T8) build.
