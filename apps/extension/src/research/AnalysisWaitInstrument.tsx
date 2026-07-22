import { motion } from "framer-motion";
import { useMemo } from "react";
import type { ExtensionResearchRunEvent } from "../shared/extension-config";
import { formatElapsed } from "../shared/extension-format";
import { motionTokens } from "../shared/motion-primitives";

// The watchable wait: a small fixed stage vocabulary driven only by real generation events,
// never elapsed time or a percentage (gold-standard-references.md, waiting UX track: Railway's
// three live deploy states, Vercel discarding superseded queued builds). Sibling in structure to
// SourcePassInstrument (the building-phase equivalent), but its own component: analysis events
// carry different names and the verify stamp moment has no basics-phase analog.
export type AnalysisWaitStageId = "queue" | "gather" | "read" | "verify" | "file";
type AnalysisWaitStageStatus = "pending" | "current" | "done" | "skipped";

export type AnalysisWaitStage = {
  id: AnalysisWaitStageId;
  label: string;
  proofLine: string;
  status: AnalysisWaitStageStatus;
};

const STAGE_ORDER: Array<{ id: AnalysisWaitStageId; label: string }> = [
  { id: "queue", label: "Queue" },
  { id: "gather", label: "Gather" },
  { id: "read", label: "Read" },
  { id: "verify", label: "Verify" },
  { id: "file", label: "File" }
];

// One trigger event per stage, per the brief's stage model. source.enrichment is folded into
// Gather defensively (the late-enrichment fetch path); it is not part of the analysis event
// stream today (apps/web/src/inngest/functions.ts only emits source.found for mode "analysis"),
// but mapping it costs nothing and keeps this table honest if that ever changes.
const STAGE_INDEX_BY_EVENT_TYPE: Record<string, number> = {
  "generation.queued": 0,
  "generation.started": 0,
  "plan.ready": 0,
  "source.found": 1,
  "source.enrichment": 1,
  "synthesis.started": 2,
  "verify.started": 3,
  "verify.complete": 3,
  "card.saved": 4,
  "generation.complete": 4
};

function stageIndexForEvent(event: ExtensionResearchRunEvent): number | null {
  const index = STAGE_INDEX_BY_EVENT_TYPE[event.type];
  return typeof index === "number" ? index : null;
}

// A retried run (after a withheld or failed verdict) can leave an earlier run's terminal events
// sitting in the same events array; scope to the run that produced the latest event, the same
// "latest runId" discipline research-progress.ts's currentProfileProgressEvents applies for the
// building phase. Without this, a retry would flash File-stage-reached for a beat off the stale
// prior run's own card.saved/generation.complete before the new run's first event lands.
export function currentAnalysisRunEvents(events: ExtensionResearchRunEvent[]): ExtensionResearchRunEvent[] {
  let latest: ExtensionResearchRunEvent | null = null;
  for (const event of events) {
    if (!latest || event.createdAt.localeCompare(latest.createdAt) > 0) {
      latest = event;
    }
  }
  if (!latest) {
    return [];
  }
  const latestRunId = latest.runId;
  return events.filter((event) => event.runId === latestRunId);
}

function metadataNumber(event: ExtensionResearchRunEvent | undefined, keys: string[]): number | null {
  if (!event) {
    return null;
  }
  for (const key of keys) {
    const value = event.metadata[key];
    if (typeof value === "number" && Number.isFinite(value)) {
      return value;
    }
  }
  return null;
}

function latestEventOfType(events: ExtensionResearchRunEvent[], type: string) {
  return [...events].reverse().find((event) => event.type === type);
}

function plural(count: number, singular: string) {
  return `${count} ${singular}${count === 1 ? "" : "s"}`;
}

// verify.complete's real payload (apps/web/src/inngest/functions.ts, the Task 5.2 emission)
// carries the survivor count in metadata.claimCount: `{claimCount: survivedClaimCount}` alongside
// the "${M} claims survived" message. Metadata is the load-bearing binding; the message parse is
// only a fallback for a hand-built event that has prose but no structured metadata.
export function verifySurvivorCount(event: ExtensionResearchRunEvent | undefined): number | null {
  const fromMetadata = metadataNumber(event, ["claimCount"]);
  if (fromMetadata !== null) {
    return fromMetadata;
  }
  const match = event?.message.match(/^(\d+)\s+claims?\s+survived/i);
  return match ? Number(match[1]) : null;
}

function gatherProofLine(events: ExtensionResearchRunEvent[]) {
  const sourceFound = latestEventOfType(events, "source.found");
  if (!sourceFound) {
    return "Checking company, funding, and proof sources";
  }
  // Task 5.3's analysisSourceRefresh field on source.found's metadata: "skip" means the run
  // reused the card's already-filed evidence instead of re-fetching.
  if (sourceFound.metadata.analysisSourceRefresh === "skip") {
    return "Reusing filed evidence";
  }
  const count = metadataNumber(sourceFound, ["acceptedCount", "sourceCount"]);
  return count !== null ? `${plural(count, "source")} found` : "Sources found";
}

function readProofLine(events: ExtensionResearchRunEvent[]) {
  const started = latestEventOfType(events, "synthesis.started");
  return started && started.message.trim().length > 0 ? started.message : "Reading the filed evidence";
}

function verifyProofLine(events: ExtensionResearchRunEvent[]) {
  const complete = latestEventOfType(events, "verify.complete");
  if (complete && complete.message.trim().length > 0) {
    return complete.message;
  }
  const started = latestEventOfType(events, "verify.started");
  return started && started.message.trim().length > 0 ? started.message : "Checking claims against sources";
}

