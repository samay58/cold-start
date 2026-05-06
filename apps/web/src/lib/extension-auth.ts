export function assertExtensionRequest(headers: Headers) {
  const origin = headers.get("origin") ?? "";
  const configuredOrigins = process.env.ALLOWED_EXTENSION_ORIGINS;
  const apiToken = process.env.EXTENSION_API_TOKEN;

  if ((process.env.NODE_ENV === "production" && !configuredOrigins?.trim()) || !apiToken) {
    return { ok: false as const, status: 500, error: "extension auth not configured" };
  }

  const allowed = (configuredOrigins ?? "chrome-extension://local-dev,http://localhost:5173")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);

  if (!allowed.includes(origin)) {
    return { ok: false as const, status: 403, error: "extension origin required" };
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
