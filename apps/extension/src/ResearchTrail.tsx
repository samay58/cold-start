import { lazy, Suspense, useState } from "react";
import type { ExtensionResearchRunEvent, ExtensionSourceSummary } from "./extension-config";
import {
  acceptedSourceCountFromEvents,
  buildResearchProgressPlan,
  currentProfileProgressEvents,
  generationStageIndexFromEvents,
  hasTerminalProfileProgressEvent,
  RESEARCH_PROGRESS_STAGES
} from "./research-progress";

// The full build tree only appears behind the Details toggle (or on attention), so its chunk
// stays out of the shell's first paint.
const SourcePassInstrument = lazy(() =>
  import("./SourcePassInstrument").then((module) => ({ default: module.SourcePassInstrument }))
);

const VISIBLE_SOURCE_COUNT = 3;

type ResearchTrailProps =
  | {
      mode: "building";
      events: ExtensionResearchRunEvent[];
      generationStatus: "queued" | "running" | "cached" | "complete" | "failed";
      sources?: ExtensionSourceSummary[] | undefined;
    }
  | {
      mode: "profile";
      events?: ExtensionResearchRunEvent[] | undefined;
      isFinalizingProfile: boolean;
      isRunning: boolean;
      isProfileRunning: boolean;
      resolvedCount: number;
      sources?: ExtensionSourceSummary[] | undefined;
      totalCount: number;
    };

function plural(value: number, singular: string, pluralWord = `${singular}s`) {
  return `${value} ${value === 1 ? singular : pluralWord}`;
}

function sourceKindLabel(sourceType: ExtensionSourceSummary["sourceType"]) {
  switch (sourceType) {
    case "company_site":
      return "primary";
    case "enrichment":
      return "enrichment";
    case "filing":
      return "filing";
    case "github":
      return "GitHub";
    case "news":
      return "news";
    case "rdap":
      return "domain";
    case "other":
      return "other";
  }
}

function progressPlanHasAttention(plan: ReturnType<typeof buildResearchProgressPlan>) {
  return plan.some((stage) =>
    stage.status === "attention" ||
    stage.status === "failed" ||
    stage.substeps.some((substep) => substep.status === "attention" || substep.status === "failed")
  );
}

