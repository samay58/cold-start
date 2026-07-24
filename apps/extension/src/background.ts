import {
  COLD_START_API_CONTRACT_VERSION,
  COLD_START_CLIENT_CONTRACT_HEADER
} from "@cold-start/core";
import { activeTabDomain } from "./shared/domain";
import {
  alphaInviteOrigin,
  ALPHA_INSTALLATION_SUFFIX_STORAGE_KEY,
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
import { writeCachedCard } from "./shared/card-cache";
import { enqueueAlphaEvent } from "./shared/alpha-analytics";

const DEFAULT_API_ORIGIN = defaultApiOrigin(import.meta.env);
const ALPHA_INVITE_ORIGIN = alphaInviteOrigin(import.meta.env);
const API_ORIGIN_KEY = "coldStartApiOrigin";
const API_TOKEN_KEY = "coldStartApiToken";
const INSTALL_CHANNEL_KEY = "coldStartInstallChannel";
const PENDING_LIFECYCLE_KEY = "coldStartPendingLifecycleEvents";
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
  void chrome.storage.session.set({ activeDomain });
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

function storageLocalGet(keys: readonly string[]): Promise<Record<string, unknown>> {
  return new Promise((resolve) => {
    chrome.storage.local.get([...keys], (items) => resolve(items));
  });
}

function storageLocalSet(items: Record<string, unknown>): Promise<void> {
  return new Promise((resolve, reject) => {
    chrome.storage.local.set(items, () => {
      const error = chrome.runtime.lastError;
      if (error) {
        reject(new Error("extension storage unavailable"));
        return;
      }
      resolve();
    });
  });
}

function setTrustedStorageAccess(): Promise<void> {
  return chrome.storage.local.setAccessLevel({ accessLevel: "TRUSTED_CONTEXTS" });
}

function extensionVersion() {
  return chrome.runtime.getManifest().version;
}

function alphaOfflineCode() {
  return typeof navigator !== "undefined" && navigator.onLine === false
    ? "offline" as const
    : "unknown" as const;
}

type PendingLifecycleEvent =
  | { eventName: "extension.installed" }
  | { eventName: "extension.updated"; previousVersion: string };

function pendingLifecycleEvents(value: unknown): PendingLifecycleEvent[] {
  if (!Array.isArray(value)) {
    return [];
  }
  const pending: PendingLifecycleEvent[] = [];
  for (const candidate of value) {
    if (!candidate || typeof candidate !== "object") {
      continue;
    }
    const event = candidate as Record<string, unknown>;
    if (event.eventName === "extension.installed") {
      pending.push({ eventName: "extension.installed" });
      continue;
    }
    if (
      event.eventName === "extension.updated" &&
      typeof event.previousVersion === "string" &&
      /^\d+(?:\.\d+){0,3}$/.test(event.previousVersion)
    ) {
      pending.push({
        eventName: "extension.updated",
        previousVersion: event.previousVersion
      });
    }
  }
  return pending.slice(-4);
}

async function flushPendingLifecycle(settings: Settings) {
  if (!settings.apiToken) {
    return;
  }
  const stored = await storageLocalGet([PENDING_LIFECYCLE_KEY]);
  const pending = pendingLifecycleEvents(stored[PENDING_LIFECYCLE_KEY]);
  for (const event of pending) {
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
  }
  if (pending.length > 0) {
    await storageLocalSet({ [PENDING_LIFECYCLE_KEY]: [] });
  }
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

function alphaHeaders(apiToken?: string) {
  return {
    "Content-Type": "application/json",
    "X-Cold-Start-Extension-Id": chrome.runtime.id,
    "X-Cold-Start-Extension-Version": extensionVersion(),
    [COLD_START_CLIENT_CONTRACT_HEADER]: COLD_START_API_CONTRACT_VERSION,
    ...(apiToken ? { Authorization: `Bearer ${apiToken}` } : {})
  };
}

function alphaExternalError(
  code: Extract<AlphaInviteExternalResponse, { ok: false }>["code"]
): AlphaInviteExternalResponse {
  return { ok: false, code, extensionVersion: extensionVersion() };
}

function safeAlphaResponse(value: unknown): AlphaInviteExternalResponse | null {
  if (!value || typeof value !== "object") {
    return null;
  }
  const candidate = value as Record<string, unknown>;
  const version = extensionVersion();

  if (candidate.ok === false && typeof candidate.code === "string") {
    const allowedCodes = new Set([
      "access_disabled",
      "connection_lost",
      "expired",
      "installation_limit",
      "invalid_invite",
      "offline",
      "revoked",
      "update_required",
      "used",
      "unknown"
    ]);
    return allowedCodes.has(candidate.code)
      ? alphaExternalError(candidate.code as Extract<AlphaInviteExternalResponse, { ok: false }>["code"])
      : alphaExternalError("unknown");
  }

  if (candidate.ok !== true || candidate.state !== "connected") {
    return null;
  }

  const compatibility =
    candidate.compatibility === "old_supported" ? "old_supported" :
    candidate.compatibility === "current" ? "current" :
    undefined;
  const allowance = safeAllowance(candidate.allowance);
  const installationSuffix =
    typeof candidate.installationSuffix === "string" &&
    /^[A-Za-z0-9_-]{6}$/.test(candidate.installationSuffix)
      ? candidate.installationSuffix
      : undefined;
  return {
    ok: true,
    state: "connected",
    extensionVersion: version,
    ...(installationSuffix ? { installationSuffix } : {}),
    ...(compatibility ? { compatibility } : {}),
    ...(typeof candidate.generationEnabled === "boolean"
      ? { generationEnabled: candidate.generationEnabled }
      : {}),
    ...(allowance ? { allowance } : {})
  };
}

function safeAllowance(value: unknown) {
  if (!value || typeof value !== "object") {
    return null;
  }
  const candidate = value as Record<string, unknown>;
  const profile = safeAllowanceCounter(candidate.profile);
  const lens = safeAllowanceCounter(candidate.lens);
  return profile && lens ? { profile, lens } : null;
}

function safeAllowanceCounter(value: unknown) {
  if (!value || typeof value !== "object") {
    return null;
  }
  const candidate = value as Record<string, unknown>;
  return Number.isInteger(candidate.limit) &&
    Number(candidate.limit) >= 0 &&
    Number.isInteger(candidate.remaining) &&
    Number(candidate.remaining) >= 0
    ? { limit: Number(candidate.limit), remaining: Number(candidate.remaining) }
    : null;
}

async function alphaResponseFromFetch(response: Response): Promise<AlphaInviteExternalResponse> {
  const body = await response.json().catch(() => null);
  const parsed = safeAlphaResponse(body);
  if (parsed) {
    return parsed;
  }
  if (response.status === 401 || response.status === 403) {
    return alphaExternalError("connection_lost");
  }
  if (response.status === 426) {
    return alphaExternalError("update_required");
  }
  if (response.status === 503) {
    return alphaExternalError("access_disabled");
  }
  return alphaExternalError("unknown");
}

async function alphaConnectionStatus(): Promise<AlphaInviteExternalResponse> {
  const stored = await storageLocalGet([API_TOKEN_KEY]);
  const apiToken = typeof stored[API_TOKEN_KEY] === "string" ? stored[API_TOKEN_KEY].trim() : "";
  if (!apiToken) {
    return {
      ok: true,
      state: "not_connected",
      extensionVersion: extensionVersion()
    };
  }

  try {
    const response = await fetch(`${DEFAULT_API_ORIGIN}/api/alpha/invite/status`, {
      method: "POST",
      headers: alphaHeaders(apiToken),
      body: JSON.stringify({ clientContract: COLD_START_API_CONTRACT_VERSION })
    });
    const status = await alphaResponseFromFetch(response);
    if (status.ok && status.installationSuffix) {
      await storageLocalSet({
        [ALPHA_INSTALLATION_SUFFIX_STORAGE_KEY]: status.installationSuffix
      });
    }
    return status;
  } catch {
    return alphaExternalError(alphaOfflineCode());
  }
}

async function connectAlphaInvitation(
  message: Extract<AlphaInviteExternalMessage, { type: "cold-start.alpha.connect" }>
): Promise<AlphaInviteExternalResponse> {
  try {
    const response = await fetch(`${DEFAULT_API_ORIGIN}/api/alpha/invite/redeem`, {
      method: "POST",
      headers: alphaHeaders(),
      body: JSON.stringify({
        inviteToken: message.inviteToken,
        browser: "chrome",
        channel: "unlisted",
        extensionVersion: extensionVersion(),
        clientContract: COLD_START_API_CONTRACT_VERSION,
        consent: true,
        storeVisited: message.storeVisited,
        reducedMotion: message.reducedMotion,
        theme: message.theme
      })
    });
    const body = await response.json().catch(() => null) as Record<string, unknown> | null;
    if (!response.ok) {
      return alphaResponseFromFetch(new Response(JSON.stringify(body), {
        status: response.status,
        headers: { "Content-Type": "application/json" }
      }));
    }

    const apiToken = typeof body?.accessToken === "string" ? body.accessToken : "";
    if (!apiToken) {
      return alphaExternalError("unknown");
    }
    const safeResponse = safeAlphaResponse(body);
    if (!safeResponse?.ok) {
      return alphaExternalError("unknown");
    }

    await setTrustedStorageAccess();
    await storageLocalSet({
      [API_ORIGIN_KEY]: DEFAULT_API_ORIGIN,
      [API_TOKEN_KEY]: apiToken,
      ...(safeResponse.installationSuffix
        ? { [ALPHA_INSTALLATION_SUFFIX_STORAGE_KEY]: safeResponse.installationSuffix }
        : {}),
      [INSTALL_CHANNEL_KEY]: "unlisted"
    });
    await flushPendingLifecycle({ apiOrigin: DEFAULT_API_ORIGIN, apiToken });
    return safeResponse;
  } catch {
    return alphaExternalError(alphaOfflineCode());
  }
}

async function handleAlphaExternalMessage(
  message: AlphaInviteExternalMessage
): Promise<AlphaInviteExternalResponse> {
  return message.type === "cold-start.alpha.status"
    ? alphaConnectionStatus()
    : connectAlphaInvitation(message);
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
