import { describe, expect, it } from "vitest";

import {
  HOW_IT_WINS_STRATEGIES,
  failedStrategyEvaluation,
  howItWinsJudgmentSchema,
  howItWinsJudgmentSelection,
  howItWinsStrategyById,
  materializeSemanticJudgment,
  repairSemanticJudgment,
  semanticJudgmentForModel,
  semanticJudgmentSchema,
  type HowItWinsJudgment,
  type HowItWinsJudgmentBody,
  type HowItWinsStrategyEvaluation,
  type SemanticHowItWinsJudgment,
  type HowItWinsStrategyId
} from "../src";

const hash = "a".repeat(64);

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
  return failedStrategyEvaluation(strategyId, "The supplied evidence does not establish this mechanism.");
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

function judgment(currentIds: HowItWinsStrategyId[] = []): HowItWinsJudgment {
  const selected = new Set(currentIds);
  return {
    version: 1,
    hashes: { evidencePacket: hash, prompt: "b".repeat(64), vocabulary: "c".repeat(64) },
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
    strategyEvaluations: HOW_IT_WINS_STRATEGIES.map((strategy) =>
      selected.has(strategy.id) ? current(strategy.id) : evaluation(strategy.id)
    ),
    currentStrategyIds: currentIds,
    unusualPair: null,
    openQuestions: [],
    overallWrongCondition: {
      condition: "The current mechanism stops affecting buyer choice.",
      evidenceIds: ["e1"]
    },
    disagreements: [],
    overrides: [],
    calls: [
      {
        callId: "global-1",
        stage: "global_judge",
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
        thinkingState: "unknown",
        outcome: "ok"
      }
    ]
  };
}

function replaceEvaluation(
  input: HowItWinsJudgment,
  strategyId: HowItWinsStrategyId,
  next: HowItWinsStrategyEvaluation
) {
  input.strategyEvaluations = input.strategyEvaluations.map((entry) =>
    entry.strategyId === strategyId ? next : entry
  );
}

function fullRejectedEvaluation(strategyId: HowItWinsStrategyId): HowItWinsStrategyEvaluation {
  return {
    ...current(strategyId),
    disposition: "rejected",
    evidenceGate: "unresolved",
    presentRelevance: "historical_only",
    dispositionReason: "The mechanism is real but it does not change how buyers choose."
  };
}

function semanticRows(options: {
  current?: HowItWinsStrategyId;
  evidenceGate?: "pass" | "fail" | "unresolved";
  siblings?: HowItWinsStrategyId[];
}) {
  return HOW_IT_WINS_STRATEGIES.map((strategy) => strategy.id === options.current
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
      siblingCandidateIds: options.siblings ?? [],
      siblingResolutions: (options.siblings ?? []).map((siblingId) => ({
        strategyId: siblingId,
        reason: "The cited mechanism is the one this strategy names.",
        evidenceIds: ["e1"]
      })),
      notYet: null,
      dispositionReason: "The mechanism is current and material."
    }
    : {
      strategyId: strategy.id,
      disposition: "rejected" as const,
      evidenceGate: options.evidenceGate ?? "pass",
      dispositionReason: "The record does not put this mechanism in the buying decision."
    });
}

function materializeRows(options: Parameters<typeof semanticRows>[0] & {
  decidingQuestionFor?: (strategyId: HowItWinsStrategyId) => string | undefined;
}) {
  const base = judgment();
  return materializeSemanticJudgment({
    semantic: {
      strategyEvaluations: semanticRows(options),
      currentStrategyIds: options.current ? [options.current] : [],
      unusualPair: null,
      openQuestions: [],
      overallWrongCondition: base.overallWrongCondition,
      disagreements: [],
      overrides: []
    },
    materialBets: base.materialBets,
    evidenceCutoff: base.evidenceCutoff,
    evidenceRegistry: base.evidenceRegistry,
    ...(options.decidingQuestionFor ? { decidingQuestionFor: options.decidingQuestionFor } : {})
  });
}

