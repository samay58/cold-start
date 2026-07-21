// @vitest-environment jsdom

import type { ColdStartCard } from "@cold-start/core";
import { act, type ComponentProps } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { InvestorReadCard, LensSlot, type LensSlotState } from "../src/research/InvestorReadCard";
import { investorReadForCard } from "../src/research/investor-lens";
import type { TooltipDossier } from "../src/shared/SharedTooltip";

type Captured = { body: string | TooltipDossier; id: string; title: string };

function baseCard(overrides: Partial<ColdStartCard> = {}): ColdStartCard {
  return {
    slug: "warp",
    domain: "warp.dev",
    generatedAt: "2026-06-23T12:00:00.000Z",
    generationCostUsd: 0,
    cacheStatus: "hit",
    identity: {
      name: { value: "Warp", status: "verified", confidence: "high", citationIds: ["c1"] },
      logoUrl: null,
      oneLiner: { value: "AI terminal for developers.", status: "verified", confidence: "high", citationIds: ["c1"] },
      hq: { value: { city: "San Francisco", country: "US" }, status: "verified", confidence: "medium", citationIds: ["c1"] },
      foundedYear: { value: 2021, status: "verified", confidence: "medium", citationIds: ["c1"] },
      status: "private"
    },
    funding: {
      totalRaisedUsd: { value: null, status: "unknown", confidence: "low", citationIds: [] },
      lastRound: { value: null, status: "unknown", confidence: "low", citationIds: [] },
      investors: { value: [], status: "unknown", confidence: "low", citationIds: [] }
    },
    team: {
      founders: { value: [], status: "unknown", confidence: "low", citationIds: [] },
      keyExecs: { value: [], status: "unknown", confidence: "low", citationIds: [] },
      headcount: { value: null, status: "unknown", confidence: "low", citationIds: [] }
    },
    signals: [],
    comparables: [],
    citations: [
      { id: "c1", url: "https://warp.dev", title: "Warp", fetchedAt: "2026-06-23T12:00:00.000Z", sourceType: "company_site" },
      {
        id: "c2",
        url: "https://example.com/warp-deep-dive",
        title: "Independent Warp deep dive",
        fetchedAt: "2026-06-23T12:00:00.000Z",
        sourceType: "news",
        sourceQuality: {
          tier: "independent_analysis",
          label: "Independent analysis",
          rationale: "Independent product analysis.",
          incentive: "No direct company incentive."
        }
      }
    ],
    ...overrides
  };
}

// (b)/(e): rich synthesis with multiple bull/bear claims and multiple timing fields, so the
// overflow disclosure has something to expand.
function richCard(): ColdStartCard {
  return baseCard({
    funding: {
      totalRaisedUsd: { value: 5_000_000, status: "verified", confidence: "high", citationIds: ["c2"] },
      lastRound: { value: null, status: "unknown", confidence: "low", citationIds: [] },
      investors: { value: [], status: "unknown", confidence: "low", citationIds: [] }
    },
    team: {
      founders: { value: [{ name: "Zach Lloyd", role: "Founder", sourceUrl: null, email: null }], status: "verified", confidence: "medium", citationIds: ["c1"] },
      keyExecs: { value: [], status: "unknown", confidence: "low", citationIds: [] },
      headcount: { value: null, status: "unknown", confidence: "low", citationIds: [] }
    },
    synthesis: {
      whyItMatters: { text: "Warp could matter if terminal work becomes the control plane for engineering agents [c2].", citationIds: ["c2"] },
      bullCase: [
        { text: "Developers already show daily usage [c1].", citationIds: ["c1"] },
        { text: "Teams standardize on it once one engineer adopts it [c1].", citationIds: ["c1"] }
      ],
      bearCase: [
        { text: "IDEs could bundle a comparable terminal agent [c1].", citationIds: ["c1"] },
        { text: "Switching cost is low for a CLI tool [c1].", citationIds: ["c1"] }
      ],
      openQuestions: [{ question: "Can this reach team budgets?", category: "buyer_budget" }],
      marketStructureAndTiming: {
        buyerBudget: { text: "Budget sits with platform teams [c1].", citationIds: ["c1"] },
        painSeverity: null,
        adoptionTrigger: { text: "Agent rollouts are forcing terminal standardization [c2].", citationIds: ["c2"] },
        marketStructure: null,
        profitPool: null,
        expansionPath: null,
        timingRisk: null
      }
    }
  });
}

// (c): 1 surviving bull claim, 0 bear claims (verifier-dropped), matching the read-sparse gallery
// fixture shape.
function sparseCard(): ColdStartCard {
  return baseCard({
    synthesis: {
      whyItMatters: { text: "Warp has a developer workflow wedge [c1].", citationIds: ["c1"] },
      bullCase: [{ text: "Developers already show daily usage [c1].", citationIds: ["c1"] }],
      bearCase: [],
      openQuestions: [{ question: "Can this reach team budgets?", category: "buyer_budget" }]
    }
  });
}

