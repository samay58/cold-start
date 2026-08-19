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

export function shuffled<T>(items: T[], rng: () => number): T[] {
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

// Splits n into group sizes of 3-4, or null when impossible (n of 1, 2, or 5).
function chunkSizes(n: number): number[] | null {
  if (n === 0) return [];
  if (n < 3 || n === 5) return null;
  const fours = Math.floor(n / 4);
  const rem = n % 4;
  if (rem === 0) return Array(fours).fill(4);
  if (rem === 3) return [...Array(fours).fill(4), 3];
  if (rem === 2) return [...Array(fours - 1).fill(4), 3, 3];
  return [...Array(fours - 2).fill(4), 3, 3, 3];
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
  const restSlugs = eraInterleaved(leftovers, rng).map((e) => e.slug);
  // A leftover count of 1, 2, or 5 cannot split into comparable 3-4 groups;
  // borrow one slug at a time from full band rounds (which stay band-pure at 3).
  while (restSlugs.length > 0 && chunkSizes(restSlugs.length) === null) {
    const donor = [...rounds].reverse().find((r) => r.slugs.length === groupSize);
    if (!donor) break;
    restSlugs.unshift(donor.slugs.pop()!);
  }
  const sizes = chunkSizes(restSlugs.length);
  if (sizes) {
    let cursor = 0;
    for (const size of sizes) {
      rounds.push({ index: rounds.length, slugs: restSlugs.slice(cursor, cursor + size), mixedBand: true });
      cursor += size;
    }
  } else if (restSlugs.length > 0) {
    // Degenerate pool: under 3 cards remain and nothing left to borrow from.
    rounds.push({ index: rounds.length, slugs: restSlugs, mixedBand: true });
  }
  return { seed, groupSize, rounds };
}
