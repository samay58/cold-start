import { z } from "zod";
import {
  howItWinsSchema, howItWinsJudgmentSchema, howItWinsJudgmentBodySchema, howItWinsThinFileReason,
  type ColdStartCard, type HowItWins, type HowItWinsRead, type GenerationTrace,
  type HowItWinsJobReasonCode
} from "@cold-start/core";
import {
  createDb, findCardBySlug, findHowItWinsJobById, findHowItWinsJudgment,
  storeHowItWinsJudgment, finishHowItWinsJob, completeHowItWinsJobWithCard,
  readHowItWinsStageCheckpoint, storeHowItWinsStageCheckpoint,
  type ColdStartDb, type HowItWinsJudgmentInputHashes, type StoredHowItWinsJob,
  type StoredHowItWinsJudgment
} from "@cold-start/db";
import {
  createAnthropicClient, createHowItWinsCitationCheck, createJevAsk, hashHowItWinsJudgeValue,
  howItWinsJudgeScopeFromScreen, judgeHowItWinsForAnalysis, synthesizeHowItWins, verifySynthesis,
  HowItWinsJudgeClosedError, type HowItWinsJudgeScope, type HowItWinsPrimaryJudgment, type HowItWinsScreenResult
} from "@cold-start/llm";
import { verifyHowItWinsRead } from "@cold-start/pipeline";
import { webEnv } from "../lib/web-env";
import type { GenerationStepTools, WorkerEventContext } from "./client";
import { howItWinsJudgeInputs, howItWinsJudgeSummary, type HowItWinsJudgeSummary } from "./how-it-wins";
import { howItWinsExecutionConfig, howItWinsJobIdentity, recordHowItWinsJobOutcome } from "./how-it-wins-jobs";
import { createHowItWinsExecution, howItWinsFailureReason, HowItWinsExecutionError } from "./how-it-wins-execution";
import {
  HOW_IT_WINS_SCREEN_TIMEOUT_MS, howItWinsScreenShadow, howItWinsScreenTrace, runHowItWinsScreen
} from "./how-it-wins-screen-shadow";
import { howItWinsEnabled, howItWinsScreenMode } from "./worker-env";

type HowItWinsTraceBlock = NonNullable<GenerationTrace["howItWins"]>;
type HowItWinsConfig = ReturnType<typeof howItWinsExecutionConfig>;
type HowItWinsExecution = ReturnType<typeof createHowItWinsExecution>;
type HowItWinsStoreOutcome = Awaited<ReturnType<typeof completeHowItWinsJobWithCard>>;

// Everything one paid stage needs. The three stages below add only what they use on top of it.
type StageInput = {
  db: ColdStartDb;
  job: StoredHowItWinsJob;
  config: HowItWinsConfig;
  execution: HowItWinsExecution;
  card: ColdStartCard;
  client: ReturnType<typeof createAnthropicClient>;
};

const PRIMARY_NOTES = z.object({
  judgmentId: z.string(),
  repairs: z.array(z.string().min(1).max(300)).max(200)
});

// The terminal row a reason settles onto. Anything absent here is a plain failure.
const TERMINAL_STATUS_BY_REASON: Partial<Record<HowItWinsJobReasonCode, "superseded" | "cancelled">> = {
  stale_evidence: "superseded",
  stale_evaluator: "superseded",
  cancelled: "cancelled"
};

// The shadow screen's worst case is two 8 s Jev requests plus one rate-limit retry.
const SCREEN_SHADOW_MIN_REMAINING_MS = 90_000;

const RETRY_ELIGIBLE_REASONS: readonly HowItWinsJobReasonCode[] = [
  "structured_output", "semantic_contract", "transient_provider", "deadline_expired", "internal_storage"
];

// The reason a refused store settles under. card_changed survives the repository's own re-verify
// loop, so it is contention rather than moved evidence: it is absent here and falls through to
// internal_storage, which stays retry-eligible.
const STORE_FAILURE_REASON: Partial<Record<HowItWinsStoreOutcome, HowItWinsJobReasonCode>> = {
  stale_evidence: "stale_evidence",
  stale_evaluator: "stale_evaluator"
};

