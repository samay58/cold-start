import {
  firstSentence,
  isReadableProse,
  textLooksLikeCustomerProof,
  textLooksLikeDocs,
  textLooksLikeFunding,
  type FirstPayoff
} from "@cold-start/core";
import type { ExtensionResearchRunEvent, ExtensionSourceSummary } from "../shared/extension-config";
import { currentProfileProgressEvents } from "../research/research-progress";

// The clipping's source class is the same taxonomy First Payoff files evidence under.
export type ClippingSourceClass = FirstPayoff["evidenceSoFar"][number]["sourceClass"];

export type Clipping = {
  url: string;
  domain: string;
  title: string;
  note: string | null;
  sourceClass: ClippingSourceClass;
  imageUrl: string | null;
};

const GENERIC_TITLE_WORDS = new Set([
  "co",
  "company",
  "design",
  "docs",
  "documentation",
  "filing",
  "home",
  "homepage",
  "inc",
  "llc",
  "ltd",
  "official",
  "repo",
  "site"
]);

type ClippingSourceType = ExtensionSourceSummary["sourceType"];

// Mirrors the dispatch in packages/core/src/first-payoff.ts sourceClassFor, reusing core's
// exported text heuristics so the regexes live in exactly one place.
function clippingSourceClass(sourceType: ClippingSourceType, url: string, title: string): ClippingSourceClass {
  const text = `${url} ${title}`;
  if (sourceType === "company_site") {
    return textLooksLikeDocs(text) ? "docs" : "company_site";
  }
  if (sourceType === "news") {
    if (textLooksLikeFunding(text)) {
      return "funding";
    }
    if (textLooksLikeCustomerProof(text)) {
      return "customer_proof";
    }
    return "news";
  }
  if (sourceType === "filing") {
    return "registry";
  }
  if (sourceType === "github") {
    return "docs";
  }
  if (sourceType === "enrichment" || sourceType === "rdap") {
    return "database";
  }
  return "other";
}

function domainFromUrl(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./i, "");
  } catch {
    return url;
  }
}

function clippingNote(
  title: string,
  domain: string,
  sourceClass: ClippingSourceClass,
  snippet?: string
) {
  const cleanTitle = title.replace(/\s+/g, " ").trim();
  const proseTitle = isReadableProse(cleanTitle) ? cleanTitle : null;
  if (proseTitle && clippingHasUsefulTitle({ title: proseTitle, domain, sourceClass })) {
    return proseTitle;
  }
  // Gate the string that would render: the first sentence of the snippet.
  // Most snippets are raw provider JSON (a slice of sources.raw_text), so
  // rejection is the common case, and the bubble falls back to domain+type.
  const rawSnippet = snippet?.replace(/\s+/g, " ").trim() ?? "";
  const cleanSnippet = firstSentence(rawSnippet);
  if (
    cleanSnippet &&
    isReadableProse(cleanSnippet) &&
    cleanSnippet.toLowerCase() !== domain.toLowerCase()
  ) {
    return cleanSnippet.length > 180 ? `${cleanSnippet.slice(0, 177).trimEnd()}...` : cleanSnippet;
  }
  // A snippet was attempted and gated out: a boilerplate title on its own adds nothing
  // beyond the domain, so stay at domain+type rather than resurrecting it. With no
  // snippet at all, a bare prose title (a short product name) is still worth showing.
  return proseTitle && !rawSnippet && proseTitle.toLowerCase() !== domain.toLowerCase()
    ? proseTitle
    : null;
}

export function clippingHasUsefulTitle(
  clipping: Pick<Clipping, "domain" | "sourceClass" | "title"> & Partial<Pick<Clipping, "note">>
): boolean {
  const focusText = clipping.note ?? clipping.title;
  if (!isReadableProse(focusText)) {
    return false;
  }
  const words = focusText.toLowerCase().match(/[a-z0-9]+/g) ?? [];
  const domainWords = new Set(clipping.domain.toLowerCase().match(/[a-z0-9]+/g) ?? []);
  const usefulWords = words.filter((word) =>
    word.length > 1 && !domainWords.has(word) && !GENERIC_TITLE_WORDS.has(word)
  );
  if (clipping.sourceClass === "database" || clipping.sourceClass === "people") {
    return usefulWords.length >= 3;
  }
  return usefulWords.length > 0;
}

