import { lazy, Suspense, useState } from "react";
import type { ExtensionResearchRunEvent } from "../shared/extension-config";
import { useAlphaEvent } from "../shared/alpha-event-context";
import {
  acceptedSourceCountFromEvents,
  buildResearchProgressPlan,
  generationStageIndexFromEvents,
  RESEARCH_PROGRESS_STAGES,
  type ResearchProgressStatus
} from "./research-progress";

// The full build tree only appears behind the Details toggle (or on attention), so its chunk
// stays out of the shell's first paint.
const SourcePassInstrument = lazy(() =>
  import("./SourcePassInstrument").then((module) => ({ default: module.SourcePassInstrument }))
);

type ResearchTrailProps = {
  companyDomain?: string | undefined;
  events: ExtensionResearchRunEvent[];
  // "withheld" is only meaningful for analysis-mode responses; the building phase this trail
  // renders is basics-only and never produces it, but the shared GenerationStatus type carries
  // it structurally, so it is accepted here and treated like any other non-"queued" status.
  generationStatus: "queued" | "running" | "cached" | "complete" | "failed" | "withheld";
};

function plural(value: number, singular: string, pluralWord = `${singular}s`) {
  return `${value} ${value === 1 ? singular : pluralWord}`;
}

function progressPlanHasAttention(plan: ReturnType<typeof buildResearchProgressPlan>) {
  return plan.some((stage) =>
    stage.status === "attention" ||
    stage.status === "failed" ||
    stage.substeps.some((substep) => substep.status === "attention" || substep.status === "failed")
  );
}

function stageNoteFor(activeIndex: number, sourceCount: number) {
  if (activeIndex === 1 && sourceCount > 0) {
    return `${plural(sourceCount, "source")} found`;
  }
  if (activeIndex === 2) {
    return "Building first cited profile";
  }
  if (activeIndex === 3) {
    return "Saving with sources attached";
  }
  return "Checking company, product, funding, and proof sources";
}

function StageMark({ status }: { status: ResearchProgressStatus }) {
  return (
    <span aria-hidden="true" className="cs-progress-ledger-mark" data-status={status}>
      {status === "done" ? (
        <svg viewBox="0 0 16 16"><path d="m3.5 8.2 2.7 2.7 6.2-6.1" /></svg>
      ) : status === "failed" ? (
        <svg viewBox="0 0 16 16"><path d="m4.2 4.2 7.6 7.6M11.8 4.2l-7.6 7.6" /></svg>
      ) : status === "attention" ? (
        <svg viewBox="0 0 16 16"><path d="M8 3.5v5.3M8 12.2h.01" /></svg>
      ) : (
        <span />
      )}
    </span>
  );
}

// Clippings carry the readable content. This ledger keeps the four real research stages visible,
// while the deeper event tree stays behind Details unless something needs attention.
export function ResearchTrail({
  companyDomain,
  events,
  generationStatus
}: ResearchTrailProps) {
  const emitAlphaEvent = useAlphaEvent();
  const sources: [] = [];
  const eventSourceCount = acceptedSourceCountFromEvents(events);
  const sourceCount = Math.max(sources.length, eventSourceCount ?? 0);
  const queuedQuietly = generationStatus === "queued";
  const eventStageIndex = queuedQuietly ? 0 : generationStageIndexFromEvents(events);
  const activeIndex = Math.min(
    RESEARCH_PROGRESS_STAGES.length - 1,
    Math.max(0, eventStageIndex ?? (sourceCount > 0 ? 1 : 0))
  );
  const stageNote = queuedQuietly ? "Company queued" : stageNoteFor(activeIndex, sourceCount);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const plan = buildResearchProgressPlan({
    activeIndex,
    complete: false,
    events,
    sources,
    stageNote,
    stages: RESEARCH_PROGRESS_STAGES
  });
  const needsAttention = progressPlanHasAttention(plan);
  const showDetailsControl = !needsAttention;
  const showDetailsTree = needsAttention || detailsOpen;

  return (
    <div
      className="cs-assembly-details"
      aria-label="Research details"
      data-attention={needsAttention ? "true" : "false"}
    >
      <ol className="cs-progress-ledger">
        {plan.map((stage, index) => (
          <li
            aria-current={index === activeIndex ? "step" : undefined}
            data-active={index === activeIndex ? "true" : "false"}
            data-status={stage.status}
            key={stage.marker}
          >
            <StageMark status={stage.status} />
            <span className="cs-progress-ledger-label">{stage.label}</span>
          </li>
        ))}
      </ol>
      <p className="cs-progress-ledger-note">{plan[activeIndex]?.proofLine ?? stageNote}</p>
      {showDetailsControl ? (
        <button
          aria-expanded={detailsOpen}
          className="cs-assembly-details-toggle"
          onClick={() => {
            const nextOpen = !detailsOpen;
            setDetailsOpen(nextOpen);
            if (companyDomain) {
              emitAlphaEvent("research.details_toggled", {
                domain: companyDomain,
                expanded: nextOpen
              });
            }
          }}
          type="button"
        >
          {detailsOpen ? "Hide details" : "Details"}
        </button>
      ) : null}
      {showDetailsTree ? (
        <Suspense fallback={null}>
          <SourcePassInstrument
            activeIndex={activeIndex}
            complete={false}
            events={events}
            sources={sources}
            stageNote={stageNote}
            stages={RESEARCH_PROGRESS_STAGES}
            variant="compact"
          />
        </Suspense>
      ) : null}
    </div>
  );
}
