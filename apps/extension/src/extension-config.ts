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

export type GenerationStatus = {
  slug: string;
  status: "cached" | "queued" | "running";
};

export class ApiError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
    this.name = "ApiError";
  }
}

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

export function readableCompanyNameFromDomain(domain: string): string {
  let slug: string;

  try {
    slug = companySlugFromDomain(domain);
  } catch {
    return domain.trim() || "Current site";
  }

  const words = slug
    .split(/[-_]+/)
    .map((word) => word.trim())
    .filter(Boolean);

  if (words.length === 0) {
    return domain;
  }

  return words
    .map((word) => {
      if (/^[a-z]{1,3}$/i.test(word) && word.toLowerCase() === "ai") {
        return "AI";
      }

      return `${word.charAt(0).toUpperCase()}${word.slice(1)}`;
    })
    .join(" ");
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

export function buildGenerateRequest(
  domain: string,
  settings: Settings,
  signal?: AbortSignal
): { url: string; init: RequestInit & { headers: Record<string, string>; body: string } } {
  const init: RequestInit & { headers: Record<string, string>; body: string } = {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ domain, confirmStart: true })
  };

  if (signal) {
    init.signal = signal;
  }

  return {
    url: `${settings.apiOrigin}/api/generate`,
    init
  };
}

export async function parseCardResponse(response: Response): Promise<ColdStartCard> {
  if (!response.ok) {
    const body = await response.json().catch(() => null) as { error?: unknown } | null;
    const detail = typeof body?.error === "string" ? body.error : `request failed with ${response.status}`;
    throw new ApiError(detail, response.status);
  }

  return response.json() as Promise<ColdStartCard>;
}

export async function parseGenerateResponse(response: Response): Promise<GenerationStatus> {
  if (!response.ok) {
    const body = await response.json().catch(() => null) as { error?: unknown } | null;
    const detail = typeof body?.error === "string" ? body.error : `request failed with ${response.status}`;
    throw new ApiError(detail, response.status);
  }

  return response.json() as Promise<GenerationStatus>;
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

  if (message === "request failed with 500") {
    return "Generation failed on the API. Check the local web app and worker logs, then retry.";
  }

  if (/^(Failed to fetch|Load failed)$/i.test(message) || /networkerror/i.test(message)) {
    if (apiOrigin.startsWith("http://localhost") || apiOrigin.startsWith("http://127.0.0.1")) {
      return `Could not reach ${apiOrigin}. Start the local web app, then try again.`;
    }

    return `Could not reach ${apiOrigin}. For local testing, set API origin to http://localhost:3000.`;
  }

  return message;
}
