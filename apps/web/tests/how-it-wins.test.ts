import { beforeEach, describe, expect, it, vi } from "vitest";

import type { ColdStartCard, HowItWinsJudgment, HowItWinsRead } from "@cold-start/core";
import { buildSkeletonCard } from "@cold-start/pipeline";

import {
  howItWinsJudgeInputs,
  howItWinsJudgeStepBody,
  howItWinsJudgeSummary,
  howItWinsVerifyStepBody,
  howItWinsWriteStepBody
} from "../src/inngest/how-it-wins";

const mocks = vi.hoisted(() => ({
  findHowItWinsJudgment: vi.fn(),
  storeHowItWinsJudgment: vi.fn(),
  judgeHowItWinsForAnalysis: vi.fn(),
  synthesizeHowItWins: vi.fn(),
  verifySynthesis: vi.fn()
}));

vi.mock("@cold-start/db", () => ({
  findHowItWinsJudgment: mocks.findHowItWinsJudgment,
  storeHowItWinsJudgment: mocks.storeHowItWinsJudgment
}));

vi.mock("@cold-start/llm", async () => {
  const actual = await vi.importActual<typeof import("@cold-start/llm")>("@cold-start/llm");
  return {
    ...actual,
    judgeHowItWinsForAnalysis: mocks.judgeHowItWinsForAnalysis,
    synthesizeHowItWins: mocks.synthesizeHowItWins,
    verifySynthesis: mocks.verifySynthesis
  };
});

const models = { judge: "claude-judge-test", writer: "claude-test", editor: "deepseek/deepseek-v4-pro" };
const db = {} as never;
const client = {} as never;

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
const { hashes } = howItWinsJudgeInputs(card);

const runningOne = {
  strategy: "specialization" as const,
  meaning: "Strong competence in a narrow niche.",
  note: "Cognition builds only autonomous software engineering. [c1]",
  citationIds: ["c1"]
};
const runningTwo = {
  strategy: "iteration" as const,
  meaning: "Iterates and changes quickly.",
  note: "Cognition ships agent changes on a weekly cadence. [c2]",
  citationIds: ["c2"]
};
const pair = {
  strategies: ["specialization", "iteration"] as const,
  note: "A narrow surface plus weekly shipping compounds faster than a broad platform can. [c3]",
  wrongIf: "The roadmap widens past software engineering.",
  citationIds: ["c3"]
};
const read: HowItWinsRead = {
  status: "read",
  sentence: "Cognition wins by staying narrow and shipping faster than broader platforms.",
  running: [runningOne, runningTwo],
  pair,
  next: [],
  inQuestion: [],
  wrongIf: "A broad platform matches the release cadence."
};

function supported(entries: Array<{ note: string; citationIds: string[] }>) {
  return entries.map((entry) => ({ text: entry.note, citationIds: entry.citationIds, status: "supported" as const }));
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.findHowItWinsJudgment.mockResolvedValue(null);
  mocks.storeHowItWinsJudgment.mockResolvedValue({ id: "judgment-id", judgment, createdAt: new Date() });
  mocks.judgeHowItWinsForAnalysis.mockResolvedValue(judgment);
});

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

