import { COLD_START_API_CONTRACT_HEADER, COLD_START_API_CONTRACT_VERSION } from "@cold-start/core";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getFullCachedCard: vi.fn(),
  getPublicCachedCard: vi.fn()
}));

vi.mock("../src/lib/cards", () => ({
  getFullCachedCard: mocks.getFullCachedCard,
  getPublicCachedCard: mocks.getPublicCachedCard
}));

const { GET } = await import("../src/app/api/cards/[slug]/route");

function params(slug = "cartesia") {
  return { params: Promise.resolve({ slug }) };
}

describe("GET /api/cards/[slug]", () => {
  beforeEach(() => {
    mocks.getFullCachedCard.mockReset();
    mocks.getPublicCachedCard.mockReset();
  });

  it("returns the public cached card without synthesis", async () => {
    const publicCard = { slug: "cartesia", identity: { name: { value: "Cartesia" } } };
    mocks.getPublicCachedCard.mockResolvedValue(publicCard);
    mocks.getFullCachedCard.mockResolvedValue({
      ...publicCard,
      synthesis: { whyItMatters: { text: "Hidden [c1].", citationIds: ["c1"] } }
    });

    const response = await GET(new Request("http://localhost/api/cards/cartesia"), params());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(response.headers.get(COLD_START_API_CONTRACT_HEADER)).toBe(COLD_START_API_CONTRACT_VERSION);
    expect(body).toEqual(publicCard);
    expect(body).not.toHaveProperty("synthesis");
    expect(mocks.getPublicCachedCard).toHaveBeenCalledWith("cartesia");
    expect(mocks.getFullCachedCard).not.toHaveBeenCalled();
  });
});
