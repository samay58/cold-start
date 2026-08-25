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
  inQuestion: [
    { id: "completeness", name: "Completeness", meaning: "One tool covers everything the buyer needs, so nothing else is required.", note: "The filed record does not show whether labs still need another evaluator for the same job." }
  ],
  count: 3
};

// x order across the 80 positions: completeness (1), hybrid (16), the bracket midpoint (24),
// chokepoint (32), monopoly (53), prestige (54), standardization (60). The bracket sits between
// its own legs, which is why keyboard order is not simply running-then-next.
const KEYBOARD_ORDER = [
  "Completeness?",
  "Hybrid",
  "Hybrid + Chokepoint",
  "Chokepoint",
  "Monopoly, not yet",
  "Prestige",
  "Standardization, not yet"
];

const emptyContent = { running: [], pair: null, next: [], inQuestion: [], count: 0 };
const nothingStandsOut = (sentence: string | null): HowItWinsDisplay => ({
  state: "nothing_stands_out",
  sentence,
  ...emptyContent
});
const thinFile: HowItWinsDisplay = { state: "thin_file", sentence: null, ...emptyContent };
const notRead: HowItWinsDisplay = { state: "not_read", sentence: null, ...emptyContent };
const reading: HowItWinsDisplay = { state: "reading", sentence: null, ...emptyContent };

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
    expect(filed.container.querySelectorAll(".cs-how-it-wins-targets button")).toHaveLength(7);
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

  // The floors and caps moved under the crown: one running mark is a read, six is the running
  // cap, and twelve is the in-question cap. Every one of those has to draw its own marks and
  // reach its own buttons without the geometry throwing.
  it("draws one running mark, six running marks, and twelve in-question marks", async () => {
    const entry = (id: string, name: string) => ({ id, name, meaning: `${name} means something plain.`, note: `${name} has a note.` });

    const one = await renderCrown({
      state: "read",
      sentence: "It wins on one mechanism the filed sources actually show.",
      running: [entry("hybrid", "Hybrid")],
      pair: null,
      next: [],
      inQuestion: [],
      count: 1
    });
    expect(one.readout()).toBe("1 of 80 strategies");
    expect(one.container.querySelectorAll(".cs-how-it-wins-targets button")).toHaveLength(1);
    expect(one.container.querySelectorAll(".cs-hiw-cut-wall").length).toBeGreaterThan(0);
    await one.key("ArrowRight");
    expect(one.readout()).toBe("Hybrid");
    await one.unmount();

    const sixRunning = [
      entry("usership", "Usership"),
      entry("hybrid", "Hybrid"),
      entry("chokepoint", "Chokepoint"),
      entry("prestige", "Prestige"),
      entry("precision", "Precision"),
      entry("simplicity", "Simplicity")
    ];
    const twelveQuestions = [
      "completeness", "aggregation", "diversification", "cloning", "affordability", "luxury",
      "skimming", "bundling", "heritage", "craftsmanship", "organic", "endurance"
    ].map((id) => entry(id, id));

    const full = await renderCrown({
      state: "read",
      sentence: "It wins on six mechanisms, with twelve more the filed sources do not settle.",
      running: sixRunning,
      pair: null,
      next: [],
      inQuestion: twelveQuestions,
      count: 6
    });
    expect(full.readout()).toBe("6 of 80 strategies");
    expect(full.container.querySelectorAll(".cs-how-it-wins-targets button")).toHaveLength(18);
    expect(full.container.querySelectorAll(".cs-hiw-question")).toHaveLength(12);
    await full.unmount();
  });

  it("keeps in-question marks when nothing currently stands out", async () => {
    const crown = await renderCrown({
      state: "nothing_stands_out",
      sentence: "Nothing about how it wins stands out in the filed record yet.",
      ...emptyContent,
      inQuestion: filedDisplay.inQuestion
    });
    expect(crown.readout()).toBe("0 of 80 strategies");
    expect(crown.container.querySelectorAll(".cs-how-it-wins-targets button")).toHaveLength(1);
    // The marks themselves draw, not just their hidden buttons: a nothing_stands_out read whose
    // only content is an unresolved strategy must never leave the edge blank.
    expect(crown.container.querySelectorAll(".cs-hiw-question")).toHaveLength(1);
    await crown.key("ArrowRight");
    expect(crown.readout()).toBe("Completeness?");
    await crown.unmount();
  });

  // The wait: the crown holds its resting geometry, says what it is doing, and offers nothing
  // to hover or pin until the read lands.
  it("mounts empty and non-interactive while the read is still running", async () => {
    const crown = await renderCrown(reading);
    expect(crown.crown).not.toBeNull();
    expect(crown.crown?.getAttribute("data-state")).toBe("reading");
    expect(crown.container.textContent).toContain(HOW_IT_WINS_COPY.label);
    expect(crown.container.querySelector(".cs-how-it-wins-sentence")?.textContent).toBe(HOW_IT_WINS_COPY.reading);
    expect(crown.readout()).toBe("");
    expect(crown.container.querySelector(".cs-how-it-wins-edge svg")).not.toBeNull();
    expect(crown.container.querySelectorAll(".cs-hiw-cut-wall, .cs-hiw-hollow, .cs-hiw-question, .cs-hiw-bracket"))
      .toHaveLength(0);
    expect(crown.container.querySelectorAll(".cs-how-it-wins-targets button")).toHaveLength(0);

    await crown.key("ArrowRight");
    await crown.key("Enter");
    expect(crown.crown?.getAttribute("data-pinned")).toBe("false");
    expect(crown.container.querySelector(".cs-how-it-wins-note")).toBeNull();
    expect(crown.readout()).toBe("");

    await crown.unmount();
  });

  it("keeps the running read legible under reduced motion and hands the edge over when it lands", async () => {
    stubReducedMotion(true);
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    await act(async () => {
      root.render(<HowItWinsEdge display={reading} prefersReducedMotion />);
    });
    expect(container.querySelector(".cs-how-it-wins-sentence")?.textContent).toBe(HOW_IT_WINS_COPY.reading);

    await act(async () => {
      root.render(<HowItWinsEdge display={filedDisplay} prefersReducedMotion />);
    });
    expect(container.querySelector(".cs-how-it-wins")?.getAttribute("data-state")).toBe("read");
    expect(container.querySelector(".cs-how-it-wins-sentence")?.textContent).toBe(filedDisplay.sentence);
    expect(container.querySelectorAll(".cs-hiw-cut-wall").length).toBeGreaterThan(0);

    await act(async () => root.unmount());
    container.remove();
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
    expect(crown.readout()).toBe("Completeness?");
    expect(crown.readoutInk()).toBe("true");

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
    expect(crown.container.querySelector(".cs-how-it-wins-note")?.getAttribute("aria-label")).toBe("Completeness?");
    expect(crown.container.querySelector(".cs-how-it-wins-kicker")?.textContent?.startsWith("Completeness?")).toBe(true);
    expect(crown.container.querySelector(".cs-how-it-wins-kicker")?.textContent?.startsWith("Completeness?.")).toBe(false);

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
    for (let step = 0; step < 4; step += 1) {
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

    const waiting = await renderCrown(reading);
    seen.push(waiting.container.textContent ?? "");
    await waiting.unmount();

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

    await press(buttons[3], "Enter");
    expect(crown.crown?.getAttribute("data-pinned")).toBe("true");
    expect(crown.readout()).toBe(KEYBOARD_ORDER[3]);
    expect(crown.container.querySelector('.cs-how-it-wins-note[data-open="true"]')?.getAttribute("aria-label"))
      .toBe(KEYBOARD_ORDER[3]);

    await press(buttons[3], "ArrowRight");
    expect(document.activeElement).toBe(buttons[4]);
    expect(crown.readout()).toBe(KEYBOARD_ORDER[4]);

    await press(buttons[4], "Enter");
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

  it("opens an in-question note on what is unresolved, named as its own kind", async () => {
    const crown = await renderCrown(filedDisplay);
    await crown.key("ArrowRight");
    const note = crown.container.querySelector(".cs-how-it-wins-note");
    expect(note?.getAttribute("data-kind")).toBe("in_question");
    // The kicker is the name alone. The body under it is the record's own unresolved account,
    // with no definition line in between claiming how the company wins.
    expect(crown.container.querySelector(".cs-how-it-wins-kicker span")?.textContent).toBe("Completeness?");
    expect(note?.querySelector("p")?.textContent).toBe(filedDisplay.inQuestion[0]?.note);
    expect(note?.textContent).not.toContain(filedDisplay.inQuestion[0]?.meaning);

    await crown.key("ArrowRight");
    expect(crown.container.querySelector(".cs-how-it-wins-note")?.getAttribute("data-kind")).toBe("running");

    await crown.unmount();
  });

  it("paints in-question marks with the question class, not the dashed hollow", async () => {
    stubReducedMotion(true);
    const crown = await renderCrown(filedDisplay, true);
    expect(crown.container.querySelector(".cs-hiw-question")).not.toBeNull();
    expect(crown.container.querySelector(".cs-hiw-hollow")).not.toBeNull();
    expect(crown.container.querySelector(".cs-hiw-question")?.getAttribute("class")).not.toContain("cs-hiw-hollow");
    await crown.unmount();
  });
});
