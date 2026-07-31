import {
  COLD_START_API_CONTRACT_VERSION,
  COLD_START_CLIENT_CONTRACT_HEADER,
  INVITE_TOKEN_PATTERN
} from "@cold-start/core";
import {
  ALPHA_INSTALLATION_SUFFIX_STORAGE_KEY,
  defaultApiOrigin,
  type AlphaInviteExternalResponse,
  type Settings
} from "./extension-config";
import { enqueueAlphaEvent } from "./alpha-analytics";

// One redemption implementation for both entry points: Chrome connects through the
// invite page's external message into the background, Firefox has no page-to-extension
// messaging (Bugzilla 1319168) so its panel collects the invitation and redeems here
// directly. Both paths run only after an affirmative user action on a surface that
// shows the public-card disclosure, which is what the consent flag asserts.

const DEFAULT_API_ORIGIN = defaultApiOrigin(import.meta.env);

export const API_ORIGIN_KEY = "coldStartApiOrigin";
export const API_TOKEN_KEY = "coldStartApiToken";
const INSTALL_CHANNEL_KEY = "coldStartInstallChannel";
export const PENDING_LIFECYCLE_KEY = "coldStartPendingLifecycleEvents";

export function detectedAlphaBrowser(): "chrome" | "firefox" {
  return "sidePanel" in chrome ? "chrome" : "firefox";
}

// Mirrors the invite page's fragment parsing (inviteTokenFromHash in apps/web):
// the Firefox panel accepts the whole invitation link or the bare code, since the
// tester pastes whatever they have at hand. The pattern itself lives in core so
// all entry points accept the same token shapes.

export function inviteTokenFromInput(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) {
    return null;
  }
  const hashIndex = trimmed.indexOf("#");
  const fragment = hashIndex >= 0 ? trimmed.slice(hashIndex + 1) : trimmed;
  const candidate = fragment.startsWith("invite=")
    ? new URLSearchParams(fragment).get("invite") ?? ""
    : fragment;
  return INVITE_TOKEN_PATTERN.test(candidate) ? candidate : null;
}

export function storageLocalGet(keys: readonly string[]): Promise<Record<string, unknown>> {
  return new Promise((resolve) => {
    chrome.storage.local.get([...keys], (items) => resolve(items));
  });
}

export function storageLocalSet(items: Record<string, unknown>): Promise<void> {
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

// Firefox's storage schema has no setAccessLevel on storage.local (only
// get/set/remove/clear), so this hardening call is strictly best-effort. It must
// never fail a connect: the redeem is already consumed server-side by the time
// this runs, and an exception here once burned a single-use invite (2026-07-28).
async function setTrustedStorageAccess(): Promise<void> {
  const area = chrome.storage.local as typeof chrome.storage.local & {
    setAccessLevel?: (details: { accessLevel: "TRUSTED_CONTEXTS" }) => Promise<void>;
  };
  if (typeof area.setAccessLevel !== "function") {
    return;
  }
  try {
    await area.setAccessLevel({ accessLevel: "TRUSTED_CONTEXTS" });
  } catch {
    // Restricting content-script visibility is defense-in-depth; the extension
    // registers no content scripts, so a refusal here changes nothing.
  }
}

function extensionVersion() {
  return chrome.runtime.getManifest().version;
}

function alphaOfflineCode() {
  return typeof navigator !== "undefined" && navigator.onLine === false
    ? "offline" as const
    : "unknown" as const;
}

export type PendingLifecycleEvent =
  | { eventName: "extension.installed" }
  | { eventName: "extension.updated"; previousVersion: string };

export function pendingLifecycleEvents(value: unknown): PendingLifecycleEvent[] {
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

function alphaHeaders(apiToken?: string) {
  return {
    "Content-Type": "application/json",
    "X-Cold-Start-Extension-Id": chrome.runtime.id,
    "X-Cold-Start-Extension-Version": extensionVersion(),
    [COLD_START_CLIENT_CONTRACT_HEADER]: COLD_START_API_CONTRACT_VERSION,
    ...(apiToken ? { Authorization: `Bearer ${apiToken}` } : {})
  };
}

export function alphaExternalError(
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

export async function alphaConnectionStatus(): Promise<AlphaInviteExternalResponse> {
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

export async function connectAlphaInvitation(input: {
  inviteToken: string;
  storeVisited: boolean;
  reducedMotion: boolean;
  theme: "light" | "dark";
}): Promise<AlphaInviteExternalResponse> {
  try {
    const response = await fetch(`${DEFAULT_API_ORIGIN}/api/alpha/invite/redeem`, {
      method: "POST",
      headers: alphaHeaders(),
      body: JSON.stringify({
        inviteToken: input.inviteToken,
        browser: detectedAlphaBrowser(),
        channel: "unlisted",
        extensionVersion: extensionVersion(),
        clientContract: COLD_START_API_CONTRACT_VERSION,
        consent: true,
        storeVisited: input.storeVisited,
        reducedMotion: input.reducedMotion,
        theme: input.theme
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

    // The invite is consumed server-side the moment the redeem responds, so the
    // credential write comes first; everything after it is best-effort and must
    // not turn a successful connect into a user-visible failure.
    await storageLocalSet({
      [API_ORIGIN_KEY]: DEFAULT_API_ORIGIN,
      [API_TOKEN_KEY]: apiToken,
      ...(safeResponse.installationSuffix
        ? { [ALPHA_INSTALLATION_SUFFIX_STORAGE_KEY]: safeResponse.installationSuffix }
        : {}),
      [INSTALL_CHANNEL_KEY]: "unlisted"
    });
    await setTrustedStorageAccess();
    await flushPendingLifecycle({ apiOrigin: DEFAULT_API_ORIGIN, apiToken }).catch(() => undefined);
    return safeResponse;
  } catch {
    return alphaExternalError(alphaOfflineCode());
  }
}
