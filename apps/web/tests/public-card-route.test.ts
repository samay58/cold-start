import { COLD_START_API_CONTRACT_HEADER, COLD_START_API_CONTRACT_VERSION } from "@cold-start/core";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getFullCachedCard: vi.fn(),
  getPublicCachedCard: vi.fn(),
  getLatestProviderFailureSummary: vi.fn()
}));

vi.mock("../src/lib/cards", () => ({
  getFullCachedCard: mocks.getFullCachedCard,
  getPublicCachedCard: mocks.getPublicCachedCard,
  getLatestProviderFailureSummary: mocks.getLatestProviderFailureSummary
}));

const { GET } = await import("../src/app/api/cards/[slug]/route");

function params(slug = "cartesia") {
  return { params: Promise.resolve({ slug }) };
}

describe("GET /api/cards/[slug]", () => {
  beforeEach(() => {
    mocks.getFullCachedCard.mockReset();
    mocks.getPublicCachedCard.mockReset();
    mocks.getLatestProviderFailureSummary.mockReset();
    mocks.getLatestProviderFailureSummary.mockResolvedValue({
      failedCount: 0,
      topReason: null,
      topEndpoint: null,
      startedAt: null
    });
  });

  it("returns the public cached card without synthesis", async () => {
    const publicCard = {
      slug: "cartesia",
      identity: { name: { value: "Cartesia" } },
      team: { founders: { value: [{ name: "Karan Goel", role: "Co-Founder", sourceUrl: null }] } }
    };
    mocks.getPublicCachedCard.mockResolvedValue(publicCard);
    mocks.getFullCachedCard.mockResolvedValue({
      ...publicCard,
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
      synthesis: { whyItMatters: { text: "Hidden [c1].", citationIds: ["c1"] } }
    });

    const response = await GET(new Request("http://localhost/api/cards/cartesia"), params());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(response.headers.get(COLD_START_API_CONTRACT_HEADER)).toBe(COLD_START_API_CONTRACT_VERSION);
    expect(body).toEqual(publicCard);
    expect(body).not.toHaveProperty("synthesis");
    expect(JSON.stringify(body)).not.toContain("karan@cartesia.ai");
    // The person read is extension-tier judgment, stripped from the public wire response
    // exactly like email.
    expect(JSON.stringify(body)).not.toContain("Second robotics company");
    expect(mocks.getPublicCachedCard).toHaveBeenCalledWith("cartesia");
    expect(mocks.getFullCachedCard).not.toHaveBeenCalled();
  });

  it("sets x-cold-start-provider-failure headers when the last generation_run had provider failures", async () => {
    const publicCard = { slug: "cartesia", identity: { name: { value: "Cartesia" } } };
    mocks.getPublicCachedCard.mockResolvedValue(publicCard);
    mocks.getLatestProviderFailureSummary.mockResolvedValue({
      failedCount: 25,
      topReason: "insufficient_balance",
      topEndpoint: "hunter_email_verifier",
      startedAt: new Date("2026-05-26T04:41:27.000Z")
    });

    const response = await GET(new Request("http://localhost/api/cards/cartesia"), params());

    expect(response.status).toBe(200);
    expect(response.headers.get("x-cold-start-provider-failures")).toBe("25");
    expect(response.headers.get("x-cold-start-provider-top-reason")).toBe("insufficient_balance");
    expect(response.headers.get("x-cold-start-provider-top-endpoint")).toBe("hunter_email_verifier");
  });

  it("does not set provider-failure headers when the last generation_run was clean", async () => {
    mocks.getPublicCachedCard.mockResolvedValue({ slug: "cartesia", identity: { name: { value: "Cartesia" } } });

    const response = await GET(new Request("http://localhost/api/cards/cartesia"), params());

    expect(response.headers.get("x-cold-start-provider-failures")).toBeNull();
    expect(response.headers.get("x-cold-start-provider-top-reason")).toBeNull();
  });
});
