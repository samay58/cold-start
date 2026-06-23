// @vitest-environment jsdom

import { type ColdStartCard, type FirstPayoff } from "@cold-start/core";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ResearchLayerPanel } from "../src/ResearchLayerPanel";
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

function firstPayoff(status: "receipt" | "substantive_first_read" | "withheld", duplicateEvidence = false) {
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
          }
        }
      : {})
  };
}

async function renderPanel(input: {
  complete?: boolean;
  duplicateEvidence?: boolean;
  firstPayoffStatus?: "receipt" | "substantive_first_read" | "withheld";
  reducedMotion?: boolean;
  filedViaCacheStatus?: boolean;
} = {}) {
  if (input.reducedMotion) {
    stubReducedMotion(true);
  }
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  const payoff = input.firstPayoffStatus ? firstPayoff(input.firstPayoffStatus, input.duplicateEvidence) : null;
  const events = input.filedViaCacheStatus
    ? [event({ id: "partial", metadata: { citationCount: 5, sourceCount: 9, ...(payoff ? { firstPayoff: payoff } : {}) }, type: "card.partial" })]
    : [
        event({ id: "partial", metadata: { citationCount: 5, sourceCount: 9, ...(payoff ? { firstPayoff: payoff } : {}) }, type: "card.partial" }),
        ...(input.complete ? [event({ id: "saved", metadata: { citationCount: 8, sourceCount: 12 }, type: "card.saved" })] : [])
      ];

  await act(async () => {
    root.render(
      <ResearchLayerPanel
        card={card(input.filedViaCacheStatus ? "hit" : "partial")}
        contactRun={input.complete ? undefined : { generationStatus: "running", startedAt: Date.now() }}
        elapsedSeconds={0}
        events={events}
        onRegenerate={() => undefined}
        onRunSection={() => undefined}
        onRunAnalysis={() => undefined}
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

  it("does not render stale client-derived First Read without a firstPayoff artifact", async () => {
    const { container, unmount } = await renderPanel();

    expect(container.querySelector("[aria-label='First read']")).toBeNull();
    expect(container.querySelector("[aria-label='Evidence receipt']")).toBeNull();
    await unmount();
  });

  it("pins an incremental firstPayoff read above the research stack while basics continue", async () => {
    const { container, unmount } = await renderPanel({ firstPayoffStatus: "substantive_first_read" });
    const firstRead = container.querySelector("[aria-label='First read']");
    const researchLayer = container.querySelector("[aria-label='Research layer']");

    expect(firstRead).not.toBeNull();
    expect(researchLayer).not.toBeNull();
    expect(firstRead?.textContent).toContain("First Read");
    // Incremental content the overview does not show: the buyer read, named sources, weight marks, and the gap.
    expect(firstRead?.textContent).toContain("AI product teams and developers building search-heavy workflows.");
    expect(firstRead?.textContent).toContain("Who it's for");
    expect(firstRead?.textContent).toContain("Sources in hand");
    expect(firstRead?.textContent).toContain("techcrunch.com");
    expect(firstRead?.textContent).toContain("Still checking");
    // Never restates the company summary sentence shown in the header above it.
    expect(firstRead?.textContent).not.toContain("Exa builds search and research infrastructure for AI products.");
    expect(firstRead?.compareDocumentPosition(researchLayer!)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
    await unmount();
  });

  it("keeps the first read legible under reduced motion", async () => {
    const { container, unmount } = await renderPanel({ firstPayoffStatus: "substantive_first_read", reducedMotion: true });
    const firstRead = container.querySelector("[aria-label='First read']");

    expect(firstRead).not.toBeNull();
    expect(firstRead?.textContent).toContain("First Read");
    expect(firstRead?.textContent).toContain("AI product teams and developers building search-heavy workflows.");
    expect(firstRead?.querySelector("[aria-label='Sources filed so far']")).not.toBeNull();
    await unmount();
  });

  it("files the first read into the company context after the full profile is ready", async () => {
    const { container, unmount } = await renderPanel({ complete: true });

    expect(container.querySelector("[aria-label='First read']")).toBeNull();
    const filed = container.querySelector("[aria-label='Sources checked']");
    expect(filed).not.toBeNull();
    expect(filed?.textContent).toContain("Sources checked");
    expect(filed?.textContent).toContain("12 sources");
    await unmount();
  });

  it("files the first read off the terminal card even when the saved event never arrives", async () => {
    const { container, unmount } = await renderPanel({ filedViaCacheStatus: true });

    // The live-generation success state can drop terminal events; a "hit" card must still file
    // rather than leaving the slip stuck in the temporary receipt state.
    expect(container.querySelector("[aria-label='First read']")).toBeNull();
    expect(container.querySelector("[aria-label='Sources checked']")).not.toBeNull();
    await unmount();
  });

  it("renders an Evidence Receipt from firstPayoff receipt without the First Read label", async () => {
    const { container, unmount } = await renderPanel({ firstPayoffStatus: "receipt" });
    const receipt = container.querySelector("[aria-label='Evidence receipt']");

    expect(receipt).not.toBeNull();
    expect(receipt?.textContent).toContain("Evidence receipt");
    expect(receipt?.textContent).toContain("exa.ai");
    expect(receipt?.textContent).toContain("Still checking");
    expect(container.querySelector("[aria-label='First read']")).toBeNull();
    await unmount();
  });

  it("groups repeated source domains inside the receipt", async () => {
    const { container, unmount } = await renderPanel({ duplicateEvidence: true, firstPayoffStatus: "receipt" });
    const receipt = container.querySelector("[aria-label='Evidence receipt']");
    const text = receipt?.textContent ?? "";

    expect(receipt).not.toBeNull();
    expect(text.match(/exa\.ai/g)).toHaveLength(1);
    expect(text).toContain("Company / Docs");
    await unmount();
  });

  it("renders First Read only for substantive_first_read artifacts", async () => {
    const { container, unmount } = await renderPanel({ firstPayoffStatus: "substantive_first_read" });
    const firstRead = container.querySelector("[aria-label='First read']");

    expect(firstRead).not.toBeNull();
    expect(firstRead?.textContent).toContain("First Read");
    expect(firstRead?.textContent).toContain("AI product teams and developers building search-heavy workflows.");
    expect(firstRead?.textContent).toContain("techcrunch.com");
    await unmount();
  });

  it("keeps the receipt visible and hides First Read when firstPayoff is withheld", async () => {
    const { container, unmount } = await renderPanel({ firstPayoffStatus: "withheld" });
    const receipt = container.querySelector("[aria-label='Evidence receipt']");

    expect(receipt).not.toBeNull();
    expect(receipt?.textContent).toContain("Evidence receipt");
    expect(container.querySelector("[aria-label='First read']")).toBeNull();
    await unmount();
  });

  it("does not file firstPayoff just because a card.partial fetch returned cacheStatus hit", async () => {
    const { container, unmount } = await renderPanel({
      filedViaCacheStatus: true,
      firstPayoffStatus: "substantive_first_read"
    });

    expect(container.querySelector("[aria-label='First read']")).not.toBeNull();
    expect(container.querySelector("[aria-label='Sources checked']")).toBeNull();
    await unmount();
  });
});
