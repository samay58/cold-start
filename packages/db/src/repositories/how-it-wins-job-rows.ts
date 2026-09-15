import { and, eq, sql } from "drizzle-orm";

import {
  howItWinsJobOutcomeSchema,
  howItWinsJobReasonCodeSchema,
  howItWinsJobStageSchema,
  howItWinsJobStatusSchema,
  type HowItWinsJobOutcome,
  type HowItWinsJobReasonCode,
  type HowItWinsJobStage,
  type HowItWinsJobStatus
} from "@cold-start/core";

import { howItWinsJobs } from "../schema";
import { objectValue, safeIntegerFromSql } from "../validation";

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

export const jobProjection = {
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

export type JobRow = {
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

export function jobFromRow(row: JobRow): StoredHowItWinsJob {
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
    configuredCapMicrodollars: safeIntegerFromSql(row.configuredCapMicrodollars, "configuredCapMicrodollars"),
    reservedMicrodollars: safeIntegerFromSql(row.reservedMicrodollars, "reservedMicrodollars"),
    settledMicrodollars: safeIntegerFromSql(row.settledMicrodollars, "settledMicrodollars"),
    attempts: Array.isArray(row.attemptsJson) ? row.attemptsJson.map(attemptFromUnknown) : [],
    leaseOwner: row.leaseOwner,
    leaseExpiresAt: row.leaseExpiresAt,
    version: safeIntegerFromSql(row.version, "version"),
    deadlineAt: row.deadlineAt,
    startedAt: row.startedAt,
    completedAt: row.completedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt
  };
}

export function activeLeaseWhere(jobId: string, lease: HowItWinsJobLease, now: Date) {
  return and(
    eq(howItWinsJobs.id, jobId),
    eq(howItWinsJobs.status, "running"),
    eq(howItWinsJobs.leaseOwner, lease.owner),
    eq(howItWinsJobs.version, lease.version),
    sql`${howItWinsJobs.leaseExpiresAt} > ${now}`,
    sql`${howItWinsJobs.deadlineAt} > ${now}`
  );
}

export type LeaseSql = { id: string; owner: string; version: number | string; expires_at: string | Date };
export type ReserveSql = { state: string; attempt?: unknown; lease_version?: number | string };
export type SettleSql = ReserveSql;

export function leaseFromSql(row: LeaseSql): HowItWinsJobLease {
  return { id: row.id, owner: row.owner, version: safeIntegerFromSql(row.version, "version"), expiresAt: new Date(row.expires_at) };
}

function callStatus(value: unknown): HowItWinsCallStatus {
  if (value === "reserved" || value === "completed" || value === "failed" || value === "unknown") return value;
  throw new Error("Stored How it wins attempt has invalid status");
}

export function attemptFromUnknown(value: unknown): HowItWinsCallAttempt {
  const object = objectValue(value);
  if (!object) throw new Error("Stored How it wins attempt is not an object");
  return {
    ...object,
    logicalCallId: String(object.logicalCallId),
    inputHash: String(object.inputHash),
    stage: howItWinsJobStageSchema.parse(object.stage),
    status: callStatus(object.status),
    reservedMicrodollars: safeIntegerFromSql(object.reservedMicrodollars, "reservedMicrodollars"),
    reservedAt: String(object.reservedAt),
    ...(object.settledMicrodollars !== undefined ? { settledMicrodollars: safeIntegerFromSql(object.settledMicrodollars, "settledMicrodollars") } : {})
  } as HowItWinsCallAttempt;
}

export function checkpointFromUnknown(value: unknown): HowItWinsStageCheckpoint | null {
  const object = objectValue(value);
  if (!object || object.schemaVersion !== 1 || typeof object.inputHash !== "string" || typeof object.resultHash !== "string" || typeof object.storedAt !== "string") return null;
  const stage = howItWinsJobStageSchema.safeParse(object.stage);
  if (!stage.success) return null;
  return { schemaVersion: 1, stage: stage.data, inputHash: object.inputHash, resultHash: object.resultHash, result: object.result, storedAt: object.storedAt };
}