// (d): every non-enrichment citation is the same sourceType, so single-source-class fires. No
// funding fact and no named founder, so all three advisories fire.
function advisoryCard(): ColdStartCard {
  return baseCard({
    citations: [
      { id: "c1", url: "https://warp.dev", title: "Warp", fetchedAt: "2026-06-23T12:00:00.000Z", sourceType: "news" },
      { id: "c2", url: "https://example.com/warp-deep-dive", title: "Warp coverage", fetchedAt: "2026-06-23T12:00:00.000Z", sourceType: "news" }
    ],
    synthesis: {
      whyItMatters: { text: "Warp has a developer workflow wedge [c1].", citationIds: ["c1"] },
      bullCase: [{ text: "Developers already show daily usage [c1].", citationIds: ["c1"] }],
      bearCase: [{ text: "Switching cost is low for a CLI tool [c2].", citationIds: ["c2"] }],
      openQuestions: [{ question: "Can this reach team budgets?", category: "buyer_budget" }]
    }
  });
}

function tooltipStub() {
  const calls: Captured[] = [];
  const tooltipProps = (input: { body: string | TooltipDossier; id: string; placement?: unknown; title: string }) => {
    calls.push({ body: input.body, id: input.id, title: input.title });
    return {
      "aria-describedby": "cs-shared-tooltip",
      onBlur: () => undefined,
      onFocus: () => undefined,
      onKeyDown: () => undefined,
      onPointerEnter: () => undefined,
      onPointerLeave: () => undefined
    };
  };
  return { calls, tooltipProps };
}

async function renderCard(card: ColdStartCard) {
  const read = investorReadForCard(card);
  if (!read) {
    throw new Error("card fixture must carry synthesis");
  }
  const { calls, tooltipProps } = tooltipStub();
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(<InvestorReadCard card={card} read={read} tooltipProps={tooltipProps} />);
  });
  return {
    container,
    tooltipCalls: calls,
    async unmount() {
      await act(async () => root.unmount());
      container.remove();
    }
  };
}

describe("InvestorReadCard", () => {
  beforeEach(() => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true;
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

  it("(a) renders the lede with data-role=\"lede\"", async () => {
    const { container, unmount } = await renderCard(richCard());
    const lede = container.querySelector('[data-role="lede"]');

    expect(lede).not.toBeNull();
    expect(lede?.textContent).toContain("Warp could matter if terminal work becomes the control plane");

    await unmount();
  });

  it("(b) carries data-side on the holds/breaks rows and gives each a distinct mark", async () => {
    const { container, unmount } = await renderCard(richCard());
    const holds = container.querySelector('[data-side="holds"]');
    const breaks = container.querySelector('[data-side="breaks"]');

    expect(holds).not.toBeNull();
    expect(breaks).not.toBeNull();

    const holdsMark = holds?.querySelector(".cs-lens-mark")?.getAttribute("data-mark");
    const breaksMark = breaks?.querySelector(".cs-lens-mark")?.getAttribute("data-mark");

    expect(holdsMark).toBe("filled");
    expect(breaksMark).toBe("slashed");
    expect(holdsMark).not.toBe(breaksMark);

    await unmount();
  });

  it("(c) renders the 0-bear side with its own honest, distinct empty copy", async () => {
    const { container, unmount } = await renderCard(sparseCard());
    const breaks = container.querySelector('[data-side="breaks"]');
    const holds = container.querySelector('[data-side="holds"]');

    expect(breaks?.textContent).toContain("No breaking claim survived verification.");
    // The holds side has a real claim, so it must not carry the empty copy at all, and the two
    // sides' empty-state language must not collapse into the same generic sentence.
    expect(holds?.textContent).not.toContain("survived verification");

    await unmount();
  });

  it("(d) renders the advisory posture line only when advisories exist", async () => {
    const advisoryResult = await renderCard(advisoryCard());
    const postureWithAdvisories = advisoryResult.container.querySelector('[aria-label="Evidence posture"]');
    expect(postureWithAdvisories).not.toBeNull();
    expect(postureWithAdvisories?.textContent).toContain("Only news coverage is cited so far.");
    await advisoryResult.unmount();

    const richResult = await renderCard(richCard());
    // richCard has 2+ non-enrichment source types, funding evidence, and a named founder, so no
    // advisory fires; only the pre-existing independent-backing caveat can still show here.
    const postureWithoutAdvisories = richResult.container.querySelector('[aria-label="Evidence posture"]');
    expect(postureWithoutAdvisories?.textContent ?? "").not.toContain("coverage is cited so far");
    expect(postureWithoutAdvisories?.textContent ?? "").not.toContain("No funding evidence");
    expect(postureWithoutAdvisories?.textContent ?? "").not.toContain("No named team member");
    await richResult.unmount();
  });

  it("(e) expands moreClaims inline without invoking a tooltip", async () => {
    const { container, tooltipCalls, unmount } = await renderCard(richCard());
    const holds = container.querySelector('[data-side="holds"]');
    const toggle = holds?.querySelector<HTMLButtonElement>(".cs-investor-read-more");
    const frame = holds?.querySelector(".cs-investor-read-disclosure-frame");

    // The overflow claim is always in the DOM (reduced motion must never hide content, only
    // change how the reveal animates), so the closed/open distinction is the frame's own
    // data-expanded flag and the button's aria-expanded, not text presence.
    expect(toggle).not.toBeNull();
    expect(toggle?.textContent).toBe("+1 more");
    expect(toggle?.getAttribute("aria-expanded")).toBe("false");
    expect(frame?.getAttribute("data-expanded")).toBe("false");
    expect(holds?.textContent).toContain("Teams standardize on it once one engineer adopts it.");

    await act(async () => {
      toggle?.click();
    });

    expect(toggle?.getAttribute("aria-expanded")).toBe("true");
    expect(frame?.getAttribute("data-expanded")).toBe("true");
    expect(toggle?.textContent).toBe("Show less");
    expect(tooltipCalls.some((call) => call.id.includes("holds") || call.id.includes("breaks"))).toBe(false);

    await unmount();
  });
});

type LensSlotProps = ComponentProps<typeof LensSlot>;

async function renderSlot(props: LensSlotProps) {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(<LensSlot {...props} />);
  });
  return {
    container,
    async rerender(nextProps: LensSlotProps) {
      await act(async () => {
        root.render(<LensSlot {...nextProps} />);
      });
    },
    async unmount() {
      await act(async () => root.unmount());
      container.remove();
    }
  };
}

