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
