import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createDb: vi.fn(() => ({})),
  findActiveAlphaInviteCardByPresentationTokenHash: vi.fn()
}));

vi.mock("@cold-start/db", () => ({
  createDb: mocks.createDb,
  findActiveAlphaInviteCardByPresentationTokenHash: mocks.findActiveAlphaInviteCardByPresentationTokenHash
}));

vi.mock("../src/lib/web-env", () => ({
  webEnv: () => ({ DATABASE_URL: "postgres://example.test/cold-start" })
}));

const cardRoute = await import("../src/app/i/[slug]/card.png/route");
const token = "p".repeat(43);

describe("GET /i/[slug]/card.png", () => {
  beforeEach(() => {
    mocks.findActiveAlphaInviteCardByPresentationTokenHash.mockReset();
  });

  it("serves protected stored bytes without cache or referrer leakage", async () => {
    mocks.findActiveAlphaInviteCardByPresentationTokenHash.mockResolvedValue({
      displayName: "Dad",
      ordinal: 4,
      cardPngBase64: Buffer.from("png-bytes").toString("base64")
    });

    const response = await cardRoute.GET(new Request(`http://localhost/i/${token}/card.png`), {
      params: Promise.resolve({ slug: token })
    });

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("image/png");
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(response.headers.get("referrer-policy")).toBe("no-referrer");
    expect(response.headers.get("x-robots-tag")).toContain("noindex");
    expect(Buffer.from(await response.arrayBuffer()).toString("utf8")).toBe("png-bytes");
  });

  it("serves stored JPEG bytes with an honest content type", async () => {
    mocks.findActiveAlphaInviteCardByPresentationTokenHash.mockResolvedValue({
      displayName: "Dad",
      ordinal: 4,
      cardPngBase64: Buffer.from([0xff, 0xd8, 0xff, 0xe0]).toString("base64")
    });

    const response = await cardRoute.GET(new Request(`http://localhost/i/${token}/card.png`), {
      params: Promise.resolve({ slug: token })
    });
    expect(response.headers.get("content-type")).toBe("image/jpeg");
  });

  it("404s legacy name slugs without a database lookup", async () => {
    const response = await cardRoute.GET(new Request("http://localhost/i/dad/card.png"), {
      params: Promise.resolve({ slug: "dad" })
    });
    expect(response.status).toBe(404);
    expect(mocks.findActiveAlphaInviteCardByPresentationTokenHash).not.toHaveBeenCalled();
  });

  it("404s an unknown capability", async () => {
    mocks.findActiveAlphaInviteCardByPresentationTokenHash.mockResolvedValue(null);
    const response = await cardRoute.GET(new Request(`http://localhost/i/${token}/card.png`), {
      params: Promise.resolve({ slug: token })
    });
    expect(response.status).toBe(404);
  });
});
