import { HOW_IT_WINS_STRATEGIES, type HowItWinsStrategyId } from "@cold-start/core";
import { describe, expect, it, vi } from "vitest";

import {
  HOW_IT_WINS_JUDGE_PROMPTS,
  HOW_IT_WINS_SCREEN_IDENTITY,
  HOW_IT_WINS_SCREEN_THRESHOLDS,
  benchmarkToolSchemaForRequest,
  createHowItWinsCitationCheck,
  createHowItWinsJudge,
  hashHowItWinsJudgeValue,
  howItWinsJudgePromptHash,
  howItWinsJudgeProviderRequest,
  howItWinsJudgeScopeFromScreen,
  type HowItWinsCitationCheck,
  type HowItWinsJudgeAdapter,
  type HowItWinsJudgeCallRequest,
  type HowItWinsJudgeRules,
  type HowItWinsJudgeScope,
  type HowItWinsScreenResult,
  type HowItWinsScreenStrategy,
  type JevAsk
} from "../src";

const evidencePacket = {
  cutoff: "2026-08-21T00:00:00.000Z",
  evidence: [{
    evidenceId: "e1",
    text: "A current source describes the mechanism.",
    source: "Primary source",
    sourceDate: "2026-08-20",
    attribution: "independent",
    scope: "company"
  }],
  context: { companyName: "Fixture Company" }
};

const rules: HowItWinsJudgeRules = {
  standard: "Apply the authoritative judgment standard.",
  actualBetStandard: "Identify the material company bet before strategy labels.",
  strategyRubric: HOW_IT_WINS_STRATEGIES.map((strategy) => ({
    strategyId: strategy.id,
    name: strategy.name,
    canonicalMeaning: strategy.meaning,
    positiveEvidence: "Positive evidence must establish the mechanism.",
    falsePositives: "A proxy is not the mechanism.",
    nearestSiblings: [],
    decidingQuestion: "Does the evidence establish this exact mechanism?",
    disqualifyingEvidence: "Affirmative evidence contradicts the mechanism."
  }))
};

const dimensions = {
  evidenceStrength: "direct",
  centrality: "central",
  materiality: "material",
  distinctiveness: "company_specific",
  independence: "independent",
  explanatoryValue: "necessary"
} as const;

const scopedIds: HowItWinsStrategyId[] = ["usership", "specialization", "alliance"];
const scope: HowItWinsJudgeScope = {
  version: "screen-v1",
  identity: HOW_IT_WINS_SCREEN_IDENTITY,
  strategyIds: scopedIds,
  screenedOut: HOW_IT_WINS_STRATEGIES.filter((strategy) => !scopedIds.includes(strategy.id))
    .map((strategy) => ({ strategyId: strategy.id, roundOne: 0.04 })),
  leads: { unusuallyStrong: ["usership"], lookalikeRisk: [], vague: ["alliance"] }
};

// A judge answer with rows only for the given ids; specialization is current, the rest rejected.
function scopedOutput(ids: HowItWinsStrategyId[]) {
  return {
    materialBets: [{
      statement: "The company is betting on one evidenced mechanism.",
      scope: "company",
      supportingEvidenceIds: ["e1"],
      scopeReasons: ["The same buyer and operating model apply."]
    }],
    strategyEvaluations: ids.map((strategyId) => strategyId === "specialization"
      ? {
        strategyId, disposition: "current", betRefs: [1],
        mechanism: "The mechanism changes how the company is chosen.",
        evidenceGate: "pass", evidenceIds: ["e1"],
        supportingClaims: [{ type: "observed_fact", text: "A source describes it.", evidenceIds: ["e1"] }],
        counterevidenceIds: [], dimensions, presentRelevance: "current", historicalEvidenceIds: [],
        presentEvidenceIds: ["e1"], presentBridge: null, siblingCandidateIds: [], siblingResolutions: [],
        notYet: null, dispositionReason: "The mechanism is current and material."
      }
      : { strategyId, disposition: "rejected", evidenceGate: "fail", dispositionReason: "No support." }),
    currentStrategyIds: ids.includes("specialization") ? ["specialization"] : [],
    unusualPair: null,
    openQuestions: [],
    overallWrongCondition: { condition: "Buyers stop choosing on this mechanism.", evidenceIds: ["e1"] },
    disagreements: [],
    overrides: []
  };
}

