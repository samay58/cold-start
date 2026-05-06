import { companySlugFromDomain, type ColdStartCard } from "@cold-start/core";

const PRODUCTION_API_ORIGIN = "https://coldstart.semitechie.vc";
const LOCAL_API_ORIGIN = "http://localhost:3000";

export type ExtensionEnv = {
  MODE?: string;
  PROD?: boolean;
  VITE_COLD_START_API_ORIGIN?: string;
};

export type Settings = {
  apiOrigin: string;
  apiToken: string;
};

export function normalizeApiOrigin(value: string, fallback = PRODUCTION_API_ORIGIN): string {
  const trimmed = value.trim();
  if (!trimmed) {
    return fallback;
  }

  return new URL(trimmed).origin;
}

export function defaultApiOrigin(env: ExtensionEnv): string {
  if (env.VITE_COLD_START_API_ORIGIN?.trim()) {
    return normalizeApiOrigin(env.VITE_COLD_START_API_ORIGIN);
  }

  if (env.PROD || env.MODE === "production") {
    return PRODUCTION_API_ORIGIN;
  }

  return LOCAL_API_ORIGIN;
}

export function storedApiOriginOrDefault(storedApiOrigin: string, defaultOrigin: string): string {
  const trimmed = storedApiOrigin.trim();
  if (!trimmed) {
    return defaultOrigin;
  }

  try {
    const normalizedOrigin = normalizeApiOrigin(trimmed, defaultOrigin);
    if (defaultOrigin === LOCAL_API_ORIGIN && normalizedOrigin === PRODUCTION_API_ORIGIN) {
      return defaultOrigin;
    }

    return normalizedOrigin;
  } catch {
    return defaultOrigin;
  }
}

export function buildCardRequest(
  domain: string,
  settings: Settings,
  signal?: AbortSignal,
  extensionId?: string
): { url: string; init: RequestInit & { headers: Record<string, string> } } {
  const slug = companySlugFromDomain(domain);
  const init: RequestInit & { headers: Record<string, string> } = {
    headers: {
      Authorization: `Bearer ${settings.apiToken}`
    }
  };

  if (signal) {
    init.signal = signal;
  }

  if (extensionId?.trim()) {
    init.headers["X-Cold-Start-Extension-Id"] = extensionId.trim();
  }

  return {
    url: `${settings.apiOrigin}/api/extension/cards/${encodeURIComponent(slug)}`,
    init
  };
}

export async function parseCardResponse(response: Response): Promise<ColdStartCard> {
  if (!response.ok) {
    const body = await response.json().catch(() => null) as { error?: unknown } | null;
    const detail = typeof body?.error === "string" ? body.error : `request failed with ${response.status}`;
    throw new Error(detail);
  }

  return response.json() as Promise<ColdStartCard>;
}

export function readableCardError(message: string, apiOrigin: string): string {
  if (message === "extension identity required") {
    return "Reload the unpacked extension, then reopen Cold Start.";
  }

  if (message === "extension auth not configured") {
    return "Extension auth is missing on the API. Restart the local web app after loading .env.local.";
  }

  if (message === "extension token required" || message === "extension token invalid") {
    return "Check the API token in settings.";
  }

  if (/^(Failed to fetch|Load failed)$/i.test(message) || /networkerror/i.test(message)) {
    if (apiOrigin.startsWith("http://localhost") || apiOrigin.startsWith("http://127.0.0.1")) {
      return `Could not reach ${apiOrigin}. Start the local web app, then try again.`;
    }

    return `Could not reach ${apiOrigin}. For local testing, set API origin to http://localhost:3000.`;
  }

  return message;
}
