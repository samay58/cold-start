import { useEffect, useState } from "react";

// Firefox only: the sidebar is window-scoped and stays open across tab switches, so
// it can show a company that no longer matches the current tab. The hint compares
// tabs.onActivated payloads (tab and window ids only; the event needs no permission
// and the panel never reads the new tab's URL or title) against the tab recorded at
// the last toolbar click. Chrome's per-tab panel closes on tab switch, so the
// sidePanel feature gate keeps this dormant there.

type TabActivation = { tabId: number; windowId: number };

type StaleTabRuntime = {
  sidePanel?: unknown;
  tabs?: {
    onActivated?: {
      addListener: (listener: (info: TabActivation) => void) => void;
      removeListener: (listener: (info: TabActivation) => void) => void;
    };
  };
  windows?: {
    getCurrent: (callback: (window: { id?: number }) => void) => void;
  };
  storage?: {
    session?: {
      get: (key: string, callback: (items: Record<string, unknown>) => void) => void;
    };
    onChanged?: {
      addListener: (listener: (changes: Record<string, unknown>, areaName: string) => void) => void;
      removeListener: (listener: (changes: Record<string, unknown>, areaName: string) => void) => void;
    };
  };
};

function useStaleTab(): boolean {
  const [stale, setStale] = useState(false);

  useEffect(() => {
    const runtime = (globalThis as { chrome?: StaleTabRuntime }).chrome;
    if (
      !runtime ||
      "sidePanel" in runtime ||
      !runtime.tabs?.onActivated ||
      !runtime.windows ||
      !runtime.storage?.session ||
      !runtime.storage.onChanged
    ) {
      return undefined;
    }

    const { onActivated } = runtime.tabs;
    const { session, onChanged } = runtime.storage;
    let disposed = false;
    let panelWindowId: number | null = null;
    // windows.getCurrent needs no permission; the panel document's window is the
    // one whose tab strip the hint watches.
    runtime.windows.getCurrent((panelWindow) => {
      if (!disposed) {
        panelWindowId = panelWindow.id ?? null;
      }
    });

    const handleActivated = (info: TabActivation) => {
      if (panelWindowId === null || info.windowId !== panelWindowId) {
        return;
      }
      session.get("lastResearchTabId", (items) => {
        if (disposed) {
          return;
        }
        const lastResearchTabId =
          typeof items.lastResearchTabId === "number" ? items.lastResearchTabId : null;
        setStale(lastResearchTabId !== null && info.tabId !== lastResearchTabId);
      });
    };

    // A new toolbar click rewrites lastResearchTabId, which by definition matches
    // the tab the user is looking at, so the hint clears.
    const handleStorageChange = (changes: Record<string, unknown>, areaName: string) => {
      if (!disposed && areaName === "session" && "lastResearchTabId" in changes) {
        setStale(false);
      }
    };

    onActivated.addListener(handleActivated);
    onChanged.addListener(handleStorageChange);
    return () => {
      disposed = true;
      onActivated.removeListener(handleActivated);
      onChanged.removeListener(handleStorageChange);
    };
  }, []);

  return stale;
}

export function StaleTabHint() {
  const stale = useStaleTab();
  if (!stale) {
    return null;
  }
  return (
    <p className="cs-stale-tab-hint" role="status">
      Different tab. Click the Cold Start button in the toolbar to research it.
    </p>
  );
}
