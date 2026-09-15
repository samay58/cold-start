import { COLD_START_API_CONTRACT_HEADER, COLD_START_API_CONTRACT_VERSION } from "@cold-start/core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createDb: vi.fn(() => ({ kind: "db" })),
  dispatchHowItWinsJob: vi.fn(),
  findActiveAlphaInstallationByTokenHash: vi.fn(),
  getAlphaAllowanceSnapshot: vi.fn(),
  howItWinsStatusForPrincipal: vi.fn(),
  reconcileExpiredHowItWinsJobs: vi.fn(),
  reserveAlphaRunRequest: vi.fn(),
  retryHowItWinsJob: vi.fn(),
  touchAlphaInstallation: vi.fn()
}));

vi.mock("@cold-start/db", async (importOriginal) => {
  const original = await importOriginal<typeof import("@cold-start/db")>();
  return {
    ...original,
    createDb: mocks.createDb,
    findActiveAlphaInstallationByTokenHash: mocks.findActiveAlphaInstallationByTokenHash,
    getAlphaAllowanceSnapshot: mocks.getAlphaAllowanceSnapshot,
    reconcileExpiredHowItWinsJobs: mocks.reconcileExpiredHowItWinsJobs,
    reserveAlphaRunRequest: mocks.reserveAlphaRunRequest,
    touchAlphaInstallation: mocks.touchAlphaInstallation
  };
});

vi.mock("../src/lib/web-env", () => ({
  webEnv: () => ({ DATABASE_URL: "postgres://user:pass@example.com/db" })
}));

vi.mock("../src/inngest/how-it-wins-jobs", () => ({
  dispatchHowItWinsJob: mocks.dispatchHowItWinsJob,
  howItWinsStatusForPrincipal: mocks.howItWinsStatusForPrincipal,
  retryHowItWinsJob: mocks.retryHowItWinsJob
}));

const { GET, POST } = await import("../src/app/api/extension/cards/[slug]/how-it-wins/route");
const originalEnv = {
  ALLOWED_EXTENSION_IDS: process.env.ALLOWED_EXTENSION_IDS,
  ALLOWED_EXTENSION_ORIGINS: process.env.ALLOWED_EXTENSION_ORIGINS,
  ALPHA_ACCESS_ENABLED: process.env.ALPHA_ACCESS_ENABLED,
  CHROME_EXTENSION_ID: process.env.CHROME_EXTENSION_ID,
  DATABASE_URL: process.env.DATABASE_URL,
  EXTENSION_API_TOKEN: process.env.EXTENSION_API_TOKEN,
  EXTENSION_API_TOKENS: process.env.EXTENSION_API_TOKENS,
  NODE_ENV: process.env.NODE_ENV
};

const sourceJobId = "11111111-1111-4111-8111-111111111111";
const retryJobId = "22222222-2222-4222-8222-222222222222";
const requestId = "33333333-3333-4333-8333-333333333333";

function request(method: "GET" | "POST", body?: unknown, token = "operator-secret") {
  return new Request("http://localhost/api/extension/cards/browserbase/how-it-wins", {
    method,
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
      "x-cold-start-extension-id": "extension-test-id"
    },
    ...(body === undefined ? {} : { body: typeof body === "string" ? body : JSON.stringify(body) })
  });
}

function params(slug = "browserbase") {
  return { params: Promise.resolve({ slug }) };
}

function storedJob() {
  const now = new Date("2026-09-14T18:00:00.000Z");
  return {
    id: retryJobId,
    rootJobId: sourceJobId,
    retryOfJobId: sourceJobId,
    sourceAnalysisRunId: "44444444-4444-4444-8444-444444444444",
    slug: "browserbase",
    evidenceHash: "evidence-hash",
    evaluatorSignature: "evaluator-signature",
    executionContractVersion: 2,
    inngestEventId: `how-it-wins-v2:${retryJobId}`,
    inngestRunId: null,
    dispatchAttempts: 0,
    dispatchLastAttemptAt: null,
    dispatchConfirmedAt: null,
    status: "queued" as const,
    stage: "queued" as const,
    reasonCode: null,
    outcome: null,
    judgmentId: null,
    retryEligible: false,
    manualRetryUsed: true,
    configuredCapMicrodollars: 1_000_000,
    reservedMicrodollars: 0,
    settledMicrodollars: 0,
    attempts: [],
    leaseOwner: null,
    leaseExpiresAt: null,
    version: 1,
    deadlineAt: new Date("2026-09-14T18:10:00.000Z"),
    startedAt: null,
    completedAt: null,
    createdAt: now,
    updatedAt: now
  };
}

function alphaInstallation(scopes: string[]) {
  return {
    installation: { id: "installation-1" },
    invite: { id: "invite-1", scopes }
  };
}

