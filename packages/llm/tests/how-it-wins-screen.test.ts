import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";

import { HOW_IT_WINS_STRATEGIES, type ColdStartCard, type HowItWinsStrategyId } from "@cold-start/core";

import {
  HOW_IT_WINS_SCREEN_CALIBRATION,
  HOW_IT_WINS_SCREEN_MODEL,
  HOW_IT_WINS_SCREEN_THRESHOLDS,
  HOW_IT_WINS_SCREEN_VERSION,
  createJevAsk,
  howItWinsScreenPercentile,
  howItWinsScreenRoundOneQuestion,
  howItWinsScreenShortlist,
  loadHowItWinsJudgeRules,
  screenHowItWins,
  type HowItWinsScreenStrategy,
  type JevAsk
} from "../src";

const testDir = dirname(fileURLToPath(import.meta.url));
const card = JSON.parse(readFileSync(resolve(testDir, "fixtures/how-it-wins-card.json"), "utf8")) as ColdStartCard;
const rules = loadHowItWinsJudgeRules();

// A fake Jev that answers every question with the value its id maps to, and records each request.
function fakeAsk(answer: (id: string) => number) {
  const requests: Array<Record<string, unknown>> = [];
  const ask: JevAsk = async (_state, questions) => {
    requests.push(questions);
    return {
      answers: Object.fromEntries(Object.keys(questions).map((id) => [id, answer(id)])),
      inputTokens: 1_000,
      latencyMs: 5
    };
  };
  return { ask, requests };
}

describe("how it wins screen questions", () => {
  it("builds round 1 from each rubric row's own deciding question and look-alikes", () => {
    expect(rules.strategyRubric).toHaveLength(80);
    for (const row of rules.strategyRubric) {
      const question = howItWinsScreenRoundOneQuestion(row);
      expect(question.instructions).toContain(row.decidingQuestion);
      expect(question.criteria?.false).toContain(row.falsePositives);
    }
  });
});

describe("screenHowItWins", () => {
  it("drops strategies below the round 1 cutoff and profiles the rest in chunks of 30", async () => {
    const survivors = new Set<string>(HOW_IT_WINS_STRATEGIES.slice(0, 40).map((strategy) => strategy.id));
    const { ask, requests } = fakeAsk((id) => {
      const strategyId = id.split("__")[0]!;
      if (!id.includes("__")) return survivors.has(strategyId) ? 0.6 : 0.05;
      return id.endsWith("__lookalike") || id.endsWith("__disqualifier") ? 0.1 : 0.6;
    });
    const screen = await screenHowItWins({ card, rules, ask });

    expect(screen.keptIds).toHaveLength(40);
    expect(requests).toHaveLength(3);
    expect(Object.keys(requests[0]!)).toHaveLength(80);
    expect(Math.max(...requests.slice(1).map((request) => Object.keys(request).length))).toBeLessThanOrEqual(30 * 4);
    expect(screen.shortlistIds.length).toBeLessThanOrEqual(HOW_IT_WINS_SCREEN_THRESHOLDS.shortlistSize);
    expect(screen.shortlistIds.every((id) => survivors.has(id))).toBe(true);
    expect(screen.strategies[HOW_IT_WINS_STRATEGIES[79]!.id].support).toBe(0);
    expect(screen.costUsd).toBeCloseTo(3_000 * 0.042 / 1_000_000, 8);
    expect(screen).toMatchObject({ version: HOW_IT_WINS_SCREEN_VERSION, model: HOW_IT_WINS_SCREEN_MODEL });
  });

  it("never shortlists a strategy blocked by its look-alike or disqualifier check", async () => {
    const { ask } = fakeAsk((id) => (id.startsWith("specialization__lookalike") ? 0.95 : 0.8));
    const screen = await screenHowItWins({ card, rules, ask });
    expect(screen.strategies.specialization.blocked).toBe(true);
    expect(screen.shortlistIds).not.toContain("specialization");
  });
});

describe("calibrated shortlist", () => {
  it("ranks the same support lower for a strategy Jev favors across the corpus", () => {
    expect(HOW_IT_WINS_SCREEN_CALIBRATION.version).toBe(HOW_IT_WINS_SCREEN_VERSION);
    expect(HOW_IT_WINS_SCREEN_CALIBRATION.model).toBe(HOW_IT_WINS_SCREEN_MODEL);
    expect(howItWinsScreenPercentile("hybrid", 0.6)).toBeLessThan(howItWinsScreenPercentile("specialization", 0.6));
  });

  it("orders by percentile and respects the size", () => {
    const strategies = Object.fromEntries(HOW_IT_WINS_STRATEGIES.map((strategy, index) => [strategy.id, {
      roundOne: 0.5,
      roundTwo: { deciding: 0.5, positive: 0.5, lookalike: 0, disqualifier: 0 },
      support: 0.5,
      percentile: index / 80,
      blocked: false
    } satisfies HowItWinsScreenStrategy])) as Record<HowItWinsStrategyId, HowItWinsScreenStrategy>;
    const shortlist = howItWinsScreenShortlist(strategies, 3);
    expect(shortlist).toEqual(HOW_IT_WINS_STRATEGIES.slice(77).map((strategy) => strategy.id).reverse());
  });
});

describe("createJevAsk", () => {
  const questions = { q: { type: "noul" as const, instructions: "The company sells to developers." } };
  const ok = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

  it("sends the key server-side and returns validated probabilities", async () => {
    const fetchImpl = vi.fn(async (_url: string | URL | Request, _init?: RequestInit) =>
      ok({ answers: { q: { type: "noul", noul: 0.9 } }, usage: { input_tokens: 290 } }));
    const reply = await createJevAsk({ apiKey: "k", fetchImpl })("state", questions);
    expect(reply).toMatchObject({ answers: { q: 0.9 }, inputTokens: 290 });
    const init = fetchImpl.mock.calls[0]![1] as RequestInit;
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer k");
    expect(JSON.parse(init.body as string)).toMatchObject({ model: HOW_IT_WINS_SCREEN_MODEL, state: "state" });
  });

  it("retries once on a rate limit, then fails on anything else", async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(ok({}, 429))
      .mockResolvedValueOnce(ok({ answers: { q: { noul: 0.2 } }, usage: { input_tokens: 10 } }));
    await expect(createJevAsk({ apiKey: "k", fetchImpl })("s", questions)).resolves.toMatchObject({ answers: { q: 0.2 } });
    await expect(createJevAsk({ apiKey: "k", fetchImpl: vi.fn(async () => ok({}, 500)) })("s", questions)).rejects.toThrow("jev 500");
  }, 10_000);

  it("rejects a missing or out-of-range answer", async () => {
    const fetchImpl = vi.fn(async () => ok({ answers: { q: { noul: 1.4 } } }));
    await expect(createJevAsk({ apiKey: "k", fetchImpl })("s", questions)).rejects.toThrow("out of range");
  });
});
