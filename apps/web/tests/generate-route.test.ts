import { COLD_START_API_CONTRACT_HEADER, COLD_START_API_CONTRACT_VERSION } from "@cold-start/core";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const db = { kind: "db" };

  return {
    db,
    createDb: vi.fn(() => db),
    findActiveGenerationRunStatusBySlug: vi.fn(),
    findLatestGenerationRunStatusBySlug: vi.fn(),
    findCardBySlug: vi.fn(),
    findPublicCardBySlug: vi.fn(),
    markGenerationRun: vi.fn(),
    markResearchSectionFailed: vi.fn(),
    markResearchSectionRunning: vi.fn(),
    recordResearchRunEvent: vi.fn(),
    retireStaleGenerationRuns: vi.fn(),
    send: vi.fn()
  };
});

vi.mock("@cold-start/db", () => ({
  createDb: mocks.createDb,
  findActiveGenerationRunStatusBySlug: mocks.findActiveGenerationRunStatusBySlug,
  findLatestGenerationRunStatusBySlug: mocks.findLatestGenerationRunStatusBySlug,
  findCardBySlug: mocks.findCardBySlug,
  findPublicCardBySlug: mocks.findPublicCardBySlug,
  markGenerationRun: mocks.markGenerationRun,
  markResearchSectionFailed: mocks.markResearchSectionFailed,
  markResearchSectionRunning: mocks.markResearchSectionRunning,
  recordResearchRunEvent: mocks.recordResearchRunEvent,
  retireStaleGenerationRuns: mocks.retireStaleGenerationRuns
}));

vi.mock("../src/inngest/client", () => ({
  inngest: {
    send: mocks.send
  }
}));

vi.mock("../src/lib/env", () => ({
  webEnv: () => ({
    DATABASE_URL: "postgres://user:pass@example.com/db",
    NEXT_PUBLIC_WEB_ORIGIN: "http://localhost:3000"
  })
}));

const { GET, POST } = await import("../src/app/api/generate/route");

function generateRequest(
  domain = "cartesia.ai",
  options: {
    confirmStart?: boolean;
    forceRefresh?: boolean;
    mode?: "basics" | "analysis";
    extensionAuth?: boolean;
    sectionId?: string;
  } = { confirmStart: true }
) {
  const headers = new Headers({ "Content-Type": "application/json" });
  if (options.extensionAuth) {
    headers.set("authorization", "Bearer secret");
    headers.set("x-cold-start-extension-id", "extension-test-id");
  }

  return new Request("http://localhost/api/generate", {
    method: "POST",
    headers,
    body: JSON.stringify({
      domain,
      ...(options.mode ? { mode: options.mode } : {}),
      ...(options.sectionId ? { sectionId: options.sectionId } : {}),
      ...(options.confirmStart ? { confirmStart: true } : {}),
      ...(options.forceRefresh ? { forceRefresh: true } : {})
    })
  });
}

function resolvedFact<T>(value: T | null) {
  return {
    value,
    status: value === null ? "unknown" as const : "verified" as const,
    confidence: value === null ? "low" as const : "medium" as const,
    citationIds: value === null ? [] : ["c1"],
  };
}

function usablePublicCard() {
  return {
    slug: "cartesia",
    domain: "cartesia.ai",
    generatedAt: "2026-05-14T00:00:00.000Z",
    generationCostUsd: 0,
    cacheStatus: "hit",
    identity: {
      name: resolvedFact("Cartesia"),
      websiteUrl: resolvedFact("https://cartesia.ai"),
      logoUrl: null,
      oneLiner: resolvedFact("Voice AI infrastructure."),
      hq: resolvedFact({ city: "San Francisco", country: "United States" }),
      foundedYear: resolvedFact(2023),
      status: "private",
    },
    funding: {
      totalRaisedUsd: resolvedFact(91000000),
      lastRound: resolvedFact(null),
      investors: resolvedFact(null),
    },
    team: {
      founders: resolvedFact([]),
      keyExecs: resolvedFact([]),
      headcount: resolvedFact({ value: 64, asOf: "2026-05-14" }),
    },
    signals: [],
    comparables: [],
    citations: [
      {
        id: "c1",
        url: "https://cartesia.ai",
        title: "Cartesia",
        fetchedAt: "2026-05-14T00:00:00.000Z",
        sourceType: "company_site",
      },
      {
        id: "c2",
        url: "https://news.example/cartesia-series-b",
        title: "Cartesia Series B coverage",
        fetchedAt: "2026-05-14T00:00:00.000Z",
        sourceType: "news",
      },
      {
        id: "c3",
        url: "https://example.com/cartesia-profile",
        title: "Cartesia company profile",
        fetchedAt: "2026-05-14T00:00:00.000Z",
        sourceType: "other",
      },
    ],
  };
}