// The two writes a run owes whatever happens: the job row settles once, and the parent analysis
// run is paid its outcome exactly once. `judgment` carries what notify needs to name the verdict:
// the hashes this run computed, and whether it paid for that verdict or replayed a stored one.
function createHowItWinsOutcome(input: { db: ColdStartDb; job: StoredHowItWinsJob; runId: string; step: GenerationStepTools }) {
  const { db, job, runId, step } = input;
  const judgment: { hashes?: HowItWinsJudgmentInputHashes; cached: boolean; screen?: HowItWinsTraceBlock["screen"] } = { cached: true };
  let notified = false;

  // Best-effort and idempotent: one memoized step, and call rows are keyed by label so a replay
  // cannot append the same attempt twice. A trace write must never fail the job or lose accounting,
  // which is already committed on the job row by the time this runs.
  const notify = async (current: StoredHowItWinsJob | null) => {
    if (notified || !current || current.status === "queued" || current.status === "running") return;
    notified = true;
    // The judgment table is keyed by its three input hashes, so the terminal row's judgmentId is
    // resolved back to a body through the hashes this run computed.
    const hashes = judgment.hashes;
    const stored = current.judgmentId && hashes ? await findHowItWinsJudgment(db, hashes).catch(() => null) : null;
    const filed = hashes && stored && stored.id === current.judgmentId ? { hashes, stored } : null;
    const judgmentRef: HowItWinsTraceBlock["judgmentRef"] | undefined = filed
      ? { id: filed.stored.id, evidencePacketHash: filed.hashes.evidencePacketHash, promptHash: filed.hashes.promptHash, cached: judgment.cached }
      : undefined;
    const judgeSummary: HowItWinsJudgeSummary | undefined = filed ? howItWinsJudgeSummary(filed.stored.judgment) : undefined;
    await step.run("hiw-v2-notify", async () => {
      await recordHowItWinsJobOutcome(db, { job: current, judgmentRef, judgeSummary, screen: judgment.screen });
      return null;
    });
  };

  // One read of the terminal row, shared by the compatibility event, the parent summary, and the
  // returned status: finishHowItWinsJob rewrites abandoned reservations, so the row has to be
  // re-read once after it lands rather than once per consumer.
  const finish = async (reason: HowItWinsJobReasonCode) => {
    let current = await findHowItWinsJobById(db, job.id);
    if (current && (current.status === "queued" || current.status === "running")) {
      const lease = current.leaseOwner === runId && current.leaseExpiresAt
        ? { id: current.id, owner: runId, version: current.version, expiresAt: current.leaseExpiresAt } : undefined;
      if (current.status === "queued" || lease) {
        await finishHowItWinsJob(db, { jobId: job.id, ...(lease ? { lease } : {}),
          status: TERMINAL_STATUS_BY_REASON[reason] ?? "failed",
          reasonCode: reason,
          retryEligible: RETRY_ELIGIBLE_REASONS.includes(reason) });
        current = await findHowItWinsJobById(db, job.id);
      }
    }
    await notify(current);
    return { jobId: job.id, status: current?.status ?? "failed" };
  };

  return { judgment, finish, notify };
}

// The all-80 verdict for this evidence, replayed from the judgment table when it is already
// filed and paid for once when it is not. A primary judgment stored by an earlier attempt of the
// same job resumes from its own checkpoint, so a retried run never re-pays for the global pass.
// A scoped run's scope is part of its prompt hash, so it never replays an unscoped verdict.
async function resolveJudgment(input: StageInput & {
  step: GenerationStepTools;
  hashes: HowItWinsJudgmentInputHashes;
  scoped?: { scope: HowItWinsJudgeScope; apiKey: string };
}) {
  const { db, job, config, execution, card, client, step, hashes, scoped } = input;
  const filed = await findHowItWinsJudgment(db, hashes);
  if (filed) return { judgmentId: filed.id, judgment: filed, cached: true };

  const primaryHashes = { ...hashes, promptHash: hashHowItWinsJudgeValue({
    phase: "validated-primary-v2", promptHash: hashes.promptHash
  }) };
  const primary = await findHowItWinsJudgment(db, primaryHashes);
  let resumePrimaryJudgment: HowItWinsPrimaryJudgment | undefined;
  if (primary) {
    const notes = await readHowItWinsStageCheckpoint(db, { jobId: job.id,
      checkpointId: "primary-notes", inputHash: primaryHashes.promptHash });
    const parsedNotes = PRIMARY_NOTES.safeParse(notes?.result);
    resumePrimaryJudgment = { schemaVersion: 1, hashes: primary.judgment.hashes,
      body: howItWinsJudgmentBodySchema.parse(primary.judgment), calls: primary.judgment.calls,
      ...(parsedNotes.success && parsedNotes.data.judgmentId === primary.id ? { repairs: parsedNotes.data.repairs } : {}) };
  }
  // Valid judgments survive refinement failure under the existing judgment retention policy.
  const judgment = await judgeHowItWinsForAnalysis({ card, client, models: config.models,
    refinement: config.refinement, executeCall: execution.executeCall, onValidation: execution.onValidation,
    telemetry: execution.telemetry,
    ...(scoped ? { scope: scoped.scope, citationCheck: createHowItWinsCitationCheck(
      createJevAsk({ apiKey: scoped.apiKey, timeoutMs: HOW_IT_WINS_SCREEN_TIMEOUT_MS })) } : {}),
    ...(resumePrimaryJudgment ? { resumePrimaryJudgment } : {}),
    onPrimaryJudgment: async candidate => {
      await execution.lease("judge_initial");
      const stored = await storeHowItWinsJudgment(db, { ...primaryHashes, slug: job.slug, model: config.models.judge,
        judgment: howItWinsJudgmentSchema.parse({ version: 1, hashes: candidate.hashes, ...candidate.body, calls: candidate.calls }) });
      const lease = await execution.lease("judge_initial");
      if (!await storeHowItWinsStageCheckpoint(db, { jobId: job.id, lease, checkpointId: "primary-notes",
        stage: "judge_initial", inputHash: primaryHashes.promptHash, result: { judgmentId: stored.id, repairs: candidate.repairs ?? [] } })) {
        throw new HowItWinsExecutionError("lease_lost");
      }
    },
    deadlineAt: job.deadlineAt.getTime() - 15_000 });
  const storedId = await step.run("hiw-v2-judgment", async () => {
    await execution.lease("writer");
    return (await storeHowItWinsJudgment(db, { ...hashes, slug: job.slug, model: config.models.judge, judgment })).id;
  });
  const settled = await findHowItWinsJudgment(db, hashes);
  if (!settled || settled.id !== storedId) throw new HowItWinsExecutionError("internal_storage");
  return { judgmentId: settled.id, judgment: settled, cached: false };
}

