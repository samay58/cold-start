import { HOW_IT_WINS_GROUPS, HOW_IT_WINS_STRATEGIES } from "@cold-start/core";
import { describe, expect, it } from "vitest";
import type { HowItWinsDisplay } from "../src/research/investor-lens";
import { HOW_IT_WINS_COPY } from "../src/research/investor-read-copy";
import {
  BANNED_MICRO_COPY,
  EDGE_TARGET_REACH_PX,
  type EdgeTarget,
  crownAriaLabel,
  edgePositions,
  edgeTargets,
  magnification,
  nearestTickIndex,
  noteFor,
  readoutText,
  springAtRest,
  springStep,
  targetAt,
  targetsInKeyboardOrder
} from "../src/research/how-it-wins-edge";

// Irregular example: hybrid + chokepoint pair, prestige also running, monopoly and
// standardization queued as next. Notes are deliberately plain (no banned phrasing, no
// model-prose flourishes) since this fixture feeds the banned-copy check below.
const fixtureDisplay: HowItWinsDisplay = {
  state: "read",
  sentence: "It wins by combining two rare skills, and by sitting where two labs must pass through it.",
  running: [
    { id: "hybrid", name: "Hybrid", meaning: "Competence in two distinct areas, or two strengths not usually found together.", note: "It builds live network environments and has models attack and defend inside them." },
    { id: "chokepoint", name: "Chokepoint", meaning: "Controls a passage that competitors or prey must pass through.", note: "Two labs cite its benchmarks by name before releasing a model." },
    { id: "prestige", name: "Prestige", meaning: "Endorsed by authoritative sources through awards, degrees, or recognition.", note: "Two named investors put in personal money alongside the round." }
  ],
  pair: {
    strategies: ["hybrid", "chokepoint"],
    names: ["Hybrid", "Chokepoint"],
    meanings: [
      "Competence in two distinct areas, or two strengths not usually found together.",
      "Controls a passage that competitors or prey must pass through."
    ],
    note: "The method produced the passage: the same testing approach is what got cited in both labs' documents.",
    wrongIf: "a lab could swap evaluators without a visible change in its own documentation."
  },
    next: [
      { id: "monopoly", name: "Monopoly", meaning: "Control of a resource or market approved by a governing body.", note: "Would need a regulator naming it directly, not just a government contract." },
      { id: "standardization", name: "Standardization", meaning: "Emergent alignment that reduces friction.", note: "Would need a third lab to adopt the same benchmarks independently." }
    ],
    inQuestion: [
      { id: "completeness", name: "Completeness", meaning: "One tool covers everything the buyer needs, so nothing else is required.", note: "The filed record does not show whether labs still need another evaluator for the same job." }
    ],
    count: 3
};

function findTarget(targets: EdgeTarget[], key: string): EdgeTarget {
  const target = targets.find((t) => t.key === key);
  if (!target) throw new Error(`missing target ${key}`);
  return target;
}

function at<T>(xs: readonly T[], index: number): T {
  const value = xs[index];
  if (value === undefined) throw new Error(`missing value at ${index}`);
  return value;
}

describe("edgePositions", () => {
  it("returns 80 positions, monotonic, first at 0 and last at width", () => {
    const width = 372;
    const xs = edgePositions(width);
    expect(xs).toHaveLength(80);
    expect(xs[0]).toBe(0);
    expect(xs[xs.length - 1]).toBeCloseTo(width, 9);
    for (let i = 1; i < xs.length; i++) {
      expect(at(xs, i)).toBeGreaterThan(at(xs, i - 1));
    }
  });

  it("has twelve group gaps each wider than any in-group pitch", () => {
    const xs = edgePositions(372);
    const diffs = xs.slice(1).map((x, i) => x - at(xs, i));
    const groupSizes = HOW_IT_WINS_GROUPS.map((g) => g.strategies.length);
    const boundaryDiffIndices = new Set<number>();
    let cum = 0;
    for (let i = 0; i < groupSizes.length - 1; i++) {
      cum += at(groupSizes, i);
      boundaryDiffIndices.add(cum - 1);
    }
    expect(boundaryDiffIndices.size).toBe(12);
    const boundaryDiffs = diffs.filter((_, i) => boundaryDiffIndices.has(i));
    const inGroupDiffs = diffs.filter((_, i) => !boundaryDiffIndices.has(i));
    expect(Math.min(...boundaryDiffs)).toBeGreaterThan(Math.max(...inGroupDiffs));
  });

  it("scales to a different width without changing tick count", () => {
    const xs = edgePositions(320);
    expect(xs[xs.length - 1]).toBeCloseTo(320, 9);
  });
});