describe("compact strategy records", () => {
  it("expands a compact row whose evidence gate did not fail", () => {
    const body = materializeRows({ current: "usership", evidenceGate: "pass" });
    const row = body.strategyEvaluations.find((entry) => entry.strategyId === "aggregation");

    expect(row).toEqual({
      strategyId: "aggregation",
      disposition: "rejected",
      betIds: [],
      mechanism: null,
      evidenceGate: "pass",
      evidenceIds: [],
      claimIds: [],
      counterevidenceIds: [],
      dimensions: {
        evidenceStrength: "not_reached",
        centrality: "not_reached",
        materiality: "not_reached",
        distinctiveness: "not_reached",
        independence: "not_reached",
        explanatoryValue: "not_reached"
      },
      presentRelevance: "not_reached",
      historicalEvidenceIds: [],
      presentEvidenceIds: [],
      presentBridge: null,
      siblingCandidateIds: [],
      siblingResolutions: [],
      notYet: null,
      dispositionReason: "The record does not put this mechanism in the buying decision."
    });
  });

  it("keeps insufficient evidence strength as the failed-gate case of the same shape", () => {
    const failed = materializeRows({ current: "usership", evidenceGate: "fail" });
    const unresolved = materializeRows({ current: "usership", evidenceGate: "unresolved" });

    expect(failed.strategyEvaluations[1]).toMatchObject({
      evidenceGate: "fail",
      dimensions: { evidenceStrength: "insufficient", centrality: "not_reached" }
    });
    expect(unresolved.strategyEvaluations[1]).toMatchObject({
      evidenceGate: "unresolved",
      dimensions: { evidenceStrength: "not_reached" }
    });
  });

  it("still validates a full rejected record stored before the compact rows existed", () => {
    const stored = judgment();
    replaceEvaluation(stored, "aggregation", fullRejectedEvaluation("aggregation"));
    expect(howItWinsJudgmentSchema.safeParse(stored).success).toBe(true);

    const halfway = judgment();
    replaceEvaluation(halfway, "aggregation", {
      ...fullRejectedEvaluation("aggregation"),
      mechanism: null
    });
    expect(howItWinsJudgmentSchema.safeParse(halfway).success).toBe(false);
  });

  it("projects a stored full rejected record to the compact model form", () => {
    const stored = judgment();
    replaceEvaluation(stored, "aggregation", fullRejectedEvaluation("aggregation"));

    const projected = semanticJudgmentForModel(stored as HowItWinsJudgmentBody);

    expect(projected.strategyEvaluations.find((entry) => entry.strategyId === "aggregation")).toEqual({
      strategyId: "aggregation",
      disposition: "rejected",
      evidenceGate: "unresolved",
      dispositionReason: "The mechanism is real but it does not change how buyers choose."
    });
  });

  it("fills the deciding question from the rubric, and from the canonical meaning without one", () => {
    const fromRubric = materializeRows({
      current: "usership",
      siblings: ["reliability"],
      decidingQuestionFor: () => "Does the mechanism reduce failure and upkeep?"
    });
    expect(fromRubric.strategyEvaluations[0]?.siblingResolutions).toEqual([{
      strategyId: "reliability",
      decidingQuestion: "Does the mechanism reduce failure and upkeep?",
      reason: "The cited mechanism is the one this strategy names.",
      evidenceIds: ["e1"]
    }]);

    const fallback = materializeRows({ current: "usership", siblings: ["reliability"] });
    expect(fallback.strategyEvaluations[0]?.siblingResolutions[0]?.decidingQuestion)
      .toBe(howItWinsStrategyById("reliability").meaning);

    const emptyLookup = materializeRows({
      current: "usership",
      siblings: ["reliability"],
      decidingQuestionFor: () => undefined
    });
    expect(emptyLookup.strategyEvaluations[0]?.siblingResolutions[0]?.decidingQuestion)
      .toBe(howItWinsStrategyById("reliability").meaning);
  });
});

