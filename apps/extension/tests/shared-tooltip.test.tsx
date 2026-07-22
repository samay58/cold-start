// @vitest-environment jsdom

import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SharedTooltip, useSharedTooltip } from "../src/shared/SharedTooltip";
import type { TooltipDossier, TooltipTriggerProps } from "../src/shared/SharedTooltip";

type Interaction = ReturnType<typeof useSharedTooltip>["tooltipInteraction"];

type Handle = {
  props: TooltipTriggerProps;
  interaction: Interaction;
};

const dossier: TooltipDossier = {
  kind: "dossier",
  name: "Ada Lovelace",
  role: "CEO",
  read: null,
  provenance: "via techcrunch.com",
  email: { address: "ada@acme.ai", basis: null, status: "observed" },
  channels: [
    { label: "GitHub", url: "https://github.com/ada" },
    { label: "X", url: "https://x.com/ada" }
  ]
};

const dossierB: TooltipDossier = {
  kind: "dossier",
  name: "Grace Hopper",
  role: "CTO",
  read: null,
  provenance: "via example.com",
  email: null,
  channels: []
};

function Harness({ body, handleRef }: { body: string | TooltipDossier; handleRef: { current: Handle | null } }) {
  const { tooltip, triggerProps, tooltipInteraction } = useSharedTooltip(false);
  const props = triggerProps({ body, id: "person-ada", title: "Ada Lovelace" });
  handleRef.current = { props, interaction: tooltipInteraction };
  return (
    <>
      <article className="cs-test-trigger" tabIndex={0} {...props}>
        Ada Lovelace
      </article>
      <SharedTooltip interaction={tooltipInteraction} tooltip={tooltip} />
    </>
  );
}

function pointerEvent(node: HTMLElement) {
  return { currentTarget: node, relatedTarget: null } as unknown as Parameters<TooltipTriggerProps["onPointerEnter"]>[0];
}

function focusEvent(node: HTMLElement) {
  return { currentTarget: node, relatedTarget: null } as unknown as Parameters<TooltipTriggerProps["onFocus"]>[0];
}

function keyEvent(node: HTMLElement, key: string) {
  return { currentTarget: node, key, preventDefault: () => undefined } as unknown as Parameters<
    NonNullable<TooltipTriggerProps["onKeyDown"]>
  >[0];
}

function clickEvent(node: HTMLElement) {
  return { currentTarget: node } as unknown as Parameters<TooltipTriggerProps["onClick"]>[0];
}

// jsdom gives every unlaid-out element an identical zero rect, so two triggers are
// indistinguishable by position unless stubbed. Docked geometry must ignore this rect
// entirely (it reads dockAnchorRef instead); stubbing distinct rects per trigger is what
// makes a "position didn't move" assertion a real discriminator rather than a coincidence.
function stubRect(node: HTMLElement, rect: Partial<DOMRect>) {
  vi.spyOn(node, "getBoundingClientRect").mockReturnValue({
    bottom: 0, height: 0, left: 0, right: 0, top: 0, width: 0, x: 0, y: 0,
    toJSON: () => ({}),
    ...rect
  } as DOMRect);
}

let cleanup: (() => Promise<void>) | null = null;

async function mount(body: string | TooltipDossier) {
  const handleRef: { current: Handle | null } = { current: null };
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(<Harness body={body} handleRef={handleRef} />);
  });
  const trigger = container.querySelector(".cs-test-trigger") as HTMLElement;
  cleanup = async () => {
    await act(async () => root.unmount());
    container.remove();
  };
  return { container, handleRef, trigger };
}

// Two docked siblings sharing one hook instance, plus the dock anchor CompanyHeader would
// render below the people block. Mirrors the real wiring closely enough to exercise retarget,
// geometry, and the close grace across the row-to-dock gap.
type DockHandle = {
  aProps: TooltipTriggerProps;
  bProps: TooltipTriggerProps;
  interaction: Interaction;
};