function underfilledPublicCard() {
  return {
    ...usablePublicCard(),
    identity: {
      ...usablePublicCard().identity,
      websiteUrl: resolvedFact(null),
      hq: resolvedFact(null),
      foundedYear: resolvedFact(null),
    },
    funding: {
      totalRaisedUsd: resolvedFact(null),
      lastRound: resolvedFact(null),
      investors: resolvedFact(null),
    },
    team: {
      founders: resolvedFact([]),
      keyExecs: resolvedFact([]),
      headcount: resolvedFact(null),
    },
    comparables: [],
  };
}

describe("POST /api/generate", () => {
  beforeEach(() => {
    process.env.NODE_ENV = "test";
    process.env.EXTENSION_API_TOKEN = "secret";
    delete process.env.PUBLIC_GENERATION_ENABLED;
    mocks.createDb.mockClear();
    mocks.findActiveGenerationRunStatusBySlug.mockReset();
    mocks.findLatestGenerationRunStatusBySlug.mockReset();
    mocks.findCardBySlug.mockReset();
    mocks.findPublicCardBySlug.mockReset();
    mocks.markGenerationRun.mockReset();
    mocks.markResearchSectionFailed.mockReset();
    mocks.markResearchSectionRunning.mockReset();
    mocks.recordResearchRunEvent.mockReset();
    mocks.retireStaleGenerationRuns.mockReset();
    mocks.markResearchSectionFailed.mockResolvedValue(null);
    mocks.markResearchSectionRunning.mockResolvedValue(null);
    mocks.recordResearchRunEvent.mockResolvedValue(null);
    mocks.retireStaleGenerationRuns.mockResolvedValue(0);
    mocks.send.mockReset();
  });

  it("returns cached without queueing when a public card already exists", async () => {
    mocks.findPublicCardBySlug.mockResolvedValue(usablePublicCard());

    const response = await POST(generateRequest());

    await expect(response.json()).resolves.toMatchObject({ slug: "cartesia", domain: "cartesia.ai", status: "cached", mode: "basics" });
    expect(response.status).toBe(200);
    expect(response.headers.get(COLD_START_API_CONTRACT_HEADER)).toBe(COLD_START_API_CONTRACT_VERSION);
    expect(mocks.findActiveGenerationRunStatusBySlug).not.toHaveBeenCalled();
    expect(mocks.markGenerationRun).not.toHaveBeenCalled();
    expect(mocks.send).not.toHaveBeenCalled();
  });

  it("rejects unconfirmed generation requests before touching DB or Inngest", async () => {
    const response = await POST(generateRequest("amazon.com", { confirmStart: false }));

    await expect(response.json()).resolves.toEqual({ error: "generation start confirmation required" });
    expect(response.status).toBe(400);
    expect(mocks.createDb).not.toHaveBeenCalled();
    expect(mocks.findPublicCardBySlug).not.toHaveBeenCalled();
    expect(mocks.findActiveGenerationRunStatusBySlug).not.toHaveBeenCalled();
    expect(mocks.markGenerationRun).not.toHaveBeenCalled();
    expect(mocks.send).not.toHaveBeenCalled();
  });

  it("allows extension-authenticated basics generation without explicit confirmation", async () => {
    mocks.findPublicCardBySlug.mockResolvedValue(null);
    mocks.findActiveGenerationRunStatusBySlug.mockResolvedValue(null);
    mocks.markGenerationRun.mockResolvedValue({ id: "run-id" });
    mocks.send.mockResolvedValue(undefined);

    const response = await POST(generateRequest("cartesia.ai", { mode: "basics", extensionAuth: true }));

    await expect(response.json()).resolves.toMatchObject({ slug: "cartesia", domain: "cartesia.ai", status: "queued", mode: "basics", runId: "run-id" });
    expect(response.status).toBe(202);
    expect(mocks.findActiveGenerationRunStatusBySlug).toHaveBeenCalledWith(mocks.db, "cartesia", "basics");
    expect(mocks.markGenerationRun).toHaveBeenCalledWith(mocks.db, {
      slug: "cartesia",
      domain: "cartesia.ai",
      mode: "basics",
      status: "queued"
    });
    expect(mocks.recordResearchRunEvent).toHaveBeenCalledWith(mocks.db, {
      runId: "run-id",
      slug: "cartesia",
      domain: "cartesia.ai",
      sectionId: null,
      type: "generation.queued",
      message: "Queued company profile",
      metadata: { mode: "basics" }
    });
    expect(mocks.send).toHaveBeenCalledWith({
      name: "card/generate.requested",
      ts: expect.any(Number),
      data: {
        domain: "cartesia.ai",
        slug: "cartesia",
        mode: "basics",
        requestedAtMs: expect.any(Number)
      }
    });
  });

  it("queues analysis for an existing basics card that has no synthesis yet", async () => {
    mocks.findCardBySlug.mockResolvedValue(usablePublicCard());
    mocks.findActiveGenerationRunStatusBySlug.mockResolvedValue(null);
    mocks.markGenerationRun.mockResolvedValue({ id: "run-id" });
    mocks.send.mockResolvedValue(undefined);

    const response = await POST(
      generateRequest("cartesia.ai", { mode: "analysis", confirmStart: true, extensionAuth: true })
    );

    await expect(response.json()).resolves.toMatchObject({ slug: "cartesia", domain: "cartesia.ai", status: "queued", mode: "analysis", runId: "run-id" });
    expect(mocks.findCardBySlug).toHaveBeenCalledWith(mocks.db, "cartesia");
    expect(mocks.findPublicCardBySlug).not.toHaveBeenCalled();
    expect(mocks.markGenerationRun).toHaveBeenCalledWith(mocks.db, {
      slug: "cartesia",
      domain: "cartesia.ai",
      mode: "analysis",
      status: "queued"
    });
  });

  it("queues one requested section and marks that section running", async () => {
    mocks.findCardBySlug.mockResolvedValue(usablePublicCard());
    mocks.findActiveGenerationRunStatusBySlug.mockResolvedValue(null);
    mocks.markGenerationRun.mockResolvedValue({ id: "run-id" });
    mocks.send.mockResolvedValue(undefined);

    const response = await POST(
      generateRequest("cartesia.ai", {
        sectionId: "market",
        mode: "analysis",
        confirmStart: true,
        extensionAuth: true
      })
    );

    await expect(response.json()).resolves.toMatchObject({ slug: "cartesia", domain: "cartesia.ai", status: "queued", mode: "analysis", runId: "run-id" });
    expect(mocks.markGenerationRun).toHaveBeenCalledWith(mocks.db, {
      slug: "cartesia",
      domain: "cartesia.ai",
      mode: "analysis",
      jobKind: "section:market",
      status: "queued"
    });
    expect(mocks.markResearchSectionRunning).toHaveBeenCalledWith(mocks.db, {
      slug: "cartesia",
      domain: "cartesia.ai",
      sectionId: "market",
      visibility: "gated",
      runId: "run-id"
    });
    expect(mocks.send).toHaveBeenCalledWith({
      name: "card/generate.requested",
      ts: expect.any(Number),
      data: {
        domain: "cartesia.ai",
        slug: "cartesia",
        mode: "analysis",
        sectionId: "market",
        requestedAtMs: expect.any(Number)
      }
    });
  });

  it("rejects section generation when the requested mode does not match the section", async () => {
    const response = await POST(
      generateRequest("cartesia.ai", {
        sectionId: "market",
        mode: "basics",
        confirmStart: true,
        extensionAuth: true
      })
    );

    await expect(response.json()).resolves.toEqual({ error: "section mode does not match requested mode" });
    expect(response.status).toBe(400);
    expect(mocks.createDb).not.toHaveBeenCalled();
  });

  it("does not treat no-source partial basics as cached", async () => {
    mocks.findPublicCardBySlug.mockResolvedValue({ ...underfilledPublicCard(), citations: [] });
    mocks.findActiveGenerationRunStatusBySlug.mockResolvedValue(null);
    mocks.markGenerationRun.mockResolvedValue({ id: "run-id" });
    mocks.send.mockResolvedValue(undefined);

    const response = await POST(generateRequest("cartesia.ai", { mode: "basics", confirmStart: true, extensionAuth: true }));

    await expect(response.json()).resolves.toMatchObject({ slug: "cartesia", status: "queued", mode: "basics" });
    expect(response.status).toBe(202);
    expect(mocks.markGenerationRun).toHaveBeenCalledWith(mocks.db, {
      slug: "cartesia",
      domain: "cartesia.ai",
      mode: "basics",
      status: "queued"
    });
  });

  it("does not treat cited but underfilled basics as cached", async () => {
    mocks.findPublicCardBySlug.mockResolvedValue(underfilledPublicCard());
    mocks.findActiveGenerationRunStatusBySlug.mockResolvedValue(null);
    mocks.markGenerationRun.mockResolvedValue({ id: "run-id" });
    mocks.send.mockResolvedValue(undefined);

    const response = await POST(generateRequest("cartesia.ai", { mode: "basics", confirmStart: true, extensionAuth: true }));

    await expect(response.json()).resolves.toMatchObject({ slug: "cartesia", status: "queued", mode: "basics" });
    expect(response.status).toBe(202);
    expect(mocks.markGenerationRun).toHaveBeenCalledWith(mocks.db, {
      slug: "cartesia",
      domain: "cartesia.ai",
      mode: "basics",
      status: "queued"
    });
  });

  it("blocks analysis when the existing basics profile has no cited sources", async () => {
    mocks.findCardBySlug.mockResolvedValue({ ...underfilledPublicCard(), citations: [] });

    const response = await POST(
      generateRequest("cartesia.ai", { mode: "analysis", confirmStart: true, extensionAuth: true })
    );

    await expect(response.json()).resolves.toEqual({ error: "profile needs cited sources before analysis" });
    expect(response.status).toBe(409);
    expect(mocks.findActiveGenerationRunStatusBySlug).not.toHaveBeenCalled();
    expect(mocks.markGenerationRun).not.toHaveBeenCalled();
    expect(mocks.send).not.toHaveBeenCalled();
  });

  it("blocks analysis when the existing basics profile is cited but underfilled", async () => {
    mocks.findCardBySlug.mockResolvedValue(underfilledPublicCard());

    const response = await POST(
      generateRequest("cartesia.ai", { mode: "analysis", confirmStart: true, extensionAuth: true })
    );

    await expect(response.json()).resolves.toEqual({ error: "profile needs more structured facts before analysis" });
    expect(response.status).toBe(409);
    expect(mocks.findActiveGenerationRunStatusBySlug).not.toHaveBeenCalled();
    expect(mocks.markGenerationRun).not.toHaveBeenCalled();
    expect(mocks.send).not.toHaveBeenCalled();
  });

  it("requires confirmation for basics generation when extension auth is absent", async () => {
    const response = await POST(generateRequest("cartesia.ai", { mode: "basics" }));

    await expect(response.json()).resolves.toEqual({ error: "generation start confirmation required" });
    expect(response.status).toBe(400);
    expect(mocks.createDb).not.toHaveBeenCalled();
  });

  it("blocks unauthenticated basics generation in production unless explicitly enabled", async () => {
    process.env.NODE_ENV = "production";
    process.env.ALLOWED_EXTENSION_ORIGINS = "chrome-extension://extension-test-id";

    const response = await POST(generateRequest("cartesia.ai", { mode: "basics", confirmStart: true }));

    await expect(response.json()).resolves.toEqual({ error: "extension identity required" });
    expect(response.status).toBe(403);
    expect(mocks.createDb).not.toHaveBeenCalled();
  });

  it("can opt production public basics generation back in", async () => {
    process.env.NODE_ENV = "production";
    process.env.ALLOWED_EXTENSION_ORIGINS = "chrome-extension://extension-test-id";
    process.env.PUBLIC_GENERATION_ENABLED = "true";
    mocks.findPublicCardBySlug.mockResolvedValue(null);
    mocks.findActiveGenerationRunStatusBySlug.mockResolvedValue(null);
    mocks.markGenerationRun.mockResolvedValue({ id: "run-id" });
    mocks.send.mockResolvedValue(undefined);

    const response = await POST(generateRequest("cartesia.ai", { mode: "basics", confirmStart: true }));

    await expect(response.json()).resolves.toMatchObject({ slug: "cartesia", domain: "cartesia.ai", status: "queued", mode: "basics", runId: "run-id" });
    expect(response.status).toBe(202);
  });

  it("requires extension auth and confirmation for analysis generation", async () => {
    const missingAuthResponse = await POST(generateRequest("cartesia.ai", { mode: "analysis" }));
    await expect(missingAuthResponse.json()).resolves.toEqual({ error: "extension identity required" });
    expect(missingAuthResponse.status).toBe(403);

    const missingConfirmationResponse = await POST(
      generateRequest("cartesia.ai", { mode: "analysis", extensionAuth: true })
    );
    await expect(missingConfirmationResponse.json()).resolves.toEqual({
      error: "generation start confirmation required"
    });
    expect(missingConfirmationResponse.status).toBe(400);
  });

  it.each(["queued", "running"] as const)("returns existing %s run without queueing another job", async (status) => {
    mocks.findPublicCardBySlug.mockResolvedValue(null);
    mocks.findActiveGenerationRunStatusBySlug.mockResolvedValue({ slug: "cartesia", domain: "cartesia.ai", status });

    const response = await POST(generateRequest());

    await expect(response.json()).resolves.toMatchObject({ slug: "cartesia", domain: "cartesia.ai", status, mode: "basics" });
    expect(response.status).toBe(202);
    expect(mocks.markGenerationRun).not.toHaveBeenCalled();
    expect(mocks.send).not.toHaveBeenCalled();
  });

  it("marks queued and sends a generation event for a fresh valid request", async () => {
    mocks.findPublicCardBySlug.mockResolvedValue(null);
    mocks.findActiveGenerationRunStatusBySlug.mockResolvedValue(null);
    mocks.markGenerationRun.mockResolvedValue({ id: "run-id" });
    mocks.send.mockResolvedValue(undefined);

    const response = await POST(generateRequest("https://www.cartesia.ai/company"));

    await expect(response.json()).resolves.toMatchObject({ slug: "cartesia", domain: "cartesia.ai", status: "queued", mode: "basics", runId: "run-id" });
    expect(response.status).toBe(202);
    expect(mocks.markGenerationRun).toHaveBeenCalledTimes(1);
    expect(mocks.markGenerationRun).toHaveBeenCalledWith(mocks.db, {
      slug: "cartesia",
      domain: "cartesia.ai",
      mode: "basics",
      status: "queued"
    });
    expect(mocks.send).toHaveBeenCalledWith({
      name: "card/generate.requested",
      ts: expect.any(Number),
      data: {
        domain: "cartesia.ai",
        slug: "cartesia",
        mode: "basics",
        requestedAtMs: expect.any(Number)
      }
    });
  });

  it("retires stale active runs before deciding whether to queue new work", async () => {
    mocks.findPublicCardBySlug.mockResolvedValue(null);
    mocks.findActiveGenerationRunStatusBySlug.mockResolvedValue(null);
    mocks.markGenerationRun.mockResolvedValue({ id: "fresh-run" });
    mocks.send.mockResolvedValue(undefined);

    const response = await POST(generateRequest("cartesia.ai"));

    await expect(response.json()).resolves.toMatchObject({ slug: "cartesia", status: "queued", mode: "basics" });
    expect(response.status).toBe(202);
    expect(mocks.retireStaleGenerationRuns).toHaveBeenCalledWith(mocks.db, {
      slug: "cartesia",
      mode: "basics"
    });
    expect(mocks.retireStaleGenerationRuns.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.findActiveGenerationRunStatusBySlug.mock.invocationCallOrder[0]
    );
  });

  it("recovers duplicate queue races by returning the active run instead of failing", async () => {
    mocks.findPublicCardBySlug.mockResolvedValue(null);
    mocks.findActiveGenerationRunStatusBySlug
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        id: "existing-run",
        slug: "cartesia",
        domain: "cartesia.ai",
        mode: "basics",
        status: "queued",
        startedAt: new Date("2026-05-06T12:00:00.000Z")
      });
    mocks.markGenerationRun.mockRejectedValue(Object.assign(new Error("duplicate key"), { code: "23505" }));

    const response = await POST(generateRequest("cartesia.ai"));

    await expect(response.json()).resolves.toMatchObject({
      slug: "cartesia",
      status: "queued",
      mode: "basics",
      runId: "existing-run"
    });
    expect(response.status).toBe(202);
    expect(mocks.send).not.toHaveBeenCalled();
  });

  it("marks failed and returns 500 when event enqueue fails", async () => {
    mocks.findPublicCardBySlug.mockResolvedValue(null);
    mocks.findActiveGenerationRunStatusBySlug.mockResolvedValue(null);
    mocks.markGenerationRun.mockResolvedValue({ id: "run-id" });
    mocks.send.mockRejectedValue(new Error("inngest unavailable"));

    const response = await POST(generateRequest());

    await expect(response.json()).resolves.toEqual({ error: "failed to queue generation" });
    expect(response.status).toBe(500);
    expect(mocks.markGenerationRun).toHaveBeenCalledTimes(2);
    expect(mocks.markGenerationRun).toHaveBeenNthCalledWith(1, mocks.db, {
      slug: "cartesia",
      domain: "cartesia.ai",
      mode: "basics",
      status: "queued"
    });
    expect(mocks.markGenerationRun).toHaveBeenNthCalledWith(2, mocks.db, {
      slug: "cartesia",
      domain: "cartesia.ai",
      mode: "basics",
      status: "failed",
      error: "inngest unavailable"
    });
  });

  it("queues an extension-confirmed basics refresh even when a cited card exists", async () => {
    mocks.findPublicCardBySlug.mockResolvedValue(usablePublicCard());
    mocks.findActiveGenerationRunStatusBySlug.mockResolvedValue(null);
    mocks.markGenerationRun.mockResolvedValue({ id: "run-id" });
    mocks.send.mockResolvedValue(undefined);

    const response = await POST(generateRequest("cartesia.ai", {
      mode: "basics",
      confirmStart: true,
      extensionAuth: true,
      forceRefresh: true
    }));

    await expect(response.json()).resolves.toMatchObject({ slug: "cartesia", status: "queued", mode: "basics" });
    expect(response.status).toBe(202);
    expect(mocks.markGenerationRun).toHaveBeenCalledWith(mocks.db, {
      slug: "cartesia",
      domain: "cartesia.ai",
      mode: "basics",
      status: "queued"
    });
  });

  it("rejects unconfirmed forced refreshes", async () => {
    const response = await POST(generateRequest("cartesia.ai", {
      mode: "basics",
      confirmStart: false,
      extensionAuth: true,
      forceRefresh: true
    }));

    await expect(response.json()).resolves.toEqual({ error: "extension refresh requires confirmation" });
    expect(response.status).toBe(400);
    expect(mocks.markGenerationRun).not.toHaveBeenCalled();
  });

  it("queues an extension-confirmed analysis refresh even when synthesis exists", async () => {
    mocks.findCardBySlug.mockResolvedValue({
      ...usablePublicCard(),
      synthesis: {
        whyItMatters: { text: "Existing synthesis [c1].", citationIds: ["c1"] },
        bullCase: [],
        bearCase: [],
        openQuestions: ["What changed?"],
      },
    });
    mocks.findActiveGenerationRunStatusBySlug.mockResolvedValue(null);
    mocks.markGenerationRun.mockResolvedValue({ id: "run-id" });
    mocks.send.mockResolvedValue(undefined);

    const response = await POST(generateRequest("cartesia.ai", {
      mode: "analysis",
      confirmStart: true,
      extensionAuth: true,
      forceRefresh: true,
    }));

    await expect(response.json()).resolves.toMatchObject({ slug: "cartesia", status: "queued", mode: "analysis" });
    expect(response.status).toBe(202);
    expect(mocks.markGenerationRun).toHaveBeenCalledWith(mocks.db, {
      slug: "cartesia",
      domain: "cartesia.ai",
      mode: "analysis",
      status: "queued"
    });
  });
});

