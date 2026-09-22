import type { ColdStartCard, GenerationTrace, HowItWinsJudgment } from "@cold-start/core";
import {
  createJevAsk,
  loadHowItWinsJudgeRules,
  screenHowItWins,
  type HowItWinsScreenResult,
  type JevAsk
} from "@cold-start/llm";

type HowItWinsScreenTrace = NonNullable<NonNullable<GenerationTrace["howItWins"]>["screen"]>;

const LIVE_DISPOSITIONS = new Set(["current", "not_yet", "open_question"]);
export const HOW_IT_WINS_SCREEN_TIMEOUT_MS = 8_000;

function failedScreen(error: unknown): HowItWinsScreenTrace {
  return { status: "failed", reason: (error instanceof Error ? error.message : String(error)).slice(0, 200) };
}

// Runs the screen for one card and never throws: a failed screen is a trace line, and in scoped
// mode it sends the run to the full 80-strategy judge.
export async function runHowItWinsScreen(input: { card: ColdStartCard; apiKey: string; ask?: JevAsk }):
Promise<{ ok: true; screen: HowItWinsScreenResult } | { ok: false; trace: HowItWinsScreenTrace }> {
  try {
    const screen = await screenHowItWins({
      card: input.card,
      rules: loadHowItWinsJudgeRules(),
      ask: input.ask ?? createJevAsk({ apiKey: input.apiKey, timeoutMs: HOW_IT_WINS_SCREEN_TIMEOUT_MS })
    });
    return { ok: true, screen };
  } catch (error) {
    return { ok: false, trace: failedScreen(error) };
  }
}

// What the screen kept against what the judgment found live. In shadow mode a live strategy
// missed by Round 1 is a recall failure. In scoped mode it is a strategy the judge or the critic
// added back past the screen.
export function howItWinsScreenTrace(
  screen: HowItWinsScreenResult,
  judgment: HowItWinsJudgment,
  mode: "shadow" | "scoped"
): HowItWinsScreenTrace {
  const liveIds = judgment.strategyEvaluations
    .filter((evaluation) => LIVE_DISPOSITIONS.has(evaluation.disposition))
    .map((evaluation) => evaluation.strategyId);
  const kept = new Set<string>(screen.keptIds);
  const shortlist = new Set<string>(screen.shortlistIds);
  return {
    status: "ok",
    mode,
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
}

// Shadow mode: the screen beside a finished judgment. It never touches the judgment, the read,
// or the job's paid ledger.
export async function howItWinsScreenShadow(input: {
  card: ColdStartCard;
  judgment: HowItWinsJudgment;
  apiKey: string;
  ask?: JevAsk;
}): Promise<HowItWinsScreenTrace> {
  const result = await runHowItWinsScreen(input);
  if (!result.ok) return result.trace;
  try {
    return howItWinsScreenTrace(result.screen, input.judgment, "shadow");
  } catch (error) {
    return failedScreen(error);
  }
}
