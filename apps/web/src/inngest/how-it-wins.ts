import {
  HOW_IT_WINS_STRATEGIES,
  type ColdStartCard,
  type GenerationLlmCallTrace,
  type GenerationTrace,
  type HowItWins,
  type HowItWinsJudgment,
  type HowItWinsRead
} from "@cold-start/core";
import {
  findHowItWinsJudgment,
  storeHowItWinsJudgment,
  type ColdStartDb,
  type HowItWinsJudgmentInputHashes
} from "@cold-start/db";
import {
  createAnthropicClient,
  hashHowItWinsJudgeValue,
  howItWinsEvidencePacketFromCard,
  howItWinsJudgePromptHash,
  isTransientLlmError,
  judgeHowItWinsForAnalysis,
  loadHowItWinsJudgeRules,
  synthesizeHowItWins,
  verifySynthesis,
  type AnthropicTelemetrySink,
  type HowItWinsModels
} from "@cold-start/llm";
import { howItWinsUncitableRunningCount, verifyHowItWinsRead } from "@cold-start/pipeline";
import { boundedErrorMessage } from "../lib/errors";

type HowItWinsTraceBlock = NonNullable<GenerationTrace["howItWins"]>;
export type HowItWinsJudgeSummary = NonNullable<HowItWinsTraceBlock["judgeSummary"]>;
export type HowItWinsLosses = NonNullable<HowItWinsTraceBlock["losses"]>;

// Every step body below shares one catch rule, the one the emphasis read already used: a
// transient transport failure rethrows so Inngest retries the step, and a semantic failure (an
// unparseable draft, a citation that is not on the card, a judge fail-closed) is memoized as
// { ok: false } so a retry never re-pays for the model call that produced it. The caller
// degrades a semantic failure rather than failing anything: the read is a Lens category.
function memoizedFailure(error: unknown): { ok: false; error: string } {
  if (isTransientLlmError(error)) {
    throw error;
  }
  return { ok: false, error: boundedErrorMessage(error) };
}

// The three inputs that decide a verdict, hashed. Everything else about a run (the model, the
// slug, the clock) can move without changing what the judge should conclude, which is what makes
// the stored verdict safe to replay. Refinement changes what the judge does under the same rules,
// so it rides into the prompt hash: a verdict judged with refinement on must never replay for a
// run with it off, and vice versa.
export function howItWinsJudgeInputs(
  card: ColdStartCard,
  refinement?: boolean
): { hashes: HowItWinsJudgmentInputHashes } {
  const packet = howItWinsEvidencePacketFromCard(card);
  const rules = loadHowItWinsJudgeRules();
  return {
    hashes: {
      evidencePacketHash: hashHowItWinsJudgeValue(packet),
      promptHash: howItWinsJudgePromptHash(rules, { refinement }),
      vocabularyHash: hashHowItWinsJudgeValue(HOW_IT_WINS_STRATEGIES)
    }
  };
}

function judgeCallCostUsd(judgment: HowItWinsJudgment) {
  const total = judgment.calls.reduce(
    (sum, call) => sum + (call.actualCostUsd ?? call.estimatedCostUsd ?? 0),
    0
  );
  return Number(total.toFixed(6));
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
      inputTokens: call.inputTokens,
      outputTokens: call.outputTokens,
      latencyMs: call.latencyMs,
      estimatedCostUsd: call.estimatedCostUsd,
      actualCostUsd: call.actualCostUsd,
      outcome: call.outcome
    }))
  };
}

// The judge's calls as rows for the run's LLM ledger (trace.llm.calls), the ledger cost_usd is
// derived from. Called only for a judgment this run paid for; a cached one adds no rows. The
// judgment keeps its own copy of the calls as the cache's record, which is a different ledger.
export function howItWinsJudgeLlmCalls(summary: HowItWinsJudgeSummary): GenerationLlmCallTrace[] {
  return (summary.calls ?? []).map((call) => ({
    stage: "how_it_wins",
    label: `how-it-wins:${call.stage}`,
    model: call.model,
    provider: call.provider,
    status: call.outcome === "ok" ? "ok" : "failed",
    durationMs: call.latencyMs,
    ...(call.inputTokens === undefined ? {} : { inputTokens: call.inputTokens }),
    ...(call.outputTokens === undefined ? {} : { outputTokens: call.outputTokens }),
    ...((call.actualCostUsd ?? call.estimatedCostUsd) === undefined || (call.actualCostUsd ?? call.estimatedCostUsd) === null
      ? {}
      : { estimatedCostUsd: (call.actualCostUsd ?? call.estimatedCostUsd) as number })
  }));
}

