import { test } from "node:test";
import assert from "node:assert/strict";
import { armAssignment, parseFlags, selectHowItWinsSlugs, type HowItWinsCandidate } from "./how-it-wins-corpus";

function candidate(slug: string, over: Partial<HowItWinsCandidate> = {}): HowItWinsCandidate {
  return { slug, richnessBand: "rich", hasSynthesis: true, thinFileReason: null, ...over };
}

test("selection skips cards with no synthesis and cards the thin-file gate rejects", () => {
  const picked = selectHowItWinsSlugs(
    [
      candidate("kept"),
      candidate("no-synthesis", { hasSynthesis: false }),
      candidate("too-few", { thinFileReason: "too-few-sources" }),
      candidate("no-company", { thinFileReason: "no-company-authored" })
    ],
    { seed: "how-it-wins-1", limit: 20 }
  );
  assert.deepEqual(picked, ["kept"]);
});

test("selection prefers rich, then medium, then thin", () => {
  const picked = selectHowItWinsSlugs(
    [
      candidate("t1", { richnessBand: "thin" }),
      candidate("m1", { richnessBand: "medium" }),
      candidate("r1", { richnessBand: "rich" }),
      candidate("m2", { richnessBand: "medium" }),
      candidate("r2", { richnessBand: "rich" })
    ],
    { seed: "how-it-wins-1", limit: 5 }
  );
  assert.deepEqual(picked.slice(0, 2).sort(), ["r1", "r2"]);
  assert.deepEqual(picked.slice(2, 4).sort(), ["m1", "m2"]);
  assert.equal(picked[4], "t1");
});

test("selection takes the limit off the front of the preferred order", () => {
  const candidates = [
    candidate("r1"),
    candidate("r2"),
    candidate("r3"),
    candidate("m1", { richnessBand: "medium" })
  ];
  const picked = selectHowItWinsSlugs(candidates, { seed: "how-it-wins-1", limit: 2 });
  assert.equal(picked.length, 2);
  assert.ok(picked.every((slug) => slug.startsWith("r")));
});

test("selection is deterministic per seed and moves with the seed", () => {
  const candidates = Array.from({ length: 12 }, (_, i) => candidate(`r${i}`));
  const a = selectHowItWinsSlugs(candidates, { seed: "how-it-wins-1", limit: 6 });
  const b = selectHowItWinsSlugs(candidates, { seed: "how-it-wins-1", limit: 6 });
  const c = selectHowItWinsSlugs(candidates, { seed: "how-it-wins-2", limit: 6 });
  assert.deepEqual(a, b);
  assert.notDeepEqual(a, c);
});

test("arm assignment is a seeded per-card flip that keeps both writers", () => {
  const writers: [string, string] = ["claude-sonnet-5", "claude-sonnet-4-6"];
  const first = armAssignment("how-it-wins-1", "acme", writers);
  assert.deepEqual(first, armAssignment("how-it-wins-1", "acme", writers));
  assert.deepEqual([first.A, first.B].sort(), [...writers].sort());

  const slugs = Array.from({ length: 20 }, (_, i) => `card-${i}`);
  const assignments = slugs.map((slug) => armAssignment("how-it-wins-1", slug, writers).A);
  assert.ok(new Set(assignments).size === 2, "both writers should land in slot A across cards");
});

test("the verifier is on by default and both --verify and --no-verify are accepted", () => {
  assert.equal(parseFlags([]).verify, true);
  assert.equal(parseFlags(["--verify"]).verify, true);
  assert.equal(parseFlags(["--no-verify"]).verify, false);
  assert.equal(parseFlags(["--no-verify", "--verify"]).verify, true);
  assert.throws(() => parseFlags(["--verifyy"]), /unknown flag/);
});

test("writer flags take exactly two models", () => {
  assert.deepEqual(parseFlags(["--writers", "one,two"]).writers, ["one", "two"]);
  assert.throws(() => parseFlags(["--writers", "one"]), /exactly two/);
  assert.throws(() => parseFlags(["--writers", "one,two,three"]), /exactly two/);
});
