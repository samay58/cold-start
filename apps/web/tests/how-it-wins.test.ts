import { beforeEach, describe, expect, it, vi } from "vitest";

import { buildSkeletonCard } from "@cold-start/pipeline";
import type { HowItWinsResult } from "@cold-start/llm";

import { howItWinsStepBody } from "../src/inngest/how-it-wins";

const mocks = vi.hoisted(() => ({
  synthesizeHowItWins: vi.fn()
}));

vi.mock("@cold-start/llm", async () => {
  const actual = await vi.importActual<typeof import("@cold-start/llm")>("@cold-start/llm");
  return {
    ...actual,
    synthesizeHowItWins: mocks.synthesizeHowItWins
  };
});

describe("howItWinsStepBody", () => {
  const card = buildSkeletonCard("cognition.ai");
  const models = { writer: "claude-test", editor: "deepseek/deepseek-v4-pro" };
  const input = {
    card,
    client: {} as never,
    models,
    telemetry: () => {}
  };

  beforeEach(() => {
    mocks.synthesizeHowItWins.mockReset();
  });

  it("memoizes a semantic failure as { ok: false }", async () => {
    // Same contract as emphasisReadStepBody: a schema/content error from the stage is caught and
    // returned as a step-level failure value, never thrown, so an Inngest retry never re-pays for
    // the four passes.
    mocks.synthesizeHowItWins.mockRejectedValue(new Error("how-it-wins draft did not parse"));

    const result = await howItWinsStepBody(input);

    expect(result).toEqual({ ok: false, error: "how-it-wins draft did not parse" });
  });

  it("rethrows a transient transport error instead of memoizing it", async () => {
    // Shaped like the error packages/llm/src/openai-compat.ts throws after its own retry loop is
    // exhausted on a sustained 529; isTransientLlmError parses the status back out of this exact
    // message format (packages/llm/src/transient-error.ts).
    mocks.synthesizeHowItWins.mockRejectedValue(new Error("openai-compat request failed with 529: overloaded"));

    await expect(howItWinsStepBody(input)).rejects.toThrow("openai-compat request failed with 529: overloaded");
  });

  it("returns the full stage result on success", async () => {
    const value: HowItWinsResult = {
      read: { status: "nothing_stands_out", sentence: "Nothing here separates it from the field yet." },
      editorSkipped: true,
      fitRetried: false,
      styleIssues: []
    };
    mocks.synthesizeHowItWins.mockResolvedValue(value);

    const result = await howItWinsStepBody(input);

    expect(result).toEqual({ ok: true, value });
  });

  it("passes the writer and editor models through to the stage", async () => {
    mocks.synthesizeHowItWins.mockResolvedValue({
      read: { status: "nothing_stands_out" },
      editorSkipped: false,
      fitRetried: false,
      styleIssues: []
    });

    await howItWinsStepBody(input);

    expect(mocks.synthesizeHowItWins).toHaveBeenCalledTimes(1);
    expect(mocks.synthesizeHowItWins.mock.calls[0]?.[0]).toMatchObject({ card, models });
  });
});