function trace(request: HowItWinsJudgeCallRequest, provider: string) {
  return {
    callId: request.callId, stage: request.stage, provider, model: `${provider}-model`,
    inputTokens: 10, outputTokens: 20, cacheCreationInputTokens: 0, cacheReadInputTokens: 0,
    actualCostUsd: null, estimatedCostUsd: 0, latencyMs: 1, retryCount: request.attempt - 1,
    thinkingState: "unknown" as const, outcome: "ok" as const
  };
}

function fakeAdapters(answers: Array<ReturnType<typeof scopedOutput>>) {
  let global = 0;
  const strong = vi.fn<HowItWinsJudgeAdapter>(async (request) => {
    if (request.stage === "global_judge") {
      return { ok: true, output: answers[Math.min(global++, answers.length - 1)], trace: trace(request, "fake-strong") };
    }
    const disputed = (request.payload as { disputedStrategyIds: HowItWinsStrategyId[] }).disputedStrategyIds;
    return {
      ok: true,
      output: {
        strategyEvaluations: disputed.map((strategyId) => ({
          strategyId, disposition: "insufficient_evidence", evidenceGate: "fail", dispositionReason: "Citations do not show it."
        })),
        currentStrategyIds: [],
        overrides: []
      },
      trace: trace(request, "fake-strong")
    };
  });
  const critic = vi.fn<HowItWinsJudgeAdapter>(async (request) => ({
    ok: true, output: { findings: [] }, trace: trace(request, "fake-critic")
  }));
  return { strong, critic };
}

function judgeInput(options: { refinement?: boolean; scope?: HowItWinsJudgeScope }) {
  return {
    evidencePacket,
    evidencePacketHash: hashHowItWinsJudgeValue(evidencePacket),
    vocabulary: HOW_IT_WINS_STRATEGIES,
    vocabularyHash: hashHowItWinsJudgeValue(HOW_IT_WINS_STRATEGIES),
    promptHash: howItWinsJudgePromptHash(rules, { refinement: options.refinement, screenIdentity: options.scope?.identity })
  };
}

