import { test } from "node:test";
import assert from "node:assert/strict";
import type { HowItWins, HowItWinsJudgment, HowItWinsStrategyId } from "@cold-start/core";
import {
  HOW_IT_WINS_BATCH_HOLDOUT,
  computeLosses,
  parseFlags,
  selectBatchSlugs,
  shouldStopForBudget,
  median,
  type BatchCandidate
} from "./how-it-wins-batch";

// ---- selection / holdout --------------------------------------------------------------------

function candidate(slug: string, over: Partial<BatchCandidate> = {}): BatchCandidate {
  return { slug, hasSynthesis: true, thinFileReason: null, ...over };
}

test("holdout cards never come out of seeded sampling", () => {
  const candidates = [
    candidate("kept"),
    candidate(HOW_IT_WINS_BATCH_HOLDOUT[0]!),
    candidate(HOW_IT_WINS_BATCH_HOLDOUT[1]!)
  ];
  const selection = selectBatchSlugs(candidates, { seed: "s", limit: 20, requestedSlugs: null });
  assert.deepEqual(selection.slugs, ["kept"]);
  assert.equal(selection.holdoutExcluded, 2);
});

test("holdout cards are excluded even when named directly with --slugs", () => {
  const requested = ["kept", HOW_IT_WINS_BATCH_HOLDOUT[0]!];
  const selection = selectBatchSlugs([], { seed: "s", limit: 20, requestedSlugs: requested });
  assert.deepEqual(selection.slugs, ["kept"]);
  assert.equal(selection.holdoutExcluded, 1);
});

test("sampling skips cards with no synthesis or a thin-file reason, holdout aside", () => {
  const candidates = [
    candidate("kept"),
    candidate("no-synthesis", { hasSynthesis: false }),
    candidate("too-thin", { thinFileReason: "too-few-sources" })
  ];
  const selection = selectBatchSlugs(candidates, { seed: "s", limit: 20, requestedSlugs: null });
  assert.deepEqual(selection.slugs, ["kept"]);
});

test("sampling is deterministic per seed and respects the limit", () => {
  const candidates = Array.from({ length: 30 }, (_, i) => candidate(`card-${i}`));
  const a = selectBatchSlugs(candidates, { seed: "how-it-wins-batch-1", limit: 15, requestedSlugs: null });
  const b = selectBatchSlugs(candidates, { seed: "how-it-wins-batch-1", limit: 15, requestedSlugs: null });
  const c = selectBatchSlugs(candidates, { seed: "how-it-wins-batch-2", limit: 15, requestedSlugs: null });
  assert.deepEqual(a.slugs, b.slugs);
  assert.equal(a.slugs.length, 15);
  assert.notDeepEqual(a.slugs, c.slugs);
});

// ---- budget ----------------------------------------------------------------------------------

test("budget stop fires once cumulative spend reaches the cap, not before", () => {
  assert.equal(shouldStopForBudget(0, 8), false);
  assert.equal(shouldStopForBudget(7.99, 8), false);
  assert.equal(shouldStopForBudget(8, 8), true);
  assert.equal(shouldStopForBudget(9, 8), true);
});

test("--budget-usd parses and defaults to 8", () => {
  assert.equal(parseFlags([]).budgetUsd, 8);
  assert.equal(parseFlags(["--budget-usd", "3.5"]).budgetUsd, 3.5);
  assert.throws(() => parseFlags(["--budget-usd", "0"]), /positive number/);
});

test("there is no --allow-holdout escape hatch", () => {
  assert.throws(() => parseFlags(["--allow-holdout"]), /unknown flag/);
});

test("--parallel and --limit parse with sane defaults", () => {
  const defaults = parseFlags([]);
  assert.equal(defaults.parallel, 1);
  assert.equal(defaults.limit, 15);
  assert.equal(parseFlags(["--parallel", "2"]).parallel, 2);
  assert.throws(() => parseFlags(["--limit", "0"]), /positive integer/);
});

// The judgment cache name is shared with the corpus reads; it is tested in
// how-it-wins-eval-shared.test.ts.

// ---- losses ------------------------------------------------------------------------------------

