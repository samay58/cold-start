/*
 * Shared Anthropic tool JSON-schema fragments and citation-marker helpers for every stage that
 * emits a claim with visible [id] markers matching its citationIds array. Synthesis and the
 * emphasis read both need the exact same fragment and the exact same multiset check, so both
 * import from here instead of keeping their own copies that can drift apart.
 */
import type { SourcedText } from "@cold-start/core";

export const nonEmptyStringSchema = { type: "string", minLength: 1 } as const;

const citationMarkerPattern = "\\[[A-Za-z0-9_-]+\\]";
const citationMarkerRegex = /\[([A-Za-z0-9_-]+)\]/g;

export const sourcedTextToolSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    text: {
      type: "string",
      pattern: citationMarkerPattern,
      description: "Claim text with visible citation markers such as [c1]."
    },
    citationIds: { type: "array", minItems: 1, items: nonEmptyStringSchema }
  },
  required: ["text", "citationIds"]
} as const;

export function visibleCitationMarkers(text: string): string[] {
  return Array.from(text.matchAll(citationMarkerRegex), (match) => match[1]).filter(
    (citationId): citationId is string => citationId !== undefined
  );
}

function sortedCitationIds(citationIds: string[]): string[] {
  return [...citationIds].sort();
}

export function sameCitationMultiset(left: string[], right: string[]): boolean {
  const sortedLeft = sortedCitationIds(left);
  const sortedRight = sortedCitationIds(right);
  return sortedLeft.length === sortedRight.length && sortedLeft.every((citationId, index) => citationId === sortedRight[index]);
}

export function uniqueCitationIds(citationIds: string[]): string[] {
  return Array.from(new Set(citationIds.filter((citationId) => citationId.trim().length > 0)));
}

export function textWithCitationMarkers(text: string, citationIds: string[]) {
  const base = text.replace(citationMarkerRegex, "").replace(/\s+/g, " ").trim();
  const markers = citationIds.map((citationId) => `[${citationId}]`).join(" ");
  if (citationIds.length === 0) {
    return base;
  }

  if (!base) {
    return markers;
  }

  return `${base.replace(/[.\s]+$/, "")} ${markers}.`;
}

// Rebuilds a claim's markers from its citationIds: each id once, at the end of the text. The
// panel strips markers before display, so moving them changes nothing a reader sees; it only
// stops a repeated or missing marker from failing a claim whose ids are sound.
export function normalizeClaimCitations(claim: SourcedText): SourcedText {
  const visibleMarkers = uniqueCitationIds(visibleCitationMarkers(claim.text));
  const citationIds = uniqueCitationIds(claim.citationIds.length > 0 ? claim.citationIds : visibleMarkers);
  return {
    ...claim,
    citationIds,
    text: textWithCitationMarkers(claim.text, citationIds)
  };
}
