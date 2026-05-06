import { describe, expect, it } from "vitest";
import {
  buildCardRequest,
  defaultApiOrigin,
  normalizeApiOrigin,
  parseCardResponse,
  readableCardError,
  storedApiOriginOrDefault
} from "../src/extension-config";

describe("defaultApiOrigin", () => {
  it("uses the production API origin for production builds without an override", () => {
    expect(defaultApiOrigin({ MODE: "production", PROD: true })).toBe("https://coldstart.semitechie.vc");
  });

  it("uses a normalized env override when provided", () => {
    expect(defaultApiOrigin({
      MODE: "production",
      PROD: true,
      VITE_COLD_START_API_ORIGIN: " https://coldstart.semitechie.vc/api "
    })).toBe("https://coldstart.semitechie.vc");
  });

  it("uses localhost for local builds without an override", () => {
    expect(defaultApiOrigin({ MODE: "development", PROD: false })).toBe("http://localhost:3000");
  });
});

describe("normalizeApiOrigin", () => {
  it("normalizes origin input", () => {
    expect(normalizeApiOrigin(" https://example.com/path?q=1 ")).toBe("https://example.com");
  });
});

describe("storedApiOriginOrDefault", () => {
  it("replaces a stale production origin in local builds", () => {
    expect(storedApiOriginOrDefault("https://coldstart.semitechie.vc", "http://localhost:3000")).toBe(
      "http://localhost:3000"
    );
  });

  it("preserves explicit non-production origins in local builds", () => {
    expect(storedApiOriginOrDefault("http://127.0.0.1:3000", "http://localhost:3000")).toBe(
      "http://127.0.0.1:3000"
    );
  });

  it("preserves production origins in production builds", () => {
    expect(storedApiOriginOrDefault("https://coldstart.semitechie.vc", "https://coldstart.semitechie.vc")).toBe(
      "https://coldstart.semitechie.vc"
    );
  });

  it("falls back when stored origins are malformed", () => {
    expect(storedApiOriginOrDefault("not a url", "http://localhost:3000")).toBe("http://localhost:3000");
  });
});

describe("buildCardRequest", () => {
  it("builds the card URL with bearer authorization and extension identity", () => {
    const request = buildCardRequest(
      "www.Linear.app",
      {
        apiOrigin: "https://coldstart.semitechie.vc",
        apiToken: "token-123"
      },
      undefined,
      "extension-123"
    );

    expect(request.url).toBe("https://coldstart.semitechie.vc/api/extension/cards/linear");
    expect(request.init.headers).toEqual({
      Authorization: "Bearer token-123",
      "X-Cold-Start-Extension-Id": "extension-123"
    });
  });
});

describe("parseCardResponse", () => {
  it("throws the API error detail when a response fails", async () => {
    const response = new Response(JSON.stringify({ error: "invalid token" }), { status: 401 });

    await expect(parseCardResponse(response)).rejects.toThrow("invalid token");
  });

  it("throws the status when the response body is not JSON", async () => {
    const response = new Response("nope", { status: 502 });

    await expect(parseCardResponse(response)).rejects.toThrow("request failed with 502");
  });
});

describe("readableCardError", () => {
  it("explains missing web app extension auth env", () => {
    expect(readableCardError("extension auth not configured", "http://localhost:3000")).toContain(
      "Restart the local web app"
    );
  });

  it("explains local web app connectivity failures", () => {
    expect(readableCardError("Failed to fetch", "http://localhost:3000")).toContain("Start the local web app");
  });

  it("points production-origin failures back to localhost for local testing", () => {
    expect(readableCardError("Failed to fetch", "https://coldstart.semitechie.vc")).toBe(
      "Could not reach https://coldstart.semitechie.vc. For local testing, set API origin to http://localhost:3000."
    );
  });
});
