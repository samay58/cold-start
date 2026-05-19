import { COLD_START_API_CONTRACT_HEADER, COLD_START_API_CONTRACT_VERSION, COLD_START_CLIENT_CONTRACT_HEADER } from "@cold-start/core";
import { describe, expect, it } from "vitest";
import {
  ApiError,
  buildGenerateRequest,
  buildCardRequest,
  defaultApiOrigin,
  normalizeApiOrigin,
  parseGenerateResponse,
  parseCardResponse,
  readableCompanyNameFromDomain,
  readableCardError,
  resolveStoredSettings,
  storedApiOriginOrDefault,
  storedApiTokenOrDefault,
  storedSettingsOrDefault
} from "../src/extension-config";

describe("defaultApiOrigin", () => {
  it("uses the production API origin for production builds without an override", () => {
    expect(defaultApiOrigin({ MODE: "production", PROD: true })).toBe(
      "https://cold-start-samay58s-projects.vercel.app"
    );
  });

  it("uses a normalized env override when provided", () => {
    expect(defaultApiOrigin({
      MODE: "production",
      PROD: true,
      VITE_COLD_START_API_ORIGIN: " https://cold-start-samay58s-projects.vercel.app/api "
    })).toBe("https://cold-start-samay58s-projects.vercel.app");
  });

  it("ignores accidental localhost overrides in production builds", () => {
    expect(defaultApiOrigin({
      MODE: "production",
      PROD: true,
      VITE_COLD_START_API_ORIGIN: "http://localhost:3000"
    })).toBe("https://cold-start-samay58s-projects.vercel.app");
  });

  it("uses localhost in production builds only when explicitly allowed", () => {
    expect(defaultApiOrigin({
      MODE: "production",
      PROD: true,
      VITE_COLD_START_ALLOW_LOCAL_API_ORIGIN: "true",
      VITE_COLD_START_API_ORIGIN: "http://localhost:3000"
    })).toBe("http://localhost:3000");
  });

  it("uses the production API origin for local builds without an override", () => {
    expect(defaultApiOrigin({ MODE: "development", PROD: false })).toBe(
      "https://cold-start-samay58s-projects.vercel.app"
    );
  });

  it("uses localhost for local builds only with an explicit override", () => {
    expect(defaultApiOrigin({
      MODE: "development",
      PROD: false,
      VITE_COLD_START_API_ORIGIN: "http://localhost:3000"
    })).toBe("http://localhost:3000");
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
    expect(
      storedApiOriginOrDefault(
        "https://cold-start-samay58s-projects.vercel.app",
        "https://cold-start-samay58s-projects.vercel.app"
      )
    ).toBe("https://cold-start-samay58s-projects.vercel.app");
  });

  it("replaces stale local origins in production builds", () => {
    expect(
      storedApiOriginOrDefault(
        "http://localhost:3000",
        "https://cold-start-samay58s-projects.vercel.app"
      )
    ).toBe("https://cold-start-samay58s-projects.vercel.app");
    expect(
      storedApiOriginOrDefault(
        "http://127.0.0.1:3000",
        "https://cold-start-samay58s-projects.vercel.app"
      )
    ).toBe("https://cold-start-samay58s-projects.vercel.app");
  });

  it("replaces legacy production origins with the current production default", () => {
    expect(
      storedApiOriginOrDefault(
        "https://coldstart.semitechie.vc",
        "https://cold-start-samay58s-projects.vercel.app"
      )
    ).toBe("https://cold-start-samay58s-projects.vercel.app");
  });

  it("falls back when stored origins are malformed", () => {
    expect(storedApiOriginOrDefault("not a url", "http://localhost:3000")).toBe("http://localhost:3000");
  });
});

