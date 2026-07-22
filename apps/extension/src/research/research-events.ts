import type { ExtensionResearchRunEvent } from "../shared/extension-config";

// Shared low-level primitives over ExtensionResearchRunEvent[], used by both the building-phase
// progress model (research-progress.ts) and the analysis-wait progress model
// (AnalysisWaitInstrument.tsx). The two stage vocabularies stay separate by design; only the
// event-list mechanics below are common.

export function metadataNumber(event: ExtensionResearchRunEvent | undefined, keys: string[]): number | null {
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

export function latestEventOfType(events: ExtensionResearchRunEvent[], type: string) {
  return [...events].reverse().find((event) => event.type === type);
}

// Finds the most recently created event in the list, then returns every event that shares its
// runId. Both currentProfileProgressEvents and currentAnalysisRunEvents scope a wider set of
// candidate events down to "the current run" this same way; they differ only in which candidates
// they scope (a filtered subset for the profile-run model, the full event list for analysis).
export function latestRunEvents(events: ExtensionResearchRunEvent[]): ExtensionResearchRunEvent[] {
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
