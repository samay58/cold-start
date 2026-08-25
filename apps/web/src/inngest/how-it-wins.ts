import type { ColdStartCard, HowItWinsJudgment } from "@cold-start/core";
import {
  createAnthropicClient,
  isTransientLlmError,
  judgeHowItWinsForAnalysis,
  synthesizeHowItWins,
  type AnthropicTelemetrySink,
  type HowItWinsModels,
  type HowItWinsResult
} from "@cold-start/llm";
import { boundedErrorMessage } from "../lib/errors";

export type HowItWinsStepResult =
  | { ok: true; value: HowItWinsResult }
  | { ok: false; error: string; judgment?: HowItWinsJudgment };

// Same catch-and-memoize pattern as emphasisReadStepBody: a transient transport failure rethrows
// so Inngest retries the step; a semantic failure (an unparseable draft, a citation that never
// made it onto the card, a judge fail-closed) is memoized as { ok: false } so a later retry never
// re-pays for the judge or the writer. Callers degrade a semantic failure to nothing_stands_out
// rather than failing the run: the how-it-wins read is a Lens category, never a reason to fail
// analysis.
//
// Editor failures never reach this catch. The frozen-writer path skips the hostile editor and
// stamps editorSkipped. The four-pass path still swallows every editor failure inside
// synthesizeHowItWins.
export async function howItWinsStepBody(input: {
  card: ColdStartCard;
  client: ReturnType<typeof createAnthropicClient>;
  models: HowItWinsModels;
  telemetry: AnthropicTelemetrySink;
}): Promise<HowItWinsStepResult> {
  let judgment: HowItWinsJudgment | undefined;
  try {
    judgment = await judgeHowItWinsForAnalysis({
      card: input.card,
      client: input.client,
      models: input.models,
      telemetry: input.telemetry
    });
    const value = await synthesizeHowItWins({
      client: input.client,
      models: input.models,
      card: input.card,
      telemetry: input.telemetry,
      judgment
    });
    return { ok: true, value };
  } catch (error) {
    if (isTransientLlmError(error)) {
      throw error;
    }
    return { ok: false, error: boundedErrorMessage(error), ...(judgment ? { judgment } : {}) };
  }
}