// The repo rule: every AnimatePresence exit needs coverage for the exiting element being the
// final item. These two transitions are the mandated cases from the task brief -- running to
// result, and withheld to trigger on retry -- asserted at the jsdom level (skipAnimations in
// tests/setup.ts resolves the crossfade synchronously) so a leftover node would show up as a
// stray element still in the tree, not just a visual double-render.
describe("LensSlot", () => {
  beforeEach(() => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true;
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

  function slotProps(state: LensSlotState, prefersReducedMotion: boolean | null = false): LensSlotProps {
    const { tooltipProps } = tooltipStub();
    const read = investorReadForCard(richCard());
    if (!read) {
      throw new Error("richCard fixture must carry synthesis");
    }
    return {
      prefersReducedMotion,
      result: <InvestorReadCard card={richCard()} read={read} tooltipProps={tooltipProps} />,
      running: <div aria-label="Investor Lens running">Running receipt</div>,
      state,
      trigger: <div aria-label="Lens trigger">Run Investor Lens</div>,
      withheld: <div aria-label="Lens withheld">Withheld receipt</div>
    };
  }

  it("(f) crossfades the running card out and the result card in, leaving no orphaned running node", async () => {
    const { container, rerender, unmount } = await renderSlot(slotProps("running"));

    expect(container.querySelector('[aria-label="Investor Lens running"]')).not.toBeNull();
    expect(container.querySelector('[aria-label="Investor read"]')).toBeNull();

    await rerender(slotProps("result"));

    expect(container.querySelector('[aria-label="Investor Lens running"]')).toBeNull();
    expect(container.querySelector('[aria-label="Investor read"]')).not.toBeNull();

    // The staged entrance must not gate interactivity: the disclosure toggle is clickable the
    // instant the result card mounts, not after its stagger settles.
    const holds = container.querySelector('[data-side="holds"]');
    const toggle = holds?.querySelector<HTMLButtonElement>(".cs-investor-read-more");
    expect(toggle).not.toBeNull();
    await act(async () => {
      toggle?.click();
    });
    expect(toggle?.getAttribute("aria-expanded")).toBe("true");

    await unmount();
  });

  it("(g) crossfades the withheld card out and the trigger control in on retry, leaving no orphaned withheld node", async () => {
    const { container, rerender, unmount } = await renderSlot(slotProps("withheld"));

    expect(container.querySelector('[aria-label="Lens withheld"]')).not.toBeNull();
    expect(container.querySelector('[aria-label="Lens trigger"]')).toBeNull();

    await rerender(slotProps("trigger"));

    expect(container.querySelector('[aria-label="Lens withheld"]')).toBeNull();
    expect(container.querySelector('[aria-label="Lens trigger"]')).not.toBeNull();

    await unmount();
  });

  it("(h) reduced motion still crossfades trigger to running without orphaning the trigger node", async () => {
    const { container, rerender, unmount } = await renderSlot(slotProps("trigger", true));

    expect(container.querySelector('[aria-label="Lens trigger"]')).not.toBeNull();

    await rerender(slotProps("running", true));

    expect(container.querySelector('[aria-label="Lens trigger"]')).toBeNull();
    expect(container.querySelector('[aria-label="Investor Lens running"]')).not.toBeNull();

    await unmount();
  });
});
