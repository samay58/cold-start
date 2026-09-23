// The judge's side of the Jev screen (Phase 5 of
// docs/superpowers/specs/2026-09-22-how-it-wins-layered-screen.md): the scope a screen hands the
// judge, the rows code files for what the screen dropped, and the citation check's findings.
import {
  HOW_IT_WINS_STRATEGIES,
  HowItWinsJudgmentClosedError,
  type HowItWinsJudgmentBody,
  type HowItWinsStrategyId,
  type SemanticHowItWinsJudgment
} from "@cold-start/core";

// The Jev screen's Round 1 result for one company. The judge rules only on
// strategyIds; every other strategy is filed as insufficient evidence with its screen score.
// Leads are hints the judge may use to decide where to look, never evidence.
export type HowItWinsJudgeScope = {
  version: string;
  // The screen configuration this scope came from. A scoped verdict is filed under it, not under
  // the scope itself; see HOW_IT_WINS_SCREEN_IDENTITY.
  identity: string;
  strategyIds: HowItWinsStrategyId[];
  screenedOut: Array<{ strategyId: HowItWinsStrategyId; roundOne: number }>;
  leads: {
    unusuallyStrong: HowItWinsStrategyId[];
    lookalikeRisk: HowItWinsStrategyId[];
    vague: HowItWinsStrategyId[];
  };
};

// Checks each current ruling against the evidence it cites. Returns the strategies whose citations
// do not show the stated mechanism; the judge sends those to adjudication as material disputes.
export type HowItWinsCitationCheck = (body: HowItWinsJudgmentBody) => Promise<Array<{
  strategyId: HowItWinsStrategyId;
  support: number;
}>>;

function howItWinsScreenedOutReason(roundOne: number, version: string) {
  return `Screened out before judging: no specific supporting fact (${version}, ${roundOne.toFixed(2)}).`;
}

// A scoped judge returns rows for its scope and may add a row for a strategy the screen dropped.
// Every strategy with no row is filed as screened out, and the rows are put back in vocabulary
// order. A scoped strategy with no row is a contract violation, which earns the one re-ask.
export function completeScopedJudgment(
  parsed: SemanticHowItWinsJudgment,
  scope: HowItWinsJudgeScope
): SemanticHowItWinsJudgment {
  const rows = new Map(parsed.strategyEvaluations.map((row) => [row.strategyId, row]));
  const missing = scope.strategyIds.filter((id) => !rows.has(id));
  if (missing.length > 0) {
    throw new HowItWinsJudgmentClosedError(`scoped judgment is missing rows for: ${missing.join(", ")}`);
  }
  const screened = new Map(scope.screenedOut.map((entry) => [entry.strategyId, entry.roundOne]));
  return {
    ...parsed,
    strategyEvaluations: HOW_IT_WINS_STRATEGIES.map((strategy) => rows.get(strategy.id) ?? {
      strategyId: strategy.id,
      disposition: "insufficient_evidence" as const,
      evidenceGate: "unresolved" as const,
      dispositionReason: howItWinsScreenedOutReason(screened.get(strategy.id) ?? 0, scope.version)
    })
  };
}

type CitationFinding = {
  kind: "evidence";
  material: true;
  summary: string;
  strategyIds: HowItWinsStrategyId[];
  evidenceIds: string[];
};

// Jev reads each current ruling beside the evidence it cites. A failure is never fatal: the check
// is a second opinion, and the judgment already cost the run. Flags become material findings for
// the one adjudication pass, and notes for the refinement record.
export async function runHowItWinsCitationCheck(
  check: HowItWinsCitationCheck | undefined,
  body: HowItWinsJudgmentBody
): Promise<{ findings: CitationFinding[]; notes: string[] }> {
  if (!check || body.currentStrategyIds.length === 0) return { findings: [], notes: [] };
  try {
    const flagged = await check(body);
    return {
      findings: flagged.map((entry) => ({
        kind: "evidence",
        material: true,
        summary: `The evidence cited for ${entry.strategyId} may not show its stated mechanism (citation check ${entry.support.toFixed(2)}). Keep it current only if the cited sources show the mechanism itself.`,
        strategyIds: [entry.strategyId],
        evidenceIds: body.strategyEvaluations.find((row) => row.strategyId === entry.strategyId)?.evidenceIds ?? []
      })),
      notes: flagged.map((entry) => `citation check flagged ${entry.strategyId} at ${entry.support.toFixed(2)}`)
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { findings: [], notes: [`citation check failed: ${message}`.slice(0, 300)] };
  }
}