// The frozen writer renders one approved judgment. Its checkpoint hash pins the judgment, the
// evidence, the evaluator, and the writer model together, so an earlier attempt of the same job
// replays its draft instead of paying again.
async function runWriter(input: StageInput & { judgmentId: string; judgment: StoredHowItWinsJudgment }) {
  const { db, job, config, execution, card, client } = input;
  const writerHash = hashHowItWinsJudgeValue({ judgment: input.judgmentId, evidence: job.evidenceHash,
    evaluator: job.evaluatorSignature, model: config.models.writer });
  const checkpoint = await readHowItWinsStageCheckpoint(db, { jobId: job.id, checkpointId: "writer", inputHash: writerHash });
  if (checkpoint) return { writerHash, read: howItWinsSchema.parse(checkpoint.result) };

  const written = await synthesizeHowItWins({ client, card, models: config.models, judgment: input.judgment.judgment,
    executeMessage: execution.executeMessage, telemetry: execution.telemetry });
  const read = howItWinsSchema.parse(written.read);
  const lease = await execution.lease("writer");
  if (!await storeHowItWinsStageCheckpoint(db, { jobId: job.id, lease, checkpointId: "writer", stage: "writer", inputHash: writerHash, result: read })) {
    throw new HowItWinsExecutionError("lease_lost");
  }
  return { writerHash, read };
}

// Only a filed read reaches the verifier. Its checkpoint is keyed by the writer's hash and the
// draft itself, so a replay reuses the verdict rather than re-paying for it.
async function runVerifier(input: StageInput & { read: HowItWinsRead; writerHash: string }) {
  const { db, job, config, execution, card, client } = input;
  const verifierHash = hashHowItWinsJudgeValue({ writerHash: input.writerHash, draft: input.read, model: config.verifierModel });
  const verified = await readHowItWinsStageCheckpoint(db, { jobId: job.id, checkpointId: "verifier", inputHash: verifierHash });
  if (verified) return howItWinsSchema.parse(verified.result);

  const verification = await verifyHowItWinsRead({ card, read: input.read,
    verify: (claims, sources, evidenceFacts) => verifySynthesis({ client, model: config.verifierModel,
      claims, sources, evidenceFacts, telemetry: execution.telemetry, executeMessage: execution.executeMessage }) });
  const result = howItWinsSchema.parse(verification.howItWins);
  const lease = await execution.lease("verifier");
  if (!await storeHowItWinsStageCheckpoint(db, { jobId: job.id, lease, checkpointId: "verifier", stage: "verifier", inputHash: verifierHash, result })) {
    throw new HowItWinsExecutionError("lease_lost");
  }
  return result;
}

