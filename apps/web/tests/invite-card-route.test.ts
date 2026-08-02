import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  countRecentAlphaInviteAttempts: vi.fn(),
  createDb: vi.fn(),
  findAlphaInviteCardBySlug: vi.fn(),
  recordAlphaInviteAttempt: vi.fn()
}));

mocks.createDb.mockReturnValue({});

vi.mock("@cold-start/db", () => ({
  countRecentAlphaInviteAttempts: mocks.countRecentAlphaInviteAttempts,
  createDb: mocks.createDb,
  findAlphaInviteCardBySlug: mocks.findAlphaInviteCardBySlug,
  recordAlphaInviteAttempt: mocks.recordAlphaInviteAttempt
}));

vi.mock("../src/lib/web-env", () => ({
  webEnv: () => ({ DATABASE_URL: "postgres://example.test/cold-start" })
}));

const cardRoute = await import("../src/app/i/[slug]/card.png/route");

function request(path: string) {
  return new Request(`http://localhost${path}`);
}

describe("GET /i/[slug]/card.png", () => {
  beforeEach(() => {
    mocks.countRecentAlphaInviteAttempts.mockReset();
    mocks.countRecentAlphaInviteAttempts.mockResolvedValue(0);
    mocks.recordAlphaInviteAttempt.mockReset();
    mocks.findAlphaInviteCardBySlug.mockReset();
  });

  it("serves stored bytes as a privately-cached png", async () => {
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
    expect(response.headers.get("cache-control")).toBe("private, max-age=3600");
    expect(Buffer.from(await response.arrayBuffer()).toString("utf8")).toBe("png-bytes");
  });

  it("serves stored JPEG bytes with an honest content type", async () => {
    const jpegBase64 = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]).toString("base64");
    mocks.findAlphaInviteCardBySlug.mockResolvedValue({
      displayName: "Dad",
      ordinal: 4,
      cardPngBase64: jpegBase64
    });

    const response = await cardRoute.GET(request("/i/dad/card.png"), {
      params: Promise.resolve({ slug: "dad" })
    });

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("image/jpeg");
  });

  it("404s an unknown slug without touching the token breaker", async () => {
    mocks.findAlphaInviteCardBySlug.mockResolvedValue(null);

    const response = await cardRoute.GET(request("/i/none/card.png"), {
      params: Promise.resolve({ slug: "none" })
    });

    expect(response.status).toBe(404);
    expect(mocks.countRecentAlphaInviteAttempts).not.toHaveBeenCalled();
    expect(mocks.recordAlphaInviteAttempt).not.toHaveBeenCalled();
  });

  it("404s a malformed slug without touching the database", async () => {
    const response = await cardRoute.GET(request("/i/BAD%20slug/card.png"), {
      params: Promise.resolve({ slug: "BAD slug" })
    });

    expect(response.status).toBe(404);
    expect(mocks.findAlphaInviteCardBySlug).not.toHaveBeenCalled();
    expect(mocks.countRecentAlphaInviteAttempts).not.toHaveBeenCalled();
  });

  it("serves a real card while the token breaker is open", async () => {
    mocks.countRecentAlphaInviteAttempts.mockResolvedValue(10);
    mocks.findAlphaInviteCardBySlug.mockResolvedValue({
      displayName: "Dad",
      ordinal: 4,
      cardPngBase64: Buffer.from("png-bytes").toString("base64")
    });

    const response = await cardRoute.GET(request("/i/dad/card.png"), {
      params: Promise.resolve({ slug: "dad" })
    });

    expect(response.status).toBe(200);
    expect(mocks.findAlphaInviteCardBySlug).toHaveBeenCalledWith({}, "dad");
    expect(mocks.countRecentAlphaInviteAttempts).not.toHaveBeenCalled();
    expect(mocks.recordAlphaInviteAttempt).not.toHaveBeenCalled();
  });
});
