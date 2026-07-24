// @vitest-environment jsdom

import type { ColdStartCard } from "@cold-start/core";
import { act, type ComponentProps } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { InvestorReadCard, LensSlot, type LensSlotState } from "../src/research/InvestorReadCard";
import { LENS_TENSION_EMPTY_COPY } from "../src/research/investor-read-copy";
import { investorReadForCard } from "../src/research/investor-lens";
import type { TooltipDossier } from "../src/shared/SharedTooltip";
import { minimalWarpCard as baseCard } from "./lens-card-fixtures";

type Captured = { body: string | TooltipDossier; id: string; title: string };

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
      onClick: () => undefined,
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

  it("(a) files every Lens point into five indexed categories with Why care open by default", async () => {
    const { container, unmount } = await renderCard(richCard());
    const lede = container.querySelector('[data-role="lede"]');
    const categories = Array.from(container.querySelectorAll(".cs-investor-read-category"));

    expect(lede).not.toBeNull();
    expect(lede?.textContent).toContain("Warp could matter if terminal work becomes the control plane");
    expect(categories.map((category) => category.getAttribute("data-category"))).toEqual([
      "why-care",
      "must-be-true",
      "could-break",
      "why-now",
      "learn-next"
    ]);
    expect(categories.map((category) => category.querySelector("strong")?.textContent)).toEqual([
      "Why care",
      "What must be true",
      "What could break",
      "Why now",
      "What to learn next"
    ]);
    expect(categories.map((category) => category.getAttribute("data-open"))).toEqual([
      "true",
      "false",
      "false",
      "false",
      "false"
    ]);

    await unmount();
  });

  it("(b) keeps a long Why care thesis available behind its own inline disclosure", async () => {
    const longText = "Warp matters because the terminal can become the control plane for engineering agents, joining command execution, shared context, and team approvals in one daily surface without asking developers to adopt a separate planning workflow. If that behavior compounds across teams, the product can own both individual usage and a durable platform budget.";
    const card = richCard();
    if (!card.synthesis) {
      throw new Error("fixture must carry synthesis");
    }
    card.synthesis.whyItMatters = { text: `${longText} [c2].`, citationIds: ["c2"] };
    const { container, unmount } = await renderCard(card);
    const toggle = container.querySelector<HTMLButtonElement>(".cs-investor-read-lede-more");
    const frame = container.querySelector(".cs-investor-read-lede-frame");

    expect(toggle?.textContent).toBe("Read full");
    expect(toggle?.getAttribute("aria-expanded")).toBe("false");
    expect(frame?.getAttribute("data-expanded")).toBe("false");
    expect(frame?.textContent).toContain(longText);

    await act(async () => {
      toggle?.click();
    });

    expect(toggle?.textContent).toBe("Show less");
    expect(toggle?.getAttribute("aria-expanded")).toBe("true");
    expect(frame?.getAttribute("data-expanded")).toBe("true");

    await unmount();
  });

  it("(c) carries data-side on the holds/breaks rows and gives each a distinct mark", async () => {
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

  it("(d) renders the 0-bear side with its own honest, distinct empty copy", async () => {
    const { container, unmount } = await renderCard(sparseCard());
    const breaks = container.querySelector('[data-side="breaks"]');
    const holds = container.querySelector('[data-side="holds"]');

    expect(breaks?.textContent).toContain(LENS_TENSION_EMPTY_COPY.breaks);
    // The holds side has a real claim, so it must not carry the empty copy at all, and the two
    // sides' empty-state language must not collapse into the same generic sentence.
    expect(holds?.textContent).not.toContain("survived verification");

    await unmount();
  });

  it("(e) renders the advisory posture line only when advisories exist", async () => {
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

  it("(f) expands moreClaims inline without invoking a tooltip", async () => {
    const { container, tooltipCalls, unmount } = await renderCard(richCard());
    const holdsCategory = container.querySelector('[data-category="must-be-true"]');
    const categoryToggle = holdsCategory?.querySelector<HTMLButtonElement>(".cs-investor-read-category-trigger");

    await act(async () => {
      categoryToggle?.click();
    });

    const holds = holdsCategory?.querySelector('[data-side="holds"]');
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

  it("(g) keeps one category open at a time and lets the open category collapse fully", async () => {
    const { container, unmount } = await renderCard(richCard());
    const whyCare = container.querySelector('[data-category="why-care"]');
    const whyNow = container.querySelector('[data-category="why-now"]');
    const whyCareToggle = whyCare?.querySelector<HTMLButtonElement>(".cs-investor-read-category-trigger");
    const whyNowToggle = whyNow?.querySelector<HTMLButtonElement>(".cs-investor-read-category-trigger");

    expect(whyCareToggle?.getAttribute("aria-expanded")).toBe("true");
    expect(whyNowToggle?.getAttribute("aria-expanded")).toBe("false");

    await act(async () => {
      whyNowToggle?.click();
    });

    expect(whyCareToggle?.getAttribute("aria-expanded")).toBe("false");
    expect(whyCare?.querySelector(".cs-investor-read-category-frame")?.getAttribute("aria-hidden")).toBe("true");
    expect(whyNowToggle?.getAttribute("aria-expanded")).toBe("true");
    expect(container.querySelectorAll('.cs-investor-read-category[data-open="true"]')).toHaveLength(1);

    await act(async () => {
      whyNowToggle?.click();
    });

    expect(container.querySelectorAll('.cs-investor-read-category[data-open="true"]')).toHaveLength(0);
    expect(whyNowToggle?.getAttribute("aria-expanded")).toBe("false");

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

  it("(g) crossfades the running card out and the result card in, leaving no orphaned running node", async () => {
    const { container, rerender, unmount } = await renderSlot(slotProps("running"));

    expect(container.querySelector('[aria-label="Investor Lens running"]')).not.toBeNull();
    expect(container.querySelector('[aria-label="Investor read"]')).toBeNull();

    await rerender(slotProps("result"));

    expect(container.querySelector('[aria-label="Investor Lens running"]')).toBeNull();
    expect(container.querySelector('[aria-label="Investor read"]')).not.toBeNull();

    // The staged entrance must not gate interactivity: the disclosure toggle is clickable the
    // instant the result card mounts, not after its stagger settles.
    const holdsCategory = container.querySelector('[data-category="must-be-true"]');
    const categoryToggle = holdsCategory?.querySelector<HTMLButtonElement>(".cs-investor-read-category-trigger");
    await act(async () => {
      categoryToggle?.click();
    });
    const holds = holdsCategory?.querySelector('[data-side="holds"]');
    const toggle = holds?.querySelector<HTMLButtonElement>(".cs-investor-read-more");
    expect(toggle).not.toBeNull();
    await act(async () => {
      toggle?.click();
    });
    expect(toggle?.getAttribute("aria-expanded")).toBe("true");

    await unmount();
  });

  it("(h) crossfades the withheld card out and the trigger control in on retry, leaving no orphaned withheld node", async () => {
    const { container, rerender, unmount } = await renderSlot(slotProps("withheld"));

    expect(container.querySelector('[aria-label="Lens withheld"]')).not.toBeNull();
    expect(container.querySelector('[aria-label="Lens trigger"]')).toBeNull();

    await rerender(slotProps("trigger"));

    expect(container.querySelector('[aria-label="Lens withheld"]')).toBeNull();
    expect(container.querySelector('[aria-label="Lens trigger"]')).not.toBeNull();

    await unmount();
  });

  it("(i) reduced motion still crossfades trigger to running without orphaning the trigger node", async () => {
    const { container, rerender, unmount } = await renderSlot(slotProps("trigger", true));

    expect(container.querySelector('[aria-label="Lens trigger"]')).not.toBeNull();

    await rerender(slotProps("running", true));

    expect(container.querySelector('[aria-label="Lens trigger"]')).toBeNull();
    expect(container.querySelector('[aria-label="Investor Lens running"]')).not.toBeNull();

    await unmount();
  });
});
