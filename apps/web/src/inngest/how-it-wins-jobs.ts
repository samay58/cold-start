import { randomUUID } from "node:crypto";
import {
  type ColdStartCard, type GenerationLlmCallTrace, type GenerationTrace
} from "@cold-start/core";
import {
  admitHowItWinsJob, admitHowItWinsManualRetry, findCardBySlug,
  findGenerationRunById, findHowItWinsJobById, findLatestHowItWinsJobBySlug,
  findResearchRunEventsByRunId, howItWinsJobSummary, howItWinsJobOwnedByInstallation,
  markHowItWinsDispatchAttempt, confirmHowItWinsDispatch, recordResearchRunEvent,
  updateGenerationRunTrace,
  type ColdStartDb, type HowItWinsCallAttempt, type StoredHowItWinsJob
} from "@cold-start/db";
import { anthropicModel, modelForStage } from "@cold-start/llm";
import { inngest } from "./client";
import { alphaGenerationEnabled } from "../lib/alpha-config";
import { principalHasScope, type AlphaPrincipal } from "../lib/extension-auth";
import { llmTracePatchFromCalls, mergeTracePatch } from "./generation-trace";
import { howItWinsEvaluatorFor, howItWinsJudgeInputs } from "./how-it-wins";
import { howItWinsModelRates, HowItWinsExecutionError } from "./how-it-wins-execution";
import {
  howItWinsEnabled, howItWinsJobBudgetMicrodollars, howItWinsModelsFromProcess,
  howItWinsRefinementEnabled, howItWinsRetryEnabled
} from "./worker-env";

type HowItWinsTraceBlock = NonNullable<GenerationTrace["howItWins"]>;

export function howItWinsExecutionConfig() {
  const models = howItWinsModelsFromProcess(anthropicModel());
  const verifierModel = modelForStage("verify", anthropicModel());
  const refinement = howItWinsRefinementEnabled();
  return { models, verifierModel, refinement, evaluator: howItWinsEvaluatorFor({ models, verifierModel, refinement }) };
}

// The job row is the durable accounting record; the parent trace is a summary of it. Each settled
// attempt becomes one row on the run's LLM ledger so cost_usd counts the whole read again. Cost
// rides only on a known basis: an unknown one is left absent rather than reported as zero.
function howItWinsLedgerCalls(attempts: readonly HowItWinsCallAttempt[]): GenerationLlmCallTrace[] {
  return attempts.map(attempt => {
    const model = attempt.returnedModel ?? attempt.requestedModel;
    const cost = attempt.costBasis === "known" ? attempt.settledMicrodollars : undefined;
    return {
      stage: "how_it_wins" as const,
      label: `how-it-wins:${attempt.logicalCallId}`,
      model: model ?? "unknown",
      ...(attempt.servingProvider ? { provider: attempt.servingProvider } : {}),
      status: attempt.httpOutcome === "succeeded" && attempt.validationOutcome !== "invalid" ? "ok" as const : "failed" as const,
      durationMs: attempt.durationMs ?? 0,
      ...(attempt.usage?.inputTokens === null || attempt.usage?.inputTokens === undefined ? {} : { inputTokens: attempt.usage.inputTokens }),
      ...(attempt.usage?.outputTokens === null || attempt.usage?.outputTokens === undefined ? {} : { outputTokens: attempt.usage.outputTokens }),
      ...(attempt.usage?.cacheCreationInputTokens === null || attempt.usage?.cacheCreationInputTokens === undefined ? {} : { cacheCreationInputTokens: attempt.usage.cacheCreationInputTokens }),
      ...(attempt.usage?.cacheReadInputTokens === null || attempt.usage?.cacheReadInputTokens === undefined ? {} : { cacheReadInputTokens: attempt.usage.cacheReadInputTokens }),
      ...(attempt.retryCount === undefined ? {} : { retryCount: attempt.retryCount }),
      ...(cost === undefined ? {} : { estimatedCostUsd: cost / 1_000_000 })
    };
  });
}

