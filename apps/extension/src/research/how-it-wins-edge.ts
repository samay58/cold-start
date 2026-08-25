// Geometry, spring physics, and readout copy for the crown, the notched edge that opens the
// Investor Lens packet. Pure functions only: the component owns pointer events, refs, and
// React state; this module turns a HowItWinsDisplay plus a pixel width into positions, the
// target under a given x, what the readout should say, and how the magnify-follow spring moves.
// Ported from the interaction in docs/product/design/2026-08-18-moat-read-direction/gen.py.
import { HOW_IT_WINS_GROUPS, HOW_IT_WINS_STRATEGIES, howItWinsStrategyById } from "@cold-start/core";
import type { HowItWinsDisplay } from "./investor-lens";
import { HOW_IT_WINS_COPY } from "./investor-read-copy";

const EDGE_GROUP_GAP_PX = 5;
export const EDGE_HEIGHT_PX = 22;
export const EDGE_TOP_PX = 3;
export const EDGE_MARK_WIDTH_PX = 4;
export const EDGE_MARK_DEPTH_PX = 8;
export const EDGE_HOLLOW_DEPTH_PX = 7;
export const EDGE_QUESTION_DEPTH_PX = 6;
export const EDGE_TARGET_REACH_PX = 6;
const EDGE_SIGMA_PX = 11;
export const EDGE_MAGNIFICATION = 1.6;
const EDGE_SPRING = { stiffness: 420, damping: 38 } as const;
export const EDGE_FALLBACK_WIDTH_PX = 320; // when the svg has no layout yet (jsdom, first paint)

const EDGE_INDEX_BY_ID = new Map<string, number>(HOW_IT_WINS_STRATEGIES.map((strategy, index) => [strategy.id, index]));

function edgeIndexOf(id: string): number {
  const index = EDGE_INDEX_BY_ID.get(id);
  if (index === undefined) throw new Error(`Unknown how-it-wins strategy id: ${id}`);
  return index;
}

function xAt(xs: number[], index: number): number {
  const value = xs[index];
  if (value === undefined) throw new Error(`No edge position at index ${index}`);
  return value;
}

// 80 x's, one per strategy in edge order, grouped with a gap after each of the 13 groups and
// scaled so the last tick lands exactly at width.
export function edgePositions(width: number): number[] {
  const groupSizes = HOW_IT_WINS_GROUPS.map((group) => group.strategies.length);
  const gaps = groupSizes.length - 1;
  const pitch = (width - gaps * EDGE_GROUP_GAP_PX) / 79;
  const xs: number[] = [];
  let x = 0;
  for (const size of groupSizes) {
    for (let k = 0; k < size; k++) {
      xs.push(x);
      x += pitch;
    }
    x += EDGE_GROUP_GAP_PX;
  }
  const last = xs[xs.length - 1];
  if (last === undefined) return xs;
  return xs.map((v) => (v * width) / last);
}

export type EdgeTarget = {
  key: string;
  kind: "running" | "next" | "in_question" | "pair";
  index: number;
  x: number;
  span?: [number, number];
};

// One target per running mark, per next mark, per in-question mark, and (if a pair is filed)
// one more for the bracket spanning its two legs.
export function edgeTargets(display: HowItWinsDisplay, xs: number[]): EdgeTarget[] {
  const targets: EdgeTarget[] = [];
  for (const entry of display.running) {
    const index = edgeIndexOf(entry.id);
    targets.push({ key: entry.id, kind: "running", index, x: xAt(xs, index) });
  }
  for (const entry of display.next) {
    const index = edgeIndexOf(entry.id);
    targets.push({ key: entry.id, kind: "next", index, x: xAt(xs, index) });
  }
  for (const entry of display.inQuestion) {
    const index = edgeIndexOf(entry.id);
    targets.push({ key: entry.id, kind: "in_question", index, x: xAt(xs, index) });
  }
  if (display.pair) {
    const [aId, bId] = display.pair.strategies;
    const aIndex = edgeIndexOf(aId);
    const bIndex = edgeIndexOf(bId);
    const aX = xAt(xs, aIndex);
    const bX = xAt(xs, bIndex);
    const xLeft = Math.min(aX, bX);
    const xRight = Math.max(aX, bX);
    targets.push({
      key: "pair",
      kind: "pair",
      index: aIndex,
      x: (aX + bX) / 2,
      span: [xLeft - 2, xRight + 2]
    });
  }
  return targets;
}

export function nearestTickIndex(xs: number[], x: number): number {
  let best = 0;
  let bestDistance = Infinity;
  for (let i = 0; i < xs.length; i++) {
    const distance = Math.abs(xAt(xs, i) - x);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = i;
    }
  }
  return best;
}

