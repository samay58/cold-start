import { z } from "zod";
import {
  howItWinsSchema, howItWinsJudgmentSchema, howItWinsJudgmentBodySchema, howItWinsThinFileReason, type HowItWins, type ColdStartCard,
  type HowItWinsJobReasonCode
} from "@cold-start/core";
import {
  createDb, findCardBySlug, findHowItWinsJobById, findHowItWinsJudgment,
  storeHowItWinsJudgment, finishHowItWinsJob, completeHowItWinsJobWithCard,
  readHowItWinsStageCheckpoint, storeHowItWinsStageCheckpoint,
  recordResearchRunEvent, updateGenerationRunTrace
} from "@cold-start/db";
import {
  createAnthropicClient, hashHowItWinsJudgeValue, judgeHowItWinsForAnalysis,
  synthesizeHowItWins, verifySynthesis, HowItWinsJudgeClosedError, type HowItWinsPrimaryJudgment
} from "@cold-start/llm";
import { verifyHowItWinsRead } from "@cold-start/pipeline";
import { webEnv } from "../lib/web-env";
import type { WorkerEventContext } from "./client";
import { howItWinsJudgeInputs } from "./how-it-wins";
import { howItWinsExecutionConfig, howItWinsJobIdentity } from "./how-it-wins-jobs";
import { createHowItWinsExecution, howItWinsFailureReason } from "./how-it-wins-execution";
import { HowItWinsExecutionError } from "./how-it-wins-budget";
import { howItWinsEnabled } from "./worker-env";

