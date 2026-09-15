import { createHash, randomUUID } from "node:crypto";

import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { ColdStartCard } from "@cold-start/core";

import type { ColdStartDb } from "../src/client";
import {
  admitHowItWinsJob,
  admitHowItWinsManualRetry,
  annotateHowItWinsCallValidation,
  claimHowItWinsJobLease,
  clearExpiredHowItWinsRecoveryPayloads,
  completeHowItWinsJobWithCard,
  createAlphaInvite,
  deleteAlphaTesterData,
  findHowItWinsJobById,
  findHowItWinsRecoveryPayloadReference,
  finishHowItWinsJob,
  howItWinsJobSummary,
  howItWinsJobOwnedByInstallation,
  listHowItWinsDispatchCandidates,
  markHowItWinsDispatchAttempt,
  pruneHowItWinsJudgments,
  readHowItWinsRecoveryPayload,
  readHowItWinsStageCheckpoint,
  reconcileExpiredHowItWinsJobs,
  reserveHowItWinsCall,
  redeemAlphaInvite,
  settleHowItWinsCall,
  storeHowItWinsRecoveryPayload,
  storeHowItWinsStageCheckpoint,
  upsertCard
} from "../src/index";
import * as schema from "../src/schema";

const databaseUrl = process.env.CARDS_DB_TEST_URL;
const describeDatabase = databaseUrl ? describe : describe.skip;
let pool: Pool;
let db: ColdStartDb;

