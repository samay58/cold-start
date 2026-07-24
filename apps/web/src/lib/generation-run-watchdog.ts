import {
  deadGenerationRunTarget,
  findGenerationRunById,
  findResearchRunEventsByRunId,
  retireGenerationRunById,
  retireStaleGenerationRuns,
  runProducedCardEvent,
  settleAlphaRunRequest,
  type ColdStartDb,
  type GenerationRunStatusSummary,
  type ResearchRunEvent
} from "@cold-start/db";
import { boundedErrorMessage } from "./errors";

export async function retireDeadGenerationRun(
  db: ColdStartDb,
  run: GenerationRunStatusSummary,
  knownEvents?: ResearchRunEvent[]
) {
  const events = knownEvents ?? (run.id
    ? await findResearchRunEventsByRunId(db, run.id, { limit: 12 }).catch(() => [])
    : []);

  // A queued row dies the same way a running one does: the executor that was meant to pick it up
  // never did, and nothing else will retire it.
  if ((run.status !== "running" && run.status !== "queued") || !run.id || !run.startedAt) {
    return { run, events };
  }

  const runId = run.id;
  const silentTarget = deadGenerationRunTarget({ startedAt: run.startedAt, events });
  if (!silentTarget) {
    return { run, events };
  }

  // The event tail only carries the newest events, so a card write older than that window looks
  // like no card at all. Ask the full trail before calling this run a failure.
  const target = silentTarget === "complete" || (await runProducedCardEvent(db, runId).catch(() => false))
    ? "complete"
    : "failed";

  const alphaSettlement = await settleAlphaRunRequest(db, {
    generationRunId: runId,
    outcome: target === "failed" ? "watchdog_retired" : "complete",
    failureCode: target === "failed" ? "timeout" : null,
    costUsd: run.costUsd ?? null,
    error: target === "failed" ? run.error ?? null : null
  });
  if (alphaSettlement?.applied) {
    const settledRun = await findGenerationRunById(db, runId);
    return { run: settledRun ?? run, events };
  }
  const retired = await retireGenerationRunById(db, { id: runId, target }).catch(() => null);
  return { run: retired ?? run, events };
}

// Retiring a stale run only closes the generation_runs row. When that run was started by an alpha
// principal it also holds a reserved allowance, and nothing else settles it, so the reservation
// would sit against the invitation for good. Settlement is best-effort on purpose: a failure here
// is worth a signal, never worth failing the request the caller actually made.
async function settleRetiredStaleRuns(db: ColdStartDb, retired: Array<{ id: string }>) {
  for (const run of retired) {
    await settleAlphaRunRequest(db, {
      generationRunId: run.id,
      outcome: "watchdog_retired",
      failureCode: "timeout"
    }).catch((error) => {
      console.warn("[alpha-security]", {
        signal: "stale_run_settlement_failed",
        generationRunId: run.id,
        error: boundedErrorMessage(error)
      });
      return null;
    });
  }
}

export async function retireAndSettleStaleGenerationRuns(
  db: ColdStartDb,
  input: Parameters<typeof retireStaleGenerationRuns>[1]
) {
  await settleRetiredStaleRuns(db, await retireStaleGenerationRuns(db, input));
}
