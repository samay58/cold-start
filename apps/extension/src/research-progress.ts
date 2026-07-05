import { parseFirstPayoff, textLooksLikeDocs, textLooksLikeFunding, type FirstPayoff } from "@cold-start/core";
import type { ExtensionResearchRunEvent } from "./extension-config";
import type { ExtensionSourceSummary } from "./extension-config";

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
  proofLine: string;
  status: ResearchProgressStatus;
  substeps: ResearchProgressSubstep[];
};

export const RESEARCH_PROGRESS_STAGES: ResearchProgressStage[] = [
  { label: "Sources", marker: "01", note: "Checking company, product, funding, and proof sources" },
  { label: "Proof", marker: "02", note: "Waiting for sources" },
  { label: "Profile", marker: "03", note: "Waiting for evidence" },
  { label: "Filed", marker: "04", note: "Waiting for profile" }
];

const boundedSourceCategories = [
  "company site",
  "docs",
  "funding coverage",
  "product page",
  "people source",
  "customer proof",
  "filing",
  "news",
  "database"
] as const;

type BoundedSourceCategory = typeof boundedSourceCategories[number];

const sourceCategoryRank = new Map<BoundedSourceCategory, number>(
  boundedSourceCategories.map((category, index) => [category, index])
);

const researchStageByEventType: Record<string, number> = {
  "generation.queued": 0,
  "generation.started": 0,
  "plan.ready": 0,
  "source.found": 1,
  "source.enrichment": 1,
  "first_payoff.receipt": 1,
  "first_payoff.ready": 2,
  "first_payoff.withheld": 1,
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

function metadataStringArray(event: ExtensionResearchRunEvent, keys: string[]) {
  for (const key of keys) {
    const value = event.metadata[key];
    if (Array.isArray(value)) {
      return value.filter((item): item is string => typeof item === "string");
    }
  }

  return [];
}

function researchEventStageIndex(event: ExtensionResearchRunEvent) {
  if (!belongsToProfileRun(event)) {
    return null;
  }

  return researchStageByEventType[event.type] ?? null;
}

function researchEventDisplayStageIndex(event: ExtensionResearchRunEvent) {
  if (!belongsToProfileRun(event)) {
    return null;
  }

  if (event.type === "source.found") {
    return 0;
  }

  return researchStageByEventType[event.type] ?? null;
}

function profileProgressEvents(events: ExtensionResearchRunEvent[]) {
  return events.filter((event) => researchEventStageIndex(event) !== null);
}

export function currentProfileProgressEvents(events: ExtensionResearchRunEvent[]) {
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

function normalizeSourceCategory(value: string): BoundedSourceCategory | null {
  const normalized = value.toLowerCase().replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim();
  return boundedSourceCategories.find((category) => category === normalized) ?? null;
}

function sourceLooksLikeDocs(source: Pick<ExtensionSourceSummary, "domain" | "snippet" | "title" | "url">) {
  return textLooksLikeDocs(`${source.domain} ${source.title} ${source.snippet} ${source.url}`);
}

function sourceLooksLikeFunding(source: Pick<ExtensionSourceSummary, "domain" | "snippet" | "title" | "url">) {
  return textLooksLikeFunding(`${source.domain} ${source.title} ${source.snippet} ${source.url}`);
}

function categoryForSource(source: ExtensionSourceSummary): BoundedSourceCategory | null {
  if (source.sourceType === "company_site") {
    return sourceLooksLikeDocs(source) ? "docs" : "company site";
  }
  if (source.sourceType === "news") {
    return sourceLooksLikeFunding(source) ? "funding coverage" : "news";
  }
  if (source.sourceType === "filing") {
    return "filing";
  }
  if (source.sourceType === "github") {
    return "product page";
  }
  if (source.sourceType === "enrichment" || source.sourceType === "rdap") {
    return "database";
  }
  return null;
}

function sourceCategoriesFromEvents(events: ExtensionResearchRunEvent[]) {
  const categories = new Set<BoundedSourceCategory>();

  for (const event of events) {
    for (const value of metadataStringArray(event, ["sourceCategories", "sourceCategoryLabels"])) {
      const category = normalizeSourceCategory(value);
      if (category) {
        categories.add(category);
      }
    }
  }

  return [...categories].sort((left, right) => (sourceCategoryRank.get(left) ?? 0) - (sourceCategoryRank.get(right) ?? 0));
}

function sourceCategoriesFromSources(sources: ExtensionSourceSummary[]) {
  const categories = new Set<BoundedSourceCategory>();

  for (const source of sources) {
    const category = categoryForSource(source);
    if (category) {
      categories.add(category);
    }
  }

  return [...categories].sort((left, right) => (sourceCategoryRank.get(left) ?? 0) - (sourceCategoryRank.get(right) ?? 0));
}

function sentenceList(items: string[]) {
  if (items.length === 0) {
    return "";
  }
  if (items.length === 1) {
    return items[0] ?? "";
  }
  if (items.length === 2) {
    return `${items[0]} and ${items[1]}`;
  }
  return `${items.slice(0, -1).join(", ")}, and ${items[items.length - 1]}`;
}

function capitalizeFirst(value: string) {
  return value ? `${value.slice(0, 1).toUpperCase()}${value.slice(1)}` : value;
}

const firstPayoffSourceClassRank: Record<FirstPayoff["evidenceSoFar"][number]["sourceClass"], number> = {
  company_site: 0,
  docs: 1,
  funding: 2,
  customer_proof: 3,
  people: 4,
  registry: 5,
  news: 6,
  database: 7,
  jobs: 8,
  other: 9
};

const firstPayoffSourceClassLabel: Record<FirstPayoff["evidenceSoFar"][number]["sourceClass"], string> = {
  company_site: "company site",
  customer_proof: "customer proof",
  database: "database",
  docs: "docs",
  funding: "funding",
  jobs: "jobs",
  news: "news",
  other: "source",
  people: "people",
  registry: "registry"
};

function cleanNeedText(text: string) {
  const trimmed = text.replace(/[.。]+$/u, "").trim();
  return trimmed ? `${trimmed.slice(0, 1).toLowerCase()}${trimmed.slice(1)}` : "stronger proof";
}

function firstPayoffProgressLine(event: ExtensionResearchRunEvent) {
  const firstPayoff = parseFirstPayoff(event.metadata.firstPayoff);
  if (!firstPayoff || firstPayoff.status === "substantive_first_read") {
    return null;
  }

  if (firstPayoff.entityConfidence === "needs_check") {
    return "Checking the company match before filing a read";
  }

  const classes = [...new Set(firstPayoff.evidenceSoFar.map((item) => item.sourceClass))]
    .sort((left, right) => firstPayoffSourceClassRank[left] - firstPayoffSourceClassRank[right])
    .map((sourceClass) => firstPayoffSourceClassLabel[sourceClass]);
  if (classes.length === 0) {
    return `Need ${cleanNeedText(firstPayoff.stillChecking.text)}`;
  }

  return `Filed ${sentenceList(classes)}; need ${cleanNeedText(firstPayoff.stillChecking.text)}`;
}

function sourceArtifactLine({
  events,
  sources
}: {
  events: ExtensionResearchRunEvent[];
  sources: ExtensionSourceSummary[];
}) {
  const categories = sourceCategoriesFromSources(sources);
  const eventCategories = categories.length > 0 ? categories : sourceCategoriesFromEvents(events);
  if (eventCategories.length > 0) {
    return `${capitalizeFirst(sentenceList(eventCategories))} found`;
  }

  const count = acceptedSourceCountFromEvents(events);
  return count !== null ? `${count} ${count === 1 ? "source" : "sources"} found` : null;
}

function citationArtifactLine(event: ExtensionResearchRunEvent | undefined) {
  if (!event) {
    return "First cited profile ready";
  }

  const citationCount = metadataNumber(event, ["citationCount"]);
  return citationCount !== null
    ? `First cited profile ready - ${citationCount} ${citationCount === 1 ? "citation" : "citations"}`
    : "First cited profile ready";
}

function latestEventOfType(events: ExtensionResearchRunEvent[], type: string) {
  return [...events].reverse().find((event) => event.type === type);
}

function proofLineForStage({
  activeIndex,
  events,
  index,
  sources
}: {
  activeIndex: number;
  events: ExtensionResearchRunEvent[];
  index: number;
  sources: ExtensionSourceSummary[];
}) {
  if (index === 0) {
    const sourceArtifact = sourceArtifactLine({ events, sources });
    if (sourceArtifact) {
      return sourceArtifact;
    }
    return events.some((event) => event.type === "generation.queued")
      ? "Company queued"
      : "Checking company, product, funding, and proof sources";
  }

  if (index === 1) {
    const firstPayoffEvent = latestEventOfType(events, "first_payoff.receipt") ?? latestEventOfType(events, "first_payoff.withheld");
    if (firstPayoffEvent) {
      const firstPayoffLine = firstPayoffProgressLine(firstPayoffEvent);
      if (firstPayoffLine) {
        return firstPayoffLine;
      }
    }
    if (events.some((event) => event.type === "source.enrichment")) {
      return "Funding, product, people, and customer proof checked";
    }
    return activeIndex >= 1 ? "Checking funding, product, people, and customer proof" : "Waiting for sources";
  }

  if (index === 2) {
    const profileEvent = latestEventOfType(events, "card.partial");
    if (profileEvent) {
      return citationArtifactLine(profileEvent);
    }
    return activeIndex >= 2 ? "Building first cited profile" : "Waiting for evidence";
  }

  const savedEvent = latestEventOfType(events, "card.saved");
  if (events.some((event) => event.type === "generation.complete")) {
    return "Research filed";
  }
  if (savedEvent) {
    return "Saved with sources attached";
  }
  return activeIndex >= 3 ? "Saving with sources attached" : "Waiting for profile";
}

function displayResearchEventMessage(event: ExtensionResearchRunEvent) {
  if (event.type === "generation.queued") {
    return "Company queued";
  }
  if (event.type === "generation.started") {
    return null;
  }
  if (event.type === "plan.ready") {
    return null;
  }
  if (event.type === "source.found") {
    const count = metadataNumber(event, ["acceptedCount", "sourceCount"]);
    return count !== null ? `${count} ${count === 1 ? "source" : "sources"} found` : "Useful sources found";
  }
  if (event.type === "source.enrichment") {
    return "Checked deeper sources";
  }
  if (event.type === "first_payoff.receipt") {
    return firstPayoffProgressLine(event);
  }
  if (event.type === "first_payoff.ready") {
    return null;
  }
  if (event.type === "first_payoff.withheld") {
    return firstPayoffProgressLine(event);
  }
  if (event.type === "card.partial") {
    return citationArtifactLine(event);
  }
  if (event.type === "card.saved") {
    return "Saved with sources attached";
  }
  if (event.type === "card.enriched") {
    return "Filled remaining fields";
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

// The seal instrument inks up in four discrete steps, each tied to a real stage event. No
// wall-clock estimation: a level is the highest a run's events have earned.
const sealLevelByEventType: Record<string, 0 | 1 | 2 | 3 | 4> = {
  "generation.queued": 0,
  "generation.started": 0,
  "plan.ready": 1,
  "source.found": 2,
  "source.enrichment": 2,
  "first_payoff.receipt": 2,
  "first_payoff.withheld": 2,
  "first_payoff.ready": 3,
  "card.partial": 3,
  "card.saved": 4,
  "card.enriched": 4,
  "generation.complete": 4
};

export function sealLevelFromEvents(events: ExtensionResearchRunEvent[]): 0 | 1 | 2 | 3 | 4 {
  let level: 0 | 1 | 2 | 3 | 4 = 0;
  for (const event of currentProfileProgressEvents(events)) {
    const candidate = sealLevelByEventType[event.type];
    if (candidate !== undefined && candidate > level) {
      level = candidate;
    }
  }
  return level;
}

// The single progress voice in the header: it states where the run is, never how long it has
// taken. Queued -> reading the site -> building from N sources -> filed.
export function whisperCopyFromEvents(events: ExtensionResearchRunEvent[], domain: string): string {
  const level = sealLevelFromEvents(events);
  if (level >= 4) {
    return "Filed";
  }
  if (level <= 0) {
    return "Queued";
  }
  if (level === 1) {
    return `Reading ${domain}`;
  }
  const count = acceptedSourceCountFromEvents(events);
  if (count && count > 0) {
    return `${count} ${count === 1 ? "source" : "sources"}, building profile`;
  }
  return "Building profile";
}

// The attention signal that flips the whisper and auto-opens the details tree: any current-run
// stage event that failed or needs a closer look.
export function hasResearchProgressAttention(events: ExtensionResearchRunEvent[]): boolean {
  return currentProfileProgressEvents(events).some((event) => {
    const status = researchEventStatus(event);
    return status === "attention" || status === "failed";
  });
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
  sources = [],
  stageNote,
  stages = RESEARCH_PROGRESS_STAGES
}: {
  activeIndex: number;
  complete?: boolean;
  events: ExtensionResearchRunEvent[];
  sources?: ExtensionSourceSummary[];
  stageNote: string;
  stages?: ResearchProgressStage[];
}): ResearchProgressStagePlan[] {
  const safeActiveIndex = stages.length > 0 ? Math.min(Math.max(Math.trunc(activeIndex), 0), stages.length - 1) : 0;
  const orderedEvents = currentProfileProgressEvents(events)
    .sort((left, right) => left.createdAt.localeCompare(right.createdAt));

  return stages.map((stage, stageIndex) => {
    const stageEvents = orderedEvents.filter((event) => researchEventDisplayStageIndex(event) === stageIndex);
    const seenSubsteps = new Set<string>();
    const substeps =
      stageEvents.length > 0
        ? stageEvents.flatMap((event) => {
            const message = displayResearchEventMessage(event);
            if (!message) {
              return [];
            }
            const normalized = message.toLowerCase().replace(/\s+/g, " ").trim();
            if (seenSubsteps.has(normalized)) {
              return [];
            }
            seenSubsteps.add(normalized);
            return [{
              key: event.id,
              message,
              status: researchEventStatus(event)
            }];
          })
        : stageIndex === safeActiveIndex && !complete
          ? [{ key: `stage-${stage.marker}`, message: stageNote || stage.note, status: "running" as const }]
          : [];
    const proofLine = proofLineForStage({
      activeIndex: safeActiveIndex,
      events: orderedEvents,
      index: stageIndex,
      sources
    });
    const normalizedProofLine = proofLine.toLowerCase().replace(/\s+/g, " ").trim();

    return {
      ...stage,
      proofLine,
      status: statusForStage({
        activeIndex: safeActiveIndex,
        complete,
        events: orderedEvents,
        index: stageIndex
      }),
      substeps: substeps.filter((substep) => substep.message.toLowerCase().replace(/\s+/g, " ").trim() !== normalizedProofLine)
    };
  });
}
