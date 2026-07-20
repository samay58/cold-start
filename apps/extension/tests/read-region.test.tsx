// @vitest-environment jsdom

import type { FirstPayoff } from "@cold-start/core";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ReadRegion } from "../src/company/ReadRegion";

function evidence(overrides: Partial<FirstPayoff["evidenceSoFar"][number]> = {}): FirstPayoff["evidenceSoFar"][number] {
  return {
    sourceId: "company_site-exa.ai",
    url: "https://exa.ai/",
    domain: "exa.ai",
    title: "Exa",
    sourceClass: "company_site",
    quality: "company",
    arrivedAtMs: Date.parse("2026-06-21T00:00:00.000Z"),
    entityMatched: true,
    ...overrides
  };
}

function firstPayoff(overrides: Partial<FirstPayoff> = {}): FirstPayoff {
  return {
    status: "receipt",
    slug: "exa",
    domain: "exa.ai",
    generatedAt: "2026-06-21T00:00:00.000Z",
    generatedAtMs: Date.parse("2026-06-21T00:00:00.000Z"),
    entityConfidence: "high",
    entityConfidenceReason: "Current domain and source text match Exa.",
    evidenceSoFar: [
      evidence(),
      evidence({
        sourceId: "news-techcrunch.com",
        url: "https://techcrunch.com/exa",
        domain: "techcrunch.com",
        title: "Exa raises funding",
        sourceClass: "funding",
        quality: "reported"
      })
    ],
    stillChecking: { text: "Named customer proof.", missingEvidenceClass: "customer_proof" },
    suppressionReasons: [],
    ...overrides
  };
}

function substantive(): FirstPayoff {
  return firstPayoff({
    status: "substantive_first_read",
    whatItDoes: {
      text: "Exa builds search infrastructure for AI applications.",
      supportingText: "Exa builds search infrastructure for AI applications.",
      sourceIds: ["company_site-exa.ai"],
      citationIds: [],
      sourceClass: "company_site",
      claimKind: "what_it_does"
    }
  });
}

async function renderRegion(payoff: FirstPayoff, context: "building" | "profile") {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(<ReadRegion context={context} firstPayoff={payoff} />);
  });
  return {
    container,
    async unmount() {
      await act(async () => root.unmount());
    }
  };
}

describe("ReadRegion", () => {
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
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("renders a receipt in the building phase: what is filed, what is still missing, and the sources", async () => {
    const { container, unmount } = await renderRegion(firstPayoff(), "building");
    const region = container.querySelector("[aria-label='Early read']");

    expect(region).not.toBeNull();
    expect(region?.getAttribute("data-status")).toBe("receipt");
    expect(region?.textContent).toContain("Company site and funding filed.");
    expect(region?.textContent).toContain("Need named customer proof.");
    expect(region?.querySelector("[aria-label='Sources']")?.textContent).toContain("exa.ai");
    expect(region?.querySelector("[aria-label='Sources']")?.textContent).toContain("techcrunch.com");
    await unmount();
  });

  it("upgrades to the cited claim when the read is substantive", async () => {
    const { container, unmount } = await renderRegion(substantive(), "building");
    const region = container.querySelector("[aria-label='Early read']");

    expect(region?.getAttribute("data-status")).toBe("substantive_first_read");
    expect(region?.textContent).toContain("What it does");
    expect(region?.textContent).toContain("Exa builds search infrastructure for AI applications.");
    // The receipt's missing-proof line yields to the claim.
    expect(region?.textContent).not.toContain("Need named customer proof.");
    await unmount();
  });

  it("says it is checking the company match instead of listing possibly wrong-entity sources", async () => {
    const { container, unmount } = await renderRegion(
      firstPayoff({
        status: "withheld",
        entityConfidence: "needs_check",
        entityConfidenceReason: "Accepted sources do not clearly match the current company.",
        suppressionReasons: ["entity_needs_check"]
      }),
      "building"
    );
    const region = container.querySelector("[aria-label='Early read']");

    expect(region?.textContent).toContain("Confirming these sources describe this company");
    expect(region?.querySelector("[aria-label='Sources']")).toBeNull();
    await unmount();
  });

  it("renders nothing in the profile phase unless the read is substantive", async () => {
    const receipt = await renderRegion(firstPayoff(), "profile");
    expect(receipt.container.querySelector("[aria-label='Early read']")).toBeNull();
    await receipt.unmount();

    const withheld = await renderRegion(firstPayoff({ status: "withheld", suppressionReasons: ["no_incremental_claim"] }), "profile");
    expect(withheld.container.querySelector("[aria-label='Early read']")).toBeNull();
    await withheld.unmount();

    const read = await renderRegion(substantive(), "profile");
    expect(read.container.querySelector("[aria-label='Early read']")).not.toBeNull();
    await read.unmount();
  });

  it("marks first-read visibility once, on the first substantive render", async () => {
    const marks: string[] = [];
    const markSpy = vi.spyOn(performance, "mark").mockImplementation(((name: string) => {
      marks.push(name);
      return undefined as unknown as PerformanceMark;
    }) as typeof performance.mark);

    const receipt = await renderRegion(firstPayoff(), "building");
    expect(marks).not.toContain("cold-start-first-read-visible");
    await receipt.unmount();

    const read = await renderRegion(substantive(), "building");
    expect(marks.filter((name) => name === "cold-start-first-read-visible")).toHaveLength(1);
    await read.unmount();
    markSpy.mockRestore();
  });
});
