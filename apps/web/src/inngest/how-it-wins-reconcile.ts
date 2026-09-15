import { createDb, listHowItWinsDispatchCandidates, reconcileExpiredHowItWinsJobs, clearExpiredHowItWinsRecoveryPayloads } from "@cold-start/db";
import { webEnv } from "../lib/web-env";
import { inngest } from "./client";
import { dispatchHowItWinsJob } from "./how-it-wins-jobs";
import { howItWinsEnabled } from "./worker-env";

export const howItWinsReconcileFunction = inngest.createFunction({
  id: "how-it-wins-reconcile", triggers: { cron: "* * * * *" }, concurrency: { limit: 1 }, retries: 0
}, async ({ step }) => {
  const db = createDb(webEnv().DATABASE_URL);
  const expired = await step.run("hiw-v2-expire", () => reconcileExpiredHowItWinsJobs(db));
  await step.run("hiw-v2-expire-candidates", () => clearExpiredHowItWinsRecoveryPayloads(db));
  if (!howItWinsEnabled()) return { expired, dispatched: 0 };
  const queued = await step.run("hiw-v2-undispatched", () => listHowItWinsDispatchCandidates(db, { limit: 20 }));
  let dispatched = 0;
  for (const job of queued) {
    if (await step.run(`hiw-v2-resend:${job.id}`, () => dispatchHowItWinsJob(db, job))) dispatched += 1;
  }
  return { expired, dispatched };
});
