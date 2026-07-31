import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createDb: vi.fn(),
  findAlphaInviteCardBySlug: vi.fn()
}));

mocks.createDb.mockReturnValue({});

vi.mock("@cold-start/db", () => ({
  createDb: mocks.createDb,
  findAlphaInviteCardBySlug: mocks.findAlphaInviteCardBySlug
}));

vi.mock("../src/lib/web-env", () => ({
  webEnv: () => ({ DATABASE_URL: "postgres://example.test/cold-start" })
}));

const cardRoute = await import("../src/app/i/[slug]/card.png/route");

function request(path: string) {
  return new Request(`http://localhost${path}`);
}

describe("GET /i/[slug]/card.png", () => {
  it("serves stored bytes as an immutable png", async () => {
    const pngBase64 = Buffer.from("png-bytes").toString("base64");
    mocks.findAlphaInviteCardBySlug.mockResolvedValue({
      displayName: "Dad",
      ordinal: 4,
      cardPngBase64: pngBase64
    });

    const response = await cardRoute.GET(request("/i/dad/card.png"), {
      params: Promise.resolve({ slug: "dad" })
    });

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("image/png");
    expect(response.headers.get("cache-control")).toContain("immutable");
    expect(Buffer.from(await response.arrayBuffer()).toString("utf8")).toBe("png-bytes");
  });

  it("404s an unknown slug", async () => {
    mocks.findAlphaInviteCardBySlug.mockResolvedValue(null);

    const response = await cardRoute.GET(request("/i/none/card.png"), {
      params: Promise.resolve({ slug: "none" })
    });

    expect(response.status).toBe(404);
  });

  it("404s a malformed slug without touching the database", async () => {
    mocks.findAlphaInviteCardBySlug.mockClear();

    const response = await cardRoute.GET(request("/i/BAD%20slug/card.png"), {
      params: Promise.resolve({ slug: "BAD slug" })
    });

    expect(response.status).toBe(404);
    expect(mocks.findAlphaInviteCardBySlug).not.toHaveBeenCalled();
  });
});
