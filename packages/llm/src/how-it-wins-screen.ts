// The layered Jev screen in front of the How it wins judge
// (docs/superpowers/specs/2026-09-22-how-it-wins-layered-screen.md). Every question is built from
// the approved strategy rubric the judge already reads, so the screen applies Cold Start's own
// tests. Jev returns probabilities, never reasons: the screen narrows and profiles, the judge rules.
import { HOW_IT_WINS_STRATEGIES, type ColdStartCard, type HowItWinsStrategyId } from "@cold-start/core";

import { cardForHowItWinsPrompt } from "./how-it-wins";
import type { HowItWinsJudgeRules } from "./how-it-wins-judge";
import { HOW_IT_WINS_SCREEN_CALIBRATION } from "./how-it-wins-screen-calibration";

export const HOW_IT_WINS_SCREEN_MODEL = "jev-1.13.0";
// Bump when a question's wording or the combination rule changes; the calibration table is keyed by it.
export const HOW_IT_WINS_SCREEN_VERSION = "screen-v1";
const JEV_ENDPOINT = "https://api.typesafe.ai/v1/systemone";
const USD_PER_INPUT_TOKEN = 0.042 / 1_000_000;
const ROUND_TWO_STRATEGIES_PER_REQUEST = 30;

// Tuned on eight non-holdout judge verdicts (Phase 2 of the spec). At 0.15, round 1 kept all 8
// current strategies and 63 of 67 live ones while cutting the judge's scope to a mean of 38.
// The shortlist is a priority hint and a bias monitor, not a filter: at 25 it missed 2 of 8 current.
export const HOW_IT_WINS_SCREEN_THRESHOLDS = {
  roundOneKeepAt: 0.15,
  shortlistSize: 25,
  blockAt: 0.85
} as const;

type RubricRow = HowItWinsJudgeRules["strategyRubric"][number];
type NoulQuestion = { type: "noul"; instructions: string; criteria?: { true: string; false: string } };
export type HowItWinsScreenCheck = "deciding" | "positive" | "lookalike" | "disqualifier";

const EVIDENCE_ONLY = "Judge only from the company evidence in the state. Missing evidence is not evidence against.";

export function howItWinsScreenRoundOneQuestion(row: RubricRow): NoulQuestion {
  return {
    type: "noul",
    instructions: `Should an analyst examine "${row.name}" (${row.canonicalMeaning}) as a real explanation of how this company wins? ${row.decidingQuestion}`,
    criteria: {
      true: `The evidence contains at least one specific fact of this kind, even if it is not yet conclusive: ${row.positiveEvidence}`,
      false: `Nothing specific supports it, or the only support is a look-alike: ${row.falsePositives} ${EVIDENCE_ONLY}`
    }
  };
}

// Four narrow checks per surviving strategy. "deciding" and "positive" are two wordings of one test;
// their gap marks a strategy that is vague for this company.
export function howItWinsScreenRoundTwoQuestions(row: RubricRow): Record<HowItWinsScreenCheck, NoulQuestion> {
  return {
    deciding: {
      type: "noul",
      instructions: `${row.decidingQuestion} Answer for this company about "${row.name}" (${row.canonicalMeaning}). ${EVIDENCE_ONLY}`
    },
    positive: {
      type: "noul",
      instructions: `The evidence shows this for the company, concretely rather than as a claim or aspiration: ${row.positiveEvidence}`,
      criteria: {
        true: "A specific fact in the evidence shows it: a named customer, number, product behavior, outcome or comparison",
        false: "The evidence does not show it, or shows it only as marketing language, a plan or a vague claim"
      }
    },
    lookalike: {
      type: "noul",
      instructions: `The only evidence that seems to support "${row.name}" for this company is one of these look-alikes, which do not count: ${row.falsePositives}`,
      criteria: {
        true: "Everything that seems to support it is one of the listed look-alikes",
        false: "At least one piece of support goes beyond the look-alikes, or nothing supports it at all"
      }
    },
    disqualifier: {
      type: "noul",
      instructions: `The evidence affirmatively shows this about the company: ${row.disqualifyingEvidence}`,
      criteria: {
        true: "A specific fact in the evidence shows it",
        false: "The evidence does not show it; silence does not count"
      }
    }
  };
}

export type JevAsk = (state: unknown, questions: Record<string, NoulQuestion>) => Promise<{
  answers: Record<string, number>;
  inputTokens: number;
  latencyMs: number;
}>;

export function createJevAsk(input: { apiKey: string; fetchImpl?: typeof fetch; timeoutMs?: number; signal?: AbortSignal }): JevAsk {
  const fetchImpl = input.fetchImpl ?? fetch;
  return async (state, questions) => {
    const body = JSON.stringify({ model: HOW_IT_WINS_SCREEN_MODEL, state, questions });
    // One retry on rate limits and overload, per the API docs; anything else fails the screen.
    for (let attempt = 1; ; attempt += 1) {
      const started = Date.now();
      const signals = [AbortSignal.timeout(input.timeoutMs ?? 20_000), ...(input.signal ? [input.signal] : [])];
      const response = await fetchImpl(JEV_ENDPOINT, {
        method: "POST",
        headers: { Authorization: `Bearer ${input.apiKey}`, "Content-Type": "application/json" },
        body,
        signal: AbortSignal.any(signals)
      });
      if ((response.status === 429 || response.status === 529) && attempt < 2) {
        await new Promise((resolve) => setTimeout(resolve, 1_500));
        continue;
      }
      if (!response.ok) throw new Error(`jev ${response.status}`);
      const json = (await response.json()) as {
        answers?: Record<string, { noul?: unknown }>;
        usage?: { input_tokens?: unknown };
      };
      const answers: Record<string, number> = {};
      for (const id of Object.keys(questions)) {
        const value = json.answers?.[id]?.noul;
        if (typeof value !== "number" || value < 0 || value > 1) throw new Error(`jev answer missing or out of range: ${id}`);
        answers[id] = value;
      }
      const inputTokens = typeof json.usage?.input_tokens === "number" ? json.usage.input_tokens : 0;
      return { answers, inputTokens, latencyMs: Date.now() - started };
    }
  };
}