export type HowItWinsJudgeStepResult =
  | {
      ok: true;
      judgmentId: string;
      hashes: HowItWinsJudgmentInputHashes;
      cached: boolean;
      judgeSummary: HowItWinsJudgeSummary;
    }
  | { ok: false; error: string };

// Returns the reference and the counts, never the verdict body: this is a memoized Inngest step
// output and the body runs to tens of thousands of tokens. Later steps read the body back out of
// the table by the same hashes.
export async function howItWinsJudgeStepBody(input: {
  db: ColdStartDb;
  card: ColdStartCard;
  slug: string;
  client: ReturnType<typeof createAnthropicClient>;
  models: HowItWinsModels;
  // Default true (undefined means on). False skips the critic and adjudication passes.
  refinement?: boolean;
}): Promise<HowItWinsJudgeStepResult> {
  const { hashes } = howItWinsJudgeInputs(input.card, input.refinement);
  try {
    const cached = await findHowItWinsJudgment(input.db, hashes);
    if (cached) {
      return {
        ok: true,
        judgmentId: cached.id,
        hashes,
        cached: true,
        judgeSummary: howItWinsJudgeSummary(cached.judgment)
      };
    }

    const startedAtMs = Date.now();
    // No telemetry sink here: every judge call records its own cost, tokens, and latency in
    // judgment.calls, and the function copies those rows onto the run's ledger once, through
    // howItWinsJudgeLlmCalls, only when this run paid for the judgment.
    const judgment = await judgeHowItWinsForAnalysis({
      card: input.card,
      client: input.client,
      models: input.models,
      ...(input.refinement === undefined ? {} : { refinement: input.refinement })
    });
    const stored = await storeHowItWinsJudgment(input.db, {
      ...hashes,
      slug: input.slug,
      model: input.models.judge,
      judgment,
      estimatedCostUsd: judgeCallCostUsd(judgment),
      latencyMs: Date.now() - startedAtMs
    });
    return {
      ok: true,
      judgmentId: stored.id,
      hashes,
      cached: false,
      judgeSummary: howItWinsJudgeSummary(judgment)
    };
  } catch (error) {
    return memoizedFailure(error);
  }
}

export type HowItWinsWriteStepResult =
  | { ok: true; read: HowItWins }
  | { ok: false; error: string };

export async function howItWinsWriteStepBody(input: {
  db: ColdStartDb;
  card: ColdStartCard;
  hashes: HowItWinsJudgmentInputHashes;
  client: ReturnType<typeof createAnthropicClient>;
  models: HowItWinsModels;
  telemetry: AnthropicTelemetrySink;
}): Promise<HowItWinsWriteStepResult> {
  try {
    const stored = await findHowItWinsJudgment(input.db, input.hashes);
    if (!stored) {
      // Semantic, not transient: the judge step wrote this row, so a miss means it vanished or
      // stopped parsing. Judging again is the fix, and that happens on the next request.
      return { ok: false, error: "stored how-it-wins judgment could not be read back" };
    }
    const result = await synthesizeHowItWins({
      client: input.client,
      models: input.models,
      card: input.card,
      telemetry: input.telemetry,
      judgment: stored.judgment
    });
    return { ok: true, read: result.read };
  } catch (error) {
    return memoizedFailure(error);
  }
}

export type HowItWinsVerifyStepResult =
  | { ok: true; howItWins: HowItWins; dropReason?: "running-dropped" | "pair-dropped"; losses: HowItWinsLosses }
  | { ok: false; error: string };

export async function howItWinsVerifyStepBody(input: {
  card: ColdStartCard;
  read: HowItWinsRead;
  judgeCurrentCount: number;
  client: ReturnType<typeof createAnthropicClient>;
  model: string;
  telemetry: AnthropicTelemetrySink;
}): Promise<HowItWinsVerifyStepResult> {
  try {
    const outcome = await verifyHowItWinsRead({
      card: input.card,
      read: input.read,
      verify: (claims, sources, evidenceFacts) =>
        verifySynthesis({
          client: input.client,
          model: input.model,
          claims,
          sources,
          evidenceFacts,
          telemetry: input.telemetry
        })
    });
    const writerCurrent = input.read.running.length;
    return {
      ok: true,
      howItWins: outcome.howItWins,
      ...(outcome.dropReason ? { dropReason: outcome.dropReason } : {}),
      losses: {
        judgeCurrent: input.judgeCurrentCount,
        writerCurrent,
        verifiedRunning: outcome.verifiedRunningCount,
        writerCitationDropped: howItWinsUncitableRunningCount(input.card, input.read),
        verifierDropped: Math.max(0, writerCurrent - outcome.verifiedRunningCount),
        floorFired:
          outcome.howItWins.status === "nothing_stands_out" && outcome.dropReason === "running-dropped"
      }
    };
  } catch (error) {
    return memoizedFailure(error);
  }
}
