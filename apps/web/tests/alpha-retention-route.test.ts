import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const plan = {
  eventsBefore: new Date("2026-06-01T00:00:00.000Z"),
  accessRequestsBefore: new Date("2026-06-01T00:00:00.000Z"),
  inviteAttemptsBefore: new Date("2026-06-30T00:00:00.000Z"),
  howItWinsJudgmentsBefore: new Date("2026-04-02T00:00:00.000Z")
};

const zeroes = {
  events: { deleted: 0, stoppedAtMax: false },
  accessRequests: { deleted: 0, stoppedAtMax: false },
  inviteAttempts: { deleted: 0, stoppedAtMax: false },
  howItWinsJudgments: { deleted: 0, stoppedAtMax: false }
};

const mocks = vi.hoisted(() => ({
  createDb: vi.fn(() => ({ kind: "db" })),
  alphaRetentionPlan: vi.fn(() => plan),
  pruneAlphaRetention: vi.fn()
}));

vi.mock("@cold-start/db", () => ({
  ALPHA_RETENTION_BATCH_SIZE: 1_000,
  ALPHA_RETENTION_MAX_DELETIONS: 10_000,
  createDb: mocks.createDb,
  alphaRetentionPlan: mocks.alphaRetentionPlan,
  pruneAlphaRetention: mocks.pruneAlphaRetention
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
    mocks.alphaRetentionPlan.mockClear();
    mocks.pruneAlphaRetention.mockReset().mockResolvedValue(zeroes);
  });

  afterEach(() => {
    delete process.env.CRON_SECRET;
  });

  it("fails closed when the cron secret is absent", async () => {
    delete process.env.CRON_SECRET;

    const response = await GET(request());

    expect(response.status).toBe(503);
    expect(mocks.pruneAlphaRetention).not.toHaveBeenCalled();
  });

  it("rejects an invalid bearer secret before opening the database", async () => {
    const response = await GET(request("wrong-secret"));

    expect(response.status).toBe(401);
    expect(mocks.createDb).not.toHaveBeenCalled();
    expect(mocks.pruneAlphaRetention).not.toHaveBeenCalled();
  });

  it("uses the shared fixed-age plan and bounded pruner", async () => {
    mocks.pruneAlphaRetention.mockResolvedValue({
      ...zeroes,
      events: { deleted: 1_230, stoppedAtMax: false },
      accessRequests: { deleted: 42, stoppedAtMax: false },
      howItWinsJudgments: { deleted: 7, stoppedAtMax: false }
    });

    const response = await GET(request());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(mocks.pruneAlphaRetention).toHaveBeenCalledWith(
      { kind: "db" },
      { plan, kinds: ["events", "accessRequests", "howItWinsJudgments"], batch: 1_000, maximum: 10_000 }
    );
    expect(body).toMatchObject({
      deleted: 1_230,
      accessRequestsDeleted: 42,
      howItWinsJudgmentsDeleted: 7,
      howItWinsJudgmentsBefore: plan.howItWinsJudgmentsBefore.toISOString(),
      capped: false
    });
  });

  it("reports a cap from any shared retention kind", async () => {
    mocks.pruneAlphaRetention.mockResolvedValue({
      ...zeroes,
      howItWinsJudgments: { deleted: 10_000, stoppedAtMax: true }
    });

    const response = await GET(request());

    await expect(response.json()).resolves.toMatchObject({
      deleted: 0,
      howItWinsJudgmentsDeleted: 10_000,
      capped: true
    });
  });
});
