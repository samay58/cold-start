// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { StaleTabHint } from "../src/shared/StaleTabHint";

const HINT_TEXT = "Different tab. Click the Cold Start button in the toolbar to research it.";

type ActivatedListener = (info: { tabId: number; windowId: number }) => void;
type StorageListener = (changes: Record<string, { newValue?: unknown }>, areaName: string) => void;

function installFirefoxChrome({
  lastResearchTabId = 7,
  panelWindowId = 3
}: { lastResearchTabId?: number | null; panelWindowId?: number } = {}) {
  const activatedListeners: ActivatedListener[] = [];
  const storageListeners: StorageListener[] = [];
  const sessionItems: Record<string, unknown> = { lastResearchTabId };

  vi.stubGlobal("chrome", {
    // No sidePanel key: this is the Firefox shape the hint gates on.
    tabs: {
      onActivated: {
        addListener: (listener: ActivatedListener) => activatedListeners.push(listener),
        removeListener: (listener: ActivatedListener) => {
          const index = activatedListeners.indexOf(listener);
          if (index >= 0) {
            activatedListeners.splice(index, 1);
          }
        }
      }
    },
    windows: {
      getCurrent: (callback: (window: { id?: number }) => void) => callback({ id: panelWindowId })
    },
    storage: {
      session: {
        get: (_key: string, callback: (items: Record<string, unknown>) => void) =>
          callback({ ...sessionItems })
      },
      onChanged: {
        addListener: (listener: StorageListener) => storageListeners.push(listener),
        removeListener: (listener: StorageListener) => {
          const index = storageListeners.indexOf(listener);
          if (index >= 0) {
            storageListeners.splice(index, 1);
          }
        }
      }
    }
  });

  return {
    activatedListeners,
    activateTab: (info: { tabId: number; windowId: number }) => {
      act(() => {
        for (const listener of [...activatedListeners]) {
          listener(info);
        }
      });
    },
    recordResearchClick: (tabId: number) => {
      sessionItems.lastResearchTabId = tabId;
      act(() => {
        for (const listener of [...storageListeners]) {
          listener({ lastResearchTabId: { newValue: tabId } }, "session");
        }
      });
    }
  };
}

describe("StaleTabHint", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
  });

  afterEach(() => {
    act(() => {
      root?.unmount();
    });
    container.remove();
    vi.unstubAllGlobals();
  });

  function render() {
    act(() => {
      root = createRoot(container);
      root.render(<StaleTabHint />);
    });
  }

  it("renders nothing before any tab activation (zero state)", () => {
    installFirefoxChrome();
    render();

    expect(container.textContent).toBe("");
  });

  it("shows the hint when a different tab activates in the panel's window", () => {
    const harness = installFirefoxChrome({ lastResearchTabId: 7, panelWindowId: 3 });
    render();

    harness.activateTab({ tabId: 9, windowId: 3 });

    expect(container.textContent).toContain(HINT_TEXT);
  });

  it("ignores activations in other windows", () => {
    const harness = installFirefoxChrome({ lastResearchTabId: 7, panelWindowId: 3 });
    render();

    harness.activateTab({ tabId: 9, windowId: 4 });

    expect(container.textContent).toBe("");
  });

  it("clears the hint when the researched tab activates again", () => {
    const harness = installFirefoxChrome({ lastResearchTabId: 7, panelWindowId: 3 });
    render();

    harness.activateTab({ tabId: 9, windowId: 3 });
    expect(container.textContent).toContain(HINT_TEXT);

    harness.activateTab({ tabId: 7, windowId: 3 });
    expect(container.textContent).toBe("");
  });

  it("clears the hint when a new research click lands", () => {
    const harness = installFirefoxChrome({ lastResearchTabId: 7, panelWindowId: 3 });
    render();

    harness.activateTab({ tabId: 9, windowId: 3 });
    expect(container.textContent).toContain(HINT_TEXT);

    harness.recordResearchClick(9);
    expect(container.textContent).toBe("");
  });

  it("stays hidden when no research click has been recorded", () => {
    const harness = installFirefoxChrome({ lastResearchTabId: null, panelWindowId: 3 });
    render();

    harness.activateTab({ tabId: 9, windowId: 3 });

    expect(container.textContent).toBe("");
  });

  it("renders nothing and registers no tab listener on Chrome", () => {
    const harness = installFirefoxChrome();
    (globalThis.chrome as unknown as Record<string, unknown>).sidePanel = { open: vi.fn() };
    render();

    expect(harness.activatedListeners).toHaveLength(0);
    expect(container.textContent).toBe("");
  });
});