describe("scoped How it wins judge", () => {
  it("leaves every unscoped prompt hash exactly as it was before scopes existed", () => {
    for (const refinement of [true, false]) {
      expect(howItWinsJudgePromptHash(rules, { refinement })).toBe(
        hashHowItWinsJudgeValue({ prompts: HOW_IT_WINS_JUDGE_PROMPTS, rules, refinement }));
    }
    expect(howItWinsJudgePromptHash(rules, { refinement: true, screenIdentity: scope.identity }))
      .not.toBe(howItWinsJudgePromptHash(rules, { refinement: true }));
  });

  // Jev answers vary between calls, so two screens of unchanged evidence rarely agree exactly. The
  // verdict is filed under the screen's configuration so the second re-file still replays it.
  it("keys a scoped verdict by the screen configuration, not by the scope it produced", async () => {
    const other: HowItWinsJudgeScope = { ...scope, strategyIds: ["specialization"], leads: { unusuallyStrong: [], lookalikeRisk: [], vague: [] } };
    expect(judgeInput({ scope: other }).promptHash).toBe(judgeInput({ scope }).promptHash);
    const judge = createHowItWinsJudge({ adapters: fakeAdapters([scopedOutput(["specialization"])]), rules, refinement: false, scope: other });
    await expect(judge(judgeInput({ refinement: false, scope }))).resolves.toBeDefined();
  });

  it("asks only for the scope and files every other strategy as screened out", async () => {
    const fake = fakeAdapters([scopedOutput(scopedIds)]);
    const judge = createHowItWinsJudge({ adapters: fake, rules, refinement: false, scope });
    const result = await judge(judgeInput({ refinement: false, scope }));

    const request = fake.strong.mock.calls[0]![0];
    expect(request.scoped).toBe(true);
    expect(request.prompt).toContain("This request is scoped.");
    expect((request.payload as { missingStrategyIds: string[] }).missingStrategyIds).toEqual(scopedIds);
    expect((request.payload as { screenLeads: unknown }).screenLeads).toEqual(scope.leads);

    expect(result.strategyEvaluations.map((row) => row.strategyId)).toEqual(HOW_IT_WINS_STRATEGIES.map((strategy) => strategy.id));
    expect(result.currentStrategyIds).toEqual(["specialization"]);
    const screened = result.strategyEvaluations.find((row) => row.strategyId === "hybrid")!;
    expect(screened).toMatchObject({ disposition: "insufficient_evidence", mechanism: null, evidenceGate: "unresolved" });
    expect(screened.dispositionReason).toBe("Screened out before judging: no specific supporting fact (screen-v1, 0.04).");
  });

  it("keeps a row the judge adds outside the scope instead of the screen's", async () => {
    const fake = fakeAdapters([scopedOutput([...scopedIds, "hybrid"])]);
    const judge = createHowItWinsJudge({ adapters: fake, rules, refinement: false, scope });
    const result = await judge(judgeInput({ refinement: false, scope }));
    expect(result.strategyEvaluations.find((row) => row.strategyId === "hybrid")?.disposition).toBe("rejected");
  });

  it("buys its one re-ask when a scoped strategy has no row", async () => {
    const fake = fakeAdapters([scopedOutput(["usership", "specialization"]), scopedOutput(scopedIds)]);
    const judge = createHowItWinsJudge({ adapters: fake, rules, refinement: false, scope });
    await judge(judgeInput({ refinement: false, scope }));
    expect(fake.strong.mock.calls.map(([request]) => request.callId)).toEqual(["how-it-wins:monolith", "how-it-wins:monolith:2"]);
    expect(fake.strong.mock.calls[1]![0].scoped).toBe(true);
  });

  it("sends a flagged citation to adjudication as a material dispute", async () => {
    const fake = fakeAdapters([scopedOutput(scopedIds)]);
    const citationCheck = vi.fn<HowItWinsCitationCheck>(async () => [{ strategyId: "specialization", support: 0.1 }]);
    const judge = createHowItWinsJudge({
      adapters: fake, rules, scope, citationCheck,
      providers: { strong: "anthropic", critic: "deepseek" }
    });
    const result = await judge(judgeInput({ scope }));

    const adjudication = fake.strong.mock.calls.find(([request]) => request.stage === "adjudication")![0];
    expect((adjudication.payload as { disputedStrategyIds: string[] }).disputedStrategyIds).toEqual(["specialization"]);
    expect(result.currentStrategyIds).toEqual([]);
    expect(result.disagreements.find((entry) => entry.stage === "citation_check")).toMatchObject({ strategyIds: ["specialization"], material: true });
    expect(result.refinement?.notes).toContain("citation check flagged specialization at 0.10");
  });

  it("keeps the judgment and notes it when the citation check fails", async () => {
    const fake = fakeAdapters([scopedOutput(scopedIds)]);
    const judge = createHowItWinsJudge({
      adapters: fake, rules, scope,
      citationCheck: async () => { throw new Error("jev 503"); },
      providers: { strong: "anthropic", critic: "deepseek" }
    });
    const result = await judge(judgeInput({ scope }));
    expect(result.currentStrategyIds).toEqual(["specialization"]);
    expect(result.refinement?.notes.some((note) => note.includes("citation check failed"))).toBe(true);
  });

  it("skips the citation check when refinement is off, since only adjudication reads its flags", async () => {
    const citationCheck = vi.fn<HowItWinsCitationCheck>(async () => []);
    const judge = createHowItWinsJudge({ adapters: fakeAdapters([scopedOutput(scopedIds)]), rules, refinement: false, scope, citationCheck });
    await judge(judgeInput({ refinement: false, scope }));
    expect(citationCheck).not.toHaveBeenCalled();
  });
});

