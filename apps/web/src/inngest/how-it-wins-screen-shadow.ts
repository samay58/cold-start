import type { ColdStartCard, GenerationTrace, HowItWinsJudgment } from "@cold-start/core";
import { createJevAsk, loadHowItWinsJudgeRules, screenHowItWins, type JevAsk } from "@cold-start/llm";

type HowItWinsScreenTrace = NonNullable<NonNullable<GenerationTrace["howItWins"]>["screen"]>;

const LIVE_DISPOSITIONS = new Set(["current", "not_yet", "open_question"]);

// Runs the Jev screen beside a finished judgment and reports what it would have kept. It never
// throws and never touches the judgment, the read, or the job's paid ledger: a failed screen is a
// trace line, not a failed job.
export async function howItWinsScreenShadow(input: {
  card: ColdStartCard;
  judgment: HowItWinsJudgment;
  apiKey: string;
  ask?: JevAsk;
}): Promise<HowItWinsScreenTrace> {
  try {
    const screen = await screenHowItWins({
      card: input.card,
      rules: loadHowItWinsJudgeRules(),
      ask: input.ask ?? createJevAsk({ apiKey: input.apiKey, timeoutMs: 8_000 })
    });
    const liveIds = input.judgment.strategyEvaluations
      .filter((evaluation) => LIVE_DISPOSITIONS.has(evaluation.disposition))
      .map((evaluation) => evaluation.strategyId);
    const kept = new Set<string>(screen.keptIds);
    const shortlist = new Set<string>(screen.shortlistIds);
    return {
      status: "ok",
      version: screen.version,
      model: screen.model,
      latencyMs: screen.latencyMs,
      costUsd: screen.costUsd,
      keptCount: screen.keptIds.length,
      shortlistIds: screen.shortlistIds,
      liveIds,
      missedByRoundOne: liveIds.filter((id) => !kept.has(id)),
      missedByShortlist: liveIds.filter((id) => !shortlist.has(id))
    };
  } catch (error) {
    return { status: "failed", reason: (error instanceof Error ? error.message : String(error)).slice(0, 200) };
  }
}
