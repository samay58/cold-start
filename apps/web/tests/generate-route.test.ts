import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const db = { kind: "db" };

  return {
    db,
    createDb: vi.fn(() => db),
    findActiveGenerationRunBySlug: vi.fn(),
    findCardBySlug: vi.fn(),
    findPublicCardBySlug: vi.fn(),
    markGenerationRun: vi.fn(),
    send: vi.fn()
  };
});

vi.mock("@cold-start/db", () => ({
  createDb: mocks.createDb,
  findActiveGenerationRunBySlug: mocks.findActiveGenerationRunBySlug,
  findCardBySlug: mocks.findCardBySlug,
  findPublicCardBySlug: mocks.findPublicCardBySlug,
  markGenerationRun: mocks.markGenerationRun
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

const { POST } = await import("../src/app/api/generate/route");

function generateRequest(
  domain = "cartesia.ai",
  options: {
    confirmStart?: boolean;
    mode?: "basics" | "analysis";
    extensionAuth?: boolean;
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
      ...(options.confirmStart ? { confirmStart: true } : {})
    })
  });
}

describe("POST /api/generate", () => {
  beforeEach(() => {
    process.env.NODE_ENV = "test";
    process.env.EXTENSION_API_TOKEN = "secret";
    mocks.createDb.mockClear();
    mocks.findActiveGenerationRunBySlug.mockReset();
    mocks.findCardBySlug.mockReset();
    mocks.findPublicCardBySlug.mockReset();
    mocks.markGenerationRun.mockReset();
    mocks.send.mockReset();
  });

  it("returns cached without queueing when a public card already exists", async () => {
    mocks.findPublicCardBySlug.mockResolvedValue({ slug: "cartesia" });

    const response = await POST(generateRequest());

    await expect(response.json()).resolves.toEqual({ slug: "cartesia", status: "cached", mode: "basics" });
    expect(response.status).toBe(200);
    expect(mocks.findActiveGenerationRunBySlug).not.toHaveBeenCalled();
    expect(mocks.markGenerationRun).not.toHaveBeenCalled();
    expect(mocks.send).not.toHaveBeenCalled();
  });

  it("rejects unconfirmed generation requests before touching DB or Inngest", async () => {
    const response = await POST(generateRequest("amazon.com", { confirmStart: false }));

    await expect(response.json()).resolves.toEqual({ error: "generation start confirmation required" });
    expect(response.status).toBe(400);
    expect(mocks.createDb).not.toHaveBeenCalled();
    expect(mocks.findPublicCardBySlug).not.toHaveBeenCalled();
    expect(mocks.findActiveGenerationRunBySlug).not.toHaveBeenCalled();
    expect(mocks.markGenerationRun).not.toHaveBeenCalled();
    expect(mocks.send).not.toHaveBeenCalled();
  });

  it("allows extension-authenticated basics generation without explicit confirmation", async () => {
    mocks.findPublicCardBySlug.mockResolvedValue(null);
    mocks.findActiveGenerationRunBySlug.mockResolvedValue(null);
    mocks.markGenerationRun.mockResolvedValue({ id: "run-id" });
    mocks.send.mockResolvedValue(undefined);

    const response = await POST(generateRequest("cartesia.ai", { mode: "basics", extensionAuth: true }));

    await expect(response.json()).resolves.toEqual({ slug: "cartesia", status: "queued", mode: "basics" });
    expect(response.status).toBe(202);
    expect(mocks.findActiveGenerationRunBySlug).toHaveBeenCalledWith(mocks.db, "cartesia", "basics");
    expect(mocks.markGenerationRun).toHaveBeenCalledWith(mocks.db, {
      slug: "cartesia",
      domain: "cartesia.ai",
      mode: "basics",
      status: "queued"
    });
    expect(mocks.send).toHaveBeenCalledWith({
      name: "card/generate.requested",
      data: { domain: "cartesia.ai", slug: "cartesia", mode: "basics" }
    });
  });

  it("queues analysis for an existing basics card that has no synthesis yet", async () => {
    mocks.findCardBySlug.mockResolvedValue({ slug: "cartesia" });
    mocks.findActiveGenerationRunBySlug.mockResolvedValue(null);
    mocks.markGenerationRun.mockResolvedValue({ id: "run-id" });
    mocks.send.mockResolvedValue(undefined);

    const response = await POST(
      generateRequest("cartesia.ai", { mode: "analysis", confirmStart: true, extensionAuth: true })
    );

    await expect(response.json()).resolves.toEqual({ slug: "cartesia", status: "queued", mode: "analysis" });
    expect(mocks.findCardBySlug).toHaveBeenCalledWith(mocks.db, "cartesia");
    expect(mocks.findPublicCardBySlug).not.toHaveBeenCalled();
    expect(mocks.markGenerationRun).toHaveBeenCalledWith(mocks.db, {
      slug: "cartesia",
      domain: "cartesia.ai",
      mode: "analysis",
      status: "queued"
    });
  });

  it("requires confirmation for basics generation when extension auth is absent", async () => {
    const response = await POST(generateRequest("cartesia.ai", { mode: "basics" }));

    await expect(response.json()).resolves.toEqual({ error: "generation start confirmation required" });
    expect(response.status).toBe(400);
    expect(mocks.createDb).not.toHaveBeenCalled();
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
    mocks.findActiveGenerationRunBySlug.mockResolvedValue({ slug: "cartesia", domain: "cartesia.ai", status });

    const response = await POST(generateRequest());

    await expect(response.json()).resolves.toEqual({ slug: "cartesia", status, mode: "basics" });
    expect(response.status).toBe(202);
    expect(mocks.markGenerationRun).not.toHaveBeenCalled();
    expect(mocks.send).not.toHaveBeenCalled();
  });

  it("marks queued and sends a generation event for a fresh valid request", async () => {
    mocks.findPublicCardBySlug.mockResolvedValue(null);
    mocks.findActiveGenerationRunBySlug.mockResolvedValue(null);
    mocks.markGenerationRun.mockResolvedValue({ id: "run-id" });
    mocks.send.mockResolvedValue(undefined);

    const response = await POST(generateRequest("https://www.cartesia.ai/company"));

    await expect(response.json()).resolves.toEqual({ slug: "cartesia", status: "queued", mode: "basics" });
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
      data: { domain: "cartesia.ai", slug: "cartesia", mode: "basics" }
    });
  });

  it("marks failed and returns 500 when event enqueue fails", async () => {
    mocks.findPublicCardBySlug.mockResolvedValue(null);
    mocks.findActiveGenerationRunBySlug.mockResolvedValue(null);
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
});