describe("scoped judge transport", () => {
  const base: HowItWinsJudgeCallRequest = {
    callId: "how-it-wins:monolith", stage: "global_judge", attempt: 1, prompt: "Judge.",
    payload: { evidencePacket, rules, vocabulary: HOW_IT_WINS_STRATEGIES }, model: "claude-opus-5"
  };
  const rowSchema = (request: HowItWinsJudgeCallRequest) =>
    (benchmarkToolSchemaForRequest(request) as { properties: { strategyEvaluations: { minItems: number } } }).properties.strategyEvaluations;

  it("drops the fixed 80-row count from the tool schema and contract only when scoped", () => {
    expect(rowSchema(base).minItems).toBe(80);
    expect(rowSchema({ ...base, scoped: true }).minItems).toBe(1);
    const system = (request: HowItWinsJudgeCallRequest) => howItWinsJudgeProviderRequest(request).system[0]!.text;
    expect(system(base)).toContain("exactly 80 records");
    expect(system({ ...base, scoped: true })).not.toMatch(/\b80\b/);
  });
});

describe("screen to scope", () => {
  it("scopes the Round 1 survivors and derives leads from Round 2", () => {
    const strategies = Object.fromEntries(HOW_IT_WINS_STRATEGIES.map((strategy) => [strategy.id, {
      roundOne: 0.05, support: 0, percentile: 0, blocked: false
    } satisfies HowItWinsScreenStrategy])) as HowItWinsScreenResult["strategies"];
    strategies.usership = { roundOne: 0.9, roundTwo: { deciding: 0.9, positive: 0.8, lookalike: 0.1, disqualifier: 0 }, support: 0.85, percentile: 0.95, blocked: false };
    strategies.alliance = { roundOne: 0.4, roundTwo: { deciding: 0.7, positive: 0.2, lookalike: 0.9, disqualifier: 0 }, support: 0.45, percentile: 0.5, blocked: true };
    const scoped = howItWinsJudgeScopeFromScreen({
      version: "screen-v1", model: "jev-1.13.0", strategies, keptIds: ["alliance", "usership"],
      shortlistIds: ["usership"], inputTokens: 0, costUsd: 0, latencyMs: 0
    });
    expect(scoped.strategyIds).toEqual(HOW_IT_WINS_STRATEGIES.map((s) => s.id).filter((id) => id === "usership" || id === "alliance"));
    expect(scoped.screenedOut).toHaveLength(78);
    expect(scoped.identity).toBe(HOW_IT_WINS_SCREEN_IDENTITY);
    expect(scoped.leads).toEqual({ unusuallyStrong: ["usership"], lookalikeRisk: ["alliance"], vague: ["alliance"] });
  });
});

describe("citation check", () => {
  it("asks once per current ruling over its own cited evidence and flags low support", async () => {
    const states: unknown[] = [];
    const ask: JevAsk = async (state) => {
      states.push(state);
      const name = (state as { strategy: { name: string } }).strategy.name;
      return { answers: { cited: name === "Usership" ? 0.1 : 0.9 }, inputTokens: 1, latencyMs: 1 };
    };
    const row = (strategyId: HowItWinsStrategyId, disposition: string) => ({
      strategyId, disposition, mechanism: "It works.", evidenceIds: ["e1"], presentEvidenceIds: ["e1"], dispositionReason: "Because."
    });
    const flagged = await createHowItWinsCitationCheck(ask)({
      evidenceRegistry: evidencePacket.evidence,
      strategyEvaluations: [row("usership", "current"), row("specialization", "current"), row("alliance", "open_question")]
    } as never);
    expect(states).toHaveLength(2);
    expect((states[0] as { citedEvidence: unknown[] }).citedEvidence).toHaveLength(1);
    expect(flagged).toEqual([{ strategyId: "usership", support: 0.1 }]);
    expect(HOW_IT_WINS_SCREEN_THRESHOLDS.citationFlagBelow).toBeGreaterThan(0.1);
  });
});
