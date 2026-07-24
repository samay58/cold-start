import {
  deadGenerationRunTarget,
  findResearchRunEventsByRunId,
  retireGenerationRunById,
  type ColdStartDb,
  type GenerationRunStatusSummary,
  type ResearchRunEvent
} from "@cold-start/db";

export async function retireDeadGenerationRun(
  db: ColdStartDb,
  run: GenerationRunStatusSummary,
  knownEvents?: ResearchRunEvent[]
) {
  const events = knownEvents ?? (run.id
    ? await findResearchRunEventsByRunId(db, run.id, { limit: 12 }).catch(() => [])
    : []);

  if (run.status !== "running" || !run.id || !run.startedAt) {
    return { run, events };
  }

  const target = deadGenerationRunTarget({ startedAt: run.startedAt, events });
  if (!target) {
    return { run, events };
  }

  const retired = await retireGenerationRunById(db, { id: run.id, target }).catch(() => null);
  return { run: retired ?? run, events };
}