describeDatabase("How it wins durable jobs against Postgres", () => {
  beforeAll(async () => {
    assertSafeTestDatabase(databaseUrl);
    pool = new Pool({ connectionString: databaseUrl });
    const testDb = drizzle(pool, { schema });
    db = testDb as ColdStartDb;
    await migrate(testDb, { migrationsFolder: new URL("../drizzle", import.meta.url).pathname });
  }, 30_000);

  afterAll(async () => {
    await pool?.end();
  });

  it("atomically admits one root and joins concurrent and terminal replays from the same analysis", async () => {
    const source = await insertAnalysisRun();
    const sourceAnalysisRunId = source.id;
    const now = new Date("2026-09-14T20:00:00.000Z");
    const input = admissionInput(source, now);
    const admissions = await Promise.all(Array.from({ length: 12 }, () => admitHowItWinsJob(db, input)));

    expect(admissions.filter((entry) => entry.state === "admitted")).toHaveLength(1);
    expect(new Set(admissions.map((entry) => entry.job.id)).size).toBe(1);
    const root = admissions[0]!.job;
    expect(root.rootJobId).toBe(root.id);

    expect(await finishHowItWinsJob(db, {
      jobId: root.id,
      status: "failed",
      reasonCode: "structured_output",
      retryEligible: true,
      now: new Date(now.getTime() + 1_000)
    })).toBe(true);

    const replay = await admitHowItWinsJob(db, { ...input, now: new Date(now.getTime() + 2_000), deadlineAt: new Date(now.getTime() + 602_000) });
    expect(replay).toMatchObject({ state: "joined", job: { id: root.id, status: "failed" } });
    expect(howItWinsJobSummary(replay.job)).toMatchObject({ canRetry: true, reasonCode: "structured_output" });
  });

  it("rejects admission until the source analysis is terminal complete", async () => {
    const now = new Date("2026-09-14T20:30:00.000Z");
    const slug = `hiw-order-${randomUUID().slice(0, 8)}`;
    const [run] = await db.insert(schema.generationRuns).values({
      slug,
      domain: `${slug}.example`,
      mode: "analysis",
      jobKind: "analysis",
      status: "running",
      startedAt: new Date(now.getTime() - 1_000)
    }).returning();
    const input = admissionInput({ id: run!.id, slug }, now);

    let admissionError: unknown;
    try {
      await admitHowItWinsJob(db, input);
    } catch (error) {
      admissionError = error;
    }
    expect(String((admissionError as { cause?: Error } | undefined)?.cause?.message)).toMatch(
      /source analysis run is not a completed analysis/
    );
    expect((await pool.query(
      "select count(*)::integer as count from how_it_wins_jobs where source_analysis_run_id = $1",
      [run!.id]
    )).rows[0].count).toBe(0);
    await pool.query(
      "update generation_runs set status = 'complete', completed_at = $1 where id = $2",
      [now, run!.id]
    );
    await expect(admitHowItWinsJob(db, input)).resolves.toMatchObject({
      state: "admitted",
      job: { sourceAnalysisRunId: run!.id, status: "queued" }
    });
  });

  it("reserves against one root cap, settles known cost once, and charges unknown usage at the reservation", async () => {
    const now = new Date("2026-09-14T21:00:00.000Z");
    const root = (await admitHowItWinsJob(db, admissionInput(await insertAnalysisRun(), now, 1_000_000))).job;
    let lease = (await claimHowItWinsJobLease(db, {
      jobId: root.id,
      owner: "worker-budget",
      leaseSeconds: 300,
      now
    }))!;

    const first = await reserveHowItWinsCall(db, {
      jobId: root.id,
      lease,
      logicalCallId: "judge-initial",
      inputHash: hash("judge-initial"),
      stage: "judge_initial",
      reservedMicrodollars: 600_000,
      metadata: { requestedModel: "judge-test", estimateMicrodollars: 600_000 },
      now: new Date(now.getTime() + 1_000)
    });
    expect(first.state).toBe("reserved");
    lease = first.lease!;
    expect(await reserveHowItWinsCall(db, {
      jobId: root.id,
      lease,
      logicalCallId: "judge-initial",
      inputHash: hash("judge-initial"),
      stage: "judge_initial",
      reservedMicrodollars: 600_000,
      metadata: { requestedModel: "judge-test" },
      now: new Date(now.getTime() + 1_500)
    })).toMatchObject({ state: "existing", attempt: { reservedMicrodollars: 600_000 } });
    const firstSettlement = await settleHowItWinsCall(db, {
      jobId: root.id,
      lease,
      logicalCallId: "judge-initial",
      status: "failed",
      actualMicrodollars: 250_000,
      metadata: { httpOutcome: "succeeded", validationOutcome: "invalid" },
      now: new Date(now.getTime() + 2_000)
    });
    lease = firstSettlement.lease!;
    expect(firstSettlement.attempt).toMatchObject({ settledMicrodollars: 250_000, costBasis: "known" });
    expect(await annotateHowItWinsCallValidation(db, {
      jobId: root.id,
      logicalCallId: "judge-initial",
      inputHash: hash("judge-initial"),
      validationOutcome: "invalid",
      validationIssues: [{ stage: "global_judge", code: "invalid_type", path: "strategyEvaluations.16.disposition", actualType: "undefined" }]
    })).toBe(true);

    const second = await reserveHowItWinsCall(db, {
      jobId: root.id,
      lease,
      logicalCallId: "judge-recovery",
      inputHash: hash("judge-recovery"),
      stage: "judge_recovery",
      reservedMicrodollars: 750_001,
      metadata: { requestedModel: "judge-test" },
      now: new Date(now.getTime() + 3_000)
    });
    expect(second.state).toBe("budget_exhausted");

    const bounded = await reserveHowItWinsCall(db, {
      jobId: root.id,
      lease,
      logicalCallId: "judge-recovery",
      inputHash: hash("judge-recovery"),
      stage: "judge_recovery",
      reservedMicrodollars: 750_000,
      metadata: { requestedModel: "judge-test" },
      now: new Date(now.getTime() + 4_000)
    });
    lease = bounded.lease!;
    const unknown = await settleHowItWinsCall(db, {
      jobId: root.id,
      lease,
      logicalCallId: "judge-recovery",
      status: "unknown",
      actualMicrodollars: null,
      metadata: { httpOutcome: "unknown", validationOutcome: "not_run" },
      now: new Date(now.getTime() + 5_000)
    });
    expect(unknown.attempt).toMatchObject({ settledMicrodollars: 750_000, costBasis: "unknown_reserved" });
    const attemptLimit = await reserveHowItWinsCall(db, {
      jobId: root.id,
      lease: unknown.lease!,
      logicalCallId: "judge-third",
      inputHash: hash("judge-third"),
      stage: "judge_recovery",
      reservedMicrodollars: 1,
      metadata: { requestedModel: "judge-test" },
      now: new Date(now.getTime() + 6_000)
    });
    expect(attemptLimit.state).toBe("attempt_limit");
    const stored = await findHowItWinsJobById(db, root.id);
    expect(stored).toMatchObject({ reservedMicrodollars: 0, settledMicrodollars: 1_000_000 });
    expect(stored?.attempts[0]).toMatchObject({
      validationOutcome: "invalid",
      validationIssues: [{ code: "invalid_type", path: "strategyEvaluations.16.disposition" }]
    });
  });

  it("prunes expired recovery entries without deleting a later resumable candidate", async () => {
    const now = new Date("2026-09-14T22:30:00.000Z");
    const root = (await admitHowItWinsJob(db, admissionInput(await insertAnalysisRun(), now))).job;
    let lease = (await claimHowItWinsJobLease(db, {
      jobId: root.id,
      owner: "worker-payload-expiry",
      leaseSeconds: 300,
      now
    }))!;
    const first = await storeHowItWinsRecoveryPayload(db, {
      jobId: root.id,
      lease,
      logicalCallId: "judge-initial",
      evidenceHash: root.evidenceHash,
      normalizedCandidate: { result: "first" },
      expiresAt: new Date(now.getTime() + 1_000),
      now: new Date(now.getTime() + 100)
    });
    lease = first!.lease;
    const second = await storeHowItWinsRecoveryPayload(db, {
      jobId: root.id,
      lease,
      logicalCallId: "judge-recovery",
      evidenceHash: root.evidenceHash,
      normalizedCandidate: { result: "second" },
      expiresAt: new Date(now.getTime() + 2_000),
      now: new Date(now.getTime() + 200)
    });

    expect(await clearExpiredHowItWinsRecoveryPayloads(db, {
      now: new Date(now.getTime() + 1_500)
    })).toBeGreaterThanOrEqual(1);
    expect(await findHowItWinsRecoveryPayloadReference(db, {
      jobId: root.id,
      logicalCallId: "judge-initial",
      evidenceHash: root.evidenceHash,
      now: new Date(now.getTime() + 1_500)
    })).toBeNull();
    expect(await findHowItWinsRecoveryPayloadReference(db, {
      jobId: root.id,
      logicalCallId: "judge-recovery",
      evidenceHash: root.evidenceHash,
      now: new Date(now.getTime() + 1_500)
    })).toEqual({ contentHash: second!.contentHash });
    expect(await storeHowItWinsStageCheckpoint(db, {
      jobId: root.id,
      lease: second!.lease,
      checkpointId: "writer:after-cleanup",
      stage: "writer",
      inputHash: hash("after-cleanup"),
      result: { status: "nothing_stands_out" },
      now: new Date(now.getTime() + 1_600)
    })).not.toBeNull();
  });

  it("clears invalid candidate payloads at terminal state but carries valid checkpoints into the one manual retry", async () => {
    const now = new Date("2026-09-14T22:00:00.000Z");
    const source = await insertAnalysisRun();
    const sourceAnalysisRunId = source.id;
    const root = (await admitHowItWinsJob(db, admissionInput(source, now))).job;
    let lease = (await claimHowItWinsJobLease(db, { jobId: root.id, owner: "worker-recovery", leaseSeconds: 300, now }))!;
    const checkpoint = await storeHowItWinsStageCheckpoint(db, {
      jobId: root.id,
      lease,
      checkpointId: "writer:v1",
      stage: "writer",
      inputHash: hash("writer-input"),
      result: { status: "nothing_stands_out", inQuestion: [] },
      now: new Date(now.getTime() + 1_000)
    });
    lease = checkpoint!.lease;
    const recovery = await storeHowItWinsRecoveryPayload(db, {
      jobId: root.id,
      lease,
      logicalCallId: "judge-initial",
      evidenceHash: root.evidenceHash,
      normalizedCandidate: { strategyEvaluations: [{ missing: "disposition" }] },
      now: new Date(now.getTime() + 2_000)
    });
    lease = recovery!.lease;
    expect(await findHowItWinsRecoveryPayloadReference(db, {
      jobId: root.id,
      logicalCallId: "judge-initial",
      evidenceHash: root.evidenceHash,
      now: new Date(now.getTime() + 3_000)
    })).toEqual({ contentHash: recovery!.contentHash });
    expect(await readHowItWinsRecoveryPayload(db, {
      jobId: root.id,
      logicalCallId: "judge-initial",
      contentHash: recovery!.contentHash,
      evidenceHash: root.evidenceHash,
      now: new Date(now.getTime() + 3_000)
    })).toMatchObject({ strategyEvaluations: expect.any(Array) });

    expect(await finishHowItWinsJob(db, {
      jobId: root.id,
      lease,
      status: "failed",
      reasonCode: "structured_output",
      retryEligible: true,
      now: new Date(now.getTime() + 4_000)
    })).toBe(true);
    expect(await findHowItWinsRecoveryPayloadReference(db, {
      jobId: root.id,
      logicalCallId: "judge-initial",
      evidenceHash: root.evidenceHash,
      now: new Date(now.getTime() + 5_000)
    })).toBeNull();

    const retry = await admitHowItWinsManualRetry(db, {
      failedJobId: root.id,
      sourceAnalysisRunId,
      slug: root.slug,
      evidenceHash: root.evidenceHash,
      evaluatorSignature: root.evaluatorSignature,
      executionContractVersion: root.executionContractVersion,
      inngestEventId: `how-it-wins:${randomUUID()}`,
      deadlineAt: new Date(now.getTime() + 605_000),
      now: new Date(now.getTime() + 5_000)
    });
    expect(retry.state).toBe("admitted");
    const retryJob = retry.job!;
    expect(await readHowItWinsStageCheckpoint(db, {
      jobId: retryJob.id,
      checkpointId: "writer:v1",
      inputHash: hash("writer-input")
    })).toMatchObject({ stage: "writer", result: { status: "nothing_stands_out" } });
    const duplicate = await admitHowItWinsManualRetry(db, {
      failedJobId: root.id,
      sourceAnalysisRunId,
      slug: root.slug,
      evidenceHash: root.evidenceHash,
      evaluatorSignature: root.evaluatorSignature,
      executionContractVersion: root.executionContractVersion,
      inngestEventId: `how-it-wins:${randomUUID()}`,
      deadlineAt: new Date(now.getTime() + 606_000),
      now: new Date(now.getTime() + 6_000)
    });
    expect(duplicate).toMatchObject({ state: "joined", job: { id: retryJob.id } });
  });

  it("settles an expired lease as unknown without replaying its reserved call", async () => {
    const now = new Date("2026-09-14T23:00:00.000Z");
    const root = (await admitHowItWinsJob(db, admissionInput(await insertAnalysisRun(), now))).job;
    let lease = (await claimHowItWinsJobLease(db, { jobId: root.id, owner: "worker-expiry", leaseSeconds: 1, now }))!;
    expect(await claimHowItWinsJobLease(db, {
      jobId: root.id,
      owner: "worker-conflict",
      leaseSeconds: 1,
      now: new Date(now.getTime() + 50)
    })).toBeNull();
    lease = (await reserveHowItWinsCall(db, {
      jobId: root.id,
      lease,
      logicalCallId: "writer",
      inputHash: hash("writer"),
      stage: "writer",
      reservedMicrodollars: 100_000,
      metadata: {},
      now: new Date(now.getTime() + 100)
    })).lease!;

    expect(await reconcileExpiredHowItWinsJobs(db, { now: new Date(now.getTime() + 1_100) })).toBeGreaterThanOrEqual(1);
    const expired = await findHowItWinsJobById(db, root.id);
    expect(expired).toMatchObject({ status: "failed", reasonCode: "lease_lost", reservedMicrodollars: 0, settledMicrodollars: 100_000 });
    expect(expired?.attempts[0]).toMatchObject({ status: "unknown", costBasis: "unknown_reserved" });
    expect(await settleHowItWinsCall(db, {
      jobId: root.id,
      lease,
      logicalCallId: "writer",
      status: "completed",
      actualMicrodollars: 20_000,
      metadata: {},
      now: new Date(now.getTime() + 1_200)
    })).toMatchObject({ state: "lease_lost" });
  });

  it("atomically writes the verified card and terminal job while preserving TTL columns", async () => {
    const now = new Date("2026-09-15T00:00:00.000Z");
    const card = cardFixture();
    await upsertCard(db, card);
    const judgmentId = randomUUID();
    const alternateJudgmentId = randomUUID();
    await pool.query(
      `insert into how_it_wins_judgments (
        id, evidence_packet_hash, prompt_hash, vocabulary_hash, slug, model, judgment_json, created_at
      ) values ($1, $2, $3, $4, $5, $6, '{}'::jsonb, $7)`,
      [judgmentId, hash("old-evidence"), hash("old-prompt"), hash("old-vocabulary"), card.slug, "judge-test", new Date("2026-01-01T00:00:00.000Z")]
    );
    await pool.query(
      `insert into how_it_wins_judgments (
        id, evidence_packet_hash, prompt_hash, vocabulary_hash, slug, model, judgment_json, created_at
      ) values ($1, $2, $3, $4, $5, $6, '{}'::jsonb, $7)`,
      [alternateJudgmentId, hash("new-evidence"), hash("new-prompt"), hash("new-vocabulary"), card.slug, "judge-test", now]
    );
    const root = (await admitHowItWinsJob(db, admissionInput(await insertAnalysisRun(card.slug), now))).job;
    const lease = (await claimHowItWinsJobLease(db, { jobId: root.id, owner: "worker-store", leaseSeconds: 300, stage: "storage", now }))!;
    const before = await pool.query("select identity_expires_at, signals_expires_at, synthesis_expires_at from cards where slug = $1", [card.slug]);

    expect(await completeHowItWinsJobWithCard(db, {
      jobId: root.id,
      lease,
      outcome: "nothing_stands_out",
      judgmentId,
      verifyAndMutate: (current) => ({
        evidenceHash: hash("stale-evidence"),
        evaluatorSignature: root.evaluatorSignature,
        card: current
      }),
      now: new Date(now.getTime() + 500)
    })).toBe("stale_evidence");
    expect(await completeHowItWinsJobWithCard(db, {
      jobId: root.id,
      lease,
      outcome: "nothing_stands_out",
      verifyAndMutate: (current) => ({
        evidenceHash: root.evidenceHash,
        evaluatorSignature: hash("stale-evaluator"),
        card: current
      }),
      now: new Date(now.getTime() + 600)
    })).toBe("stale_evaluator");
    expect(await findHowItWinsJobById(db, root.id)).toMatchObject({ status: "running" });

    const outcome = await completeHowItWinsJobWithCard(db, {
      jobId: root.id,
      lease,
      outcome: "nothing_stands_out",
      verifyAndMutate: (current) => ({
        evidenceHash: root.evidenceHash,
        evaluatorSignature: root.evaluatorSignature,
        card: { ...current, synthesis: { ...current.synthesis!, howItWins: { status: "nothing_stands_out", inQuestion: [] } } }
      }),
      now: new Date(now.getTime() + 1_000)
    });
    expect(outcome).toBe("succeeded");
    const after = await pool.query("select card_json, identity_expires_at, signals_expires_at, synthesis_expires_at from cards where slug = $1", [card.slug]);
    expect(after.rows[0].card_json.synthesis.howItWins.status).toBe("nothing_stands_out");
    expect(after.rows[0].identity_expires_at).toEqual(before.rows[0].identity_expires_at);
    expect(after.rows[0].signals_expires_at).toEqual(before.rows[0].signals_expires_at);
    expect(after.rows[0].synthesis_expires_at).toEqual(before.rows[0].synthesis_expires_at);
    expect(await findHowItWinsJobById(db, root.id)).toMatchObject({ status: "succeeded", outcome: "nothing_stands_out" });
    await expect(pool.query("update how_it_wins_jobs set terminal_reason_code = 'changed' where id = $1", [root.id]))
      .rejects.toThrow(/immutable/);
    await expect(pool.query("update how_it_wins_jobs set judgment_id = $1 where id = $2", [alternateJudgmentId, root.id]))
      .rejects.toThrow(/immutable/);
    expect(await pruneHowItWinsJudgments(db, {
      before: new Date("2026-04-01T00:00:00.000Z")
    })).toBe(1);
    expect(await findHowItWinsJobById(db, root.id)).toMatchObject({
      status: "succeeded",
      judgmentId: null
    });
  });

  it("caps uncertain dispatch at three records under the same event identity", async () => {
    const now = new Date("2026-09-15T01:00:00.000Z");
    const root = (await admitHowItWinsJob(db, admissionInput(await insertAnalysisRun(), now))).job;
    expect((await listHowItWinsDispatchCandidates(db, { now })).some((candidate) => candidate.id === root.id)).toBe(true);
    for (let index = 0; index < 3; index += 1) {
      const marked = await markHowItWinsDispatchAttempt(db, {
        jobId: root.id,
        inngestEventId: root.inngestEventId,
        now: new Date(now.getTime() + index * 1_000)
      });
      expect(marked?.dispatchAttempts).toBe(index + 1);
      expect(marked?.inngestEventId).toBe(root.inngestEventId);
      if (index === 0) {
        expect((await listHowItWinsDispatchCandidates(db, {
          now: new Date(now.getTime() + 30_000),
          retryAfterMs: 60_000
        })).some((candidate) => candidate.id === root.id)).toBe(false);
        expect((await listHowItWinsDispatchCandidates(db, {
          now: new Date(now.getTime() + 61_000),
          retryAfterMs: 60_000
        })).some((candidate) => candidate.id === root.id)).toBe(true);
      }
    }
    expect(await markHowItWinsDispatchAttempt(db, {
      jobId: root.id,
      inngestEventId: root.inngestEventId,
      now: new Date(now.getTime() + 4_000)
    })).toBeNull();
    expect((await listHowItWinsDispatchCandidates(db, {
      now: new Date(now.getTime() + 120_000)
    })).some((candidate) => candidate.id === root.id)).toBe(false);
  });

  it("removes installation-linked jobs with tester data and preserves operator jobs", async () => {
    const now = new Date("2026-09-15T02:00:00.000Z");
    const alphaSource = await insertAnalysisRun();
    const operatorSource = await insertAnalysisRun();
    const alphaJob = (await admitHowItWinsJob(db, admissionInput(alphaSource, now))).job;
    const operatorJob = (await admitHowItWinsJob(db, admissionInput(operatorSource, now))).job;
    const tokenHash = hash(`invite-${randomUUID()}`);
    const invite = await createAlphaInvite(db, {
      label: `hiw-owner-${randomUUID()}`,
      tokenHash,
      scopes: ["cards:read", "generation:write"],
      expiresAt: new Date(now.getTime() + 24 * 60 * 60 * 1_000),
      now
    });
    const auth = await redeemAlphaInvite(db, {
      tokenHash,
      accessTokenHash: hash(`installation-${randomUUID()}`),
      browser: "chrome",
      channel: "unpacked",
      extensionVersion: "0.0.0-test",
      now
    });
    await db.insert(schema.alphaRunRequests).values({
      inviteId: invite.id,
      installationId: auth!.installation.id,
      interactionId: randomUUID(),
      allowanceKind: "lens",
      slug: alphaSource.slug,
      domain: `${alphaSource.slug}.example`,
      disposition: "joined",
      generationRunId: alphaSource.id,
      createdAt: now
    });

    expect(await howItWinsJobOwnedByInstallation(db, alphaSource.id, auth!.installation.id)).toBe(true);
    expect(await deleteAlphaTesterData(db, invite.id)).toBe(true);
    expect(await findHowItWinsJobById(db, alphaJob.id)).toBeNull();
    expect(await findHowItWinsJobById(db, operatorJob.id)).not.toBeNull();
  });
});

