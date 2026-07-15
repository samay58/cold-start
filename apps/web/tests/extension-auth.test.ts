import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { assertExtensionRequest } from "../src/lib/extension-auth";

const originalAllowedOrigins = process.env.ALLOWED_EXTENSION_ORIGINS;
const originalAllowedExtensionIds = process.env.ALLOWED_EXTENSION_IDS;
const originalChromeExtensionId = process.env.CHROME_EXTENSION_ID;
const originalApiTokens = process.env.EXTENSION_API_TOKENS;
const originalApiToken = process.env.EXTENSION_API_TOKEN;
const originalNodeEnv = process.env.NODE_ENV;

function extensionHeaders(origin?: string, token?: string, extensionId?: string) {
  const headers = new Headers();
  if (origin) {
    headers.set("origin", origin);
  }
  if (token) {
    headers.set("authorization", `Bearer ${token}`);
  }
  if (extensionId) {
    headers.set("x-cold-start-extension-id", extensionId);
  }
  return headers;
}

describe("assertExtensionRequest", () => {
  beforeEach(() => {
    delete process.env.ALLOWED_EXTENSION_ORIGINS;
    delete process.env.ALLOWED_EXTENSION_IDS;
    delete process.env.CHROME_EXTENSION_ID;
    delete process.env.EXTENSION_API_TOKENS;
    delete process.env.EXTENSION_API_TOKEN;
    delete process.env.NODE_ENV;
  });

  afterEach(() => {
    if (originalAllowedOrigins === undefined) {
      delete process.env.ALLOWED_EXTENSION_ORIGINS;
    } else {
      process.env.ALLOWED_EXTENSION_ORIGINS = originalAllowedOrigins;
    }
    if (originalAllowedExtensionIds === undefined) {
      delete process.env.ALLOWED_EXTENSION_IDS;
    } else {
      process.env.ALLOWED_EXTENSION_IDS = originalAllowedExtensionIds;
    }
    if (originalApiTokens === undefined) {
      delete process.env.EXTENSION_API_TOKENS;
    } else {
      process.env.EXTENSION_API_TOKENS = originalApiTokens;
    }
    if (originalApiToken === undefined) {
      delete process.env.EXTENSION_API_TOKEN;
    } else {
      process.env.EXTENSION_API_TOKEN = originalApiToken;
    }
    if (originalChromeExtensionId === undefined) {
      delete process.env.CHROME_EXTENSION_ID;
    } else {
      process.env.CHROME_EXTENSION_ID = originalChromeExtensionId;
    }
    if (originalNodeEnv === undefined) {
      delete process.env.NODE_ENV;
    } else {
      process.env.NODE_ENV = originalNodeEnv;
    }
  });

  it.each(["chrome-extension://local-dev", "chrome-extension://generatedid", "http://localhost:5173"])(
    "allows default dev origin %s with a valid token",
    (origin) => {
      process.env.NODE_ENV = "test";
      delete process.env.ALLOWED_EXTENSION_ORIGINS;
      process.env.EXTENSION_API_TOKEN = "secret";

      expect(assertExtensionRequest(extensionHeaders(origin, "secret"))).toEqual({ ok: true });
    }
  );

  it("allows configured origins after trimming empty entries when the token is valid", () => {
    process.env.NODE_ENV = "test";
    process.env.ALLOWED_EXTENSION_ORIGINS = " chrome-extension://prod-id, https://cold-start.example , ";
    process.env.EXTENSION_API_TOKEN = "secret";

    expect(assertExtensionRequest(extensionHeaders("chrome-extension://prod-id", "secret"))).toEqual({ ok: true });
    expect(assertExtensionRequest(extensionHeaders("https://cold-start.example", "secret"))).toEqual({ ok: true });
  });

  it("allows local Chrome extension requests by extension ID when Origin is absent", () => {
    process.env.NODE_ENV = "test";
    delete process.env.ALLOWED_EXTENSION_ORIGINS;
    process.env.EXTENSION_API_TOKEN = "secret";

    expect(assertExtensionRequest(extensionHeaders(undefined, "secret", "generated-extension-id"))).toEqual({ ok: true });
  });

  it("rejects an allowed origin without a token", () => {
    process.env.NODE_ENV = "test";
    delete process.env.ALLOWED_EXTENSION_ORIGINS;
    process.env.EXTENSION_API_TOKEN = "secret";

    expect(assertExtensionRequest(extensionHeaders("chrome-extension://local-dev"))).toEqual({
      ok: false,
      status: 401,
      error: "extension token required"
    });
  });

  it("rejects an allowed origin with a wrong token", () => {
    process.env.NODE_ENV = "test";
    delete process.env.ALLOWED_EXTENSION_ORIGINS;
    process.env.EXTENSION_API_TOKEN = "secret";

    expect(assertExtensionRequest(extensionHeaders("chrome-extension://local-dev", "wrong"))).toEqual({
      ok: false,
      status: 401,
      error: "extension token invalid"
    });
  });

  it("rejects a disallowed origin with a valid token", () => {
    process.env.NODE_ENV = "test";
    delete process.env.ALLOWED_EXTENSION_ORIGINS;
    process.env.EXTENSION_API_TOKEN = "secret";

    expect(assertExtensionRequest(extensionHeaders("https://example.com", "secret"))).toEqual({
      ok: false,
      status: 403,
      error: "extension identity required"
    });
  });

  it("fails closed in production when extension auth config is missing", () => {
    process.env.NODE_ENV = "production";
    delete process.env.ALLOWED_EXTENSION_ORIGINS;
    delete process.env.CHROME_EXTENSION_ID;
    delete process.env.EXTENSION_API_TOKEN;

    expect(assertExtensionRequest(extensionHeaders("chrome-extension://local-dev", "secret"))).toEqual({
      ok: false,
      status: 500,
      error: "extension auth not configured"
    });
  });

  it.each([undefined, "moz-extension://random-install-uuid"])(
    "allows a Gecko ID and token when Origin is %s",
    (origin) => {
      process.env.NODE_ENV = "production";
      process.env.ALLOWED_EXTENSION_IDS = "chrome-id, cold-start@semitechie.vc";
      process.env.EXTENSION_API_TOKENS = "chrome-token, firefox-token";

      expect(assertExtensionRequest(extensionHeaders(origin, "firefox-token", "cold-start@semitechie.vc"))).toEqual({
        ok: true
      });
    }
  );

  it.each([undefined, "wrong-id"])("rejects a valid Chrome origin when the extension ID is %s", (extensionId) => {
    process.env.NODE_ENV = "production";
    process.env.ALLOWED_EXTENSION_ORIGINS = "chrome-extension://prod-id";
    process.env.ALLOWED_EXTENSION_IDS = "prod-id";
    process.env.EXTENSION_API_TOKEN = "secret";

    expect(assertExtensionRequest(extensionHeaders("chrome-extension://prod-id", "secret", extensionId))).toEqual({
      ok: false,
      status: 403,
      error: "extension identity required"
    });
  });

  it("rejects a Chrome ID when its Origin does not match the allowlist", () => {
    process.env.NODE_ENV = "production";
    process.env.ALLOWED_EXTENSION_ORIGINS = "chrome-extension://prod-id";
    process.env.ALLOWED_EXTENSION_IDS = "prod-id";
    process.env.EXTENSION_API_TOKEN = "secret";

    expect(assertExtensionRequest(extensionHeaders("chrome-extension://other-id", "secret", "prod-id"))).toEqual({
      ok: false,
      status: 403,
      error: "extension identity required"
    });
  });

  it("accepts a rotated token from the comma-separated token list", () => {
    process.env.NODE_ENV = "production";
    process.env.ALLOWED_EXTENSION_IDS = "prod-id";
    process.env.EXTENSION_API_TOKENS = "old-token, new-token";

    expect(assertExtensionRequest(extensionHeaders(undefined, "new-token", "prod-id"))).toEqual({ ok: true });
  });

  it("fails closed in production when local sentinel auth values leak in", () => {
    process.env.NODE_ENV = "production";
    process.env.ALLOWED_EXTENSION_ORIGINS = "chrome-extension://prod-id";
    process.env.CHROME_EXTENSION_ID = "local-dev";
    process.env.EXTENSION_API_TOKEN = "local-extension-token";

    expect(assertExtensionRequest(extensionHeaders("chrome-extension://prod-id", "local-extension-token"))).toEqual({
      ok: false,
      status: 500,
      error: "extension auth not configured"
    });
  });

  it.each([
    ["ALLOWED_EXTENSION_IDS", "prod-id, local-dev"],
    ["EXTENSION_API_TOKENS", "secret, local-extension-token"],
    ["ALLOWED_EXTENSION_ORIGINS", "moz-extension://*"]
  ])("fails closed when %s contains an unsafe production sentinel", (name, value) => {
    process.env.NODE_ENV = "production";
    process.env.ALLOWED_EXTENSION_IDS = "prod-id";
    process.env.EXTENSION_API_TOKENS = "secret";
    process.env[name] = value;

    expect(assertExtensionRequest(extensionHeaders(undefined, "secret", "prod-id"))).toEqual({
      ok: false,
      status: 500,
      error: "extension auth not configured"
    });
  });

  it("fails closed in production when localhost origins are configured", () => {
    process.env.NODE_ENV = "production";
    process.env.ALLOWED_EXTENSION_ORIGINS = "chrome-extension://prod-id,http://localhost:5173";
    process.env.EXTENSION_API_TOKEN = "secret";

    expect(assertExtensionRequest(extensionHeaders("chrome-extension://prod-id", "secret"))).toEqual({
      ok: false,
      status: 500,
      error: "extension auth not configured"
    });
  });

  it("allows configured production extension ID without relying on Origin", () => {
    process.env.NODE_ENV = "production";
    delete process.env.ALLOWED_EXTENSION_ORIGINS;
    process.env.CHROME_EXTENSION_ID = "prod-id";
    process.env.EXTENSION_API_TOKEN = "secret";

    expect(assertExtensionRequest(extensionHeaders(undefined, "secret", "prod-id"))).toEqual({ ok: true });
  });

  it("allows legacy single-value production configuration with a matching Chrome origin", () => {
    process.env.NODE_ENV = "production";
    process.env.ALLOWED_EXTENSION_ORIGINS = "chrome-extension://prod-id";
    process.env.CHROME_EXTENSION_ID = "prod-id";
    process.env.EXTENSION_API_TOKEN = "secret";

    expect(assertExtensionRequest(extensionHeaders("chrome-extension://prod-id", "secret", "prod-id"))).toEqual({
      ok: true
    });
  });

  it("rejects the wrong production extension ID without relying on Origin", () => {
    process.env.NODE_ENV = "production";
    delete process.env.ALLOWED_EXTENSION_ORIGINS;
    process.env.CHROME_EXTENSION_ID = "prod-id";
    process.env.EXTENSION_API_TOKEN = "secret";

    expect(assertExtensionRequest(extensionHeaders(undefined, "secret", "wrong-id"))).toEqual({
      ok: false,
      status: 403,
      error: "extension identity required"
    });
  });

  it("does not allow the Chrome extension wildcard in production", () => {
    process.env.NODE_ENV = "production";
    process.env.ALLOWED_EXTENSION_ORIGINS = "chrome-extension://*";
    process.env.EXTENSION_API_TOKEN = "secret";

    expect(assertExtensionRequest(extensionHeaders("chrome-extension://generatedid", "secret"))).toEqual({
      ok: false,
      status: 500,
      error: "extension auth not configured"
    });
  });

  it("rejects a wrong token even when the production extension ID matches and the origin header is present", () => {
    process.env.NODE_ENV = "production";
    process.env.ALLOWED_EXTENSION_ORIGINS = "chrome-extension://prod-id";
    process.env.CHROME_EXTENSION_ID = "prod-id";
    process.env.EXTENSION_API_TOKEN = "secret";

    expect(assertExtensionRequest(extensionHeaders("chrome-extension://prod-id", "wrong", "prod-id"))).toEqual({
      ok: false,
      status: 401,
      error: "extension token invalid"
    });
  });

  it("rejects a whitespace-only production extension ID header", () => {
    process.env.NODE_ENV = "production";
    delete process.env.ALLOWED_EXTENSION_ORIGINS;
    process.env.CHROME_EXTENSION_ID = "prod-id";
    process.env.EXTENSION_API_TOKEN = "secret";

    expect(assertExtensionRequest(extensionHeaders(undefined, "secret", "   "))).toEqual({
      ok: false,
      status: 403,
      error: "extension identity required"
    });
  });
});
