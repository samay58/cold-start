import { textLooksLikeCustomerProof, textLooksLikeDocs, textLooksLikeFunding, type FirstPayoff } from "@cold-start/core";
import type { ExtensionResearchRunEvent, ExtensionSourceSummary } from "./extension-config";
import { currentProfileProgressEvents } from "./research-progress";

// The clipping's source class is the same taxonomy First Payoff files evidence under.
export type ClippingSourceClass = FirstPayoff["evidenceSoFar"][number]["sourceClass"];

export type Clipping = {
  url: string;
  domain: string;
  title: string;
  sourceClass: ClippingSourceClass;
  imageUrl: string | null;
};

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
  return {
    url,
    domain,
    title,
    sourceClass: clippingSourceClass(sourceType as ClippingSourceType, url, title),
    imageUrl
  };
}

// Reads the accepted-source list carried on source.found events (B1), deduped by url in
// arrival order, so building can show what research found before any fact exists. Scoped to
// the current run with the same currentProfileProgressEvents logic the seal and whisper use,
// so a resumed panel never mixes a previous run's clippings into the live run's display.
export function clippingsFromEvents(events: ExtensionResearchRunEvent[]): Clipping[] {
  const byUrl = new Map<string, Clipping>();
  for (const event of currentProfileProgressEvents(events)) {
    if (event.type !== "source.found") {
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
    byUrl.set(source.url, {
      url: source.url,
      domain: source.domain,
      title: source.title,
      sourceClass: clippingSourceClass(source.sourceType, source.url, source.title),
      imageUrl: source.imageUrl ?? null
    });
  }
  return [...byUrl.values()];
}

type ChromeFaviconRuntime = { runtime?: { getURL?: (path: string) => string } };

// MV3 favicon lookup: browser-cached, no external request. Absent in jsdom and until the
// manifest gains the permission, so callers degrade to the classification dot.
export function faviconUrl(pageUrl: string): string | null {
  const runtime = (globalThis as { chrome?: ChromeFaviconRuntime }).chrome?.runtime;
  if (!runtime?.getURL) {
    return null;
  }
  try {
    return runtime.getURL(`_favicon/?pageUrl=${encodeURIComponent(pageUrl)}&size=16`);
  } catch {
    return null;
  }
}
