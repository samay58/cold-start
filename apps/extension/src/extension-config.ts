import {
  COLD_START_API_CONTRACT_HEADER,
  COLD_START_API_CONTRACT_VERSION,
  COLD_START_CLIENT_CONTRACT_HEADER,
  companySlugFromDomain,
  type ColdStartCard
} from "@cold-start/core";

const PRODUCTION_API_ORIGIN = "https://cold-start-samay58s-projects.vercel.app";
const LOCAL_API_ORIGIN = "http://localhost:3000";
const LEGACY_PRODUCTION_API_ORIGINS = new Set(["https://coldstart.semitechie.vc"]);

export type ExtensionEnv = {
  MODE?: string;
  PROD?: boolean;
  VITE_COLD_START_API_ORIGIN?: string;
  VITE_COLD_START_ALLOW_LOCAL_API_ORIGIN?: string;
};

export type Settings = {
  apiOrigin: string;
  apiToken: string;
};

export type GenerationStatus = {
  slug: string;
  status: "cached" | "queued" | "running";
  mode: "basics" | "analysis";
};

export type GenerationRunStatus = {
  slug: string;
  domain: string;
  status: "idle" | "queued" | "running" | "complete" | "failed";
  mode: "basics" | "analysis";
  runId?: string;
  error?: string;
  costUsd?: number;
  startedAt?: string;
  completedAt?: string;
};

export class ApiError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
    this.name = "ApiError";
  }
}

function contractHeaders(apiToken: string) {
  return {
    Authorization: `Bearer ${apiToken}`,
    [COLD_START_CLIENT_CONTRACT_HEADER]: COLD_START_API_CONTRACT_VERSION
  };
}

function assertApiContract(response: Response) {
  const apiContract = response.headers.get(COLD_START_API_CONTRACT_HEADER);
  if (apiContract !== COLD_START_API_CONTRACT_VERSION) {
    throw new ApiError("api deployment out of date", 426);
  }
}

export function normalizeApiOrigin(value: string, fallback = PRODUCTION_API_ORIGIN): string {
  const trimmed = value.trim();
  if (!trimmed) {
    return fallback;
  }

  return new URL(trimmed).origin;
}

function isLocalApiOrigin(origin: string) {
  try {
    const hostname = new URL(origin).hostname;
    return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "0.0.0.0";
  } catch {
    return false;
  }
}

function allowsLocalApiOrigin(env: ExtensionEnv): boolean {
  return env.VITE_COLD_START_ALLOW_LOCAL_API_ORIGIN === "true" || (!env.PROD && env.MODE !== "production");
}

export function defaultApiOrigin(env: ExtensionEnv): string {
  const configuredOrigin = env.VITE_COLD_START_API_ORIGIN?.trim();
  if (configuredOrigin) {
    const normalizedOrigin = normalizeApiOrigin(configuredOrigin);
    if (!isLocalApiOrigin(normalizedOrigin) || allowsLocalApiOrigin(env)) {
      return normalizedOrigin;
    }
  }

  return PRODUCTION_API_ORIGIN;
}

export function storedApiOriginOrDefault(storedApiOrigin: string, defaultOrigin: string): string {
  const trimmed = storedApiOrigin.trim();
  if (!trimmed) {
    return defaultOrigin;
  }

  try {
    const normalizedOrigin = normalizeApiOrigin(trimmed, defaultOrigin);
    if (LEGACY_PRODUCTION_API_ORIGINS.has(normalizedOrigin)) {
      return defaultOrigin;
    }

    if (!isLocalApiOrigin(defaultOrigin) && isLocalApiOrigin(normalizedOrigin)) {
      return defaultOrigin;
    }

    if (defaultOrigin === LOCAL_API_ORIGIN && normalizedOrigin === PRODUCTION_API_ORIGIN) {
      return defaultOrigin;
    }

    return normalizedOrigin;
  } catch {
    return defaultOrigin;
  }
}

export function storedApiTokenOrDefault(storedApiToken: string, defaultOrigin: string): string {
  const trimmed = storedApiToken.trim();
  if (!trimmed) {
    return "";
  }

  if (!isLocalApiOrigin(defaultOrigin) && trimmed === "local-extension-token") {
    return "";
  }

  return trimmed;
}

export function storedSettingsOrDefault(
  storedSettings: { apiOrigin?: string; apiToken?: string },
  defaultOrigin: string
): Settings {
  return {
    apiOrigin: storedApiOriginOrDefault(storedSettings.apiOrigin ?? "", defaultOrigin),
    apiToken: storedApiTokenOrDefault(storedSettings.apiToken ?? "", defaultOrigin)
  };
}