// A running, next, or in-question mark within reach wins outright. Otherwise the pair claims
// the span between its two legs, but only when the pointer isn't actually sitting on one of
// those legs (a pair leg is a running mark, and the mark always wins).
export function targetAt(targets: EdgeTarget[], display: HowItWinsDisplay, xs: number[], x: number): EdgeTarget | null {
  let nearestMark: EdgeTarget | null = null;
  let nearestMarkDistance = Infinity;
  for (const target of targets) {
    if (target.kind !== "running" && target.kind !== "next" && target.kind !== "in_question") continue;
    const distance = Math.abs(target.x - x);
    if (distance < nearestMarkDistance) {
      nearestMarkDistance = distance;
      nearestMark = target;
    }
  }
  if (nearestMark && nearestMarkDistance < EDGE_TARGET_REACH_PX) return nearestMark;

  const pair = targets.find((target) => target.kind === "pair");
  if (pair && pair.span) {
    const [xLeft, xRight] = pair.span;
    if (x >= xLeft && x <= xRight) {
      const nearestTick = nearestTickIndex(xs, x);
      const nearestTickIsRunning = display.running.some((entry) => edgeIndexOf(entry.id) === nearestTick);
      if (!nearestTickIsRunning) return pair;
    }
  }
  return null;
}

// tick null: pointer is off the crown, read the rest count. target null (tick set): pointer
// is over an unmarked tick, read its name in grey. Otherwise read the target itself.
export function readoutText(
  display: HowItWinsDisplay,
  tick: number | null,
  target: EdgeTarget | null
): { text: string; ink: boolean } {
  if (tick === null) return { text: HOW_IT_WINS_COPY.count(display.count), ink: false };
  if (target === null) return { text: HOW_IT_WINS_STRATEGIES[tick]?.name ?? "", ink: false };
  if (target.kind === "pair" && display.pair) {
    return { text: `${display.pair.names[0]} + ${display.pair.names[1]}`, ink: true };
  }
  if (target.kind === "running") {
    const entry = display.running.find((candidate) => candidate.id === target.key);
    return { text: entry?.name ?? "", ink: true };
  }
  if (target.kind === "in_question") {
    const entry = display.inQuestion.find((candidate) => candidate.id === target.key);
    return { text: `${entry?.name ?? ""}, ${HOW_IT_WINS_COPY.inQuestion}`, ink: true };
  }
  const entry = display.next.find((candidate) => candidate.id === target.key);
  return { text: `${entry?.name ?? ""}, ${HOW_IT_WINS_COPY.notYet}`, ink: true };
}

// Click-wheel falloff: peaks at 1 + EDGE_MAGNIFICATION under the pointer, decays to 1 by
// a few sigma away.
export function magnification(distancePx: number): number {
  return 1 + EDGE_MAGNIFICATION * Math.exp(-(distancePx * distancePx) / (2 * EDGE_SIGMA_PX * EDGE_SIGMA_PX));
}

export type SpringState = { x: number; v: number };

// Critically-damped-ish semi-implicit Euler, mass 1.
export function springStep(state: SpringState, target: number, dtSeconds: number, spring = EDGE_SPRING): SpringState {
  const a = -spring.stiffness * (state.x - target) - spring.damping * state.v;
  const v = state.v + a * dtSeconds;
  const x = state.x + v * dtSeconds;
  return { x, v };
}

export function springAtRest(state: SpringState, target: number): boolean {
  return Math.abs(state.x - target) < 0.05 && Math.abs(state.v) < 0.5;
}

export type EdgeNote = { kicker: string; meaning: string | null; body: string; wrongIf: string | null };

export function noteFor(display: HowItWinsDisplay, target: EdgeTarget): EdgeNote {
  if (target.kind === "running") {
    const entry = display.running.find((candidate) => candidate.id === target.key);
    return {
      kicker: entry?.name ?? "",
      meaning: entry ? howItWinsStrategyById(entry.id).meaning : null,
      body: entry?.note ?? "",
      wrongIf: null
    };
  }
  if (target.kind === "next") {
    const entry = display.next.find((candidate) => candidate.id === target.key);
    return {
      kicker: `${entry?.name ?? ""}, ${HOW_IT_WINS_COPY.notYet}`,
      meaning: entry ? howItWinsStrategyById(entry.id).meaning : null,
      body: entry?.note ?? "",
      wrongIf: null
    };
  }
  if (target.kind === "in_question") {
    const entry = display.inQuestion.find((candidate) => candidate.id === target.key);
    return {
      kicker: `${entry?.name ?? ""}, ${HOW_IT_WINS_COPY.inQuestion}`,
      meaning: entry ? howItWinsStrategyById(entry.id).meaning : null,
      body: entry?.note ?? "",
      wrongIf: null
    };
  }
  const pair = display.pair;
  return {
    kicker: pair ? `${pair.names[0]} and ${pair.names[1]}` : "",
    meaning: pair
      ? `${pair.names[0]}: ${howItWinsStrategyById(pair.strategies[0]).meaning} ${pair.names[1]}: ${howItWinsStrategyById(pair.strategies[1]).meaning}`
      : null,
    body: pair?.note ?? "",
    wrongIf: pair?.wrongIf ?? null
  };
}

export function targetsInKeyboardOrder(targets: EdgeTarget[]): EdgeTarget[] {
  return [...targets].sort((a, b) => a.x - b.x);
}

export function crownAriaLabel(display: HowItWinsDisplay): string {
  return `${HOW_IT_WINS_COPY.label}, ${HOW_IT_WINS_COPY.count(display.count)}`;
}

export const BANNED_MICRO_COPY = ["cut", "open to it", "could be next", "the pair", "one of its", "not this one"] as const;
