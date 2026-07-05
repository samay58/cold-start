import { COLD_START_API_CONTRACT_HEADER, COLD_START_API_CONTRACT_VERSION } from "@cold-start/core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const db = { kind: "db" };

  return {
    createDb: vi.fn(() => db),
    db,
    findCardBySlug: vi.fn(),
    findLatestGenerationRunStatusBySlug: vi.fn(),
    findResearchRunEventsBySlug: vi.fn(),
    findResearchSectionsBySlug: vi.fn(),
    findSourceSummariesBySlug: vi.fn(),
    retireStaleGenerationRuns: vi.fn(),
    retireStaleResearchSections: vi.fn()
  };
});

vi.mock("@cold-start/db", () => ({
  createDb: mocks.createDb,
  findCardBySlug: mocks.findCardBySlug,
  findLatestGenerationRunStatusBySlug: mocks.findLatestGenerationRunStatusBySlug,
  findResearchRunEventsBySlug: mocks.findResearchRunEventsBySlug,
  findResearchSectionsBySlug: mocks.findResearchSectionsBySlug,
  findSourceSummariesBySlug: mocks.findSourceSummariesBySlug,
  retireStaleGenerationRuns: mocks.retireStaleGenerationRuns,
  retireStaleResearchSections: mocks.retireStaleResearchSections
}));

vi.mock("../src/lib/env", () => ({
  webEnv: () => ({
    DATABASE_URL: "postgres://user:pass@example.com/db"
  })
}));

const { GET } = await import("../src/app/api/extension/bootstrap/route");
const originalApiToken = process.env.EXTENSION_API_TOKEN;
const originalNodeEnv = process.env.NODE_ENV;

function extensionRequest(domain = "cartesia.ai", token?: string, extensionId?: string) {
  const headers = new Headers();
  if (token) {
    headers.set("authorization", `Bearer ${token}`);
  }
  if (extensionId) {
    headers.set("x-cold-start-extension-id", extensionId);
  }

  return new Request(`http://localhost/api/extension/bootstrap?domain=${encodeURIComponent(domain)}`, { headers });
}

function browserOriginRequest(domain = "cartesia.ai", token?: string) {
  const request = extensionRequest(domain, token);
  request.headers.set("origin", "chrome-extension://local-dev");
  return request;
}

