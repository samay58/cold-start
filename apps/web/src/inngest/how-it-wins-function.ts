import {
  createDb,
  clearExpiredHowItWinsRecoveryPayloads,
  listHowItWinsDispatchCandidates,
  listRecentlyTerminalHowItWinsJobs,
  reconcileExpiredHowItWinsJobs
} from "@cold-start/db";
import { webEnv } from "../lib/web-env";
import { inngest, type WorkerEventContext } from "./client";
import { dispatchHowItWinsJob, recordHowItWinsJobOutcome } from "./how-it-wins-jobs";
import { howItWinsV2Handler } from "./how-it-wins-v2";
import { backgroundConcurrencyLimit, howItWinsEnabled } from "./worker-env";

const HOW_IT_WINS_EVENT_NAME = "card/how-it-wins.requested" as const;

const howItWinsConcurrency = backgroundConcurrencyLimit("INNGEST_HOW_IT_WINS_CONCURRENCY");

// Every read runs on the durable job path. The legacy in-flight drain finished on 2026-09-15, so
// an event that carries no execution contract version is a stale replay: it is refused here,
// before any database read, and it pays for nothing.
export const howItWinsHandler = async ({ event, runId, step }: WorkerEventContext) => {
  if (event.data.executionContractVersion !== 2) return { status: "rejected" as const };
  return howItWinsV2Handler({ event, runId, step });
};

export const howItWinsFunction = inngest.createFunction(
  {
    id: "how-it-wins-read",
    triggers: { event: HOW_IT_WINS_EVENT_NAME },
    ...(howItWinsConcurrency ? { concurrency: { limit: howItWinsConcurrency } } : {})
  },
  howItWinsHandler
);

const REANNOUNCE_WINDOW_MS = 30 * 60 * 1_000;

export const howItWinsReconcileHandler = async ({ step }: Pick<WorkerEventContext, "step">) => {
  const db = createDb(webEnv().DATABASE_URL);
  // Three Neon round trips per tick collapsed into one step so a ten-minute tick is one short wake.
  // The new step id means a run in flight across the deploy re-executes idempotent work instead of
  // replaying a memoized number.
  const swept = await step.run("hiw-v2-reconcile", async () => {
    const settled = await reconcileExpiredHowItWinsJobs(db);
    // Expiry is where the extension's "reading" state goes to die if nobody closes the trail.
    for (const job of settled) await recordHowItWinsJobOutcome(db, { job });
    // A tick that throws mid-sweep leaves rows expired in Postgres but unannounced, and the select
    // above only matches queued and running. Re-announcing everything terminal in the last thirty
    // minutes closes that gap; the recorder returns early for a run already carrying the event.
    for (const job of await listRecentlyTerminalHowItWinsJobs(db, { since: new Date(Date.now() - REANNOUNCE_WINDOW_MS) })) {
      await recordHowItWinsJobOutcome(db, { job, reannounce: true });
    }
    await clearExpiredHowItWinsRecoveryPayloads(db);
    const queued = howItWinsEnabled() ? await listHowItWinsDispatchCandidates(db, { limit: 20 }) : [];
    return { expired: settled.length, queued };
  });
  let dispatched = 0;
  for (const job of swept.queued) {
    if (await step.run(`hiw-v2-resend:${job.id}`, () => dispatchHowItWinsJob(db, job))) dispatched += 1;
  }
  return { expired: swept.expired, dispatched };
};

export const howItWinsReconcileFunction = inngest.createFunction({
  id: "how-it-wins-reconcile",
  // Jobs carry a ten-minute deadline and the authenticated status GET settles expiry on read, so
  // nothing waits on this sweep to learn its own outcome. A per-minute tick bought nothing and
  // kept the Neon compute awake around the clock.
  triggers: { cron: "*/10 * * * *" },
  concurrency: { limit: 1 },
  retries: 0
}, howItWinsReconcileHandler);
