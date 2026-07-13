import { activeTabDomain } from "./domain";
import {
  buildBootstrapRequest,
  defaultApiOrigin,
  parseBootstrapResponse,
  resolveStoredSettings,
  type Settings
} from "./extension-config";
import { writeCachedCard } from "./card-cache";

const DEFAULT_API_ORIGIN = defaultApiOrigin(import.meta.env);
const STORAGE_KEYS = ["coldStartApiOrigin", "coldStartApiToken"] as const;

chrome.runtime.onInstalled.addListener(() => {
  // Chrome-only: Firefox has no sidePanel API; its click behavior comes from the
  // sidebar_action manifest key plus the adapter in the click handler below.
  if ("sidePanel" in chrome) {
    void chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: false });
  }
});

chrome.action.onClicked.addListener((tab) => {
  // Firefox loses the user gesture if anything async runs first, so the sidebar
  // open must be the first, synchronous statement of this handler. Repeat clicks
  // while the sidebar is already open are a no-op (Chrome parity).
  if (!("sidePanel" in chrome)) {
    void browser.sidebarAction.open();
  } else if (tab.id !== undefined) {
    void chrome.sidePanel.open({ tabId: tab.id });
  }

  const activeDomain = activeTabDomain(tab.url);
  void chrome.storage.session.set({ activeDomain });
  if (activeDomain) {
    void prefetchBootstrap(activeDomain);
  }
});

function readSettings(): Promise<Settings> {
  return new Promise((resolve) => {
    chrome.storage.local.get([...STORAGE_KEYS], (items) => {
      const storedOrigin = typeof items.coldStartApiOrigin === "string" ? items.coldStartApiOrigin.trim() : "";
      const storedToken = typeof items.coldStartApiToken === "string" ? items.coldStartApiToken.trim() : "";
      resolve(resolveStoredSettings({ apiOrigin: storedOrigin, apiToken: storedToken }, DEFAULT_API_ORIGIN).settings);
    });
  });
}

async function prefetchBootstrap(domain: string) {
  const settings = await readSettings();
  if (!settings.apiToken) {
    return;
  }

  try {
    const request = buildBootstrapRequest(domain, settings, undefined, chrome.runtime.id);
    const response = await fetch(request.url, request.init);
    const bootstrap = await parseBootstrapResponse(response);
    if (bootstrap.card) {
      await writeCachedCard(domain, settings, bootstrap.card);
    }
  } catch {
    // Prefetch is opportunistic. The side panel owns visible errors.
  }
}
