export function assertExtensionRequest(headers: Headers) {
  const origin = headers.get("origin") ?? "";
  const allowed = (process.env.ALLOWED_EXTENSION_ORIGINS ?? "chrome-extension://local-dev,http://localhost:5173")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);

  if (!allowed.includes(origin)) {
    return { ok: false as const, status: 403, error: "extension origin required" };
  }

  return { ok: true as const };
}
