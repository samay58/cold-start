import { afterEach, describe, expect, it, vi } from "vitest";
import { clippingsFromEvents, clippingsFromSources, faviconUrl } from "../src/clipping-model";
import type { ExtensionResearchRunEvent, ExtensionSourceSummary } from "../src/extension-config";

function event(
  input: Partial<ExtensionResearchRunEvent> & Pick<ExtensionResearchRunEvent, "id" | "type">
): ExtensionResearchRunEvent {
  return {
    createdAt: "2026-07-05T00:00:00.000Z",
    domain: "exa.ai",
    message: input.type,
    metadata: {},
    runId: "run-1",
    sectionId: null,
    slug: "exa",
    ...input
  };
}

function source(
  input: Partial<ExtensionSourceSummary> & Pick<ExtensionSourceSummary, "sourceType" | "domain">
): ExtensionSourceSummary {
  return {
    fetchedAt: "2026-07-05T00:00:00.000Z",
    id: `${input.sourceType}-${input.domain}`,
    snippet: "",
    title: input.domain,
    url: `https://${input.domain}`,
    ...input
  };
}

describe("clippingsFromEvents", () => {
  it("reads the source list off source.found metadata and classifies by source class", () => {
    const clippings = clippingsFromEvents([
      event({
        id: "sources",
        type: "source.found",
        metadata: {
          acceptedCount: 4,
          sources: [
            { url: "https://exa.ai/", domain: "exa.ai", title: "Exa", sourceType: "company_site", imageUrl: null },
            { url: "https://docs.exa.ai/", domain: "docs.exa.ai", title: "Exa API guide", sourceType: "company_site", imageUrl: null },
            { url: "https://techcrunch.com/exa", domain: "techcrunch.com", title: "Exa raises a Series B round", sourceType: "news", imageUrl: "https://img/tc.png" },
            { url: "https://sec.gov/exa", domain: "sec.gov", title: "Filing", sourceType: "filing", imageUrl: null }
          ]
        }
      })
    ]);

    expect(clippings.map((clipping) => clipping.sourceClass)).toEqual([
      "company_site",
      "docs",
      "funding",
      "registry"
    ]);
    expect(clippings.map((clipping) => clipping.domain)).toEqual([
      "exa.ai",
      "docs.exa.ai",
      "techcrunch.com",
      "sec.gov"
    ]);
    expect(clippings[2]?.imageUrl).toBe("https://img/tc.png");
    expect(clippings[0]?.imageUrl).toBeNull();
  });

  it("dedupes repeated urls across events and ignores non-source events", () => {
    const clippings = clippingsFromEvents([
      event({ id: "queued", type: "generation.queued" }),
      event({
        id: "sources-1",
        type: "source.found",
        metadata: { sources: [{ url: "https://exa.ai/", domain: "exa.ai", title: "Exa", sourceType: "company_site", imageUrl: null }] }
      }),
      event({
        id: "sources-2",
        type: "source.found",
        metadata: {
          sources: [
            { url: "https://exa.ai/", domain: "exa.ai", title: "Exa", sourceType: "company_site", imageUrl: null },
            { url: "https://news.com/exa", domain: "news.com", title: "Exa deploys with a named customer", sourceType: "news", imageUrl: null }
          ]
        }
      })
    ]);

    expect(clippings.map((clipping) => clipping.url)).toEqual(["https://exa.ai/", "https://news.com/exa"]);
    expect(clippings[1]?.sourceClass).toBe("customer_proof");
  });

  it("returns an empty list when no source metadata is present", () => {
    expect(clippingsFromEvents([event({ id: "queued", type: "generation.queued" })])).toEqual([]);
    expect(clippingsFromEvents([])).toEqual([]);
  });

  it("scopes to the current run, dropping a previous run's clippings once a new run starts", () => {
    const previousRun = event({
      id: "prev-sources",
      runId: "run-0",
      createdAt: "2026-07-05T00:00:00.000Z",
      type: "source.found",
      metadata: {
        sources: [{ url: "https://old.com", domain: "old.com", title: "Old", sourceType: "company_site", imageUrl: null }]
      }
    });
    const newRunQueued = event({
      id: "new-queued",
      runId: "run-1",
      createdAt: "2026-07-05T00:05:00.000Z",
      type: "generation.queued"
    });
    const newRunSources = event({
      id: "new-sources",
      runId: "run-1",
      createdAt: "2026-07-05T00:05:01.000Z",
      type: "source.found",
      metadata: {
        sources: [{ url: "https://new.com", domain: "new.com", title: "New", sourceType: "company_site", imageUrl: null }]
      }
    });

    const clippings = clippingsFromEvents([previousRun, newRunQueued, newRunSources]);

    expect(clippings.map((clipping) => clipping.url)).toEqual(["https://new.com"]);
  });

  it("skips malformed source entries without throwing", () => {
    const clippings = clippingsFromEvents([
      event({
        id: "sources",
        type: "source.found",
        metadata: { sources: [null, { title: "no url" }, { url: "https://ok.com", sourceType: "github", title: "repo" }] }
      })
    ]);

    expect(clippings).toHaveLength(1);
    expect(clippings[0]?.sourceClass).toBe("docs");
    expect(clippings[0]?.domain).toBe("ok.com");
  });
});

describe("clippingsFromSources", () => {
  it("maps stored source summaries and carries imageUrl", () => {
    const clippings = clippingsFromSources([
      source({ domain: "exa.ai", sourceType: "company_site", imageUrl: null }),
      source({ domain: "example.com", sourceType: "enrichment" }),
      source({ domain: "wired.com", sourceType: "news", title: "Exa raised a new round", imageUrl: "https://img/w.png" })
    ]);

    expect(clippings.map((clipping) => clipping.sourceClass)).toEqual(["company_site", "database", "funding"]);
    expect(clippings[2]?.imageUrl).toBe("https://img/w.png");
    expect(clippings[0]?.imageUrl).toBeNull();
  });
});

describe("faviconUrl", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns null when the chrome favicon API is unavailable", () => {
    expect(faviconUrl("https://exa.ai/")).toBeNull();
  });

  it("builds a browser-cached favicon url through chrome.runtime.getURL", () => {
    vi.stubGlobal("chrome", {
      runtime: { getURL: (path: string) => `chrome-extension://abc/${path}` }
    });

    expect(faviconUrl("https://exa.ai/")).toBe(
      "chrome-extension://abc/_favicon/?pageUrl=https%3A%2F%2Fexa.ai%2F&size=16"
    );
  });
});
