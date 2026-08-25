import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  HOW_IT_WINS_STRATEGIES,
  type HowItWinsJudgmentBody,
  type HowItWinsStrategyEvaluation,
  type HowItWinsStrategyId
} from "@cold-start/core";
import { describe, expect, it, vi } from "vitest";

import {
  HOW_IT_WINS_FOUR_BUNDLES,
  createHowItWinsJudge,
  frozenHowItWinsWriterRequest,
  hashHowItWinsJudgeValue,
  howItWinsFourBundleScopes,
  howItWinsJudgePromptHash,
  parseFrozenHowItWinsWriterDraft,
  howItWinsFromFrozenWriter,
  loadHowItWinsJudgeRules,
  parseHowItWinsJudgeRules,
  type HowItWinsJudgeAdapter,
  type HowItWinsJudgeCallRequest,
  type HowItWinsJudgeCallTrace,
  type HowItWinsJudgeRules,
  type HowItWinsJudgeScope
} from "../src";

function failedDimensions() {
  return {
    evidenceStrength: "insufficient" as const,
    centrality: "not_reached" as const,
    materiality: "not_reached" as const,
    distinctiveness: "not_reached" as const,
    independence: "not_reached" as const,
    explanatoryValue: "not_reached" as const
  };
}

function passingDimensions() {
  return {
    evidenceStrength: "direct" as const,
    centrality: "central" as const,
    materiality: "material" as const,
    distinctiveness: "company_specific" as const,
    independence: "independent" as const,
    explanatoryValue: "necessary" as const
  };
}

function evaluation(strategyId: HowItWinsStrategyId): HowItWinsStrategyEvaluation {
  return {
    strategyId,
    disposition: "insufficient_evidence",
    betIds: [],
    mechanism: null,
    evidenceGate: "fail",
    evidenceIds: [],
    claimIds: [],
    counterevidenceIds: [],
    dimensions: failedDimensions(),
    presentRelevance: "not_reached",
    historicalEvidenceIds: [],
    presentEvidenceIds: [],
    presentBridge: null,
    siblingCandidateIds: [],
    siblingResolutions: [],
    notYet: null,
    dispositionReason: "The supplied evidence does not establish this mechanism."
  };
}

function current(strategyId: HowItWinsStrategyId): HowItWinsStrategyEvaluation {
  return {
    ...evaluation(strategyId),
    disposition: "current",
    betIds: ["b1"],
    mechanism: "The mechanism changes how the company is chosen.",
    evidenceGate: "pass",
    evidenceIds: ["e1"],
    claimIds: ["c1"],
    dimensions: passingDimensions(),
    presentRelevance: "current",
    presentEvidenceIds: ["e1"],
    dispositionReason: "The mechanism is current and material."
  };
}

// An open question the judge answered in full, with a historical bridge and no claims. Carrying
// one through adjudication is what proves the merge reads the settled body rather than the
// shorter projection the model gets.
function openQuestion(strategyId: HowItWinsStrategyId): HowItWinsStrategyEvaluation {
  return {
    ...current(strategyId),
    disposition: "open_question",
    betIds: [],
    claimIds: [],
    presentRelevance: "historical_only",
    historicalEvidenceIds: ["e1"],
    presentEvidenceIds: [],
    dispositionReason: "The record does not settle whether the mechanism still holds."
  };
}

function body(
  currentIds: HowItWinsStrategyId[] = [],
  openQuestionIds: HowItWinsStrategyId[] = []
): HowItWinsJudgmentBody {
  const selected = new Set(currentIds);
  const open = new Set(openQuestionIds);
  return {
    evidenceCutoff: "2026-08-21T00:00:00.000Z",
    evidenceRegistry: [
      {
        evidenceId: "e1",
        text: "A current source describes the mechanism.",
        source: "Primary source",
        sourceDate: "2026-08-20",
        attribution: "independent",
        scope: "company"
      }
    ],
    claims: [
      { claimId: "c1", type: "observed_fact", text: "A current source describes the mechanism.", evidenceIds: ["e1"] }
    ],
    materialBets: [
      {
        betId: "b1",
        statement: "The company is betting on one evidenced mechanism.",
        scope: "company",
        supportingEvidenceIds: ["e1"],
        scopeReasons: ["The same buyer and operating model apply."]
      }
    ],
    strategyEvaluations: HOW_IT_WINS_STRATEGIES.map((strategy) => {
      if (selected.has(strategy.id)) return current(strategy.id);
      if (open.has(strategy.id)) return openQuestion(strategy.id);
      return evaluation(strategy.id);
    }),
    currentStrategyIds: currentIds,
    unusualPair: null,
    openQuestions: [],
    overallWrongCondition: {
      condition: "The current mechanism stops affecting buyer choice.",
      evidenceIds: ["e1"]
    },
    disagreements: [],
    overrides: []
  };
}

