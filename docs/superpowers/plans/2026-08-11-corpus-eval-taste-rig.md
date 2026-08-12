# Corpus Eval Taste Rig Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the compare-and-pick instrument for the corpus eval program: a production snapshot script, a deterministic session planner, and a dev-only `/eval` web rig with quick-pick rounds, deep singles, pair mode, an append-only judgment ledger, and a standings page.

**Architecture:** A read-only script freezes production cards into `eval/curation/corpus/`; a seeded planner fixes group composition; the rig is a 404-gated route group in `apps/web` that renders frozen data with existing card-face components and appends judgment events to JSONL. Nothing in the rig touches production at runtime.

**Tech Stack:** tsx scripts (existing `scripts/` patterns), Drizzle read queries, Next.js 15 App Router route group, React 19 client components for pick capture, zod for event validation, vitest (`apps/web/tests/`) and `tsx --test` (`scripts/*.test.ts`).

**Spec:** `docs/superpowers/specs/2026-08-11-corpus-eval-taste-rig-design.md`. Read it fully before starting.

## Global Constraints

- The rig renders synthesis in a browser. Public web must never show synthesis, so every `/eval` surface (pages and route handlers) is dead unless `EVAL_RIG_ENABLED === "true"`, and that gate has a test. `EVAL_RIG_ENABLED` is never set on Vercel.
- The snapshot script performs only SELECT queries. No writes to production anywhere in its path.
- `eval/curation/corpus/` is gitignored (it contains synthesis). `eval/curation/ledger/` IS committed (it is Samay's durable judgment record and contains no synthesis).
- The ledger is append-only. A changed mind is a new event. No handler ever edits or truncates `picks.jsonl`.
- Blindness: quick-pick and deep-single screens never show era, model routing, cost, or generation date before the pick is logged. The reveal comes back in the POST response.
- Era and routing metadata rides with every corpus row so pattern extraction can tag findings by pipeline era.
- Work on a branch off `main` in the main tree (repo lint is known to fail in worktrees). Verify no other live session is editing the tree before starting (`ps aux | grep -iE "codex|claude"` and recent `git log`).
- Every task ends with the workspace test suite it touched passing. Final task requires full `npm run check` green (local docker postgres must be up for the db suites).
- Match repo conventions: no raw color literals in any new extension CSS (not applicable here; the rig lives in apps/web), comments only for constraints code cannot show, commit messages in the repo's plain style (`feat:`, `fix:`, `docs:`).

## File Structure

```
scripts/
  eval-curation-lib.ts            # pure helpers: era bucket, richness, seeded RNG, session planner
  eval-curation-lib.test.ts       # tsx --test unit tests (auto-runs in npm test)
  eval-corpus-snapshot.ts         # prod read-only freeze -> eval/curation/corpus/
  eval-session-plan.ts            # pool.json -> session-plan.json CLI
eval/curation/                    # data root (corpus/ gitignored; ledger/, pool.json, finalists.json committed)
apps/web/src/app/eval/
  gate.ts                         # assertEvalRigEnabled() + dataDir()
  types.ts                        # zod schemas: ledger events, plan, pool, corpus row, condensed view
  rig-data.ts                     # server-only readers: corpus, plan, ledger, next-round logic
  condensed.ts                    # ColdStartCard + sections -> CondensedView (reuses card-face model)
  eval.css                        # rig-local styles, light mode, imported by layout
  layout.tsx                      # gate + chrome
  page.tsx                        # quick-pick rounds
  QuickPickRound.tsx              # client: pick, chips, runner-up, note, reveal
  CondensedCard.tsx               # one condensed profile
  LensView.tsx                    # minimal read-only synthesis renderer
  SectionView.tsx                 # minimal research-section renderer (competition et al)
  deep/page.tsx                   # deep singles over finalists.json
  DeepSingle.tsx                  # client: tier, layer verdict, chips, missing comps, note
  pairs/page.tsx                  # same-company blind A/B over pairs-plan.json
  PairPick.tsx                    # client: A/B pick
  standings/page.tsx              # wins, chips histogram, control-lane alarm
  api/ledger/route.ts             # POST append + reveal payload
apps/web/tests/
  eval-gate.test.ts
  eval-rig-data.test.ts
  eval-condensed.test.tsx
  eval-ledger-route.test.ts
```

Data file schemas (produced/consumed across tasks; exact zod definitions in Task 4):

- `corpus/index.json`: `CorpusIndexRow[]`
- `corpus/cards/<slug>.json`: `{ card: <full card_json>, sections: StoredSection[], index: CorpusIndexRow }`
- `pool.json`: `{ entries: PoolEntry[] }` (authored by the orchestrating session after pre-reads; a fixture example ships in Task 3)
- `session-plan.json`: `SessionPlan`
- `finalists.json`: `{ slugs: string[] }`
- `pairs-plan.json`: `{ pairs: PairPlanEntry[] }`
- `ledger/picks.jsonl`: one `LedgerEvent` per line

---

### Task 1: Curation library (era, richness, RNG, session planner)

**Files:**
- Create: `scripts/eval-curation-lib.ts`
- Test: `scripts/eval-curation-lib.test.ts`

**Interfaces:**
- Consumes: `sourceQualityTierRank` from `@cold-start/core` (packages/core/src/source-quality.ts).
- Produces (later tasks import these exact names from `./eval-curation-lib`):
  - `type EraBucket = "may-pre-gate" | "june" | "july-overhaul" | "august-current"`
  - `eraBucket(createdAt: Date): EraBucket`
  - `richnessScore(tiers: string[]): number` (sum of `sourceQualityTierRank` over per-source tiers)
  - `type RichnessBand = "thin" | "medium" | "rich"`
  - `richnessBands(scores: number[]): { thinMax: number; mediumMax: number }` (terciles)
  - `bandFor(score: number, bands: {thinMax: number; mediumMax: number}): RichnessBand`
  - `createSeededRng(seed: string): () => number`
  - `type PoolEntry = { slug: string; richnessBand: RichnessBand; eraBucket: EraBucket; control: boolean }`
  - `type SessionPlan = { seed: string; groupSize: number; rounds: { index: number; slugs: string[]; mixedBand: boolean }[] }`
  - `buildSessionPlan(pool: PoolEntry[], seed: string, groupSize?: number): SessionPlan`

- [ ] **Step 1: Write the failing tests**

```ts
// scripts/eval-curation-lib.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  eraBucket, richnessBands, bandFor, createSeededRng, buildSessionPlan,
  type PoolEntry
} from "./eval-curation-lib";

test("eraBucket maps creation dates to pipeline eras", () => {
  assert.equal(eraBucket(new Date("2026-05-15T00:00:00Z")), "may-pre-gate");
  assert.equal(eraBucket(new Date("2026-06-30T23:59:59Z")), "june");
  assert.equal(eraBucket(new Date("2026-07-21T12:00:00Z")), "july-overhaul");
  assert.equal(eraBucket(new Date("2026-08-11T00:00:00Z")), "august-current");
});

test("richness terciles split a score population into three bands", () => {
  const bands = richnessBands([1, 2, 3, 4, 5, 6, 7, 8, 9]);
  assert.equal(bandFor(1, bands), "thin");
  assert.equal(bandFor(5, bands), "medium");
  assert.equal(bandFor(9, bands), "rich");
});

test("seeded rng is deterministic per seed", () => {
  const a = createSeededRng("sitting-1");
  const b = createSeededRng("sitting-1");
  const c = createSeededRng("sitting-2");
  const seqA = [a(), a(), a()];
  const seqB = [b(), b(), b()];
  assert.deepEqual(seqA, seqB);
  assert.notDeepEqual(seqA, [c(), c(), c()]);
});

function poolFixture(): PoolEntry[] {
  const eras = ["may-pre-gate", "june", "july-overhaul", "august-current"] as const;
  const bands = ["thin", "medium", "rich"] as const;
  return Array.from({ length: 30 }, (_, i) => ({
    slug: `co-${i}`,
    richnessBand: bands[i % 3],
    eraBucket: eras[i % 4],
    control: i % 10 === 0
  }));
}

test("session plan is deterministic and covers every entry exactly once", () => {
  const pool = poolFixture();
  const p1 = buildSessionPlan(pool, "seed-x");
  const p2 = buildSessionPlan(pool, "seed-x");
  assert.deepEqual(p1, p2);
  const seen = p1.rounds.flatMap((r) => r.slugs).sort();
  assert.deepEqual(seen, pool.map((e) => e.slug).sort());
});

test("groups hold 3-4 cards and stay band-pure unless flagged mixedBand", () => {
  const pool = poolFixture();
  const plan = buildSessionPlan(pool, "seed-x");
  const bySlug = new Map(pool.map((e) => [e.slug, e]));
  for (const round of plan.rounds) {
    assert.ok(round.slugs.length >= 3 && round.slugs.length <= 4);
    const bands = new Set(round.slugs.map((s) => bySlug.get(s)!.richnessBand));
    if (!round.mixedBand) assert.equal(bands.size, 1);
  }
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx tsx --test scripts/eval-curation-lib.test.ts`
Expected: FAIL, module not found.

- [ ] **Step 3: Implement the library**

```ts
// scripts/eval-curation-lib.ts
import { sourceQualityTierRank, type SourceQualityTier } from "@cold-start/core";

export type EraBucket = "may-pre-gate" | "june" | "july-overhaul" | "august-current";

// Cutoffs approximate pipeline eras by creation month; routing tags on each corpus
// row add per-card precision where traces survive.
export function eraBucket(createdAt: Date): EraBucket {
  const t = createdAt.getTime();
  if (t < Date.parse("2026-06-01T00:00:00Z")) return "may-pre-gate";
  if (t < Date.parse("2026-07-01T00:00:00Z")) return "june";
  if (t < Date.parse("2026-08-01T00:00:00Z")) return "july-overhaul";
  return "august-current";
}

export function richnessScore(tiers: string[]): number {
  return tiers.reduce((sum, tier) => sum + sourceQualityTierRank(tier as SourceQualityTier), 0);
}

export type RichnessBand = "thin" | "medium" | "rich";

export function richnessBands(scores: number[]): { thinMax: number; mediumMax: number } {
  const sorted = [...scores].sort((a, b) => a - b);
  const at = (q: number) => sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))] ?? 0;
  return { thinMax: at(1 / 3), mediumMax: at(2 / 3) };
}

export function bandFor(score: number, bands: { thinMax: number; mediumMax: number }): RichnessBand {
  if (score <= bands.thinMax) return "thin";
  if (score <= bands.mediumMax) return "medium";
  return "rich";
}

export function createSeededRng(seed: string): () => number {
  let h = 1779033703 ^ seed.length;
  for (let i = 0; i < seed.length; i += 1) {
    h = Math.imul(h ^ seed.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  let a = (h ^= h >>> 16) >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export type PoolEntry = {
  slug: string;
  richnessBand: RichnessBand;
  eraBucket: EraBucket;
  control: boolean;
};

export type SessionPlan = {
  seed: string;
  groupSize: number;
  rounds: { index: number; slugs: string[]; mixedBand: boolean }[];
};

function shuffled<T>(items: T[], rng: () => number): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

// Era-interleaves one band: round-robin across era buckets so no group is a
// single-era block when the band holds more than one era.
function eraInterleaved(entries: PoolEntry[], rng: () => number): PoolEntry[] {
  const byEra = new Map<EraBucket, PoolEntry[]>();
  for (const entry of shuffled(entries, rng)) {
    byEra.set(entry.eraBucket, [...(byEra.get(entry.eraBucket) ?? []), entry]);
  }
  const lanes = shuffled([...byEra.values()], rng);
  const out: PoolEntry[] = [];
  while (lanes.some((lane) => lane.length > 0)) {
    for (const lane of lanes) {
      const next = lane.shift();
      if (next) out.push(next);
    }
  }
  return out;
}

export function buildSessionPlan(pool: PoolEntry[], seed: string, groupSize = 4): SessionPlan {
  const rng = createSeededRng(seed);
  const bands: RichnessBand[] = ["rich", "medium", "thin"];
  const rounds: SessionPlan["rounds"] = [];
  const leftovers: PoolEntry[] = [];
  for (const band of bands) {
    const ordered = eraInterleaved(pool.filter((e) => e.richnessBand === band), rng);
    for (let i = 0; i + groupSize <= ordered.length; i += groupSize) {
      rounds.push({ index: rounds.length, slugs: ordered.slice(i, i + groupSize).map((e) => e.slug), mixedBand: false });
    }
    leftovers.push(...ordered.slice(Math.floor(ordered.length / groupSize) * groupSize));
  }
  const rest = eraInterleaved(leftovers, rng);
  for (let i = 0; i < rest.length; i += groupSize) {
    const slugs = rest.slice(i, i + groupSize).map((e) => e.slug);
    if (slugs.length >= 3) {
      rounds.push({ index: rounds.length, slugs, mixedBand: true });
    } else if (rounds.length > 0) {
      // A 1-2 card remainder cannot form a comparable group; fold it into the last round.
      rounds[rounds.length - 1].slugs.push(...slugs);
      rounds[rounds.length - 1].mixedBand = true;
    }
  }
  return { seed, groupSize, rounds };
}
```

Note: the fold-remainder branch can push a round to 5-6 slugs. If the test's 3-4 bound fails on the fixture, prefer rebalancing: move one slug from the previous round instead of folding two. Implement the rebalance if and only if the fixture forces it; keep the tests as written.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx tsx --test scripts/eval-curation-lib.test.ts`
Expected: PASS (all 5).

- [ ] **Step 5: Commit**

```bash
git add scripts/eval-curation-lib.ts scripts/eval-curation-lib.test.ts
git commit -m "feat: add curation library for the corpus eval rig"
```

---

### Task 2: Corpus snapshot script

**Files:**
- Create: `scripts/eval-corpus-snapshot.ts`
- Modify: `package.json` (root; add `"eval:snapshot": "tsx scripts/eval-corpus-snapshot.ts"` to scripts)
- Modify: `.gitignore` (add `eval/curation/corpus/`)

**Interfaces:**
- Consumes: `loadProductionEnv` from `scripts/alpha-common.ts`; Drizzle client and tables from `@cold-start/db` (read `scripts/measure-first-usable.ts` first and copy its client construction and connection teardown exactly); `generationTraceSchema` from `@cold-start/core`; Task 1's `eraBucket`, `richnessScore`.
- Produces: `eval/curation/corpus/index.json` (array of `CorpusIndexRow`) and `eval/curation/corpus/cards/<slug>.json` (`{ card, sections, index }`). `CorpusIndexRow` shape (also defined as zod in Task 4; keep field names identical):

```ts
type CorpusIndexRow = {
  slug: string;
  name: string;
  domain: string;
  createdAt: string;          // ISO
  updatedAt: string;          // ISO
  eraBucket: EraBucket;
  hasSynthesis: boolean;
  sourceCount: number;
  sourceQuality: Record<string, number>;   // tier -> count
  citationCount: number;
  bullCount: number;
  bearCount: number;
  openQuestionCount: number;
  sectionsPresent: string[];               // research section ids stored for the card
  richnessScore: number;
  richnessBand: RichnessBand;
  routing: Record<string, string> | null;  // stage -> model, from latest parseable analysis trace
  costUsd: number | null;                  // total cost streams from that trace, summed
};
```

- [ ] **Step 1: Read the patterns before writing**

Read `scripts/measure-first-usable.ts` (env self-load, DB client, teardown), `packages/db/src/schema.ts` lines 56-205 (exact column names for `cards`, `sources`, `citations`, `generationRuns`, `researchSections`), and `packages/core/src/generation-trace.ts` (trace shape: where per-stage model strings and the cost streams live).

- [ ] **Step 2: Implement the script**

Structure (adapt column names to what schema.ts actually declares; the queries below name the tables and intent):

```ts
// scripts/eval-corpus-snapshot.ts
// Read-only production freeze for the corpus eval rig. SELECTs only.
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { loadProductionEnv } from "./alpha-common";
import { eraBucket, richnessScore, richnessBands, bandFor } from "./eval-curation-lib";
import { generationTraceSchema } from "@cold-start/core";

loadProductionEnv();
// ...construct db exactly as measure-first-usable.ts does...

const OUT = path.join(process.cwd(), "eval", "curation", "corpus");

async function main() {
  await mkdir(path.join(OUT, "cards"), { recursive: true });
  const allCards = /* select id, slug, domain, card_json, created_at, updated_at from cards */;
  const rows = [];
  for (const card of allCards) {
    const sources = /* select quality tier per source for card.id */;
    const citationCount = /* count citations for card.id */;
    const sections = /* select stored research_sections rows for card.domain */;
    const latestAnalysisRun = /* latest generation_runs row for card.domain where mode='analysis' and trace_json is not null, ordered by started_at desc, limit 1 */;
    const trace = latestAnalysisRun ? generationTraceSchema.safeParse(latestAnalysisRun.traceJson) : null;
    const synthesis = card.cardJson?.synthesis ?? null;
    rows.push({
      row: {
        slug: card.slug,
        name: card.cardJson?.identity?.name ?? card.slug,
        domain: card.domain,
        createdAt: card.createdAt.toISOString(),
        updatedAt: card.updatedAt.toISOString(),
        eraBucket: eraBucket(card.createdAt),
        hasSynthesis: Boolean(synthesis),
        sourceCount: sources.length,
        sourceQuality: countByTier(sources),
        citationCount,
        bullCount: synthesis?.bullCase?.length ?? 0,
        bearCount: synthesis?.bearCase?.length ?? 0,
        openQuestionCount: synthesis?.openQuestions?.length ?? 0,
        sectionsPresent: sections.map((s) => s.sectionId),
        richnessScore: richnessScore(sources.map((s) => s.tier)),
        richnessBand: "thin", // assigned after the full pass, below
        routing: trace?.success ? routingFromTrace(trace.data) : null,
        costUsd: trace?.success ? totalCostFromTrace(trace.data) : null
      },
      card: card.cardJson,
      sections
    });
  }
  const bands = richnessBands(rows.map((r) => r.row.richnessScore));
  for (const r of rows) r.row.richnessBand = bandFor(r.row.richnessScore, bands);
  await writeFile(path.join(OUT, "index.json"), JSON.stringify(rows.map((r) => r.row), null, 2));
  for (const r of rows) {
    await writeFile(
      path.join(OUT, "cards", `${r.row.slug}.json`),
      JSON.stringify({ card: r.card, sections: r.sections, index: r.row }, null, 2)
    );
  }
  console.log(`froze ${rows.length} cards (${rows.filter((r) => r.row.hasSynthesis).length} with synthesis)`);
}

main().then(/* teardown as measure-first-usable does */);
```

`routingFromTrace` collects each recorded LLM stage's model string into `{stage: model}`; `totalCostFromTrace` sums the trace's cost streams (`costUsdAnthropic`, `costUsdAgentcash`, direct-Exa and Websets estimated costs; exact field paths from generation-trace.ts). If the identity name lives at a different card_json path, take it from wherever `CardFace` reads it (check `apps/web/src/lib/card-face/model.ts` usage).

- [ ] **Step 3: Add the npm script and gitignore entry, then run against production**

Run: `npm run eval:snapshot`
Expected: prints `froze ~359 cards (~144 with synthesis)` (exact counts may drift a few cards as production moves; the ~359/144 shape from 2026-08-11 is the sanity anchor). Spot-open one `cards/<slug>.json` and confirm `card.synthesis` is present for a lens-bearing slug and `index.routing` parses for a recent card.

- [ ] **Step 4: Confirm the corpus stays out of git**

Run: `git status --short`
Expected: no `eval/curation/corpus/` entries appear.

- [ ] **Step 5: Commit**

```bash
git add scripts/eval-corpus-snapshot.ts package.json .gitignore
git commit -m "feat: add read-only corpus snapshot for the eval rig"
```

---

### Task 3: Session-plan CLI and pool fixture

**Files:**
- Create: `scripts/eval-session-plan.ts`
- Create: `eval/curation/pool.example.json`
- Modify: `package.json` (root; add `"eval:session-plan": "tsx scripts/eval-session-plan.ts"`)

**Interfaces:**
- Consumes: `buildSessionPlan`, `PoolEntry` from Task 1.
- Produces: `eval/curation/session-plan.json` matching Task 1's `SessionPlan` type. CLI: `npm run eval:session-plan -- --pool eval/curation/pool.json --seed <string>` (defaults: pool path as shown, seed required).

- [ ] **Step 1: Implement the CLI**

```ts
// scripts/eval-session-plan.ts
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { buildSessionPlan, type PoolEntry } from "./eval-curation-lib";

function arg(flag: string): string | undefined {
  const i = process.argv.indexOf(flag);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function main() {
  const poolPath = arg("--pool") ?? path.join("eval", "curation", "pool.json");
  const seed = arg("--seed");
  if (!seed) throw new Error("--seed is required; the seed pins group composition for resumable sittings");
  const pool = JSON.parse(await readFile(poolPath, "utf8")) as { entries: PoolEntry[] };
  const plan = buildSessionPlan(pool.entries, seed);
  const outPath = path.join(path.dirname(poolPath), "session-plan.json");
  await writeFile(outPath, JSON.stringify(plan, null, 2));
  console.log(`wrote ${plan.rounds.length} rounds to ${outPath}`);
}

main();
```

- [ ] **Step 2: Create the pool fixture**

`eval/curation/pool.example.json` with 8 entries shaped exactly like `PoolEntry` (two bands, two eras, one `control: true`), so the rig can be exercised before the real pool exists. Slugs must match cards that exist in a snapshot or in the test fixtures used later (use `gallery-cards` slugs from `apps/web/tests/fixtures/gallery-cards.ts` where possible).

- [ ] **Step 3: Verify determinism end to end**

Run: `cp eval/curation/pool.example.json /tmp/pool.json && npm run eval:session-plan -- --pool /tmp/pool.json --seed pilot && cp /tmp/session-plan.json /tmp/a.json && npm run eval:session-plan -- --pool /tmp/pool.json --seed pilot && diff /tmp/a.json /tmp/session-plan.json`
Expected: no diff output.

- [ ] **Step 4: Commit**

```bash
git add scripts/eval-session-plan.ts eval/curation/pool.example.json package.json
git commit -m "feat: add seeded session-plan CLI for eval sittings"
```

---

### Task 4: Rig gate and event schemas

**Files:**
- Create: `apps/web/src/app/eval/gate.ts`
- Create: `apps/web/src/app/eval/types.ts`
- Create: `apps/web/src/app/eval/eval.css`
- Create: `apps/web/src/app/eval/layout.tsx`
- Create: `apps/web/src/app/eval/page.tsx` (placeholder this task; real UI in Task 8)
- Test: `apps/web/tests/eval-gate.test.ts`

**Interfaces:**
- Produces:
  - `assertEvalRigEnabled(): void` (throws Next's notFound when `EVAL_RIG_ENABLED !== "true"`)
  - `dataDir(): string` (returns `EVAL_RIG_DATA_DIR`, throws a plain Error naming the variable when unset)
  - zod schemas + inferred types in `types.ts`: `poolEntrySchema`, `sessionPlanSchema`, `corpusIndexRowSchema` (mirrors Task 2's shape), `condensedViewSchema`, `ledgerEventInputSchema` (discriminated union on `kind`), `type LedgerEvent = LedgerEventInput & { ts: string }`.

Chips are fixed vocabularies in `types.ts`:

```ts
export const POSITIVE_CHIPS = ["sharper-thesis", "better-comps", "more-honest", "deeper-evidence", "tighter", "better-voice"] as const;
export const INVERSE_CHIPS = ["slop", "generic", "padded", "template-question"] as const;
```

Event union (exact fields):

```ts
const quickPick = z.object({
  kind: z.literal("quick-pick"),
  roundIndex: z.number().int().nonnegative(),
  group: z.array(z.string()).min(3).max(6),
  winner: z.string(),
  runnerUp: z.string().optional(),
  chips: z.array(z.enum(POSITIVE_CHIPS)).default([]),
  note: z.string().default(""),
  knowsSpace: z.boolean().default(false)
}).refine((e) => e.group.includes(e.winner), { message: "winner must be in group" })
  .refine((e) => !e.runnerUp || (e.group.includes(e.runnerUp) && e.runnerUp !== e.winner), { message: "runnerUp must be a non-winner group member" });

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

const pair = z.object({
  kind: z.literal("pair"),
  pairId: z.string(),
  slug: z.string(),
  winner: z.enum(["A", "B"]),
  chips: z.array(z.enum([...POSITIVE_CHIPS, ...INVERSE_CHIPS])).default([]),
  note: z.string().default("")
});

export const ledgerEventInputSchema = z.discriminatedUnion("kind", [quickPick, deepSingle, pair]);
```

- [ ] **Step 1: Write the failing gate test**

```ts
// apps/web/tests/eval-gate.test.ts
import { afterEach, describe, expect, it, vi } from "vitest";
import { assertEvalRigEnabled, dataDir } from "../src/app/eval/gate";

afterEach(() => vi.unstubAllEnvs());

describe("eval rig gate", () => {
  it("throws notFound when EVAL_RIG_ENABLED is unset", () => {
    vi.stubEnv("EVAL_RIG_ENABLED", "");
    expect(() => assertEvalRigEnabled()).toThrow();
  });

  it("passes when EVAL_RIG_ENABLED is true", () => {
    vi.stubEnv("EVAL_RIG_ENABLED", "true");
    expect(() => assertEvalRigEnabled()).not.toThrow();
  });

  it("dataDir requires EVAL_RIG_DATA_DIR", () => {
    vi.stubEnv("EVAL_RIG_DATA_DIR", "");
    expect(() => dataDir()).toThrow(/EVAL_RIG_DATA_DIR/);
    vi.stubEnv("EVAL_RIG_DATA_DIR", "/tmp/rig");
    expect(dataDir()).toBe("/tmp/rig");
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm test -w @cold-start/web -- eval-gate`
Expected: FAIL, module not found.

- [ ] **Step 3: Implement gate, types, layout, placeholder page**

```ts
// apps/web/src/app/eval/gate.ts
import { notFound } from "next/navigation";

// The rig renders synthesis in a browser; public web must never show synthesis.
// Every /eval page and route handler calls this first.
export function assertEvalRigEnabled(): void {
  if (process.env.EVAL_RIG_ENABLED !== "true") notFound();
}

export function dataDir(): string {
  const dir = process.env.EVAL_RIG_DATA_DIR;
  if (!dir) throw new Error("EVAL_RIG_DATA_DIR must point at eval/curation (absolute path)");
  return dir;
}
```

`layout.tsx`: server component; calls `assertEvalRigEnabled()`, imports `./eval.css`, renders a minimal header ("Cold Start / taste rig") and `{children}`. `page.tsx` placeholder: calls `assertEvalRigEnabled()` and renders "rounds load in Task 8". `eval.css`: light-mode page ground, one column, system font stack is fine for the internal tool; keep every color a solid hex.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -w @cold-start/web -- eval-gate`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/app/eval apps/web/tests/eval-gate.test.ts
git commit -m "feat: gate the eval rig route group and define ledger schemas"
```

---

### Task 5: Rig data readers and round progression

**Files:**
- Create: `apps/web/src/app/eval/rig-data.ts`
- Test: `apps/web/tests/eval-rig-data.test.ts`

**Interfaces:**
- Consumes: `dataDir()` from Task 4; `sessionPlanSchema`, `corpusIndexRowSchema`, `ledgerEventInputSchema` types from Task 4.
- Produces (all read from `dataDir()`; all `async`, Node `fs/promises`):
  - `readCorpusIndex(): Promise<CorpusIndexRow[]>`
  - `readCardFile(slug: string): Promise<{ card: unknown; sections: unknown[]; index: CorpusIndexRow }>` (rejects slugs failing `/^[a-z0-9-]+$/` so a request can never path-traverse out of the corpus dir)
  - `readSessionPlan(): Promise<SessionPlan>`
  - `readLedger(): Promise<LedgerEvent[]>` (missing file means `[]`; skips blank lines; throws on an unparseable line, naming the line number; a corrupt ledger should stop a sitting, not silently drop judgments)
  - `nextQuickPickRound(plan: SessionPlan, events: LedgerEvent[]): SessionPlan["rounds"][number] | null` (first round index with no `quick-pick` event; pure, exported for tests)
  - `nextDeepSlug(finalists: string[], events: LedgerEvent[]): string | null` (first finalist with no `deep-single` event; pure)
  - `readFinalists(): Promise<string[]>` (from `finalists.json`, missing file means `[]`)

- [ ] **Step 1: Write the failing tests** (pure functions plus one fs round-trip against a tmp dir)

```ts
// apps/web/tests/eval-rig-data.test.ts
import { describe, expect, it, vi, afterEach } from "vitest";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { nextQuickPickRound, nextDeepSlug, readLedger, readCardFile } from "../src/app/eval/rig-data";

const plan = { seed: "s", groupSize: 4, rounds: [
  { index: 0, slugs: ["a", "b", "c", "d"], mixedBand: false },
  { index: 1, slugs: ["e", "f", "g", "h"], mixedBand: false }
]};
const pick = (roundIndex: number) => ({
  kind: "quick-pick" as const, roundIndex, group: ["a", "b", "c", "d"],
  winner: "a", chips: [], note: "", knowsSpace: false, ts: "2026-08-11T00:00:00Z"
});

afterEach(() => vi.unstubAllEnvs());

describe("round progression", () => {
  it("serves the first unanswered round and null when done", () => {
    expect(nextQuickPickRound(plan, [])?.index).toBe(0);
    expect(nextQuickPickRound(plan, [pick(0)])?.index).toBe(1);
    expect(nextQuickPickRound(plan, [pick(0), pick(1)])).toBeNull();
  });

  it("deep singles progress by finalist order", () => {
    const done = { kind: "deep-single" as const, slug: "a", tier: "S" as const, layers: "both" as const,
      chips: [], missingComps: [], note: "", knowsSpace: false, ts: "2026-08-11T00:00:00Z" };
    expect(nextDeepSlug(["a", "b"], [])).toBe("a");
    expect(nextDeepSlug(["a", "b"], [done])).toBe("b");
  });
});

describe("ledger and card reads", () => {
  it("reads events back and rejects traversal slugs", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "rig-"));
    vi.stubEnv("EVAL_RIG_DATA_DIR", dir);
    await mkdir(path.join(dir, "ledger"), { recursive: true });
    await writeFile(path.join(dir, "ledger", "picks.jsonl"), JSON.stringify(pick(0)) + "\n");
    const events = await readLedger();
    expect(events).toHaveLength(1);
    await expect(readCardFile("../secrets")).rejects.toThrow();
  });
});
```

- [ ] **Step 2: Run to verify failure.** Run: `npm test -w @cold-start/web -- eval-rig-data`. Expected: FAIL.

- [ ] **Step 3: Implement `rig-data.ts`** per the Produces block. Reads are plain `readFile` + zod `parse`; `readLedger` splits on newlines, filters blanks, `JSON.parse` each with a try/catch that rethrows `new Error(\`ledger line ${n} is corrupt\`)`.

- [ ] **Step 4: Run to verify pass.** Run: same command. Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/app/eval/rig-data.ts apps/web/tests/eval-rig-data.test.ts
git commit -m "feat: add eval rig data readers and round progression"
```

---

### Task 6: Condensed views

**Files:**
- Create: `apps/web/src/app/eval/condensed.ts`
- Create: `apps/web/src/app/eval/CondensedCard.tsx`
- Test: `apps/web/tests/eval-condensed.test.tsx`

**Interfaces:**
- Consumes: `statSlots`, `callNumber`, `nextQuestionForCard`, `publicEvidenceText`, `type PublicCardData` from `apps/web/src/lib/card-face/model.ts`; gallery card fixtures from `apps/web/tests/fixtures/gallery-cards.ts`; research-section content shape from `packages/core/src/research-sections.ts` (read it before extracting competitor lines).
- Produces:
  - `type CondensedView = { slug: string; name: string; callNumber: string; stats: { label: string; value: string }[]; thesis: string | null; bullLead: string | null; bearLead: string | null; comps: string[]; nextQuestion: string | null; sourceLine: string }`
  - `buildCondensedView(slug: string, card: ColdStartCard, sections: ResearchSection[]): CondensedView`
  - `CondensedCard({ view, position }: { view: CondensedView; position: number })` server-renderable component; shows the position number (1-4) prominently for keyboard picking.

Rules: `thesis` is `card.synthesis?.whyItMatters?.text ?? null`; `bullLead`/`bearLead` are the first bull/bear claim texts; `comps` is up to 3 competitor lines from the stored `competition` section (name plus first clause, each through `publicEvidenceText(text, 120)`), empty array when the section is absent; `sourceLine` is `"${sourceCount} sources"` plus the top quality tier count from the index row when passed. The condensed view exposes NO era, routing, cost, or date fields; blindness is structural, not cosmetic.

- [ ] **Step 1: Write the failing test**

```tsx
// apps/web/tests/eval-condensed.test.tsx
import { describe, expect, it } from "vitest";
import { buildCondensedView } from "../src/app/eval/condensed";
import { galleryCards } from "./fixtures/gallery-cards";

describe("condensed views", () => {
  it("extracts the pick-screen fields and nothing identity-blind", () => {
    const fixture = galleryCards[0];
    const view = buildCondensedView(fixture.slug, fixture.card, fixture.sections ?? []);
    expect(view.name).toBeTruthy();
    expect(view.stats.length).toBeGreaterThan(0);
    expect(Object.keys(view)).not.toContain("eraBucket");
    expect(Object.keys(view)).not.toContain("routing");
  });

  it("tolerates a card with no synthesis and no competition section", () => {
    const bare = { ...galleryCards[0].card };
    delete (bare as Record<string, unknown>).synthesis;
    const view = buildCondensedView("bare", bare, []);
    expect(view.thesis).toBeNull();
    expect(view.comps).toEqual([]);
  });
});
```

Adapt fixture accessor names to what `gallery-cards.ts` actually exports (read it first; if it exports individual named cards rather than an array, import those).

- [ ] **Step 2: Run to verify failure.** Run: `npm test -w @cold-start/web -- eval-condensed`. Expected: FAIL.

- [ ] **Step 3: Implement** `condensed.ts` (pure) and `CondensedCard.tsx` (name, call number, stat row, thesis, bull/bear leads, comps list, next question, source line; position badge top-left). Strip synthesis before calling card-face helpers typed on `PublicCardData`: `const { synthesis, synthesisWithheld, ...publicCard } = card`.

- [ ] **Step 4: Run to verify pass**, then **Step 5: Commit**

```bash
git add apps/web/src/app/eval/condensed.ts apps/web/src/app/eval/CondensedCard.tsx apps/web/tests/eval-condensed.test.tsx
git commit -m "feat: build condensed pick views from stored cards"
```

---

### Task 7: Ledger route

**Files:**
- Create: `apps/web/src/app/eval/api/ledger/route.ts`
- Test: `apps/web/tests/eval-ledger-route.test.ts`

**Interfaces:**
- Consumes: `ledgerEventInputSchema` (Task 4), `dataDir` (Task 4), `readCorpusIndex` (Task 5).
- Produces: `POST /eval/api/ledger` accepting a `LedgerEventInput` body. Responses: 404 when the rig is disabled; 400 `{error}` on invalid body; 200 `{ok: true, reveal: CorpusIndexRow[]}` where `reveal` holds the index rows for every slug involved (group slugs for quick-pick; the single slug for deep-single and pair). Appends `{...event, ts}` as one JSONL line, creating `ledger/` on first write.

- [ ] **Step 1: Write the failing test**

```ts
// apps/web/tests/eval-ledger-route.test.ts
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { POST } from "../src/app/eval/api/ledger/route";

let dir: string;
beforeEach(async () => {
  dir = await mkdtemp(path.join(tmpdir(), "rig-ledger-"));
  vi.stubEnv("EVAL_RIG_ENABLED", "true");
  vi.stubEnv("EVAL_RIG_DATA_DIR", dir);
  await mkdir(path.join(dir, "corpus"), { recursive: true });
  await writeFile(path.join(dir, "corpus", "index.json"), JSON.stringify([
    { slug: "a", name: "A", domain: "a.com", createdAt: "2026-05-01T00:00:00Z", updatedAt: "2026-05-01T00:00:00Z",
      eraBucket: "may-pre-gate", hasSynthesis: true, sourceCount: 5, sourceQuality: {}, citationCount: 9,
      bullCount: 2, bearCount: 2, openQuestionCount: 3, sectionsPresent: [], richnessScore: 5,
      richnessBand: "thin", routing: null, costUsd: null }
  ]));
});
afterEach(() => vi.unstubAllEnvs());

const body = { kind: "quick-pick", roundIndex: 0, group: ["a", "b", "c", "d"], winner: "a",
  chips: ["better-comps"], note: "", knowsSpace: false };
const post = (payload: unknown) => POST(new Request("http://rig/eval/api/ledger", {
  method: "POST", body: JSON.stringify(payload), headers: { "content-type": "application/json" } }));

describe("ledger route", () => {
  it("404s when the rig is disabled", async () => {
    vi.stubEnv("EVAL_RIG_ENABLED", "");
    expect((await post(body)).status).toBe(404);
  });

  it("rejects a winner outside the group", async () => {
    expect((await post({ ...body, winner: "zzz" })).status).toBe(400);
  });

  it("appends one line per event and returns the reveal", async () => {
    const first = await post(body);
    expect(first.status).toBe(200);
    const reveal = (await first.json()).reveal;
    expect(reveal.find((r: { slug: string }) => r.slug === "a").eraBucket).toBe("may-pre-gate");
    await post({ ...body, roundIndex: 1 });
    const lines = (await readFile(path.join(dir, "ledger", "picks.jsonl"), "utf8")).trim().split("\n");
    expect(lines).toHaveLength(2);
    expect(JSON.parse(lines[0]).ts).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run to verify failure.** Run: `npm test -w @cold-start/web -- eval-ledger-route`. Expected: FAIL.

- [ ] **Step 3: Implement the route.** Gate first (return 404 Response directly rather than `notFound()` inside a route handler), parse, validate, append with `appendFile` after `mkdir(..., {recursive: true})`, build `reveal` by filtering `readCorpusIndex()` to the involved slugs (missing slugs simply absent, so fixture pools work).

- [ ] **Step 4: Run to verify pass**, then **Step 5: Commit**

```bash
git add apps/web/src/app/eval/api apps/web/tests/eval-ledger-route.test.ts
git commit -m "feat: append eval picks to the judgment ledger"
```

---

### Task 8: Quick-pick rounds UI

**Files:**
- Modify: `apps/web/src/app/eval/page.tsx` (replace placeholder)
- Create: `apps/web/src/app/eval/QuickPickRound.tsx`
- Modify: `apps/web/src/app/eval/eval.css`

**Interfaces:**
- Consumes: `readSessionPlan`, `readLedger`, `readCardFile`, `nextQuickPickRound` (Task 5); `buildCondensedView`, `CondensedCard` (Task 6); `POSITIVE_CHIPS` (Task 4).
- Produces: `/eval` serving the next unanswered round; a completed plan renders a "rounds complete" screen linking to `/eval/deep` and `/eval/standings`.

- [ ] **Step 1: Wire the server page**

`page.tsx`: `assertEvalRigEnabled()`; load plan + ledger; `nextQuickPickRound`; when null render the done screen; otherwise `Promise.all` the round's `readCardFile` calls, build condensed views, render `<QuickPickRound roundIndex={round.index} views={views} />`. Progress line: `Round ${round.index + 1} of ${plan.rounds.length}`, plus the fixed question verbatim: **"Which one makes you smartest about its company?"**

- [ ] **Step 2: Build the client component**

`QuickPickRound.tsx` (`"use client"`): a 2x2 grid of `CondensedCard`s. Interaction contract:
- Click a card or press keys `1`-`4` to select the winner (visible selected state).
- After a winner is selected, remaining cards can be toggled runner-up with a single click on their "runner-up" corner control (or `shift+number`).
- Chips row from `POSITIVE_CHIPS`, multi-toggle. A `knowsSpace` toggle ("I know this space"). One `<textarea>` for the dictated note, never required, autofocused after winner selection so Wispr Flow can land immediately.
- Submit (`Enter` or button) POSTs `{kind: "quick-pick", roundIndex, group, winner, runnerUp?, chips, note, knowsSpace}` to `/eval/api/ledger`; on 200, show the reveal panel (era, routing, cost, dates per card from the response) with a "next round" button calling `router.refresh()`.
- Errors render inline ("pick did not save; retry") and never auto-advance; a lost judgment is the one unacceptable failure.

- [ ] **Step 3: Exercise against fixture data**

Build a throwaway data dir: run the snapshot against production if available, else hand-place two `cards/<slug>.json` files from gallery fixtures plus a matching `index.json`, `pool.json` from `pool.example.json`, and a session plan (`npm run eval:session-plan -- --pool eval/curation/pool.json --seed pilot`). Then:

Run: `EVAL_RIG_ENABLED=true EVAL_RIG_DATA_DIR=$(pwd)/eval/curation npm run dev`
Expected: `/eval` serves round 1; keyboard pick, chips, note, submit, reveal, next round all work; `ledger/picks.jsonl` grows one line per submit; `/eval` 404s when the env vars are dropped.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/app/eval
git commit -m "feat: serve quick-pick rounds in the eval rig"
```

---

### Task 9: Deep singles and pair mode

**Files:**
- Create: `apps/web/src/app/eval/LensView.tsx`
- Create: `apps/web/src/app/eval/SectionView.tsx`
- Create: `apps/web/src/app/eval/deep/page.tsx`
- Create: `apps/web/src/app/eval/DeepSingle.tsx`
- Create: `apps/web/src/app/eval/pairs/page.tsx`
- Create: `apps/web/src/app/eval/PairPick.tsx`

**Interfaces:**
- Consumes: `readFinalists`, `nextDeepSlug`, `readCardFile`, `readLedger` (Task 5); `CardFace` mounting pattern from `apps/web/src/app/c/[slug]/page.tsx` (read that page first and mount `CardFace` the same way, minus any route-specific data fetching); `INVERSE_CHIPS`, `POSITIVE_CHIPS` (Task 4).
- Produces: `/eval/deep` serving the next unjudged finalist as a full dossier; `/eval/pairs` serving blind same-company A/Bs from `pairs-plan.json` with shape `{ pairs: { pairId: string; slug: string; arms: { A: string; B: string } }[] }` where each arm value is a path under the data dir to a `{card, sections}` JSON file (arm assignment already shuffled when the plan file is authored; the UI labels arms only "A" and "B").

- [ ] **Step 1: Build the renderers.** `LensView` renders synthesis directly: `whyItMatters` paragraph, bull case list, bear case list, open questions with their `category` tags, and whichever `marketStructureAndTiming` claims are non-null (label them with their field names; consult `apps/extension/src/research/investor-lens.ts` for the five filed-category labels if richer grouping is cheap, but do not import from the extension workspace). `SectionView` renders a stored research section's title and bullets with citation counts; used for `competition` first in the dossier order.

- [ ] **Step 2: Build `/eval/deep`.** Server page: finalists + ledger -> `nextDeepSlug`; render dossier: `CardFace` (synthesis stripped) above `LensView` above `SectionView` for the competition section when present. `DeepSingle` client controls: tier `S/A/B` (keys `s`/`a`/`b`), layer verdict `facts/read/both`, chips (positive + inverse), a "missing comps" text input (comma-separated names, dictation-friendly), `knowsSpace` toggle, note textarea, submit -> POST `{kind: "deep-single", ...}` -> reveal -> next.

- [ ] **Step 3: Build `/eval/pairs`.** Server page reads `pairs-plan.json` (missing file renders "no pairs planned"); next pair = first `pairId` without a `pair` ledger event; render the two dossiers stacked (A then B, each `CardFace` + `LensView`), `PairPick` posts `{kind: "pair", pairId, slug, winner, chips, note}`.

- [ ] **Step 4: Exercise manually** with the Task 8 data dir plus a hand-authored `finalists.json` (2 slugs) and a `pairs-plan.json` cloning one card file as both arms. All three flows append to the ledger and reveal after pick.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/app/eval
git commit -m "feat: add deep singles and blind pair mode to the eval rig"
```

---

### Task 10: Standings page

**Files:**
- Create: `apps/web/src/app/eval/standings/page.tsx`

**Interfaces:**
- Consumes: `readLedger`, `readCorpusIndex` (Task 5); `readFile` of `pool.json` for control flags.
- Produces: `/eval/standings` rendering: (1) a wins table (slug, name, wins, runner-up count, era, band; sorted by wins then runner-ups), (2) a chip histogram across all events, (3) the control-lane alarm: a visible warning block listing any `control: true` pool entry with at least one win or runner-up flag ("control card ranked; the triage pool may be filtering wrong; consider widening"), (4) deep-single tier list grouped S/A/B, and (5) a plain `<pre>` block of the raw event count by kind so a sitting's end state is auditable at a glance.

- [ ] **Step 1: Implement the page** (server component, pure aggregation over ledger events; no client JS needed).
- [ ] **Step 2: Verify manually** with the ledger produced during Tasks 8-9: wins add up, the fixture's control slug triggers the alarm when hand-picked as a winner.
- [ ] **Step 3: Commit**

```bash
git add apps/web/src/app/eval/standings
git commit -m "feat: add standings and control-lane alarm to the eval rig"
```

---

### Task 11: Docs, guards, and the full gate

**Files:**
- Modify: `CLAUDE.md` (Common Commands: add `eval:snapshot`, `eval:session-plan` lines; note EVAL_RIG_ENABLED/EVAL_RIG_DATA_DIR under the env-sourcing paragraph, corpus dir gitignored, ledger committed)
- Modify: `AGENTS.md` (same two additions; the files stay in sync)
- Modify: `docs/deployment.md` (one line: `EVAL_RIG_ENABLED` must never be set in any Vercel environment; the eval rig is local-only because it renders synthesis)
- Modify: `README.md` (env reference: the two variables, marked local-dev only)

- [ ] **Step 1: Make the doc edits.** Keep each to the minimum true sentence; match the surrounding file's voice.
- [ ] **Step 2: Run the full gate**

Run: `docker-compose up -d postgres && npm run check`
Expected: green end to end (lint, typecheck, tests including the new eval tests and `scripts/*.test.ts`, db suites, build, firefox build, golden dry-run, knip, secrets, audit). Knip may flag intentionally-unused exports in `types.ts`; wire them or trim them rather than suppressing.

- [ ] **Step 3: Commit**

```bash
git add CLAUDE.md AGENTS.md docs/deployment.md README.md
git commit -m "docs: file the eval rig commands and deployment guard"
```

---

## Out of scope for this plan

Pool authoring (pre-reads and stratification are the orchestrating session's judgment work, not code), the regen lane's generation runs (operational, gated on reliability preconditions), phases 4-5 of the spec (pattern extraction, tuning), and the comps engine. The pilot sitting runs on this build as-is.

## Self-review notes

Checked against the spec 2026-08-11: every rig capability (gate, snapshot, plan, rounds, deep singles, pairs, ledger, standings, blindness, control alarm) maps to a task; the three required tests (gate 404, plan determinism, ledger append) live in Tasks 4, 1/3, and 7; type names are consistent across task Interfaces blocks (`CorpusIndexRow`, `PoolEntry`, `SessionPlan`, `CondensedView`, `LedgerEvent`); no placeholder steps remain. Column-name and fixture-name adaptation points are explicitly marked as read-first steps rather than guessed signatures.