describe("howItWinsJudgmentSchema", () => {
  it("requires every exact canonical strategy once", () => {
    expect(howItWinsJudgmentSchema.safeParse(judgment()).success).toBe(true);

    const missing = judgment();
    missing.strategyEvaluations.pop();
    expect(howItWinsJudgmentSchema.safeParse(missing).success).toBe(false);

    const duplicate = judgment();
    duplicate.strategyEvaluations[79] = duplicate.strategyEvaluations[0]!;
    expect(howItWinsJudgmentSchema.safeParse(duplicate).success).toBe(false);

    const unknown = judgment() as unknown as { strategyEvaluations: Array<Record<string, unknown>> };
    unknown.strategyEvaluations[0] = { ...unknown.strategyEvaluations[0], strategyId: "made_up" };
    expect(howItWinsJudgmentSchema.safeParse(unknown).success).toBe(false);
  });

  it("accepts zero, one, and more than four current strategies", () => {
    expect(howItWinsJudgmentSchema.safeParse(judgment()).success).toBe(true);
    expect(howItWinsJudgmentSchema.safeParse(judgment(["usership"])).success).toBe(true);
    expect(
      howItWinsJudgmentSchema.safeParse(
        judgment(["usership", "completeness", "aggregation", "diversification", "omnipresence"])
      ).success
    ).toBe(true);
  });

  it("rejects disagreement between current dispositions and the ordered current set", () => {
    const input = judgment(["usership"]);
    input.currentStrategyIds = ["aggregation"];
    expect(howItWinsJudgmentSchema.safeParse(input).success).toBe(false);
  });

  it("validates an optional pair without letting it affect selection", () => {
    const input = judgment(["usership", "aggregation"]);
    input.unusualPair = {
      strategyIds: ["usership", "aggregation"],
      referenceClass: "Products competing for the same buyer decision.",
      normalChoice: "Competitors normally choose a closed catalog.",
      excludedAlternative: "The open environment excludes a closed catalog.",
      acceptedCost: "The company accepts outside participation.",
      interaction: "Participation expands the environment and increases user utility.",
      copyingDifficulty: "A competitor would have to change its catalog and operating model.",
      evidenceIds: ["e1"]
    };
    expect(howItWinsJudgmentSchema.safeParse(input).success).toBe(true);

    const selectedBefore = howItWinsJudgmentSelection(input);
    const withoutPair = { ...input, unusualPair: null };
    expect(howItWinsJudgmentSelection(withoutPair)).toEqual(selectedBefore);

    input.unusualPair.strategyIds = ["usership", "reliability"];
    expect(howItWinsJudgmentSchema.safeParse(input).success).toBe(false);

    input.unusualPair.strategyIds = ["usership", "usership"];
    expect(howItWinsJudgmentSchema.safeParse(input).success).toBe(false);
  });

  it("requires a discriminating reason for a supported or disputed sibling", () => {
    const input = judgment(["usership"]);
    const usership = current("usership");
    usership.siblingCandidateIds = ["reliability"];
    replaceEvaluation(input, "usership", usership);
    expect(howItWinsJudgmentSchema.safeParse(input).success).toBe(false);

    usership.siblingResolutions = [
      {
        strategyId: "reliability",
        decidingQuestion: "Does another user's participation increase existing-user value?",
        reason: "The cited mechanism increases user-to-user utility rather than uptime.",
        evidenceIds: ["e1"]
      }
    ];
    replaceEvaluation(input, "usership", usership);
    expect(howItWinsJudgmentSchema.safeParse(input).success).toBe(true);
  });

  it("rejects historical-only current claims without a present bridge", () => {
    const input = judgment(["heritage"]);
    const heritage = current("heritage");
    heritage.presentEvidenceIds = [];
    heritage.historicalEvidenceIds = ["e1"];
    heritage.presentBridge = null;
    replaceEvaluation(input, "heritage", heritage);
    expect(howItWinsJudgmentSchema.safeParse(input).success).toBe(false);

    heritage.presentBridge = {
      text: "Current buyers still choose the company because of the accumulated legacy.",
      evidenceIds: ["e1"]
    };
    replaceEvaluation(input, "heritage", heritage);
    expect(howItWinsJudgmentSchema.safeParse(input).success).toBe(true);
  });

  it("separates valid not yet from speculation and longer-horizon questions", () => {
    const input = judgment();
    const candidate = {
      ...current("standardization"),
      disposition: "not_yet" as const,
      presentRelevance: "unresolved" as const,
      notYet: {
        precursorEvidenceIds: ["e1"],
        causalPath: "More independent adoption could establish a shared norm.",
        missingCondition: "A third independent adopter has not converged on the format.",
        promotionEvidence: "A third adopter uses the same format without vendor control.",
        horizonMonths: 18
      }
    };
    replaceEvaluation(input, "standardization", candidate);
    expect(howItWinsJudgmentSchema.safeParse(input).success).toBe(true);

    input.claims.push({
      claimId: "c2",
      type: "unsupported_speculation",
      text: "The format might become a standard.",
      evidenceIds: [],
      reason: "No observed precursor establishes the path."
    });
    candidate.claimIds = ["c2"];
    replaceEvaluation(input, "standardization", candidate);
    expect(howItWinsJudgmentSchema.safeParse(input).success).toBe(false);

    candidate.claimIds = ["c1"];
    candidate.notYet = { ...candidate.notYet, horizonMonths: 36 };
    replaceEvaluation(input, "standardization", candidate);
    expect(howItWinsJudgmentSchema.safeParse(input).success).toBe(false);

    replaceEvaluation(input, "standardization", {
      ...candidate,
      disposition: "open_question",
      notYet: null
    });
    expect(howItWinsJudgmentSchema.safeParse(input).success).toBe(true);
  });

  it("rejects evidence references outside the registry", () => {
    const input = judgment(["usership"]);
    input.strategyEvaluations[0]!.evidenceIds = ["missing"];
    expect(howItWinsJudgmentSchema.safeParse(input).success).toBe(false);
  });

  it("keeps one supported strategy instead of returning nothing stands out", () => {
    expect(howItWinsJudgmentSelection(judgment(["usership"]))).toEqual({
      status: "current",
      strategyIds: ["usership"]
    });
    expect(howItWinsJudgmentSelection(judgment())).toEqual({
      status: "nothing_stands_out",
      strategyIds: []
    });
  });

  it("carries a refinement record and still accepts judgments stored before it existed", () => {
    const recorded = howItWinsJudgmentSchema.safeParse({
      ...judgment(),
      refinement: {
        critic: "failed",
        adjudication: "not_needed",
        notes: ["critic call failed: connection reset"]
      }
    });
    expect(recorded.success).toBe(true);
    if (recorded.success) {
      expect(recorded.data.refinement).toMatchObject({ critic: "failed", adjudication: "not_needed" });
    }

    const stored = howItWinsJudgmentSchema.safeParse(judgment());
    expect(stored.success).toBe(true);
    if (stored.success) expect(stored.data.refinement).toBeUndefined();

    expect(howItWinsJudgmentSchema.safeParse({
      ...judgment(),
      refinement: { critic: "invented", adjudication: "ok", notes: [] }
    }).success).toBe(false);
  });

  it("records bundled scout calls without pretending a bundle is a canonical group", () => {
    const input = judgment();
    input.calls[0] = {
      ...input.calls[0]!,
      callId: "bundle-1",
      stage: "group_scout",
      bundleId: "bundle_1"
    };
    expect(howItWinsJudgmentSchema.safeParse(input).success).toBe(true);

    const missingScope = judgment();
    missingScope.calls[0] = {
      ...missingScope.calls[0]!,
      callId: "scout-without-scope",
      stage: "group_scout"
    };
    expect(howItWinsJudgmentSchema.safeParse(missingScope).success).toBe(false);
  });
});