export async function howItWinsV2Handler({ event, runId, step }: WorkerEventContext) {
  const db = createDb(webEnv().DATABASE_URL);
  const jobId = event.data.jobId;
  if (typeof jobId !== "string" || !/^[0-9a-f-]{36}$/.test(jobId)) return { status: "rejected" };
  const job = await findHowItWinsJobById(db, jobId);
  if (!job || job.executionContractVersion !== 2 || job.slug !== event.data.slug ||
      event.id !== job.inngestEventId) return { status: "rejected" };
  // Already terminal when this run picked the event up: the cron or the status GET expired it
  // first. It still owes its parent run an outcome, and this is the only place that can pay it.
  if (job.status !== "queued" && job.status !== "running") {
    await step.run("hiw-v2-notify", async () => {
      await recordHowItWinsJobOutcome(db, { job });
      return null;
    });
    return { jobId, status: job.status };
  }
  const config = howItWinsExecutionConfig();
  const execution = createHowItWinsExecution({ db, job, runId, step,
    judgeModel: config.models.judge, editorModel: config.models.editor });
  const outcome = createHowItWinsOutcome({ db, job, runId, step });
  try {
    if (!howItWinsEnabled()) return outcome.finish("cancelled");
    const card = await findCardBySlug(db, job.slug, { allowStale: true });
    if (!card?.synthesis) return outcome.finish("stale_evidence");
    const identity = howItWinsJobIdentity(card);
    if (identity.evidenceHash !== job.evidenceHash) return outcome.finish("stale_evidence");
    if (identity.evaluatorSignature !== job.evaluatorSignature || card.synthesis.howItWinsEvaluator?.signature !== job.evaluatorSignature) return outcome.finish("stale_evaluator");
    const client = createAnthropicClient();
    const thin = howItWinsThinFileReason(card);
    const screenMode = howItWinsScreenMode();
    const typesafeApiKey = process.env.TYPESAFE_API_KEY;
    // Scoped mode screens before the judge, as its own memoized step, so a retried run judges
    // the same scope. A failed screen falls back to the full judge; the run never waits on Jev.
    let screened: HowItWinsScreenResult | undefined;
    if (!thin && screenMode === "scoped" && typesafeApiKey) {
      const result = await step.run("hiw-v2-screen", () => runHowItWinsScreen({ card, apiKey: typesafeApiKey }));
      if (result.ok) screened = result.screen as HowItWinsScreenResult;
      else outcome.judgment.screen = { ...result.trace, mode: "scoped" };
    }
    const scope = screened ? howItWinsJudgeScopeFromScreen(screened) : undefined;
    const { hashes } = howItWinsJudgeInputs(card, config.refinement, config.models, scope);
    outcome.judgment.hashes = hashes;
    const stage: StageInput = { db, job, config, execution, card, client };
    let judgmentId: string | undefined;
    let read: HowItWins = { status: "thin_file" };
    if (!thin) {
      const judgment = await resolveJudgment({ ...stage, step, hashes,
        ...(scope && typesafeApiKey ? { scoped: { scope, apiKey: typesafeApiKey } } : {}) });
      judgmentId = judgment.judgmentId;
      outcome.judgment.cached = judgment.cached;
      if (screened) outcome.judgment.screen = howItWinsScreenTrace(screened, judgment.judgment.judgment, "scoped");
      // Shadow only: the screen runs after the judge, as its own memoized step, and its result
      // goes to the run trace. It never changes the judgment or the read, and it cannot throw.
      // It is skipped when the writer and verifier might need the remaining time.
      if (screenMode === "shadow" && typesafeApiKey && job.deadlineAt.getTime() - Date.now() > SCREEN_SHADOW_MIN_REMAINING_MS) {
        outcome.judgment.screen = await step.run("hiw-v2-screen-shadow", () =>
          howItWinsScreenShadow({ card, judgment: judgment.judgment.judgment, apiKey: typesafeApiKey }));
      }
      const written = await runWriter({ ...stage, judgmentId: judgment.judgmentId, judgment: judgment.judgment });
      read = written.read.status === "read"
        ? await runVerifier({ ...stage, read: written.read, writerHash: written.writerHash })
        : written.read;
    }
    const stored = await step.run("hiw-v2-store", async () => {
      const lease = await execution.lease("storage");
      return completeHowItWinsJobWithCard(db, { jobId: job.id, lease, outcome: read.status,
        ...(judgmentId ? { judgmentId } : {}), verifyAndMutate: current => {
          if (!current.synthesis) throw new HowItWinsExecutionError("stale_evidence");
          return {
            evidenceHash: howItWinsJobIdentity(current).evidenceHash,
            evaluatorSignature: current.synthesis.howItWinsEvaluator?.signature ?? "missing",
            card: { ...current, synthesis: { ...current.synthesis, howItWins: read } }
          };
        } });
    });
    if (stored !== "succeeded") return outcome.finish(STORE_FAILURE_REASON[stored] ?? "internal_storage");
    await outcome.notify(await findHowItWinsJobById(db, job.id));
    return { jobId, status: "succeeded", outcome: read.status };
  } catch (error) {
    return outcome.finish(error instanceof HowItWinsJudgeClosedError ? (execution.failureReason() ?? "semantic_contract") : howItWinsFailureReason(error));
  }
}
