import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createDb: vi.fn(() => ({ kind: "db" })),
  pruneEvents: vi.fn()
}));

vi.mock("@cold-start/db", () => ({
  createDb: mocks.createDb,
  pruneAlphaEvents: mocks.pruneEvents
}));

vi.mock("../src/lib/web-env", () => ({
  webEnv: () => ({ DATABASE_URL: "postgres://user:pass@example.com/db" })
}));

const { GET } = await import("../src/app/api/alpha/retention/route");

function request(secret = "retention-secret") {
  return new Request("http://localhost/api/alpha/retention", {
    headers: { authorization: `Bearer ${secret}` }
  });
}

describe("GET /api/alpha/retention", () => {
  beforeEach(() => {
    process.env.CRON_SECRET = "retention-secret";
    mocks.createDb.mockClear();
    mocks.pruneEvents.mockReset().mockResolvedValue(0);
  });

  afterEach(() => {
    delete process.env.CRON_SECRET;
  });

  it("fails closed when the cron secret is absent", async () => {
    delete process.env.CRON_SECRET;

    const response = await GET(request());

    expect(response.status).toBe(503);
    expect(mocks.pruneEvents).not.toHaveBeenCalled();
  });

  it("rejects an invalid bearer secret before opening the database", async () => {
    const response = await GET(request("wrong-secret"));

    expect(response.status).toBe(401);
    expect(mocks.createDb).not.toHaveBeenCalled();
    expect(mocks.pruneEvents).not.toHaveBeenCalled();
  });

  it("prunes 30-day-old events in bounded batches", async () => {
    mocks.pruneEvents
      .mockResolvedValueOnce(1_000)
      .mockResolvedValueOnce(230);

    const response = await GET(request());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(body).toMatchObject({ deleted: 1_230, capped: false });
    expect(new Date(body.before).getTime()).toBeLessThan(Date.now());
    expect(mocks.pruneEvents).toHaveBeenCalledTimes(2);
    expect(mocks.pruneEvents).toHaveBeenNthCalledWith(
      1,
      { kind: "db" },
      expect.objectContaining({ limit: 1_000 })
    );
  });

  it("stops at the per-invocation deletion cap", async () => {
    mocks.pruneEvents.mockResolvedValue(1_000);

    const response = await GET(request());

    await expect(response.json()).resolves.toMatchObject({
      deleted: 10_000,
      capped: true
    });
    expect(mocks.pruneEvents).toHaveBeenCalledTimes(10);
  });
});
