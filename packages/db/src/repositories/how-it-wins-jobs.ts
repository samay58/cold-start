import { createHash, randomUUID } from "node:crypto";

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

const MAX_JOB_DURATION_MS = 10 * 60 * 1_000;
const MAX_RECOVERY_TTL_MS = 24 * 60 * 60 * 1_000;
const MAX_RECOVERY_BYTES = 512 * 1_024;
const MAX_CHECKPOINT_BYTES = 512 * 1_024;
const MAX_ATTEMPT_METADATA_BYTES = 8 * 1_024;
const MAX_VALIDATION_ISSUES = 12;

export type HowItWinsCallStatus = "reserved" | "completed" | "failed" | "unknown";

export type HowItWinsValidationIssue = {
  stage: string;
  code: string;
  path: string;
  expected?: string | undefined;
  actualType?: string | undefined;
  strategyId?: string | undefined;
};

export type HowItWinsCallAttempt = {
  logicalCallId: string;
  inputHash: string;
  stage: HowItWinsJobStage;
  status: HowItWinsCallStatus;
  reservedMicrodollars: number;
  reservedAt: string;
  settledMicrodollars?: number | undefined;
  settledAt?: string | undefined;
  costBasis?: "known" | "unknown_reserved" | undefined;
  requestedModel?: string | null | undefined;
  returnedModel?: string | null | undefined;
  servingProvider?: string | null | undefined;
  responseId?: string | null | undefined;
  durationMs?: number | null | undefined;
  retryCount?: number | undefined;
  usage?: {
    inputTokens: number | null;
    outputTokens: number | null;
    cacheCreationInputTokens: number | null;
    cacheReadInputTokens: number | null;
  } | null | undefined;
  providerReportedCostMicrodollars?: number | null | undefined;
  estimateMicrodollars?: number | null | undefined;
  httpOutcome?: "succeeded" | "failed" | "unknown" | undefined;
  validationOutcome?: "valid" | "invalid" | "not_run" | undefined;
  validationIssues?: HowItWinsValidationIssue[] | undefined;
};

export type HowItWinsStageCheckpoint = {
  schemaVersion: 1;
  stage: HowItWinsJobStage;
  inputHash: string;
  resultHash: string;
  result: unknown;
  storedAt: string;
};

export type HowItWinsJobLease = {
  id: string;
  owner: string;
  version: number;
  expiresAt: Date;
};