export async function howItWinsV2Handler({ event, runId, step }: WorkerEventContext) {
  const db = createDb(webEnv().DATABASE_URL);
  const jobId = event.data.jobId;
  if (typeof jobId !== "string" || !/^[0-9a-f-]{36}$/.test(jobId)) return { status: "rejected" };
  const job = await findHowItWinsJobById(db, jobId);
  if (!job || job.executionContractVersion !== 2 || job.slug !== event.data.slug ||
      event.id !== job.inngestEventId) return { status: "rejected" };
  if (job.status !== "queued" && job.status !== "running") return { jobId, status: job.status };
  const config = howItWinsExecutionConfig();
  const execution = createHowItWinsExecution({ db, job, runId, step,
    judgeModel: config.models.judge, editorModel: config.models.editor });
  const finish = async (reason: HowItWinsJobReasonCode) => {
    const current = await findHowItWinsJobById(db, job.id);
    if (current && (current.status === "queued" || current.status === "running")) {
      const lease = current.leaseOwner === runId && current.leaseExpiresAt
        ? { id: current.id, owner: runId, version: current.version, expiresAt: current.leaseExpiresAt } : undefined;
      if (current.status === "queued" || lease) {
        await finishHowItWinsJob(db, { jobId: job.id, ...(lease ? { lease } : {}),
          status: reason === "stale_evidence" || reason === "stale_evaluator" ? "superseded" : reason === "cancelled" ? "cancelled" : "failed",
          reasonCode: reason,
          retryEligible: ["structured_output", "semantic_contract", "transient_provider", "deadline_expired", "internal_storage"].includes(reason) });
      }
    }
    await notify();
    return { jobId, status: (await findHowItWinsJobById(db, job.id))?.status ?? "failed" };
  };
  const notify = async () => {
    const current = await findHowItWinsJobById(db, job.id);
    if (!current || current.status === "queued" || current.status === "running") return;
    // Accounting is committed before this best-effort compatibility event and parent summary.
    const status = current.status === "succeeded" ? current.outcome! : "failed";
    if (card) await recordResearchRunEvent(db, { runId: job.sourceAnalysisRunId, slug: job.slug,
      domain: card.domain, sectionId: null, type: "how-it-wins.complete",
      message: current.status === "succeeded" ? "How it wins finished" : "How it wins could not finish",
      metadata: { status, jobId: job.id } }).catch(() => undefined);
    // The scoped legacy repair keeps its original failed trace as historical evidence.
    if (job.sourceAnalysisRunId !== "8d70f327-90fd-4dfb-8691-bc8056370886") {
      await updateGenerationRunTrace(db, { id: job.sourceAnalysisRunId,
        patch: existing => ({ ...(existing ?? {jobKind: "analysis", mode: "analysis"}), howItWins: { ...existing?.howItWins, enabled: true, status } })
      }).catch(() => undefined);
    }
  };
  let card: ColdStartCard | null = null;
  try {
    if (!howItWinsEnabled()) return finish("cancelled");
    card = await findCardBySlug(db, job.slug, { allowStale: true });
    if (!card?.synthesis) return finish("stale_evidence");
    const identity = howItWinsJobIdentity(card);
    if (identity.evidenceHash !== job.evidenceHash) return finish("stale_evidence");
    if (identity.evaluatorSignature !== job.evaluatorSignature || card.synthesis.howItWinsEvaluator?.signature !== job.evaluatorSignature) return finish("stale_evaluator");
    const client = createAnthropicClient();
    const { hashes } = howItWinsJudgeInputs(card, config.refinement, config.models);
    let judgmentId: string | undefined;
    let result: HowItWins;
    const thin = howItWinsThinFileReason(card);
    if (thin) {
      result = { status: "thin_file" };
    } else {
      let cached = await findHowItWinsJudgment(db, hashes);
      if (!cached) {
        const primaryHashes = { ...hashes, promptHash: hashHowItWinsJudgeValue({
          phase: "validated-primary-v2", promptHash: hashes.promptHash
        }) };
        const primary = await findHowItWinsJudgment(db, primaryHashes);
        let resumePrimaryJudgment: HowItWinsPrimaryJudgment | undefined;
        if (primary) {
          const notes = await readHowItWinsStageCheckpoint(db, { jobId: job.id,
            checkpointId: "primary-notes", inputHash: primaryHashes.promptHash });
          const parsedNotes = z.object({ judgmentId: z.string(), repairs: z.array(z.string().min(1).max(300)).max(200) }).safeParse(notes?.result);
          resumePrimaryJudgment = { schemaVersion: 1, hashes: primary.judgment.hashes,
            body: howItWinsJudgmentBodySchema.parse(primary.judgment), calls: primary.judgment.calls,
            ...(parsedNotes.success && parsedNotes.data.judgmentId === primary.id ? { repairs: parsedNotes.data.repairs } : {}) };
        }
        // Valid judgments survive refinement failure under the existing judgment retention policy.
        const judgment = await judgeHowItWinsForAnalysis({ card, client, models: config.models,
          refinement: config.refinement, executeCall: execution.executeCall, onValidation: execution.onValidation,
          telemetry: execution.telemetry,
          ...(resumePrimaryJudgment ? { resumePrimaryJudgment } : {}),
          onPrimaryJudgment: async primary => {
            await execution.lease("judge_initial");
            const stored = await storeHowItWinsJudgment(db, { ...primaryHashes, slug: job.slug, model: config.models.judge,
              judgment: howItWinsJudgmentSchema.parse({ version: 1, hashes: primary.hashes, ...primary.body, calls: primary.calls }) });
            const lease = await execution.lease("judge_initial");
            if (!await storeHowItWinsStageCheckpoint(db, { jobId: job.id, lease, checkpointId: "primary-notes",
              stage: "judge_initial", inputHash: primaryHashes.promptHash, result: { judgmentId: stored.id, repairs: primary.repairs ?? [] } })) {
              throw new HowItWinsExecutionError("lease_lost");
            }
          },
          deadlineAt: job.deadlineAt.getTime() - 15_000 });
        const storedId = await step.run("hiw-v2-judgment", async () => {
          await execution.lease("writer");
          return (await storeHowItWinsJudgment(db, { ...hashes, slug: job.slug, model: config.models.judge, judgment })).id;
        });
        cached = await findHowItWinsJudgment(db, hashes);
        if (!cached || cached.id !== storedId) throw new HowItWinsExecutionError("internal_storage");
      }
      judgmentId = cached.id;
      const writerHash = hashHowItWinsJudgeValue({ judgment: cached.id, evidence: job.evidenceHash,
        evaluator: job.evaluatorSignature, model: config.models.writer });
      const writerCheckpoint = await readHowItWinsStageCheckpoint(db, { jobId: job.id, checkpointId: "writer", inputHash: writerHash });
      if (writerCheckpoint) {
        result = howItWinsSchema.parse(writerCheckpoint.result);
      } else {
        const written = await synthesizeHowItWins({ client, card, models: config.models, judgment: cached.judgment,
          executeMessage: execution.executeMessage, telemetry: execution.telemetry });
        result = howItWinsSchema.parse(written.read);
        const lease = await execution.lease("writer");
        if (!await storeHowItWinsStageCheckpoint(db, { jobId: job.id, lease, checkpointId: "writer", stage: "writer", inputHash: writerHash, result })) {
          throw new HowItWinsExecutionError("lease_lost");
        }
      }
      if (result.status === "read") {
        const verifierHash = hashHowItWinsJudgeValue({ writerHash, draft: result, model: config.verifierModel });
        const verified = await readHowItWinsStageCheckpoint(db, { jobId: job.id, checkpointId: "verifier", inputHash: verifierHash });
        if (verified) {
          result = howItWinsSchema.parse(verified.result);
        } else {
          const verification = await verifyHowItWinsRead({ card, read: result,
            verify: (claims, sources, evidenceFacts) => verifySynthesis({ client, model: config.verifierModel,
              claims, sources, evidenceFacts, telemetry: execution.telemetry, executeMessage: execution.executeMessage }) });
          result = howItWinsSchema.parse(verification.howItWins);
          const lease = await execution.lease("verifier");
          if (!await storeHowItWinsStageCheckpoint(db, { jobId: job.id, lease, checkpointId: "verifier", stage: "verifier", inputHash: verifierHash, result })) {
            throw new HowItWinsExecutionError("lease_lost");
          }
        }
      }
    }
    const outcome = await step.run("hiw-v2-store", async () => {
      const lease = await execution.lease("storage");
      return completeHowItWinsJobWithCard(db, { jobId: job.id, lease, outcome: result.status,
        ...(judgmentId ? { judgmentId } : {}), verifyAndMutate: current => {
          if (!current.synthesis) throw new HowItWinsExecutionError("stale_evidence");
          return {
            evidenceHash: howItWinsJobIdentity(current).evidenceHash,
            evaluatorSignature: current.synthesis.howItWinsEvaluator?.signature ?? "missing",
            card: { ...current, synthesis: { ...current.synthesis, howItWins: result } }
          };
        } });
    });
    if (outcome !== "succeeded") return finish(outcome === "stale_evidence" || outcome === "card_changed" ? "stale_evidence" : outcome === "stale_evaluator" ? "stale_evaluator" : "internal_storage");
    await notify();
    return { jobId, status: "succeeded", outcome: result.status };
  } catch (error) {
    return finish(error instanceof HowItWinsJudgeClosedError ? (execution.failureReason() ?? "semantic_contract") : howItWinsFailureReason(error));
  }
}
