// @vitest-environment jsdom

import { type ColdStartCard, type SynthesisWithheld } from "@cold-start/core";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CompanyArc } from "../src/company/CompanyArc";
import { LENS_RUN_FAILED_NOTICE } from "../src/shared/extension-format";

// A public profile complete enough to clear hasUsablePublicProfile, so the panel reaches the
// lens slot instead of the partial-profile gate. Mirrors research-layer-panel.test.tsx's fixture.
function card(overrides: Partial<ColdStartCard> = {}): ColdStartCard {
  return {
    slug: "exa",
    domain: "exa.ai",
    generatedAt: "2026-06-21T00:00:00.000Z",
    generationCostUsd: 0,
    cacheStatus: "hit",
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
    ],
    ...overrides
  };
}

function withheldRecord(overrides: Partial<SynthesisWithheld> = {}): SynthesisWithheld {
  return {
    at: "2026-07-20T11:00:00.000Z",
    reasons: ["citation-floor"],
    advisories: ["single-source-class"],
    citationCount: 5,
    sourceTypeCount: 1,
    ...overrides
  };
}

function synthesizedCard(): ColdStartCard {
  return card({
    synthesis: {
      whyItMatters: {
        text: "Exa could matter if retrieval becomes the substrate for agent workflows [c1].",
        citationIds: ["c1"]
      },
      bullCase: [
        { text: "The API wedge is already embedded in developer workflows [c1].", citationIds: ["c1"] }
      ],
      bearCase: [
        { text: "It breaks if foundation labs bundle retrieval for free [c1].", citationIds: ["c1"] }
      ],
      openQuestions: []
    }
  });
}

async function renderArc(input: {
  card: ColdStartCard;
  analysisNotice?: string;
  onRunAnalysis?: (forceRefresh?: boolean) => void;
}) {
  await import("../src/research/ResearchLayerPanel");
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);

  await act(async () => {
    root.render(
      <CompanyArc
        arc={{
          phase: "profile",
          card: input.card,
          sections: [],
          events: [],
          sources: [],
          ...(input.analysisNotice ? { analysisNotice: input.analysisNotice } : {})
        }}
        domain="exa.ai"
        onEditSettings={() => undefined}
        onRegenerate={() => undefined}
        onRunAnalysis={input.onRunAnalysis ?? (() => undefined)}
        onRunSection={() => undefined}
        onStart={() => undefined}
      />
    );
  });
  await flushPromises();

  return {
    container,
    async unmount() {
      await act(async () => root.unmount());
    }
  };
}

async function flushPromises() {
  await act(async () => {
    for (let index = 0; index < 10; index += 1) {
      await Promise.resolve();
    }
  });
}

describe("Investor Lens withheld and failed states", () => {
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

  it("(a) renders the withheld card with reason copy when the card carries a synthesisWithheld record, not the failure card", async () => {
    const { container, unmount } = await renderArc({
      card: card({ synthesisWithheld: withheldRecord() })
    });

    const withheld = container.querySelector("[aria-label='Lens withheld']");
    expect(withheld).not.toBeNull();
    expect(withheld?.textContent).toContain("Analysis ran");
    expect(withheld?.textContent).toContain("Fewer than 8 cited sources survived");
    expect(container.querySelector("[aria-label='Lens run failed']")).toBeNull();

    await unmount();
  });

  it("(b) renders failure copy for a run-status failure with no withheld record", async () => {
    const { container, unmount } = await renderArc({
      card: card(),
      analysisNotice: LENS_RUN_FAILED_NOTICE
    });

    const failed = container.querySelector("[aria-label='Lens run failed']");
    expect(failed).not.toBeNull();
    expect(failed?.textContent).toContain(LENS_RUN_FAILED_NOTICE);
    expect(container.querySelector("[aria-label='Lens withheld']")).toBeNull();

    await unmount();
  });

  it("(c) clicking retry on the withheld card calls onRunAnalysis with forceRefresh: true", async () => {
    const onRunAnalysis = vi.fn();
    const { container, unmount } = await renderArc({
      card: card({ synthesisWithheld: withheldRecord() }),
      onRunAnalysis
    });

    const retryButton = container.querySelector<HTMLButtonElement>("[aria-label='Lens withheld'] button");
    expect(retryButton).not.toBeNull();

    await act(async () => {
      retryButton?.click();
    });

    expect(onRunAnalysis).toHaveBeenCalledTimes(1);
    expect(onRunAnalysis).toHaveBeenCalledWith(true);

    await unmount();
  });

  it("(c2) disables the retry button once clicked, so a slow-to-swap parent cannot show a live control twice", async () => {
    // onRunAnalysis intentionally does nothing here: the visible disabled state must hold on
    // its own local click state, not on the run actually starting (double-fire is guarded
    // upstream; this covers the gap between click and the parent's run-status flip).
    const { container, unmount } = await renderArc({
      card: card({ synthesisWithheld: withheldRecord() }),
      onRunAnalysis: () => undefined
    });

    const retryButton = container.querySelector<HTMLButtonElement>("[aria-label='Lens withheld'] button");
    expect(retryButton?.disabled).toBe(false);
    expect(retryButton?.textContent).toBe("Refresh evidence and retry");

    await act(async () => {
      retryButton?.click();
    });

    expect(retryButton?.disabled).toBe(true);
    expect(retryButton?.textContent).toBe("Refreshing evidence");

    await unmount();
  });

  it("(d) renders the filed investor read untouched when the card carries synthesis", async () => {
    const { container, unmount } = await renderArc({
      card: synthesizedCard()
    });

    expect(container.querySelector(".cs-investor-read")).not.toBeNull();
    expect(container.querySelector("[aria-label='Lens withheld']")).toBeNull();
    expect(container.querySelector("[aria-label='Lens run failed']")).toBeNull();

    await unmount();
  });
});