const notYetRecord = {
  precursorEvidenceIds: ["e1"],
  causalPath: "The cited proof is the step before the mechanism starts changing buyer choice.",
  missingCondition: "A buyer still has to choose on this mechanism.",
  promotionEvidence: "A named buyer citing the mechanism.",
  horizonMonths: 18
};

function fullSemanticRow(strategyId: HowItWinsStrategyId, overrides: Record<string, unknown> = {}) {
  return {
    strategyId,
    disposition: "current",
    betRefs: [1],
    mechanism: "The mechanism changes how the company is chosen.",
    evidenceGate: "pass",
    evidenceIds: ["e1"],
    supportingClaims: [{
      type: "observed_fact",
      text: "A current source describes the mechanism.",
      evidenceIds: ["e1"]
    }],
    counterevidenceIds: [],
    dimensions: passingDimensions(),
    presentRelevance: "current",
    historicalEvidenceIds: [],
    presentEvidenceIds: ["e1"],
    presentBridge: null,
    siblingCandidateIds: [],
    siblingResolutions: [],
    notYet: null,
    dispositionReason: "The mechanism is current and material.",
    ...overrides
  };
}

function compactSemanticRow(strategyId: HowItWinsStrategyId) {
  return {
    strategyId,
    disposition: "rejected",
    evidenceGate: "pass",
    dispositionReason: "The record does not put this mechanism in the buying decision."
  };
}

