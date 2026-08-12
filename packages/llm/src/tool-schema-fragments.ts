/*
 * Shared Anthropic tool JSON-schema fragments and citation-marker helpers for every stage that
 * emits a claim with visible [id] markers matching its citationIds array. Synthesis and the
 * emphasis read both need the exact same fragment and the exact same multiset check, so both
 * import from here instead of keeping their own copies that can drift apart.
 */
export const nonEmptyStringSchema = { type: "string", minLength: 1 } as const;

const citationMarkerPattern = "\\[[A-Za-z0-9_-]+\\]";
export const citationMarkerRegex = /\[([A-Za-z0-9_-]+)\]/g;

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
