import { lazy, Suspense, useState } from "react";
import type { ExtensionResearchRunEvent } from "../shared/extension-config";
import {
  acceptedSourceCountFromEvents,
  buildResearchProgressPlan,
  generationStageIndexFromEvents,
  RESEARCH_PROGRESS_STAGES
} from "./research-progress";

// The full build tree only appears behind the Details toggle (or on attention), so its chunk
// stays out of the shell's first paint.
const SourcePassInstrument = lazy(() =>
  import("./SourcePassInstrument").then((module) => ({ default: module.SourcePassInstrument }))
);

type ResearchTrailProps = {
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

// The header whisper (cs-assembly-whisper in CompanyArc) is the status voice and the clippings
// are the content, so the trail is only the quiet details toggle plus the tree it opens
// (auto-open on attention).
export function ResearchTrail({ events, generationStatus }: ResearchTrailProps) {
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
      {showDetailsControl ? (
        <button
          aria-expanded={detailsOpen}
          className="cs-assembly-details-toggle"
          onClick={() => setDetailsOpen((current) => !current)}
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
