import type { ColdStartCard } from "@cold-start/core";
import {
  createAnthropicClient,
  isTransientLlmError,
  synthesizeHowItWins,
  type AnthropicTelemetrySink,
  type HowItWinsModels,
  type HowItWinsResult
} from "@cold-start/llm";
import { boundedErrorMessage } from "../lib/errors";

export type HowItWinsStepResult = { ok: true; value: HowItWinsResult } | { ok: false; error: string };

// Same catch-and-memoize pattern as emphasisReadStepBody: a transient transport failure rethrows
// so Inngest retries the step; a semantic failure (an unparseable draft, a citation that never
// made it onto the card) is memoized as { ok: false } so a later retry never re-pays for the four
// passes. Callers degrade a semantic failure to nothing_stands_out rather than failing the run:
// the how-it-wins read is a Lens category, never a reason to fail analysis.
//
// Editor failures never reach this catch. synthesizeHowItWins swallows every one of them, sets
// editorSkipped, and carries the pre-editor draft forward. Only writer-side failures land here:
// transient ones rethrow, semantic ones return { ok: false }.
export async function howItWinsStepBody(input: {
  card: ColdStartCard;
  client: ReturnType<typeof createAnthropicClient>;
  models: HowItWinsModels;
  telemetry: AnthropicTelemetrySink;
}): Promise<HowItWinsStepResult> {
  try {
    const value = await synthesizeHowItWins({
      client: input.client,
      models: input.models,
      card: input.card,
      telemetry: input.telemetry
    });
    return { ok: true, value };
  } catch (error) {
    if (isTransientLlmError(error)) {
      throw error;
    }
    return { ok: false, error: boundedErrorMessage(error) };
  }
}
