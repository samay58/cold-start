import { createHash } from "node:crypto";

import { eq, sql } from "drizzle-orm";

import { canonicalJsonString, howItWinsJobStageSchema, type HowItWinsJobStage } from "@cold-start/core";

import { rowsFromExecuteResult, type ColdStartDb } from "../client";
import { howItWinsJobs } from "../schema";
import {
  assertJsonBytes,
  assertNonNegativeInteger,
  assertNonemptyString,
  assertPositiveInteger,
  assertSha256Hex,
  boundedString,
  jsonRoundTrip,
  nullableBoundedString,
  nullableNonNegativeInteger,
  nonNegativeInteger,
  objectValue,
  safeIntegerFromSql
} from "../validation";
import {
  activeLeaseWhere,
  attemptFromUnknown,
  checkpointFromUnknown,
  type HowItWinsCallAttempt,
  type HowItWinsCallStatus,
  type HowItWinsJobLease,
  type HowItWinsStageCheckpoint,
  type HowItWinsValidationIssue,
  type ReserveSql,
  type SettleSql
} from "./how-it-wins-job-rows";

export type {
  HowItWinsCallStatus,
  HowItWinsValidationIssue,
  HowItWinsCallAttempt,
  HowItWinsStageCheckpoint,
  HowItWinsJobLease
} from "./how-it-wins-job-rows";

const MAX_RECOVERY_TTL_MS = 24 * 60 * 60 * 1_000;
const MAX_RECOVERY_BYTES = 512 * 1_024;
const MAX_CHECKPOINT_BYTES = 512 * 1_024;
const MAX_ATTEMPT_METADATA_BYTES = 8 * 1_024;
const MAX_VALIDATION_ISSUES = 12;

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
  assertNonemptyString(input.logicalCallId, "logicalCallId", 160);
  assertSha256Hex(input.inputHash, "inputHash");
  const stage = howItWinsJobStageSchema.parse(input.stage);
  assertPositiveInteger(input.reservedMicrodollars, "reservedMicrodollars");
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
    ...(row.lease_version !== undefined ? { lease: { ...input.lease, version: safeIntegerFromSql(row.lease_version, "lease_version") } } : {})
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
  if (input.actualMicrodollars !== null) assertNonNegativeInteger(input.actualMicrodollars, "actualMicrodollars");
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
    ...(row.lease_version !== undefined ? { lease: { ...input.lease, version: safeIntegerFromSql(row.lease_version, "lease_version") } } : {})
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
  assertNonemptyString(input.logicalCallId, "logicalCallId", 160);
  assertSha256Hex(input.inputHash, "inputHash");
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
  assertSha256Hex(input.inputHash, "inputHash");
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
  assertSha256Hex(input.inputHash, "inputHash");
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
  assertNonemptyString(input.logicalCallId, "logicalCallId", 160);
  assertSha256Hex(input.evidenceHash, "evidenceHash");
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
  assertSha256Hex(input.contentHash, "contentHash");
  assertSha256Hex(input.evidenceHash, "evidenceHash");
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
  assertNonemptyString(input.logicalCallId, "logicalCallId", 160);
  assertSha256Hex(input.evidenceHash, "evidenceHash");
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

// Checkpoint and candidate hashes use the one canonical serializer shared with the judge in
// packages/llm, so a hash written here and a hash computed there agree byte for byte.
function hashJson(value: unknown) {
  return createHash("sha256").update(canonicalJsonString(value)).digest("hex");
}

function assertCheckpointId(value: string) {
  if (!/^[a-z0-9][a-z0-9:_-]{0,79}$/.test(value)) throw new Error("checkpointId has invalid shape");
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
    ...(input.durationMs !== undefined ? { durationMs: nullableNonNegativeInteger(input.durationMs, "durationMs") } : {}),
    ...(input.retryCount !== undefined ? { retryCount: nonNegativeInteger(input.retryCount, "retryCount") } : {}),
    ...(input.usage !== undefined ? { usage: sanitizeUsage(input.usage) } : {}),
    ...(input.providerReportedCostMicrodollars !== undefined ? { providerReportedCostMicrodollars: nullableNonNegativeInteger(input.providerReportedCostMicrodollars, "providerReportedCostMicrodollars") } : {}),
    ...(input.estimateMicrodollars !== undefined ? { estimateMicrodollars: nullableNonNegativeInteger(input.estimateMicrodollars, "estimateMicrodollars") } : {}),
    ...(input.httpOutcome !== undefined ? { httpOutcome: input.httpOutcome } : {}),
    ...(input.validationOutcome !== undefined ? { validationOutcome: input.validationOutcome } : {}),
    ...(issues ? { validationIssues: issues } : {})
  };
}

function sanitizeUsage(value: HowItWinsCallAttempt["usage"]) {
  if (value === null) return null;
  if (!value) return undefined;
  return {
    inputTokens: nullableNonNegativeInteger(value.inputTokens, "inputTokens"),
    outputTokens: nullableNonNegativeInteger(value.outputTokens, "outputTokens"),
    cacheCreationInputTokens: nullableNonNegativeInteger(value.cacheCreationInputTokens, "cacheCreationInputTokens"),
    cacheReadInputTokens: nullableNonNegativeInteger(value.cacheReadInputTokens, "cacheReadInputTokens")
  };
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
