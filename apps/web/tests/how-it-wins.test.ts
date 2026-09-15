import { describe, expect, it } from "vitest";

import type { ColdStartCard, HowItWinsJudgment } from "@cold-start/core";
import { buildSkeletonCard } from "@cold-start/pipeline";

import {
  howItWinsJudgeInputs,
  howItWinsEvaluatorFor,
  howItWinsJudgeSummary
} from "../src/inngest/how-it-wins";

const models = { judge: "claude-judge-test", writer: "claude-test", editor: "deepseek/deepseek-v4-pro" };

const judgment = {
  version: 1,
  currentStrategyIds: ["specialization", "iteration"],
  strategyEvaluations: [
    { strategyId: "specialization", disposition: "current" },
    { strategyId: "iteration", disposition: "current" },
    { strategyId: "usership", disposition: "not_yet" },
    { strategyId: "affordability", disposition: "rejected" }
  ],
  openQuestions: [{ questionId: "q1" }],
  refinement: { critic: "ok", adjudication: "not_needed", notes: ["no material disagreement"] },
  calls: [
    {
      callId: "call-1",
      stage: "global_judge",
      provider: "anthropic",
      model: "claude-test",
      inputTokens: 40_000,
      outputTokens: 28_000,
      latencyMs: 91_000,
      estimatedCostUsd: 1.5,
      actualCostUsd: null,
      outcome: "ok"
    },
    {
      callId: "call-2",
      stage: "critic",
      provider: "deepseek",
      model: "deepseek/deepseek-v4-pro",
      inputTokens: 30_000,
      outputTokens: 4_000,
      latencyMs: 22_000,
      estimatedCostUsd: 0.2,
      actualCostUsd: 0.25,
      outcome: "ok"
    }
  ]
} as unknown as HowItWinsJudgment;

function cardWithCitations(): ColdStartCard {
  const base = buildSkeletonCard("cognition.ai");
  return {
    ...base,
    citations: ["c1", "c2", "c3"].map((id) => ({
      id,
      url: `https://cognition.ai/${id}`,
      title: `Cognition ${id}`,
      fetchedAt: base.generatedAt,
      sourceType: "company_site" as const,
      snippet: "Cognition builds autonomous software engineers."
    }))
  };
}

const card = cardWithCitations();

describe("howItWinsJudgeSummary", () => {
  it("counts the verdict without carrying its body", () => {
    const summary = howItWinsJudgeSummary(judgment);

    expect(summary.currentCount).toBe(2);
    expect(summary.notYetCount).toBe(1);
    expect(summary.openQuestionCount).toBe(1);
    expect(summary.refinement).toEqual({
      critic: "ok",
      adjudication: "not_needed",
      notes: ["no material disagreement"]
    });
    expect(summary.calls).toHaveLength(2);
    expect(summary.calls[0]).toEqual({
      stage: "global_judge",
      model: "claude-test",
      provider: "anthropic",
      inputTokens: 40_000,
      outputTokens: 28_000,
      latencyMs: 91_000,
      estimatedCostUsd: 1.5,
      actualCostUsd: null,
      outcome: "ok"
    });
    expect(JSON.stringify(summary)).not.toContain("strategyEvaluations");
  });
});

describe("how-it-wins evaluator contract", () => {
  it("keeps the judge cache when only the writer changes but changes the evaluator signature", () => {
    const reroutedModels = { ...models, writer: "openai/gpt-test" };
    const current = howItWinsEvaluatorFor({ models, verifierModel: "claude-verify-test", refinement: true });
    const rerouted = howItWinsEvaluatorFor({
      models: reroutedModels,
      verifierModel: "claude-verify-test",
      refinement: true
    });

    expect(rerouted.signature).not.toBe(current.signature);
    expect(howItWinsJudgeInputs(card, true, reroutedModels).hashes).toEqual(
      howItWinsJudgeInputs(card, true, models).hashes
    );
  });

  it.each(["judge", "editor"] as const)("invalidates the judge cache when the %s changes", (role) => {
    const reroutedModels = { ...models, [role]: "openai/gpt-test" };

    expect(howItWinsJudgeInputs(card, true, reroutedModels).hashes.promptHash).not.toBe(
      howItWinsJudgeInputs(card, true, models).hashes.promptHash
    );
  });

  // The refinement setting changes what the judge is asked for, so a verdict judged with the
  // critic off must never be replayed to a run that asked for it on.
  it("hashes the judge cache under the refinement flag it will judge with", () => {
    const on = howItWinsJudgeInputs(card, true, models).hashes;
    const off = howItWinsJudgeInputs(card, false, models).hashes;

    expect(off.promptHash).not.toBe(on.promptHash);
    expect(off.evidencePacketHash).toBe(on.evidencePacketHash);
    expect(off.vocabularyHash).toBe(on.vocabularyHash);
    expect(howItWinsEvaluatorFor({ models, verifierModel: "claude-verify-test", refinement: false }).signature)
      .not.toBe(howItWinsEvaluatorFor({ models, verifierModel: "claude-verify-test", refinement: true }).signature);
  });
});
