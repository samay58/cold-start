import { afterEach, describe, expect, it } from "vitest";

import { assertExtensionRequest } from "../src/lib/extension-auth";

const originalAllowedOrigins = process.env.ALLOWED_EXTENSION_ORIGINS;

function headersForOrigin(origin?: string) {
  const headers = new Headers();
  if (origin) {
    headers.set("origin", origin);
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
  });

  it.each(["chrome-extension://local-dev", "http://localhost:5173"])(
    "allows default dev origin %s",
    (origin) => {
      delete process.env.ALLOWED_EXTENSION_ORIGINS;

      expect(assertExtensionRequest(headersForOrigin(origin))).toEqual({ ok: true });
    }
  );

  it("allows configured origins after trimming empty entries", () => {
    process.env.ALLOWED_EXTENSION_ORIGINS = " chrome-extension://prod-id, https://cold-start.example , ";

    expect(assertExtensionRequest(headersForOrigin("chrome-extension://prod-id"))).toEqual({ ok: true });
    expect(assertExtensionRequest(headersForOrigin("https://cold-start.example"))).toEqual({ ok: true });
  });

  it.each([undefined, "https://example.com", "chrome-extension://wrong-id"])(
    "rejects missing or denied origin %s",
    (origin) => {
      delete process.env.ALLOWED_EXTENSION_ORIGINS;

      expect(assertExtensionRequest(headersForOrigin(origin))).toEqual({
        ok: false,
        status: 403,
        error: "extension origin required"
      });
    }
  );
});
