import { describe, expect, it } from "vitest";
import {
  buildCardRequest,
  defaultApiOrigin,
  normalizeApiOrigin,
  parseCardResponse
} from "../src/extension-config";

describe("defaultApiOrigin", () => {
  it("uses the production API origin for production builds", () => {
    expect(defaultApiOrigin({ MODE: "production", PROD: true })).toBe("https://coldstart.semitechie.vc");
  });

  it("uses a normalized env override when provided", () => {
    expect(defaultApiOrigin({
      MODE: "production",
      PROD: true,
      VITE_COLD_START_API_ORIGIN: " http://localhost:3000/api "
    })).toBe("http://localhost:3000");
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
