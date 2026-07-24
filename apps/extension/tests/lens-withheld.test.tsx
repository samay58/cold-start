// @vitest-environment jsdom

import { type ColdStartCard, type SynthesisWithheld } from "@cold-start/core";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CompanyArc } from "../src/company/CompanyArc";
import { LENS_RUN_FAILED_NOTICE } from "../src/shared/extension-format";
import { minimalExaCard as card } from "./lens-card-fixtures";

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
  analysisFailed?: boolean;
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
          ...(input.analysisFailed ? { analysisFailed: true } : {}),
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
    expect(withheld?.textContent).toContain("Too few cited sources survived the evidence floor.");
    expect(container.querySelector("[aria-label='Lens run failed']")).toBeNull();

    await unmount();
  });

  it("(a2) renders the no-claims-survived reason copy when the verifier dropped every claim instead of the evidence gate blocking", async () => {
    const { container, unmount } = await renderArc({
      card: card({
        synthesisWithheld: withheldRecord({
          reasons: ["no-claims-survived"],
          advisories: [],
          citationCount: 8,
          sourceTypeCount: 2
        })
      })
    });

    const withheld = container.querySelector("[aria-label='Lens withheld']");
    expect(withheld).not.toBeNull();
    expect(withheld?.textContent).toContain("Analysis ran; no claim survived verification against its sources.");
    expect(container.querySelector("[aria-label='Lens run failed']")).toBeNull();

    await unmount();
  });

  it("(b) renders failure copy for a run-status failure with no withheld record", async () => {
    const { container, unmount } = await renderArc({
      card: card(),
      analysisFailed: true,
      analysisNotice: LENS_RUN_FAILED_NOTICE
    });

    const failed = container.querySelector("[aria-label='Lens run failed']");
    expect(failed).not.toBeNull();
    expect(failed?.textContent).toContain(LENS_RUN_FAILED_NOTICE);
    expect(container.querySelector("[aria-label='Lens withheld']")).toBeNull();

    await unmount();
  });

  it("does not infer failure state from matching notice copy", async () => {
    const { container, unmount } = await renderArc({
      card: card(),
      analysisNotice: LENS_RUN_FAILED_NOTICE
    });

    expect(container.querySelector("[aria-label='Lens run failed']")).toBeNull();
    expect(container.querySelector(".cs-research-notice")?.textContent).toContain(LENS_RUN_FAILED_NOTICE);

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