async function insertAnalysisRun(slug = `hiw-${randomUUID().slice(0, 8)}`) {
  const [run] = await db.insert(schema.generationRuns).values({
    slug,
    domain: `${slug}.example`,
    mode: "analysis",
    jobKind: "analysis",
    status: "complete",
    completedAt: new Date()
  }).returning();
  return { id: run!.id, slug };
}

function admissionInput(source: { id: string; slug: string }, now: Date, configuredCapMicrodollars = 2_000_000) {
  return {
    sourceAnalysisRunId: source.id,
    slug: source.slug,
    evidenceHash: hash(randomUUID()),
    evaluatorSignature: hash(randomUUID()),
    executionContractVersion: 2,
    inngestEventId: `how-it-wins:${randomUUID()}`,
    configuredCapMicrodollars,
    deadlineAt: new Date(now.getTime() + 10 * 60 * 1_000),
    now
  };
}

function hash(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function cardFixture(): ColdStartCard {
  const suffix = randomUUID().slice(0, 8);
  const generatedAt = "2026-09-14T19:00:00.000Z";
  return {
    slug: `hiw-card-${suffix}`,
    domain: `hiw-card-${suffix}.example`,
    generatedAt,
    generationCostUsd: 0.5,
    cacheStatus: "miss",
    identity: {
      name: { value: "Test", status: "verified", confidence: "high", citationIds: ["c1"] },
      logoUrl: null,
      oneLiner: { value: "Test company", status: "verified", confidence: "high", citationIds: ["c1"] },
      hq: { value: null, status: "unknown", confidence: "low", citationIds: [] },
      foundedYear: { value: 2026, status: "verified", confidence: "high", citationIds: ["c1"] },
      status: "private"
    },
    funding: {
      totalRaisedUsd: { value: null, status: "unknown", confidence: "low", citationIds: [] },
      lastRound: { value: null, status: "unknown", confidence: "low", citationIds: [] },
      investors: { value: [], status: "verified", confidence: "high", citationIds: ["c1"] }
    },
    team: {
      founders: { value: [], status: "verified", confidence: "high", citationIds: ["c1"] },
      keyExecs: { value: [], status: "verified", confidence: "high", citationIds: ["c1"] },
      headcount: { value: null, status: "unknown", confidence: "low", citationIds: [] }
    },
    signals: [],
    comparables: [],
    synthesis: {
      whyItMatters: { text: "Test", citationIds: ["c1"] },
      bullCase: [],
      bearCase: [],
      openQuestions: [],
      howItWinsEvaluator: { contractVersion: 1, signature: hash("card-evaluator") }
    },
    citations: [{ id: "c1", url: "https://example.com", title: "Test", fetchedAt: generatedAt, sourceType: "company_site", snippet: "Test" }]
  };
}

function assertSafeTestDatabase(value: string | undefined): asserts value is string {
  if (!value) throw new Error("CARDS_DB_TEST_URL is required");
  const url = new URL(value);
  if (!["127.0.0.1", "localhost"].includes(url.hostname) || !url.pathname.endsWith("_test")) {
    throw new Error("CARDS_DB_TEST_URL must point to a local database ending in _test");
  }
}
