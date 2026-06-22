// @vitest-environment jsdom

import { type ColdStartCard } from "@cold-start/core";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ResearchLayerPanel } from "../src/ResearchLayerPanel";
import type { ExtensionResearchRunEvent, ExtensionSourceSummary } from "../src/extension-config";

function card(): ColdStartCard {
  return {
    slug: "exa",
    domain: "exa.ai",
    generatedAt: "2026-06-21T00:00:00.000Z",
    generationCostUsd: 0,
    cacheStatus: "partial",
    identity: {
      name: { value: "Exa", status: "verified", confidence: "high", citationIds: ["c1"] },
      websiteUrl: { value: "https://exa.ai/", status: "verified", confidence: "high", citationIds: ["c1"] },
      logoUrl: null,
      oneLiner: { value: "Search infrastructure for AI applications.", status: "verified", confidence: "high", citationIds: ["c1"] },
      description: {
        value: {
          shortDescription: "Exa builds search and research infrastructure for AI products.",
          concept: "Search and research infrastructure for AI products.",
          mechanism: "A search API and crawler tuned for AI applications.",
          serves: "AI product teams and developers building search-heavy workflows."
        },
        status: "verified",
        confidence: "high",
        citationIds: ["c1"]
      },
      hq: { value: { city: "San Francisco", country: "United States" }, status: "verified", confidence: "medium", citationIds: ["c1"] },
      foundedYear: { value: 2021, status: "verified", confidence: "medium", citationIds: ["c1"] },
      status: "private"
    },
    funding: {
      totalRaisedUsd: { value: null, status: "unknown", confidence: "low", citationIds: [] },
      lastRound: {
        value: { name: "Series A", amountUsd: null, announcedAt: null, leadInvestors: [] },
        status: "verified",
        confidence: "medium",
        citationIds: ["c1"]
      },
      investors: { value: null, status: "unknown", confidence: "low", citationIds: [] }
    },
    team: {
      founders: { value: [], status: "unknown", confidence: "low", citationIds: [] },
      keyExecs: { value: [], status: "unknown", confidence: "low", citationIds: [] },
      headcount: { value: null, status: "unknown", confidence: "low", citationIds: [] }
    },
    signals: [],
    comparables: [],
    citations: [
      {
        id: "c1",
        url: "https://exa.ai/",
        title: "Exa",
        fetchedAt: "2026-06-21T00:00:00.000Z",
        sourceType: "company_site",
        snippet: "Exa builds search infrastructure for AI applications."
      }
    ]
  };
}

function event(input: Partial<ExtensionResearchRunEvent> & Pick<ExtensionResearchRunEvent, "id" | "type">): ExtensionResearchRunEvent {
  return {
    createdAt: "2026-06-21T00:00:00.000Z",
    domain: "exa.ai",
    message: input.type,
    metadata: {},
    runId: "run-1",
    sectionId: null,
    slug: "exa",
    ...input
  };
}

function source(input: Partial<ExtensionSourceSummary> & Pick<ExtensionSourceSummary, "domain" | "sourceType">): ExtensionSourceSummary {
  return {
    fetchedAt: "2026-06-21T00:00:00.000Z",
    id: `${input.sourceType}-${input.domain}`,
    snippet: "",
    title: input.domain,
    url: `https://${input.domain}`,
    ...input
  };
}

function stubReducedMotion(matches: boolean) {
  vi.stubGlobal("matchMedia", vi.fn(() => ({
    addEventListener: vi.fn(),
    addListener: vi.fn(),
    dispatchEvent: vi.fn(),
    matches,
    media: "(prefers-reduced-motion: reduce)",
    onchange: null,
    removeEventListener: vi.fn(),
    removeListener: vi.fn()
  })));
}

