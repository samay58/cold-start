// @vitest-environment jsdom

import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SharedTooltip, useSharedTooltip } from "../src/SharedTooltip";
import type { TooltipDossier, TooltipTriggerProps } from "../src/SharedTooltip";

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
    const { container, handleRef, trigger } = await mount(dossier);
    await act(async () => {
      handleRef.current!.props.onPointerEnter(pointerEvent(trigger));
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
});

describe("dossier email copy control", () => {
  it("copies when the address is clicked and acknowledges it in place", async () => {
    const writeText = vi.fn(async () => undefined);
    vi.stubGlobal("navigator", { clipboard: { writeText } });

    const { container, handleRef, trigger } = await mount(dossier);
    await act(async () => {
      handleRef.current!.props.onPointerEnter(pointerEvent(trigger));
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
      handleRef.current!.props.onPointerEnter(pointerEvent(trigger));
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
      handleRef.current!.props.onPointerEnter(pointerEvent(trigger));
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
      handleRef.current!.props.onPointerEnter(pointerEvent(trigger));
    });

    expect(container.querySelector(".cs-dossier-email-kind")?.textContent).toBe("Inferred");
    expect(container.querySelector(".cs-dossier-email-basis")?.textContent).toBe(
      "domain pattern first.last, 3 observed addresses"
    );
  });
});