function clippingFromRaw(raw: unknown): Clipping | null {
  if (!raw || typeof raw !== "object") {
    return null;
  }
  const record = raw as Record<string, unknown>;
  const url = typeof record.url === "string" ? record.url : null;
  const sourceType = typeof record.sourceType === "string" ? record.sourceType : null;
  if (!url || !sourceType) {
    return null;
  }
  const title = typeof record.title === "string" ? record.title : "";
  const domain = typeof record.domain === "string" && record.domain ? record.domain : domainFromUrl(url);
  const imageUrl = typeof record.imageUrl === "string" ? record.imageUrl : null;
  const sourceClass = clippingSourceClass(sourceType as ClippingSourceType, url, title);
  const snippet = typeof record.snippet === "string" ? record.snippet : undefined;
  return {
    url,
    domain,
    title,
    sourceClass,
    note: clippingNote(title, domain, sourceClass, snippet),
    imageUrl
  };
}

// Reads the accepted-source lists carried on source events, deduped by url in
// arrival order, so building can show what research found before any fact exists. Scoped to
// the current run with the same currentProfileProgressEvents logic the seal and whisper use,
// so a resumed panel never mixes a previous run's clippings into the live run's display.
export function clippingsFromEvents(events: ExtensionResearchRunEvent[]): Clipping[] {
  const byUrl = new Map<string, Clipping>();
  for (const event of currentProfileProgressEvents(events)) {
    if (event.type !== "source.found" && event.type !== "source.enrichment") {
      continue;
    }
    const rawSources = event.metadata.sources;
    if (!Array.isArray(rawSources)) {
      continue;
    }
    for (const raw of rawSources) {
      const clipping = clippingFromRaw(raw);
      if (clipping && !byUrl.has(clipping.url)) {
        byUrl.set(clipping.url, clipping);
      }
    }
  }
  return [...byUrl.values()];
}

export function clippingsFromSources(sources: ExtensionSourceSummary[]): Clipping[] {
  const byUrl = new Map<string, Clipping>();
  for (const source of sources) {
    if (byUrl.has(source.url)) {
      continue;
    }
    const sourceClass = clippingSourceClass(source.sourceType, source.url, source.title);
    byUrl.set(source.url, {
      url: source.url,
      domain: source.domain,
      title: source.title,
      sourceClass,
      note: clippingNote(source.title, source.domain, sourceClass, source.snippet),
      imageUrl: source.imageUrl ?? null
    });
  }
  return [...byUrl.values()];
}

type ChromeFaviconRuntime = {
  runtime?: {
    getURL?: (path: string) => string;
    getManifest?: () => { permissions?: string[] };
  };
};

// MV3 favicon lookup: browser-cached, no external request. Gated on the manifest's favicon
// permission, not on getURL existing: Firefox has getURL but no _favicon/ endpoint, so an
// existence check emits a dead moz-extension URL per clipping (Bugzilla 1315616). Absent in
// jsdom and in permission-less manifests, so callers degrade to the classification dot.
export function faviconUrl(pageUrl: string): string | null {
  const runtime = (globalThis as { chrome?: ChromeFaviconRuntime }).chrome?.runtime;
  if (!runtime?.getURL || !runtime.getManifest) {
    return null;
  }
  try {
    if (!runtime.getManifest().permissions?.includes("favicon")) {
      return null;
    }
    return runtime.getURL(`_favicon/?pageUrl=${encodeURIComponent(pageUrl)}&size=16`);
  } catch {
    return null;
  }
}
