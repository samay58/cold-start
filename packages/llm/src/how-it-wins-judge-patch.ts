// Missing-row patch for the global judgment. When the judge returns a judgment that is short some
// strategy rows, asking again for all 80 cost $0.41 to $0.49 and 87 to 110 s on 2 of 8 cards
// (September 22, 2026). The patch asks only for the missing rows, merges them into the first
// answer, and the merged judgment goes through the same validation as any other. If the patch
// fails anywhere, the caller falls back to the single full re-ask.
import {
  HOW_IT_WINS_STRATEGIES,
  globalJudgmentTransportSchema,
  stripUnknownNullTransportFields,
  type HowItWinsStrategyId,
  type SemanticHowItWinsJudgment
} from "@cold-start/core";

type Transport = SemanticHowItWinsJudgment & { betRevision?: unknown };

// Past this many missing rows the patch saves little over a full re-ask, and a judgment that
// short is more likely wrong in other ways too.
export const HOW_IT_WINS_PATCH_MAX_MISSING_ROWS = 40;

export const HOW_IT_WINS_PATCH_CALL_SUFFIX = "patch";

function parsedTransport(output: unknown): Transport | null {
  const parsed = globalJudgmentTransportSchema.safeParse(stripUnknownNullTransportFields(output));
  return parsed.success ? parsed.data : null;
}

// The ids a patch should fill, in canonical order, or null when the output is not a
// missing-rows case: it does not parse, repeats a row, has a row outside the expected set, is
// complete, or is missing too many rows to be worth patching.
export function howItWinsMissingRowIds(
  output: unknown,
  expectedIds: readonly HowItWinsStrategyId[]
): HowItWinsStrategyId[] | null {
  const transport = parsedTransport(output);
  if (!transport) return null;
  const present = transport.strategyEvaluations.map((row) => row.strategyId);
  const presentSet = new Set(present);
  const expectedSet = new Set(expectedIds);
  if (presentSet.size !== present.length || present.some((id) => !expectedSet.has(id))) return null;
  const missing = expectedIds.filter((id) => !presentSet.has(id));
  if (missing.length === 0 || missing.length > HOW_IT_WINS_PATCH_MAX_MISSING_ROWS) return null;
  return missing;
}

export function howItWinsPatchInstruction(missingIds: readonly HowItWinsStrategyId[]) {
  return [
    `Your previous judgment, in previousNormalizedOutput, left out ${missingIds.length} strategy row${missingIds.length === 1 ? "" : "s"}: ${missingIds.join(", ")}.`,
    "Return strategyEvaluations with exactly one row for each id in missingStrategyIds and no other rows. Every other row stands as written.",
    "betRefs number the materialBets in previousNormalizedOutput. Copy materialBets, unusualPair, openQuestions, overallWrongCondition, disagreements and overrides from previousNormalizedOutput unchanged.",
    "currentStrategyIds is the previous list plus any missing strategy you judge current."
  ].join(" ");
}

// Keeps everything from the first answer and takes only the missing rows from the patch, placed
// in canonical order. Any current strategy the patch adds joins the end of the current list; the
// deterministic repair pass and validation that follow decide whether the result stands.
export function mergeHowItWinsPatch(
  first: unknown,
  patch: unknown,
  missingIds: readonly HowItWinsStrategyId[]
): Transport {
  const base = parsedTransport(first);
  const patchTransport = parsedTransport(patch);
  if (!base || !patchTransport) throw new Error("patch merge needs two parseable judgments");
  const missing = new Set(missingIds);
  const patchRows = new Map(
    patchTransport.strategyEvaluations
      .filter((row) => missing.has(row.strategyId))
      .map((row) => [row.strategyId, row])
  );
  const unfilled = missingIds.filter((id) => !patchRows.has(id));
  if (unfilled.length > 0) throw new Error(`patch still missing strategy rows: ${unfilled.join(", ")}`);
  const baseRows = new Map(base.strategyEvaluations.map((row) => [row.strategyId, row]));
  const strategyEvaluations = HOW_IT_WINS_STRATEGIES.flatMap((strategy) => {
    const row = baseRows.get(strategy.id) ?? patchRows.get(strategy.id);
    return row ? [row] : [];
  });
  const addedCurrent = missingIds.filter((id) => patchRows.get(id)?.disposition === "current");
  return {
    ...base,
    strategyEvaluations,
    currentStrategyIds: [...base.currentStrategyIds, ...addedCurrent.filter((id) => !base.currentStrategyIds.includes(id))]
  };
}
