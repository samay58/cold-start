import { splitIntoSentences } from "./sentences";

/*
 * The one way to turn a stored source into text a model or a reader sees. Most providers store
 * `sources.raw_text` as the serialized provider record, and older card snippets are slices of that
 * JSON, so every reader goes through here and handles both forms. Order: page text, summary,
 * highlights, then the title. The result is never JSON.
 */

export const SOURCE_SNIPPET_MAX_LENGTH = 600;

export function readableSourceText(rawText: string | null | undefined, title = ""): string {
  const raw = (rawText ?? "").trim();
  const readable = tidy(raw.startsWith("{") ? pageTextFromRecord(raw) : isJsonArray(raw) ? "" : raw);
  return readable && !readable.startsWith("{") ? readable : tidy(title);
}

// The snippet for a stored source: its readable text (never JSON), cut to the snippet cap. Any
// snippet built from `sources.raw_text` or a provider record starts here; the title stands in for
// a record with no page text only when it is passed.
export function snippetFromStoredSource(rawText: string | null | undefined, title = ""): string {
  return sourceSnippet(readableSourceText(rawText, title));
}

// A snippet is the source's own text, cut at a sentence boundary. The text must already be readable:
// a stored record goes through snippetFromStoredSource, or its JSON becomes the snippet.
export function sourceSnippet(text: string): string {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (normalized.length <= SOURCE_SNIPPET_MAX_LENGTH) return normalized;

  let snippet = "";
  for (const sentence of splitIntoSentences(normalized)) {
    const next = snippet ? `${snippet} ${sentence}` : sentence;
    if (next.length > SOURCE_SNIPPET_MAX_LENGTH) break;
    snippet = next;
  }
  if (snippet) return snippet;

  const cut = normalized.slice(0, SOURCE_SNIPPET_MAX_LENGTH);
  const lastSpace = cut.lastIndexOf(" ");
  return (lastSpace > 0 ? cut.slice(0, lastSpace) : cut).trim();
}

// The publish date a stored provider record carries (Exa's publishedDate), or null. Never the
// fetch time: an undated source stays undated.
export function sourcePublishedAt(rawText: string | null | undefined): string | null {
  const record = parseRecord((rawText ?? "").trim());
  const value = record?.publishedDate ?? record?.publishedAt;
  return typeof value === "string" && !Number.isNaN(Date.parse(value)) ? value : null;
}

// A stored JSON array (a provider response listing records) carries no page text. Markdown that
// opens with a link also starts with "[", so only text that parses as an array counts.
function isJsonArray(raw: string): boolean {
  if (!raw.startsWith("[")) return false;
  try {
    return Array.isArray(JSON.parse(raw));
  } catch {
    return false;
  }
}

function parseRecord(raw: string): Record<string, unknown> | null {
  if (!raw.startsWith("{")) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

function pageTextFromRecord(raw: string): string {
  const record = parseRecord(raw);
  if (!record) return "";
  const field = (key: string) => (typeof record[key] === "string" ? (record[key] as string).trim() : "");
  const highlights = Array.isArray(record.highlights)
    ? record.highlights.filter((part): part is string => typeof part === "string").join("\n")
    : "";
  return field("text") || field("summary") || highlights;
}

// Markdown links keep their words, images and heading marks go, and Exa's "[...]" highlight
// separators go, so the text reads as prose instead of spending length on URLs. Line breaks
// stay, one per non-empty line, because page lines carry meaning (the early read picks a line).
function tidy(text: string): string {
  return text
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .split(/\r?\n/)
    .map((line) => line.replace(/^\s*#{1,6}\s+/, "").replace(/^\s*(?:\[\.\.\.\]|\.\.\.)\s*$/, "").replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .join("\n");
}
