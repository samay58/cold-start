import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const db = { kind: "db" };

  return {
    db,
    createDb: vi.fn(() => db),
    findActiveGenerationRunBySlug: vi.fn(),
    findPublicCardBySlug: vi.fn(),
    markGenerationRun: vi.fn(),
    send: vi.fn()
  };
});

vi.mock("@cold-start/db", () => ({
  createDb: mocks.createDb,
  findActiveGenerationRunBySlug: mocks.findActiveGenerationRunBySlug,
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

function generateRequest(domain = "cartesia.ai") {
  return new Request("http://localhost/api/generate", {
    method: "POST",
    body: JSON.stringify({ domain })
  });
}

describe("POST /api/generate", () => {
  beforeEach(() => {
    mocks.createDb.mockClear();
    mocks.findActiveGenerationRunBySlug.mockReset();
    mocks.findPublicCardBySlug.mockReset();
    mocks.markGenerationRun.mockReset();
    mocks.send.mockReset();
  });

  it("returns cached without queueing when a public card already exists", async () => {
    mocks.findPublicCardBySlug.mockResolvedValue({ slug: "cartesia" });

    const response = await POST(generateRequest());

    await expect(response.json()).resolves.toEqual({ slug: "cartesia", status: "cached" });
    expect(response.status).toBe(200);
    expect(mocks.findActiveGenerationRunBySlug).not.toHaveBeenCalled();
    expect(mocks.markGenerationRun).not.toHaveBeenCalled();
    expect(mocks.send).not.toHaveBeenCalled();
  });

  it.each(["queued", "running"] as const)("returns existing %s run without queueing another job", async (status) => {
    mocks.findPublicCardBySlug.mockResolvedValue(null);
    mocks.findActiveGenerationRunBySlug.mockResolvedValue({ slug: "cartesia", domain: "cartesia.ai", status });

    const response = await POST(generateRequest());

    await expect(response.json()).resolves.toEqual({ slug: "cartesia", status });
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

    await expect(response.json()).resolves.toEqual({ slug: "cartesia", status: "queued" });
    expect(response.status).toBe(202);
    expect(mocks.markGenerationRun).toHaveBeenCalledTimes(1);
    expect(mocks.markGenerationRun).toHaveBeenCalledWith(mocks.db, {
      slug: "cartesia",
      domain: "cartesia.ai",
      status: "queued"
    });
    expect(mocks.send).toHaveBeenCalledWith({
      name: "card/generate.requested",
      data: { domain: "cartesia.ai", slug: "cartesia" }
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
      status: "queued"
    });
    expect(mocks.markGenerationRun).toHaveBeenNthCalledWith(2, mocks.db, {
      slug: "cartesia",
      domain: "cartesia.ai",
      status: "failed",
      error: "inngest unavailable"
    });
  });
});
