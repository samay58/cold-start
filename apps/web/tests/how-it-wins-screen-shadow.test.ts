import { describe, expect, it } from "vitest";

import { HOW_IT_WINS_STRATEGIES, type ColdStartCard, type HowItWinsJudgment } from "@cold-start/core";
import type { JevAsk } from "@cold-start/llm";

import { howItWinsScreenShadow } from "../src/inngest/how-it-wins-screen-shadow";

// The shadow reads only strategyEvaluations off the judgment and only the prompt fields off the card.
const judgment = {
  strategyEvaluations: HOW_IT_WINS_STRATEGIES.map((strategy) => ({
    strategyId: strategy.id,
    disposition: strategy.id === "specialization" ? "current" : strategy.id === "alliance" ? "open_question" : "rejected"
  }))
} as unknown as HowItWinsJudgment;
const card = { slug: "acme", domain: "acme.com", citations: [] } as unknown as ColdStartCard;

describe("howItWinsScreenShadow", () => {
  it("reports the judge's live strategies the screen would have missed", async () => {
    // Round 1 keeps only specialization; alliance is dropped before round 2.
    const ask: JevAsk = async (_state, questions) => ({
      answers: Object.fromEntries(Object.keys(questions).map((id) => [id, id.startsWith("specialization") ? 0.7 : 0.01])),
      inputTokens: 100,
      latencyMs: 1
    });
    const trace = await howItWinsScreenShadow({ card, judgment, apiKey: "k", ask });
    expect(trace).toMatchObject({
      status: "ok",
      keptCount: 1,
      liveIds: ["specialization", "alliance"],
      missedByRoundOne: ["alliance"],
      missedByShortlist: ["alliance"]
    });
    expect(trace.shortlistIds).toContain("specialization");
  });

  it("turns any screen failure into a trace line instead of throwing", async () => {
    const ask: JevAsk = async () => {
      throw new Error("jev 503");
    };
    await expect(howItWinsScreenShadow({ card, judgment, apiKey: "k", ask })).resolves.toEqual({ status: "failed", reason: "jev 503" });
  });
});
