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
    return "Building first profile";
  }
  if (activeIndex === 3) {
    return "Saving with sources attached";
  }
  return "Checking company, product, funding, and proof sources";
}

// Drawn marks, sharing the analysis wait's vocabulary (research-trail.css .cs-wait-mark): a
// verified check for done, a pulsing seal square for the running stage (the ledger's one live
// signal; reduced motion swaps it for the shared slow breath), a quiet ring while waiting, and
// the conflict/company colors for failed and attention. Status only ever changes on a real run
// event, so every mark transition here is event-driven by construction.
function StageLedgerMark({ status }: { status: ResearchProgressStatus }) {
  if (status === "running") {
    return <span aria-hidden="true" className="cs-progress-ledger-mark" data-status={status} />;
  }

  return (
    <span aria-hidden="true" className="cs-progress-ledger-mark" data-status={status}>
      <svg viewBox="0 0 14 14" width="14" height="14" focusable="false">
        {status === "done" ? (
          <path d="M3 7.2 5.8 10 11 4.4" />
        ) : status === "failed" ? (
          <>
            <path d="M4.2 4.2 9.8 9.8" />
            <path d="M9.8 4.2 4.2 9.8" />
          </>
        ) : status === "attention" ? (
          <>
            <path d="M7 3.4v4.4" />
            <path d="M7 10.4h.01" />
          </>
        ) : (
          <circle cx="7" cy="7" r="4.4" />
        )}
      </svg>
    </span>
  );
}

// Clippings carry the readable content. The stage list is a quiet filing ledger, not a progress
// bar. The deeper event tree stays behind Details unless something needs attention, and when it
// opens it replaces the ledger in place: both surfaces speak the same four stages, so showing
// them stacked would say everything twice.
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
      {showDetailsTree ? null : (
        <ol className="cs-progress-ledger">
          {plan.map((stage, index) => {
            const active = index === activeIndex;
            return (
              <li
                aria-current={active ? "step" : undefined}
                data-active={active ? "true" : "false"}
                data-status={stage.status}
                key={stage.marker}
              >
                <StageLedgerMark status={stage.status} />
                <span className="cs-progress-ledger-copy">
                  <strong className="cs-progress-ledger-label">{stage.label}</strong>
                  {active ? (
                    <span className="cs-progress-ledger-note">{stage.proofLine || stageNote}</span>
                  ) : null}
                </span>
              </li>
            );
          })}
        </ol>
      )}
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
