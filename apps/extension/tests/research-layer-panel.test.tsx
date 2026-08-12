// @vitest-environment jsdom

import { type ColdStartCard, type FirstPayoff } from "@cold-start/core";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CompanyArc } from "../src/company/CompanyArc";
import type { ExtensionResearchRunEvent, ExtensionSourceSummary } from "../src/shared/extension-config";
import { flushPromises, stubChromeStorage, stubReducedMotion } from "./sidepanel-harness";
import { minimalExaCard } from "./lens-card-fixtures";

function card(cacheStatus: ColdStartCard["cacheStatus"] = "partial"): ColdStartCard {
  return minimalExaCard({ cacheStatus });
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

// The profile source note renders in the CompanyArc shell above the research layer, so these
// tests mount the arc in its profile phase.
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
        onRunAnalysis={() => true}
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

describe("ResearchLayerPanel profile source note", () => {
  beforeEach(() => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true;
    document.body.innerHTML = "";
    stubReducedMotion(false);
    stubChromeStorage();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("shows the profile source note once the full profile is ready", async () => {
    const { container, unmount } = await renderPanel({ complete: true });

    const sourceNote = container.querySelector(".cs-profile-source-note");
    expect(sourceNote).not.toBeNull();
    expect(sourceNote?.textContent).toBe("12 sources reviewed");
    await unmount();
  });

  it("shows the profile source note off the terminal card even when the saved event never arrives", async () => {
    const { container, unmount } = await renderPanel({ filedViaCacheStatus: true });

    // The live-generation success state can drop terminal events; a "hit" card must still file.
    expect(container.querySelector(".cs-profile-source-note")?.textContent).toBe("3 sources reviewed");
    await unmount();
  });

  it("does not show the profile source note just because a card.partial fetch returned cacheStatus hit", async () => {
    const { container, unmount } = await renderPanel({
      filedViaCacheStatus: true,
      firstPayoffStatus: "substantive_first_read"
    });

    expect(container.querySelector(".cs-profile-source-note")).toBeNull();
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
    stubReducedMotion(false);
    stubChromeStorage();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("states the module count once in the card tray and omits the research ribbon", async () => {
    const { container, unmount } = await renderPanel();

    const head = container.querySelector(".cs-research-layer-head");
    expect(head).toBeNull();
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
          onRunAnalysis={() => true}
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