function DockHarness({
  handleRef,
  prefersReducedMotion = false
}: {
  handleRef: { current: DockHandle | null };
  prefersReducedMotion?: boolean;
}) {
  const { dockAnchorRef, tooltip, triggerProps, tooltipInteraction } = useSharedTooltip(prefersReducedMotion);
  const aProps = triggerProps({ body: dossier, id: "person-ada", mode: "docked", title: "Ada Lovelace" });
  const bProps = triggerProps({ body: dossierB, id: "person-grace", mode: "docked", title: "Grace Hopper" });
  handleRef.current = { aProps, bProps, interaction: tooltipInteraction };
  return (
    <>
      <article className="cs-test-trigger-a" tabIndex={0} {...aProps}>
        Ada Lovelace
      </article>
      <article className="cs-test-trigger-b" tabIndex={0} {...bProps}>
        Grace Hopper
      </article>
      <div className="cs-test-dock-anchor" ref={dockAnchorRef} />
      <SharedTooltip interaction={tooltipInteraction} tooltip={tooltip} />
    </>
  );
}

async function mountDock(prefersReducedMotion = false) {
  const handleRef: { current: DockHandle | null } = { current: null };
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(<DockHarness handleRef={handleRef} prefersReducedMotion={prefersReducedMotion} />);
  });
  const triggerA = container.querySelector(".cs-test-trigger-a") as HTMLElement;
  const triggerB = container.querySelector(".cs-test-trigger-b") as HTMLElement;
  cleanup = async () => {
    await act(async () => root.unmount());
    container.remove();
  };
  return { container, handleRef, triggerA, triggerB };
}

beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  document.body.innerHTML = "";
});