function fileProofLine(events: ExtensionResearchRunEvent[]) {
  return latestEventOfType(events, "card.saved") ? "Filed" : "Saving with sources attached";
}

const PROOF_LINE_BUILDERS: Record<AnalysisWaitStageId, (events: ExtensionResearchRunEvent[]) => string> = {
  queue: () => "Queued for analysis",
  gather: gatherProofLine,
  read: readProofLine,
  verify: verifyProofLine,
  file: fileProofLine
};

// The stage plan: an event gap produces no blank state (an unrecognized or missing event simply
// leaves the highest-reached stage unchanged), and a stage that is skipped outright -- the
// gate-withheld path, which emits neither synthesis.started nor verify.started before jumping
// straight from source.found to card.saved -- renders honestly as "skipped" rather than as a
// false "done".
export function analysisWaitStagePlan(events: ExtensionResearchRunEvent[]): AnalysisWaitStage[] {
  const scoped = currentAnalysisRunEvents(events);
  const reached = new Set<number>();
  for (const event of scoped) {
    const index = stageIndexForEvent(event);
    if (index !== null) {
      reached.add(index);
    }
  }
  // No events yet still means Queue is current: the client sets analysisRun optimistically
  // before the first status poll ever lands (see runAnalysisGenerationWithController /
  // resumeAnalysisWithController in sidepanel.tsx), so the run is genuinely queued already.
  const highest = reached.size > 0 ? Math.max(...reached) : 0;

  return STAGE_ORDER.map((stage, index) => {
    const status: AnalysisWaitStageStatus =
      index > highest ? "pending" : index === highest ? "current" : reached.has(index) ? "done" : "skipped";
    return {
      ...stage,
      proofLine: PROOF_LINE_BUILDERS[stage.id](scoped),
      status
    };
  });
}

function StageMark({ status }: { status: AnalysisWaitStageStatus }) {
  if (status === "current" || status === "skipped") {
    return <span className="cs-wait-mark" data-status={status} aria-hidden="true" />;
  }

  return (
    <span className="cs-wait-mark" data-status={status} aria-hidden="true">
      <svg viewBox="0 0 14 14" width="14" height="14" focusable="false">
        {status === "done" ? <path d="M3 7.2 5.8 10 11 4.4" /> : <circle cx="7" cy="7" r="4.4" />}
      </svg>
    </span>
  );
}

const MAX_VISIBLE_VERIFY_STAMPS = 12;

// The signature verify moment: claims stamp in one by one as marks, not text. The verifier's
// verdict is final (CLAUDE.md: "Verifier drops stay dropped") and the stamp count is the only new
// fact this surface states about it; no claim text is ever invented here.
function VerifyStamps({
  count,
  prefersReducedMotion
}: {
  count: number;
  prefersReducedMotion: boolean | null;
}) {
  const visibleCount = Math.min(count, MAX_VISIBLE_VERIFY_STAMPS);
  const overflow = count - visibleCount;

  return (
    <ul className="cs-wait-stamps" aria-label={`${plural(count, "claim")} survived`}>
      {Array.from({ length: visibleCount }, (_, index) => (
        <motion.li
          animate={{ opacity: 1, scale: 1 }}
          className="cs-wait-stamp"
          initial={prefersReducedMotion ? { opacity: 0 } : { opacity: 0, scale: 0.55 }}
          key={index}
          transition={{
            delay: prefersReducedMotion ? 0 : index * 0.05,
            duration: prefersReducedMotion ? 0.12 : motionTokens.stateMs,
            ease: motionTokens.easeOut
          }}
        />
      ))}
      {overflow > 0 ? <li className="cs-wait-stamps-more">{`+${overflow}`}</li> : null}
    </ul>
  );
}

export function AnalysisWaitInstrument({
  elapsedSeconds,
  events,
  prefersReducedMotion
}: {
  elapsedSeconds: number;
  events: ExtensionResearchRunEvent[];
  prefersReducedMotion: boolean | null;
}) {
  const scoped = useMemo(() => currentAnalysisRunEvents(events), [events]);
  const stages = useMemo(() => analysisWaitStagePlan(events), [events]);
  const verifyCompleteEvent = latestEventOfType(scoped, "verify.complete");
  const survivorCount = verifySurvivorCount(verifyCompleteEvent);
  const currentStage = stages.find((stage) => stage.status === "current") ?? stages[0];

  return (
    <div aria-label="Investor Lens running" className="cs-wait" role="status">
      <div className="cs-wait-head">
        <strong>Investor Lens running</strong>
        <span className="cs-wait-elapsed" aria-hidden="true">{formatElapsed(elapsedSeconds)}</span>
      </div>
      <ol className="cs-wait-stages">
        {stages.map((stage) => (
          <li className="cs-wait-stage" data-status={stage.status} key={stage.id}>
            <StageMark status={stage.status} />
            <span className="cs-wait-stage-copy">
              <strong>{stage.label}</strong>
              <span>{stage.proofLine}</span>
            </span>
            {stage.id === "verify" && verifyCompleteEvent && survivorCount !== null ? (
              <VerifyStamps count={survivorCount} prefersReducedMotion={prefersReducedMotion} />
            ) : null}
          </li>
        ))}
      </ol>
      <p aria-live="polite" className="sr-only">
        {currentStage ? `${currentStage.label}. ${currentStage.proofLine}.` : null}
      </p>
    </div>
  );
}
