import { randomUUID } from "node:crypto";

import { and, desc, eq, inArray, sql } from "drizzle-orm";

import {
  coldStartCardSchema,
  howItWinsJobOutcomeSchema,
  howItWinsJobReasonCodeSchema,
  howItWinsJobStageSchema,
  howItWinsJobStatusSchema,
  howItWinsJobSummarySchema,
  type ColdStartCard,
  type HowItWinsJobOutcome,
  type HowItWinsJobReasonCode,
  type HowItWinsJobStage,
  type HowItWinsJobStatus,
  type HowItWinsJobSummary
} from "@cold-start/core";

import { rowsFromExecuteResult, type ColdStartDb } from "../client";
import { alphaRunRequests, cards, howItWinsJobs } from "../schema";
import { assertNonemptyString, assertPositiveInteger, assertSha256Hex } from "../validation";
import { jobFromRow, jobProjection, leaseFromSql, type HowItWinsJobLease, type LeaseSql, type StoredHowItWinsJob } from "./how-it-wins-job-rows";

export type { StoredHowItWinsJob } from "./how-it-wins-job-rows";

const MAX_JOB_DURATION_MS = 10 * 60 * 1_000;
const COMPLETE_CARD_ATTEMPTS = 5;

export type HowItWinsAdmission = {
  state: "admitted" | "joined";
  job: StoredHowItWinsJob;
};

export type HowItWinsRetryAdmission =
  | HowItWinsAdmission
  | { state: "not_found" | "not_retryable" | "retry_exhausted" | "identity_mismatch" | "active_conflict"; job: StoredHowItWinsJob | null };

type AdmissionSql = { state: HowItWinsRetryAdmission["state"]; id?: string };

export async function admitHowItWinsJob(
  db: ColdStartDb,
  input: {
    sourceAnalysisRunId: string;
    slug: string;
    evidenceHash: string;
    evaluatorSignature: string;
    executionContractVersion: number;
    inngestEventId: string;
    configuredCapMicrodollars: number;
    deadlineAt: Date;
    now?: Date | undefined;
    id?: string | undefined;
  }
): Promise<HowItWinsAdmission> {
  const now = input.now ?? new Date();
  validateAdmission(input, now);
  const id = input.id ?? randomUUID();
  const result = await db.execute<{ result: AdmissionSql }>(sql`
    select admit_how_it_wins_job(
      ${id}::uuid,
      ${input.sourceAnalysisRunId}::uuid,
      ${input.slug},
      ${input.evidenceHash},
      ${input.evaluatorSignature},
      ${input.executionContractVersion},
      ${input.inngestEventId},
      ${input.configuredCapMicrodollars}::bigint,
      ${input.deadlineAt},
      ${now}
    ) as result
  `);
  const admission = rowsFromExecuteResult<{ result: AdmissionSql }>(result)[0]?.result;
  if (!admission?.id || (admission.state !== "admitted" && admission.state !== "joined")) {
    throw new Error("Failed to admit How it wins job");
  }
  const job = await findHowItWinsJobById(db, admission.id);
  if (!job) throw new Error(`Admitted How it wins job ${admission.id} was not found`);
  return { state: admission.state, job };
}

export async function admitHowItWinsManualRetry(
  db: ColdStartDb,
  input: {
    failedJobId: string;
    sourceAnalysisRunId: string;
    slug: string;
    evidenceHash: string;
    evaluatorSignature: string;
    executionContractVersion: number;
    inngestEventId: string;
    deadlineAt: Date;
    now?: Date | undefined;
    id?: string | undefined;
  }
): Promise<HowItWinsRetryAdmission> {
  const now = input.now ?? new Date();
  validateAdmission({ ...input, configuredCapMicrodollars: 1 }, now);
  const id = input.id ?? randomUUID();
  const result = await db.execute<{ result: AdmissionSql }>(sql`
    select admit_how_it_wins_retry(
      ${id}::uuid,
      ${input.failedJobId}::uuid,
      ${input.sourceAnalysisRunId}::uuid,
      ${input.slug},
      ${input.evidenceHash},
      ${input.evaluatorSignature},
      ${input.executionContractVersion},
      ${input.inngestEventId},
      ${input.deadlineAt},
      ${now}
    ) as result
  `);
  const admission = rowsFromExecuteResult<{ result: AdmissionSql }>(result)[0]?.result;
  if (!admission) throw new Error("Failed to evaluate How it wins retry admission");
  const job = admission.id ? await findHowItWinsJobById(db, admission.id) : null;
  if (admission.state === "admitted" || admission.state === "joined") {
    if (!job) throw new Error(`Admitted How it wins retry ${admission.id ?? "unknown"} was not found`);
    return { state: admission.state, job };
  }
  return { state: admission.state, job };
}