function semanticInput(rows: unknown[], overrides: Record<string, unknown> = {}) {
  return semanticJudgmentSchema.parse({
    strategyEvaluations: rows,
    currentStrategyIds: [],
    unusualPair: null,
    openQuestions: [],
    overallWrongCondition: {
      condition: "The current mechanism stops affecting buyer choice.",
      evidenceIds: ["e1"]
    },
    disagreements: [],
    overrides: [],
    ...overrides
  });
}

function repairedRow(semantic: SemanticHowItWinsJudgment, strategyId: HowItWinsStrategyId) {
  const row = semantic.strategyEvaluations.find((entry) => entry.strategyId === strategyId);
  if (!row || !("mechanism" in row)) throw new Error(`${strategyId} did not survive as a full row`);
  return row;
}

function pair(left: HowItWinsStrategyId, right: HowItWinsStrategyId) {
  return {
    strategyIds: [left, right],
    referenceClass: "Companies selling the same buyer.",
    normalChoice: "The reference class picks one of the two.",
    excludedAlternative: "Running both at once.",
    acceptedCost: "Slower coverage of either mechanism.",
    interaction: "Each mechanism makes the other cheaper to run.",
    copyingDifficulty: "A copy has to accept both costs together.",
    evidenceIds: ["e1"]
  };
}

