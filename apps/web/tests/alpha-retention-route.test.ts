import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createDb: vi.fn(() => ({ kind: "db" })),
  pruneEvents: vi.fn(),
  pruneAccessRequests: vi.fn(),
  pruneJudgments: vi.fn()
}));

vi.mock("@cold-start/db", () => ({
  createDb: mocks.createDb,
  pruneAlphaEvents: mocks.pruneEvents,
  pruneHandledAccessRequests: mocks.pruneAccessRequests,
  pruneHowItWinsJudgments: mocks.pruneJudgments
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
    mocks.pruneAccessRequests.mockReset().mockResolvedValue(0);
    mocks.pruneJudgments.mockReset().mockResolvedValue(0);
  });

  afterEach(() => {
    delete process.env.CRON_SECRET;
  });

  it("fails closed when the cron secret is absent", async () => {
    delete process.env.CRON_SECRET;

    const response = await GET(request());

    expect(response.status).toBe(503);
    expect(mocks.pruneEvents).not.toHaveBeenCalled();
    expect(mocks.pruneAccessRequests).not.toHaveBeenCalled();
  });

  it("rejects an invalid bearer secret before opening the database", async () => {
    const response = await GET(request("wrong-secret"));

    expect(response.status).toBe(401);
    expect(mocks.createDb).not.toHaveBeenCalled();
    expect(mocks.pruneEvents).not.toHaveBeenCalled();
    expect(mocks.pruneAccessRequests).not.toHaveBeenCalled();
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

  it("prunes handled access requests past the same 30-day boundary and reports the count", async () => {
    mocks.pruneEvents.mockResolvedValue(0);
    mocks.pruneAccessRequests
      .mockResolvedValueOnce(1_000)
      .mockResolvedValueOnce(42);

    const response = await GET(request());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({ accessRequestsDeleted: 1_042, capped: false });
    expect(mocks.pruneAccessRequests).toHaveBeenCalledTimes(2);
    const [dbArg, inputArg] = mocks.pruneAccessRequests.mock.calls[0];
    expect(dbArg).toEqual({ kind: "db" });
    expect(inputArg.limit).toBe(1_000);
    expect(new Date(inputArg.before).getTime()).toBeLessThan(Date.now());
  });

  it("gives access requests an independent cap when the event backlog is full", async () => {
    mocks.pruneEvents.mockResolvedValue(1_000);
    mocks.pruneAccessRequests.mockResolvedValueOnce(42);

    const response = await GET(request());

    await expect(response.json()).resolves.toMatchObject({
      deleted: 10_000,
      accessRequestsDeleted: 42,
      capped: true
    });
    expect(mocks.pruneAccessRequests).toHaveBeenCalledOnce();
  });

  it("prunes How it wins judgments past a 90-day boundary of their own", async () => {
    mocks.pruneJudgments
      .mockResolvedValueOnce(1_000)
      .mockResolvedValueOnce(7);

    const response = await GET(request());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({ howItWinsJudgmentsDeleted: 1_007, capped: false });
    expect(mocks.pruneJudgments).toHaveBeenCalledTimes(2);
    const [dbArg, inputArg] = mocks.pruneJudgments.mock.calls[0];
    expect(dbArg).toEqual({ kind: "db" });
    expect(inputArg.limit).toBe(1_000);
    const ageDays = (Date.now() - new Date(inputArg.before).getTime()) / (24 * 60 * 60 * 1_000);
    expect(ageDays).toBeGreaterThan(89.9);
    expect(ageDays).toBeLessThan(90.1);
    expect(new Date(body.howItWinsJudgmentsBefore).getTime()).toBe(new Date(inputArg.before).getTime());
  });

  it("caps judgment deletions independently of the event backlog", async () => {
    mocks.pruneJudgments.mockResolvedValue(1_000);

    const response = await GET(request());

    await expect(response.json()).resolves.toMatchObject({
      deleted: 0,
      howItWinsJudgmentsDeleted: 10_000,
      capped: true
    });
    expect(mocks.pruneJudgments).toHaveBeenCalledTimes(10);
  });
});
