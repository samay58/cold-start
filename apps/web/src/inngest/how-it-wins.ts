import {
  HOW_IT_WINS_STRATEGIES,
  type ColdStartCard,
  type GenerationTrace,
  type HowItWinsJudgment
} from "@cold-start/core";
import type { HowItWinsJudgmentInputHashes } from "@cold-start/db";
import {
  HOW_IT_WINS_WRITER_PROMPT_HASH,
  hashHowItWinsJudgeValue,
  howItWinsEvidencePacketFromCard,
  howItWinsJudgePromptHash,
  loadHowItWinsJudgeRules,
  type HowItWinsModels
} from "@cold-start/llm";

type HowItWinsTraceBlock = NonNullable<GenerationTrace["howItWins"]>;
export type HowItWinsJudgeSummary = NonNullable<HowItWinsTraceBlock["judgeSummary"]>;

// Bump this when a code or prompt change can alter a filed read without changing the judge
// rules, vocabulary, refinement setting, or selected models. It deliberately covers the writer
// and verifier prompts as well as their surrounding implementation, which do not have a stable
// data input of their own to hash.
const HOW_IT_WINS_EVALUATOR_CONTRACT_VERSION = 1;

export type HowItWinsEvaluator = {
  contractVersion: typeof HOW_IT_WINS_EVALUATOR_CONTRACT_VERSION;
  signature: string;
};

export type HowItWinsEvaluatorConfig = {
  models: HowItWinsModels;
  verifierModel: string;
  refinement?: boolean;
  // Defaults to the live writer prompt; tests pass another value to prove it reaches the signature.
  writerPromptHash?: string;
};

// The complete evaluator identity is durable card metadata. Model routing is intentionally part
// of the signature: changing a routed model is a product change, so a worker that began under the
// old route must not write onto a card filed under the new one.
export function howItWinsEvaluatorFor(config: HowItWinsEvaluatorConfig): HowItWinsEvaluator {
  const refinement = config.refinement !== false;
  const rules = loadHowItWinsJudgeRules();
  return {
    contractVersion: HOW_IT_WINS_EVALUATOR_CONTRACT_VERSION,
    signature: hashHowItWinsJudgeValue({
      contractVersion: HOW_IT_WINS_EVALUATOR_CONTRACT_VERSION,
      judgePromptHash: howItWinsJudgePromptHash(rules, { refinement }),
      // The writer prompt has its own hash since the judge's copy was frozen, so a writer edit
      // re-writes filed reads from their stored verdicts without re-judging them.
      writerPromptHash: config.writerPromptHash ?? HOW_IT_WINS_WRITER_PROMPT_HASH,
      vocabularyHash: hashHowItWinsJudgeValue(HOW_IT_WINS_STRATEGIES),
      refinement,
      models: config.models,
      verifierModel: config.verifierModel
    })
  };
}

// The judge cache includes evidence, rules, vocabulary, refinement, and judge/editor routing.
// Writer routing changes only the later read, so it does not invalidate the stored verdict.
export function howItWinsJudgeInputs(
  card: ColdStartCard,
  refinement?: boolean,
  models?: Pick<HowItWinsModels, "judge" | "editor">,
  screenIdentity?: string
): { hashes: HowItWinsJudgmentInputHashes } {
  const packet = howItWinsEvidencePacketFromCard(card);
  const rules = loadHowItWinsJudgeRules();
  return {
    hashes: {
      evidencePacketHash: hashHowItWinsJudgeValue(packet),
      // Judge and editor routing changes can change the memoized verdict. Folding them into this
      // hash prevents the cache from replaying a verdict produced by an older evaluator route.
      promptHash: hashHowItWinsJudgeValue({
        judgePromptHash: howItWinsJudgePromptHash(rules, { refinement, screenIdentity }),
        ...(models ? { models: { judge: models.judge, editor: models.editor } } : {})
      }),
      vocabularyHash: hashHowItWinsJudgeValue(HOW_IT_WINS_STRATEGIES)
    }
  };
}

export function howItWinsJudgeSummary(judgment: HowItWinsJudgment): HowItWinsJudgeSummary {
  return {
    currentCount: judgment.currentStrategyIds.length,
    notYetCount: judgment.strategyEvaluations.filter((entry) => entry.disposition === "not_yet").length,
    openQuestionCount: judgment.openQuestions.length,
    ...(judgment.refinement ? { refinement: judgment.refinement } : {}),
    calls: judgment.calls.map((call) => ({
      stage: call.stage,
      model: call.model,
      provider: call.provider,
      ...(call.inputTokens === undefined ? {} : { inputTokens: call.inputTokens }),
      ...(call.outputTokens === undefined ? {} : { outputTokens: call.outputTokens }),
      latencyMs: call.latencyMs,
      estimatedCostUsd: call.estimatedCostUsd ?? null,
      actualCostUsd: call.actualCostUsd ?? null,
      outcome: call.outcome
    }))
  };
}