export async function findHowItWinsJobById(db: ColdStartDb, id: string): Promise<StoredHowItWinsJob | null> {
  const rows = await db.select(jobProjection).from(howItWinsJobs).where(eq(howItWinsJobs.id, id)).limit(1);
  return rows[0] ? jobFromRow(rows[0]) : null;
}

export async function findLatestHowItWinsJobBySlug(
  db: ColdStartDb,
  slug: string
): Promise<StoredHowItWinsJob | null> {
  const rows = await db
    .select(jobProjection)
    .from(howItWinsJobs)
    .where(eq(howItWinsJobs.slug, slug))
    .orderBy(desc(howItWinsJobs.createdAt))
    .limit(1);
  return rows[0] ? jobFromRow(rows[0]) : null;
}

export function howItWinsJobSummary(job: StoredHowItWinsJob, root: StoredHowItWinsJob | null = null): HowItWinsJobSummary {
  // The cap and the one-manual-retry flag live on the root row (finish_how_it_wins_job and
  // admit_how_it_wins_retry in migration 0019 write them there), not on a retry row itself.
  const canRetry = job.retryOfJobId === null
    ? job.status === "failed"
      && job.retryEligible
      && !job.manualRetryUsed
      && job.configuredCapMicrodollars > job.reservedMicrodollars + job.settledMicrodollars
    : job.status === "failed"
      && job.retryEligible
      && root !== null
      && root.id === job.rootJobId
      && !root.manualRetryUsed
      && root.configuredCapMicrodollars > root.reservedMicrodollars + root.settledMicrodollars;
  return howItWinsJobSummarySchema.parse({
    id: job.id,
    status: job.status,
    stage: job.stage,
    reasonCode: job.reasonCode,
    canRetry,
    deadlineAt: job.deadlineAt.toISOString(),
    updatedAt: job.updatedAt.toISOString(),
    ...(job.outcome ? { outcome: job.outcome } : {})
  });
}

export async function howItWinsJobOwnedByInstallation(
  db: ColdStartDb,
  sourceAnalysisRunId: string,
  installationId: string
): Promise<boolean> {
  const rows = await db
    .select({ id: alphaRunRequests.id })
    .from(alphaRunRequests)
    .where(and(
      eq(alphaRunRequests.generationRunId, sourceAnalysisRunId),
      eq(alphaRunRequests.installationId, installationId)
    ))
    .limit(1);
  return rows.length === 1;
}

export type HowItWinsDispatchCandidate = {
  id: string;
  sourceAnalysisRunId: string;
  slug: string;
  evidenceHash: string;
  evaluatorSignature: string;
  executionContractVersion: number;
  inngestEventId: string;
  dispatchAttempts: number;
};

export async function markHowItWinsDispatchAttempt(
  db: ColdStartDb,
  input: { jobId: string; inngestEventId: string; now?: Date | undefined }
): Promise<HowItWinsDispatchCandidate | null> {
  const now = input.now ?? new Date();
  const [row] = await db
    .update(howItWinsJobs)
    .set({
      dispatchAttempts: sql`${howItWinsJobs.dispatchAttempts} + 1`,
      dispatchLastAttemptAt: now,
      version: sql`${howItWinsJobs.version} + 1`,
      updatedAt: now
    })
    .where(and(
      eq(howItWinsJobs.id, input.jobId),
      eq(howItWinsJobs.inngestEventId, input.inngestEventId),
      eq(howItWinsJobs.status, "queued"),
      sql`${howItWinsJobs.dispatchConfirmedAt} is null`,
      sql`${howItWinsJobs.dispatchAttempts} < 3`,
      sql`${howItWinsJobs.deadlineAt} > ${now}`
    ))
    .returning();
  return row ? dispatchFromRow(row) : null;
}