function judgment(currentStrategyIds: HowItWinsStrategyId[], openQuestionIds: HowItWinsStrategyId[] = []): HowItWinsJudgment {
  return {
    version: 1,
    hashes: { evidencePacket: "a".repeat(64), prompt: "b".repeat(64), vocabulary: "c".repeat(64) },
    evidenceCutoff: "2026-08-01T00:00:00.000Z",
    evidenceRegistry: [{ evidenceId: "e1", text: "t", source: "s", sourceDate: null, attribution: "a", scope: "company" }],
    claims: [],
    materialBets: [{ betId: "b1", statement: "s", scope: "company", supportingEvidenceIds: ["e1"], scopeReasons: ["r"] }],
    strategyEvaluations: [
      ...currentStrategyIds.map((strategyId) => ({
        strategyId,
        disposition: "current" as const,
        betIds: ["b1"],
        mechanism: "m",
        evidenceGate: "pass" as const,
        evidenceIds: ["e1"],
        claimIds: [],
        counterevidenceIds: [],
        dimensions: {
          evidenceStrength: "direct" as const,
          centrality: "central" as const,
          materiality: "material" as const,
          distinctiveness: "company_specific" as const,
          independence: "independent" as const,
          explanatoryValue: "additive" as const
        },
        presentRelevance: "current" as const,
        historicalEvidenceIds: [],
        presentEvidenceIds: ["e1"],
        presentBridge: null,
        siblingCandidateIds: [],
        siblingResolutions: [],
        notYet: null,
        dispositionReason: "r"
      })),
      ...openQuestionIds.map((strategyId) => ({
        strategyId,
        disposition: "open_question" as const,
        betIds: [],
        mechanism: null,
        evidenceGate: "unresolved" as const,
        evidenceIds: ["e1"],
        claimIds: [],
        counterevidenceIds: [],
        dimensions: {
          evidenceStrength: "insufficient" as const,
          centrality: "unresolved" as const,
          materiality: "unresolved" as const,
          distinctiveness: "unresolved" as const,
          independence: "unresolved" as const,
          explanatoryValue: "unresolved" as const
        },
        presentRelevance: "unresolved" as const,
        historicalEvidenceIds: [],
        presentEvidenceIds: [],
        presentBridge: null,
        siblingCandidateIds: [],
        siblingResolutions: [],
        notYet: null,
        dispositionReason: "r"
      }))
    ],
    currentStrategyIds,
    unusualPair: null,
    openQuestions: [],
    overallWrongCondition: { condition: "c", evidenceIds: ["e1"] },
    disagreements: [],
    overrides: [],
    calls: [
      {
        callId: "call-1",
        stage: "global_judge",
        provider: "anthropic",
        model: "claude-opus-5",
        inputTokens: 1000,
        outputTokens: 2000,
        cacheCreationInputTokens: 0,
        cacheReadInputTokens: 0,
        actualCostUsd: null,
        estimatedCostUsd: 0.5,
        latencyMs: 1000,
        retryCount: 0,
        thinkingState: "enabled",
        outcome: "ok"
      }
    ]
  } as HowItWinsJudgment;
}

function runningRead(strategies: HowItWinsStrategyId[], inQuestion: HowItWinsStrategyId[] = []): HowItWins {
  return {
    status: "read",
    sentence: "It wins on one narrow surface its buyers already stand on.",
    running: strategies.map((strategy) => ({
      strategy,
      meaning: "It goes deep on one surface instead of the whole toolchain.",
      note: "Every shipped feature lands there [c1].",
      citationIds: ["c1"]
    })),
    pair: null,
    next: [],
    inQuestion: inQuestion.map((strategy) => ({
      strategy,
      meaning: "An open question about the same surface.",
      note: "Not yet resolved [c1].",
      citationIds: ["c1"]
    })),
    wrongIf: "A competitor ships the same surface with no switching cost."
  };
}

const NOTHING_STANDS_OUT = (inQuestion: HowItWinsStrategyId[] = []): HowItWins => ({
  status: "nothing_stands_out",
  inQuestion: inQuestion.map((strategy) => ({
    strategy,
    meaning: "An open question.",
    note: "Not yet resolved [c1].",
    citationIds: ["c1"]
  }))
});

test("running loss: 5 judge-current, 4 written, 2 survive verification, still a valid read", () => {
  const ids: HowItWinsStrategyId[] = ["chokepoint", "hybrid", "prestige", "monopoly", "bundling"];
  const losses = computeLosses({
    judgment: judgment(ids),
    preVerify: runningRead(ids.slice(0, 4)),
    filed: runningRead(ids.slice(0, 2))
  });
  assert.equal(losses.judgeCurrent, 5);
  assert.equal(losses.writerCurrent, 4);
  assert.equal(losses.verifiedRunning, 2);
  assert.equal(losses.capDropped, 1);
  assert.equal(losses.verifierDropped, 2);
  assert.equal(losses.underFloorFired, false);
});

test("running loss: 4 judge-current, 4 written, 4 survive, nothing lost anywhere", () => {
  const ids: HowItWinsStrategyId[] = ["chokepoint", "hybrid", "prestige", "monopoly"];
  const losses = computeLosses({
    judgment: judgment(ids),
    preVerify: runningRead(ids),
    filed: runningRead(ids)
  });
  assert.equal(losses.judgeCurrent, 4);
  assert.equal(losses.writerCurrent, 4);
  assert.equal(losses.verifiedRunning, 4);
  assert.equal(losses.capDropped, 0);
  assert.equal(losses.verifierDropped, 0);
  assert.equal(losses.underFloorFired, false);
});

test("running loss: a single current strategy can never clear the two-running floor", () => {
  const losses = computeLosses({
    judgment: judgment(["chokepoint"]),
    preVerify: NOTHING_STANDS_OUT(),
    filed: NOTHING_STANDS_OUT()
  });
  assert.equal(losses.judgeCurrent, 1);
  assert.equal(losses.writerCurrent, 0);
  assert.equal(losses.verifiedRunning, 0);
  assert.equal(losses.capDropped, 0);
  assert.equal(losses.verifierDropped, 0);
  assert.equal(losses.underFloorFired, true);
});

test("open-question loss: one judge open question, verifier drops the cited note, none filed", () => {
  const losses = computeLosses({
    judgment: judgment([], ["chokepoint"]),
    preVerify: NOTHING_STANDS_OUT(["chokepoint"]),
    filed: NOTHING_STANDS_OUT([])
  });
  assert.equal(losses.judgeOpenQuestion, 1);
  assert.equal(losses.filedInQuestion, 0);
  // No current strategies in this fixture, so the running floor never applies here.
  assert.equal(losses.underFloorFired, false);
});

// ---- median -------------------------------------------------------------------------------------

test("median handles even and odd counts and an empty list", () => {
  assert.equal(median([]), 0);
  assert.equal(median([5]), 5);
  assert.equal(median([1, 3, 2]), 2);
  assert.equal(median([1, 2, 3, 4]), 2.5);
});

