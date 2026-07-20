import { parseFirstPayoff, type FirstPayoff } from "@cold-start/core";
import type { ExtensionResearchRunEvent, ExtensionSourceSummary } from "./extension-config";
import { currentProfileProgressEvents } from "./research/research-progress";

const filedEventTypes = new Set(["card.saved", "card.enriched"]);

export function firstPayoffForEvents(events: ExtensionResearchRunEvent[] = []): FirstPayoff | null {
  const profileEvents = currentProfileProgressEvents(events);

  for (const event of [...profileEvents].reverse()) {
    const firstPayoff = parseFirstPayoff(event.metadata.firstPayoff);
    if (firstPayoff) {
      return firstPayoff;
    }
  }

  return null;
}

export function firstPayoffIsFiled(events: ExtensionResearchRunEvent[] = []) {
  return currentProfileProgressEvents(events).some((event) => filedEventTypes.has(event.type));
}

function metadataSourceCount(event: ExtensionResearchRunEvent) {
  const value = event.metadata.sourceCount;
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export function filedSourceCount(events: ExtensionResearchRunEvent[], sources: ExtensionSourceSummary[]) {
  const profileEvents = currentProfileProgressEvents(events);

  for (const event of [...profileEvents].reverse()) {
    if (event.type !== "card.saved" && event.type !== "card.enriched") {
      continue;
    }
    const count = metadataSourceCount(event);
    if (count !== null) {
      return count;
    }
  }

  return sources.length;
}