export type HowItWinsScreenStrategy = {
  roundOne: number;
  roundTwo?: Record<HowItWinsScreenCheck, number>;
  // Mean of the two wordings of the deciding test; zero when round 1 dropped the strategy.
  support: number;
  // This company's support against the same strategy across the calibration corpus, 0 to 1.
  percentile: number;
  blocked: boolean;
};

export type HowItWinsScreenResult = {
  version: string;
  model: string;
  strategies: Record<HowItWinsStrategyId, HowItWinsScreenStrategy>;
  keptIds: HowItWinsStrategyId[];
  shortlistIds: HowItWinsStrategyId[];
  inputTokens: number;
  costUsd: number;
  latencyMs: number;
};

export function howItWinsScreenPercentile(strategyId: HowItWinsStrategyId, support: number): number {
  const quantiles = HOW_IT_WINS_SCREEN_CALIBRATION.quantiles[strategyId];
  if (!quantiles || quantiles.length === 0) return support;
  let below = 0;
  while (below < quantiles.length && quantiles[below]! < support) below += 1;
  return below / quantiles.length;
}

// Ranks by calibrated percentile, so a strategy Jev favors everywhere (Hybrid, in Phase 0) ranks
// high only when this company is unusual for it. Blocked strategies are left out.
export function howItWinsScreenShortlist(
  strategies: Record<HowItWinsStrategyId, HowItWinsScreenStrategy>,
  size: number = HOW_IT_WINS_SCREEN_THRESHOLDS.shortlistSize
): HowItWinsStrategyId[] {
  return HOW_IT_WINS_STRATEGIES
    .map((strategy) => strategy.id)
    .filter((id) => strategies[id].roundTwo && !strategies[id].blocked)
    .sort((a, b) => strategies[b].percentile - strategies[a].percentile || strategies[b].support - strategies[a].support)
    .slice(0, size);
}

export async function screenHowItWins(input: {
  card: ColdStartCard;
  rules: HowItWinsJudgeRules;
  ask: JevAsk;
}): Promise<HowItWinsScreenResult> {
  const started = Date.now();
  const state = cardForHowItWinsPrompt(input.card);
  const rows = input.rules.strategyRubric;
  let inputTokens = 0;

  const roundOne = await input.ask(state, Object.fromEntries(rows.map((row) => [row.strategyId, howItWinsScreenRoundOneQuestion(row)])));
  inputTokens += roundOne.inputTokens;
  const kept = rows.filter((row) => roundOne.answers[row.strategyId]! >= HOW_IT_WINS_SCREEN_THRESHOLDS.roundOneKeepAt);

  const chunks: RubricRow[][] = [];
  for (let i = 0; i < kept.length; i += ROUND_TWO_STRATEGIES_PER_REQUEST) chunks.push(kept.slice(i, i + ROUND_TWO_STRATEGIES_PER_REQUEST));
  const roundTwo: Partial<Record<HowItWinsStrategyId, Record<HowItWinsScreenCheck, number>>> = {};
  await Promise.all(chunks.map(async (chunk) => {
    const questions: Record<string, NoulQuestion> = {};
    for (const row of chunk) {
      for (const [check, question] of Object.entries(howItWinsScreenRoundTwoQuestions(row))) questions[`${row.strategyId}__${check}`] = question;
    }
    const reply = await input.ask(state, questions);
    inputTokens += reply.inputTokens;
    for (const row of chunk) {
      const id = row.strategyId;
      roundTwo[id] = {
        deciding: reply.answers[`${id}__deciding`]!,
        positive: reply.answers[`${id}__positive`]!,
        lookalike: reply.answers[`${id}__lookalike`]!,
        disqualifier: reply.answers[`${id}__disqualifier`]!
      };
    }
  }));

  const strategies = {} as Record<HowItWinsStrategyId, HowItWinsScreenStrategy>;
  for (const row of rows) {
    const checks = roundTwo[row.strategyId];
    const support = checks ? (checks.deciding + checks.positive) / 2 : 0;
    strategies[row.strategyId] = {
      roundOne: roundOne.answers[row.strategyId]!,
      ...(checks ? { roundTwo: checks } : {}),
      support,
      percentile: howItWinsScreenPercentile(row.strategyId, support),
      blocked: checks ? Math.max(checks.lookalike, checks.disqualifier) >= HOW_IT_WINS_SCREEN_THRESHOLDS.blockAt : false
    };
  }
  return {
    version: HOW_IT_WINS_SCREEN_VERSION,
    model: HOW_IT_WINS_SCREEN_MODEL,
    strategies,
    keptIds: kept.map((row) => row.strategyId),
    shortlistIds: howItWinsScreenShortlist(strategies),
    inputTokens,
    costUsd: Number((inputTokens * USD_PER_INPUT_TOKEN).toFixed(6)),
    latencyMs: Date.now() - started
  };
}