describe("storedApiTokenOrDefault", () => {
  it("preserves local development tokens in local builds", () => {
    expect(storedApiTokenOrDefault(" local-extension-token ", "http://localhost:3000")).toBe("local-extension-token");
  });

  it("clears the local development token in production builds", () => {
    expect(
      storedApiTokenOrDefault(
        "local-extension-token",
        "https://cold-start-samay58s-projects.vercel.app"
      )
    ).toBe("");
  });
});

describe("storedSettingsOrDefault", () => {
  it("migrates stale local settings to production defaults", () => {
    expect(
      storedSettingsOrDefault(
        { apiOrigin: "http://localhost:3000", apiToken: "local-extension-token" },
        "https://cold-start-samay58s-projects.vercel.app"
      )
    ).toEqual({
      apiOrigin: "https://cold-start-samay58s-projects.vercel.app",
      apiToken: ""
    });
  });

  it("preserves production settings once saved", () => {
    expect(
      storedSettingsOrDefault(
        { apiOrigin: "https://cold-start-samay58s-projects.vercel.app", apiToken: "prod-token" },
        "https://cold-start-samay58s-projects.vercel.app"
      )
    ).toEqual({
      apiOrigin: "https://cold-start-samay58s-projects.vercel.app",
      apiToken: "prod-token"
    });
  });
});

describe("resolveStoredSettings", () => {
  it("marks stale local production settings for persistence", () => {
    expect(
      resolveStoredSettings(
        { apiOrigin: "http://localhost:3000", apiToken: "local-extension-token" },
        "https://cold-start-samay58s-projects.vercel.app"
      )
    ).toEqual({
      settings: {
        apiOrigin: "https://cold-start-samay58s-projects.vercel.app",
        apiToken: ""
      },
      shouldPersist: true
    });
  });

  it("does not rewrite already-current settings", () => {
    expect(
      resolveStoredSettings(
        { apiOrigin: "https://cold-start-samay58s-projects.vercel.app", apiToken: "prod-token" },
        "https://cold-start-samay58s-projects.vercel.app"
      )
    ).toEqual({
      settings: {
        apiOrigin: "https://cold-start-samay58s-projects.vercel.app",
        apiToken: "prod-token"
      },
      shouldPersist: false
    });
  });
});

describe("readableCompanyNameFromDomain", () => {
  it("derives a clean company label from a domain", () => {
    expect(readableCompanyNameFromDomain("https://www.twelve-labs.io/path")).toBe("Twelve Labs");
    expect(readableCompanyNameFromDomain("harvey.ai")).toBe("Harvey");
  });
});

describe("buildCardRequest", () => {
  it("builds the card URL with bearer authorization and extension identity", () => {
    const request = buildCardRequest(
      "www.Linear.app",
      {
        apiOrigin: "https://cold-start-samay58s-projects.vercel.app",
        apiToken: "token-123"
      },
      undefined,
      "extension-123"
    );

    expect(request.url).toBe("https://cold-start-samay58s-projects.vercel.app/api/extension/cards/linear");
    expect(request.init.headers).toEqual({
      Authorization: "Bearer token-123",
      [COLD_START_CLIENT_CONTRACT_HEADER]: COLD_START_API_CONTRACT_VERSION,
      "X-Cold-Start-Extension-Id": "extension-123"
    });
  });
});

