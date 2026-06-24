import { activeTabDomain } from "./domain";
import {
  buildBootstrapRequest,
  defaultApiOrigin,
  parseBootstrapResponse,
  resolveStoredSettings,
  type Settings
} from "./extension-config";
import { writeCachedCard } from "./card-cache";
import { DARK_READER_STORAGE_KEY, darkReaderSignalFromProbe, detectDarkReader } from "./dark-reader-bridge";

const DEFAULT_API_ORIGIN = defaultApiOrigin(import.meta.env);
const STORAGE_KEYS = ["coldStartApiOrigin", "coldStartApiToken"] as const;

chrome.runtime.onInstalled.addListener(() => {
  void chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: false });
});

chrome.action.onClicked.addListener((tab) => {
  if (tab.id !== undefined) {
    void chrome.sidePanel.open({ tabId: tab.id });
    void probeDarkReader(tab.id);
  }

  const activeDomain = activeTabDomain(tab.url);
  void chrome.storage.session.set({ activeDomain });
  if (activeDomain) {
    void prefetchBootstrap(activeDomain);
  }
});

/*
 * Probe the active tab for Dark Reader and store the signal for the panel. The
 * activeTab grant covers the tab whose action opened the panel; switching tabs
 * or restricted pages (chrome://, extension pages, Web Store) make the script
 * throw, which resolves to "unknown" and falls through to OS + manual.
 */
async function probeDarkReader(tabId: number | undefined) {
  if (tabId === undefined || !chrome.scripting?.executeScript) {
    await chrome.storage.session.set({ [DARK_READER_STORAGE_KEY]: "unknown" });
    return;
  }
  try {
    const [frame] = await chrome.scripting.executeScript({ target: { tabId }, func: detectDarkReader });
    await chrome.storage.session.set({ [DARK_READER_STORAGE_KEY]: darkReaderSignalFromProbe(frame?.result) });
  } catch {
    await chrome.storage.session.set({ [DARK_READER_STORAGE_KEY]: "unknown" });
  }
}

async function probeActiveTabDarkReader() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    await probeDarkReader(tab?.id);
  } catch {
    await chrome.storage.session.set({ [DARK_READER_STORAGE_KEY]: "unknown" });
  }
}

chrome.tabs.onActivated.addListener(({ tabId }) => {
  void probeDarkReader(tabId);
});

chrome.tabs.onUpdated.addListener((tabId, info, tab) => {
  if (info.status === "complete" && tab.active) {
    void probeDarkReader(tabId);
  }
});

chrome.runtime.onMessage.addListener((message) => {
  if (message?.type === "coldStart:probeDarkReader") {
    void probeActiveTabDarkReader();
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