describe("howItWinsJudgeStepBody", () => {
  it("replays a stored verdict for the same evidence, prompt, and vocabulary", async () => {
    mocks.findHowItWinsJudgment.mockResolvedValue({ id: "stored-id", judgment, createdAt: new Date() });

    const result = await howItWinsJudgeStepBody({ db, card, slug: "cognition", client, models });

    expect(result).toMatchObject({ ok: true, judgmentId: "stored-id", cached: true });
    expect(mocks.findHowItWinsJudgment.mock.calls[0]?.[1]).toEqual(hashes);
    expect(mocks.judgeHowItWinsForAnalysis).not.toHaveBeenCalled();
    expect(mocks.storeHowItWinsJudgment).not.toHaveBeenCalled();
  });

  it("judges on a miss, stores the verdict under its three hashes, and returns only the summary", async () => {
    const result = await howItWinsJudgeStepBody({ db, card, slug: "cognition", client, models });

    expect(result).toMatchObject({ ok: true, judgmentId: "judgment-id", cached: false, hashes });
    expect(mocks.judgeHowItWinsForAnalysis).toHaveBeenCalledTimes(1);
    const stored = mocks.storeHowItWinsJudgment.mock.calls[0]?.[1] as {
      estimatedCostUsd: number;
      latencyMs: number;
    };
    expect(stored).toMatchObject({ ...hashes, slug: "cognition", model: models.judge, judgment });
    // 1.50 estimated on the judge call plus 0.25 billed on the critic: the billed number wins
    // wherever the provider reported one.
    expect(stored.estimatedCostUsd).toBeCloseTo(1.75, 6);
    expect(typeof stored.latencyMs).toBe("number");
    expect(result).not.toHaveProperty("judgment");
  });

  it("passes the refinement flag through to the judge", async () => {
    await howItWinsJudgeStepBody({ db, card, slug: "cognition", client, models, refinement: false });

    expect(mocks.judgeHowItWinsForAnalysis.mock.calls[0]?.[0]).toMatchObject({ refinement: false });
  });

  it("hashes the lookup and the stored verdict under the same refinement flag it judges with", async () => {
    const offHashes = howItWinsJudgeInputs(card, false).hashes;
    expect(offHashes.promptHash).not.toBe(hashes.promptHash);

    const result = await howItWinsJudgeStepBody({ db, card, slug: "cognition", client, models, refinement: false });

    expect(result).toMatchObject({ ok: true, hashes: offHashes });
    expect(mocks.findHowItWinsJudgment.mock.calls[0]?.[1]).toEqual(offHashes);
    expect(mocks.judgeHowItWinsForAnalysis.mock.calls[0]?.[0]).toMatchObject({ refinement: false });
    expect(mocks.storeHowItWinsJudgment.mock.calls[0]?.[1]).toMatchObject(offHashes);
  });

  it("memoizes a judge fail-closed as { ok: false } and rethrows a transient transport error", async () => {
    mocks.judgeHowItWinsForAnalysis.mockRejectedValueOnce(
      new Error("how-it-wins judge failed closed: global judgment failed")
    );
    const semantic = await howItWinsJudgeStepBody({ db, card, slug: "cognition", client, models });
    expect(semantic).toEqual({ ok: false, error: "how-it-wins judge failed closed: global judgment failed" });
    expect(mocks.storeHowItWinsJudgment).not.toHaveBeenCalled();

    mocks.judgeHowItWinsForAnalysis.mockRejectedValueOnce(
      new Error("openai-compat request failed with 529: overloaded")
    );
    await expect(howItWinsJudgeStepBody({ db, card, slug: "cognition", client, models })).rejects.toThrow(
      "openai-compat request failed with 529: overloaded"
    );
  });
});

describe("howItWinsWriteStepBody", () => {
  const writeInput = { db, card, hashes, client, models, telemetry: () => {} };

  beforeEach(() => {
    mocks.findHowItWinsJudgment.mockResolvedValue({ id: "judgment-id", judgment, createdAt: new Date() });
    mocks.synthesizeHowItWins.mockResolvedValue({
      read,
      editorSkipped: true,
      fitRetried: false,
      styleIssues: ["one flagged line"],
      normalizations: []
    });
  });

  it("reads the stored verdict back and writes from it", async () => {
    const result = await howItWinsWriteStepBody(writeInput);

    expect(result).toEqual({ ok: true, read, editorSkipped: true, fitRetried: false, styleIssueCount: 1 });
    expect(mocks.findHowItWinsJudgment.mock.calls[0]?.[1]).toEqual(hashes);
    expect(mocks.synthesizeHowItWins.mock.calls[0]?.[0]).toMatchObject({ card, models, judgment });
  });

  it("treats a verdict that cannot be read back as a semantic failure", async () => {
    mocks.findHowItWinsJudgment.mockResolvedValue(null);

    const result = await howItWinsWriteStepBody(writeInput);

    expect(result).toEqual({ ok: false, error: "stored how-it-wins judgment could not be read back" });
    expect(mocks.synthesizeHowItWins).not.toHaveBeenCalled();
  });

  it("memoizes an unparseable draft and rethrows a transient transport error", async () => {
    mocks.synthesizeHowItWins.mockRejectedValueOnce(new Error("how-it-wins draft did not parse"));
    expect(await howItWinsWriteStepBody(writeInput)).toEqual({
      ok: false,
      error: "how-it-wins draft did not parse"
    });

    mocks.synthesizeHowItWins.mockRejectedValueOnce(new Error("openai-compat request failed with 529: overloaded"));
    await expect(howItWinsWriteStepBody(writeInput)).rejects.toThrow("openai-compat request failed with 529: overloaded");
  });
});