describe("GET /api/extension/bootstrap", () => {
  beforeEach(() => {
    process.env.NODE_ENV = "test";
    process.env.EXTENSION_API_TOKEN = "secret";
    mocks.createDb.mockClear();
    mocks.findCardBySlug.mockReset();
    mocks.findLatestGenerationRunStatusBySlug.mockReset();
    mocks.findResearchRunEventsBySlug.mockReset();
    mocks.findResearchSectionsBySlug.mockReset();
    mocks.findSourceSummariesBySlug.mockReset();
    mocks.retireStaleGenerationRuns.mockReset();
    mocks.retireStaleResearchSections.mockReset();
    mocks.findResearchSectionsBySlug.mockResolvedValue([]);
    mocks.findResearchRunEventsBySlug.mockResolvedValue([]);
    mocks.findSourceSummariesBySlug.mockResolvedValue([]);
    mocks.retireStaleGenerationRuns.mockResolvedValue(0);
    mocks.retireStaleResearchSections.mockResolvedValue(0);
  });

  afterEach(() => {
    if (originalApiToken === undefined) {
      delete process.env.EXTENSION_API_TOKEN;
    } else {
      process.env.EXTENSION_API_TOKEN = originalApiToken;
    }
    if (originalNodeEnv === undefined) {
      delete process.env.NODE_ENV;
    } else {
      process.env.NODE_ENV = originalNodeEnv;
    }
  });

  it("requires extension auth before reading the database", async () => {
    const response = await GET(browserOriginRequest("cartesia.ai"));

    await expect(response.json()).resolves.toEqual({ error: "extension token required" });
    expect(response.status).toBe(401);
    expect(mocks.createDb).not.toHaveBeenCalled();
    expect(response.headers.get(COLD_START_API_CONTRACT_HEADER)).toBe(COLD_START_API_CONTRACT_VERSION);
  });

  it("returns card plus minimal basics and analysis run snapshots", async () => {
    const card = {
      slug: "cartesia",
      domain: "cartesia.ai",
      synthesis: {
        whyItMatters: { text: "Fast inference matters [c1].", citationIds: ["c1"] },
        bullCase: [],
        bearCase: [],
        openQuestions: []
      }
    };
    const sections = [{
      slug: "cartesia",
      domain: "cartesia.ai",
      sectionId: "why_it_matters",
      visibility: "gated",
      status: "running",
      content: null,
      citationIds: [],
      sourceIds: [],
      runId: "run-analysis",
      error: null,
      generatedAt: null,
      staleAt: null
    }];
    mocks.findCardBySlug.mockResolvedValue(card);
    mocks.findResearchSectionsBySlug.mockResolvedValue(sections);
    mocks.findLatestGenerationRunStatusBySlug
      .mockResolvedValueOnce({
        id: "run-basics",
        slug: "cartesia",
        domain: "cartesia.ai",
        mode: "basics",
        jobKind: "basics",
        status: "complete",
        costUsd: "0.13",
        startedAt: new Date("2026-05-18T12:00:00.000Z"),
        completedAt: new Date("2026-05-18T12:00:04.000Z"),
        traceJson: { oversized: true }
      })
      .mockResolvedValueOnce({
        id: "run-analysis",
        slug: "cartesia",
        domain: "cartesia.ai",
        mode: "analysis",
        jobKind: "analysis",
        status: "running",
        startedAt: new Date("2026-05-18T12:00:05.000Z"),
        traceJson: { oversized: true }
      });

    const response = await GET(extensionRequest("cartesia.ai", "secret", "extension-test-id"));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      domain: "cartesia.ai",
      slug: "cartesia",
      card,
      runs: {
        basics: {
          slug: "cartesia",
          domain: "cartesia.ai",
          mode: "basics",
          status: "complete",
          runId: "run-basics",
          costUsd: 0.13,
          startedAt: "2026-05-18T12:00:00.000Z",
          completedAt: "2026-05-18T12:00:04.000Z"
        },
        analysis: {
          slug: "cartesia",
          domain: "cartesia.ai",
          mode: "analysis",
          status: "running",
          runId: "run-analysis",
          startedAt: "2026-05-18T12:00:05.000Z"
        }
      }
    });
    expect(body.sections).toHaveLength(10);
    expect(body.sections.find((section: { sectionId: string }) => section.sectionId === "why_it_matters")).toMatchObject(sections[0]);
    expect(JSON.stringify(body)).not.toContain("traceJson");
    expect(mocks.retireStaleGenerationRuns).toHaveBeenCalledWith(mocks.db, { slug: "cartesia", mode: "basics" });
    expect(mocks.retireStaleGenerationRuns).toHaveBeenCalledWith(mocks.db, { slug: "cartesia", mode: "analysis" });
    expect(mocks.retireStaleResearchSections).toHaveBeenCalledWith(mocks.db, { slug: "cartesia" });
    expect(mocks.findLatestGenerationRunStatusBySlug).toHaveBeenCalledWith(mocks.db, "cartesia", "basics", "basics");
    expect(mocks.findLatestGenerationRunStatusBySlug).toHaveBeenCalledWith(mocks.db, "cartesia", "analysis", "analysis");
    expect(response.headers.get("Server-Timing")).toContain("db");
  });

  it("returns compact sources and recent research events for the active company", async () => {
    const card = {
      slug: "llamaindex",
      domain: "llamaindex.ai",
      citations: []
    };
    mocks.findCardBySlug.mockResolvedValue(card);
    mocks.findLatestGenerationRunStatusBySlug
      .mockResolvedValueOnce({
        id: "run-basics",
        slug: "llamaindex",
        domain: "llamaindex.ai",
        mode: "basics",
        jobKind: "basics",
        status: "running",
        startedAt: new Date("2026-05-26T20:00:00.000Z")
      })
      .mockResolvedValueOnce(null);
    mocks.findSourceSummariesBySlug.mockResolvedValue([
      {
        id: "source-1",
        url: "https://www.llamaindex.ai/",
        title: "LlamaIndex",
        domain: "llamaindex.ai",
        sourceType: "company_site",
        fetchedAt: "2026-05-26T20:00:01.000Z",
        snippet: "LlamaIndex is a data framework for LLM applications.",
        imageUrl: "https://www.llamaindex.ai/og.png"
      }
    ]);
    mocks.findResearchRunEventsBySlug.mockResolvedValue([
      {
        id: "event-1",
        runId: "run-basics",
        slug: "llamaindex",
        domain: "llamaindex.ai",
        sectionId: null,
        type: "source.found",
        message: "Found company website",
        metadata: { sourceType: "company_site" },
        createdAt: "2026-05-26T20:00:02.000Z"
      }
    ]);

    const response = await GET(extensionRequest("llamaindex.ai", "secret", "extension-test-id"));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.sources).toEqual([
      {
        id: "source-1",
        url: "https://www.llamaindex.ai/",
        title: "LlamaIndex",
        domain: "llamaindex.ai",
        sourceType: "company_site",
        fetchedAt: "2026-05-26T20:00:01.000Z",
        snippet: "LlamaIndex is a data framework for LLM applications.",
        imageUrl: "https://www.llamaindex.ai/og.png"
      }
    ]);
    expect(body.events).toEqual([
      {
        id: "event-1",
        runId: "run-basics",
        slug: "llamaindex",
        domain: "llamaindex.ai",
        sectionId: null,
        type: "source.found",
        message: "Found company website",
        metadata: { sourceType: "company_site" },
        createdAt: "2026-05-26T20:00:02.000Z"
      }
    ]);
    expect(mocks.findSourceSummariesBySlug).toHaveBeenCalledWith(mocks.db, "llamaindex", { limit: 24 });
    expect(mocks.findResearchRunEventsBySlug).toHaveBeenCalledWith(mocks.db, "llamaindex", { limit: 30 });
  });

  it("uses citation snippets as source summaries when stored raw sources are missing", async () => {
    mocks.findCardBySlug.mockResolvedValue({
      slug: "cartesia",
      domain: "cartesia.ai",
      citations: [
        {
          id: "c1",
          url: "https://cartesia.ai/",
          title: "Cartesia",
          sourceType: "company_site",
          fetchedAt: "2026-05-26T20:10:00.000Z",
          snippet: "Real-time multimodal intelligence."
        }
      ]
    });
    mocks.findLatestGenerationRunStatusBySlug.mockResolvedValue(null);
    mocks.findSourceSummariesBySlug.mockResolvedValue([]);

    const response = await GET(extensionRequest("cartesia.ai", "secret", "extension-test-id"));
    const body = await response.json();

    expect(body.sources).toEqual([
      {
        id: "citation:c1",
        url: "https://cartesia.ai/",
        title: "Cartesia",
        domain: "cartesia.ai",
        sourceType: "company_site",
        fetchedAt: "2026-05-26T20:10:00.000Z",
        snippet: "Real-time multimodal intelligence."
      }
    ]);
  });

  it("returns idle run snapshots when no runs exist", async () => {
    mocks.findCardBySlug.mockResolvedValue(null);
    mocks.findLatestGenerationRunStatusBySlug.mockResolvedValue(null);

    const response = await GET(extensionRequest("linear.app", "secret", "extension-test-id"));

    await expect(response.json()).resolves.toMatchObject({
      domain: "linear.app",
      slug: "linear",
      card: null,
      sections: [],
      runs: {
        basics: { slug: "linear", domain: "linear.app", mode: "basics", status: "idle" },
        analysis: { slug: "linear", domain: "linear.app", mode: "analysis", status: "idle" }
      }
    });
  });
});