export type StoredHowItWinsJob = {
  id: string;
  rootJobId: string;
  retryOfJobId: string | null;
  sourceAnalysisRunId: string;
  slug: string;
  evidenceHash: string;
  evaluatorSignature: string;
  executionContractVersion: number;
  inngestEventId: string;
  inngestRunId: string | null;
  dispatchAttempts: number;
  dispatchLastAttemptAt: Date | null;
  dispatchConfirmedAt: Date | null;
  status: HowItWinsJobStatus;
  stage: HowItWinsJobStage;
  reasonCode: HowItWinsJobReasonCode | null;
  outcome: HowItWinsJobOutcome | null;
  judgmentId: string | null;
  retryEligible: boolean;
  manualRetryUsed: boolean;
  configuredCapMicrodollars: number;
  reservedMicrodollars: number;
  settledMicrodollars: number;
  attempts: HowItWinsCallAttempt[];
  leaseOwner: string | null;
  leaseExpiresAt: Date | null;
  version: number;
  deadlineAt: Date;
  startedAt: Date | null;
  completedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

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

export function howItWinsJobSummary(job: StoredHowItWinsJob): HowItWinsJobSummary {
  return howItWinsJobSummarySchema.parse({
    id: job.id,
    status: job.status,
    stage: job.stage,
    reasonCode: job.reasonCode,
    canRetry: job.status === "failed"
      && job.retryEligible
      && !job.manualRetryUsed
      && job.configuredCapMicrodollars > job.reservedMicrodollars + job.settledMicrodollars,
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
  assertNonempty(input.owner, "owner", 200);
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

export async function renewHowItWinsJobLease(
  db: ColdStartDb,
  input: { jobId: string; lease: HowItWinsJobLease; leaseSeconds: number; now?: Date | undefined }
): Promise<HowItWinsJobLease | null> {
  assertPositiveInteger(input.leaseSeconds, "leaseSeconds");
  if (input.leaseSeconds > 300) throw new Error("leaseSeconds cannot exceed 300");
  const now = input.now ?? new Date();
  const expiresAt = new Date(now.getTime() + input.leaseSeconds * 1_000);
  const [row] = await db
    .update(howItWinsJobs)
    .set({ leaseExpiresAt: expiresAt, version: sql`${howItWinsJobs.version} + 1`, updatedAt: now })
    .where(and(
      eq(howItWinsJobs.id, input.jobId),
      eq(howItWinsJobs.status, "running"),
      eq(howItWinsJobs.leaseOwner, input.lease.owner),
      eq(howItWinsJobs.version, input.lease.version),
      sql`${howItWinsJobs.leaseExpiresAt} > ${now}`,
      sql`${howItWinsJobs.deadlineAt} > ${now}`
    ))
    .returning();
  return row?.leaseOwner && row.leaseExpiresAt
    ? { id: row.id, owner: row.leaseOwner, version: row.version, expiresAt: row.leaseExpiresAt }
    : null;
}

export async function advanceHowItWinsJobStage(
  db: ColdStartDb,
  input: { jobId: string; lease: HowItWinsJobLease; stage: HowItWinsJobStage; now?: Date | undefined }
): Promise<HowItWinsJobLease | null> {
  const stage = howItWinsJobStageSchema.parse(input.stage);
  const now = input.now ?? new Date();
  const [row] = await db
    .update(howItWinsJobs)
    .set({ currentStage: stage, version: sql`${howItWinsJobs.version} + 1`, updatedAt: now })
    .where(activeLeaseWhere(input.jobId, input.lease, now))
    .returning();
  return row?.leaseOwner && row.leaseExpiresAt
    ? { id: row.id, owner: row.leaseOwner, version: row.version, expiresAt: row.leaseExpiresAt }
    : null;
}

export async function reserveHowItWinsCall(
  db: ColdStartDb,
  input: {
    jobId: string;
    lease: HowItWinsJobLease;
    logicalCallId: string;
    inputHash: string;
    stage: HowItWinsJobStage;
    reservedMicrodollars: number;
    metadata: Omit<Partial<HowItWinsCallAttempt>, "logicalCallId" | "inputHash" | "stage" | "status" | "reservedMicrodollars" | "reservedAt">;
    now?: Date | undefined;
  }
): Promise<{ state: "reserved" | "existing" | "budget_exhausted" | "attempt_limit" | "lease_lost"; attempt?: HowItWinsCallAttempt; lease?: HowItWinsJobLease }> {
  assertNonempty(input.logicalCallId, "logicalCallId", 160);
  assertSha256(input.inputHash, "inputHash");
  const stage = howItWinsJobStageSchema.parse(input.stage);
  assertPositiveSafeInteger(input.reservedMicrodollars, "reservedMicrodollars");
  const metadata = sanitizeAttemptMetadata(input.metadata);
  assertJsonBytes(metadata, MAX_ATTEMPT_METADATA_BYTES, "attempt metadata");
  const now = input.now ?? new Date();
  const result = await db.execute<{ result: ReserveSql }>(sql`
    select reserve_how_it_wins_call(
      ${input.jobId}::uuid,
      ${input.lease.owner},
      ${input.lease.version}::bigint,
      ${input.logicalCallId},
      ${input.inputHash},
      ${stage},
      ${input.reservedMicrodollars}::bigint,
      ${JSON.stringify(metadata)}::jsonb,
      ${now}
    ) as result
  `);
  const row = rowsFromExecuteResult<{ result: ReserveSql }>(result)[0]?.result;
  if (!row || !["reserved", "existing", "budget_exhausted", "attempt_limit", "lease_lost"].includes(row.state)) {
    if (row?.state === "call_conflict") throw new Error(`Logical call ${input.logicalCallId} has a different input hash`);
    throw new Error("Failed to reserve How it wins call");
  }
  return {
    state: row.state as "reserved" | "existing" | "budget_exhausted" | "attempt_limit" | "lease_lost",
    ...(row.attempt ? { attempt: attemptFromUnknown(row.attempt) } : {}),
    ...(row.lease_version !== undefined ? { lease: { ...input.lease, version: numberFromSql(row.lease_version) } } : {})
  };
}

export async function settleHowItWinsCall(
  db: ColdStartDb,
  input: {
    jobId: string;
    lease: HowItWinsJobLease;
    logicalCallId: string;
    status: Exclude<HowItWinsCallStatus, "reserved">;
    actualMicrodollars: number | null;
    metadata: Omit<Partial<HowItWinsCallAttempt>, "logicalCallId" | "inputHash" | "stage" | "status" | "reservedMicrodollars" | "reservedAt" | "settledMicrodollars" | "settledAt" | "costBasis">;
    now?: Date | undefined;
  }
): Promise<{ state: "settled" | "existing" | "lease_lost"; attempt?: HowItWinsCallAttempt; lease?: HowItWinsJobLease }> {
  if (!(["completed", "failed", "unknown"] as const).includes(input.status)) throw new Error("Invalid call status");
  if (input.actualMicrodollars !== null) assertNonnegativeSafeInteger(input.actualMicrodollars, "actualMicrodollars");
  const metadata = sanitizeAttemptMetadata(input.metadata);
  assertJsonBytes(metadata, MAX_ATTEMPT_METADATA_BYTES, "settlement metadata");
  const now = input.now ?? new Date();
  const result = await db.execute<{ result: SettleSql }>(sql`
    select settle_how_it_wins_call(
      ${input.jobId}::uuid,
      ${input.lease.owner},
      ${input.lease.version}::bigint,
      ${input.logicalCallId},
      ${input.status},
      ${input.actualMicrodollars}::bigint,
      ${JSON.stringify(metadata)}::jsonb,
      ${now}
    ) as result
  `);
  const row = rowsFromExecuteResult<{ result: SettleSql }>(result)[0]?.result;
  if (!row || !["settled", "existing", "lease_lost"].includes(row.state)) {
    if (row?.state === "invalid_cost") throw new Error("Actual call cost exceeds its reservation");
    if (row?.state === "not_found") throw new Error(`Logical call ${input.logicalCallId} was not reserved`);
    throw new Error("Failed to settle How it wins call");
  }
  return {
    state: row.state as "settled" | "existing" | "lease_lost",
    ...(row.attempt ? { attempt: attemptFromUnknown(row.attempt) } : {}),
    ...(row.lease_version !== undefined ? { lease: { ...input.lease, version: numberFromSql(row.lease_version) } } : {})
  };
}

export async function annotateHowItWinsCallValidation(
  db: ColdStartDb,
  input: {
    jobId: string;
    logicalCallId: string;
    inputHash: string;
    validationOutcome: "valid" | "invalid" | "not_run";
    validationIssues?: HowItWinsValidationIssue[] | undefined;
  }
): Promise<boolean> {
  assertNonempty(input.logicalCallId, "logicalCallId", 160);
  assertSha256(input.inputHash, "inputHash");
  const metadata = sanitizeAttemptMetadata({
    validationOutcome: input.validationOutcome,
    validationIssues: input.validationIssues ?? []
  });
  assertJsonBytes(metadata, MAX_ATTEMPT_METADATA_BYTES, "validation metadata");
  const result = await db.execute<{ id: string }>(sql`
    update how_it_wins_jobs jobs
    set attempts_json = (
      select jsonb_agg(
        case when entry.value->>'logicalCallId' = ${input.logicalCallId}
          and entry.value->>'inputHash' = ${input.inputHash}
          and entry.value->>'status' in ('completed', 'failed', 'unknown')
        then entry.value || ${JSON.stringify(metadata)}::jsonb
        else entry.value end
        order by entry.ordinality
      )
      from jsonb_array_elements(jobs.attempts_json) with ordinality as entry(value, ordinality)
    )
    where jobs.id = ${input.jobId}::uuid
      and jobs.status in ('queued', 'running')
      and exists (
        select 1 from jsonb_array_elements(jobs.attempts_json) entry
        where entry->>'logicalCallId' = ${input.logicalCallId}
          and entry->>'inputHash' = ${input.inputHash}
          and entry->>'status' in ('completed', 'failed', 'unknown')
      )
    returning jobs.id
  `);
  return rowsFromExecuteResult(result).length === 1;
}

export async function storeHowItWinsStageCheckpoint(
  db: ColdStartDb,
  input: {
    jobId: string;
    lease: HowItWinsJobLease;
    checkpointId: string;
    stage: HowItWinsJobStage;
    inputHash: string;
    result: unknown;
    now?: Date | undefined;
  }
): Promise<{ checkpoint: HowItWinsStageCheckpoint; lease: HowItWinsJobLease } | null> {
  assertCheckpointId(input.checkpointId);
  assertSha256(input.inputHash, "inputHash");
  const stage = howItWinsJobStageSchema.parse(input.stage);
  const now = input.now ?? new Date();
  const result = jsonRoundTrip(input.result);
  const checkpoint: HowItWinsStageCheckpoint = {
    schemaVersion: 1,
    stage,
    inputHash: input.inputHash,
    resultHash: hashJson(result),
    result,
    storedAt: now.toISOString()
  };
  assertJsonBytes(checkpoint, MAX_CHECKPOINT_BYTES, "checkpoint");
  const [row] = await db
    .update(howItWinsJobs)
    .set({
      checkpointsJson: sql`${howItWinsJobs.checkpointsJson} || jsonb_build_object(${input.checkpointId}::text, ${JSON.stringify(checkpoint)}::jsonb)`,
      version: sql`${howItWinsJobs.version} + 1`,
      updatedAt: now
    })
    .where(activeLeaseWhere(input.jobId, input.lease, now))
    .returning();
  if (!row?.leaseOwner || !row.leaseExpiresAt) return null;
  return { checkpoint, lease: { id: row.id, owner: row.leaseOwner, version: row.version, expiresAt: row.leaseExpiresAt } };
}

export async function readHowItWinsStageCheckpoint(
  db: ColdStartDb,
  input: { jobId: string; checkpointId: string; inputHash: string }
): Promise<HowItWinsStageCheckpoint | null> {
  assertCheckpointId(input.checkpointId);
  assertSha256(input.inputHash, "inputHash");
  const rows = await db
    .select({ checkpoints: howItWinsJobs.checkpointsJson })
    .from(howItWinsJobs)
    .where(eq(howItWinsJobs.id, input.jobId))
    .limit(1);
  const value = objectValue(rows[0]?.checkpoints)?.[input.checkpointId];
  const checkpoint = checkpointFromUnknown(value);
  if (!checkpoint || checkpoint.inputHash !== input.inputHash || hashJson(checkpoint.result) !== checkpoint.resultHash) return null;
  return checkpoint;
}

export async function storeHowItWinsRecoveryPayload(
  db: ColdStartDb,
  input: {
    jobId: string;
    lease: HowItWinsJobLease;
    logicalCallId: string;
    evidenceHash: string;
    normalizedCandidate: unknown;
    expiresAt?: Date | undefined;
    now?: Date | undefined;
  }
): Promise<{ contentHash: string; lease: HowItWinsJobLease } | null> {
  assertNonempty(input.logicalCallId, "logicalCallId", 160);
  assertSha256(input.evidenceHash, "evidenceHash");
  const now = input.now ?? new Date();
  const expiresAt = input.expiresAt ?? new Date(now.getTime() + MAX_RECOVERY_TTL_MS);
  if (expiresAt <= now || expiresAt.getTime() > now.getTime() + MAX_RECOVERY_TTL_MS) {
    throw new Error("Recovery payload expiry must be within 24 hours");
  }
  const candidate = jsonRoundTrip(input.normalizedCandidate);
  const contentHash = hashJson(candidate);
  const payload = {
    schemaVersion: 1,
    logicalCallId: input.logicalCallId,
    contentHash,
    evidenceHash: input.evidenceHash,
    expiresAt: expiresAt.toISOString(),
    candidate
  };
  assertJsonBytes(payload, MAX_RECOVERY_BYTES, "recovery payload");
  const [row] = await db
    .update(howItWinsJobs)
    .set({
      recoveryPayloadJson: sql`${howItWinsJobs.recoveryPayloadJson} || jsonb_build_object(${input.logicalCallId}::text, ${JSON.stringify(payload)}::jsonb)`,
      recoveryPayloadExpiresAt: sql`greatest(coalesce(${howItWinsJobs.recoveryPayloadExpiresAt}, ${expiresAt}), ${expiresAt})`,
      version: sql`${howItWinsJobs.version} + 1`,
      updatedAt: now
    })
    .where(activeLeaseWhere(input.jobId, input.lease, now))
    .returning();
  if (!row?.leaseOwner || !row.leaseExpiresAt) return null;
  return { contentHash, lease: { id: row.id, owner: row.leaseOwner, version: row.version, expiresAt: row.leaseExpiresAt } };
}

export async function readHowItWinsRecoveryPayload(
  db: ColdStartDb,
  input: { jobId: string; logicalCallId: string; contentHash: string; evidenceHash: string; now?: Date | undefined }
): Promise<unknown | null> {
  assertSha256(input.contentHash, "contentHash");
  assertSha256(input.evidenceHash, "evidenceHash");
  const now = input.now ?? new Date();
  const rows = await db
    .select({ payloads: howItWinsJobs.recoveryPayloadJson })
    .from(howItWinsJobs)
    .where(eq(howItWinsJobs.id, input.jobId))
    .limit(1);
  const payload = objectValue(objectValue(rows[0]?.payloads)?.[input.logicalCallId]);
  if (!payload || payload.schemaVersion !== 1 || payload.logicalCallId !== input.logicalCallId) return null;
  if (payload.contentHash !== input.contentHash || payload.evidenceHash !== input.evidenceHash) return null;
  if (typeof payload.expiresAt !== "string" || new Date(payload.expiresAt) <= now) return null;
  return hashJson(payload.candidate) === input.contentHash ? payload.candidate : null;
}

export async function findHowItWinsRecoveryPayloadReference(
  db: ColdStartDb,
  input: { jobId: string; logicalCallId: string; evidenceHash: string; now?: Date | undefined }
): Promise<{ contentHash: string } | null> {
  assertNonempty(input.logicalCallId, "logicalCallId", 160);
  assertSha256(input.evidenceHash, "evidenceHash");
  const now = input.now ?? new Date();
  const rows = await db
    .select({ payloads: howItWinsJobs.recoveryPayloadJson })
    .from(howItWinsJobs)
    .where(eq(howItWinsJobs.id, input.jobId))
    .limit(1);
  const payload = objectValue(objectValue(rows[0]?.payloads)?.[input.logicalCallId]);
  if (!payload || payload.schemaVersion !== 1 || payload.logicalCallId !== input.logicalCallId) return null;
  if (payload.evidenceHash !== input.evidenceHash || typeof payload.contentHash !== "string") return null;
  if (typeof payload.expiresAt !== "string" || new Date(payload.expiresAt) <= now) return null;
  return hashJson(payload.candidate) === payload.contentHash ? { contentHash: payload.contentHash } : null;
}

export async function clearExpiredHowItWinsRecoveryPayloads(
  db: ColdStartDb,
  input: { now?: Date | undefined; limit?: number | undefined } = {}
): Promise<number> {
  const now = input.now ?? new Date();
  const limit = input.limit ?? 1_000;
  assertPositiveInteger(limit, "limit");
  const result = await db.execute<{ id: string }>(sql`
    with targets as (
      select id, recovery_payload_json
      from how_it_wins_jobs jobs
      where jobs.status in ('queued', 'running')
        and exists (
          select 1 from jsonb_each(jobs.recovery_payload_json) entry
          where (entry.value->>'expiresAt')::timestamptz <= ${now}
        )
      order by recovery_payload_expires_at
      limit ${limit}
    ), rebuilt as (
      select targets.id,
        coalesce(
          jsonb_object_agg(entry.key, entry.value)
            filter (where entry.key is not null and (entry.value->>'expiresAt')::timestamptz > ${now}),
          '{}'::jsonb
        ) as payloads,
        max((entry.value->>'expiresAt')::timestamptz)
          filter (where entry.key is not null and (entry.value->>'expiresAt')::timestamptz > ${now}) as expires_at
      from targets
      left join lateral jsonb_each(targets.recovery_payload_json) entry on true
      group by targets.id
    )
    update how_it_wins_jobs jobs set
      recovery_payload_json = rebuilt.payloads,
      recovery_payload_expires_at = rebuilt.expires_at,
      updated_at = ${now}
    from rebuilt
    where jobs.id = rebuilt.id
    returning jobs.id
  `);
  return rowsFromExecuteResult(result).length;
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

export async function reconcileExpiredHowItWinsJobs(
  db: ColdStartDb,
  input: { now?: Date | undefined; limit?: number | undefined } = {}
): Promise<number> {
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
  let settled = 0;
  for (const row of rows) {
    const result = await db.execute<{ result: boolean }>(sql`select expire_how_it_wins_job(${row.id}::uuid, ${now}) as result`);
    if (rowsFromExecuteResult<{ result: boolean }>(result)[0]?.result === true) settled += 1;
  }
  return settled;
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
  assertSha256(verified.evidenceHash, "evidenceHash");
  assertNonempty(verified.evaluatorSignature, "evaluatorSignature", 512);
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
  return value ? completeResult(value) : "not_found";
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

const jobProjection = {
  id: howItWinsJobs.id,
  rootJobId: howItWinsJobs.rootJobId,
  retryOfJobId: howItWinsJobs.retryOfJobId,
  sourceAnalysisRunId: howItWinsJobs.sourceAnalysisRunId,
  slug: howItWinsJobs.slug,
  evidenceHash: howItWinsJobs.evidenceHash,
  evaluatorSignature: howItWinsJobs.evaluatorSignature,
  executionContractVersion: howItWinsJobs.executionContractVersion,
  inngestEventId: howItWinsJobs.inngestEventId,
  inngestRunId: howItWinsJobs.inngestRunId,
  dispatchAttempts: howItWinsJobs.dispatchAttempts,
  dispatchLastAttemptAt: howItWinsJobs.dispatchLastAttemptAt,
  dispatchConfirmedAt: howItWinsJobs.dispatchConfirmedAt,
  status: howItWinsJobs.status,
  currentStage: howItWinsJobs.currentStage,
  terminalReasonCode: howItWinsJobs.terminalReasonCode,
  outcome: howItWinsJobs.outcome,
  judgmentId: howItWinsJobs.judgmentId,
  retryEligible: howItWinsJobs.retryEligible,
  manualRetryUsed: howItWinsJobs.manualRetryUsed,
  configuredCapMicrodollars: howItWinsJobs.configuredCapMicrodollars,
  reservedMicrodollars: howItWinsJobs.reservedMicrodollars,
  settledMicrodollars: howItWinsJobs.settledMicrodollars,
  attemptsJson: howItWinsJobs.attemptsJson,
  leaseOwner: howItWinsJobs.leaseOwner,
  leaseExpiresAt: howItWinsJobs.leaseExpiresAt,
  version: howItWinsJobs.version,
  deadlineAt: howItWinsJobs.deadlineAt,
  startedAt: howItWinsJobs.startedAt,
  completedAt: howItWinsJobs.completedAt,
  createdAt: howItWinsJobs.createdAt,
  updatedAt: howItWinsJobs.updatedAt
};

type JobRow = {
  id: string;
  rootJobId: string;
  retryOfJobId: string | null;
  sourceAnalysisRunId: string;
  slug: string;
  evidenceHash: string;
  evaluatorSignature: string;
  executionContractVersion: number;
  inngestEventId: string;
  inngestRunId: string | null;
  dispatchAttempts: number;
  dispatchLastAttemptAt: Date | null;
  dispatchConfirmedAt: Date | null;
  status: string;
  currentStage: string;
  terminalReasonCode: string | null;
  outcome: string | null;
  judgmentId: string | null;
  retryEligible: boolean;
  manualRetryUsed: boolean;
  configuredCapMicrodollars: number;
  reservedMicrodollars: number;
  settledMicrodollars: number;
  attemptsJson: unknown;
  leaseOwner: string | null;
  leaseExpiresAt: Date | null;
  version: number;
  deadlineAt: Date;
  startedAt: Date | null;
  completedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

function jobFromRow(row: JobRow): StoredHowItWinsJob {
  return {
    id: row.id,
    rootJobId: row.rootJobId,
    retryOfJobId: row.retryOfJobId,
    sourceAnalysisRunId: row.sourceAnalysisRunId,
    slug: row.slug,
    evidenceHash: row.evidenceHash,
    evaluatorSignature: row.evaluatorSignature,
    executionContractVersion: row.executionContractVersion,
    inngestEventId: row.inngestEventId,
    inngestRunId: row.inngestRunId,
    dispatchAttempts: row.dispatchAttempts,
    dispatchLastAttemptAt: row.dispatchLastAttemptAt,
    dispatchConfirmedAt: row.dispatchConfirmedAt,
    status: howItWinsJobStatusSchema.parse(row.status),
    stage: howItWinsJobStageSchema.parse(row.currentStage),
    reasonCode: row.terminalReasonCode === null ? null : howItWinsJobReasonCodeSchema.parse(row.terminalReasonCode),
    outcome: row.outcome === null ? null : howItWinsJobOutcomeSchema.parse(row.outcome),
    judgmentId: row.judgmentId,
    retryEligible: row.retryEligible,
    manualRetryUsed: row.manualRetryUsed,
    configuredCapMicrodollars: numberFromSql(row.configuredCapMicrodollars),
    reservedMicrodollars: numberFromSql(row.reservedMicrodollars),
    settledMicrodollars: numberFromSql(row.settledMicrodollars),
    attempts: Array.isArray(row.attemptsJson) ? row.attemptsJson.map(attemptFromUnknown) : [],
    leaseOwner: row.leaseOwner,
    leaseExpiresAt: row.leaseExpiresAt,
    version: numberFromSql(row.version),
    deadlineAt: row.deadlineAt,
    startedAt: row.startedAt,
    completedAt: row.completedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt
  };
}

function activeLeaseWhere(jobId: string, lease: HowItWinsJobLease, now: Date) {
  return and(
    eq(howItWinsJobs.id, jobId),
    eq(howItWinsJobs.status, "running"),
    eq(howItWinsJobs.leaseOwner, lease.owner),
    eq(howItWinsJobs.version, lease.version),
    sql`${howItWinsJobs.leaseExpiresAt} > ${now}`,
    sql`${howItWinsJobs.deadlineAt} > ${now}`
  );
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
  assertNonempty(input.slug, "slug", 120);
  assertSha256(input.evidenceHash, "evidenceHash");
  assertNonempty(input.evaluatorSignature, "evaluatorSignature", 512);
  assertPositiveInteger(input.executionContractVersion, "executionContractVersion");
  assertNonempty(input.inngestEventId, "inngestEventId", 300);
  assertPositiveSafeInteger(input.configuredCapMicrodollars, "configuredCapMicrodollars");
  if (input.deadlineAt <= now || input.deadlineAt.getTime() > now.getTime() + MAX_JOB_DURATION_MS) {
    throw new Error("deadlineAt must be within 10 minutes");
  }
}

function sanitizeAttemptMetadata(input: Partial<HowItWinsCallAttempt>) {
  const issues = input.validationIssues?.slice(0, MAX_VALIDATION_ISSUES).map((issue) => ({
    stage: boundedString(issue.stage, 80),
    code: boundedString(issue.code, 80),
    path: safeDiagnosticPath(issue.path),
    ...(issue.expected ? { expected: boundedString(issue.expected, 160) } : {}),
    ...(issue.actualType ? { actualType: boundedString(issue.actualType, 80) } : {}),
    ...(issue.strategyId ? { strategyId: boundedString(issue.strategyId, 100) } : {})
  }));
  return {
    ...(input.requestedModel !== undefined ? { requestedModel: nullableBoundedString(input.requestedModel, 200) } : {}),
    ...(input.returnedModel !== undefined ? { returnedModel: nullableBoundedString(input.returnedModel, 200) } : {}),
    ...(input.servingProvider !== undefined ? { servingProvider: nullableBoundedString(input.servingProvider, 100) } : {}),
    ...(input.responseId !== undefined ? { responseId: nullableBoundedString(input.responseId, 200) } : {}),
    ...(input.durationMs !== undefined ? { durationMs: nullableNonnegativeInteger(input.durationMs, "durationMs") } : {}),
    ...(input.retryCount !== undefined ? { retryCount: nonnegativeInteger(input.retryCount, "retryCount") } : {}),
    ...(input.usage !== undefined ? { usage: sanitizeUsage(input.usage) } : {}),
    ...(input.providerReportedCostMicrodollars !== undefined ? { providerReportedCostMicrodollars: nullableNonnegativeInteger(input.providerReportedCostMicrodollars, "providerReportedCostMicrodollars") } : {}),
    ...(input.estimateMicrodollars !== undefined ? { estimateMicrodollars: nullableNonnegativeInteger(input.estimateMicrodollars, "estimateMicrodollars") } : {}),
    ...(input.httpOutcome !== undefined ? { httpOutcome: input.httpOutcome } : {}),
    ...(input.validationOutcome !== undefined ? { validationOutcome: input.validationOutcome } : {}),
    ...(issues ? { validationIssues: issues } : {})
  };
}

function sanitizeUsage(value: HowItWinsCallAttempt["usage"]) {
  if (value === null) return null;
  if (!value) return undefined;
  return {
    inputTokens: nullableNonnegativeInteger(value.inputTokens, "inputTokens"),
    outputTokens: nullableNonnegativeInteger(value.outputTokens, "outputTokens"),
    cacheCreationInputTokens: nullableNonnegativeInteger(value.cacheCreationInputTokens, "cacheCreationInputTokens"),
    cacheReadInputTokens: nullableNonnegativeInteger(value.cacheReadInputTokens, "cacheReadInputTokens")
  };
}

function attemptFromUnknown(value: unknown): HowItWinsCallAttempt {
  const object = objectValue(value);
  if (!object) throw new Error("Stored How it wins attempt is not an object");
  return {
    ...object,
    logicalCallId: String(object.logicalCallId),
    inputHash: String(object.inputHash),
    stage: howItWinsJobStageSchema.parse(object.stage),
    status: callStatus(object.status),
    reservedMicrodollars: numberFromSql(object.reservedMicrodollars),
    reservedAt: String(object.reservedAt),
    ...(object.settledMicrodollars !== undefined ? { settledMicrodollars: numberFromSql(object.settledMicrodollars) } : {})
  } as HowItWinsCallAttempt;
}

function checkpointFromUnknown(value: unknown): HowItWinsStageCheckpoint | null {
  const object = objectValue(value);
  if (!object || object.schemaVersion !== 1 || typeof object.inputHash !== "string" || typeof object.resultHash !== "string" || typeof object.storedAt !== "string") return null;
  const stage = howItWinsJobStageSchema.safeParse(object.stage);
  if (!stage.success) return null;
  return { schemaVersion: 1, stage: stage.data, inputHash: object.inputHash, resultHash: object.resultHash, result: object.result, storedAt: object.storedAt };
}

function completeResult(value: string) {
  const accepted = ["succeeded", "not_found", "lease_lost", "stale_evidence", "stale_evaluator", "unsettled_calls", "card_not_found", "card_changed", "card_identity_changed"] as const;
  const result = accepted.find((entry) => entry === value);
  if (!result) throw new Error(`Unexpected How it wins completion result: ${value}`);
  return result;
}

function leaseFromSql(row: LeaseSql): HowItWinsJobLease {
  return { id: row.id, owner: row.owner, version: numberFromSql(row.version), expiresAt: new Date(row.expires_at) };
}

function callStatus(value: unknown): HowItWinsCallStatus {
  if (value === "reserved" || value === "completed" || value === "failed" || value === "unknown") return value;
  throw new Error("Stored How it wins attempt has invalid status");
}

function hashJson(value: unknown) {
  return createHash("sha256").update(stableJson(value)).digest("hex");
}

function stableJson(value: unknown): string {
  if (value === null || typeof value !== "object") {
    const serialized = JSON.stringify(value);
    if (serialized === undefined) throw new Error("Value is not JSON serializable");
    return serialized;
  }
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  return `{${Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => `${JSON.stringify(key)}:${stableJson(item)}`).join(",")}}`;
}

function jsonRoundTrip(value: unknown): unknown {
  const serialized = JSON.stringify(value);
  if (serialized === undefined) throw new Error("Value is not JSON serializable");
  return JSON.parse(serialized) as unknown;
}

function assertJsonBytes(value: unknown, limit: number, label: string) {
  if (Buffer.byteLength(JSON.stringify(value), "utf8") > limit) throw new Error(`${label} exceeds ${limit} bytes`);
}

function objectValue(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function assertCheckpointId(value: string) {
  if (!/^[a-z0-9][a-z0-9:_-]{0,79}$/.test(value)) throw new Error("checkpointId has invalid shape");
}

function assertSha256(value: string, label: string) {
  if (!/^[a-f0-9]{64}$/.test(value)) throw new Error(`${label} must be a lowercase SHA-256 hash`);
}

function assertNonempty(value: string, label: string, max: number) {
  if (!value.trim() || value.length > max) throw new Error(`${label} must contain 1-${max} characters`);
}

function assertPositiveInteger(value: number, label: string) {
  if (!Number.isInteger(value) || value < 1) throw new Error(`${label} must be a positive integer`);
}

function assertPositiveSafeInteger(value: number, label: string) {
  if (!Number.isSafeInteger(value) || value < 1) throw new Error(`${label} must be a positive safe integer`);
}

function assertNonnegativeSafeInteger(value: number, label: string) {
  if (!Number.isSafeInteger(value) || value < 0) throw new Error(`${label} must be a nonnegative safe integer`);
}

function nonnegativeInteger(value: number, label: string) {
  assertNonnegativeSafeInteger(value, label);
  return value;
}

function nullableNonnegativeInteger(value: number | null, label: string) {
  return value === null ? null : nonnegativeInteger(value, label);
}

function boundedString(value: string, max: number) {
  return value.slice(0, max);
}

const diagnosticPathFields = new Set([
  "version", "hashes", "evidencePacket", "prompt", "vocabulary", "evidenceCutoff",
  "evidenceRegistry", "evidenceId", "text", "source", "sourceDate", "attribution", "scope",
  "claims", "claimId", "statement", "supportingEvidenceIds", "materialBets", "betId", "scopeReasons",
  "strategyEvaluations", "strategyId", "disposition", "betIds", "mechanism", "evidenceGate",
  "evidenceIds", "claimIds", "counterevidenceIds", "dimensions", "evidenceStrength", "centrality",
  "materiality", "distinctiveness", "independence", "explanatoryValue", "presentRelevance",
  "historicalEvidenceIds", "presentEvidenceIds", "presentBridge", "siblingCandidateIds",
  "siblingResolutions", "notYet", "dispositionReason", "currentStrategyIds", "unusualPair",
  "openQuestions", "overallWrongCondition", "condition", "disagreements", "overrides", "calls"
]);

function safeDiagnosticPath(value: string) {
  return value
    .split(".")
    .slice(0, 16)
    .map((segment) => /^\d+$/.test(segment) || diagnosticPathFields.has(segment) ? segment : "?")
    .join(".")
    .slice(0, 240);
}

function nullableBoundedString(value: string | null, max: number) {
  return value === null ? null : boundedString(value, max);
}

function numberFromSql(value: unknown): number {
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number < 0) throw new Error("Stored microdollar or version value is unsafe");
  return number;
}

type LeaseSql = { id: string; owner: string; version: number | string; expires_at: string | Date };
type ReserveSql = { state: string; attempt?: unknown; lease_version?: number | string };
type SettleSql = ReserveSql;

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
