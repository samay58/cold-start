// @vitest-environment jsdom

import { act } from "react";
import { createRoot } from "react-dom/client";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { BANNED_MICRO_COPY } from "../src/research/how-it-wins-edge";
import { HowItWinsEdge } from "../src/research/HowItWinsEdge";
import { InvestorReadCard } from "../src/research/InvestorReadCard";
import { investorReadForCard, type HowItWinsDisplay } from "../src/research/investor-lens";
import { HOW_IT_WINS_COPY } from "../src/research/investor-read-copy";
import type { TooltipDossier, TooltipMemo } from "../src/shared/SharedTooltip";
import { AlphaAnalyticsProvider } from "../src/shared/alpha-event-context";
import { filedHowItWins, minimalWarpCard } from "./lens-card-fixtures";
import { stubReducedMotion } from "./sidepanel-harness";

vi.mock("../src/shared/alpha-analytics", () => ({ enqueueAlphaEvent: vi.fn() }));

// The same Irregular-shaped read the geometry suite uses: hybrid (16) and chokepoint (32) are
// the pair, prestige (54) also runs, monopoly (53) and standardization (60) are queued. Notes
// are plain on purpose, since the banned-copy sweep below reads everything this renders.
const filedDisplay: HowItWinsDisplay = {
  state: "read",
  sentence: "It wins by combining two rare skills, and by sitting where two labs must pass through it.",
  running: [
    {
      id: "hybrid",
      name: "Hybrid",
      meaning: "Competence in two distinct areas, or two strengths not usually found together.",
      note: "It builds live network environments and has models attack and defend inside them."
    },
    {
      id: "chokepoint",
      name: "Chokepoint",
      meaning: "Controls a passage that competitors or prey must pass through.",
      note: "Two labs name its benchmarks before releasing a model."
    },
    {
      id: "prestige",
      name: "Prestige",
      meaning: "Endorsed by authoritative sources through awards, degrees, or recognition.",
      note: "Two named investors put in personal money alongside the round."
    }
  ],
  pair: {
    strategies: ["hybrid", "chokepoint"],
    names: ["Hybrid", "Chokepoint"],
    meanings: [
      "Competence in two distinct areas, or two strengths not usually found together.",
      "Controls a passage that competitors or prey must pass through."
    ],
    note: "The method produced the passage: the same testing approach is what both labs now name in their own documents.",
    wrongIf: "a lab could swap evaluators without a visible change in its own documentation."
  },
  next: [
    { id: "monopoly", name: "Monopoly", meaning: "Control of a resource or market approved by a governing body.", note: "Would need a regulator naming it directly, not just a government contract." },
    { id: "standardization", name: "Standardization", meaning: "Emergent alignment that reduces friction.", note: "Would need a third lab to adopt the same benchmarks independently." }
  ],
  count: 3
};

// x order across the 80 positions: hybrid (16), the bracket midpoint (24), chokepoint (32),
// monopoly (53), prestige (54), standardization (60). The bracket sits between its own legs,
// which is why keyboard order is not simply running-then-next.
const KEYBOARD_ORDER = ["Hybrid", "Hybrid + Chokepoint", "Chokepoint", "Monopoly, not yet", "Prestige", "Standardization, not yet"];

const emptyContent = { running: [], pair: null, next: [], count: 0 };
const nothingStandsOut = (sentence: string | null): HowItWinsDisplay => ({
  state: "nothing_stands_out",
  sentence,
  ...emptyContent
});
const thinFile: HowItWinsDisplay = { state: "thin_file", sentence: null, ...emptyContent };
const notRead: HowItWinsDisplay = { state: "not_read", sentence: null, ...emptyContent };

type Crown = {
  container: HTMLDivElement;
  crown: HTMLElement | null;
  key: (key: string) => Promise<void>;
  readout: () => string;
  readoutInk: () => string | null;
  unmount: () => Promise<void>;
};

async function renderCrown(display: HowItWinsDisplay, prefersReducedMotion = false): Promise<Crown> {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(<HowItWinsEdge display={display} prefersReducedMotion={prefersReducedMotion} />);
  });
  const crown = container.querySelector<HTMLElement>(".cs-how-it-wins");
  return {
    container,
    crown,
    async key(key: string) {
      await act(async () => {
        crown?.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, key }));
      });
    },
    readout() {
      return container.querySelector(".cs-how-it-wins-readout")?.textContent ?? "";
    },
    readoutInk() {
      return container.querySelector(".cs-how-it-wins-readout")?.getAttribute("data-ink") ?? null;
    },
    async unmount() {
      await act(async () => root.unmount());
      container.remove();
    }
  };
}

function tooltipStub() {
  return (_input: { body: string | TooltipDossier | TooltipMemo; id: string; placement?: unknown; title: string }) => ({
    "aria-describedby": "cs-shared-tooltip",
    onBlur: () => undefined,
    onClick: () => undefined,
    onFocus: () => undefined,
    onKeyDown: () => undefined,
    onPointerEnter: () => undefined,
    onPointerLeave: () => undefined
  });
}

