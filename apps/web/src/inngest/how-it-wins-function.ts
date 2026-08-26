import {
  companySlugFromDomain,
  howItWinsThinFileReason,
  type ColdStartCard,
  type GenerationTrace,
  type HowItWins
} from "@cold-start/core";
import { createDb, findCardBySlug, recordResearchRunEvent, updateGenerationRunTrace } from "@cold-start/db";
import { anthropicModel, createAnthropicClient, modelForStage } from "@cold-start/llm";
import { canonicalCompanyDomain } from "../lib/domain";
import { boundedErrorMessage } from "../lib/errors";
import { webEnv } from "../lib/web-env";
import { mutateCardWithRetry } from "./card-storage";
import { inngest, type WorkerEventContext } from "./client";
import {
  createStepLlmTelemetryCollector,
  rawSlugForRun,
  stringValue,
  timed
} from "./generation-helpers";
import {
  completedStep,
  llmTracePatchFromCalls,
  mergeGenerationTrace,
  mergeTracePatch,
  skippedStep
} from "./generation-trace";
import {
  howItWinsJudgeInputs,
  howItWinsJudgeLlmCalls,
  howItWinsJudgeStepBody,
  howItWinsVerifyStepBody,
  howItWinsWriteStepBody,
  type HowItWinsJudgeSummary,
  type HowItWinsLosses
} from "./how-it-wins";
import {
  backgroundConcurrencyLimit,
  howItWinsEnabled,
  howItWinsModelsFromProcess,
  howItWinsRefinementEnabled
} from "./worker-env";

const HOW_IT_WINS_EVENT_NAME = "card/how-it-wins.requested" as const;
const HOW_IT_WINS_STEP_ID = "how-it-wins";

type HowItWinsTraceBlock = NonNullable<GenerationTrace["howItWins"]>;
type HowItWinsTraceStatus = NonNullable<HowItWinsTraceBlock["status"]>;

// The read runs after the analysis card is stored, in its own function, because the judge is
// five model calls and 24k-33k output tokens: holding the analysis run open for it delays the
// Lens the tester is already looking at, and a judge retry would otherwise replay the whole
// analysis run's step chain.
export function buildHowItWinsRequestedEvent(input: {
  slug: string;
  domain: string;
  requestedAtMs: number;
  parentGenerationRunId?: string | null;
  parentInngestRunId?: string | null;
}) {
  return {
    name: HOW_IT_WINS_EVENT_NAME,
    data: {
      slug: input.slug,
      domain: input.domain,
      requestedAtMs: input.requestedAtMs,
      ...(input.parentGenerationRunId ? { parentGenerationRunId: input.parentGenerationRunId } : {}),
      ...(input.parentInngestRunId ? { parentInngestRunId: input.parentInngestRunId } : {})
    }
  };
}

const howItWinsConcurrency = backgroundConcurrencyLimit("INNGEST_HOW_IT_WINS_CONCURRENCY");

// Thrown out of the store mutation when the card underneath moved since the judge read it. It
// travels through mutateCard's own promise, so it has to be a real error rather than a return
// value; the handler catches it by identity and finishes as "stale" without writing.
class HowItWinsStaleCardError extends Error {
  constructor() {
    super("card evidence moved since the how-it-wins judgment was made");
    this.name = "HowItWinsStaleCardError";
  }
}

