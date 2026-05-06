import { afterEach, describe, expect, it } from "vitest";

import { assertExtensionRequest } from "../src/lib/extension-auth";

const originalAllowedOrigins = process.env.ALLOWED_EXTENSION_ORIGINS;
const originalApiToken = process.env.EXTENSION_API_TOKEN;
const originalNodeEnv = process.env.NODE_ENV;

function extensionHeaders(origin?: string, token?: string) {
  const headers = new Headers();
  if (origin) {
    headers.set("origin", origin);
  }
  if (token) {
    headers.set("authorization", `Bearer ${token}`);
  }
  return headers;
}

describe("assertExtensionRequest", () => {
  afterEach(() => {
    if (originalAllowedOrigins === undefined) {
      delete process.env.ALLOWED_EXTENSION_ORIGINS;
    } else {
      process.env.ALLOWED_EXTENSION_ORIGINS = originalAllowedOrigins;
    }
    if (originalApiToken === undefined) {
      delete process.env.EXTENSION_API_TOKEN;
    } else {
      process.env.EXTENSION_API_TOKEN = originalApiToken;
    }
    if (originalNodeEnv === undefined) {
      delete process.env.NODE_ENV;
    } else {
      process.env.NODE_ENV = originalNodeEnv;
    }
  });

  it.each(["chrome-extension://local-dev", "http://localhost:5173"])(
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
      error: "extension origin required"
    });
  });

  it("fails closed in production when extension auth config is missing", () => {
    process.env.NODE_ENV = "production";
    delete process.env.ALLOWED_EXTENSION_ORIGINS;
    delete process.env.EXTENSION_API_TOKEN;

    expect(assertExtensionRequest(extensionHeaders("chrome-extension://local-dev", "secret"))).toEqual({
      ok: false,
      status: 500,
      error: "extension auth not configured"
    });
  });

  it("allows configured production origin with a valid token", () => {
    process.env.NODE_ENV = "production";
    process.env.ALLOWED_EXTENSION_ORIGINS = "chrome-extension://prod-id";
    process.env.EXTENSION_API_TOKEN = "secret";

    expect(assertExtensionRequest(extensionHeaders("chrome-extension://prod-id", "secret"))).toEqual({ ok: true });
  });
});
