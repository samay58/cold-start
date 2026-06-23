// Citation markers are bracketed id lists like [c1], [c1, c2], or [e3]. The bracket
// body is always id-shaped (word chars, dots, dashes, comma-separated), so a prose
// bracket such as [item one] is left intact. Rendering surfaces strip these markers
// before showing synthesis or evidence text to a reader.
const citationMarkerPattern = /\s*\[[\w.-]+(?:,\s*[\w.-]+)*\]/g;

export function stripCitationMarkers(text: string): string {
  return text
    .replace(citationMarkerPattern, "")
    .replace(/\s+([.,;:!?])/g, "$1")
    .replace(/\s{2,}/g, " ")
    .trim();
}
