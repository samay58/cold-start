import { describe, expect, it } from "vitest";
import {
  HOW_IT_WINS_GROUPS, HOW_IT_WINS_STRATEGIES, applyHowItWinsVerification, howItWinsSchema,
  howItWinsStrategyIdForName, synthesisSchema,
  type HowItWinsRead, type HowItWinsStrategyId
} from "../src";

const running = (strategy: HowItWinsStrategyId, id = "c1") => ({
  strategy, meaning: "It wins by doing one narrow thing better than anyone else.",
  note: `Twenty of its thirty-seven people work on that one problem [${id}].`, citationIds: [id]
});
// Typed so the string literals below stay literal ids under strict TS instead of widening to
// `string`, which is what applyHowItWinsVerification's typed `read` parameter requires.
const read: HowItWinsRead = {
  status: "read" as const,
  sentence: "OpenAI and Anthropic cite its benchmarks by name in their model safety documents; dropping it later would show.",
  running: [running("hybrid"), running("chokepoint", "c2"), running("prestige", "c3")],
  pair: { strategies: ["hybrid", "chokepoint"] as const, note: "The method produces the named benchmarks the labs cite [c1][c2].", wrongIf: "A lab swaps evaluators without a visible change in its documentation.", citationIds: ["c1", "c2"] },
  next: [{ strategy: "standardization", note: "Only two labs have adopted it; a third lab or a standards body would have to converge on it.", citationIds: [] }],
  inQuestion: [{ strategy: "completeness", note: "The filed record does not show whether labs still need another evaluator for the same job.", citationIds: [] }],
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
    expect(howItWinsSchema.safeParse({ ...read, inQuestion: [{ strategy: "hybrid", note: "x", citationIds: [] }] }).success).toBe(false);
    expect(howItWinsSchema.safeParse({ ...read, inQuestion: [{ strategy: "standardization", note: "x", citationIds: [] }] }).success).toBe(false);
  });
  it("fills inQuestion when a legacy read omitted it", () => {
    const { inQuestion: _inQuestion, ...legacy } = read;
    const parsed = howItWinsSchema.parse(legacy);
    expect(parsed.status).toBe("read");
    if (parsed.status === "read") expect(parsed.inQuestion).toEqual([]);
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
    expect(applyHowItWinsVerification(read, { running: [false, false, true], pair: true })).toEqual({
      howItWins: { status: "nothing_stands_out", inQuestion: read.inQuestion },
      dropReason: "running-dropped"
    });
  });
  it("drops an in-question note that the verifier rejected without touching the current set", () => {
    const out = applyHowItWinsVerification(read, { running: [true, true, true], pair: true, inQuestion: [false] });
    expect(out.dropReason).toBeUndefined();
    expect(out.howItWins.status).toBe("read");
    if (out.howItWins.status === "read") expect(out.howItWins.inQuestion).toEqual([]);
  });
});
