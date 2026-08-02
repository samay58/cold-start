// @vitest-environment jsdom

import { type ColdStartCard, type SynthesisWithheld } from "@cold-start/core";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CompanyArc } from "../src/company/CompanyArc";
import { LENS_RUN_FAILED_NOTICE } from "../src/shared/extension-format";
import { flushPromises, stubChromeStorage, stubReducedMotion } from "./sidepanel-harness";
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
  lensUnavailableReason?: string;
  onRunAnalysis?: (forceRefresh?: boolean) => boolean;
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
        onRunAnalysis={input.onRunAnalysis ?? (() => true)}
        onRunSection={() => undefined}
        onStart={() => undefined}
        alphaAccess={input.lensUnavailableReason ? {
          generationEnabled: true,
          profile: { limit: 12, reserved: 0, used: 0, remaining: 12 },
          lens: { limit: 6, reserved: 0, used: 6, remaining: 0 }
        } : undefined}
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

describe("Investor Lens withheld and failed states", () => {
  beforeEach(() => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true;
    document.body.innerHTML = "";
    stubReducedMotion(false);
    stubChromeStorage();
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
    expect(withheld?.textContent).toContain("There is not enough public evidence for a useful read yet.");
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
    expect(withheld?.textContent).toContain("The public evidence did not support a clear investor read.");
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

  it("(c) rechecks withheld evidence without forcing a paid refresh", async () => {
    const onRunAnalysis = vi.fn(() => true);
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
    expect(onRunAnalysis).toHaveBeenCalledWith();

    await unmount();
  });

  it("(c2) disables the retry button once clicked, so a slow-to-swap parent cannot show a live control twice", async () => {
    // The visible disabled state covers the accepted request's gap before the parent swaps
    // the card for the running instrument.
    const { container, unmount } = await renderArc({
      card: card({ synthesisWithheld: withheldRecord() }),
      onRunAnalysis: () => true
    });

    const retryButton = container.querySelector<HTMLButtonElement>("[aria-label='Lens withheld'] button");
    expect(retryButton?.disabled).toBe(false);
    expect(retryButton?.textContent).toBe("Check for new evidence");

    await act(async () => {
      retryButton?.click();
    });

    expect(retryButton?.disabled).toBe(true);
    expect(retryButton?.textContent).toBe("Checking for updates");

    await unmount();
  });

  it("(c3) stays retryable when the parent rejects the request", async () => {
    const { container, unmount } = await renderArc({
      card: card({ synthesisWithheld: withheldRecord() }),
      onRunAnalysis: () => false
    });

    const retryButton = container.querySelector<HTMLButtonElement>("[aria-label='Lens withheld'] button");
    await act(async () => {
      retryButton?.click();
    });

    expect(retryButton?.disabled).toBe(false);
    expect(retryButton?.textContent).toBe("Check for new evidence");

    await unmount();
  });

  it("(c4) explains and disables a retry that the allowance gate cannot accept", async () => {
    const { container, unmount } = await renderArc({
      card: card({ synthesisWithheld: withheldRecord() }),
      lensUnavailableReason: "This invitation has used its fresh Investor Lens runs."
    });

    const withheld = container.querySelector("[aria-label='Lens withheld']");
    const retryButton = withheld?.querySelector<HTMLButtonElement>("button");
    expect(withheld?.textContent).toContain("This invitation has used its fresh Investor Lens runs.");
    expect(retryButton?.disabled).toBe(true);
    expect(retryButton?.textContent).toBe("Retry unavailable");

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
