import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getFullCachedCard: vi.fn()
}));

vi.mock("../src/lib/cards", () => ({
  getFullCachedCard: mocks.getFullCachedCard
}));

const { GET } = await import("../src/app/api/extension/cards/[slug]/route");
const originalAllowedOrigins = process.env.ALLOWED_EXTENSION_ORIGINS;

function extensionRequest(origin?: string) {
  const headers = new Headers();
  if (origin) {
    headers.set("origin", origin);
  }

  return new Request("http://localhost/api/extension/cards/cartesia", { headers });
}

function params(slug = "cartesia") {
  return { params: Promise.resolve({ slug }) };
}

describe("GET /api/extension/cards/[slug]", () => {
  beforeEach(() => {
    delete process.env.ALLOWED_EXTENSION_ORIGINS;
    mocks.getFullCachedCard.mockReset();
  });

  afterEach(() => {
    if (originalAllowedOrigins === undefined) {
      delete process.env.ALLOWED_EXTENSION_ORIGINS;
    } else {
      process.env.ALLOWED_EXTENSION_ORIGINS = originalAllowedOrigins;
    }
  });

  it("rejects requests without an allowed extension origin", async () => {
    const response = await GET(extensionRequest(), params());

    await expect(response.json()).resolves.toEqual({ error: "extension origin required" });
    expect(response.status).toBe(403);
    expect(mocks.getFullCachedCard).not.toHaveBeenCalled();
  });

  it("returns the full cached card including synthesis for allowed origins", async () => {
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

    const response = await GET(extensionRequest("chrome-extension://local-dev"), params());

    await expect(response.json()).resolves.toEqual(fullCard);
    expect(response.status).toBe(200);
    expect(mocks.getFullCachedCard).toHaveBeenCalledWith("cartesia");
  });

  it("returns 404 when no full cached card exists", async () => {
    mocks.getFullCachedCard.mockResolvedValue(null);

    const response = await GET(extensionRequest("http://localhost:5173"), params("missing"));

    await expect(response.json()).resolves.toEqual({ error: "card not found" });
    expect(response.status).toBe(404);
    expect(mocks.getFullCachedCard).toHaveBeenCalledWith("missing");
  });
});