describe("howItWinsVerifyStepBody", () => {
  const verifyInput = {
    card,
    read,
    judgeCurrentCount: 2,
    client,
    model: "claude-verify",
    telemetry: () => {}
  };

  it("keeps a fully supported read and reports no losses past the judge", async () => {
    mocks.verifySynthesis.mockResolvedValue(supported([runningOne, runningTwo, pair]));

    const result = await howItWinsVerifyStepBody(verifyInput);

    if (!result.ok) throw new Error("expected a verified read");
    expect(result.howItWins.status).toBe("read");
    expect(result.losses).toEqual({
      judgeCurrent: 2,
      writerCurrent: 2,
      verifiedRunning: 2,
      writerCitationDropped: 0,
      verifierDropped: 0,
      floorFired: false
    });
  });

  it("keeps a read on one survivor, and kills the pair with its dropped leg", async () => {
    mocks.verifySynthesis.mockResolvedValue([
      { text: runningOne.note, citationIds: runningOne.citationIds, status: "supported" as const },
      { text: runningTwo.note, citationIds: runningTwo.citationIds, status: "unsupported" as const },
      { text: pair.note, citationIds: pair.citationIds, status: "supported" as const }
    ]);

    const result = await howItWinsVerifyStepBody(verifyInput);

    if (!result.ok) throw new Error("expected a verified read");
    expect(result.howItWins.status).toBe("read");
    if (result.howItWins.status !== "read") throw new Error("expected a filed read");
    expect(result.howItWins.running.map((entry) => entry.strategy)).toEqual(["specialization"]);
    expect(result.howItWins.pair).toBeNull();
    expect(result.dropReason).toBe("pair-dropped");
    expect(result.losses).toMatchObject({ verifiedRunning: 1, verifierDropped: 1, floorFired: false });
  });

  // The losses field is still named for the old under-two rule; what it records now is the floor
  // firing, which takes every running strategy dropping.
  it("records the floor firing when the verifier drops every running strategy", async () => {
    mocks.verifySynthesis.mockResolvedValue([
      { text: runningOne.note, citationIds: runningOne.citationIds, status: "unsupported" as const },
      { text: runningTwo.note, citationIds: runningTwo.citationIds, status: "unsupported" as const },
      { text: pair.note, citationIds: pair.citationIds, status: "supported" as const }
    ]);

    const result = await howItWinsVerifyStepBody(verifyInput);

    if (!result.ok) throw new Error("expected a verified read");
    expect(result.howItWins.status).toBe("nothing_stands_out");
    expect(result.dropReason).toBe("running-dropped");
    expect(result.losses).toMatchObject({ verifiedRunning: 0, verifierDropped: 2, floorFired: true });
  });

  it("counts a running note whose citation is not on the card", async () => {
    const uncitable = { ...runningTwo, note: "Cognition ships weekly. [c9]", citationIds: ["c9"] };
    mocks.verifySynthesis.mockResolvedValue(supported([runningOne, pair]));

    const result = await howItWinsVerifyStepBody({
      ...verifyInput,
      read: { ...read, running: [runningOne, uncitable] }
    });

    if (!result.ok) throw new Error("expected a verified read");
    expect(result.losses.writerCitationDropped).toBe(1);
  });

  it("memoizes a semantic verifier failure and rethrows a transient one", async () => {
    mocks.verifySynthesis.mockRejectedValueOnce(new Error("verifier response did not parse"));
    expect(await howItWinsVerifyStepBody(verifyInput)).toEqual({
      ok: false,
      error: "verifier response did not parse"
    });

    mocks.verifySynthesis.mockRejectedValueOnce(new Error("openai-compat request failed with 529: overloaded"));
    await expect(howItWinsVerifyStepBody(verifyInput)).rejects.toThrow("openai-compat request failed with 529: overloaded");
  });
});
