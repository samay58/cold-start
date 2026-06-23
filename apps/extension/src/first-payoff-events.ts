import { parseFirstPayoff, type FirstPayoff } from "@cold-start/core";
import type { ExtensionResearchRunEvent } from "./extension-config";
import { currentProfileProgressEvents } from "./research-progress";

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