export async function confirmHowItWinsDispatch(
  db: ColdStartDb,
  input: { jobId: string; inngestEventId: string; inngestRunId?: string | null | undefined; now?: Date | undefined }
): Promise<boolean> {
  const now = input.now ?? new Date();
  const rows = await db
    .update(howItWinsJobs)
    .set({
      dispatchConfirmedAt: now,
      ...(input.inngestRunId ? { inngestRunId: input.inngestRunId } : {}),
      updatedAt: now
    })
    .where(and(
      eq(howItWinsJobs.id, input.jobId),
      eq(howItWinsJobs.inngestEventId, input.inngestEventId),
      inArray(howItWinsJobs.status, ["queued", "running"])
    ))
    .returning();
  return rows.length === 1;
}

export async function listHowItWinsDispatchCandidates(
  db: ColdStartDb,
  input: { now?: Date | undefined; retryAfterMs?: number | undefined; limit?: number | undefined } = {}
): Promise<HowItWinsDispatchCandidate[]> {
  const now = input.now ?? new Date();
  const retryAfterMs = input.retryAfterMs ?? 60_000;
  const limit = input.limit ?? 100;
  assertPositiveInteger(retryAfterMs, "retryAfterMs");
  assertPositiveInteger(limit, "limit");
  const retryBefore = new Date(now.getTime() - retryAfterMs);
  return db
    .select(dispatchProjection)
    .from(howItWinsJobs)
    .where(and(
      eq(howItWinsJobs.status, "queued"),
      sql`${howItWinsJobs.dispatchConfirmedAt} is null`,
      sql`${howItWinsJobs.dispatchAttempts} < 3`,
      sql`${howItWinsJobs.deadlineAt} > ${now}`,
      sql`(${howItWinsJobs.dispatchLastAttemptAt} is null or ${howItWinsJobs.dispatchLastAttemptAt} <= ${retryBefore})`
    ))
    .orderBy(howItWinsJobs.createdAt)
    .limit(limit);
}

export async function claimHowItWinsJobLease(
  db: ColdStartDb,
  input: {
    jobId: string;
    owner: string;
    leaseSeconds: number;
    stage?: HowItWinsJobStage | undefined;
    inngestRunId?: string | null | undefined;
    now?: Date | undefined;
  }
): Promise<HowItWinsJobLease | null> {
  assertNonemptyString(input.owner, "owner", 200);
  assertPositiveInteger(input.leaseSeconds, "leaseSeconds");
  if (input.leaseSeconds > 300) throw new Error("leaseSeconds cannot exceed 300");
  const stage = howItWinsJobStageSchema.parse(input.stage ?? "judge_initial");
  const now = input.now ?? new Date();
  const result = await db.execute<{ result: LeaseSql | null }>(sql`
    select claim_how_it_wins_job(
      ${input.jobId}::uuid,
      ${input.owner},
      ${input.leaseSeconds},
      ${stage},
      ${input.inngestRunId ?? null},
      ${now}
    ) as result
  `);
  const row = rowsFromExecuteResult<{ result: LeaseSql | null }>(result)[0]?.result;
  return row ? leaseFromSql(row) : null;
}

export async function finishHowItWinsJob(
  db: ColdStartDb,
  input: {
    jobId: string;
    lease?: HowItWinsJobLease | undefined;
    status: Extract<HowItWinsJobStatus, "failed" | "cancelled" | "superseded">;
    reasonCode: HowItWinsJobReasonCode;
    retryEligible: boolean;
    now?: Date | undefined;
  }
): Promise<boolean> {
  const status = howItWinsJobStatusSchema.parse(input.status);
  const reason = howItWinsJobReasonCodeSchema.parse(input.reasonCode);
  const now = input.now ?? new Date();
  const result = await db.execute<{ result: boolean }>(sql`
    select finish_how_it_wins_job(
      ${input.jobId}::uuid,
      ${input.lease?.owner ?? null},
      ${input.lease?.version ?? 0}::bigint,
      ${status}::how_it_wins_job_status,
      ${reason},
      ${input.retryEligible},
      ${now}
    ) as result
  `);
  return rowsFromExecuteResult<{ result: boolean }>(result)[0]?.result === true;
}

