import { COLD_START_API_CONTRACT_HEADER, COLD_START_API_CONTRACT_VERSION } from "@cold-start/core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getFullCachedCard: vi.fn(),
  getLatestProviderFailureSummary: vi.fn()
}));

vi.mock("../src/lib/cards", () => ({
  getFullCachedCard: mocks.getFullCachedCard,
  getLatestProviderFailureSummary: mocks.getLatestProviderFailureSummary
}));

const { GET } = await import("../src/app/api/extension/cards/[slug]/route");
const originalAllowedOrigins = process.env.ALLOWED_EXTENSION_ORIGINS;
const originalChromeExtensionId = process.env.CHROME_EXTENSION_ID;
const originalApiToken = process.env.EXTENSION_API_TOKEN;
const originalNodeEnv = process.env.NODE_ENV;

function extensionRequest(origin?: string, token?: string, extensionId?: string) {
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

  return new Request("http://localhost/api/extension/cards/cartesia", { headers });
}

function params(slug = "cartesia") {
  return { params: Promise.resolve({ slug }) };
}

describe("GET /api/extension/cards/[slug]", () => {
  beforeEach(() => {
    process.env.NODE_ENV = "test";
    delete process.env.ALLOWED_EXTENSION_ORIGINS;
    delete process.env.CHROME_EXTENSION_ID;
    process.env.EXTENSION_API_TOKEN = "secret";
    mocks.getFullCachedCard.mockReset();
    mocks.getLatestProviderFailureSummary.mockReset();
    // Default: no provider failures recorded. Individual tests override when asserting header behavior.
    mocks.getLatestProviderFailureSummary.mockResolvedValue({
      failedCount: 0,
      topReason: null,
      topEndpoint: null,
      startedAt: null
    });
  });

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

  it("rejects an allowed origin without a token", async () => {
    const response = await GET(extensionRequest("chrome-extension://local-dev"), params());

    await expect(response.json()).resolves.toEqual({ error: "extension token required" });
    expect(response.status).toBe(401);
    expect(mocks.getFullCachedCard).not.toHaveBeenCalled();
  });

  it("rejects an allowed origin with a wrong token", async () => {
    const response = await GET(extensionRequest("chrome-extension://local-dev", "wrong"), params());

    await expect(response.json()).resolves.toEqual({ error: "extension token invalid" });
    expect(response.status).toBe(401);
    expect(mocks.getFullCachedCard).not.toHaveBeenCalled();
  });

  it("rejects a disallowed extension identity with a valid token", async () => {
    const response = await GET(extensionRequest("https://example.com", "secret"), params());

    await expect(response.json()).resolves.toEqual({ error: "extension identity required" });
    expect(response.status).toBe(403);
    expect(mocks.getFullCachedCard).not.toHaveBeenCalled();
  });

  it("returns the full cached card including synthesis for allowed origins with a valid token", async () => {
    const fullCard = {
      slug: "cartesia",
      team: {
        founders: {
          value: [{
            name: "Karan Goel",
            role: "Co-Founder",
            sourceUrl: null,
            email: "karan@cartesia.ai",
            read: { text: "Second robotics company; the first sold to Deere in 2021.", citationIds: ["c1"] }
          }]
        }
      },
      synthesis: {
        whyItMatters: { text: "Fast inference matters [c1].", citationIds: ["c1"] },
        bullCase: [],
        bearCase: [],
        openQuestions: []
      }
    };
    mocks.getFullCachedCard.mockResolvedValue(fullCard);

    const response = await GET(extensionRequest("chrome-extension://local-dev", "secret"), params());

    await expect(response.json()).resolves.toEqual(fullCard);
    expect(JSON.stringify(fullCard)).toContain("karan@cartesia.ai");
    // The extension is the gated surface: it gets the person read when the card has one stored.
    expect(JSON.stringify(fullCard)).toContain("Second robotics company");
    expect(response.status).toBe(200);
    expect(response.headers.get(COLD_START_API_CONTRACT_HEADER)).toBe(COLD_START_API_CONTRACT_VERSION);
    expect(mocks.getFullCachedCard).toHaveBeenCalledWith("cartesia");
  });

  it("returns the full cached card for local Chrome extension requests without Origin", async () => {
    const fullCard = {
      slug: "cartesia",
      synthesis: {
        whyItMatters: { text: "Fast inference matters [c1].", citationIds: ["c1"] },
        bullCase: [],
        bearCase: [],
        openQuestions: []
      }
    };
    mocks.getFullCachedCard.mockResolvedValue(fullCard);

    const response = await GET(extensionRequest(undefined, "secret", "generated-extension-id"), params());

    await expect(response.json()).resolves.toEqual(fullCard);
    expect(response.status).toBe(200);
    expect(mocks.getFullCachedCard).toHaveBeenCalledWith("cartesia");
  });

  it("returns 404 when no full cached card exists", async () => {
    mocks.getFullCachedCard.mockResolvedValue(null);

    const response = await GET(extensionRequest("http://localhost:5173", "secret"), params("missing"));

    await expect(response.json()).resolves.toEqual({ error: "card not found" });
    expect(response.status).toBe(404);
    expect(response.headers.get(COLD_START_API_CONTRACT_HEADER)).toBe(COLD_START_API_CONTRACT_VERSION);
    expect(mocks.getFullCachedCard).toHaveBeenCalledWith("missing");
  });

  it("fails closed before reading when production extension auth config is missing", async () => {
    process.env.NODE_ENV = "production";
    delete process.env.ALLOWED_EXTENSION_ORIGINS;
    delete process.env.CHROME_EXTENSION_ID;
    delete process.env.EXTENSION_API_TOKEN;

    const response = await GET(extensionRequest("chrome-extension://local-dev", "secret"), params());

    await expect(response.json()).resolves.toEqual({ error: "extension auth not configured" });
    expect(response.status).toBe(500);
    expect(mocks.getFullCachedCard).not.toHaveBeenCalled();
  });

  it("allows configured production origin with a valid token", async () => {
    process.env.NODE_ENV = "production";
    process.env.ALLOWED_EXTENSION_ORIGINS = "chrome-extension://prod-id";
    process.env.EXTENSION_API_TOKEN = "prod-secret";
    mocks.getFullCachedCard.mockResolvedValue({ slug: "cartesia", synthesis: { openQuestions: [] } });

    const response = await GET(extensionRequest("chrome-extension://prod-id", "prod-secret"), params());

    expect(response.status).toBe(200);
    expect(mocks.getFullCachedCard).toHaveBeenCalledWith("cartesia");
  });

  it("fails closed before reading when production auth uses local sentinel values", async () => {
    process.env.NODE_ENV = "production";
    process.env.ALLOWED_EXTENSION_ORIGINS = "chrome-extension://prod-id,http://localhost:5173";
    process.env.EXTENSION_API_TOKEN = "local-extension-token";

    const response = await GET(extensionRequest("chrome-extension://prod-id", "local-extension-token"), params());

    await expect(response.json()).resolves.toEqual({ error: "extension auth not configured" });
    expect(response.status).toBe(500);
    expect(mocks.getFullCachedCard).not.toHaveBeenCalled();
  });

  it("allows configured production extension ID without Origin", async () => {
    process.env.NODE_ENV = "production";
    delete process.env.ALLOWED_EXTENSION_ORIGINS;
    process.env.CHROME_EXTENSION_ID = "prod-id";
    process.env.EXTENSION_API_TOKEN = "prod-secret";
    mocks.getFullCachedCard.mockResolvedValue({ slug: "cartesia", synthesis: { openQuestions: [] } });

    const response = await GET(extensionRequest(undefined, "prod-secret", "prod-id"), params());

    expect(response.status).toBe(200);
    expect(mocks.getFullCachedCard).toHaveBeenCalledWith("cartesia");
  });
});