describe("repairSemanticJudgment", () => {
  it("moves present relevance off current on a not-yet row", () => {
    const input = semanticInput([
      fullSemanticRow("usership", { disposition: "not_yet", notYet: notYetRecord, presentRelevance: "current" })
    ]);

    const result = repairSemanticJudgment(input);

    expect(result.repairs).toHaveLength(1);
    expect(result.repairs[0]).toMatch(/usership/);
    expect(repairedRow(result.semantic, "usership")).toMatchObject({
      disposition: "not_yet",
      presentRelevance: "unresolved"
    });
  });

  it("turns a not-yet row with no not-yet record into an open question", () => {
    const input = semanticInput([
      fullSemanticRow("usership", { disposition: "not_yet", notYet: null, presentRelevance: "unresolved" })
    ]);

    const result = repairSemanticJudgment(input);

    expect(result.repairs).toEqual([expect.stringMatching(/usership carries no not-yet record/)]);
    expect(repairedRow(result.semantic, "usership")).toMatchObject({ disposition: "open_question", notYet: null });
  });

  it("drops a not-yet record from a row that is not not yet", () => {
    const input = semanticInput(
      [fullSemanticRow("usership", { notYet: notYetRecord })],
      { currentStrategyIds: ["usership"] }
    );

    const result = repairSemanticJudgment(input);

    expect(result.repairs).toEqual([expect.stringMatching(/not a not-yet row/)]);
    expect(repairedRow(result.semantic, "usership")).toMatchObject({ disposition: "current", notYet: null });
  });

  it("downgrades a current row that misses any one current-selection gate", () => {
    const gates: Array<[string, Record<string, unknown>]> = [
      ["evidence gate", { evidenceGate: "unresolved" }],
      ["materiality", { dimensions: { ...passingDimensions(), materiality: "unresolved" } }],
      ["independence", { dimensions: { ...passingDimensions(), independence: "duplicate" } }],
      ["explanatory value", { dimensions: { ...passingDimensions(), explanatoryValue: "redundant" } }],
      ["present relevance", { presentRelevance: "historical_only" }],
      ["recent support", { presentEvidenceIds: [], presentBridge: null }]
    ];

    for (const [label, overrides] of gates) {
      const input = semanticInput(
        [fullSemanticRow("usership", overrides)],
        { currentStrategyIds: ["usership"] }
      );

      const result = repairSemanticJudgment(input);

      expect(repairedRow(result.semantic, "usership").disposition, label).toBe("open_question");
      expect(result.semantic.currentStrategyIds, label).toEqual([]);
      expect(result.repairs.join(" "), label).toMatch(/fails the current-selection gate/);
    }
  });

  it("rebuilds the current set from the rows and keeps the order the model gave", () => {
    const input = semanticInput(
      [fullSemanticRow("usership"), fullSemanticRow("aggregation"), compactSemanticRow("reliability")],
      { currentStrategyIds: ["reliability", "aggregation", "aggregation"] }
    );

    const result = repairSemanticJudgment(input);

    expect(result.semantic.currentStrategyIds).toEqual(["aggregation", "usership"]);
    expect(result.repairs).toEqual([
      expect.stringMatching(/drops reliability/),
      expect.stringMatching(/keeps one copy of aggregation/),
      expect.stringMatching(/adds usership/)
    ]);
  });

  it("settles a required sibling the row never distinguished itself from", () => {
    const requiredSiblingIds = { usership: ["reliability"] as const, aggregation: ["reliability"] as const };
    const currentRow = semanticInput(
      [fullSemanticRow("usership", { siblingCandidateIds: ["reliability"] })],
      { currentStrategyIds: ["usership"] }
    );

    const downgraded = repairSemanticJudgment(currentRow, { requiredSiblingIds });

    expect(repairedRow(downgraded.semantic, "usership")).toMatchObject({
      disposition: "open_question",
      siblingCandidateIds: []
    });
    expect(downgraded.semantic.currentStrategyIds).toEqual([]);
    expect(downgraded.repairs.join(" ")).toMatch(/no cited distinction against reliability/);

    const notYetRow = semanticInput([
      fullSemanticRow("aggregation", {
        disposition: "not_yet",
        notYet: notYetRecord,
        presentRelevance: "unresolved",
        siblingCandidateIds: ["reliability"]
      })
    ]);

    const kept = repairSemanticJudgment(notYetRow, { requiredSiblingIds });

    expect(repairedRow(kept.semantic, "aggregation")).toMatchObject({
      disposition: "not_yet",
      siblingCandidateIds: []
    });
    expect(kept.repairs).toEqual([expect.stringMatching(/drops sibling candidate reliability/)]);
  });

  it("cleans sibling candidates against the distinctions the row actually carries", () => {
    const input = semanticInput(
      [fullSemanticRow("usership", {
        siblingCandidateIds: ["usership", "reliability", "reliability"],
        siblingResolutions: [
          { strategyId: "reliability", reason: "The cited mechanism is upkeep, not usage.", evidenceIds: ["e1"] },
          { strategyId: "aggregation", reason: "The cited mechanism is usage, not supply.", evidenceIds: ["e1"] }
        ]
      })],
      { currentStrategyIds: ["usership"] }
    );

    const result = repairSemanticJudgment(input);

    expect(repairedRow(result.semantic, "usership").siblingCandidateIds).toEqual(["reliability", "aggregation"]);
    expect(result.repairs).toEqual([
      expect.stringMatching(/drops itself/),
      expect.stringMatching(/drops a repeated sibling candidate reliability/),
      expect.stringMatching(/adds sibling candidate aggregation/)
    ]);
  });

  it("drops an unusual pair whose legs are not two current strategies", () => {
    const stale = semanticInput(
      [fullSemanticRow("usership"), compactSemanticRow("aggregation")],
      { currentStrategyIds: ["usership"], unusualPair: pair("usership", "aggregation") }
    );
    const doubled = semanticInput(
      [fullSemanticRow("usership")],
      { currentStrategyIds: ["usership"], unusualPair: pair("usership", "usership") }
    );

    expect(repairSemanticJudgment(stale).semantic.unusualPair).toBeNull();
    expect(repairSemanticJudgment(stale).repairs.join(" ")).toMatch(/aggregation is not current/);
    expect(repairSemanticJudgment(doubled).semantic.unusualPair).toBeNull();
    expect(repairSemanticJudgment(doubled).repairs.join(" ")).toMatch(/both legs name usership/);
  });

  it("leaves a dimension the judge never reached for the paid re-ask", () => {
    const input = semanticInput([
      fullSemanticRow("usership", {
        disposition: "open_question",
        dimensions: { ...passingDimensions(), centrality: "not_reached" }
      })
    ]);

    const result = repairSemanticJudgment(input);

    expect(result.repairs).toEqual([]);
    expect(repairedRow(result.semantic, "usership").dimensions.centrality).toBe("not_reached");
  });

  it("chains a row downgrade through the current set into the pair, and settles", () => {
    const rows = HOW_IT_WINS_STRATEGIES.map((strategy) => {
      if (strategy.id === "usership") return fullSemanticRow("usership", { presentEvidenceIds: [], presentBridge: null });
      if (strategy.id === "aggregation") return fullSemanticRow("aggregation");
      return compactSemanticRow(strategy.id);
    });
    const input = semanticInput(rows, {
      currentStrategyIds: ["usership", "aggregation"],
      unusualPair: pair("usership", "aggregation")
    });

    const result = repairSemanticJudgment(input);

    expect(result.repairs).toHaveLength(3);
    expect(result.semantic.currentStrategyIds).toEqual(["aggregation"]);
    expect(result.semantic.unusualPair).toBeNull();

    const base = judgment();
    const body = materializeSemanticJudgment({
      semantic: result.semantic,
      materialBets: base.materialBets,
      evidenceCutoff: base.evidenceCutoff,
      evidenceRegistry: base.evidenceRegistry
    });
    expect(body.currentStrategyIds).toEqual(["aggregation"]);
    expect(howItWinsJudgmentSelection(body)).toEqual({ status: "current", strategyIds: ["aggregation"] });

    const again = repairSemanticJudgment(result.semantic);
    expect(again.repairs).toEqual([]);
    expect(again.semantic).toEqual(result.semantic);
  });

  it("leaves a settled judgment alone", () => {
    const input = semanticInput(
      [fullSemanticRow("usership"), compactSemanticRow("aggregation")],
      { currentStrategyIds: ["usership"] }
    );

    const result = repairSemanticJudgment(input, { requiredSiblingIds: { usership: [] } });

    expect(result.repairs).toEqual([]);
    expect(result.semantic).toEqual(input);
  });
});
