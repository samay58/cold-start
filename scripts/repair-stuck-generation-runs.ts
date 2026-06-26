// One-shot repair for generation runs stranded in `running` by the Neon HTTP trace-persist
// bug (fixed in the generate-card worker + updateGenerationRunTrace). Those runs finished their
// card work but never reached a terminal status, so they sit `running` with an empty trace until
// stale cleanup retires them. This retires them accurately by the run's own event trail:
// a run that emitted a card event (card.saved / card.enriched / card.partial) produced usable
// output and is marked `complete`; one that never produced a card is marked `failed`.
//
// Writes are guarded on the row still being `running` and older than the stale threshold, so an
// in-flight or already-healed run is never touched.
//
// Usage:
//   set -a; source .env.production.migrate.local; set +a
//   npm run repair:stuck-runs                 # dry run, prints the plan, no writes
//   npm run repair:stuck-runs -- --apply      # write the terminal statuses
import { and, eq, inArray, lt } from "drizzle-orm";

import { createDb, generationRunStaleAfterMs, generationRuns, researchRunEvents } from "@cold-start/db";

const CARD_EVENT_TYPES = ["card.saved", "card.enriched", "card.partial"];

function applyMode() {
  return process.argv.includes("--apply");
}

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is required");
  }

  const db = createDb(databaseUrl);
  const now = new Date();
  const cutoff = new Date(now.getTime() - generationRunStaleAfterMs);

  const stale = await db
    .select({
      id: generationRuns.id,
      slug: generationRuns.slug,
      mode: generationRuns.mode,
      jobKind: generationRuns.jobKind,
      startedAt: generationRuns.startedAt
    })
    .from(generationRuns)
    .where(and(eq(generationRuns.status, "running"), lt(generationRuns.startedAt, cutoff)));

  const ids = stale.map((row) => row.id);
  const cardEvents = ids.length
    ? await db
        .select({ runId: researchRunEvents.runId })
        .from(researchRunEvents)
        .where(and(inArray(researchRunEvents.runId, ids), inArray(researchRunEvents.type, CARD_EVENT_TYPES)))
    : [];
  const producedCard = new Set(cardEvents.map((event) => event.runId));

  const plan = stale.map((row) => ({
    id: row.id,
    slug: row.slug,
    mode: row.mode,
    jobKind: row.jobKind,
    startedAt: row.startedAt,
    target: producedCard.has(row.id) ? ("complete" as const) : ("failed" as const)
  }));

  let updated = 0;
  if (applyMode()) {
    for (const row of plan) {
      const values =
        row.target === "complete"
          ? { status: "complete" as const, completedAt: now, error: null }
          : {
              status: "failed" as const,
              completedAt: now,
              error: "stale run retired: no card produced before trace persistence failed"
            };
      const result = await db
        .update(generationRuns)
        .set(values)
        .where(
          and(
            eq(generationRuns.id, row.id),
            eq(generationRuns.status, "running"),
            lt(generationRuns.startedAt, cutoff)
          )
        )
        .returning({ id: generationRuns.id });
      updated += result.length;
    }
  }

  console.log(
    JSON.stringify(
      {
        mode: applyMode() ? "apply" : "dry-run",
        staleRunning: stale.length,
        toComplete: plan.filter((row) => row.target === "complete").length,
        toFail: plan.filter((row) => row.target === "failed").length,
        updated,
        plan
      },
      null,
      2
    )
  );
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
