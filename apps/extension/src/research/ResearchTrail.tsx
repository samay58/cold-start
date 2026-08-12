import type { ExtensionResearchRunEvent } from "../shared/extension-config";
import {
  acceptedSourceCountFromEvents,
  generationStageIndexFromEvents,
  RESEARCH_PROGRESS_STAGES
} from "./research-progress";
import { SourcePassInstrument } from "./SourcePassInstrument";

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

// The build tree is the building phase's progress surface, open from the first frame: four
// stages, event-fed substeps, and the drizzle loader on whichever stage is running. Every
// state change comes from a real run event; the loader is the one constant motion.
export function ResearchTrail({ events, generationStatus }: ResearchTrailProps) {
  const eventSourceCount = acceptedSourceCountFromEvents(events);
  const sourceCount = eventSourceCount ?? 0;
  const queuedQuietly = generationStatus === "queued";
  const eventStageIndex = queuedQuietly ? 0 : generationStageIndexFromEvents(events);
  const activeIndex = Math.min(
    RESEARCH_PROGRESS_STAGES.length - 1,
    Math.max(0, eventStageIndex ?? (sourceCount > 0 ? 1 : 0))
  );
  const stageNote = queuedQuietly ? "Company queued" : stageNoteFor(activeIndex, sourceCount);

  return (
    <div className="cs-assembly-details" aria-label="Research details">
      <SourcePassInstrument
        activeIndex={activeIndex}
        complete={false}
        events={events}
        sources={[]}
        stageNote={stageNote}
        stages={RESEARCH_PROGRESS_STAGES}
        variant="compact"
      />
    </div>
  );
}