describe("edgeTargets", () => {
  const xs = edgePositions(372);
  const targets = edgeTargets(fixtureDisplay, xs);

  it("yields seven targets: three running, two next, one in-question, one pair", () => {
    expect(targets).toHaveLength(7);
    expect(targets.filter((t) => t.kind === "running")).toHaveLength(3);
    expect(targets.filter((t) => t.kind === "next")).toHaveLength(2);
    expect(targets.filter((t) => t.kind === "in_question")).toHaveLength(1);
    expect(targets.filter((t) => t.kind === "pair")).toHaveLength(1);
  });

  it("places the pair at the midpoint of its two legs, with a span around them", () => {
    const hybridIndex = HOW_IT_WINS_STRATEGIES.findIndex((s) => s.id === "hybrid");
    const chokepointIndex = HOW_IT_WINS_STRATEGIES.findIndex((s) => s.id === "chokepoint");
    const pair = findTarget(targets, "pair");
    expect(pair.x).toBeCloseTo((at(xs, hybridIndex) + at(xs, chokepointIndex)) / 2, 9);
    expect(pair.span).toEqual([at(xs, hybridIndex) - 2, at(xs, chokepointIndex) + 2]);
  });

  it("places each running and next target at its strategy's edge position", () => {
    const prestigeIndex = HOW_IT_WINS_STRATEGIES.findIndex((s) => s.id === "prestige");
    const standardizationIndex = HOW_IT_WINS_STRATEGIES.findIndex((s) => s.id === "standardization");
    expect(findTarget(targets, "prestige").x).toBeCloseTo(at(xs, prestigeIndex), 9);
    expect(findTarget(targets, "standardization").x).toBeCloseTo(at(xs, standardizationIndex), 9);
  });
});

describe("nearestTickIndex", () => {
  it("finds the tick closest to a given x", () => {
    const xs = edgePositions(372);
    expect(nearestTickIndex(xs, at(xs, 40))).toBe(40);
    expect(nearestTickIndex(xs, at(xs, 40) + 0.1)).toBe(40);
  });
});

describe("targetAt", () => {
  const xs = edgePositions(372);
  const targets = edgeTargets(fixtureDisplay, xs);

  it("returns a running mark that is within reach", () => {
    const hybrid = findTarget(targets, "hybrid");
    expect(targetAt(targets, fixtureDisplay, xs, hybrid.x)).toEqual(hybrid);
  });

  it("prefers the mark over the pair when the pointer sits on a pair leg", () => {
    const hybrid = findTarget(targets, "hybrid");
    const result = targetAt(targets, fixtureDisplay, xs, hybrid.x);
    expect(result?.kind).toBe("running");
  });

  it("returns the pair when the pointer is inside its span but away from any mark", () => {
    const pair = findTarget(targets, "pair");
    const hybrid = findTarget(targets, "hybrid");
    const chokepoint = findTarget(targets, "chokepoint");
    // Sanity: the pair's midpoint really is out of reach of both legs, or this test is moot.
    expect(Math.abs(pair.x - hybrid.x)).toBeGreaterThan(EDGE_TARGET_REACH_PX);
    expect(Math.abs(pair.x - chokepoint.x)).toBeGreaterThan(EDGE_TARGET_REACH_PX);
    expect(targetAt(targets, fixtureDisplay, xs, pair.x)).toEqual(pair);
  });

  it("returns null far from any target", () => {
    expect(targetAt(targets, fixtureDisplay, xs, -1000)).toBeNull();
  });
});

