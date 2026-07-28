import { activeTabDomain } from "./shared/domain";
import {
  alphaInviteOrigin,
  buildBootstrapRequest,
  defaultApiOrigin,
  isTrustedAlphaInviteSender,
  parseAlphaInviteExternalMessage,
  parseBootstrapResponse,
  resolveStoredSettings,
  type AlphaInviteExternalMessage,
  type AlphaInviteExternalResponse,
  type Settings
} from "./shared/extension-config";
import {
  alphaConnectionStatus,
  alphaExternalError,
  API_ORIGIN_KEY,
  API_TOKEN_KEY,
  connectAlphaInvitation,
  PENDING_LIFECYCLE_KEY,
  pendingLifecycleEvents,
  storageLocalGet,
  storageLocalSet,
  type PendingLifecycleEvent
} from "./shared/alpha-connect";
import { writeCachedCard } from "./shared/card-cache";
import { enqueueAlphaEvent } from "./shared/alpha-analytics";

const DEFAULT_API_ORIGIN = defaultApiOrigin(import.meta.env);
const ALPHA_INVITE_ORIGIN = alphaInviteOrigin(import.meta.env);
const STORAGE_KEYS = [API_ORIGIN_KEY, API_TOKEN_KEY] as const;

chrome.runtime.onInstalled.addListener((details) => {
  // Chrome-only: Firefox has no sidePanel API; its click behavior comes from the
  // sidebar_action manifest key plus the adapter in the click handler below.
  if ("sidePanel" in chrome) {
    void chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: false });
  }
  void recordExtensionLifecycle(details);
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
  // The tab and window ids feed the Firefox stale-tab hint: the sidebar stays open
  // across tab switches there, so the panel compares tabs.onActivated payloads (ids
  // only, no permission) against the tab this research click landed on.
  void chrome.storage.session.set({
    activeDomain,
    lastResearchTabId: tab.id ?? null,
    lastResearchWindowId: tab.windowId ?? null
  });
  void readSettings().then((settings) =>
    enqueueAlphaEvent(settings, "extension.action_invoked", {}, "background")
  );
  if (activeDomain) {
    void prefetchBootstrap(activeDomain);
  }
});

chrome.runtime.onMessageExternal.addListener((unknownMessage, sender, sendResponse) => {
  if (!isTrustedAlphaInviteSender(sender.url, ALPHA_INVITE_ORIGIN)) {
    return false;
  }

  const message = parseAlphaInviteExternalMessage(unknownMessage);
  if (!message) {
    sendResponse(alphaExternalError("unknown"));
    return false;
  }

  void handleAlphaExternalMessage(message).then(sendResponse);
  return true;
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

async function recordExtensionLifecycle(details: chrome.runtime.InstalledDetails) {
  const event: PendingLifecycleEvent | null = details.reason === "install"
    ? { eventName: "extension.installed" }
    : details.reason === "update" && details.previousVersion
      ? { eventName: "extension.updated", previousVersion: details.previousVersion }
      : null;
  if (!event) {
    return;
  }

  const settings = await readSettings();
  if (settings.apiToken) {
    if (event.eventName === "extension.installed") {
      await enqueueAlphaEvent(settings, event.eventName, {}, "background");
    } else {
      await enqueueAlphaEvent(
        settings,
        event.eventName,
        { previousVersion: event.previousVersion },
        "background"
      );
    }
    return;
  }

  const stored = await storageLocalGet([PENDING_LIFECYCLE_KEY]);
  await storageLocalSet({
    [PENDING_LIFECYCLE_KEY]: [...pendingLifecycleEvents(stored[PENDING_LIFECYCLE_KEY]), event].slice(-4)
  });
}

async function handleAlphaExternalMessage(
  message: AlphaInviteExternalMessage
): Promise<AlphaInviteExternalResponse> {
  return message.type === "cold-start.alpha.status"
    ? alphaConnectionStatus()
    : connectAlphaInvitation({
        inviteToken: message.inviteToken,
        storeVisited: message.storeVisited,
        reducedMotion: message.reducedMotion,
        theme: message.theme
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