const evidencePacket = {
  cutoff: "2026-08-21T00:00:00.000Z",
  evidence: [
    {
      evidenceId: "e1",
      text: "A current source describes the mechanism.",
      source: "Primary source",
      sourceDate: "2026-08-20",
      attribution: "independent",
      scope: "company"
    }
  ],
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

function judgeInput() {
  return {
    evidencePacket,
    evidencePacketHash: hashHowItWinsJudgeValue(evidencePacket),
    vocabulary: HOW_IT_WINS_STRATEGIES,
    vocabularyHash: hashHowItWinsJudgeValue(HOW_IT_WINS_STRATEGIES),
    promptHash: howItWinsJudgePromptHash(rules)
  };
}

function trace(request: HowItWinsJudgeCallRequest, provider: string, outcome: "ok" | "failed" = "ok"): HowItWinsJudgeCallTrace {
  return {
    callId: request.callId,
    stage: request.stage,
    ...(request.groupId ? { groupId: request.groupId } : {}),
    ...(request.bundleId ? { bundleId: request.bundleId } : {}),
    provider,
    model: `${provider}-model`,
    inputTokens: 10,
    outputTokens: 20,
    cacheCreationInputTokens: 0,
    cacheReadInputTokens: 0,
    actualCostUsd: null,
    estimatedCostUsd: 0,
    latencyMs: 1,
    retryCount: request.attempt - 1,
    thinkingState: "unknown",
    outcome,
    ...(outcome === "failed" ? { error: "fixture failure" } : {})
  };
}

function betMap() {
  return {
    materialBets: body().materialBets.map(({ betId: _betId, ...bet }) => bet)
  };
}

function semanticFromBody(input: HowItWinsJudgmentBody, includeMaterialBets: boolean) {
  const betRefById = new Map(input.materialBets.map((bet, index) => [bet.betId, index + 1]));
  const claimById = new Map(input.claims.map((claim) => [claim.claimId, claim]));
  return {
    ...(includeMaterialBets ? { materialBets: input.materialBets.map((value) => {
      const { betId: _betId, ...bet } = value;
      return bet;
    }) } : {}),
    strategyEvaluations: input.strategyEvaluations.map((entry) => {
      if (entry.evidenceGate === "fail") {
        return {
          strategyId: entry.strategyId,
          disposition: entry.disposition,
          evidenceGate: entry.evidenceGate,
          dispositionReason: entry.dispositionReason
        };
      }
      const { betIds: _betIds, claimIds: _claimIds, siblingResolutions, ...rest } = entry;
      return {
        ...rest,
        siblingResolutions: siblingResolutions.map(
          ({ decidingQuestion: _decidingQuestion, ...resolution }) => resolution
        ),
        betRefs: entry.betIds.map((betId) => betRefById.get(betId)),
        supportingClaims: entry.claimIds.flatMap((claimId) => {
          const claim = claimById.get(claimId);
          if (!claim || (claim.type !== "observed_fact" && claim.type !== "reasonable_inference")) return [];
          const { claimId: _claimId, ...semantic } = claim;
          return [semantic];
        })
      };
    }),
    currentStrategyIds: input.currentStrategyIds,
    unusualPair: input.unusualPair,
    openQuestions: input.openQuestions.map(({ questionId: _questionId, ...question }) => question),
    overallWrongCondition: input.overallWrongCondition,
    disagreements: input.disagreements.map(({ disagreementId: _disagreementId, ...entry }) => entry),
    overrides: input.overrides.flatMap((entry) => {
      if (entry.kind === "bet") return [];
      const { betId: _betId, ...semantic } = entry;
      return [semantic];
    })
  };
}

// Adjudication answers with a patch: rows only for the disputed strategies, the whole ordered
// current list, and the overrides for what moved.
function adjudicationPatch(
  request: HowItWinsJudgeCallRequest,
  source: HowItWinsJudgmentBody,
  options: {
    rowStrategyIds?: HowItWinsStrategyId[];
    currentStrategyIds?: HowItWinsStrategyId[];
    unusualPair?: unknown;
  } = {}
) {
  const disputed = (request.payload as { disputedStrategyIds: HowItWinsStrategyId[] }).disputedStrategyIds;
  const rows = new Set(options.rowStrategyIds ?? disputed);
  const semantic = semanticFromBody(source, false);
  return {
    strategyEvaluations: semantic.strategyEvaluations.filter((row) => rows.has(row.strategyId)),
    currentStrategyIds: options.currentStrategyIds ?? source.currentStrategyIds,
    ...(options.unusualPair !== undefined ? { unusualPair: options.unusualPair } : {}),
    overrides: []
  };
}

function scoutOutput(request: HowItWinsJudgeCallRequest) {
  const payload = request.payload as { strategies: typeof HOW_IT_WINS_STRATEGIES };
  const strategies = payload.strategies;
  const output: {
    scopeId: string;
    evaluations: Array<{
      strategyId: HowItWinsStrategyId;
      recommendation: "supported" | "rejected" | "open_question";
      mechanism: string | null;
      evidenceIds: string[];
      siblingCandidateIds: HowItWinsStrategyId[];
      siblingResolutions: never[];
      reason: string;
    }>;
    betChallenges: never[];
  } = {
    scopeId: request.groupId ?? request.bundleId ?? "missing-scope",
    evaluations: strategies.map((strategy) => ({
      strategyId: strategy.id,
      recommendation: "rejected",
      mechanism: null,
      evidenceIds: [],
      siblingCandidateIds: [],
      siblingResolutions: [],
      reason: "The mechanism is not established."
    })),
    betChallenges: []
  };
  return output;
}

function adapters(options: {
  judgment?: HowItWinsJudgmentBody;
  criticFindings?: Array<Record<string, unknown>>;
  adjudicated?: HowItWinsJudgmentBody;
  adjudicationRowIds?: HowItWinsStrategyId[];
  adjudicationCurrentIds?: HowItWinsStrategyId[];
  adjudicationPair?: unknown;
  betRevision?: {
    materialBets: HowItWinsJudgmentBody["materialBets"];
    reason?: string;
    evidenceIds?: string[];
  } | null;
  onRequest?: (request: HowItWinsJudgeCallRequest) => void | Promise<void>;
  scoutFailure?: (request: HowItWinsJudgeCallRequest) => boolean;
} = {}) {
  const finalBody = options.judgment ?? body();
  const strong = vi.fn<HowItWinsJudgeAdapter>(async (request) => {
    await options.onRequest?.(request);
    if (request.stage === "bet_map") return { ok: true, output: betMap(), trace: trace(request, "fake-strong") };
    if (request.stage === "global_judge") {
      const payload = request.payload as { betMap: unknown };
      return {
        ok: true,
        output: {
          ...semanticFromBody(finalBody, payload.betMap === null),
          ...(options.betRevision ? {
            betRevision: {
              ...options.betRevision,
              materialBets: options.betRevision.materialBets.map(({ betId: _betId, ...bet }) => bet)
            }
          } : {})
        },
        trace: trace(request, "fake-strong")
      };
    }
    if (request.stage === "adjudication") {
      return {
        ok: true,
        output: adjudicationPatch(request, options.adjudicated ?? finalBody, {
          ...(options.adjudicationRowIds ? { rowStrategyIds: options.adjudicationRowIds } : {}),
          ...(options.adjudicationCurrentIds ? { currentStrategyIds: options.adjudicationCurrentIds } : {}),
          ...(options.adjudicationPair !== undefined ? { unusualPair: options.adjudicationPair } : {})
        }),
        trace: trace(request, "fake-strong")
      };
    }
    throw new Error(`unexpected strong stage ${request.stage}`);
  });
  const scout = vi.fn<HowItWinsJudgeAdapter>(async (request) => {
    await options.onRequest?.(request);
    if (options.scoutFailure?.(request)) {
      return { ok: false, error: "fixture failure", retryable: true, trace: trace(request, "fake-scout", "failed") };
    }
    return { ok: true, output: scoutOutput(request), trace: trace(request, "fake-scout") };
  });
  const critic = vi.fn<HowItWinsJudgeAdapter>(async (request) => {
    await options.onRequest?.(request);
    return {
      ok: true,
      output: {
        findings: (options.criticFindings ?? []).map(({ findingId: _findingId, ...finding }) => finding)
      },
      trace: trace(request, "fake-critic")
    };
  });
  return { strong, scout, critic };
}

function semanticJudgment(currentIds: HowItWinsStrategyId[] = ["usership"]) {
  const selected = new Set(currentIds);
  return {
    strategyEvaluations: HOW_IT_WINS_STRATEGIES.map((strategy) => selected.has(strategy.id)
      ? {
        strategyId: strategy.id,
        disposition: "current" as const,
        betRefs: [1],
        mechanism: "The mechanism changes how the company is chosen.",
        evidenceGate: "pass" as const,
        evidenceIds: ["e1"],
        supportingClaims: [{
          type: "observed_fact" as const,
          text: "A current source describes the mechanism.",
          evidenceIds: ["e1"]
        }],
        counterevidenceIds: [],
        dimensions: passingDimensions(),
        presentRelevance: "current" as const,
        historicalEvidenceIds: [],
        presentEvidenceIds: ["e1"],
        presentBridge: null,
        siblingCandidateIds: [],
        siblingResolutions: [],
        notYet: null,
        dispositionReason: "The mechanism is current and material."
      }
      : {
        strategyId: strategy.id,
        disposition: "insufficient_evidence" as const,
        evidenceGate: "fail" as const,
        dispositionReason: "The supplied evidence does not establish this mechanism."
      }),
    currentStrategyIds: currentIds,
    unusualPair: null,
    openQuestions: [{
      question: "Would the mechanism still change buyer choice without the current proof?",
      whyMaterial: "The answer could change the current disposition.",
      evidenceNeeded: "A buyer comparison.",
      affectedStrategyIds: currentIds,
      evidenceIds: ["e1"]
    }],
    overallWrongCondition: {
      condition: "The current mechanism stops affecting buyer choice.",
      evidenceIds: ["e1"]
    },
    disagreements: [{
      stage: "global_judge",
      summary: "The evidence supports only one current mechanism.",
      material: false,
      strategyIds: currentIds,
      evidenceIds: ["e1"]
    }],
    overrides: []
  };
}

describe("createHowItWinsJudge", () => {
  function makeJudge(
    fake: ReturnType<typeof adapters>,
    options: {
      scopes?: HowItWinsJudgeScope[];
      maxScoutConcurrency?: number;
      telemetry?: (trace: HowItWinsJudgeCallTrace) => void;
    } = {}
  ) {
    return createHowItWinsJudge({ adapters: fake, rules, ...options });
  }

  it("maps the company bet before launching any strategy scout", async () => {
    const order: string[] = [];
    const fake = adapters({ onRequest: (request) => { order.push(request.stage); } });
    const judge = makeJudge(fake, { maxScoutConcurrency: 4 });

    await judge(judgeInput());

    expect(order[0]).toBe("bet_map");
    expect(order.indexOf("group_scout")).toBeGreaterThan(order.indexOf("bet_map"));
  });

  it("assigns durable bet, claim, question, and disagreement ids in code", async () => {
    const fake = adapters();
    const semantic = {
      ...semanticJudgment(),
      overrides: [{
        kind: "strategy" as const,
        strategyId: "usership" as const,
        from: "rejected",
        to: "current",
        reason: "The global pass found direct evidence that the scout rejected.",
        evidenceIds: ["e1"]
      }]
    };
    Object.assign(
      semantic.strategyEvaluations.find((entry) => entry.strategyId === "usership")!,
      {
        siblingCandidateIds: ["reliability"],
        siblingResolutions: [{
          strategyId: "reliability",
          reason: "The evidence describes participant utility, not lower failure or maintenance.",
          evidenceIds: ["e1"]
        }]
      }
    );
    const originalStrong = fake.strong;
    fake.strong = vi.fn<HowItWinsJudgeAdapter>(async (request) => {
      if (request.stage === "bet_map") {
        return {
          ok: true,
          output: {
            materialBets: [{
              statement: "The company is betting on one evidenced mechanism.",
              scope: "company",
              supportingEvidenceIds: ["e1"],
              scopeReasons: ["The same buyer and operating model apply."]
            }]
          },
          trace: trace(request, "fake-strong")
        };
      }
      if (request.stage === "global_judge") {
        return {
          ok: true,
          output: semantic,
          trace: trace(request, "fake-strong")
        };
      }
      return originalStrong(request);
    });

    const first = await makeJudge(fake, { scopes: howItWinsFourBundleScopes() })(judgeInput());
    expect(first.materialBets.map((bet) => bet.betId)).toEqual(["b1"]);
    expect(first.claims.map((claim) => claim.claimId)).toEqual(["c1"]);
    expect(first.openQuestions.map((question) => question.questionId)).toEqual(["q1"]);
    expect(first.disagreements.map((entry) => entry.disagreementId)).toEqual(["d1"]);
    expect(first.strategyEvaluations.find((entry) => entry.strategyId === "usership")).toMatchObject({
      betIds: ["b1"],
      claimIds: ["c1"],
      siblingResolutions: [{
        strategyId: "reliability",
        decidingQuestion: rules.strategyRubric.find((row) => row.strategyId === "reliability")!.decidingQuestion,
        reason: "The evidence describes participant utility, not lower failure or maintenance.",
        evidenceIds: ["e1"]
      }]
    });

    const secondFake = adapters();
    secondFake.strong = fake.strong;
    const second = await makeJudge(secondFake, { scopes: howItWinsFourBundleScopes() })(judgeInput());
    expect(second.materialBets.map((bet) => bet.betId)).toEqual(["b1"]);
    expect(second.claims.map((claim) => claim.claimId)).toEqual(["c1"]);
  });

  it("fails closed on an unknown local bet reference", async () => {
    const fake = adapters();
    const semantic = {
      ...semanticJudgment(["affordability"]),
      materialBets: betMap().materialBets
    };
    Object.assign(
      semantic.strategyEvaluations.find((entry) => entry.strategyId === "affordability")!,
      { betRefs: [2] }
    );
    fake.strong = vi.fn<HowItWinsJudgeAdapter>(async (request) => {
      if (request.stage !== "global_judge") throw new Error(`unexpected stage ${request.stage}`);
      return {
        ok: true,
        output: semantic,
        trace: trace(request, "fake-strong")
      };
    });

    await expect(makeJudge(fake, { scopes: [] })(judgeInput()))
      .rejects.toThrow(/unknown local bet 2/i);
  });

  it("rejects model-authored durable claim and bet identifiers", async () => {
    const fake = adapters();
    const semantic = {
      ...semanticJudgment([]),
      materialBets: betMap().materialBets,
      claims: [{ claimId: "c99", type: "observed_fact", text: "Invented registry", evidenceIds: ["e1"] }]
    };
    fake.strong = vi.fn<HowItWinsJudgeAdapter>(async (request) => ({
      ok: true,
      output: semantic,
      trace: trace(request, "fake-strong")
    }));

    await expect(makeJudge(fake, { scopes: [] })(judgeInput())).rejects.toThrow();
  });

  it("ignores null-only extra transport fields without weakening required judgment fields", async () => {
    const fake = adapters();
    const semantic = semanticJudgment(["affordability"]);
    const selected = semantic.strategyEvaluations.find((entry) => entry.strategyId === "affordability")!;
    (selected as unknown as Record<string, unknown>).reason = null;
    fake.strong = vi.fn<HowItWinsJudgeAdapter>(async (request) => {
      if (request.stage !== "global_judge") throw new Error(`unexpected stage ${request.stage}`);
      return {
        ok: true,
        output: { ...semantic, materialBets: betMap().materialBets },
        trace: trace(request, "fake-strong")
      };
    });

    const result = await makeJudge(fake, { scopes: [] })(judgeInput());
    expect(result.currentStrategyIds).toEqual(["affordability"]);
  });

  it("still rejects extra semantic content", async () => {
    const fake = adapters();
    const semantic = semanticJudgment(["affordability"]);
    const selected = semantic.strategyEvaluations.find((entry) => entry.strategyId === "affordability")!;
    (selected as unknown as Record<string, unknown>).reason = "A second competing judgment reason.";
    fake.strong = vi.fn<HowItWinsJudgeAdapter>(async (request) => {
      if (request.stage !== "global_judge") throw new Error(`unexpected stage ${request.stage}`);
      return {
        ok: true,
        output: { ...semantic, materialBets: betMap().materialBets },
        trace: trace(request, "fake-strong")
      };
    });

    await expect(makeJudge(fake, { scopes: [] })(judgeInput()))
      .rejects.toThrow(/reason/i);
  });

  it("gives group scouts the settled cross-group sibling distinctions", async () => {
    const fake = adapters();
    const judge = makeJudge(fake);

    await judge(judgeInput());

    const accumulationCall = (fake.scout as ReturnType<typeof vi.fn>).mock.calls
      .map(([request]) => request)
      .find((request) => request.groupId === "accumulation");
    const payload = accumulationCall?.payload as { siblingRubric: Array<{ strategyId: string }> };
    expect(payload.siblingRubric.map((entry) => entry.strategyId)).toContain("reliability");
  });

  it("gives the global judge the exact sibling distinctions validation will require", async () => {
    const fake = adapters();
    const judge = makeJudge(fake);

    await judge(judgeInput());

    const globalCall = (fake.strong as ReturnType<typeof vi.fn>).mock.calls
      .map(([request]) => request)
      .find((request) => request.stage === "global_judge");
    const payload = globalCall?.payload as {
      requiredSiblingIdsByStrategy: Partial<Record<HowItWinsStrategyId, HowItWinsStrategyId[]>>;
    };
    expect(payload.requiredSiblingIdsByStrategy.usership).toContain("reliability");
  });

  it("keeps monolith, four-bundle, and thirteen-group scopes behind the same interface", async () => {
    const cases: Array<{ scopes?: HowItWinsJudgeScope[]; calls: number }> = [
      { scopes: [], calls: 2 },
      { scopes: howItWinsFourBundleScopes(), calls: 7 },
      { calls: 16 }
    ];
    for (const testCase of cases) {
      const fake = adapters();
      const result = await makeJudge(fake, testCase.scopes ? { scopes: testCase.scopes } : {})(judgeInput());
      expect(result.calls).toHaveLength(testCase.calls);
    }
  });

  it("freezes four complete bundles without duplicating a canonical strategy", () => {
    expect(HOW_IT_WINS_FOUR_BUNDLES.map((bundle) => bundle.strategies.length)).toEqual([21, 19, 19, 21]);
    const ids = HOW_IT_WINS_FOUR_BUNDLES.flatMap((bundle) => bundle.strategies.map((strategy) => strategy.id));
    expect(ids).toHaveLength(80);
    expect(new Set(ids).size).toBe(80);
    expect(new Set(ids)).toEqual(new Set(HOW_IT_WINS_STRATEGIES.map((strategy) => strategy.id)));
  });

  it("launches all 13 scouts concurrently without exceeding the bound", async () => {
    let active = 0;
    let maxActive = 0;
    let launched = 0;
    const fake = adapters({
      onRequest: async (request) => {
        if (request.stage !== "group_scout") return;
        active += 1;
        launched += 1;
        maxActive = Math.max(maxActive, active);
        await new Promise<void>((resolve) => queueMicrotask(resolve));
        active -= 1;
      }
    });
    const judge = makeJudge(fake, { maxScoutConcurrency: 4 });

    await judge(judgeInput());

    expect(launched).toBe(13);
    expect(maxActive).toBeGreaterThan(1);
    expect(maxActive).toBeLessThanOrEqual(4);
  });

  it("retries a missing scout once", async () => {
    let failures = 0;
    const fake = adapters({
      scoutFailure: (request) => {
        if (request.groupId !== "price" || failures > 0) return false;
        failures += 1;
        return true;
      }
    });
    const judge = makeJudge(fake);

    const result = await judge(judgeInput());

    const strategyIds = result.strategyEvaluations.map((entry) => entry.strategyId);
    expect(strategyIds).toEqual(HOW_IT_WINS_STRATEGIES.map((entry) => entry.id));
    expect(new Set(strategyIds).size).toBe(80);
    expect((fake.scout as ReturnType<typeof vi.fn>).mock.calls.filter(([request]) => request.groupId === "price")).toHaveLength(2);
  });

  it("retries malformed scout output once and does not retry a nonretryable scout failure", async () => {
    const malformed = adapters();
    const originalMalformed = malformed.scout;
    let malformedOnce = false;
    malformed.scout = vi.fn<HowItWinsJudgeAdapter>(async (request) => {
      if (request.groupId === "price" && !malformedOnce) {
        malformedOnce = true;
        return { ok: true, output: { scopeId: "price" }, trace: trace(request, "fake-scout") };
      }
      return originalMalformed(request);
    });
    await makeJudge(malformed)(judgeInput());
    expect(malformed.scout.mock.calls.filter(([request]) => request.groupId === "price")).toHaveLength(2);

    const permanent = adapters();
    const originalPermanent = permanent.scout;
    permanent.scout = vi.fn<HowItWinsJudgeAdapter>(async (request) => {
      if (request.groupId === "price") {
        return {
          ok: false,
          error: "permanent request failure",
          retryable: false,
          trace: trace(request, "fake-scout", "failed")
        };
      }
      return originalPermanent(request);
    });
    await makeJudge(permanent)(judgeInput());
    expect(permanent.scout.mock.calls.filter(([request]) => request.groupId === "price")).toHaveLength(1);
  });

  it("lets the global judge cover a scout that failed twice", async () => {
    const fake = adapters({ scoutFailure: (request) => request.groupId === "price" });
    const judge = makeJudge(fake);

    const result = await judge(judgeInput());

    expect(result.strategyEvaluations).toHaveLength(80);
    expect(result.calls.filter((call) => call.groupId === "price")).toHaveLength(2);
  });

  it("skips strong adjudication when the critic finds no material dispute", async () => {
    const fake = adapters();
    const judge = makeJudge(fake);

    await judge(judgeInput());

    const strongStages = (fake.strong as ReturnType<typeof vi.fn>).mock.calls.map(([request]) => request.stage);
    expect(strongStages).toEqual(["bet_map", "global_judge"]);
  });

  it("runs one targeted adjudication for a material dispute", async () => {
    const fake = adapters({
      criticFindings: [
        {
          findingId: "f1",
          kind: "strategy",
          material: true,
          summary: "Usership may have been missed.",
          strategyIds: ["usership"],
          evidenceIds: ["e1"]
        }
      ]
    });
    const judge = makeJudge(fake);

    await judge(judgeInput());

    const strongStages = (fake.strong as ReturnType<typeof vi.fn>).mock.calls.map(([request]) => request.stage);
    expect(strongStages).toEqual(["bet_map", "global_judge", "adjudication"]);
  });

  it("retries each transient strong stage once with distinct traced call ids", async () => {
    for (const stage of ["bet_map", "global_judge", "critic", "adjudication"] as const) {
      const needsAdjudication = stage === "adjudication";
      const fake = adapters({
        ...(needsAdjudication
          ? {
            criticFindings: [{
              findingId: "f1",
              kind: "strategy",
              material: true,
              summary: "A material fixture dispute.",
              strategyIds: ["usership"],
              evidenceIds: ["e1"]
            }]
          }
          : {})
      });
      const target = stage === "critic" ? fake.critic : fake.strong;
      let failed = false;
      const wrapped = vi.fn<HowItWinsJudgeAdapter>(async (request) => {
        if (request.stage === stage && !failed) {
          failed = true;
          return {
            ok: false,
            error: "transient connection failure",
            retryable: true,
            trace: trace(request, stage === "critic" ? "fake-critic" : "fake-strong", "failed")
          };
        }
        return target(request);
      });
      if (stage === "critic") fake.critic = wrapped;
      else fake.strong = wrapped;

      const result = await makeJudge(fake)(judgeInput());
      const attempts = result.calls.filter((call) => call.stage === stage);
      expect(attempts).toHaveLength(2);
      expect(new Set(attempts.map((call) => call.callId)).size).toBe(2);
      expect(attempts.map((call) => call.retryCount)).toEqual([0, 1]);
      expect(attempts.map((call) => call.outcome)).toEqual(["failed", "ok"]);
    }
  });

  it("passes structured-output correction feedback into the single retry", async () => {
    const fake = adapters();
    const original = fake.strong;
    let failed = false;
    fake.strong = vi.fn<HowItWinsJudgeAdapter>(async (request) => {
      if (request.stage === "global_judge" && !failed) {
        failed = true;
        return {
          ok: false,
          error: "output.betRefs contains unknown local bet reference 2",
          retryable: true,
          repairInstruction: "Use only local bet reference 1 and return the complete result.",
          trace: trace(request, "fake-strong", "failed")
        };
      }
      return original(request);
    });

    await makeJudge(fake)(judgeInput());

    const globalCalls = fake.strong.mock.calls
      .map(([request]) => request)
      .filter((request) => request.stage === "global_judge");
    expect(globalCalls).toHaveLength(2);
    expect(globalCalls[1]?.payload).toMatchObject({
      retryCorrection: "Use only local bet reference 1 and return the complete result."
    });
  });

  it("stops closed after two transient failures and does not retry semantic failures", async () => {
    const twice = adapters();
    twice.strong = vi.fn<HowItWinsJudgeAdapter>(async (request) => ({
      ok: false,
      error: "transient timeout",
      retryable: true,
      trace: trace(request, "fake-strong", "failed")
    }));
    await expect(makeJudge(twice)(judgeInput())).rejects.toThrow(/failed closed/i);
    expect(twice.strong).toHaveBeenCalledTimes(2);

    const nonretryable = adapters();
    nonretryable.strong = vi.fn<HowItWinsJudgeAdapter>(async (request) => ({
      ok: false,
      error: "request contract failure",
      retryable: false,
      trace: trace(request, "fake-strong", "failed")
    }));
    await expect(makeJudge(nonretryable)(judgeInput())).rejects.toThrow(/failed closed/i);
    expect(nonretryable.strong).toHaveBeenCalledTimes(1);

    const semantic = adapters();
    const original = semantic.strong;
    semantic.strong = vi.fn<HowItWinsJudgeAdapter>(async (request) => {
      if (request.stage === "global_judge") {
        return { ok: true, output: { judgment: "invalid" }, trace: trace(request, "fake-strong") };
      }
      return original(request);
    });
    await expect(makeJudge(semantic)(judgeInput())).rejects.toThrow();
    expect(semantic.strong.mock.calls.filter(([request]) => request.stage === "global_judge")).toHaveLength(1);
  });

  it("carries the frozen bet map forward when a multi-stage judge does not revise it", async () => {
    const changed = body();
    changed.materialBets = [{
      ...changed.materialBets[0]!,
      betId: "b2",
      statement: "A different fixture bet.",
      scopeReasons: ["The global stage rewrote a frozen scope reason."]
    }];
    const result = await makeJudge(adapters({ judgment: changed }))(judgeInput());
    expect(hashHowItWinsJudgeValue(result.materialBets)).toBe(hashHowItWinsJudgeValue(body().materialBets));
    expect(result.materialBets).toEqual(body().materialBets);
  });

  it("accepts only an explicit cited bet revision and records one override", async () => {
    const changed = body();
    changed.materialBets = [{
      ...changed.materialBets[0]!,
      betId: "b2",
      statement: "A revised fixture bet."
    }];

    const revised = await makeJudge(adapters({
      judgment: changed,
      betRevision: {
        materialBets: changed.materialBets,
        reason: "The cited evidence changes the material scope.",
        evidenceIds: ["e1"]
      }
    }))(judgeInput());
    expect(revised.materialBets).toEqual(changed.materialBets.map((bet, index) => ({
      ...bet,
      betId: `b${index + 1}`
    })));
    expect(revised.overrides.filter((entry) => entry.kind === "bet")).toEqual([
      expect.objectContaining({
        reason: "The cited evidence changes the material scope.",
        evidenceIds: ["e1"]
      })
    ]);

    await expect(makeJudge(adapters({
      judgment: changed,
      betRevision: { materialBets: changed.materialBets, evidenceIds: ["e1"] }
    }))(judgeInput())).rejects.toThrow();
    await expect(makeJudge(adapters({
      judgment: changed,
      betRevision: {
        materialBets: changed.materialBets,
        reason: "The evidence changes the material scope.",
        evidenceIds: ["unknown"]
      }
    }))(judgeInput())).rejects.toThrow(/unknown evidence id/i);
  });

  it("still requires a monolith to produce material bets", async () => {
    const fake = adapters();
    const original = fake.strong;
    fake.strong = vi.fn<HowItWinsJudgeAdapter>(async (request) => {
      const result = await original(request);
      if (request.stage !== "global_judge" || !result.ok) return result;
      const output = result.output as Record<string, unknown>;
      const { materialBets: _materialBets, ...withoutMaterialBets } = output;
      return { ...result, output: withoutMaterialBets };
    });

    await expect(makeJudge(fake, { scopes: [] })(judgeInput())).rejects.toThrow();
  });

  it("requires a cited reason when the global judge overturns a scout", async () => {
    const fake = adapters();
    fake.scout = vi.fn<HowItWinsJudgeAdapter>(async (request) => {
      const output = scoutOutput(request);
      if (request.groupId === "accumulation") {
        output.evaluations[0] = {
          ...output.evaluations[0]!,
          recommendation: "supported",
          mechanism: "More users increase utility.",
          evidenceIds: ["e1"]
        };
      }
      return { ok: true, output, trace: trace(request, "fake-scout") };
    });
    const judge = makeJudge(fake);

    await expect(judge(judgeInput())).rejects.toThrow(/override/i);

    const withOverride = body();
    withOverride.overrides.push({
      kind: "strategy",
      strategyId: "usership",
      from: "supported",
      to: "insufficient_evidence",
      reason: "The cited usage does not show that one user's participation helps another user.",
      evidenceIds: ["e1"]
    });
    const passing = adapters({ judgment: withOverride });
    passing.scout = fake.scout;
    await expect(makeJudge(passing)(judgeInput())).resolves.toMatchObject({
      overrides: [expect.objectContaining({ strategyId: "usership" })]
    });
  });

  it("refuses a same-provider critic at construction, before any paid call", () => {
    const fake = adapters();
    expect(() => createHowItWinsJudge({
      adapters: fake,
      rules,
      providers: { strong: "anthropic", critic: "anthropic" }
    })).toThrow(/different provider/i);
    expect(fake.strong).not.toHaveBeenCalled();
    expect(() => createHowItWinsJudge({
      adapters: fake,
      rules,
      providers: { strong: "anthropic", critic: "deepseek" }
    })).not.toThrow();
  });

  it("keeps the global judgment when the critic call fails", async () => {
    const fake = adapters();
    fake.critic = vi.fn<HowItWinsJudgeAdapter>(async (request) => ({
      ok: false,
      error: "critic request contract failure",
      retryable: false,
      trace: trace(request, "fake-critic", "failed")
    }));

    const result = await makeJudge(fake)(judgeInput());

    expect(result.currentStrategyIds).toEqual([]);
    expect(result.refinement).toMatchObject({ critic: "failed", adjudication: "not_needed" });
    expect(result.refinement?.notes.join(" ")).toMatch(/critic call failed/i);
    expect(fake.strong.mock.calls.map(([request]) => request.stage)).toEqual(["bet_map", "global_judge"]);
  });

  it("keeps the global judgment when critic output fails its schema", async () => {
    const fake = adapters();
    fake.critic = vi.fn<HowItWinsJudgeAdapter>(async (request) => ({
      ok: true,
      output: { findings: [{ kind: "invented_kind", material: true }] },
      trace: trace(request, "fake-critic")
    }));

    const result = await makeJudge(fake)(judgeInput());

    expect(result.refinement).toMatchObject({ critic: "failed", adjudication: "not_needed" });
    expect(result.disagreements).toEqual([]);
  });

  it("skips a critic that answered on the global judge's own provider", async () => {
    const fake = adapters({
      criticFindings: [{
        findingId: "f1",
        kind: "strategy",
        material: true,
        summary: "Usership may have been missed.",
        strategyIds: ["usership"],
        evidenceIds: ["e1"]
      }]
    });
    const original = fake.critic;
    fake.critic = vi.fn<HowItWinsJudgeAdapter>(async (request) => {
      const result = await original(request);
      return { ...result, trace: trace(request, "fake-strong") };
    });

    const result = await makeJudge(fake)(judgeInput());

    expect(result.refinement).toMatchObject({ critic: "skipped_same_provider", adjudication: "not_needed" });
    expect(result.disagreements).toEqual([]);
    expect(fake.strong.mock.calls.map(([request]) => request.stage)).toEqual(["bet_map", "global_judge"]);
  });

  it("keeps the global judgment when the adjudication call fails", async () => {
    const fake = adapters({
      criticFindings: [{
        findingId: "f1",
        kind: "strategy",
        material: true,
        summary: "Usership may have been missed.",
        strategyIds: ["usership"],
        evidenceIds: ["e1"]
      }]
    });
    const original = fake.strong;
    fake.strong = vi.fn<HowItWinsJudgeAdapter>(async (request) => {
      if (request.stage !== "adjudication") return original(request);
      return {
        ok: false,
        error: "adjudication request contract failure",
        retryable: false,
        trace: trace(request, "fake-strong", "failed")
      };
    });

    const result = await makeJudge(fake)(judgeInput());

    expect(result.currentStrategyIds).toEqual([]);
    expect(result.refinement).toMatchObject({ adjudication: "failed" });
    expect(result.refinement?.notes.join(" ")).toMatch(/adjudication call failed/i);
    expect(result.disagreements.map((entry) => entry.disagreementId)).toEqual(["f1"]);
  });

  it("drops an adjudication row for a strategy nobody disputed", async () => {
    const fake = adapters({
      adjudicated: body(["affordability"]),
      adjudicationRowIds: ["affordability"],
      criticFindings: [{
        findingId: "f1",
        kind: "strategy",
        material: true,
        summary: "Usership may have been missed.",
        strategyIds: ["usership"],
        evidenceIds: ["e1"]
      }]
    });

    const result = await makeJudge(fake)(judgeInput());

    expect(result.currentStrategyIds).toEqual([]);
    expect(result.refinement).toMatchObject({ adjudication: "ok" });
    expect(result.refinement?.notes.join(" ")).toMatch(/undisputed strategy affordability/i);
  });

  it("merges a two-row adjudication patch and leaves every other row exactly as it was", async () => {
    // None of the three owes a sibling distinction, so the repair pass leaves each one current.
    // Cloning sits ahead of both disputed strategies in canonical order, so an untouched row
    // that carries a claim keeps its claim id through the merge.
    const disputed: HowItWinsStrategyId[] = ["affordability", "durability"];
    const findings = [{
      findingId: "f1",
      kind: "strategy",
      material: true,
      summary: "Two mechanisms may have been missed.",
      strategyIds: disputed,
      evidenceIds: ["e1"]
    }];
    const settledBody = body(["cloning"], ["reliability"]);
    const settled = await makeJudge(adapters({ judgment: settledBody }), { scopes: [] })(judgeInput());
    const result = await makeJudge(adapters({
      judgment: settledBody,
      adjudicated: body(["cloning", ...disputed], ["reliability"]),
      criticFindings: findings
    }), { scopes: [] })(judgeInput());

    expect(result.refinement).toMatchObject({ adjudication: "ok" });
    expect(result.currentStrategyIds).toEqual(["cloning", ...disputed]);
    const untouched = (rows: typeof result.strategyEvaluations) =>
      rows.filter((row) => !disputed.includes(row.strategyId));
    expect(untouched(result.strategyEvaluations)).toEqual(untouched(settled.strategyEvaluations));
    expect(untouched(result.strategyEvaluations)).toHaveLength(HOW_IT_WINS_STRATEGIES.length - 2);
    expect(untouched(result.strategyEvaluations).find((row) => row.strategyId === "cloning"))
      .toMatchObject({ disposition: "current", claimIds: ["c1"] });
    expect(untouched(result.strategyEvaluations).find((row) => row.strategyId === "reliability"))
      .toMatchObject({ presentRelevance: "historical_only", historicalEvidenceIds: ["e1"] });
  });

  it("puts undisputed current strategies back in order instead of rejecting the patch", async () => {
    const fake = adapters({
      judgment: body(["cloning", "affordability", "durability"]),
      adjudicationCurrentIds: ["affordability", "cloning", "durability"],
      criticFindings: [{
        findingId: "f1",
        kind: "strategy",
        material: true,
        summary: "Durability may have been missed.",
        strategyIds: ["durability"],
        evidenceIds: ["e1"]
      }]
    });

    const result = await makeJudge(fake, { scopes: [] })(judgeInput());

    expect(result.refinement).toMatchObject({ adjudication: "ok" });
    expect(result.currentStrategyIds).toEqual(["cloning", "affordability", "durability"]);
    expect(result.refinement?.notes.join(" ")).toMatch(/settled order was restored/i);
  });

  it("keeps the settled judgment when the patch changes no row at all", async () => {
    const fake = adapters({
      judgment: body(["cloning"]),
      adjudicationRowIds: [],
      criticFindings: [{
        findingId: "f1",
        kind: "evidence",
        material: true,
        summary: "One citation may not carry the mechanism.",
        strategyIds: ["cloning"],
        evidenceIds: ["e1"]
      }]
    });

    const result = await makeJudge(fake, { scopes: [] })(judgeInput());

    expect(result.refinement).toMatchObject({ adjudication: "ok" });
    expect(result.refinement?.notes).toEqual([]);
    expect(result.currentStrategyIds).toEqual(["cloning"]);
  });

  it("ignores an adjudication pair that no material dispute named", async () => {
    const fake = adapters({
      judgment: body(["cloning", "affordability"]),
      adjudicationPair: {
        strategyIds: ["cloning", "affordability"],
        referenceClass: "Companies selling the same buyer.",
        normalChoice: "The reference class picks one of the two.",
        excludedAlternative: "Running both at once.",
        acceptedCost: "Slower coverage of either mechanism.",
        interaction: "Each mechanism makes the other cheaper to run.",
        copyingDifficulty: "A copy has to accept both costs together.",
        evidenceIds: ["e1"]
      },
      criticFindings: [{
        findingId: "f1",
        kind: "strategy",
        material: true,
        summary: "Affordability may have been missed.",
        strategyIds: ["affordability"],
        evidenceIds: ["e1"]
      }]
    });

    const result = await makeJudge(fake, { scopes: [] })(judgeInput());

    expect(result.currentStrategyIds).toEqual(["cloning", "affordability"]);
    expect(result.unusualPair).toBeNull();
    expect(result.refinement).toMatchObject({ adjudication: "ok" });
    expect(result.refinement?.notes.join(" ")).toMatch(/no material dispute named the pair/i);
  });

  it("re-asks the global judge exactly once when its answer breaks the contract", async () => {
    const fake = adapters();
    const original = fake.strong;
    let globalCalls = 0;
    fake.strong = vi.fn<HowItWinsJudgeAdapter>(async (request) => {
      const result = await original(request);
      if (request.stage !== "global_judge" || !result.ok) return result;
      globalCalls += 1;
      if (globalCalls > 1) return result;
      const { materialBets: _materialBets, ...withoutMaterialBets } = result.output as Record<string, unknown>;
      return { ...result, output: withoutMaterialBets };
    });

    const result = await makeJudge(fake, { scopes: [] })(judgeInput());

    const globalRequests = fake.strong.mock.calls
      .map(([request]) => request)
      .filter((request) => request.stage === "global_judge");
    expect(globalRequests).toHaveLength(2);
    expect(globalRequests[1]?.payload).toMatchObject({
      retryCorrection: expect.stringMatching(/monolith judgment requires material bets/i)
    });
    expect(new Set(result.calls.map((call) => call.callId)).size).toBe(result.calls.length);
    expect(result.refinement?.notes.join(" ")).toMatch(/global judgment repaired after/i);
  });

  it("repairs a contradictory not-yet row in code instead of buying a re-ask", async () => {
    const contradictory = body();
    contradictory.strategyEvaluations = contradictory.strategyEvaluations.map((entry) => entry.strategyId === "aggregation"
      ? {
        ...current("aggregation"),
        disposition: "not_yet" as const,
        presentRelevance: "current" as const,
        notYet: {
          precursorEvidenceIds: ["e1"],
          causalPath: "The cited proof is the step before the mechanism starts changing buyer choice.",
          missingCondition: "A buyer still has to choose on this mechanism.",
          promotionEvidence: "A named buyer citing the mechanism.",
          horizonMonths: 18
        }
      }
      : entry);
    const fake = adapters({ judgment: contradictory });

    const result = await makeJudge(fake, { scopes: [] })(judgeInput());

    expect(fake.strong).toHaveBeenCalledTimes(1);
    expect(result.refinement?.repairs).toHaveLength(1);
    expect(result.refinement?.repairs[0]).toMatch(/aggregation/);
    expect(result.refinement?.notes).toEqual([]);
    expect(result.strategyEvaluations.find((entry) => entry.strategyId === "aggregation")).toMatchObject({
      disposition: "not_yet",
      presentRelevance: "unresolved"
    });
  });

  it("still buys one re-ask for a contradiction the repair pass cannot settle", async () => {
    const unrepairable = body();
    unrepairable.strategyEvaluations = unrepairable.strategyEvaluations.map((entry) => entry.strategyId === "aggregation"
      ? {
        ...current("aggregation"),
        disposition: "open_question" as const,
        dimensions: { ...passingDimensions(), centrality: "not_reached" as const }
      }
      : entry);
    const fake = adapters();
    const original = fake.strong;
    let globalCalls = 0;
    fake.strong = vi.fn<HowItWinsJudgeAdapter>(async (request) => {
      const result = await original(request);
      if (request.stage !== "global_judge" || !result.ok) return result;
      globalCalls += 1;
      if (globalCalls > 1) return result;
      return { ...result, output: semanticFromBody(unrepairable, true) };
    });

    const result = await makeJudge(fake, { scopes: [] })(judgeInput());

    const globalRequests = fake.strong.mock.calls
      .map(([request]) => request)
      .filter((request) => request.stage === "global_judge");
    expect(globalRequests).toHaveLength(2);
    expect(globalRequests[1]?.payload).toMatchObject({
      retryCorrection: expect.stringMatching(/strategyEvaluations.*dimension/i)
    });
    expect(result.refinement?.repairs).toEqual([]);
    expect(result.refinement?.notes.join(" ")).toMatch(/the judgment body is contradictory/i);
  });

  it("fails closed when the one global re-ask also breaks the contract", async () => {
    const fake = adapters();
    const original = fake.strong;
    fake.strong = vi.fn<HowItWinsJudgeAdapter>(async (request) => {
      const result = await original(request);
      if (request.stage !== "global_judge" || !result.ok) return result;
      const { materialBets: _materialBets, ...withoutMaterialBets } = result.output as Record<string, unknown>;
      return { ...result, output: withoutMaterialBets };
    });

    await expect(makeJudge(fake, { scopes: [] })(judgeInput())).rejects.toThrow(/material bets/i);
    expect(fake.strong.mock.calls.filter(([request]) => request.stage === "global_judge")).toHaveLength(2);
  });

  it("accepts a compact rejected row whose evidence gate passed", async () => {
    const fake = adapters();
    const semantic = semanticJudgment(["affordability"]);
    // The gate is what the evidence supported. The disposition is still a rejection, so the row
    // stays four fields and nothing downstream asks it for a mechanism or a sibling resolution.
    const rejected = semantic.strategyEvaluations.find((entry) => entry.strategyId === "usership")!;
    Object.assign(rejected, { disposition: "rejected", evidenceGate: "pass" });
    fake.strong = vi.fn<HowItWinsJudgeAdapter>(async (request) => {
      if (request.stage !== "global_judge") throw new Error(`unexpected stage ${request.stage}`);
      return {
        ok: true,
        output: { ...semantic, materialBets: betMap().materialBets },
        trace: trace(request, "fake-strong")
      };
    });

    const result = await makeJudge(fake, { scopes: [] })(judgeInput());

    expect(result.currentStrategyIds).toEqual(["affordability"]);
    expect(result.strategyEvaluations.find((entry) => entry.strategyId === "usership")).toMatchObject({
      disposition: "rejected",
      evidenceGate: "pass",
      mechanism: null,
      evidenceIds: [],
      siblingResolutions: [],
      dimensions: {
        evidenceStrength: "not_reached",
        centrality: "not_reached",
        explanatoryValue: "not_reached"
      }
    });
  });

  it("demands a sibling resolution from a full row and never from a compact one", async () => {
    const monolith = (semantic: ReturnType<typeof semanticJudgment>) => {
      const fake = adapters();
      fake.strong = vi.fn<HowItWinsJudgeAdapter>(async (request) => {
        if (request.stage !== "global_judge") throw new Error(`unexpected stage ${request.stage}`);
        return {
          ok: true,
          output: { ...semantic, materialBets: betMap().materialBets },
          trace: trace(request, "fake-strong")
        };
      });
      return makeJudge(fake, { scopes: [] })(judgeInput());
    };

    // usership must be distinguished from reliability. A current row that skips it is no longer a
    // failure: the repair pass downgrades it to an open question and records why, so the verdict
    // survives with an empty current set instead of failing closed.
    const downgraded = await monolith(semanticJudgment(["usership"]));
    expect(downgraded.currentStrategyIds).toEqual([]);
    expect(downgraded.strategyEvaluations.find((entry) => entry.strategyId === "usership")?.disposition).toBe("open_question");
    expect(downgraded.refinement?.repairs.join(" ")).toMatch(/usership/);

    // The same missing distinction is not a failure once usership is a compact rejection: a row
    // with no mechanism has nothing to distinguish.
    const compact = semanticJudgment(["affordability"]);
    Object.assign(
      compact.strategyEvaluations.find((entry) => entry.strategyId === "usership")!,
      { disposition: "rejected", evidenceGate: "unresolved" }
    );
    await expect(monolith(compact)).resolves.toMatchObject({ currentStrategyIds: ["affordability"] });
  });

  it("retains complete per-call telemetry without a provider call", async () => {
    const telemetry = vi.fn();
    const fake = adapters();
    const result = await makeJudge(fake, { telemetry })(judgeInput());

    expect(result.calls).toHaveLength(16);
    expect(telemetry).toHaveBeenCalledTimes(16);
    for (const call of result.calls) {
      expect(call).toMatchObject({
        provider: expect.any(String),
        model: expect.any(String),
        inputTokens: expect.any(Number),
        outputTokens: expect.any(Number),
        cacheCreationInputTokens: expect.any(Number),
        cacheReadInputTokens: expect.any(Number),
        latencyMs: expect.any(Number),
        retryCount: expect.any(Number),
        thinkingState: expect.any(String),
        outcome: expect.any(String)
      });
      expect(call.actualCostUsd !== null || call.estimatedCostUsd !== null).toBe(true);
    }
  });
});

describe("parseFrozenHowItWinsWriterDraft", () => {
  function verdict(currentIds: HowItWinsStrategyId[] = ["usership", "aggregation", "reliability"]) {
    const audit = body(currentIds);
    return {
      version: 1 as const,
      hashes: {
        evidencePacket: "a".repeat(64),
        prompt: "b".repeat(64),
        vocabulary: "c".repeat(64)
      },
      ...audit,
      calls: [
        {
          callId: "global-1",
          stage: "global_judge" as const,
          provider: "fake-strong",
          model: "fake-model",
          inputTokens: 10,
          outputTokens: 20,
          cacheCreationInputTokens: 0,
          cacheReadInputTokens: 0,
          actualCostUsd: null,
          estimatedCostUsd: 0,
          latencyMs: 1,
          retryCount: 0,
          thinkingState: "unknown" as const,
          outcome: "ok" as const
        }
      ]
    };
  }

  function draft(strategyIds: string[] = ["usership", "aggregation", "reliability"]) {
    return JSON.stringify({
      status: "read",
      sentence: "Fixture Company wins through three current mechanisms.",
      current: strategyIds.map((strategyId) => ({
        strategy: strategyId,
        note: `Fixture Company uses ${strategyId} in its current bet [e1].`
      })),
      pair: null,
      not_yet: [],
      in_question: [],
      wrong_if: "The mechanisms stop affecting buyer choice."
    });
  }

  it("accepts an exact frozen verdict", () => {
    const request = frozenHowItWinsWriterRequest(verdict());
    expect(request.payload.current.map((entry) => entry.strategy)).toEqual([
      "usership",
      "aggregation",
      "reliability"
    ]);
    expect(request.payload.current.every((entry) => entry.meaning.length > 0)).toBe(true);

    const parsed = parseFrozenHowItWinsWriterDraft(draft(), verdict());
    expect("read" in parsed).toBe(true);
    if ("read" in parsed && parsed.read.status === "read") {
      expect(parsed.read.current.map((entry) => entry.strategy)).toEqual(["usership", "aggregation", "reliability"]);
    }
  });

  it("accepts a markdown-fenced JSON draft", () => {
    const parsed = parseFrozenHowItWinsWriterDraft(`\`\`\`json\n${draft()}\n\`\`\``, verdict());
    expect("read" in parsed).toBe(true);
  });

  it("rejects added, removed, swapped, and reordered labels", () => {
    expect(parseFrozenHowItWinsWriterDraft(draft(["usership", "aggregation", "reliability", "precision"]), verdict())).toHaveProperty("issues");
    expect(parseFrozenHowItWinsWriterDraft(draft(["usership", "aggregation"]), verdict())).toHaveProperty("issues");
    expect(parseFrozenHowItWinsWriterDraft(draft(["usership", "aggregation", "precision"]), verdict())).toHaveProperty("issues");
    expect(parseFrozenHowItWinsWriterDraft(draft(["reliability", "aggregation", "usership"]), verdict())).toHaveProperty("issues");
  });

  it("carries every approved current strategy onto the display, up to six", () => {
    const parsed = parseFrozenHowItWinsWriterDraft(draft(), verdict());
    expect("read" in parsed).toBe(true);
    if (!("read" in parsed) || parsed.read.status !== "read") throw new Error("expected a frozen read");
    const display = howItWinsFromFrozenWriter(parsed.read);
    expect(display.status).toBe("read");
    if (display.status !== "read") throw new Error("expected a display read");
    expect(display.running.map((entry) => entry.strategy)).toEqual(["usership", "aggregation", "reliability"]);
    expect(display.running.every((entry) => entry.meaning.length > 0)).toBe(true);

    const six: HowItWinsStrategyId[] = ["usership", "aggregation", "reliability", "precision", "curation", "secrecy"];
    const sixParsed = parseFrozenHowItWinsWriterDraft(draft(six), verdict(six));
    if (!("read" in sixParsed) || sixParsed.read.status !== "read") throw new Error("expected a frozen read");
    const sixDisplay = howItWinsFromFrozenWriter(sixParsed.read);
    if (sixDisplay.status !== "read") throw new Error("expected a display read");
    expect(sixDisplay.running.map((entry) => entry.strategy)).toEqual(six);
  });

  it("trims a seventh approved current strategy at the display cap", () => {
    const seven: HowItWinsStrategyId[] = [
      "usership", "aggregation", "reliability", "precision", "curation", "secrecy", "rarity"
    ];
    const parsed = parseFrozenHowItWinsWriterDraft(draft(seven), verdict(seven));
    if (!("read" in parsed) || parsed.read.status !== "read") throw new Error("expected a frozen read");
    const display = howItWinsFromFrozenWriter(parsed.read);
    if (display.status !== "read") throw new Error("expected a display read");
    expect(display.running.map((entry) => entry.strategy)).toEqual(seven.slice(0, 6));
  });

  it("accepts nothing_stands_out only when no current strategy was approved", () => {
    const nothing = verdict([]);
    const nothingDraft = JSON.stringify({
      status: "nothing_stands_out",
      sentence: "Nothing stands out yet for Fixture Company.",
      current: [],
      pair: null,
      not_yet: [],
      in_question: [],
      wrong_if: "A current mechanism appears."
    });
    const parsed = parseFrozenHowItWinsWriterDraft(nothingDraft, nothing);
    expect("read" in parsed).toBe(true);
    if (!("read" in parsed) || parsed.read.status !== "nothing_stands_out") {
      throw new Error("expected a nothing_stands_out read");
    }
    expect(parsed.read.sentence).toBe("Nothing stands out yet for Fixture Company.");

    expect(parseFrozenHowItWinsWriterDraft(nothingDraft, verdict(["usership"]))).toEqual({
      issues: ["a supported verdict cannot become nothing_stands_out"]
    });
  });

  it("keeps a single approved current strategy as a read without changing the stored verdict", () => {
    const frozen = verdict();
    const one = verdict(["usership"]);
    const parsed = parseFrozenHowItWinsWriterDraft(draft(["usership"]), one);
    expect("read" in parsed).toBe(true);
    if (!("read" in parsed) || parsed.read.status !== "read") throw new Error("expected a frozen read");
    const display = howItWinsFromFrozenWriter(parsed.read);
    expect(display.status).toBe("read");
    if (display.status !== "read") throw new Error("expected a display read");
    expect(display.running.map((entry) => entry.strategy)).toEqual(["usership"]);
    expect(display.pair).toBeNull();
    expect(one.currentStrategyIds).toEqual(["usership"]);
    expect(frozen.currentStrategyIds).toEqual(["usership", "aggregation", "reliability"]);
  });

  it("files an approved in-question strategy without requiring citations", () => {
    const frozen = verdict();
    const withQuestion = {
      ...frozen,
      strategyEvaluations: frozen.strategyEvaluations.map((entry) =>
        entry.strategyId === "completeness"
          ? {
            ...entry,
            disposition: "open_question" as const,
            evidenceGate: "unresolved" as const,
            presentRelevance: "unresolved" as const,
            dispositionReason: "The record does not show whether completeness is current."
          }
          : entry
      )
    };
    const parsed = parseFrozenHowItWinsWriterDraft(
      JSON.stringify({
        status: "read",
        sentence: "Fixture Company wins through three current mechanisms.",
        current: ["usership", "aggregation", "reliability"].map((strategy) => ({
          strategy,
          note: `Fixture Company uses ${strategy} in its current bet [e1].`
        })),
        pair: null,
        not_yet: [],
        in_question: [{
          strategy: "completeness",
          note: "The filed record does not show whether buyers still need another tool for the same job."
        }],
        wrong_if: "The mechanisms stop affecting buyer choice."
      }),
      withQuestion
    );
    expect("read" in parsed).toBe(true);
    if (!("read" in parsed) || parsed.read.status !== "read") throw new Error("expected a frozen read");
    expect(parsed.read.inQuestion.map((entry) => entry.strategy)).toEqual(["completeness"]);
    const display = howItWinsFromFrozenWriter(parsed.read);
    expect(display.status).toBe("read");
    if (display.status !== "read") throw new Error("expected a display read");
    expect(display.inQuestion).toEqual([{
      strategy: "completeness",
      note: "The filed record does not show whether buyers still need another tool for the same job.",
      citationIds: []
    }]);
  });
});

describe("loadHowItWinsJudgeRules", () => {
  it("matches the authoritative spec files", () => {
    const specDir = resolve(dirname(fileURLToPath(import.meta.url)), "../../../docs/superpowers/specs");
    const fromDocs = parseHowItWinsJudgeRules({
      standard: readFileSync(resolve(specDir, "2026-08-21-how-it-wins-judgment-standard.md"), "utf8"),
      rubric: readFileSync(resolve(specDir, "2026-08-21-how-it-wins-strategy-rubric.md"), "utf8")
    });
    expect(loadHowItWinsJudgeRules()).toEqual(fromDocs);
    expect(fromDocs.strategyRubric).toHaveLength(HOW_IT_WINS_STRATEGIES.length);
  });
});