describe("buildGenerateRequest", () => {
  it("builds a basics generation request without confirmation by default", () => {
    const request = buildGenerateRequest(
      "legora.com",
      {
        apiOrigin: "http://localhost:3000",
        apiToken: "token-123"
      },
      undefined,
      "basics",
      false,
      "extension-123"
    );

    expect(request.url).toBe("http://localhost:3000/api/generate");
    expect(request.init.method).toBe("POST");
    expect(request.init.headers).toEqual({
      Authorization: "Bearer token-123",
      "Content-Type": "application/json",
      [COLD_START_CLIENT_CONTRACT_HEADER]: COLD_START_API_CONTRACT_VERSION,
      "X-Cold-Start-Extension-Id": "extension-123"
    });
    expect(request.init.body).toBe(JSON.stringify({ domain: "legora.com", mode: "basics" }));
  });

  it("builds a confirmed analysis generation request", () => {
    const request = buildGenerateRequest(
      "legora.com",
      {
        apiOrigin: "http://localhost:3000",
        apiToken: "token-123"
      },
      undefined,
      "analysis",
      true,
      "extension-123"
    );

    expect(request.init.body).toBe(JSON.stringify({ domain: "legora.com", mode: "analysis", confirmStart: true }));
  });

  it("can request a forced basics refresh for stale card-backed sections", () => {
    const request = buildGenerateRequest(
      "legora.com",
      {
        apiOrigin: "http://localhost:3000",
        apiToken: "token-123"
      },
      undefined,
      "basics",
      true,
      "extension-123",
      true
    );

    expect(request.init.body).toBe(JSON.stringify({
      domain: "legora.com",
      mode: "basics",
      confirmStart: true,
      forceRefresh: true
    }));
  });
});

describe("parseCardResponse", () => {
  function cardResponse(body: unknown, init?: ResponseInit) {
    const response = new Response(JSON.stringify(body), init);
    response.headers.set(COLD_START_API_CONTRACT_HEADER, COLD_START_API_CONTRACT_VERSION);
    return response;
  }

  it("throws the API error detail when a response fails", async () => {
    const response = new Response(JSON.stringify({ error: "invalid token" }), { status: 401 });

    await expect(parseCardResponse(response)).rejects.toMatchObject(new ApiError("invalid token", 401));
  });

  it("throws the status when the response body is not JSON", async () => {
    const response = new Response("nope", { status: 502 });

    await expect(parseCardResponse(response)).rejects.toThrow("request failed with 502");
  });

  it("rejects successful responses from an API with no contract header", async () => {
    const response = new Response(JSON.stringify({ slug: "cartesia" }), { status: 200 });

    await expect(parseCardResponse(response)).rejects.toMatchObject(
      new ApiError("api deployment out of date", 426)
    );
  });

  it("accepts successful responses with the matching API contract", async () => {
    const response = cardResponse({ slug: "cartesia" });

    await expect(parseCardResponse(response)).resolves.toEqual({ slug: "cartesia" });
  });
});

describe("parseGenerateResponse", () => {
  it("returns the generation status response", async () => {
    const response = new Response(JSON.stringify({ slug: "legora", status: "queued", mode: "basics" }), { status: 202 });
    response.headers.set(COLD_START_API_CONTRACT_HEADER, COLD_START_API_CONTRACT_VERSION);

    await expect(parseGenerateResponse(response)).resolves.toEqual({ slug: "legora", status: "queued", mode: "basics" });
  });

  it("throws the API error detail when generation fails", async () => {
    const response = new Response(JSON.stringify({ error: "failed to queue generation" }), { status: 500 });

    await expect(parseGenerateResponse(response)).rejects.toMatchObject(
      new ApiError("failed to queue generation", 500)
    );
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

  it("explains API generation failures without leaking raw status text", () => {
    expect(readableCardError("request failed with 500", "http://localhost:3000")).toContain("worker logs");
  });

  it("explains the retired basics quality gate as deployment skew", () => {
    expect(
      readableCardError(
        "generated basics underfilled public profile (4/4 structured facts)",
        "https://cold-start-samay58s-projects.vercel.app"
      )
    ).toContain("latest API");
  });

  it("explains API contract mismatches as deployment skew", () => {
    expect(readableCardError("api deployment out of date", "https://cold-start-samay58s-projects.vercel.app")).toContain(
      "out of date"
    );
  });

  it("points production-origin failures back to localhost for local testing", () => {
    expect(readableCardError("Failed to fetch", "https://coldstart.semitechie.vc")).toBe(
      "Could not reach https://coldstart.semitechie.vc. For local testing, set API origin to http://localhost:3000."
    );
  });
});