export const howItWinsHandler = async ({ event, runId, step }: WorkerEventContext) => {
  const runtimeEnv = webEnv();
  const db = createDb(runtimeEnv.DATABASE_URL);
  const parentGenerationRunId = stringValue(event.data.parentGenerationRunId);
  const parentInngestRunId = stringValue(event.data.parentInngestRunId);
  const trace: GenerationTrace = {
    jobKind: "analysis",
    mode: "analysis",
    inngest: {
      ...(typeof event.id === "string" ? { eventId: event.id } : {}),
      ...(typeof runId === "string" ? { runId } : {})
    },
    steps: {}
  };
  const startedAtMs = Date.now();

  let domain = "invalid-domain";
  let slug = rawSlugForRun(event.data.slug, event.data.domain);

  const eventRunId = () => parentGenerationRunId ?? parentInngestRunId ?? trace.inngest?.runId ?? `how-it-wins:${slug}`;
  const recordEvent = (stepId: string, type: string, message: string, metadata: Record<string, unknown> = {}) =>
    step.run(stepId, () =>
      recordResearchRunEvent(db, { runId: eventRunId(), slug, domain, sectionId: null, type, message, metadata }).catch(
        () => null
      )
    );

  // One terminal statement per run: the parent's trace block, its step row, and the closing
  // event. Every return path below goes through it, so a skipped, stale, or failed read is as
  // visible as a filed one.
  const finish = async (outcome: {
    status: HowItWinsTraceStatus;
    enabled?: boolean;
    stepStatus: "complete" | "failed" | "skipped";
    stepMessage?: string;
    dropReason?: string;
    thinFileReason?: string;
    judgmentRef?: NonNullable<HowItWinsTraceBlock["judgmentRef"]>;
    judgeSummary?: HowItWinsJudgeSummary;
    losses?: HowItWinsLosses;
    editorSkipped?: boolean;
    fitRetried?: boolean;
    styleIssueCount?: number;
  }) => {
    mergeTracePatch(trace, {
      howItWins: {
        enabled: outcome.enabled ?? true,
        status: outcome.status,
        ...(outcome.dropReason ? { dropReason: outcome.dropReason } : {}),
        ...(outcome.thinFileReason ? { thinFileReason: outcome.thinFileReason } : {}),
        ...(outcome.judgmentRef ? { judgmentRef: outcome.judgmentRef } : {}),
        ...(outcome.judgeSummary ? { judgeSummary: outcome.judgeSummary } : {}),
        ...(outcome.losses ? { losses: outcome.losses } : {}),
        ...(outcome.editorSkipped === undefined ? {} : { editorSkipped: outcome.editorSkipped }),
        ...(outcome.fitRetried === undefined ? {} : { fitRetried: outcome.fitRetried }),
        ...(outcome.styleIssueCount === undefined ? {} : { styleIssueCount: outcome.styleIssueCount })
      }
    });
    trace.steps = {
      ...trace.steps,
      [HOW_IT_WINS_STEP_ID]:
        outcome.stepStatus === "skipped"
          ? skippedStep(outcome.stepMessage ?? outcome.status)
          : outcome.stepStatus === "failed"
            ? { status: "failed", durationMs: Date.now() - startedAtMs, ...(outcome.stepMessage ? { message: outcome.stepMessage } : {}) }
            : completedStep(Date.now() - startedAtMs)
    };

    if (parentGenerationRunId) {
      await step.run("how-it-wins-parent-trace", () =>
        updateGenerationRunTrace(db, {
          id: parentGenerationRunId,
          patch: (existingTrace) => mergeGenerationTrace(existingTrace, trace)
        }).catch((error) => {
          // Best-effort, like the enrichment worker's own parent patch: a trace write must never
          // fail this run or strand the parent.
          console.warn("[how-it-wins] parent trace patch failed; continuing", error);
          return null;
        })
      );
    }

    // The event name stays how-it-wins.complete on every outcome, including failure: the panel's
    // progress-event union is closed, and a new name would render as nothing at all.
    await recordEvent("how-it-wins-complete-event", "how-it-wins.complete", completionMessage(outcome.status), {
      status: outcome.status,
      ...(outcome.dropReason ? { dropReason: outcome.dropReason } : {}),
      ...(outcome.judgmentRef ? { cached: outcome.judgmentRef.cached } : {})
    });

    return { slug, status: outcome.status };
  };

  try {
    domain = canonicalCompanyDomain(event.data.domain);
    slug = companySlugFromDomain(domain);
  } catch (error) {
    return finish({ status: "failed", stepStatus: "failed", stepMessage: boundedErrorMessage(error) });
  }

  // Read before the load step rather than inside it: a flag is not a durable value, and a run
  // whose flag flipped off between dispatch and execution should not pay for the card read.
  if (!howItWinsEnabled()) {
    return finish({
      status: "skipped",
      enabled: false,
      stepStatus: "skipped",
      stepMessage: "HOW_IT_WINS_ENABLED=false"
    });
  }

  const models = howItWinsModelsFromProcess(anthropicModel());
  const refinementEnabled = howItWinsRefinementEnabled();
  const verifierModel = modelForStage("verify", anthropicModel());
  const anthropic = createAnthropicClient();

  const loaded = await step.run("how-it-wins-load", async () => ({
    card: (await findCardBySlug(db, slug, { allowStale: true })) ?? null
  }));
  const card = loaded.card as ColdStartCard | null;
  if (!card) {
    return finish({ status: "skipped", stepStatus: "skipped", stepMessage: "card not found" });
  }
  if (!card.synthesis) {
    return finish({ status: "skipped", stepStatus: "skipped", stepMessage: "stored card carries no synthesis" });
  }
  const thinFileReason = howItWinsThinFileReason(card);
  if (thinFileReason) {
    // The analysis run writes thin_file onto the card itself and never dispatches, so reaching
    // here means the stored evidence thinned out after dispatch. Report it, write nothing.
    return finish({
      status: "thin_file",
      stepStatus: "skipped",
      stepMessage: `thin file: ${thinFileReason}`,
      thinFileReason
    });
  }

  const judged = await step.run("how-it-wins-judge", () =>
    howItWinsJudgeStepBody({ db, card, slug, client: anthropic, models, refinement: refinementEnabled })
  );
  if (!judged.ok) {
    return finish({ status: "failed", stepStatus: "failed", stepMessage: judged.error });
  }
  const judgmentRef = {
    id: judged.judgmentId,
    evidencePacketHash: judged.hashes.evidencePacketHash,
    promptHash: judged.hashes.promptHash,
    cached: judged.cached
  };
  const judgeFields = { judgmentRef, judgeSummary: judged.judgeSummary };
  // A paid judgment is this run's spend: its calls join the run's LLM ledger so cost_usd and every
  // spend report count the whole read (the first live run stamped $0.40 against a $0.49 judge).
  // A cached judgment cost this run nothing and adds nothing.
  if (!judged.cached) {
    mergeTracePatch(trace, llmTracePatchFromCalls(howItWinsJudgeLlmCalls(judged.judgeSummary)));
  }

  const written = await step.run("how-it-wins-write", async () => {
    const llmTelemetry = createStepLlmTelemetryCollector();
    const result = await timed(() =>
      howItWinsWriteStepBody({
        db,
        card,
        hashes: judged.hashes,
        client: anthropic,
        models,
        telemetry: llmTelemetry.telemetry
      })
    );
    return { value: result.value, tracePatch: llmTelemetry.tracePatch() };
  });
  mergeTracePatch(trace, written.tracePatch);
  if (!written.value.ok) {
    return finish({ status: "failed", stepStatus: "failed", stepMessage: written.value.error, ...judgeFields });
  }
  const writerFields = {
    editorSkipped: written.value.editorSkipped,
    fitRetried: written.value.fitRetried,
    styleIssueCount: written.value.styleIssueCount
  };
  const draft = written.value.read;

  let verified: HowItWins = draft;
  let dropReason: string | undefined;
  let losses: HowItWinsLosses | undefined;
  if (draft.status === "read") {
    const verifyResult = await step.run("how-it-wins-verify", async () => {
      const llmTelemetry = createStepLlmTelemetryCollector();
      const result = await timed(() =>
        howItWinsVerifyStepBody({
          card,
          read: draft,
          judgeCurrentCount: judged.judgeSummary.currentCount,
          client: anthropic,
          model: verifierModel,
          telemetry: llmTelemetry.telemetry
        })
      );
      return { value: result.value, tracePatch: llmTelemetry.tracePatch() };
    });
    mergeTracePatch(trace, verifyResult.tracePatch);
    if (!verifyResult.value.ok) {
      return finish({
        status: "failed",
        stepStatus: "failed",
        stepMessage: verifyResult.value.error,
        ...judgeFields,
        ...writerFields
      });
    }
    verified = verifyResult.value.howItWins;
    dropReason = verifyResult.value.dropReason;
    losses = verifyResult.value.losses;
  } else {
    // Nothing to verify, and no second step row for it: trace.howItWins.status already says the
    // writer filed no read. It is still a loss worth counting, and the largest one: the judge
    // found currentCount strategies and none of them reached a read.
    losses = {
      judgeCurrent: judged.judgeSummary.currentCount,
      writerCurrent: 0,
      verifiedRunning: 0,
      writerCitationDropped: 0,
      verifierDropped: 0,
      floorFired: false
    };
  }

  const stored = await step.run("how-it-wins-store", async () => {
    try {
      const result = await mutateCardWithRetry(db, slug, (current) => {
        // Recomputed against the freshest row inside mutateCard's compare-and-set loop, not
        // against the card this run loaded: a re-file that landed while the judge was running
        // must not have this read written over its new evidence.
        if (!current.synthesis) throw new HowItWinsStaleCardError();
        if (howItWinsJudgeInputs(current, refinementEnabled).hashes.evidencePacketHash !== judged.hashes.evidencePacketHash) {
          throw new HowItWinsStaleCardError();
        }
        return { ...current, synthesis: { ...current.synthesis, howItWins: verified } };
      }, { extendSynthesisTtl: false });
      // The read rides on the synthesis that is already there; a retry that lands hours later must
      // not stretch that synthesis window.
      return { written: result !== null };
    } catch (error) {
      if (error instanceof HowItWinsStaleCardError) {
        return { written: false };
      }
      throw error;
    }
  });

  if (!stored.written) {
    return finish({
      status: "stale",
      stepStatus: "skipped",
      stepMessage: "stored card moved since the judgment was made",
      ...judgeFields,
      ...writerFields,
      ...(losses ? { losses } : {})
    });
  }

  return finish({
    status: verified.status,
    stepStatus: "complete",
    ...(dropReason ? { dropReason } : {}),
    ...judgeFields,
    ...writerFields,
    ...(losses ? { losses } : {})
  });
};

// "No how-it-wins read" is the pre-existing copy for every outcome that files nothing, kept
// verbatim so the panel's event feed reads the same as it always has. Only the two outcomes the
// deferred read introduces get their own line.
function completionMessage(status: HowItWinsTraceStatus) {
  switch (status) {
    case "read":
      return "How it wins filed";
    case "failed":
      return "How it wins could not be read";
    case "stale":
      return "How it wins read against evidence that has since moved";
    default:
      return "No how-it-wins read";
  }
}

export const howItWinsFunction = inngest.createFunction(
  {
    id: "how-it-wins-read",
    triggers: { event: HOW_IT_WINS_EVENT_NAME },
    ...(howItWinsConcurrency ? { concurrency: { limit: howItWinsConcurrency } } : {})
  },
  howItWinsHandler
);