describe("readoutText", () => {
  const xs = edgePositions(372);
  const targets = edgeTargets(fixtureDisplay, xs);

  it("reads the count at rest", () => {
    expect(readoutText(fixtureDisplay, null, null)).toEqual({ text: "3 of 80 strategies", ink: false });
  });

  it("reads a running mark's name", () => {
    expect(readoutText(fixtureDisplay, 0, findTarget(targets, "hybrid"))).toEqual({ text: "Hybrid", ink: true });
  });

  it("reads a next mark as name, not yet", () => {
    expect(readoutText(fixtureDisplay, 0, findTarget(targets, "standardization"))).toEqual({
      text: "Standardization, not yet",
      ink: true
    });
  });

  it("reads an in-question mark as name, in question", () => {
    expect(readoutText(fixtureDisplay, 0, findTarget(targets, "completeness"))).toEqual({
      text: "Completeness, in question",
      ink: true
    });
  });

  it("reads the pair as A + B", () => {
    expect(readoutText(fixtureDisplay, 0, findTarget(targets, "pair"))).toEqual({
      text: "Hybrid + Chokepoint",
      ink: true
    });
  });

  it("reads an unmarked tick's name in grey", () => {
    const craftsmanshipIndex = HOW_IT_WINS_STRATEGIES.findIndex((s) => s.id === "craftsmanship");
    expect(readoutText(fixtureDisplay, craftsmanshipIndex, null)).toEqual({ text: "Craftsmanship", ink: false });
  });
});

describe("magnification", () => {
  it("peaks at 2.6 under the pointer", () => {
    expect(magnification(0)).toBeCloseTo(2.6, 9);
  });

  it("falls under 1.02 by 33px away", () => {
    expect(magnification(33)).toBeLessThan(1.02);
  });
});

describe("spring", () => {
  it("converges from 0 to 100 within 600ms of 16ms steps, overshooting at most 1px", () => {
    let state = { x: 0, v: 0 };
    const target = 100;
    let maxX = 0;
    let settledAt: number | null = null;
    for (let t = 0; t <= 600; t += 16) {
      state = springStep(state, target, 16 / 1000);
      maxX = Math.max(maxX, state.x);
      if (settledAt === null && springAtRest(state, target)) settledAt = t;
    }
    expect(settledAt).not.toBeNull();
    expect(settledAt as number).toBeLessThanOrEqual(600);
    expect(maxX).toBeLessThanOrEqual(target + 1);
  });

  it("springAtRest is false while still moving", () => {
    expect(springAtRest({ x: 0, v: 0 }, 100)).toBe(false);
  });
});

describe("noteFor", () => {
  const xs = edgePositions(372);
  const targets = edgeTargets(fixtureDisplay, xs);

  it("running: kicker is the name, meaning carried, no wrongIf", () => {
    const note = noteFor(fixtureDisplay, findTarget(targets, "hybrid"));
    expect(note.kicker).toBe("Hybrid");
    expect(note.meaning).toBe("Competence in two distinct areas, or two strengths not usually found together.");
    expect(note.body).toBe(at(fixtureDisplay.running, 0).note);
    expect(note.wrongIf).toBeNull();
  });

  it("next: kicker is name, not yet", () => {
    const note = noteFor(fixtureDisplay, findTarget(targets, "standardization"));
    expect(note.kicker).toBe("Standardization, not yet");
    expect(note.meaning).toBe("Emergent alignment that reduces friction.");
  });

  it("in-question: kicker is name, in question", () => {
    const note = noteFor(fixtureDisplay, findTarget(targets, "completeness"));
    expect(note.kicker).toBe("Completeness, in question");
    expect(note.meaning).toBe("One tool covers everything the buyer needs, so nothing else is required.");
    expect(note.body).toBe(at(fixtureDisplay.inQuestion, 0).note);
    expect(note.wrongIf).toBeNull();
  });

  it("pair: kicker joins both names, wrongIf carried", () => {
    const note = noteFor(fixtureDisplay, findTarget(targets, "pair"));
    expect(note.kicker).toBe("Hybrid and Chokepoint");
    expect(note.meaning).toBe(
      "Hybrid: Competence in two distinct areas, or two strengths not usually found together. Chokepoint: Controls a passage that competitors or prey must pass through."
    );
    expect(note.body).toBe(fixtureDisplay.pair?.note);
    expect(note.wrongIf).toBe(fixtureDisplay.pair?.wrongIf);
  });
});

