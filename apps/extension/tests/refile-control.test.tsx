// @vitest-environment jsdom

import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RefileControl } from "../src/company/RefileControl";

let cleanup: (() => Promise<void>) | null = null;

async function mount(node: React.ReactElement) {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(node);
  });
  cleanup = async () => {
    await act(async () => root.unmount());
    container.remove();
  };
  return container;
}

function handlers() {
  return {
    onHoldAbandoned: vi.fn(),
    onHoldStarted: vi.fn(),
    onRefile: vi.fn()
  };
}

async function dispatch(target: Element, event: Event) {
  await act(async () => {
    target.dispatchEvent(event);
  });
}

function pointer(type: string) {
  return new MouseEvent(type, { bubbles: true });
}

function key(type: string, keyName: string, repeat = false) {
  return new KeyboardEvent(type, { bubbles: true, key: keyName, repeat });
}

async function advance(ms: number) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

function refileButton(container: HTMLElement) {
  const button = container.querySelector<HTMLButtonElement>("button.cs-refile");
  expect(button).toBeTruthy();
  return button as HTMLButtonElement;
}

describe("RefileControl", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(async () => {
    await cleanup?.();
    cleanup = null;
    vi.useRealTimers();
  });

  it("labels the control for holding and carries the Re-file word", async () => {
    const callbacks = handlers();
    const container = await mount(<RefileControl {...callbacks} prefersReducedMotion={false} />);

    const button = refileButton(container);
    expect(button.getAttribute("aria-label")).toBe("Re-file this profile. Hold to confirm.");
    expect(button.textContent).toContain("Re-file");
  });

  it("fires onRefile exactly once when the hold reaches full before release", async () => {
    const callbacks = handlers();
    const container = await mount(<RefileControl {...callbacks} prefersReducedMotion={false} />);
    const button = refileButton(container);

    await dispatch(button, pointer("pointerdown"));
    expect(callbacks.onHoldStarted).toHaveBeenCalledTimes(1);
    await advance(750);
    await dispatch(button, pointer("pointerup"));

    expect(callbacks.onRefile).toHaveBeenCalledTimes(1);
    expect(callbacks.onHoldAbandoned).not.toHaveBeenCalled();

    // A stray release without a live press never fires again.
    await dispatch(button, pointer("pointerup"));
    expect(callbacks.onRefile).toHaveBeenCalledTimes(1);
  });

  it("abandons an early release without firing", async () => {
    const callbacks = handlers();
    const container = await mount(<RefileControl {...callbacks} prefersReducedMotion={false} />);
    const button = refileButton(container);

    await dispatch(button, pointer("pointerdown"));
    await advance(300);
    await dispatch(button, pointer("pointerup"));

    expect(callbacks.onHoldAbandoned).toHaveBeenCalledTimes(1);
    expect(callbacks.onRefile).not.toHaveBeenCalled();
  });

  it("treats pointerleave mid-hold as an early release", async () => {
    const callbacks = handlers();
    const container = await mount(<RefileControl {...callbacks} prefersReducedMotion={false} />);
    const button = refileButton(container);

    await dispatch(button, pointer("pointerdown"));
    await advance(300);
    // React synthesizes onPointerLeave from a native pointerout whose relatedTarget sits
    // outside the element.
    await dispatch(button, new MouseEvent("pointerout", { bubbles: true, relatedTarget: document.body }));

    expect(callbacks.onHoldAbandoned).toHaveBeenCalledTimes(1);
    expect(callbacks.onRefile).not.toHaveBeenCalled();

    await dispatch(button, pointer("pointerup"));
    expect(callbacks.onHoldAbandoned).toHaveBeenCalledTimes(1);
    expect(callbacks.onRefile).not.toHaveBeenCalled();
  });

  it("cancels the hold on Escape even after the fill reached full", async () => {
    const callbacks = handlers();
    const container = await mount(<RefileControl {...callbacks} prefersReducedMotion={false} />);
    const button = refileButton(container);

    await dispatch(button, pointer("pointerdown"));
    await advance(750);
    await dispatch(button, key("keydown", "Escape"));

    expect(callbacks.onHoldAbandoned).toHaveBeenCalledTimes(1);
    expect(callbacks.onRefile).not.toHaveBeenCalled();
  });

  it("runs a keyboard hold on Space with a key-repeat guard", async () => {
    const callbacks = handlers();
    const container = await mount(<RefileControl {...callbacks} prefersReducedMotion={false} />);
    const button = refileButton(container);

    await dispatch(button, key("keydown", " "));
    expect(callbacks.onHoldStarted).toHaveBeenCalledTimes(1);

    // Key repeat must not restart the fill or re-announce the hold.
    await dispatch(button, key("keydown", " ", true));
    await dispatch(button, key("keydown", " "));
    expect(callbacks.onHoldStarted).toHaveBeenCalledTimes(1);

    await advance(750);
    await dispatch(button, key("keyup", " "));

    expect(callbacks.onRefile).toHaveBeenCalledTimes(1);
    expect(callbacks.onHoldAbandoned).not.toHaveBeenCalled();
  });

  it("renders disabled with the reason as accessible text and fires nothing", async () => {
    const callbacks = handlers();
    const container = await mount(
      <RefileControl
        {...callbacks}
        disabled
        disabledReason="This invitation has used its fresh profile runs."
        prefersReducedMotion={false}
      />
    );

    const button = refileButton(container);
    expect(button.disabled).toBe(true);
    expect(container.textContent).toContain("This invitation has used its fresh profile runs.");

    await dispatch(button, pointer("pointerdown"));
    await advance(750);
    await dispatch(button, pointer("pointerup"));

    expect(callbacks.onHoldStarted).not.toHaveBeenCalled();
    expect(callbacks.onRefile).not.toHaveBeenCalled();
    expect(callbacks.onHoldAbandoned).not.toHaveBeenCalled();
  });
});