describe("/api/extension/cards/[slug]/how-it-wins", () => {
  beforeEach(() => {
    process.env.NODE_ENV = "test";
    process.env.EXTENSION_API_TOKEN = "operator-secret";
    delete process.env.EXTENSION_API_TOKENS;
    delete process.env.ALLOWED_EXTENSION_IDS;
    delete process.env.ALLOWED_EXTENSION_ORIGINS;
    delete process.env.CHROME_EXTENSION_ID;
    delete process.env.ALPHA_ACCESS_ENABLED;

    for (const mock of Object.values(mocks)) mock.mockReset();
    mocks.createDb.mockReturnValue({ kind: "db" });
    mocks.findActiveAlphaInstallationByTokenHash.mockResolvedValue(null);
    mocks.touchAlphaInstallation.mockResolvedValue(true);
    mocks.reconcileExpiredHowItWinsJobs.mockResolvedValue([]);
    mocks.howItWinsStatusForPrincipal.mockResolvedValue({ job: null });
    mocks.dispatchHowItWinsJob.mockResolvedValue(true);
  });

  afterEach(() => {
    for (const [key, value] of Object.entries(originalEnv)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });

  it("rejects missing authentication before reading job state", async () => {
    const response = await GET(new Request("http://localhost/api/extension/cards/browserbase/how-it-wins", {
      headers: { "x-cold-start-extension-id": "extension-test-id" }
    }), params());

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toMatchObject({ code: "authentication" });
    expect(mocks.reconcileExpiredHowItWinsJobs).not.toHaveBeenCalled();
    expect(mocks.howItWinsStatusForPrincipal).not.toHaveBeenCalled();
  });

  it("enforces read and write scopes for alpha installations", async () => {
    mocks.findActiveAlphaInstallationByTokenHash.mockResolvedValue(alphaInstallation(["cards:read"]));

    const readResponse = await GET(request("GET", undefined, "installation-secret"), params());
    const writeResponse = await POST(request("POST", { jobId: sourceJobId, requestId }, "installation-secret"), params());

    expect(readResponse.status).toBe(200);
    expect(writeResponse.status).toBe(403);
    expect(mocks.howItWinsStatusForPrincipal).toHaveBeenCalledWith(
      { kind: "db" },
      "browserbase",
      expect.objectContaining({ installationId: "installation-1", scopes: ["cards:read"] })
    );
    expect(mocks.retryHowItWinsJob).not.toHaveBeenCalled();
  });

  it("returns an explicit empty envelope and performs no paid work on GET", async () => {
    const response = await GET(request("GET"), params());

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ job: null });
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get(COLD_START_API_CONTRACT_HEADER)).toBe(COLD_START_API_CONTRACT_VERSION);
    expect(mocks.reconcileExpiredHowItWinsJobs).toHaveBeenCalledWith({ kind: "db" }, { limit: 20 });
    expect(mocks.retryHowItWinsJob).not.toHaveBeenCalled();
    expect(mocks.dispatchHowItWinsJob).not.toHaveBeenCalled();
    expect(mocks.reserveAlphaRunRequest).not.toHaveBeenCalled();
  });

  it("rejects invalid slugs and bounded or malformed retry bodies", async () => {
    expect((await GET(request("GET"), params("Bad Slug"))).status).toBe(404);

    const malformed = await POST(request("POST", "{"), params());
    const extraField = await POST(request("POST", { jobId: sourceJobId, requestId, extra: true }), params());
    const tooLarge = await POST(request("POST", JSON.stringify({
      jobId: sourceJobId,
      requestId,
      padding: "x".repeat(600)
    })), params());

    expect(malformed.status).toBe(400);
    expect(extraField.status).toBe(400);
    expect(tooLarge.status).toBe(413);
    expect(mocks.retryHowItWinsJob).not.toHaveBeenCalled();
  });

  it("dispatches only a service-admitted retry and never debits alpha allowance", async () => {
    const job = storedJob();
    mocks.retryHowItWinsJob.mockResolvedValue({ state: "admitted", job });

    const response = await POST(request("POST", { jobId: sourceJobId, requestId }), params());

    expect(response.status).toBe(202);
    await expect(response.json()).resolves.toEqual({
      job: {
        id: retryJobId,
        status: "queued",
        stage: "queued",
        reasonCode: null,
        canRetry: false,
        updatedAt: "2026-09-14T18:00:00.000Z"
      }
    });
    expect(mocks.retryHowItWinsJob).toHaveBeenCalledWith(
      { kind: "db" },
      expect.objectContaining({
        slug: "browserbase",
        jobId: sourceJobId,
        principal: expect.objectContaining({ kind: "operator" })
      })
    );
    expect(mocks.dispatchHowItWinsJob).toHaveBeenCalledWith({ kind: "db" }, job);
    expect(mocks.reserveAlphaRunRequest).not.toHaveBeenCalled();
    expect(mocks.getAlphaAllowanceSnapshot).not.toHaveBeenCalled();
  });

  it("does not dispatch a retry denied by ownership or current-state checks", async () => {
    mocks.retryHowItWinsJob.mockResolvedValue(null);
    mocks.howItWinsStatusForPrincipal.mockResolvedValue({
      job: {
        id: sourceJobId,
        status: "failed",
        stage: "writer",
        reasonCode: "structured_output",
        canRetry: false,
        updatedAt: "2026-09-14T17:00:00.000Z"
      }
    });

    const response = await POST(request("POST", { jobId: sourceJobId, requestId }), params());

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({
      error: "This read cannot be retried.",
      job: { id: sourceJobId, canRetry: false }
    });
    expect(mocks.dispatchHowItWinsJob).not.toHaveBeenCalled();
  });

  it("returns a bounded unavailable response for admission errors", async () => {
    const { HowItWinsExecutionError } = await import("../src/inngest/how-it-wins-budget");
    mocks.retryHowItWinsJob.mockRejectedValue(new HowItWinsExecutionError("authentication_configuration"));

    const response = await POST(request("POST", { jobId: sourceJobId, requestId }), params());

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({ error: "How it wins retry is unavailable." });
    expect(mocks.dispatchHowItWinsJob).not.toHaveBeenCalled();
  });
});
