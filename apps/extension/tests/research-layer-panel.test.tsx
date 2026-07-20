// @vitest-environment jsdom

import { type ColdStartCard, type FirstPayoff } from "@cold-start/core";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CompanyArc } from "../src/CompanyArc";
import type { ExtensionResearchRunEvent, ExtensionSourceSummary } from "../src/extension-config";

function card(cacheStatus: ColdStartCard["cacheStatus"] = "partial"): ColdStartCard {
  return {
    slug: "exa",
    domain: "exa.ai",
    generatedAt: "2026-06-21T00:00:00.000Z",
    generationCostUsd: 0,
    cacheStatus,
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

function firstPayoff(
  status: "receipt" | "substantive_first_read" | "withheld",
  duplicateEvidence = false,
  includeProofHeadline = false
) {
  const evidenceSoFar: FirstPayoff["evidenceSoFar"] = [
    {
      sourceId: "company_site-exa.ai",
      citationId: "c1",
      url: "https://exa.ai/",
      domain: "exa.ai",
      title: "Exa",
      sourceClass: "company_site",
      quality: "company",
      arrivedAtMs: Date.parse("2026-06-21T00:00:00.000Z"),
      entityMatched: true
    },
    {
      sourceId: "news-techcrunch.com",
      url: "https://techcrunch.com/exa",
      domain: "techcrunch.com",
      title: "Exa raises funding",
      sourceClass: "funding",
      quality: "reported",
      arrivedAtMs: Date.parse("2026-06-21T00:00:01.000Z"),
      entityMatched: true
    }
  ];
  if (duplicateEvidence) {
    evidenceSoFar.push({
      sourceId: "docs-exa.ai",
      url: "https://exa.ai/docs",
      domain: "exa.ai",
      title: "Exa docs",
      sourceClass: "docs",
      quality: "company",
      arrivedAtMs: Date.parse("2026-06-21T00:00:02.000Z"),
      entityMatched: true
    });
  }
  const base = {
    slug: "exa",
    domain: "exa.ai",
    generatedAt: "2026-06-21T00:00:00.000Z",
    generatedAtMs: Date.parse("2026-06-21T00:00:00.000Z"),
    entityConfidence: "high",
    entityConfidenceReason: "Current domain and source text match Exa.",
    evidenceSoFar,
    stillChecking: {
      text: "Independent customer proof.",
      missingEvidenceClass: "customer_proof"
    },
    suppressionReasons: status === "withheld" ? ["no_incremental_claim"] : []
  };

  return {
    ...base,
    status,
    ...(status === "substantive_first_read"
      ? {
          whoItSeemsFor: {
            text: "AI product teams and developers building search-heavy workflows.",
            supportingText: "Exa serves AI product teams and developers building search-heavy workflows.",
            sourceIds: ["company_site-exa.ai"],
            citationIds: ["c1"],
            sourceClass: "company_site",
            claimKind: "who_it_serves"
          },
          ...(includeProofHeadline
            ? {
                proofHeadline: {
                  text: "Exa raises funding for search infrastructure.",
                  supportingText: "Exa raised funding to build search infrastructure for AI products.",
                  sourceIds: ["news-techcrunch.com"],
                  citationIds: [],
                  sourceClass: "funding",
                  claimKind: "proof_headline"
                }
              }
            : {})
        }
      : {})
  };
}

async function flushPromises() {
  await act(async () => {
    for (let index = 0; index < 10; index += 1) {
      await Promise.resolve();
    }
  });
}

// The early read and its filed stamp render in the CompanyArc shell above the research layer,
// so these tests mount the arc in its profile phase.
async function renderPanel(input: {
  complete?: boolean;
  duplicateEvidence?: boolean;
  firstPayoffStatus?: "receipt" | "substantive_first_read" | "withheld";
  includeProofHeadline?: boolean;
  reducedMotion?: boolean;
  filedViaCacheStatus?: boolean;
} = {}) {
  if (input.reducedMotion) {
    stubReducedMotion(true);
  }
  await import("../src/research/ResearchLayerPanel");
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  const payoff = input.firstPayoffStatus ? firstPayoff(input.firstPayoffStatus, input.duplicateEvidence, input.includeProofHeadline) : null;
  const events = input.filedViaCacheStatus
    ? [event({ id: "partial", metadata: { citationCount: 5, sourceCount: 9, ...(payoff ? { firstPayoff: payoff } : {}) }, type: "card.partial" })]
    : [
        event({ id: "partial", metadata: { citationCount: 5, sourceCount: 9, ...(payoff ? { firstPayoff: payoff } : {}) }, type: "card.partial" }),
        ...(input.complete ? [event({ id: "saved", metadata: { citationCount: 8, sourceCount: 12 }, type: "card.saved" })] : [])
      ];

  await act(async () => {
    root.render(
      <CompanyArc
        arc={{
          phase: "profile",
          card: card(input.filedViaCacheStatus ? "hit" : "partial"),
          sections: [],
          ...(input.complete ? {} : { contactRun: { generationStatus: "running", startedAt: Date.now() } }),
          events,
          sources: [
            source({ domain: "exa.ai", sourceType: "company_site" }),
            source({ domain: "docs.exa.ai", sourceType: "company_site" }),
            source({ domain: "techcrunch.com", sourceType: "news", title: "Exa funding" })
          ]
        }}
        domain="exa.ai"
        onEditSettings={() => undefined}
        onRegenerate={() => undefined}
        onRunAnalysis={() => undefined}
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

  it("does not render stale client-derived First Read without a firstPayoff artifact", async () => {
    const { container, unmount } = await renderPanel();

    expect(container.querySelector("[aria-label='Early read']")).toBeNull();
    expect(container.querySelector(".cs-early-read")).toBeNull();
    await unmount();
  });

  it("pins an incremental firstPayoff read above the research stack while basics continue", async () => {
    const { container, unmount } = await renderPanel({ firstPayoffStatus: "substantive_first_read" });
    const firstRead = container.querySelector("[aria-label='Early read']");
    const researchLayer = container.querySelector("[aria-label='Research layer']");

    expect(firstRead).not.toBeNull();
    expect(researchLayer).not.toBeNull();
    expect(firstRead?.textContent).toContain("Early read");
    // Incremental content the overview does not show: the buyer read, named sources, and weight marks.
    expect(firstRead?.textContent).toContain("AI product teams and developers building search-heavy workflows.");
    expect(firstRead?.textContent).toContain("Who it's for");
    expect(firstRead?.textContent).toContain("techcrunch.com");
    // The generic "still checking" line is dropped from the read; it is not useful chrome here.
    expect(firstRead?.textContent).not.toContain("Needs checking");
    expect(firstRead?.textContent).not.toContain("Independent customer proof");
    // Never restates the company summary sentence shown in the header above it.
    expect(firstRead?.textContent).not.toContain("Exa builds search and research infrastructure for AI products.");
    expect(firstRead?.compareDocumentPosition(researchLayer!)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
    await unmount();
  });

  it("prefers proof headlines over generic audience copy when both are available", async () => {
    const { container, unmount } = await renderPanel({ firstPayoffStatus: "substantive_first_read", includeProofHeadline: true });
    const firstRead = container.querySelector("[aria-label='Early read']");

    expect(firstRead).not.toBeNull();
    expect(firstRead?.textContent).toContain("Latest proof");
    expect(firstRead?.textContent).toContain("Exa raises funding for search infrastructure.");
    expect(firstRead?.textContent).not.toContain("Who it's for");
    await unmount();
  });

  it("renders the early read inline and always open, with no reveal interaction required", async () => {
    const { container, unmount } = await renderPanel({ firstPayoffStatus: "substantive_first_read" });
    const region = container.querySelector<HTMLElement>("[aria-label='Early read']");

    expect(region).not.toBeNull();
    // The read is a region, not a disclosure: no tab, no chevron, nothing to hover or pin.
    expect(region?.querySelector("button")).toBeNull();
    expect(region?.getAttribute("data-open")).toBeNull();
    // The claim and its sources are readable without any interaction.
    expect(region?.textContent).toContain("AI product teams and developers building search-heavy workflows.");
    expect(region?.querySelector("[aria-label='Sources']")).not.toBeNull();
    expect(region?.querySelector("a[href='https://techcrunch.com/exa']")).not.toBeNull();
    await unmount();
  });

  it("keeps the early read legible and reachable under reduced motion", async () => {
    const { container, unmount } = await renderPanel({ firstPayoffStatus: "substantive_first_read", reducedMotion: true });
    const firstRead = container.querySelector("[aria-label='Early read']");

    expect(firstRead).not.toBeNull();
    expect(firstRead?.textContent).toContain("Early read");
    expect(firstRead?.textContent).toContain("AI product teams and developers building search-heavy workflows.");
    expect(firstRead?.querySelector("[aria-label='Sources']")).not.toBeNull();
    await unmount();
  });

  it("files the first read into the company context after the full profile is ready", async () => {
    const { container, unmount } = await renderPanel({ complete: true });

    expect(container.querySelector("[aria-label='Early read']")).toBeNull();
    const filed = container.querySelector("[aria-label='Sources checked']");
    expect(filed).not.toBeNull();
    expect(filed?.textContent).toContain("Sources checked");
    expect(filed?.textContent).toContain("12 sources");
    await unmount();
  });

  it("files the first read off the terminal card even when the saved event never arrives", async () => {
    const { container, unmount } = await renderPanel({ filedViaCacheStatus: true });

    // The live-generation success state can drop terminal events; a "hit" card must still file.
    expect(container.querySelector("[aria-label='Early read']")).toBeNull();
    expect(container.querySelector("[aria-label='Sources checked']")).not.toBeNull();
    await unmount();
  });

  it("does not render a source-only firstPayoff artifact as a separate card", async () => {
    const { container, unmount } = await renderPanel({ firstPayoffStatus: "receipt" });

    expect(container.querySelector("[aria-label='Early read']")).toBeNull();
    expect(container.querySelector(".cs-early-read")).toBeNull();
    await unmount();
  });

  it("keeps source-only firstPayoff evidence out of the main stack even when domains repeat", async () => {
    const { container, unmount } = await renderPanel({ duplicateEvidence: true, firstPayoffStatus: "receipt" });

    expect(container.querySelector("[aria-label='Early read']")).toBeNull();
    expect(container.querySelector(".cs-early-read")).toBeNull();
    await unmount();
  });

  it("renders the early read only for substantive_first_read artifacts", async () => {
    const { container, unmount } = await renderPanel({ firstPayoffStatus: "substantive_first_read" });
    const firstRead = container.querySelector("[aria-label='Early read']");

    expect(firstRead).not.toBeNull();
    expect(firstRead?.textContent).toContain("Early read");
    expect(firstRead?.textContent).toContain("AI product teams and developers building search-heavy workflows.");
    expect(firstRead?.textContent).toContain("techcrunch.com");
    await unmount();
  });

  it("does not render withheld firstPayoff artifacts as user-facing cards", async () => {
    const { container, unmount } = await renderPanel({ firstPayoffStatus: "withheld" });

    expect(container.querySelector("[aria-label='Early read']")).toBeNull();
    expect(container.querySelector(".cs-early-read")).toBeNull();
    await unmount();
  });

  it("does not file firstPayoff just because a card.partial fetch returned cacheStatus hit", async () => {
    const { container, unmount } = await renderPanel({
      filedViaCacheStatus: true,
      firstPayoffStatus: "substantive_first_read"
    });

    expect(container.querySelector("[aria-label='Early read']")).not.toBeNull();
    expect(container.querySelector("[aria-label='Sources checked']")).toBeNull();
    await unmount();
  });
});

function unusableCard(): ColdStartCard {
  const base = card();
  return {
    ...base,
    citations: [],
    identity: {
      ...base.identity,
      name: { value: base.domain, status: "unknown", confidence: "low", citationIds: [] },
      websiteUrl: { value: null, status: "unknown", confidence: "low", citationIds: [] },
      oneLiner: { value: null, status: "unknown", confidence: "low", citationIds: [] },
      hq: { value: null, status: "unknown", confidence: "low", citationIds: [] },
      foundedYear: { value: null, status: "unknown", confidence: "low", citationIds: [] }
    },
    funding: {
      totalRaisedUsd: { value: null, status: "unknown", confidence: "low", citationIds: [] },
      lastRound: { value: null, status: "unknown", confidence: "low", citationIds: [] },
      investors: { value: null, status: "unknown", confidence: "low", citationIds: [] }
    },
    team: {
      founders: { value: [], status: "unknown", confidence: "low", citationIds: [] },
      keyExecs: { value: [], status: "unknown", confidence: "low", citationIds: [] },
      headcount: { value: null, status: "unknown", confidence: "low", citationIds: [] }
    }
  };
}

describe("ResearchLayerPanel surface diet", () => {
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

  it("states the module count once, in the card tray; the research-layer header drops its own ratio", async () => {
    const { container, unmount } = await renderPanel();

    const head = container.querySelector(".cs-research-layer-head");
    expect(head?.textContent).toBe("Research");
    expect(container.textContent).not.toContain("0 / 6");
    expect(container.textContent).toContain("6 waiting");
    await unmount();
  });

  it("does not mount a second research-progress voice on the profile phase", async () => {
    const { container, unmount } = await renderPanel();

    // The whisper and each module's own status line carry this now; the panel does not
    // additionally mount ResearchTrail's stage tree.
    expect(container.querySelector("[aria-label='Research progress']")).toBeNull();
    expect(container.querySelector(".cs-research-progress")).toBeNull();
    await unmount();
  });

  it("folds the Sources/Website recap rows out of the partial-profile panel", async () => {
    await import("../src/research/ResearchLayerPanel");
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(
        <CompanyArc
          arc={{ phase: "profile", card: unusableCard(), sections: [], events: [], sources: [] }}
          domain="exa.ai"
          onEditSettings={() => undefined}
          onRegenerate={() => undefined}
          onRunAnalysis={() => undefined}
          onRunSection={() => undefined}
          onStart={() => undefined}
        />
      );
    });
    await flushPromises();

    const panel = container.querySelector("[aria-label='Incomplete company profile']");
    expect(panel).not.toBeNull();
    // The identity header above this panel already states the domain and source count; the
    // recap dl restated both.
    expect(panel?.querySelector("[aria-label='Profile status']")).toBeNull();
    expect(panel?.textContent).not.toContain("Website");
    expect(panel?.textContent).toContain("Regenerate profile");

    await act(async () => root.unmount());
  });
});
