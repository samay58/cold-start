const LOCAL_CHROME_EXTENSION_WILDCARD = "chrome-extension://*";
const LOCAL_DEFAULT_EXTENSION_ORIGINS = "chrome-extension://*,http://localhost:5173";
const extensionIdHeader = "x-cold-start-extension-id";
const localExtensionId = "local-dev";
const localExtensionToken = "local-extension-token";

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

function hasUnsafeProductionConfig(
  allowedOrigins: string[],
  configuredExtensionId: string | undefined,
  apiToken: string | undefined
) {
  return (
    process.env.NODE_ENV === "production" &&
    (
      allowedOrigins.includes(LOCAL_CHROME_EXTENSION_WILDCARD) ||
      allowedOrigins.some((origin) => origin.startsWith("http://localhost") || origin.startsWith("http://127.0.0.1")) ||
      configuredExtensionId === localExtensionId ||
      apiToken === localExtensionToken
    )
  );
}

export function assertExtensionRequest(headers: Headers) {
  const origin = headers.get("origin") ?? "";
  const extensionId = headers.get(extensionIdHeader)?.trim() ?? "";
  const configuredOrigins = process.env.ALLOWED_EXTENSION_ORIGINS;
  const configuredExtensionId = process.env.CHROME_EXTENSION_ID?.trim();
  const apiToken = process.env.EXTENSION_API_TOKEN;

  if (
    (process.env.NODE_ENV === "production" && !configuredOrigins?.trim() && !configuredExtensionId) ||
    !apiToken
  ) {
    return { ok: false as const, status: 500, error: "extension auth not configured" };
  }

  const defaultOrigins = process.env.NODE_ENV === "production" ? "" : LOCAL_DEFAULT_EXTENSION_ORIGINS;
  const allowed = (configuredOrigins ?? defaultOrigins)
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);

  if (hasUnsafeProductionConfig(allowed, configuredExtensionId, apiToken)) {
    return { ok: false as const, status: 500, error: "extension auth not configured" };
  }

  const allowedByExtensionId =
    process.env.NODE_ENV !== "production"
      ? extensionId.length > 0
      : Boolean(configuredExtensionId && extensionId === configuredExtensionId);

  if (!allowedByExtensionId && !isAllowedOrigin(origin, allowed)) {
    return { ok: false as const, status: 403, error: "extension identity required" };
  }

  const authorization = headers.get("authorization") ?? "";
  if (!authorization.startsWith("Bearer ")) {
    return { ok: false as const, status: 401, error: "extension token required" };
  }

  const token = authorization.slice("Bearer ".length);
  if (token !== apiToken) {
    return { ok: false as const, status: 401, error: "extension token invalid" };
  }

  return { ok: true as const };
}