async function renderPanel(input: { complete?: boolean; reducedMotion?: boolean } = {}) {
  if (input.reducedMotion) {
    stubReducedMotion(true);
  }
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  const events = [
    event({ id: "partial", metadata: { citationCount: 5, sourceCount: 9 }, type: "card.partial" }),
    ...(input.complete ? [event({ id: "saved", metadata: { citationCount: 8, sourceCount: 12 }, type: "card.saved" })] : [])
  ];

  await act(async () => {
    root.render(
      <ResearchLayerPanel
        card={card()}
        contactRun={input.complete ? undefined : { generationStatus: "running", startedAt: Date.now() }}
        elapsedSeconds={0}
        events={events}
        onRegenerate={() => undefined}
        onRunSection={() => undefined}
        sources={[
          source({ domain: "exa.ai", sourceType: "company_site" }),
          source({ domain: "docs.exa.ai", sourceType: "company_site" }),
          source({ domain: "techcrunch.com", sourceType: "news", title: "Exa funding" })
        ]}
      />
    );
  });

  return {
    container,
    async unmount() {
      await act(async () => root.unmount());
    }
  };
}

describe("ResearchLayerPanel first read", () => {
  beforeEach(() => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true;
    document.body.innerHTML = "";
    vi.stubGlobal("matchMedia", vi.fn(() => ({
      addEventListener: vi.fn(),
      addListener: vi.fn(),
      dispatchEvent: vi.fn(),
      matches: false,
      media: "(prefers-reduced-motion: reduce)",
      onchange: null,
      removeEventListener: vi.fn(),
      removeListener: vi.fn()
    })));
    vi.stubGlobal("chrome", {
      storage: {
        local: {
          get: (_keys: string | string[], callback: (items: Record<string, unknown>) => void) => callback({}),
          set: (_items: Record<string, unknown>, callback?: () => void) => callback?.()
        },
        session: {
          get: (_keys: string | string[], callback: (items: Record<string, unknown>) => void) => callback({}),
          set: (_items: Record<string, unknown>, callback?: () => void) => callback?.()
        }
      }
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("pins an incremental first read above the research stack while basics continue", async () => {
    const { container, unmount } = await renderPanel();
    const firstRead = container.querySelector("[aria-label='First read']");
    const researchLayer = container.querySelector("[aria-label='Research layer']");

    expect(firstRead).not.toBeNull();
    expect(researchLayer).not.toBeNull();
    expect(firstRead?.textContent).toContain("First read");
    // Incremental content the overview does not show: the buyer read, named sources, weight marks, and the gap.
    expect(firstRead?.textContent).toContain("AI product teams and developers building search-heavy workflows.");
    expect(firstRead?.textContent).toContain("Filed so far");
    expect(firstRead?.textContent).toContain("techcrunch.com");
    expect(firstRead?.textContent).toContain("independent");
    expect(firstRead?.textContent).toContain("Not yet proven");
    // Never restates the company summary sentence shown in the header above it.
    expect(firstRead?.textContent).not.toContain("Exa builds search and research infrastructure for AI products.");
    expect(firstRead?.compareDocumentPosition(researchLayer!)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
    await unmount();
  });

  it("keeps the first read legible under reduced motion", async () => {
    const { container, unmount } = await renderPanel({ reducedMotion: true });
    const firstRead = container.querySelector("[aria-label='First read']");

    expect(firstRead).not.toBeNull();
    expect(firstRead?.textContent).toContain("First read");
    expect(firstRead?.textContent).toContain("AI product teams and developers building search-heavy workflows.");
    expect(firstRead?.querySelector("[aria-label='Sources filed so far']")).not.toBeNull();
    await unmount();
  });

  it("files the first read into the company context after the full profile is ready", async () => {
    const { container, unmount } = await renderPanel({ complete: true });

    expect(container.querySelector("[aria-label='First read']")).toBeNull();
    const filed = container.querySelector("[aria-label='First read filed']");
    expect(filed).not.toBeNull();
    expect(filed?.textContent).toContain("First read filed");
    expect(filed?.textContent).toContain("12 sources");
    await unmount();
  });
});