// The status the panel reads off the event. The card's own three outcomes pass through; a
// superseded job reads as "stale", a cancelled one (the enable flag turned off mid-flight) as
// "skipped", and everything else as "failed", the same three extra words the trace block uses.
function howItWinsOutcomeStatus(job: StoredHowItWinsJob) {
  if (job.status === "succeeded" && job.outcome) return job.outcome;
  if (job.status === "superseded") return "stale";
  return job.status === "cancelled" ? "skipped" : "failed";
}

function howItWinsOutcomeMessage(job: StoredHowItWinsJob) {
  if (job.status === "succeeded") return "How it wins finished";
  return job.status === "cancelled" ? "How it wins skipped" : "How it wins could not finish";
}

// Every terminal job closes the same two surfaces: the how-it-wins.complete event the extension
// waits on before it stops showing "reading", and the parent analysis run's trace. The card is
// not read here, so a job that died before the card loaded still closes its own trail. Both
// writes are best effort and neither ever throws: the money is already accounted for on the job
// row by the time this runs.
export async function recordHowItWinsJobOutcome(db: ColdStartDb, input: {
  job: StoredHowItWinsJob;
  judgmentRef?: HowItWinsTraceBlock["judgmentRef"] | undefined;
  judgeSummary?: HowItWinsTraceBlock["judgeSummary"] | undefined;
}) {
  const { job } = input;
  if (job.status === "queued" || job.status === "running") return;
  const status = howItWinsOutcomeStatus(job);
  try {
    // The domain comes off the source run row, which carries it NOT NULL. A missing run row means
    // there is nothing to hang an event on, so the trace patch below is all that is left to do.
    const run = await findGenerationRunById(db, job.sourceAnalysisRunId);
    if (run) {
      const recorded = await findResearchRunEventsByRunId(db, job.sourceAnalysisRunId, { limit: 200 });
      // Announced once means both surfaces were written in that same call, so a re-announce
      // from the reconcile sweep stops here.
      if (recorded.some(event => event.type === "how-it-wins.complete" && event.metadata.jobId === job.id)) return;
      await recordResearchRunEvent(db, {
        runId: job.sourceAnalysisRunId, slug: job.slug, domain: run.domain, sectionId: null,
        type: "how-it-wins.complete",
        message: howItWinsOutcomeMessage(job),
        metadata: { status, jobId: job.id, ...(job.reasonCode ? { reasonCode: job.reasonCode } : {}) }
      });
    }
  } catch {
    // The event trail is observability. A lost write must not fail a settled job.
  }
  try {
    const calls = howItWinsLedgerCalls(job.attempts);
    await updateGenerationRunTrace(db, {
      id: job.sourceAnalysisRunId,
      patch: existing => {
        const next: GenerationTrace = { ...(existing ?? { jobKind: "analysis", mode: "analysis" }) };
        const known = new Set((next.llm?.calls ?? []).map(call => call.label));
        mergeTracePatch(next, {
          howItWins: {
            enabled: true, status,
            ...(job.status === "succeeded" || !job.reasonCode ? {} : { reasonCode: job.reasonCode }),
            ...(input.judgmentRef ? { judgmentRef: input.judgmentRef } : {}),
            ...(input.judgeSummary ? { judgeSummary: input.judgeSummary } : {})
          } satisfies HowItWinsTraceBlock
        });
        mergeTracePatch(next, llmTracePatchFromCalls(calls.filter(call => !known.has(call.label))));
        return next;
      }
    });
  } catch {
    // Same contract as the event: call rows are keyed by label, so a replay cannot double-count.
  }
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
  const maximum = howItWinsJobBudgetMicrodollars();
  if (maximum === null) {
    throw new HowItWinsExecutionError("authentication_configuration", "HOW_IT_WINS_JOB_BUDGET_USD is missing or invalid");
  }
  const configuredCapMicrodollars = input.capMicrodollars ?? maximum;
  if (!Number.isSafeInteger(configuredCapMicrodollars) || configuredCapMicrodollars <= 0 || configuredCapMicrodollars > maximum) {
    throw new HowItWinsExecutionError("authentication_configuration",
      `How it wins job cap ${configuredCapMicrodollars} microdollars is outside 1 to ${maximum}`);
  }
  const id = randomUUID();
  return admitHowItWinsJob(db, {
    id, sourceAnalysisRunId: input.sourceAnalysisRunId, slug: input.card.slug,
    ...howItWinsJobIdentity(input.card), executionContractVersion: 2,
    inngestEventId: `how-it-wins-v2:${id}`, configuredCapMicrodollars,
    deadlineAt: new Date(Date.now() + 600_000)
  });
}