export function resolveStoredSettings(
  storedSettings: { apiOrigin?: string; apiToken?: string },
  defaultOrigin: string
): { settings: Settings; shouldPersist: boolean } {
  const storedOrigin = (storedSettings.apiOrigin ?? "").trim();
  const storedToken = (storedSettings.apiToken ?? "").trim();
  const settings = storedSettingsOrDefault({ apiOrigin: storedOrigin, apiToken: storedToken }, defaultOrigin);

  return {
    settings,
    shouldPersist: settings.apiOrigin !== storedOrigin || settings.apiToken !== storedToken
  };
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
    headers: contractHeaders(settings.apiToken)
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
  signal?: AbortSignal,
  mode: GenerationStatus["mode"] = "basics",
  confirmStart = false,
  extensionId?: string
): { url: string; init: RequestInit & { headers: Record<string, string>; body: string } } {
  const init: RequestInit & { headers: Record<string, string>; body: string } = {
    method: "POST",
    headers: {
      ...contractHeaders(settings.apiToken),
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ domain, mode, ...(confirmStart ? { confirmStart: true } : {}) })
  };

  if (signal) {
    init.signal = signal;
  }

  if (extensionId?.trim()) {
    init.headers["X-Cold-Start-Extension-Id"] = extensionId.trim();
  }

  return {
    url: `${settings.apiOrigin}/api/generate`,
    init
  };
}

export function buildGenerationStatusRequest(
  domain: string,
  settings: Settings,
  signal?: AbortSignal,
  mode: GenerationRunStatus["mode"] = "basics",
  extensionId?: string
): { url: string; init: RequestInit & { headers: Record<string, string> } } {
  const init: RequestInit & { headers: Record<string, string> } = {
    headers: contractHeaders(settings.apiToken)
  };

  if (signal) {
    init.signal = signal;
  }

  if (extensionId?.trim()) {
    init.headers["X-Cold-Start-Extension-Id"] = extensionId.trim();
  }

  const params = new URLSearchParams({ domain, mode });

  return {
    url: `${settings.apiOrigin}/api/generate?${params.toString()}`,
    init
  };
}

export async function parseCardResponse(response: Response): Promise<ColdStartCard> {
  if (!response.ok) {
    const body = await response.json().catch(() => null) as { error?: unknown } | null;
    const detail = typeof body?.error === "string" ? body.error : `request failed with ${response.status}`;
    throw new ApiError(detail, response.status);
  }

  assertApiContract(response);
  return response.json() as Promise<ColdStartCard>;
}

export async function parseGenerateResponse(response: Response): Promise<GenerationStatus> {
  if (!response.ok) {
    const body = await response.json().catch(() => null) as { error?: unknown } | null;
    const detail = typeof body?.error === "string" ? body.error : `request failed with ${response.status}`;
    throw new ApiError(detail, response.status);
  }

  assertApiContract(response);
  return response.json() as Promise<GenerationStatus>;
}

export async function parseGenerationStatusResponse(response: Response): Promise<GenerationRunStatus> {
  if (!response.ok) {
    const body = await response.json().catch(() => null) as { error?: unknown } | null;
    const detail = typeof body?.error === "string" ? body.error : `request failed with ${response.status}`;
    throw new ApiError(detail, response.status);
  }

  assertApiContract(response);
  return response.json() as Promise<GenerationRunStatus>;
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

  if (message === "profile needs cited sources before analysis") {
    return "Regenerate the profile first. Investor analysis needs cited sources.";
  }

  if (message === "profile not found") {
    return "Generate a sourced profile before running analysis.";
  }

  if (message === "request failed with 500") {
    return "Generation failed on the API. Check the local web app and worker logs, then retry.";
  }

  if (message === "No cited sources survived extraction") {
    return "Sources were found, but the API could not structure a cited profile. Retry generation, then check the worker logs if it fails again.";
  }

  if (message === "api deployment out of date") {
    return "The API deployment is out of date for this extension. Deploy the web app, then reload the unpacked extension.";
  }

  if (/^(Failed to fetch|Load failed)$/i.test(message) || /networkerror/i.test(message)) {
    if (apiOrigin.startsWith("http://localhost") || apiOrigin.startsWith("http://127.0.0.1")) {
      return `Could not reach ${apiOrigin}. Start the local web app, then try again.`;
    }

    return `Could not reach ${apiOrigin}. For local testing, set API origin to http://localhost:3000.`;
  }

  return message;
}
