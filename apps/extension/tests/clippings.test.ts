import { afterEach, describe, expect, it, vi } from "vitest";
import {
  clippingHasUsefulTitle,
  clippingsFromEvents,
  clippingsFromSources,
  faviconUrl
} from "../src/company/clipping-model";
import type { ExtensionResearchRunEvent, ExtensionSourceSummary } from "../src/shared/extension-config";

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
    expect(clippings[0]?.note).toBe("Exa");
    expect(clippings[2]?.note).toBe("Exa raises a Series B round");
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

  it("merges later enrichment sources into the same clipping set", () => {
    const initial = Array.from({ length: 13 }, (_, index) => ({
      url: `https://company.com/source-${index + 1}`,
      domain: "company.com",
      title: `Company source ${index + 1}`,
      sourceType: "company_site",
      snippet: `Source ${index + 1} discusses the company.`,
      imageUrl: null
    }));
    const clippings = clippingsFromEvents([
      event({ id: "sources", type: "source.found", metadata: { acceptedCount: 13, sources: initial } }),
      event({
        id: "enrichment",
        type: "source.enrichment",
        metadata: {
          sourceCount: 15,
          sources: [
            ...initial,
            { url: "https://news.com/source-14", domain: "news.com", title: "Company source 14", sourceType: "news", snippet: "Source 14 discusses the company.", imageUrl: null },
            { url: "https://news.com/source-15", domain: "news.com", title: "Company source 15", sourceType: "news", snippet: "Source 15 discusses the company.", imageUrl: null }
          ]
        }
      })
    ]);

    expect(clippings).toHaveLength(15);
    expect(clippings.slice(-2).map((clipping) => clipping.url)).toEqual([
      "https://news.com/source-14",
      "https://news.com/source-15"
    ]);
  });

  it("uses a source snippet when the page title says nothing useful", () => {
    const [clipping] = clippingsFromEvents([
      event({
        id: "sources",
        type: "source.found",
        metadata: {
          sources: [{
            url: "https://company.com",
            domain: "company.com",
            title: "Company",
            sourceType: "company_site",
            snippet: "The company sells workflow software to regional clinics. A second sentence is omitted."
          }]
        }
      })
    ]);

    expect(clipping?.note).toBe("The company sells workflow software to regional clinics.");
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

  it("refuses a JSON snippet as a note instead of rendering provider payloads", () => {
    const [clipping] = clippingsFromEvents([
      event({
        id: "sources",
        type: "source.found",
        metadata: {
          sources: [{
            url: "https://cartesia.ai/sonic",
            domain: "cartesia.ai",
            title: "Cartesia",
            sourceType: "company_site",
            snippet: '{"requestId":"2f3fbeb69bc7c6b81d1bd35367afafc2","results":[{"id":"https://cartesia.ai/sonic?gad_campaignid=23084431172","title":"Real-time TTS API with AI laughter and emotion | Cartesia Sonic-3"'
          }]
        }
      })
    ]);

    // Junk snippet, generic title: the bubble keeps domain and type only.
    expect(clipping?.note).toBeNull();
  });

  it("refuses a junk title outright, even as the last fallback", () => {
    const [clipping] = clippingsFromEvents([
      event({
        id: "sources",
        type: "source.found",
        metadata: {
          sources: [{
            url: "https://api.example.com/record",
            domain: "example.com",
            title: '{"organization":{"id":"6578dc4066927303d3b5b396","name":"Cartesia"',
            sourceType: "enrichment",
            snippet: ""
          }]
        }
      })
    ]);

    expect(clipping?.note).toBeNull();
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
    expect(clippings[1]?.note).toBeNull();
  });
});

describe("clippingHasUsefulTitle", () => {
  it("keeps boilerplate source titles quiet and lets real headlines take focus", () => {
    const base = { domain: "cartesia.ai", sourceClass: "company_site" as const };
    expect(clippingHasUsefulTitle({ ...base, title: "Cartesia" })).toBe(false);
    expect(clippingHasUsefulTitle({ ...base, domain: "docs.cartesia.ai", title: "Cartesia docs" })).toBe(false);
    expect(clippingHasUsefulTitle({ ...base, title: "Real-time multimodal intelligence | Cartesia" })).toBe(true);
    expect(clippingHasUsefulTitle({ ...base, sourceClass: "funding", title: "Cartesia raises a Series B" })).toBe(true);
    expect(clippingHasUsefulTitle({ ...base, sourceClass: "database", title: "Jessica N." })).toBe(false);
  });

  it("never lets gate-failing text take the featured slot", () => {
    const base = { domain: "cartesia.ai", sourceClass: "company_site" as const };
    expect(clippingHasUsefulTitle({
      ...base,
      title: '{"requestId":"abc","results":[{"title":"Real-time TTS API with AI laughter"}]}'
    })).toBe(false);
    expect(clippingHasUsefulTitle({
      ...base,
      title: "Cartesia",
      note: '[![](https://framerusercontent.com/images/J0k8tAFEkkDowBZmjeWMoRC5ZfI.png?width=200&height=200)'
    })).toBe(false);
  });
});

describe("faviconUrl", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns null when the chrome favicon API is unavailable", () => {
    expect(faviconUrl("https://exa.ai/")).toBeNull();
  });

  it("returns null when the manifest lacks the favicon permission (Firefox: getURL exists but _favicon/ 404s)", () => {
    vi.stubGlobal("chrome", {
      runtime: {
        getURL: (path: string) => `moz-extension://uuid/${path}`,
        getManifest: () => ({ permissions: ["activeTab", "storage"] })
      }
    });

    expect(faviconUrl("https://exa.ai/")).toBeNull();
  });

  it("builds a browser-cached favicon url when the manifest carries the favicon permission", () => {
    vi.stubGlobal("chrome", {
      runtime: {
        getURL: (path: string) => `chrome-extension://abc/${path}`,
        getManifest: () => ({ permissions: ["favicon", "activeTab", "storage"] })
      }
    });

    expect(faviconUrl("https://exa.ai/")).toBe(
      "chrome-extension://abc/_favicon/?pageUrl=https%3A%2F%2Fexa.ai%2F&size=16"
    );
  });
});