// Returns the rows this sweep settled, re-read after expiry, so a caller can record the terminal
// outcome on the source run (the how-it-wins.complete event) without a second lookup.
export async function reconcileExpiredHowItWinsJobs(
  db: ColdStartDb,
  input: { now?: Date | undefined; limit?: number | undefined } = {}
): Promise<StoredHowItWinsJob[]> {
  const now = input.now ?? new Date();
  const limit = input.limit ?? 100;
  assertPositiveInteger(limit, "limit");
  const rows = await db
    .select({ id: howItWinsJobs.id })
    .from(howItWinsJobs)
    .where(and(
      inArray(howItWinsJobs.status, ["queued", "running"]),
      sql`(${howItWinsJobs.deadlineAt} <= ${now}
        or (${howItWinsJobs.status} = 'running' and ${howItWinsJobs.leaseExpiresAt} <= ${now}))`
    ))
    .orderBy(howItWinsJobs.deadlineAt)
    .limit(limit);
  const settled: StoredHowItWinsJob[] = [];
  for (const row of rows) {
    const result = await db.execute<{ result: boolean }>(sql`select expire_how_it_wins_job(${row.id}::uuid, ${now}) as result`);
    if (rowsFromExecuteResult<{ result: boolean }>(result)[0]?.result !== true) continue;
    const job = await findHowItWinsJobById(db, row.id);
    if (job) settled.push(job);
  }
  return settled;
}

// Rows that turned terminal since `since`, newest first. The reconcile sweep re-announces these so
// a tick that threw mid-sweep cannot leave a job expired in Postgres but unannounced on its run.
export async function listRecentlyTerminalHowItWinsJobs(
  db: ColdStartDb,
  input: { since: Date; limit?: number | undefined }
): Promise<StoredHowItWinsJob[]> {
  const limit = input.limit ?? 50;
  assertPositiveInteger(limit, "limit");
  const rows = await db
    .select(jobProjection)
    .from(howItWinsJobs)
    .where(sql`${howItWinsJobs.status} not in ('queued', 'running') and ${howItWinsJobs.updatedAt} >= ${input.since}`)
    .orderBy(desc(howItWinsJobs.updatedAt))
    .limit(limit);
  return rows.map(jobFromRow);
}

export async function completeHowItWinsJobWithCard(
  db: ColdStartDb,
  input: {
    jobId: string;
    lease: HowItWinsJobLease;
    outcome: HowItWinsJobOutcome;
    judgmentId?: string | null | undefined;
    verifyAndMutate: (current: ColdStartCard) => {
      evidenceHash: string;
      evaluatorSignature: string;
      card: ColdStartCard;
    };
    now?: Date | undefined;
  }
): Promise<"succeeded" | "not_found" | "lease_lost" | "stale_evidence" | "stale_evaluator" | "unsettled_calls" | "card_not_found" | "card_changed" | "card_identity_changed"> {
  const outcome = howItWinsJobOutcomeSchema.parse(input.outcome);
  // A concurrent enrichment write bumps cards.version between this read and the compare-and-set
  // below, and the read it would discard was already paid for. Re-read the row, re-verify the
  // evidence against it, and try again; only an exhausted loop reports card_changed.
  for (let attempt = 0; attempt < COMPLETE_CARD_ATTEMPTS; attempt += 1) {
    const rows = await db
      .select({ cardJson: cards.cardJson, version: cards.version })
      .from(cards)
      .innerJoin(howItWinsJobs, eq(howItWinsJobs.slug, cards.slug))
      .where(eq(howItWinsJobs.id, input.jobId))
      .limit(1);
    const row = rows[0];
    if (!row) return "card_not_found";
    const current = coldStartCardSchema.parse(row.cardJson);
    const verified = input.verifyAndMutate(current);
    assertSha256Hex(verified.evidenceHash, "evidenceHash");
    assertNonemptyString(verified.evaluatorSignature, "evaluatorSignature", 512);
    const next = coldStartCardSchema.parse(verified.card);
    if (next.slug !== current.slug || next.domain !== current.domain) throw new Error("Card mutation cannot change identity");
    const now = input.now ?? new Date();
    const result = await db.execute<{ result: string }>(sql`
      select complete_how_it_wins_job_with_card(
        ${input.jobId}::uuid,
        ${input.lease.owner},
        ${input.lease.version}::bigint,
        ${row.version}::bigint,
        ${verified.evidenceHash},
        ${verified.evaluatorSignature},
        ${JSON.stringify(next)}::jsonb,
        ${next.cacheStatus === "stale" ? "hit" : next.cacheStatus}::cache_status,
        ${String(next.generationCostUsd)}::numeric,
        ${new Date(next.generatedAt)},
        ${outcome}::how_it_wins_job_outcome,
        ${input.judgmentId ?? null}::uuid,
        ${now}
      ) as result
    `);
    const value = rowsFromExecuteResult<{ result: string }>(result)[0]?.result;
    const settled = value ? completeResult(value) : "not_found";
    if (settled !== "card_changed") return settled;
  }
  return "card_changed";
}

