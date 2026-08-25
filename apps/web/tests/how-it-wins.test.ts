import { beforeEach, describe, expect, it, vi } from "vitest";

import type { HowItWinsJudgment } from "@cold-start/core";
import { buildSkeletonCard } from "@cold-start/pipeline";
import type { HowItWinsResult } from "@cold-start/llm";

import { howItWinsStepBody } from "../src/inngest/how-it-wins";

const mocks = vi.hoisted(() => ({
  synthesizeHowItWins: vi.fn(),
  judgeHowItWinsForAnalysis: vi.fn()
}));

vi.mock("@cold-start/llm", async () => {
  const actual = await vi.importActual<typeof import("@cold-start/llm")>("@cold-start/llm");
  return {
    ...actual,
    synthesizeHowItWins: mocks.synthesizeHowItWins,
    judgeHowItWinsForAnalysis: mocks.judgeHowItWinsForAnalysis
  };
});

describe("howItWinsStepBody", () => {
  const card = buildSkeletonCard("cognition.ai");
  const models = { writer: "claude-test", editor: "deepseek/deepseek-v4-pro" };
  const judgment = { version: 1, marker: "frozen-verdict" } as unknown as HowItWinsJudgment;
  const input = {
    card,
    client: {} as never,
    models,
    telemetry: () => {}
  };

  beforeEach(() => {
    mocks.synthesizeHowItWins.mockReset();
    mocks.judgeHowItWinsForAnalysis.mockReset();
    mocks.judgeHowItWinsForAnalysis.mockResolvedValue(judgment);
  });

  it("memoizes a semantic writer failure as { ok: false } and keeps the judgment", async () => {
    mocks.synthesizeHowItWins.mockRejectedValue(new Error("how-it-wins draft did not parse"));

    const result = await howItWinsStepBody(input);

    expect(result).toEqual({
      ok: false,
      error: "how-it-wins draft did not parse",
      judgment
    });
  });

  it("memoizes a semantic judge failure as { ok: false } without a writer call", async () => {
    mocks.judgeHowItWinsForAnalysis.mockRejectedValue(new Error("how-it-wins judge failed closed: global judgment failed"));

    const result = await howItWinsStepBody(input);

    expect(result).toEqual({
      ok: false,
      error: "how-it-wins judge failed closed: global judgment failed"
    });
    expect(mocks.synthesizeHowItWins).not.toHaveBeenCalled();
  });

  it("rethrows a transient transport error instead of memoizing it", async () => {
    mocks.synthesizeHowItWins.mockRejectedValue(new Error("openai-compat request failed with 529: overloaded"));

    await expect(howItWinsStepBody(input)).rejects.toThrow("openai-compat request failed with 529: overloaded");
  });

  it("returns the full stage result on success", async () => {
    const value: HowItWinsResult = {
      read: { status: "nothing_stands_out", sentence: "Nothing here separates it from the field yet.", inQuestion: [] },
      editorSkipped: true,
      fitRetried: false,
      styleIssues: [],
      normalizations: [],
      judgment
    };
    mocks.synthesizeHowItWins.mockResolvedValue(value);

    const result = await howItWinsStepBody(input);

    expect(result).toEqual({ ok: true, value });
  });

  it("judges first, then freezes that verdict for the writer", async () => {
    mocks.synthesizeHowItWins.mockResolvedValue({
      read: { status: "nothing_stands_out", inQuestion: [] },
      editorSkipped: true,
      fitRetried: false,
      styleIssues: [],
      normalizations: [],
      judgment
    });

    await howItWinsStepBody(input);

    expect(mocks.judgeHowItWinsForAnalysis).toHaveBeenCalledTimes(1);
    expect(mocks.judgeHowItWinsForAnalysis.mock.calls[0]?.[0]).toMatchObject({ card, models });
    expect(mocks.synthesizeHowItWins).toHaveBeenCalledTimes(1);
    expect(mocks.synthesizeHowItWins.mock.calls[0]?.[0]).toMatchObject({ card, models, judgment });
  });
});
