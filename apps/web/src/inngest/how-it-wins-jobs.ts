import { randomUUID } from "node:crypto";
import { type ColdStartCard } from "@cold-start/core";
import {
  admitHowItWinsJob, admitHowItWinsManualRetry, findCardBySlug,
  findGenerationRunById, findHowItWinsJobById, findLatestHowItWinsJobBySlug,
  howItWinsJobSummary, howItWinsJobOwnedByInstallation, markHowItWinsDispatchAttempt, confirmHowItWinsDispatch,
  type ColdStartDb, type StoredHowItWinsJob
} from "@cold-start/db";
import { anthropicModel, modelForStage } from "@cold-start/llm";
import { inngest } from "./client";
import { alphaGenerationEnabled } from "../lib/alpha-config";
import { principalHasScope, type AlphaPrincipal } from "../lib/extension-auth";
import { howItWinsEvaluatorFor, howItWinsJudgeInputs } from "./how-it-wins";
import { howItWinsBudgetMicrodollars, howItWinsModelRates, HowItWinsExecutionError } from "./how-it-wins-budget";
import { howItWinsEnabled, howItWinsModelsFromProcess, howItWinsRefinementEnabled } from "./worker-env";

export function howItWinsExecutionConfig() {
  const models = howItWinsModelsFromProcess(anthropicModel());
  const verifierModel = modelForStage("verify", anthropicModel());
  const refinement = howItWinsRefinementEnabled();
  return { models, verifierModel, refinement, evaluator: howItWinsEvaluatorFor({ models, verifierModel, refinement }) };
}

export function howItWinsJobIdentity(card: ColdStartCard) {
  const config = howItWinsExecutionConfig();
  return {
    evidenceHash: howItWinsJudgeInputs(card, config.refinement, config.models).hashes.evidencePacketHash,
    evaluatorSignature: config.evaluator.signature
  };
}

export async function requestHowItWinsJob(db: ColdStartDb, input: {
  card: ColdStartCard; sourceAnalysisRunId: string; capMicrodollars?: number;
}) {
  const config = howItWinsExecutionConfig();
  for (const model of [config.models.judge, config.models.writer, config.verifierModel, ...(config.refinement ? [config.models.editor] : [])]) {
    howItWinsModelRates(model);
  }
  const maximum = howItWinsBudgetMicrodollars();
  const configuredCapMicrodollars = input.capMicrodollars ?? maximum;
  if (!Number.isSafeInteger(configuredCapMicrodollars) || configuredCapMicrodollars <= 0 || configuredCapMicrodollars > maximum) throw new HowItWinsExecutionError("authentication_configuration");
  const id = randomUUID();
  return admitHowItWinsJob(db, {
    id, sourceAnalysisRunId: input.sourceAnalysisRunId, slug: input.card.slug,
    ...howItWinsJobIdentity(input.card), executionContractVersion: 2,
    inngestEventId: `how-it-wins-v2:${id}`, configuredCapMicrodollars,
    deadlineAt: new Date(Date.now() + 600_000)
  });
}

function howItWinsJobEvent(job: Pick<StoredHowItWinsJob, "id" | "inngestEventId" | "slug">) {
  return { id: job.inngestEventId, name: "card/how-it-wins.requested" as const,
    data: { jobId: job.id, slug: job.slug, executionContractVersion: 2 } };
}

async function canOwnRetry(db: ColdStartDb, job: StoredHowItWinsJob, principal: AlphaPrincipal) {
  return principal.kind === "operator" || (!!principal.installationId &&
    await howItWinsJobOwnedByInstallation(db, job.sourceAnalysisRunId, principal.installationId));
}

export async function howItWinsStatusForPrincipal(db: ColdStartDb, slug: string, principal: AlphaPrincipal) {
  const job = await findLatestHowItWinsJobBySlug(db, slug);
  if (!job) return { job: null };
  const summary = howItWinsJobSummary(job);
  if (summary.canRetry) {
    const card = await findCardBySlug(db, slug, { allowStale: true });
    let current = false;
    if (card?.synthesis) {
      const identity = howItWinsJobIdentity(card);
      current = identity.evidenceHash === job.evidenceHash && identity.evaluatorSignature === job.evaluatorSignature;
    }
    summary.canRetry = (principal.kind !== "alpha" || alphaGenerationEnabled()) && principalHasScope(principal, "generation:write") && process.env.HOW_IT_WINS_RETRY_ENABLED === "true" && howItWinsEnabled() && current &&
      await canOwnRetry(db, job, principal);
  }
  return { job: summary };
}

export async function retryHowItWinsJob(db: ColdStartDb, input: {
  slug: string; jobId: string; principal: AlphaPrincipal;
}) {
  if (process.env.HOW_IT_WINS_RETRY_ENABLED !== "true" || !howItWinsEnabled() ||
      (input.principal.kind === "alpha" && !alphaGenerationEnabled())) {
    throw new HowItWinsExecutionError("authentication_configuration");
  }
  const job = await findHowItWinsJobById(db, input.jobId);
  const current = await findLatestHowItWinsJobBySlug(db, input.slug);
  if (!job || job.slug !== input.slug || !current ||
      (current.id !== job.id && current.retryOfJobId !== job.id) ||
      !await canOwnRetry(db, job, input.principal)) return null;
  const card = await findCardBySlug(db, input.slug, { allowStale: true });
  if (!card?.synthesis) return null;
  const identity = howItWinsJobIdentity(card);
  const id = randomUUID();
  return admitHowItWinsManualRetry(db, {
    id, failedJobId: job.id, sourceAnalysisRunId: job.sourceAnalysisRunId, slug: job.slug,
    ...identity, executionContractVersion: 2, inngestEventId: `how-it-wins-v2:${id}`,
    deadlineAt: new Date(Date.now() + 600_000)
  });
}

// One historical failure is eligible for an operator repair. The original trace is unchanged.
export async function requestLegacyColumnHowItWins(db: ColdStartDb, principal: AlphaPrincipal, capMicrodollars: number) {
  if (principal.kind !== "operator") throw new HowItWinsExecutionError("authentication_configuration");
  const sourceAnalysisRunId = "8d70f327-90fd-4dfb-8691-bc8056370886";
  const run = await findGenerationRunById(db, sourceAnalysisRunId);
  const card = await findCardBySlug(db, "column", { allowStale: true });
  if (!run || run.status !== "complete" || run.traceJson?.howItWins?.status !== "failed" ||
      !card?.synthesis || card.domain !== "column.com") throw new HowItWinsExecutionError("stale_evidence");
  if (card.synthesis.howItWinsEvaluator?.signature !== howItWinsExecutionConfig().evaluator.signature) throw new HowItWinsExecutionError("stale_evaluator");
  return requestHowItWinsJob(db, { card, sourceAnalysisRunId, capMicrodollars });
}

export async function dispatchHowItWinsJob(db: ColdStartDb, job: Pick<StoredHowItWinsJob, "id" | "inngestEventId" | "slug">) {
  const attempt = await markHowItWinsDispatchAttempt(db, { jobId: job.id, inngestEventId: job.inngestEventId });
  if (!attempt) return false;
  try {
    await inngest.send(howItWinsJobEvent(job));
    await confirmHowItWinsDispatch(db, { jobId: job.id, inngestEventId: job.inngestEventId });
    return true;
  } catch {
    return false;
  }
}