// An operator can re-admit a historical read that never closed. Every precondition below names
// itself in the message, so a refusal says which one failed. "deferred" is allowed because a run
// that dispatched a read and never heard back is exactly the state this repairs. Admission joins
// an existing job for the same run instead of paying for a second one.
export async function requestOperatorHowItWinsRepair(db: ColdStartDb, principal: AlphaPrincipal, input: {
  slug: string; sourceAnalysisRunId: string; capMicrodollars: number;
}) {
  if (principal.kind !== "operator") {
    throw new HowItWinsExecutionError("authentication_configuration", "Repair needs an operator principal");
  }
  const run = await findGenerationRunById(db, input.sourceAnalysisRunId);
  if (!run) throw new HowItWinsExecutionError("stale_evidence", "No generation run carries that id");
  if (run.status !== "complete") {
    throw new HowItWinsExecutionError("stale_evidence", `The run is ${run.status}, not complete`);
  }
  if (run.slug !== input.slug) {
    throw new HowItWinsExecutionError("stale_evidence", `The run belongs to ${run.slug}, not ${input.slug}`);
  }
  const historical = run.traceJson?.howItWins?.status;
  if (historical !== "failed" && historical !== "deferred") {
    throw new HowItWinsExecutionError("stale_evidence",
      `The run trace reads how it wins as ${historical ?? "absent"}, not failed or deferred`);
  }
  const card = await findCardBySlug(db, input.slug, { allowStale: true });
  if (!card) throw new HowItWinsExecutionError("stale_evidence", "No stored profile carries that slug");
  if (!card.synthesis) throw new HowItWinsExecutionError("stale_evidence", "The stored profile carries no analysis");
  if (card.synthesis.howItWinsEvaluator?.signature !== howItWinsExecutionConfig().evaluator.signature) {
    throw new HowItWinsExecutionError("stale_evaluator", "The stored profile was filed under a different evaluator");
  }
  return requestHowItWinsJob(db, {
    card, sourceAnalysisRunId: input.sourceAnalysisRunId, capMicrodollars: input.capMicrodollars
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
  // A retry job carries its own budget line but inherits the root's retry allowance, so the
  // summary needs the root row to decide canRetry. The root lookup is skipped for a first attempt.
  const root = job.retryOfJobId ? await findHowItWinsJobById(db, job.rootJobId) : null;
  const summary = howItWinsJobSummary(job, root);
  if (summary.canRetry) {
    const card = await findCardBySlug(db, slug, { allowStale: true });
    let current = false;
    if (card?.synthesis) {
      const identity = howItWinsJobIdentity(card);
      current = identity.evidenceHash === job.evidenceHash && identity.evaluatorSignature === job.evaluatorSignature;
    }
    summary.canRetry = (principal.kind !== "alpha" || alphaGenerationEnabled()) && principalHasScope(principal, "generation:write") && howItWinsRetryEnabled() && howItWinsEnabled() && current &&
      await canOwnRetry(db, job, principal);
  }
  return { job: summary };
}

export async function retryHowItWinsJob(db: ColdStartDb, input: {
  slug: string; jobId: string; principal: AlphaPrincipal;
}) {
  if (!howItWinsRetryEnabled() || !howItWinsEnabled() ||
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