afterEach(async () => {
  if (cleanup) {
    await cleanup();
    cleanup = null;
  }
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("dossier hovercard bridge", () => {
  it("keeps the dossier open across the trigger-to-tooltip gap and closes only when the pointer leaves both", async () => {
    vi.useFakeTimers();
    const { container, handleRef, trigger } = await mount(dossier);

    await act(async () => {
      handleRef.current!.props.onPointerEnter(pointerEvent(trigger));
    });
    // The 90ms open intent has to elapse before the tooltip commits.
    await act(async () => {
      vi.advanceTimersByTime(100);
    });
    expect(container.querySelector(".cs-shared-tooltip")?.getAttribute("data-variant")).toBe("dossier");

    // Leaving the trigger opens a grace window instead of closing immediately.
    await act(async () => {
      handleRef.current!.props.onPointerLeave(pointerEvent(trigger));
    });
    expect(container.querySelector(".cs-shared-tooltip")).toBeTruthy();

    // The pointer reaches the tooltip; entering it cancels the pending close.
    await act(async () => {
      handleRef.current!.interaction.onPointerEnter();
    });
    await act(async () => {
      vi.advanceTimersByTime(1000);
    });
    expect(container.querySelector(".cs-shared-tooltip")).toBeTruthy();

    // Leaving the tooltip finally closes it after the grace window.
    await act(async () => {
      handleRef.current!.interaction.onPointerLeave();
    });
    await act(async () => {
      vi.advanceTimersByTime(1000);
    });
    expect(container.querySelector(".cs-shared-tooltip")).toBeNull();
  });

  it("exposes the channel links as reachable anchors inside the dossier", async () => {
    vi.useFakeTimers();
    const { container, handleRef, trigger } = await mount(dossier);
    await act(async () => {
      handleRef.current!.props.onPointerEnter(pointerEvent(trigger));
    });
    // The 90ms open intent has to elapse before the tooltip commits.
    await act(async () => {
      vi.advanceTimersByTime(100);
    });

    const tooltip = container.querySelector(".cs-shared-tooltip");
    const github = tooltip?.querySelector('a[href="https://github.com/ada"]') as HTMLAnchorElement | null;
    const x = tooltip?.querySelector('a[href="https://x.com/ada"]') as HTMLAnchorElement | null;
    expect(github?.textContent).toBe("GitHub");
    expect(x?.textContent).toBe("X");
  });
});

describe("plain string tooltip gets the same grace window as the dossier", () => {
  it("keeps the text tooltip open across the trigger-to-tooltip gap and closes only when the pointer leaves both", async () => {
    vi.useFakeTimers();
    const { container, handleRef, trigger } = await mount("The full description text.");

    await act(async () => {
      handleRef.current!.props.onPointerEnter(pointerEvent(trigger));
    });
    // The 90ms open intent has to elapse before the tooltip commits.
    await act(async () => {
      vi.advanceTimersByTime(100);
    });
    expect(container.querySelector(".cs-shared-tooltip")?.getAttribute("data-variant")).toBe("text");

    // Leaving the trigger opens a grace window instead of closing immediately, same as
    // the dossier: the plain string tooltip is a reachable hovercard now too.
    await act(async () => {
      handleRef.current!.props.onPointerLeave(pointerEvent(trigger));
    });
    expect(container.querySelector(".cs-shared-tooltip")).toBeTruthy();

    // The pointer reaches the tooltip; entering it cancels the pending close.
    await act(async () => {
      handleRef.current!.interaction.onPointerEnter();
    });
    await act(async () => {
      vi.advanceTimersByTime(1000);
    });
    expect(container.querySelector(".cs-shared-tooltip")).toBeTruthy();

    // Leaving the tooltip finally closes it after the grace window.
    await act(async () => {
      handleRef.current!.interaction.onPointerLeave();
    });
    await act(async () => {
      vi.advanceTimersByTime(1000);
    });
    expect(container.querySelector(".cs-shared-tooltip")).toBeNull();
  });

  it("still closes on pointer leave when the pointer never reaches the tooltip, once the grace window elapses", async () => {
    vi.useFakeTimers();
    const { container, handleRef, trigger } = await mount("The full description text.");

    await act(async () => {
      handleRef.current!.props.onPointerEnter(pointerEvent(trigger));
    });
    // The 90ms open intent has to elapse and commit the tooltip before this test's actual
    // subject (the close grace after leaving) is reachable.
    await act(async () => {
      vi.advanceTimersByTime(100);
    });
    await act(async () => {
      handleRef.current!.props.onPointerLeave(pointerEvent(trigger));
    });
    expect(container.querySelector(".cs-shared-tooltip")).toBeTruthy();

    await act(async () => {
      vi.advanceTimersByTime(1000);
    });
    expect(container.querySelector(".cs-shared-tooltip")).toBeNull();
  });
});

describe("dossier keyboard path", () => {
  it("pins the dossier on Enter, moves focus into it, and returns focus on Escape", async () => {
    const { container, handleRef, trigger } = await mount(dossier);

    await act(async () => {
      trigger.focus();
      handleRef.current!.props.onFocus(focusEvent(trigger));
    });
    expect(container.querySelector(".cs-shared-tooltip")?.getAttribute("data-pinned")).toBe("false");

    await act(async () => {
      handleRef.current!.props.onKeyDown?.(keyEvent(trigger, "Enter"));
    });
    const tooltip = container.querySelector(".cs-shared-tooltip");
    expect(tooltip?.getAttribute("data-pinned")).toBe("true");
    // Focus moved into the pinned dossier so its actions are keyboard reachable.
    expect(tooltip?.contains(document.activeElement)).toBe(true);

    await act(async () => {
      tooltip?.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, key: "Escape" }));
    });
    // Escape releases the focus trap back to the row. The row is focused again, so the
    // dossier stays visible but unpinned (like hover), and focus is back on the trigger.
    expect(document.activeElement).toBe(trigger);
    expect(container.querySelector(".cs-shared-tooltip")?.getAttribute("data-pinned")).toBe("false");
  });

  it("does not pin the plain string tooltip on Enter", async () => {
    const { container, handleRef, trigger } = await mount("The full description text.");
    await act(async () => {
      trigger.focus();
      handleRef.current!.props.onFocus(focusEvent(trigger));
    });
    await act(async () => {
      handleRef.current!.props.onKeyDown?.(keyEvent(trigger, "Enter"));
    });
    // The text variant never pins; Enter leaves it in its plain, non-interactive state.
    expect(container.querySelector(".cs-shared-tooltip")?.getAttribute("data-pinned")).toBe("false");
  });

  it("promotes the pinned dossier from role=tooltip to role=dialog, and reverts on unpin", async () => {
    const { container, handleRef, trigger } = await mount(dossier);

    await act(async () => {
      trigger.focus();
      handleRef.current!.props.onFocus(focusEvent(trigger));
    });
    // Unpinned (hover/focus-only) stays informational: role=tooltip, no accessible name of
    // its own, even though it contains interactive children (copy button, channel links) --
    // WAI-ARIA APG forbids a tooltip from holding focus or interactive content, which is
    // exactly what pinning is about to introduce.
    let tooltip = container.querySelector(".cs-shared-tooltip");
    expect(tooltip?.getAttribute("role")).toBe("tooltip");
    expect(tooltip?.hasAttribute("aria-label")).toBe(false);

    await act(async () => {
      handleRef.current!.props.onKeyDown?.(keyEvent(trigger, "Enter"));
    });
    // Pinning is the semantic promotion: the region becomes a real interactive dialog with
    // its own accessible name, matching the focus it now holds.
    tooltip = container.querySelector(".cs-shared-tooltip");
    expect(tooltip?.getAttribute("role")).toBe("dialog");
    expect(tooltip?.getAttribute("aria-label")).toBe("Ada Lovelace details");

    await act(async () => {
      tooltip?.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, key: "Escape" }));
    });
    // Escape unpins and demotes the region back to role=tooltip with no accessible name.
    tooltip = container.querySelector(".cs-shared-tooltip");
    expect(tooltip?.getAttribute("role")).toBe("tooltip");
    expect(tooltip?.hasAttribute("aria-label")).toBe(false);
  });

  it("closes an unpinned, focus-revealed dossier on Escape without moving focus off the trigger", async () => {
    const { container, handleRef, trigger } = await mount(dossier);

    await act(async () => {
      trigger.focus();
      handleRef.current!.props.onFocus(focusEvent(trigger));
    });
    // Focus alone reveals the dossier unpinned: focus never moved into the tooltip node, so
    // the tooltip-node's own Escape handler (which only listens while focus is inside it)
    // never fires. This is the WCAG dismissible gap: Escape on the trigger has to close it.
    expect(container.querySelector(".cs-shared-tooltip")?.getAttribute("data-pinned")).toBe("false");
    expect(document.activeElement).toBe(trigger);

    await act(async () => {
      handleRef.current!.props.onKeyDown?.(keyEvent(trigger, "Escape"));
    });
    expect(container.querySelector(".cs-shared-tooltip")).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });

  it("never promotes the plain string tooltip: it stays role=tooltip even after Enter", async () => {
    const { container, handleRef, trigger } = await mount("The full description text.");
    await act(async () => {
      trigger.focus();
      handleRef.current!.props.onFocus(focusEvent(trigger));
    });
    await act(async () => {
      handleRef.current!.props.onKeyDown?.(keyEvent(trigger, "Enter"));
    });
    const tooltip = container.querySelector(".cs-shared-tooltip");
    expect(tooltip?.getAttribute("role")).toBe("tooltip");
    expect(tooltip?.hasAttribute("aria-label")).toBe(false);
  });
});

