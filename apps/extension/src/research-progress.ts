import type { ExtensionResearchRunEvent } from "./extension-config";

export type ResearchProgressStage = {
  label: string;
  marker: string;
  note: string;
};

export type ResearchProgressStatus = "pending" | "running" | "done" | "attention" | "failed";

type ResearchProgressSubstep = {
  key: string;
  message: string;
  status: ResearchProgressStatus;
};

export type ResearchProgressStagePlan = ResearchProgressStage & {
  status: ResearchProgressStatus;
  substeps: ResearchProgressSubstep[];
};

export const RESEARCH_PROGRESS_STAGES: ResearchProgressStage[] = [
  { label: "Finding sources", marker: "01", note: "Looking for useful places to read" },
  { label: "Reading evidence", marker: "02", note: "Pulling in what matters" },
  { label: "Building the profile", marker: "03", note: "Turning evidence into a card" },
  { label: "Filing the card", marker: "04", note: "Saving the final profile" }
];

const researchStageByEventType: Record<string, number> = {
  "generation.queued": 0,
  "generation.started": 0,
  "plan.ready": 0,
  "source.found": 1,
  "source.enrichment": 1,
  "card.partial": 2,
  "card.saved": 3,
  "card.enriched": 3,
  "generation.complete": 3
};

function belongsToProfileRun(event: ExtensionResearchRunEvent) {
  if (event.sectionId) {
    return false;
  }

  const mode = event.metadata.mode;
  return mode === undefined || mode === "basics";
}

function metadataNumber(event: ExtensionResearchRunEvent, keys: string[]) {
  for (const key of keys) {
    const value = event.metadata[key];
    if (typeof value === "number" && Number.isFinite(value)) {
      return value;
    }
  }

  return null;
}

export function researchEventStageIndex(event: ExtensionResearchRunEvent) {
  if (!belongsToProfileRun(event)) {
    return null;
  }

  return researchStageByEventType[event.type] ?? null;
}

function profileProgressEvents(events: ExtensionResearchRunEvent[]) {
  return events.filter((event) => researchEventStageIndex(event) !== null);
}

function currentProfileProgressEvents(events: ExtensionResearchRunEvent[]) {
  const candidates = profileProgressEvents(events);
  let latestEvent: ExtensionResearchRunEvent | null = null;

  for (const event of candidates) {
    if (!latestEvent || event.createdAt.localeCompare(latestEvent.createdAt) > 0) {
      latestEvent = event;
    }
  }

  if (!latestEvent) {
    return [];
  }

  return candidates.filter((event) => event.runId === latestEvent.runId);
}

function researchEventStatus(event: ExtensionResearchRunEvent): ResearchProgressStatus {
  const normalized = `${event.type} ${event.message}`.toLowerCase();
  if (normalized.includes("failed") || normalized.includes("error")) {
    return "failed";
  }
  if (normalized.includes("blocked") || normalized.includes("insufficient") || normalized.includes("not found")) {
    return "attention";
  }
  return "done";
}

function displayResearchEventMessage(event: ExtensionResearchRunEvent) {
  if (event.type === "generation.queued") {
    return "Queued this company";
  }
  if (event.type === "generation.started") {
    return "Started research";
  }
  if (event.type === "plan.ready") {
    return "Picked a research plan";
  }
  if (event.type === "source.found") {
    const count = metadataNumber(event, ["acceptedCount", "sourceCount"]);
    return count !== null ? `Found ${count} ${count === 1 ? "source" : "sources"}` : "Found useful sources";
  }
  if (event.type === "source.enrichment") {
    return "Checked deeper sources";
  }
  if (event.type === "card.partial") {
    return "Starter profile ready";
  }
  if (event.type === "card.saved" || event.type === "card.enriched") {
    return "Filed the profile";
  }
  if (event.type === "generation.complete") {
    return "Research run complete";
  }

  return event.message
    .replace(/\baccepted sources\b/gi, "sources")
    .replace(/\bcompany profile\b/gi, "this company")
    .replace(/\bcompany card\b/gi, "profile")
    .replace(/\bthe card\b/gi, "the profile")
    .replace(/\bcard\b/gi, "profile");
}

export function generationStageIndexFromEvents(events: ExtensionResearchRunEvent[]) {
  return currentProfileProgressEvents(events).reduce<number | null>((highest, event) => {
    const stage = researchEventStageIndex(event);
    return typeof stage === "number" ? Math.max(highest ?? stage, stage) : highest;
  }, null);
}

export function acceptedSourceCountFromEvents(events: ExtensionResearchRunEvent[]) {
  let highestCount: number | null = null;

  for (const event of currentProfileProgressEvents(events)) {
    if (event.type === "source.found" || event.type === "source.enrichment") {
      const count = metadataNumber(event, ["acceptedCount", "sourceCount"]);
      if (count !== null) {
        highestCount = Math.max(highestCount ?? count, count);
        continue;
      }
    }

    const matched = event.message.match(/found\s+(\d+)\s+(?:accepted\s+)?sources/i);
    if (matched?.[1]) {
      const count = Number(matched[1]);
      if (Number.isFinite(count)) {
        highestCount = Math.max(highestCount ?? count, count);
      }
    }
  }

  return highestCount;
}

function statusForStage({
  activeIndex,
  complete,
  events,
  index
}: {
  activeIndex: number;
  complete: boolean;
  events: ExtensionResearchRunEvent[];
  index: number;
}): ResearchProgressStatus {
  const stageEvents = events.filter((event) => researchEventStageIndex(event) === index);
  if (stageEvents.some((event) => researchEventStatus(event) === "failed")) {
    return "failed";
  }
  if (stageEvents.some((event) => researchEventStatus(event) === "attention")) {
    return "attention";
  }
  if (complete && index <= activeIndex) {
    return "done";
  }
  if (index < activeIndex) {
    return "done";
  }
  if (index === activeIndex) {
    return "running";
  }
  return "pending";
}

export function buildResearchProgressPlan({
  activeIndex,
  complete = false,
  events,
  stageNote,
  stages = RESEARCH_PROGRESS_STAGES
}: {
  activeIndex: number;
  complete?: boolean;
  events: ExtensionResearchRunEvent[];
  stageNote: string;
  stages?: ResearchProgressStage[];
}): ResearchProgressStagePlan[] {
  const safeActiveIndex = stages.length > 0 ? Math.min(Math.max(Math.trunc(activeIndex), 0), stages.length - 1) : 0;
  const orderedEvents = currentProfileProgressEvents(events)
    .sort((left, right) => left.createdAt.localeCompare(right.createdAt));

  return stages.map((stage, stageIndex) => {
    const stageEvents = orderedEvents.filter((event) => researchEventStageIndex(event) === stageIndex);
    const substeps =
      stageEvents.length > 0
        ? stageEvents.map((event) => ({
            key: event.id,
            message: displayResearchEventMessage(event),
            status: researchEventStatus(event)
          }))
        : stageIndex === safeActiveIndex && !complete
          ? [{ key: `stage-${stage.marker}`, message: stageNote || stage.note, status: "running" as const }]
          : [];

    return {
      ...stage,
      status: statusForStage({
        activeIndex: safeActiveIndex,
        complete,
        events: orderedEvents,
        index: stageIndex
      }),
      substeps
    };
  });
}
