import { timingSafeEqual } from "node:crypto";

import {
  ALPHA_RETENTION_BATCH_SIZE,
  ALPHA_RETENTION_MAX_DELETIONS,
  alphaRetentionPlan,
  createDb,
  pruneHowItWinsJobs,
  clearExpiredHowItWinsRecoveryPayloads,
  pruneAlphaRetention
} from "@cold-start/db";

import { webEnv } from "../../../../lib/web-env";

function secretMatches(header: string | null, secret: string) {
  const expected = Buffer.from(`Bearer ${secret}`);
  const received = Buffer.from(header ?? "");
  return expected.length === received.length && timingSafeEqual(expected, received);
}

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) {
    console.error("[alpha-retention]", { signal: "cron_secret_missing" });
    return Response.json({ error: "retention job is unavailable" }, { status: 503 });
  }
  if (!secretMatches(request.headers.get("authorization"), secret)) {
    console.warn("[alpha-security]", {
      signal: "retention_auth_rejected",
      status: 401
    });
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  const plan = alphaRetentionPlan();
  const db = createDb(webEnv().DATABASE_URL);
  const result = await pruneAlphaRetention(db, {
    plan,
    kinds: ["events", "accessRequests", "howItWinsJudgments"],
    batch: ALPHA_RETENTION_BATCH_SIZE,
    maximum: ALPHA_RETENTION_MAX_DELETIONS
  });
  const howItWinsJobsDeleted = await pruneHowItWinsJobs(db, { before: plan.howItWinsJudgmentsBefore, limit: ALPHA_RETENTION_BATCH_SIZE });
  await clearExpiredHowItWinsRecoveryPayloads(db);
  const deleted = result.events.deleted;
  const accessRequestsDeleted = result.accessRequests.deleted;
  const howItWinsJudgmentsDeleted = result.howItWinsJudgments.deleted;

  const capped =
    result.events.stoppedAtMax ||
    result.accessRequests.stoppedAtMax ||
    result.howItWinsJudgments.stoppedAtMax;
  console.info("[alpha-retention]", {
    signal: "events_pruned",
    deleted,
    capped,
    before: plan.eventsBefore.toISOString()
  });

  console.info("[alpha-retention]", {
    signal: "access_requests_pruned",
    deleted: accessRequestsDeleted,
    before: plan.accessRequestsBefore.toISOString()
  });

  console.info("[alpha-retention]", {
    signal: "how_it_wins_judgments_pruned",
    deleted: howItWinsJudgmentsDeleted,
    before: plan.howItWinsJudgmentsBefore.toISOString()
  });

  return Response.json(
    {
      deleted,
      capped,
      before: plan.eventsBefore.toISOString(),
      accessRequestsDeleted,
      howItWinsJudgmentsDeleted,
      howItWinsJobsDeleted,
      howItWinsJudgmentsBefore: plan.howItWinsJudgmentsBefore.toISOString()
    },
    { headers: { "Cache-Control": "no-store" } }
  );
}