describe("targetsInKeyboardOrder", () => {
  it("orders targets by x ascending", () => {
    const xs = edgePositions(372);
    const targets = edgeTargets(fixtureDisplay, xs);
    const ordered = targetsInKeyboardOrder(targets);
    expect(ordered).toHaveLength(targets.length);
    for (let i = 1; i < ordered.length; i++) {
      expect(at(ordered, i).x).toBeGreaterThanOrEqual(at(ordered, i - 1).x);
    }
    expect(new Set(ordered.map((t) => t.key))).toEqual(new Set(targets.map((t) => t.key)));
  });
});

describe("crownAriaLabel", () => {
  it("names the label and the count", () => {
    expect(crownAriaLabel(fixtureDisplay)).toBe("How it wins, 3 of 80 strategies");
  });
});

describe("BANNED_MICRO_COPY", () => {
  function bannedHitsIn(text: string): string[] {
    const lower = text.toLowerCase();
    return BANNED_MICRO_COPY.filter((phrase) => (phrase === "cut" ? /\bcut\b/.test(lower) : lower.includes(phrase)));
  }

  it("keeps every generated string clear of the kill list", () => {
    const xs = edgePositions(372);
    const targets = edgeTargets(fixtureDisplay, xs);
    const craftsmanshipIndex = HOW_IT_WINS_STRATEGIES.findIndex((s) => s.id === "craftsmanship");

    const strings: string[] = [
      readoutText(fixtureDisplay, null, null).text,
      readoutText(fixtureDisplay, 0, findTarget(targets, "hybrid")).text,
      readoutText(fixtureDisplay, 0, findTarget(targets, "standardization")).text,
      readoutText(fixtureDisplay, 0, findTarget(targets, "pair")).text,
      readoutText(fixtureDisplay, craftsmanshipIndex, null).text,
      crownAriaLabel(fixtureDisplay),
      HOW_IT_WINS_COPY.label,
      HOW_IT_WINS_COPY.count(3),
      HOW_IT_WINS_COPY.count(0),
      HOW_IT_WINS_COPY.notYet,
      HOW_IT_WINS_COPY.inQuestion,
      HOW_IT_WINS_COPY.wrongIf,
      HOW_IT_WINS_COPY.pinned,
      HOW_IT_WINS_COPY.thinFile,
      HOW_IT_WINS_COPY.nothingStandsOut
    ];

    for (const target of targets) {
      const note = noteFor(fixtureDisplay, target);
      strings.push(note.kicker);
      if (note.meaning !== null) strings.push(note.meaning);
      strings.push(note.body);
      if (note.wrongIf !== null) strings.push(note.wrongIf);
    }

    for (const text of strings) {
      expect(bannedHitsIn(text)).toEqual([]);
    }
  });

  it("word-bounds 'cut' so a word like 'executes' does not trip it", () => {
    expect(bannedHitsIn("the pipeline executes cleanly")).toEqual([]);
    expect(bannedHitsIn("we cut the row")).toEqual(["cut"]);
  });
});
