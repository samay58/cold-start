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