async function renderCardWith(howItWins: ReturnType<typeof filedHowItWins> | undefined) {
  const card = minimalWarpCard({
    synthesis: {
      whyItMatters: { text: "Warp could matter if the terminal becomes the agent control plane [c1].", citationIds: ["c1"] },
      bullCase: [{ text: "Developers already show daily usage [c1].", citationIds: ["c1"] }],
      bearCase: [],
      openQuestions: [{ question: "Can this reach team budgets?", category: "buyer_budget" }],
      ...(howItWins ? { howItWins } : {})
    }
  });
  const read = investorReadForCard(card);
  if (!read) throw new Error("fixture must carry synthesis");
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(
      <AlphaAnalyticsProvider settings={undefined}>
        <InvestorReadCard card={card} read={read} tooltipProps={tooltipStub()} />
      </AlphaAnalyticsProvider>
    );
  });
  return {
    container,
    async unmount() {
      await act(async () => root.unmount());
      container.remove();
    }
  };
}

describe("HowItWinsEdge", () => {
  beforeEach(() => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true;
    stubReducedMotion(false);
  });

  // (a)
  it("renders the filed read, both empty states, and nothing at all when the read is absent", async () => {
    const filed = await renderCrown(filedDisplay);
    expect(filed.crown).not.toBeNull();
    expect(filed.container.textContent).toContain(HOW_IT_WINS_COPY.label);
    expect(filed.readout()).toBe("3 of 80 strategies");
    expect(filed.container.querySelector(".cs-how-it-wins-sentence")?.textContent).toBe(filedDisplay.sentence);
    expect(filed.container.querySelectorAll(".cs-how-it-wins-targets button")).toHaveLength(6);
    await filed.unmount();

    const named = await renderCrown(nothingStandsOut("Nothing about how it wins stands out in the filed record yet."));
    expect(named.readout()).toBe("0 of 80 strategies");
    expect(named.container.querySelector(".cs-how-it-wins-sentence")?.textContent)
      .toBe("Nothing about how it wins stands out in the filed record yet.");
    expect(named.container.querySelectorAll(".cs-how-it-wins-targets button")).toHaveLength(0);
    await named.unmount();

    const degraded = await renderCrown(nothingStandsOut(null));
    expect(degraded.container.querySelector(".cs-how-it-wins-sentence")?.textContent)
      .toBe(HOW_IT_WINS_COPY.nothingStandsOut);
    await degraded.unmount();

    const thin = await renderCrown(thinFile);
    expect(thin.readout()).toBe("0 of 80 strategies");
    expect(thin.container.querySelector(".cs-how-it-wins-sentence")?.textContent).toBe(HOW_IT_WINS_COPY.thinFile);
    expect(thin.container.querySelectorAll(".cs-how-it-wins-targets button")).toHaveLength(0);
    await thin.unmount();

    const absent = await renderCrown(notRead);
    expect(absent.container.innerHTML).toBe("");
    await absent.unmount();
  });

  // (a), the mount: the plate carries the crown above its header, and omits it on a legacy card.
  it("mounts above the Lens header on a filed read and not at all on a legacy card", async () => {
    const filed = await renderCardWith(filedHowItWins());
    const plate = filed.container.querySelector(".cs-investor-read");
    expect(plate?.firstElementChild?.className).toContain("cs-how-it-wins");
    expect(filed.container.querySelector(".cs-how-it-wins-readout")?.textContent).toBe("3 of 80 strategies");
    await filed.unmount();

    const legacy = await renderCardWith(undefined);
    expect(legacy.container.querySelector(".cs-how-it-wins")).toBeNull();
    await legacy.unmount();
  });

  // (b)
  it("reads out a running mark, a queued mark, and the bracket as the keyboard steps them", async () => {
    const crown = await renderCrown(filedDisplay);

    await crown.key("ArrowRight");
    expect(crown.readout()).toBe("Hybrid");
    expect(crown.readoutInk()).toBe("true");

    await crown.key("ArrowRight");
    expect(crown.readout()).toBe("Hybrid + Chokepoint");
    expect(crown.readoutInk()).toBe("true");

    for (let step = 0; step < 4; step += 1) {
      await crown.key("ArrowRight");
    }
    expect(crown.readout()).toBe("Standardization, not yet");
    expect(crown.readoutInk()).toBe("true");

    await crown.unmount();
  });

  // (c)
  it("opens the note below the sentence, named, with the pair's Wrong if and a pinned receipt", async () => {
    const crown = await renderCrown(filedDisplay);
    await crown.key("ArrowRight");

    const sentence = crown.container.querySelector(".cs-how-it-wins-sentence");
    const note = crown.container.querySelector(".cs-how-it-wins-note");
    expect(note).not.toBeNull();
    expect(note?.getAttribute("data-open")).toBe("true");
    expect(note?.getAttribute("data-placement")).toBe("below");
    expect(note?.getAttribute("role")).toBe("dialog");
    expect(note?.getAttribute("aria-label")).toBe("Hybrid");
    expect(sentence?.compareDocumentPosition(note as Node) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(crown.container.querySelector(".cs-how-it-wins-kicker")?.textContent?.startsWith("Hybrid.")).toBe(true);
    expect(crown.container.querySelector(".cs-how-it-wins-kicker small")?.textContent).toBe(HOW_IT_WINS_COPY.pinned);

    await crown.key("ArrowRight");
    expect(crown.container.querySelector(".cs-how-it-wins-note")?.textContent).toContain(HOW_IT_WINS_COPY.wrongIf);
    expect(crown.container.querySelector(".cs-how-it-wins-meta")?.textContent).toContain(filedDisplay.pair?.wrongIf ?? "");

    await crown.unmount();
  });

  // (d)
  it("steps targets in x order, returns on ArrowLeft, releases on Escape, and toggles on Enter", async () => {
    const crown = await renderCrown(filedDisplay);
    const walked: string[] = [];
    for (let step = 0; step < KEYBOARD_ORDER.length; step += 1) {
      await crown.key("ArrowRight");
      walked.push(crown.readout());
    }
    expect(walked).toEqual(KEYBOARD_ORDER);

    await crown.key("ArrowRight");
    expect(crown.readout()).toBe(KEYBOARD_ORDER[KEYBOARD_ORDER.length - 1]);
    await crown.key("ArrowLeft");
    expect(crown.readout()).toBe(KEYBOARD_ORDER[KEYBOARD_ORDER.length - 2]);

    expect(crown.crown?.getAttribute("data-pinned")).toBe("true");
    await crown.key("Enter");
    expect(crown.crown?.getAttribute("data-pinned")).toBe("false");
    await crown.key("Enter");
    expect(crown.crown?.getAttribute("data-pinned")).toBe("true");

    await crown.key("Escape");
    expect(crown.crown?.getAttribute("data-pinned")).toBe("false");
    expect(crown.readout()).toBe("3 of 80 strategies");
    expect(crown.readoutInk()).toBe("false");
    expect(crown.container.querySelector('.cs-how-it-wins-note[data-open="true"]')).toBeNull();

    await crown.unmount();
  });

  // (e)
  it("under reduced motion runs no animation frames and still updates the readout", async () => {
    stubReducedMotion(true);
    const crown = await renderCrown(filedDisplay, true);
    expect(crown.crown?.getAttribute("data-reduced-motion")).toBe("true");

    const frames = vi.spyOn(globalThis, "requestAnimationFrame");
    for (let step = 0; step < 3; step += 1) {
      await crown.key("ArrowRight");
    }
    expect(frames).not.toHaveBeenCalled();
    expect(crown.readout()).toBe("Chokepoint");
    frames.mockRestore();

    await crown.unmount();
  });

  // (f)
  it("never renders banned micro-copy or an em dash, on any pinned target", async () => {
    const crown = await renderCrown(filedDisplay);
    const seen: string[] = [crown.container.textContent ?? ""];
    for (let step = 0; step < KEYBOARD_ORDER.length; step += 1) {
      await crown.key("ArrowRight");
      seen.push(crown.container.textContent ?? "");
    }

    for (const text of seen) {
      for (const phrase of BANNED_MICRO_COPY) {
        const pattern = new RegExp(phrase === "cut" ? "\\bcut\\b" : phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
        expect(pattern.test(text), `${phrase} in: ${text}`).toBe(false);
      }
      expect(text).not.toContain("—");
    }

    await crown.unmount();
  });

  // (h) a screen-reader user sits on a button, not on a cursor: a key pressed there names that
  // button's own strategy, and the arrows carry focus with them.
  it("pins the focused target button on Enter and moves focus as the arrows step", async () => {
    const crown = await renderCrown(filedDisplay);
    const buttons = [...crown.container.querySelectorAll<HTMLButtonElement>(".cs-how-it-wins-targets button")];
    const press = async (button: HTMLButtonElement | undefined, key: string) => {
      button?.focus();
      await act(async () => {
        button?.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, key }));
      });
    };

    expect(buttons.map((button) => button.textContent)).toEqual(KEYBOARD_ORDER);

    await press(buttons[2], "Enter");
    expect(crown.crown?.getAttribute("data-pinned")).toBe("true");
    expect(crown.readout()).toBe(KEYBOARD_ORDER[2]);
    expect(crown.container.querySelector('.cs-how-it-wins-note[data-open="true"]')?.getAttribute("aria-label"))
      .toBe(KEYBOARD_ORDER[2]);

    await press(buttons[2], "ArrowRight");
    expect(document.activeElement).toBe(buttons[3]);
    expect(crown.readout()).toBe(KEYBOARD_ORDER[3]);

    await press(buttons[3], "Enter");
    expect(crown.crown?.getAttribute("data-pinned")).toBe("false");
    expect(crown.readout()).toBe("3 of 80 strategies");

    await crown.unmount();
  });

  // (g)
  it("paints in ink only: no seal token anywhere in the crown", async () => {
    const crown = await renderCrown(filedDisplay);
    await crown.key("ArrowRight");
    expect(crown.crown?.outerHTML.toLowerCase()).not.toContain("seal");
    await crown.unmount();
  });
});
