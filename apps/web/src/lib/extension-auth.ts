import { timingSafeEqual } from "node:crypto";

const LOCAL_CHROME_EXTENSION_WILDCARD = "chrome-extension://*";
const LOCAL_DEFAULT_EXTENSION_ORIGINS = "chrome-extension://*,http://localhost:5173";
const extensionIdHeader = "x-cold-start-extension-id";
const localExtensionId = "local-dev";
const localExtensionToken = "local-extension-token";

function timingSafeStringEqual(a: string, b: string): boolean {
  // timingSafeEqual requires equal-length buffers; length-mismatch short-circuits to false.
  // Stringify-first ensures we never throw on weird header values.
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  if (left.length !== right.length) {
    return false;
  }
  return timingSafeEqual(left, right);
}

function parseConfiguredValues(value: string | undefined): string[] {
  return (value ?? "")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function configuredValues(value: string | undefined, fallback: string | undefined): string[] {
  const values = parseConfiguredValues(value);
  return values.length > 0 ? values : parseConfiguredValues(fallback);
}

function isAllowedOrigin(origin: string, allowedOrigins: string[]) {
  if (allowedOrigins.includes(origin)) {
    return true;
  }

  if (
    process.env.NODE_ENV !== "production" &&
    allowedOrigins.includes(LOCAL_CHROME_EXTENSION_WILDCARD) &&
    origin.startsWith("chrome-extension://")
  ) {
    return true;
  }

  return false;
}

function isAllowedProductionOrigin(origin: string, allowedOrigins: string[]) {
  if (!origin || origin.startsWith("moz-extension://")) {
    return true;
  }
  return allowedOrigins.includes(origin);
}

function hasUnsafeProductionConfig(allowedOrigins: string[], allowedExtensionIds: string[], apiTokens: string[]) {
  return (
    process.env.NODE_ENV === "production" &&
    (
      allowedOrigins.includes(LOCAL_CHROME_EXTENSION_WILDCARD) ||
      allowedOrigins.some((origin) => origin.startsWith("moz-extension://") && origin.includes("*")) ||
      allowedOrigins.some((origin) => origin.startsWith("http://localhost") || origin.startsWith("http://127.0.0.1")) ||
      allowedExtensionIds.includes(localExtensionId) ||
      apiTokens.includes(localExtensionToken)
    )
  );
}

export function assertExtensionRequest(headers: Headers) {
  const origin = headers.get("origin") ?? "";
  const extensionId = headers.get(extensionIdHeader)?.trim() ?? "";
  const configuredOrigins = process.env.ALLOWED_EXTENSION_ORIGINS;
  const allowedExtensionIds = configuredValues(process.env.ALLOWED_EXTENSION_IDS, process.env.CHROME_EXTENSION_ID);
  const apiTokens = configuredValues(process.env.EXTENSION_API_TOKENS, process.env.EXTENSION_API_TOKEN);

  if ((process.env.NODE_ENV === "production" && allowedExtensionIds.length === 0) || apiTokens.length === 0) {
    return { ok: false as const, status: 500, error: "extension auth not configured" };
  }

  const defaultOrigins = process.env.NODE_ENV === "production" ? "" : LOCAL_DEFAULT_EXTENSION_ORIGINS;
  const allowed = parseConfiguredValues(configuredOrigins ?? defaultOrigins);

  if (hasUnsafeProductionConfig(allowed, allowedExtensionIds, apiTokens)) {
    return { ok: false as const, status: 500, error: "extension auth not configured" };
  }

  const allowedByExtensionId =
    process.env.NODE_ENV === "production" ? allowedExtensionIds.includes(extensionId) : extensionId.length > 0;
  const allowedByOrigin =
    process.env.NODE_ENV === "production"
      ? isAllowedProductionOrigin(origin, allowed)
      : isAllowedOrigin(origin, allowed);
  const identityAllowed =
    process.env.NODE_ENV === "production" ? allowedByExtensionId && allowedByOrigin : allowedByExtensionId || allowedByOrigin;

  if (!identityAllowed) {
    return { ok: false as const, status: 403, error: "extension identity required" };
  }

  const authorization = headers.get("authorization") ?? "";
  if (!authorization.startsWith("Bearer ")) {
    return { ok: false as const, status: 401, error: "extension token required" };
  }

  const token = authorization.slice("Bearer ".length);
  const tokenMatches = apiTokens.reduce(
    (matches, configuredToken) => timingSafeStringEqual(token, configuredToken) || matches,
    false
  );
  if (!tokenMatches) {
    return { ok: false as const, status: 401, error: "extension token invalid" };
  }

  return { ok: true as const };
}
