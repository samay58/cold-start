import {
  COLD_START_API_CONTRACT_HEADER,
  COLD_START_API_CONTRACT_VERSION,
  COLD_START_CLIENT_CONTRACT_HEADER,
  companySlugFromDomain,
  type ColdStartCard,
  type ResearchSection
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
  runId?: string;
  startedAt?: string;
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

export type ExtensionSourceSummary = {
  id: string;
  url: string;
  title: string;
  domain: string;
  sourceType: "company_site" | "news" | "filing" | "enrichment" | "github" | "rdap" | "other";
  fetchedAt: string;
  snippet: string;
};

export type ExtensionResearchRunEvent = {
  id: string;
  runId: string;
  slug: string;
  domain: string;
  sectionId: string | null;
  type: string;
  message: string;
  metadata: Record<string, unknown>;
  createdAt: string;
};

export type ExtensionBootstrapResponse = {
  domain: string;
  slug: string;
  card: ColdStartCard | null;
  sections?: ResearchSection[];
  sources?: ExtensionSourceSummary[];
  events?: ExtensionResearchRunEvent[];
  runs: {
    basics: GenerationRunStatus;
    analysis: GenerationRunStatus;
  };
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

type BaseRequestInit = RequestInit & { headers: Record<string, string> };

function baseRequestInit(settings: Settings, signal?: AbortSignal, extensionId?: string): BaseRequestInit {
  const init: BaseRequestInit = { headers: contractHeaders(settings.apiToken) };

  if (signal) {
    init.signal = signal;
  }

  if (extensionId?.trim()) {
    init.headers["X-Cold-Start-Extension-Id"] = extensionId.trim();
  }

  return init;
}

export function buildCardRequest(
  domain: string,
  settings: Settings,
  signal?: AbortSignal,
  extensionId?: string
): { url: string; init: BaseRequestInit } {
  const slug = companySlugFromDomain(domain);
  return {
    url: `${settings.apiOrigin}/api/extension/cards/${encodeURIComponent(slug)}`,
    init: baseRequestInit(settings, signal, extensionId)
  };
}

export function buildBootstrapRequest(
  domain: string,
  settings: Settings,
  signal?: AbortSignal,
  extensionId?: string
): { url: string; init: BaseRequestInit } {
  const params = new URLSearchParams({ domain });
  return {
    url: `${settings.apiOrigin}/api/extension/bootstrap?${params.toString()}`,
    init: baseRequestInit(settings, signal, extensionId)
  };
}

export function buildGenerateRequest(
  domain: string,
  settings: Settings,
  signal?: AbortSignal,
  mode: GenerationStatus["mode"] = "basics",
  confirmStart = false,
  extensionId?: string,
  forceRefresh = false,
  sectionId?: string
): { url: string; init: BaseRequestInit & { body: string } } {
  const init = baseRequestInit(settings, signal, extensionId);
  init.method = "POST";
  init.headers["Content-Type"] = "application/json";
  const body = JSON.stringify({
    domain,
    mode,
    ...(sectionId ? { sectionId } : {}),
    ...(confirmStart ? { confirmStart: true } : {}),
    ...(forceRefresh ? { forceRefresh: true } : {})
  });

  return {
    url: `${settings.apiOrigin}/api/generate`,
    init: { ...init, body }
  };
}

export function buildGenerationStatusRequest(
  domain: string,
  settings: Settings,
  signal?: AbortSignal,
  mode: GenerationRunStatus["mode"] = "basics",
  extensionId?: string,
  sectionId?: string
): { url: string; init: BaseRequestInit } {
  const params = new URLSearchParams({ domain, mode });
  if (sectionId) {
    params.set("sectionId", sectionId);
  }
  return {
    url: `${settings.apiOrigin}/api/generate?${params.toString()}`,
    init: baseRequestInit(settings, signal, extensionId)
  };
}

async function parseApiResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as { error?: unknown } | null;
    const detail = typeof body?.error === "string" ? body.error : `request failed with ${response.status}`;
    throw new ApiError(detail, response.status);
  }

  assertApiContract(response);
  return response.json() as Promise<T>;
}

export const parseCardResponse = (response: Response) => parseApiResponse<ColdStartCard>(response);
export const parseBootstrapResponse = (response: Response) => parseApiResponse<ExtensionBootstrapResponse>(response);
export const parseGenerateResponse = (response: Response) => parseApiResponse<GenerationStatus>(response);
export const parseGenerationStatusResponse = (response: Response) => parseApiResponse<GenerationRunStatus>(response);

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

  if (message === "profile needs more structured facts before analysis") {
    return "Regenerate the profile first. Investor analysis needs more than citations.";
  }

  if (message === "profile not found") {
    return "Generate a sourced profile before running analysis.";
  }

  if (message.startsWith("generated basics underfilled public profile")) {
    return "The API rejected a partial profile. Restart or deploy the latest API, then retry.";
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