export async function pruneHowItWinsJobs(
  db: ColdStartDb,
  input: { before: Date; limit?: number | undefined }
): Promise<number> {
  const limit = input.limit ?? 1_000;
  assertPositiveInteger(limit, "limit");
  const result = await db.execute<{ id: string }>(sql`
    with doomed as (
      select root.id
      from how_it_wins_jobs root
      where root.id = root.root_job_id
        and root.status in ('succeeded', 'failed', 'cancelled', 'superseded')
        and root.updated_at < ${input.before}
        and not exists (
          select 1 from how_it_wins_jobs child
          where child.root_job_id = root.id
            and child.status in ('queued', 'running')
        )
      order by root.updated_at
      limit ${limit}
    )
    delete from how_it_wins_jobs jobs
    using doomed
    where jobs.id = doomed.id
    returning jobs.id
  `);
  return rowsFromExecuteResult(result).length;
}

function validateAdmission(input: {
  slug: string;
  evidenceHash: string;
  evaluatorSignature: string;
  executionContractVersion: number;
  inngestEventId: string;
  configuredCapMicrodollars: number;
  deadlineAt: Date;
}, now: Date) {
  assertNonemptyString(input.slug, "slug", 120);
  assertSha256Hex(input.evidenceHash, "evidenceHash");
  assertNonemptyString(input.evaluatorSignature, "evaluatorSignature", 512);
  assertPositiveInteger(input.executionContractVersion, "executionContractVersion");
  assertNonemptyString(input.inngestEventId, "inngestEventId", 300);
  assertPositiveInteger(input.configuredCapMicrodollars, "configuredCapMicrodollars");
  if (input.deadlineAt <= now || input.deadlineAt.getTime() > now.getTime() + MAX_JOB_DURATION_MS) {
    throw new Error("deadlineAt must be within 10 minutes");
  }
}

function completeResult(value: string) {
  const accepted = ["succeeded", "not_found", "lease_lost", "stale_evidence", "stale_evaluator", "unsettled_calls", "card_not_found", "card_changed", "card_identity_changed"] as const;
  const result = accepted.find((entry) => entry === value);
  if (!result) throw new Error(`Unexpected How it wins completion result: ${value}`);
  return result;
}

const dispatchProjection = {
  id: howItWinsJobs.id,
  sourceAnalysisRunId: howItWinsJobs.sourceAnalysisRunId,
  slug: howItWinsJobs.slug,
  evidenceHash: howItWinsJobs.evidenceHash,
  evaluatorSignature: howItWinsJobs.evaluatorSignature,
  executionContractVersion: howItWinsJobs.executionContractVersion,
  inngestEventId: howItWinsJobs.inngestEventId,
  dispatchAttempts: howItWinsJobs.dispatchAttempts
};

function dispatchFromRow(row: typeof howItWinsJobs.$inferSelect): HowItWinsDispatchCandidate {
  return {
    id: row.id,
    sourceAnalysisRunId: row.sourceAnalysisRunId,
    slug: row.slug,
    evidenceHash: row.evidenceHash,
    evaluatorSignature: row.evaluatorSignature,
    executionContractVersion: row.executionContractVersion,
    inngestEventId: row.inngestEventId,
    dispatchAttempts: row.dispatchAttempts
  };
}