function currentProgressProof(plan: ReturnType<typeof buildResearchProgressPlan>, activeIndex: number, fallback: string) {
  const stage = plan[activeIndex];
  const latestSubstep = [...(stage?.substeps ?? [])].reverse().find((substep) => substep.status !== "running");
  return latestSubstep?.message ?? stage?.proofLine ?? fallback;
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

// The trail's spine: four stage segments that fill only when a real generation event says so.
// No wall-clock estimation; a running segment breathes, a done segment sets.
function TrailTrack({ plan }: { plan: ReturnType<typeof buildResearchProgressPlan> }) {
  return (
    <ol className="cs-trail-track" aria-hidden="true">
      {plan.map((stage) => (
        <li className="cs-trail-segment" data-status={stage.status} key={stage.marker}>
          <span className="cs-trail-segment-fill" />
          <span className="cs-trail-segment-label">{stage.label}</span>
        </li>
      ))}
    </ol>
  );
}

export function ResearchTrail(props: ResearchTrailProps) {
  const events = props.events ?? [];
  const sources = props.sources ?? [];
  const eventSourceCount = acceptedSourceCountFromEvents(events);
  const sourceCount = Math.max(sources.length, eventSourceCount ?? 0);
  const building = props.mode === "building";
  const queuedQuietly = building && props.generationStatus === "queued";
  const eventStageIndex = building && props.generationStatus === "queued" ? 0 : generationStageIndexFromEvents(events);
  const activeIndex = Math.min(
    RESEARCH_PROGRESS_STAGES.length - 1,
    Math.max(0, eventStageIndex ?? (sourceCount > 0 ? 1 : 0))
  );
  const stageNote = queuedQuietly ? "Company queued" : stageNoteFor(activeIndex, sourceCount);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const isProfileRunning = building ? true : props.isProfileRunning;
  const isRunning = building ? true : props.isRunning;
  const plan = buildResearchProgressPlan({
    activeIndex,
    complete: !isProfileRunning,
    events,
    sources,
    stageNote,
    stages: RESEARCH_PROGRESS_STAGES
  });
  const currentProfileEvents = currentProfileProgressEvents(events);
  const profileEventsSeen = currentProfileEvents.length > 0;
  const profileComplete = building
    ? false
    : !props.isProfileRunning &&
      (hasTerminalProfileProgressEvent(events) ||
        (!props.isRunning && sourceCount > 0 && props.totalCount > 0 && props.resolvedCount >= props.totalCount));
  const needsAttention = progressPlanHasAttention(plan);
  const showDetailsControl = (building || profileEventsSeen) && !needsAttention;
  const showDetailsTree = needsAttention || detailsOpen;
  const currentStage = plan[activeIndex];
  const stateCopy = building
    ? queuedQuietly
      ? "Queued"
      : "Researching"
    : props.isFinalizingProfile
      ? "Starter profile ready"
      : profileComplete
        ? "Research filed"
        : props.isRunning
          ? "Researching"
          : "Research saved";
  const sourceCopy = sourceCount > 0
    ? !building && props.isFinalizingProfile
      ? `Filling in contacts and details · ${plural(sourceCount, "source")}`
      : profileComplete
        ? plural(sourceCount, "source")
        : `${plural(sourceCount, "source")} found`
    : !building && props.isFinalizingProfile
      ? "Filling in contacts and details"
      : "Checking company, product, funding, and proof sources";
  const sectionCopy = building
    ? null
    : profileComplete
      ? `${props.resolvedCount} of ${props.totalCount} sections`
      : `${props.resolvedCount} of ${props.totalCount} sections ready`;
  const liveStageCopy = needsAttention ? "Needs attention" : currentStage?.label ?? "Researching";
  const liveProofCopy = currentProgressProof(plan, activeIndex, stageNote);
  // The live row earns its place only when it says something the main line does not.
  const liveDuplicatesMain = liveProofCopy.trim().toLowerCase() === sourceCopy.trim().toLowerCase();
  const showLiveProgress = needsAttention ||
    (!profileComplete && (isProfileRunning || profileEventsSeen) && !liveDuplicatesMain);

  // Building: the header whisper is the status voice and the clippings are the content, so the
  // trail is only the quiet details toggle plus the tree it opens (auto-open on attention).
  if (building) {
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
              complete={profileComplete || !isProfileRunning}
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

  return (
    <div
      className="cs-research-progress"
      aria-label="Research progress"
      data-attention={needsAttention ? "true" : "false"}
      data-mode={profileComplete ? "filed" : "live"}
      data-phase={props.mode}
    >
      <div className="cs-research-progress-main">
        <span className="cs-research-progress-dot" data-running={!profileComplete && isRunning ? "true" : "false"} aria-hidden="true" />
        <div>
          <strong>{stateCopy}</strong>
          <small>
            {sourceCopy}
            {sectionCopy ? ` · ${sectionCopy}` : ""}
          </small>
        </div>
      </div>
      {!profileComplete ? <TrailTrack plan={plan} /> : null}
      {showLiveProgress ? (
        <div className="cs-research-progress-live" aria-live="polite">
          <span>{liveStageCopy}</span>
          <small>{liveProofCopy}</small>
        </div>
      ) : null}
      {showDetailsControl ? (
        <button
          aria-expanded={detailsOpen}
          className="cs-research-progress-details-toggle"
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
            complete={profileComplete || !isProfileRunning}
            events={events}
            sources={sources}
            stageNote={stageNote}
            stages={RESEARCH_PROGRESS_STAGES}
            variant="compact"
          />
        </Suspense>
      ) : null}
      {sources.length > 0 && (!profileComplete || detailsOpen || needsAttention) ? (
        <div className="cs-research-source-strip" aria-label="Recent sources">
          {sources.slice(0, VISIBLE_SOURCE_COUNT).map((source) => (
            <a href={source.url} key={source.id} rel="noreferrer" target="_blank" title={source.snippet}>
              <span>{source.domain}</span>
              <small>{sourceKindLabel(source.sourceType)}</small>
            </a>
          ))}
        </div>
      ) : null}
    </div>
  );
}