describe("GET /api/generate", () => {
  beforeEach(() => {
    process.env.NODE_ENV = "test";
    process.env.EXTENSION_API_TOKEN = "secret";
    mocks.createDb.mockClear();
    mocks.findLatestGenerationRunStatusBySlug.mockReset();
    mocks.retireStaleGenerationRuns.mockReset();
    mocks.retireStaleGenerationRuns.mockResolvedValue(0);
  });

  function statusRequest(domain = "cartesia.ai", mode = "analysis") {
    const headers = new Headers({
      authorization: "Bearer secret",
      "x-cold-start-extension-id": "extension-test-id"
    });
    return new Request(`http://localhost/api/generate?domain=${encodeURIComponent(domain)}&mode=${mode}`, {
      headers
    });
  }

  function sectionStatusRequest(sectionId: string, domain = "cartesia.ai", mode = "analysis") {
    const headers = new Headers({
      authorization: "Bearer secret",
      "x-cold-start-extension-id": "extension-test-id"
    });
    return new Request(`http://localhost/api/generate?domain=${encodeURIComponent(domain)}&mode=${mode}&sectionId=${sectionId}`, {
      headers
    });
  }

  it("returns the latest generation run for extension-authenticated callers", async () => {
    mocks.findLatestGenerationRunStatusBySlug.mockResolvedValue({
      id: "run-1",
      slug: "cartesia",
      domain: "cartesia.ai",
      mode: "analysis",
      status: "failed",
      error: "No synthesis claims survived verification",
      costUsd: "0.42",
      startedAt: new Date("2026-05-06T12:00:00.000Z"),
      completedAt: new Date("2026-05-06T12:01:00.000Z")
    });

    const response = await GET(statusRequest());

    await expect(response.json()).resolves.toEqual({
      slug: "cartesia",
      domain: "cartesia.ai",
      mode: "analysis",
      status: "failed",
      runId: "run-1",
      error: "No synthesis claims survived verification",
      costUsd: 0.42,
      startedAt: "2026-05-06T12:00:00.000Z",
      completedAt: "2026-05-06T12:01:00.000Z"
    });
    expect(mocks.retireStaleGenerationRuns).toHaveBeenCalledWith(mocks.db, {
      slug: "cartesia",
      mode: "analysis"
    });
    expect(response.headers.get(COLD_START_API_CONTRACT_HEADER)).toBe(COLD_START_API_CONTRACT_VERSION);
  });

  it("can return the status for one requested section run", async () => {
    mocks.findLatestGenerationRunStatusBySlug.mockResolvedValue({
      id: "run-section",
      slug: "cartesia",
      domain: "cartesia.ai",
      mode: "analysis",
      jobKind: "section:market",
      status: "running",
      startedAt: new Date("2026-05-06T12:00:00.000Z")
    });

    const response = await GET(sectionStatusRequest("market"));

    await expect(response.json()).resolves.toMatchObject({
      slug: "cartesia",
      domain: "cartesia.ai",
      mode: "analysis",
      status: "running",
      runId: "run-section"
    });
    expect(mocks.findLatestGenerationRunStatusBySlug).toHaveBeenCalledWith(mocks.db, "cartesia", "analysis", "section:market");
  });

  it("reports idle when no generation run exists", async () => {
    mocks.findLatestGenerationRunStatusBySlug.mockResolvedValue(null);

    const response = await GET(statusRequest("linear.app", "basics"));

    await expect(response.json()).resolves.toEqual({
      slug: "linear",
      domain: "linear.app",
      mode: "basics",
      status: "idle"
    });
  });

  it("requires extension auth", async () => {
    const response = await GET(new Request("http://localhost/api/generate?domain=cartesia.ai&mode=analysis"));

    await expect(response.json()).resolves.toEqual({ error: "extension identity required" });
    expect(response.status).toBe(403);
    expect(response.headers.get(COLD_START_API_CONTRACT_HEADER)).toBe(COLD_START_API_CONTRACT_VERSION);
    expect(mocks.createDb).not.toHaveBeenCalled();
  });
});