describe("dossier email copy control", () => {
  it("copies when the address is clicked and acknowledges it in place", async () => {
    const writeText = vi.fn(async () => undefined);
    vi.stubGlobal("navigator", { clipboard: { writeText } });

    const { container, handleRef, trigger } = await mount(dossier);
    // Focus opens with no delay (unlike hover's 90ms intent window); this test is about the
    // copy control, not the open-intent mechanic, so focus keeps it timer-free.
    await act(async () => {
      handleRef.current!.props.onFocus(focusEvent(trigger));
    });

    const copy = container.querySelector(".cs-dossier-email-copy") as HTMLButtonElement | null;
    expect(copy).toBeTruthy();
    expect(copy?.tagName).toBe("BUTTON");

    await act(async () => {
      copy!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(writeText).toHaveBeenCalledWith("ada@acme.ai");
    expect(copy?.textContent).toContain("Copied");
    expect(copy?.textContent).not.toContain("ada@acme.ai");
  });

  it("keeps the address visible when the Clipboard API is unavailable", async () => {
    vi.stubGlobal("navigator", {});

    const { container, handleRef, trigger } = await mount(dossier);
    await act(async () => {
      handleRef.current!.props.onFocus(focusEvent(trigger));
    });

    const copy = container.querySelector(".cs-dossier-email-copy") as HTMLButtonElement;
    await act(async () => {
      copy.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(copy.textContent).toContain("ada@acme.ai");
    expect(copy.textContent).not.toContain("Copied");
  });

  it("keeps the address visible when the clipboard write is rejected", async () => {
    const writeText = vi.fn(async () => {
      throw new Error("clipboard denied");
    });
    vi.stubGlobal("navigator", { clipboard: { writeText } });

    const { container, handleRef, trigger } = await mount(dossier);
    await act(async () => {
      handleRef.current!.props.onFocus(focusEvent(trigger));
    });

    const copy = container.querySelector(".cs-dossier-email-copy") as HTMLButtonElement;
    await act(async () => {
      copy.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(writeText).toHaveBeenCalledWith("ada@acme.ai");
    expect(copy.textContent).toContain("ada@acme.ai");
    expect(copy.textContent).not.toContain("Copied");
  });

  it("shows the basis only for inferred addresses", async () => {
    const inferred: TooltipDossier = {
      ...dossier,
      email: {
        address: "ada.lovelace@acme.ai",
        basis: "domain pattern first.last, 3 observed addresses",
        status: "inferred"
      }
    };
    const { container, handleRef, trigger } = await mount(inferred);
    await act(async () => {
      handleRef.current!.props.onFocus(focusEvent(trigger));
    });

    expect(container.querySelector(".cs-dossier-email-kind")?.textContent).toBe("Inferred");
    expect(container.querySelector(".cs-dossier-email-basis")?.textContent).toBe(
      "domain pattern first.last, 3 observed addresses"
    );
  });
});

describe("open intent", () => {
  it("(a) hover then leave at 50ms never opens the tooltip", async () => {
    vi.useFakeTimers();
    const { container, handleRef, trigger } = await mount("The full description text.");

    await act(async () => {
      handleRef.current!.props.onPointerEnter(pointerEvent(trigger));
    });
    await act(async () => {
      vi.advanceTimersByTime(50);
    });
    // Leaving before the 90ms intent timer fires cancels it silently: the tooltip must never
    // have opened at all, not open-then-instantly-close (no strobe).
    await act(async () => {
      handleRef.current!.props.onPointerLeave(pointerEvent(trigger));
    });
    expect(container.querySelector(".cs-shared-tooltip")).toBeNull();

    // The cancelled timer must never fire late, even once the original 90ms mark passes.
    await act(async () => {
      vi.advanceTimersByTime(200);
    });
    expect(container.querySelector(".cs-shared-tooltip")).toBeNull();
  });

  it("(b) hover past 90ms opens the tooltip", async () => {
    vi.useFakeTimers();
    const { container, handleRef, trigger } = await mount("The full description text.");

    await act(async () => {
      handleRef.current!.props.onPointerEnter(pointerEvent(trigger));
    });
    expect(container.querySelector(".cs-shared-tooltip")).toBeNull();

    await act(async () => {
      vi.advanceTimersByTime(120);
    });
    expect(container.querySelector(".cs-shared-tooltip")).toBeTruthy();
  });

  it("(c) focus opens the tooltip with no delay", async () => {
    vi.useFakeTimers();
    const { container, handleRef, trigger } = await mount(dossier);

    // No timer advance at all: focus/keyboard open is immediate, unlike hover.
    await act(async () => {
      handleRef.current!.props.onFocus(focusEvent(trigger));
    });
    expect(container.querySelector(".cs-shared-tooltip")).toBeTruthy();
  });
});

describe("docked mode", () => {
  it("(d) a docked trigger renders the tooltip with data-mode=\"docked\"", async () => {
    vi.useFakeTimers();
    const { container, handleRef, triggerA } = await mountDock();

    await act(async () => {
      handleRef.current!.aProps.onPointerEnter(pointerEvent(triggerA));
    });
    await act(async () => {
      vi.advanceTimersByTime(120);
    });

    expect(container.querySelector(".cs-shared-tooltip")?.getAttribute("data-mode")).toBe("docked");
  });

  it("(f) a plain-text trigger without an explicit mode stays in popover mode", async () => {
    const { container, handleRef, trigger } = await mount("The full description text.");

    await act(async () => {
      handleRef.current!.props.onFocus(focusEvent(trigger));
    });

    expect(container.querySelector(".cs-shared-tooltip")?.getAttribute("data-mode")).toBe("popover");
  });

  it("positions the docked region below the dock anchor, spanning the panel minus its margins, not the trigger's own popover clamp", async () => {
    vi.useFakeTimers();
    const { container, handleRef, triggerA } = await mountDock();

    await act(async () => {
      handleRef.current!.aProps.onPointerEnter(pointerEvent(triggerA));
    });
    await act(async () => {
      vi.advanceTimersByTime(120);
    });

    const tooltipEl = container.querySelector(".cs-shared-tooltip") as HTMLElement;
    // jsdom gives every unlaid-out element a zero rect, so the anchor's bottom edge is 0 and
    // window is the project's fixed 1024x768 jsdom default: top = 0 + the 6px dock gap, width
    // spans the panel minus 16px margins on each side, left sits at that same margin.
    expect(tooltipEl.style.top).toBe("6px");
    expect(tooltipEl.style.left).toBe("16px");
    expect(tooltipEl.style.width).toBe("992px");
  });

  it("recomputes the full docked geometry (left/width, not just top/maxHeight) on window resize", async () => {
    vi.useFakeTimers();
    const { container, handleRef, triggerA } = await mountDock();

    await act(async () => {
      handleRef.current!.aProps.onPointerEnter(pointerEvent(triggerA));
    });
    await act(async () => {
      vi.advanceTimersByTime(120);
    });

    const tooltipEl = container.querySelector(".cs-shared-tooltip") as HTMLElement;
    expect(tooltipEl.style.width).toBe("992px");

    // Simulate the side panel narrowing: left/width both derive from window.innerWidth, so a
    // resize-only listener (the pre-fix state, scroll-only) would leave them stale at 992px.
    vi.stubGlobal("innerWidth", 640);
    await act(async () => {
      window.dispatchEvent(new Event("resize"));
    });

    const resized = container.querySelector(".cs-shared-tooltip") as HTMLElement;
    expect(resized.style.width).toBe("608px");
    expect(resized.style.left).toBe("16px");
  });

  it("(g) retarget between two open docked triggers skips the intent delay and does not move the region", async () => {
    vi.useFakeTimers();
    const { container, handleRef, triggerA, triggerB } = await mountDock();
    // Give the two triggers different rects so "the region doesn't move" is a real assertion
    // about the docked anchor, not a coincidence of jsdom's identical zero rects: a popover-
    // style implementation that positioned off the trigger's own rect would show a different
    // top for A vs. B here.
    stubRect(triggerA, { bottom: 120, left: 20, top: 100, width: 200 });
    stubRect(triggerB, { bottom: 320, left: 20, top: 300, width: 200 });

    await act(async () => {
      handleRef.current!.aProps.onPointerEnter(pointerEvent(triggerA));
    });
    await act(async () => {
      vi.advanceTimersByTime(120);
    });
    const afterA = container.querySelector(".cs-shared-tooltip") as HTMLElement;
    expect(afterA.querySelector("strong")?.textContent).toBe("Ada Lovelace");
    const { top: topAfterA, left: leftAfterA } = afterA.style;

    await act(async () => {
      handleRef.current!.aProps.onPointerLeave(pointerEvent(triggerA));
    });
    // Hot retarget: entering the sibling trigger with the dock already open commits
    // immediately, with no intent-timer advance at all.
    await act(async () => {
      handleRef.current!.bProps.onPointerEnter(pointerEvent(triggerB));
    });

    const afterB = container.querySelector(".cs-shared-tooltip") as HTMLElement;
    expect(afterB.querySelector("strong")?.textContent).toBe("Grace Hopper");
    expect(afterB.style.top).toBe(topAfterA);
    expect(afterB.style.left).toBe(leftAfterA);
    expect(afterB.getAttribute("data-animate")).toBe("true");
  });

  it("does not mark a docked retarget as animated under reduced motion", async () => {
    vi.useFakeTimers();
    const { container, handleRef, triggerA, triggerB } = await mountDock(true);

    await act(async () => {
      handleRef.current!.aProps.onPointerEnter(pointerEvent(triggerA));
    });
    await act(async () => {
      vi.advanceTimersByTime(120);
    });
    await act(async () => {
      handleRef.current!.aProps.onPointerLeave(pointerEvent(triggerA));
    });
    await act(async () => {
      handleRef.current!.bProps.onPointerEnter(pointerEvent(triggerB));
    });

    // The 90ms open-intent delay is a timing device, not motion, and still gets skipped on
    // retarget; only the visual crossfade flag turns off.
    expect(container.querySelector(".cs-shared-tooltip")?.getAttribute("data-animate")).toBe("false");
  });

  it("preserves the 160ms close grace from a docked row into the dock", async () => {
    vi.useFakeTimers();
    const { container, handleRef, triggerA } = await mountDock();

    await act(async () => {
      handleRef.current!.aProps.onPointerEnter(pointerEvent(triggerA));
    });
    await act(async () => {
      vi.advanceTimersByTime(120);
    });
    expect(container.querySelector(".cs-shared-tooltip")).toBeTruthy();

    await act(async () => {
      handleRef.current!.aProps.onPointerLeave(pointerEvent(triggerA));
    });
    // The pointer is travelling from the row to the dock below it; entering the dock within
    // the 160ms grace window cancels the pending close (WCAG 1.4.13 hoverable).
    await act(async () => {
      handleRef.current!.interaction.onPointerEnter();
    });
    await act(async () => {
      vi.advanceTimersByTime(1000);
    });
    expect(container.querySelector(".cs-shared-tooltip")).toBeTruthy();

    await act(async () => {
      handleRef.current!.interaction.onPointerLeave();
    });
    await act(async () => {
      vi.advanceTimersByTime(1000);
    });
    expect(container.querySelector(".cs-shared-tooltip")).toBeNull();
  });
});

describe("click pin", () => {
  it("(e) click pins, a second click unpins, and Escape unpins and refocuses", async () => {
    const { container, handleRef, trigger } = await mount(dossier);

    await act(async () => {
      trigger.focus();
      handleRef.current!.props.onFocus(focusEvent(trigger));
    });
    expect(container.querySelector(".cs-shared-tooltip")?.getAttribute("data-pinned")).toBe("false");

    await act(async () => {
      handleRef.current!.props.onClick(clickEvent(trigger));
    });
    const pinnedTooltip = container.querySelector(".cs-shared-tooltip");
    expect(pinnedTooltip?.getAttribute("data-pinned")).toBe("true");
    // Pin is a semantic promotion: focus moves into the now-interactive dossier, and the
    // ARIA role promotes alongside it (role=tooltip is not allowed to hold focus).
    expect(pinnedTooltip?.contains(document.activeElement)).toBe(true);
    expect(pinnedTooltip?.getAttribute("role")).toBe("dialog");

    await act(async () => {
      handleRef.current!.props.onClick(clickEvent(trigger));
    });
    // Second click demotes the dossier back to its informational, unpinned state. It stays
    // open (the pointer is still over the row) rather than closing outright.
    expect(container.querySelector(".cs-shared-tooltip")?.getAttribute("data-pinned")).toBe("false");
    expect(container.querySelector(".cs-shared-tooltip")?.getAttribute("role")).toBe("tooltip");
    expect(container.querySelector(".cs-shared-tooltip")).toBeTruthy();

    // Re-pin via click, then confirm Escape still unpins and refocuses: the same keyboard-pin
    // parity the existing Enter path already covers, now also reachable via click.
    await act(async () => {
      handleRef.current!.props.onClick(clickEvent(trigger));
    });
    expect(container.querySelector(".cs-shared-tooltip")?.getAttribute("data-pinned")).toBe("true");

    await act(async () => {
      container.querySelector(".cs-shared-tooltip")?.dispatchEvent(
        new KeyboardEvent("keydown", { bubbles: true, key: "Escape" })
      );
    });
    expect(document.activeElement).toBe(trigger);
    expect(container.querySelector(".cs-shared-tooltip")?.getAttribute("data-pinned")).toBe("false");
  });

  it("does not pin on click for a plain-text (non-dossier) trigger", async () => {
    const { container, handleRef, trigger } = await mount("The full description text.");

    await act(async () => {
      handleRef.current!.props.onFocus(focusEvent(trigger));
    });
    await act(async () => {
      handleRef.current!.props.onClick(clickEvent(trigger));
    });

    expect(container.querySelector(".cs-shared-tooltip")?.getAttribute("data-pinned")).toBe("false");
  });

  it("ignores a hover on a sibling row while a dossier is pinned, so a passing hover never steals the pin", async () => {
    vi.useFakeTimers();
    const { container, handleRef, triggerA, triggerB } = await mountDock();

    await act(async () => {
      handleRef.current!.aProps.onClick(clickEvent(triggerA));
    });
    expect(container.querySelector(".cs-shared-tooltip")?.getAttribute("data-pinned")).toBe("true");

    await act(async () => {
      handleRef.current!.bProps.onPointerEnter(pointerEvent(triggerB));
    });
    await act(async () => {
      vi.advanceTimersByTime(200);
    });

    const tooltip = container.querySelector(".cs-shared-tooltip");
    expect(tooltip?.getAttribute("data-pinned")).toBe("true");
    expect(tooltip?.querySelector("strong")?.textContent).toBe("Ada Lovelace");
  });
});
