import { hasUsablePublicProfile, type ColdStartCard } from "@cold-start/core";
import type { ExtensionResearchRunEvent } from "../extension-config";
import { firstPayoffForEvents, firstPayoffIsFiled } from "./first-payoff-events";

export function sourceLabel(count: number) {
  return `${count} ${count === 1 ? "source" : "sources"}`;
}

export function formatSavedDate(value: string) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return "earlier";
  }

  return new Intl.DateTimeFormat("en-US", { day: "numeric", month: "short", timeZone: "UTC" }).format(parsed);
}

// The filing decision for the early read, shared by the shell (which renders the read and the
// stamp) and the panel (which gates the partial-profile state on the same facts). Filing is
// event-driven; a "hit" card only files the read when no live artifact is present at all.
export function earlyReadState(card: ColdStartCard | null, events: ExtensionResearchRunEvent[]) {
  const firstPayoff = firstPayoffForEvents(events);
  const filed = firstPayoffIsFiled(events) || (!firstPayoff && card?.cacheStatus === "hit");
  return {
    firstPayoff,
    filed,
    showRead: Boolean(firstPayoff?.status === "substantive_first_read" && !filed),
    showSourcesChecked: filed
  };
}

export function showPartialProfileGate(card: ColdStartCard, events: ExtensionResearchRunEvent[]) {
  const read = earlyReadState(card, events);
  return !hasUsablePublicProfile(card) && !read.showRead && !read.showSourcesChecked;
}

export function websiteLabel(card: ColdStartCard) {
  const website = card.identity.websiteUrl?.value ?? `https://${card.domain}`;
  try {
    return new URL(website).hostname.replace(/^www\./i, "");
  } catch {
    return card.domain;
  }
}

export function readableCompanyName(card: ColdStartCard) {
  const extracted = card.identity.name.value?.trim();
  if (extracted && extracted.toLowerCase() !== card.domain.toLowerCase()) {
    return extracted;
  }

  const root = card.domain.replace(/^www\./i, "").split(".")[0] ?? card.domain;
  return root
    .split(/[-_]+/)
    .filter(Boolean)
    .map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`)
    .join(" ") || card.domain;
}
