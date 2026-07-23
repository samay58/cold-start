import { COLD_START_API_CONTRACT_HEADER, COLD_START_API_CONTRACT_VERSION } from "@cold-start/core";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const db = { kind: "db" };

  return {
    db,
    createDb: vi.fn(() => db),
    findActiveGenerationRunStatusBySlug: vi.fn(),
    findLatestGenerationRunStatusBySlug: vi.fn(),
    findResearchRunEventsByRunId: vi.fn(),
    findCardBySlug: vi.fn(),
    findPublicCardBySlug: vi.fn(),
    markGenerationRun: vi.fn(),
    markResearchSectionFailed: vi.fn(),
    markResearchSectionRunning: vi.fn(),
    recordResearchRunEvent: vi.fn(),
    retireGenerationRunById: vi.fn(),
    retireStaleGenerationRuns: vi.fn(),
    send: vi.fn(),
    startInlineGeneration: vi.fn()
  };
});

// deadGenerationRunTarget stays real: the watchdog tests below exercise the actual
// classification against mocked run rows and event trails.
vi.mock("@cold-start/db", async (importOriginal) => ({
  deadGenerationRunTarget: (await importOriginal<typeof import("@cold-start/db")>()).deadGenerationRunTarget,
  createDb: mocks.createDb,
  findActiveGenerationRunStatusBySlug: mocks.findActiveGenerationRunStatusBySlug,
  findLatestGenerationRunStatusBySlug: mocks.findLatestGenerationRunStatusBySlug,
  findResearchRunEventsByRunId: mocks.findResearchRunEventsByRunId,
  findCardBySlug: mocks.findCardBySlug,
  findPublicCardBySlug: mocks.findPublicCardBySlug,
  markGenerationRun: mocks.markGenerationRun,
  markResearchSectionFailed: mocks.markResearchSectionFailed,
  markResearchSectionRunning: mocks.markResearchSectionRunning,
  recordResearchRunEvent: mocks.recordResearchRunEvent,
  retireGenerationRunById: mocks.retireGenerationRunById,
  retireStaleGenerationRuns: mocks.retireStaleGenerationRuns
}));

vi.mock("../src/inngest/client", () => ({
  inngest: {
    send: mocks.send
  }
}));

vi.mock("../src/inngest/inline-dispatch", () => ({
  startInlineGeneration: mocks.startInlineGeneration
}));

vi.mock("../src/lib/web-env", () => ({
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
    mode?: unknown;
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
      ...("mode" in options ? { mode: options.mode } : {}),
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

// Defaults (citationCount: 3, sourceTypeCount: 3) match what synthesisEvidenceSignals derives
// from usablePublicCard()'s own three citations (company_site, news, other -- all non-enrichment).
// That equality is the "evidence unchanged since the withheld verdict" case; override either
// count, or pass extra citations, to simulate evidence that moved since the verdict.
function withheldCard(overrides: {
  synthesisWithheldAt?: string;
  citationCount?: number;
  sourceTypeCount?: number;
  extraCitations?: ReturnType<typeof usablePublicCard>["citations"];
  reasons?: string[];
} = {}) {
  const base = usablePublicCard();
  return {
    ...base,
    citations: overrides.extraCitations ? [...base.citations, ...overrides.extraCitations] : base.citations,
    synthesisWithheld: {
      at: overrides.synthesisWithheldAt ?? "2026-05-14T00:00:00.000Z",
      reasons: overrides.reasons ?? ["insufficient-citations"],
      advisories: [],
      citationCount: overrides.citationCount ?? 3,
      sourceTypeCount: overrides.sourceTypeCount ?? 3
    }
  };
}

describe("POST /api/generate", () => {
  beforeEach(() => {
    process.env.NODE_ENV = "test";
    process.env.EXTENSION_API_TOKEN = "secret";
    delete process.env.PUBLIC_GENERATION_ENABLED;
    // Most of this suite predates inline dispatch and asserts the Inngest send path; pin the
    // flag so those assertions stay meaningful. The inline-dispatch tests below delete it to
    // exercise the default.
    process.env.GENERATION_DISPATCH = "inngest";
    mocks.startInlineGeneration.mockReset();
    mocks.retireGenerationRunById.mockReset();
    mocks.retireGenerationRunById.mockResolvedValue(null);
    mocks.createDb.mockClear();
    mocks.findActiveGenerationRunStatusBySlug.mockReset();
    mocks.findLatestGenerationRunStatusBySlug.mockReset();
    mocks.findResearchRunEventsByRunId.mockReset();
    mocks.findResearchRunEventsByRunId.mockResolvedValue([]);
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

  it("rejects malformed generation modes before touching DB or Inngest", async () => {
    const response = await POST(generateRequest("cartesia.ai", {
      mode: "analysys",
      confirmStart: true,
      extensionAuth: true
    }));

    await expect(response.json()).resolves.toEqual({ error: "invalid generation mode: analysys" });
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
      jobKind: "basics",
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
    expect(mocks.findCardBySlug).toHaveBeenCalledWith(mocks.db, "cartesia", { allowStale: true });
    expect(mocks.findPublicCardBySlug).not.toHaveBeenCalled();
    expect(mocks.markGenerationRun).toHaveBeenCalledWith(mocks.db, {
      slug: "cartesia",
      domain: "cartesia.ai",
      mode: "analysis",
      jobKind: "analysis",
      status: "queued"
    });
  });

  it("(a) returns withheld status free of charge when evidence has not changed since the withheld verdict", async () => {
    // Real prod shape: synthesisWithheld.at is stamped mid-pipeline, before upsertCard sets
    // cards.updated_at, so the row is always written strictly later than the withheld verdict.
    // A timestamp-based pre-check can never see this as "unchanged"; only a content comparison
    // (citation count + source-type count from the card's own citations) can.
    mocks.findCardBySlug.mockResolvedValue(withheldCard());

    const response = await POST(
      generateRequest("cartesia.ai", { mode: "analysis", confirmStart: true, extensionAuth: true })
    );

    await expect(response.json()).resolves.toMatchObject({
      slug: "cartesia",
      domain: "cartesia.ai",
      mode: "analysis",
      status: "withheld",
      card: expect.objectContaining({ slug: "cartesia", synthesisWithheld: expect.objectContaining({ at: "2026-05-14T00:00:00.000Z" }) })
    });
    expect(response.status).toBe(200);
    expect(mocks.findActiveGenerationRunStatusBySlug).not.toHaveBeenCalled();
    expect(mocks.markGenerationRun).not.toHaveBeenCalled();
    expect(mocks.send).not.toHaveBeenCalled();
  });

  it("(a2) returns withheld status free of charge for a no-claims-survived verdict with unchanged evidence", async () => {
    // Same evidence-content pre-check as (a), just over the new reason the pipeline stamps when
    // verify-synthesis drops every claim instead of the gate blocking outright (packages/pipeline
    // withheldCardForNoSurvivors). The route's comparison is reason-agnostic, so this only needs
    // the new reason value on the fixture to prove it, not any route-side change.
    mocks.findCardBySlug.mockResolvedValue(withheldCard({ reasons: ["no-claims-survived"] }));

    const response = await POST(
      generateRequest("cartesia.ai", { mode: "analysis", confirmStart: true, extensionAuth: true })
    );

    await expect(response.json()).resolves.toMatchObject({
      slug: "cartesia",
      domain: "cartesia.ai",
      mode: "analysis",
      status: "withheld",
      card: expect.objectContaining({
        slug: "cartesia",
        synthesisWithheld: expect.objectContaining({ reasons: ["no-claims-survived"] })
      })
    });
    expect(response.status).toBe(200);
    expect(mocks.findActiveGenerationRunStatusBySlug).not.toHaveBeenCalled();
    expect(mocks.markGenerationRun).not.toHaveBeenCalled();
    expect(mocks.send).not.toHaveBeenCalled();
  });

  it("(b) queues a forced refresh even when the card is withheld and unchanged", async () => {
    mocks.findCardBySlug.mockResolvedValue(withheldCard());
    mocks.findActiveGenerationRunStatusBySlug.mockResolvedValue(null);
    mocks.markGenerationRun.mockResolvedValue({ id: "run-id" });
    mocks.send.mockResolvedValue(undefined);

    const response = await POST(
      generateRequest("cartesia.ai", { mode: "analysis", confirmStart: true, extensionAuth: true, forceRefresh: true })
    );

    await expect(response.json()).resolves.toMatchObject({ slug: "cartesia", status: "queued", mode: "analysis" });
    expect(response.status).toBe(202);
    expect(mocks.markGenerationRun).toHaveBeenCalledWith(mocks.db, {
      slug: "cartesia",
      domain: "cartesia.ai",
      mode: "analysis",
      jobKind: "analysis",
      status: "queued"
    });
    expect(mocks.send).toHaveBeenCalled();
  });

  it("(c) queues when the card's evidence has grown past the withheld verdict's counts", async () => {
    mocks.findCardBySlug.mockResolvedValue(
      withheldCard({
        extraCitations: [
          { id: "c4", url: "https://example.com/cartesia-new-coverage", title: "New coverage", fetchedAt: "2026-05-15T00:00:00.000Z", sourceType: "news" }
        ]
      })
    );
    mocks.findActiveGenerationRunStatusBySlug.mockResolvedValue(null);
    mocks.markGenerationRun.mockResolvedValue({ id: "run-id" });
    mocks.send.mockResolvedValue(undefined);

    const response = await POST(
      generateRequest("cartesia.ai", { mode: "analysis", confirmStart: true, extensionAuth: true })
    );

    await expect(response.json()).resolves.toMatchObject({ slug: "cartesia", status: "queued", mode: "analysis" });
    expect(response.status).toBe(202);
    expect(mocks.markGenerationRun).toHaveBeenCalledWith(mocks.db, {
      slug: "cartesia",
      domain: "cartesia.ai",
      mode: "analysis",
      jobKind: "analysis",
      status: "queued"
    });
    expect(mocks.send).toHaveBeenCalled();
  });

  it("queues when only the recorded source-type count differs from the card's live citations", async () => {
    // citationCount still matches (3 == 3); only sourceTypeCount is stale (1 vs. the live 3).
    // Either count alone diverging must be treated as evidence having moved.
    mocks.findCardBySlug.mockResolvedValue(withheldCard({ sourceTypeCount: 1 }));
    mocks.findActiveGenerationRunStatusBySlug.mockResolvedValue(null);
    mocks.markGenerationRun.mockResolvedValue({ id: "run-id" });
    mocks.send.mockResolvedValue(undefined);

    const response = await POST(
      generateRequest("cartesia.ai", { mode: "analysis", confirmStart: true, extensionAuth: true })
    );

    await expect(response.json()).resolves.toMatchObject({ slug: "cartesia", status: "queued", mode: "analysis" });
    expect(response.status).toBe(202);
    expect(mocks.markGenerationRun).toHaveBeenCalledWith(mocks.db, {
      slug: "cartesia",
      domain: "cartesia.ai",
      mode: "analysis",
      jobKind: "analysis",
      status: "queued"
    });
    expect(mocks.send).toHaveBeenCalled();
  });

  it("(d) queues analysis instead of 404ing when the cached card has lapsed TTL", async () => {
    mocks.findCardBySlug.mockImplementation((_db: unknown, _slug: unknown, options?: { allowStale?: boolean }) => {
      return Promise.resolve(options?.allowStale ? { ...usablePublicCard(), cacheStatus: "stale" as const } : null);
    });
    mocks.findActiveGenerationRunStatusBySlug.mockResolvedValue(null);
    mocks.markGenerationRun.mockResolvedValue({ id: "run-id" });
    mocks.send.mockResolvedValue(undefined);

    const response = await POST(
      generateRequest("cartesia.ai", { mode: "analysis", confirmStart: true, extensionAuth: true })
    );

    await expect(response.json()).resolves.toMatchObject({ slug: "cartesia", status: "queued", mode: "analysis" });
    expect(response.status).toBe(202);
    expect(mocks.markGenerationRun).toHaveBeenCalledWith(mocks.db, {
      slug: "cartesia",
      domain: "cartesia.ai",
      mode: "analysis",
      jobKind: "analysis",
      status: "queued"
    });
    expect(mocks.send).toHaveBeenCalled();
  });

  it("does not serve a stale-but-synthesized analysis card as cached; queues a fresh run instead", async () => {
    mocks.findCardBySlug.mockResolvedValue({
      ...usablePublicCard(),
      cacheStatus: "stale" as const,
      synthesis: {
        whyItMatters: { text: "Existing but TTL-lapsed synthesis [c1].", citationIds: ["c1"] },
        bullCase: [],
        bearCase: [],
        openQuestions: [{ question: "What changed?", category: "buyer_budget" }],
      },
    });
    mocks.findActiveGenerationRunStatusBySlug.mockResolvedValue(null);
    mocks.markGenerationRun.mockResolvedValue({ id: "run-id" });
    mocks.send.mockResolvedValue(undefined);

    const response = await POST(
      generateRequest("cartesia.ai", { mode: "analysis", confirmStart: true, extensionAuth: true })
    );

    await expect(response.json()).resolves.toMatchObject({ slug: "cartesia", status: "queued", mode: "analysis" });
    expect(response.status).toBe(202);
    expect(mocks.markGenerationRun).toHaveBeenCalledWith(mocks.db, {
      slug: "cartesia",
      domain: "cartesia.ai",
      mode: "analysis",
      jobKind: "analysis",
      status: "queued"
    });
    expect(mocks.send).toHaveBeenCalled();
  });

  it("(e) still 404s analysis when the card is genuinely absent, stale read included", async () => {
    mocks.findCardBySlug.mockResolvedValue(null);

    const response = await POST(
      generateRequest("cartesia.ai", { mode: "analysis", confirmStart: true, extensionAuth: true })
    );

    await expect(response.json()).resolves.toEqual({ error: "profile not found" });
    expect(response.status).toBe(404);
    expect(mocks.findActiveGenerationRunStatusBySlug).not.toHaveBeenCalled();
    expect(mocks.markGenerationRun).not.toHaveBeenCalled();
    expect(mocks.send).not.toHaveBeenCalled();
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

  it("treats a null section mode as omitted", async () => {
    mocks.findCardBySlug.mockResolvedValue(usablePublicCard());
    mocks.findActiveGenerationRunStatusBySlug.mockResolvedValue(null);
    mocks.markGenerationRun.mockResolvedValue({ id: "run-id" });
    mocks.send.mockResolvedValue(undefined);

    const response = await POST(
      generateRequest("cartesia.ai", {
        sectionId: "market",
        mode: null,
        confirmStart: true,
        extensionAuth: true
      })
    );

    await expect(response.json()).resolves.toMatchObject({
      slug: "cartesia",
      domain: "cartesia.ai",
      status: "queued",
      mode: "analysis",
      runId: "run-id"
    });
    expect(mocks.markGenerationRun).toHaveBeenCalledWith(mocks.db, {
      slug: "cartesia",
      domain: "cartesia.ai",
      mode: "analysis",
      jobKind: "section:market",
      status: "queued"
    });
  });

  it("rejects section generation while a profile job is active", async () => {
    mocks.findCardBySlug.mockResolvedValue(usablePublicCard());
    mocks.findActiveGenerationRunStatusBySlug.mockImplementation((_db, _slug, mode, jobKind) => {
      if (mode === "basics" && jobKind === "basics") {
        return Promise.resolve({
          id: "run-profile",
          slug: "cartesia",
          domain: "cartesia.ai",
          mode: "basics",
          jobKind: "basics",
          status: "running",
          startedAt: new Date("2026-05-06T12:00:00.000Z")
        });
      }

      return Promise.resolve(null);
    });

    const response = await POST(
      generateRequest("cartesia.ai", {
        sectionId: "market",
        mode: "analysis",
        confirmStart: true,
        extensionAuth: true
      })
    );

    await expect(response.json()).resolves.toEqual({ error: "company profile is still generating" });
    expect(response.status).toBe(409);
    expect(mocks.markGenerationRun).not.toHaveBeenCalled();
    expect(mocks.markResearchSectionRunning).not.toHaveBeenCalled();
    expect(mocks.send).not.toHaveBeenCalled();
    expect(mocks.findActiveGenerationRunStatusBySlug).toHaveBeenCalledWith(mocks.db, "cartesia", "basics", "basics");
  });

  it("rejects section generation while a same-mode profile job is active", async () => {
    mocks.findCardBySlug.mockResolvedValue(usablePublicCard());
    mocks.findActiveGenerationRunStatusBySlug.mockImplementation((_db, _slug, mode, jobKind) => {
      if (mode === "analysis" && jobKind === undefined) {
        return Promise.resolve({
          id: "run-analysis",
          slug: "cartesia",
          domain: "cartesia.ai",
          mode: "analysis",
          jobKind: "analysis",
          status: "queued",
          startedAt: new Date("2026-05-06T12:00:00.000Z")
        });
      }

      return Promise.resolve(null);
    });

    const response = await POST(
      generateRequest("cartesia.ai", {
        sectionId: "market",
        mode: "analysis",
        confirmStart: true,
        extensionAuth: true
      })
    );

    await expect(response.json()).resolves.toEqual({ error: "company profile is still generating" });
    expect(response.status).toBe(409);
    expect(mocks.markGenerationRun).not.toHaveBeenCalled();
    expect(mocks.send).not.toHaveBeenCalled();
    expect(mocks.findActiveGenerationRunStatusBySlug).toHaveBeenCalledWith(mocks.db, "cartesia", "analysis");
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

  it("rejects synthesis-only sections (risks, the_case) as standalone section jobs", async () => {
    for (const sectionId of ["risks", "the_case"]) {
      const response = await POST(
        generateRequest("cartesia.ai", {
          sectionId,
          confirmStart: true,
          extensionAuth: true
        })
      );

      const body = (await response.json()) as { error?: string };
      expect(response.status).toBe(400);
      expect(body.error).toContain("cannot run as a standalone section job");
    }
    expect(mocks.createDb).not.toHaveBeenCalled();
  });

  it("requires confirmation for extension-authenticated public section generation", async () => {
    const response = await POST(
      generateRequest("cartesia.ai", {
        sectionId: "traction",
        mode: "basics",
        confirmStart: false,
        extensionAuth: true
      })
    );

    await expect(response.json()).resolves.toEqual({ error: "generation start confirmation required" });
    expect(response.status).toBe(400);
    expect(mocks.createDb).not.toHaveBeenCalled();
  });

  it("rejects public section generation before a profile exists", async () => {
    mocks.findPublicCardBySlug.mockResolvedValue(null);

    const response = await POST(
      generateRequest("cartesia.ai", {
        sectionId: "traction",
        mode: "basics",
        confirmStart: true,
        extensionAuth: true
      })
    );

    await expect(response.json()).resolves.toEqual({ error: "profile not found" });
    expect(response.status).toBe(404);
    expect(mocks.findActiveGenerationRunStatusBySlug).not.toHaveBeenCalled();
    expect(mocks.markGenerationRun).not.toHaveBeenCalled();
    expect(mocks.send).not.toHaveBeenCalled();
  });

  it("rejects public section generation when the stored profile is underfilled", async () => {
    mocks.findPublicCardBySlug.mockResolvedValue(underfilledPublicCard());

    const response = await POST(
      generateRequest("cartesia.ai", {
        sectionId: "traction",
        mode: "basics",
        confirmStart: true,
        extensionAuth: true
      })
    );

    await expect(response.json()).resolves.toEqual({ error: "profile needs more structured facts before section generation" });
    expect(response.status).toBe(409);
    expect(mocks.findActiveGenerationRunStatusBySlug).not.toHaveBeenCalled();
    expect(mocks.markGenerationRun).not.toHaveBeenCalled();
    expect(mocks.send).not.toHaveBeenCalled();
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
      jobKind: "basics",
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
      jobKind: "basics",
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
    mocks.findActiveGenerationRunStatusBySlug.mockResolvedValue({ slug: "cartesia", domain: "cartesia.ai", mode: "basics", jobKind: "basics", status });

    const response = await POST(generateRequest());

    await expect(response.json()).resolves.toMatchObject({ slug: "cartesia", domain: "cartesia.ai", status, mode: "basics" });
    expect(response.status).toBe(202);
    expect(mocks.markGenerationRun).not.toHaveBeenCalled();
    expect(mocks.send).not.toHaveBeenCalled();
  });

  it("returns a conflict when a full analysis request finds an active section run", async () => {
    mocks.findCardBySlug.mockResolvedValue(usablePublicCard());
    mocks.findActiveGenerationRunStatusBySlug.mockResolvedValue({
      id: "run-section",
      slug: "cartesia",
      domain: "cartesia.ai",
      mode: "analysis",
      jobKind: "section:market",
      status: "running",
      startedAt: new Date("2026-05-06T12:00:00.000Z")
    });

    const response = await POST(
      generateRequest("cartesia.ai", { mode: "analysis", confirmStart: true, extensionAuth: true })
    );

    await expect(response.json()).resolves.toEqual({
      error: "another generation is already running for this company"
    });
    expect(response.status).toBe(409);
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
      jobKind: "basics",
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
        jobKind: "basics",
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
      jobKind: "basics",
      status: "queued"
    });
    expect(mocks.markGenerationRun).toHaveBeenNthCalledWith(2, mocks.db, {
      slug: "cartesia",
      domain: "cartesia.ai",
      mode: "basics",
      jobKind: "basics",
      status: "failed",
      error: "inngest unavailable"
    });
  });

  it("fails a queued section run immediately when section setup fails before enqueue", async () => {
    mocks.findCardBySlug.mockResolvedValue(usablePublicCard());
    mocks.findActiveGenerationRunStatusBySlug.mockResolvedValue(null);
    mocks.markGenerationRun.mockResolvedValue({ id: "run-section" });
    mocks.markResearchSectionRunning.mockRejectedValue(new Error("section table unavailable"));

    const response = await POST(
      generateRequest("cartesia.ai", {
        mode: "analysis",
        sectionId: "market",
        confirmStart: true,
        extensionAuth: true
      })
    );

    await expect(response.json()).resolves.toEqual({ error: "failed to queue generation" });
    expect(response.status).toBe(500);
    expect(mocks.send).not.toHaveBeenCalled();
    expect(mocks.markGenerationRun).toHaveBeenNthCalledWith(1, mocks.db, {
      slug: "cartesia",
      domain: "cartesia.ai",
      mode: "analysis",
      jobKind: "section:market",
      status: "queued"
    });
    expect(mocks.markGenerationRun).toHaveBeenNthCalledWith(2, mocks.db, {
      slug: "cartesia",
      domain: "cartesia.ai",
      mode: "analysis",
      jobKind: "section:market",
      status: "failed",
      error: "section table unavailable"
    });
    expect(mocks.markResearchSectionFailed).toHaveBeenCalledWith(mocks.db, {
      slug: "cartesia",
      domain: "cartesia.ai",
      sectionId: "market",
      visibility: "gated",
      error: "section table unavailable",
      runId: "run-section"
    });
  });

  it("keeps section cleanup best-effort when dispatch fails", async () => {
    mocks.findCardBySlug.mockResolvedValue(usablePublicCard());
    mocks.findActiveGenerationRunStatusBySlug.mockResolvedValue(null);
    mocks.markGenerationRun.mockResolvedValue({ id: "run-section" });
    mocks.markResearchSectionRunning.mockResolvedValue(undefined);
    mocks.markResearchSectionFailed.mockRejectedValue(new Error("section cleanup unavailable"));
    mocks.send.mockRejectedValue(new Error("inngest unavailable"));

    const response = await POST(
      generateRequest("cartesia.ai", {
        mode: "analysis",
        sectionId: "market",
        confirmStart: true,
        extensionAuth: true
      })
    );

    await expect(response.json()).resolves.toEqual({ error: "failed to queue generation" });
    expect(response.status).toBe(500);
    expect(mocks.markGenerationRun).toHaveBeenNthCalledWith(2, mocks.db, {
      slug: "cartesia",
      domain: "cartesia.ai",
      mode: "analysis",
      jobKind: "section:market",
      status: "failed",
      error: "inngest unavailable"
    });
    expect(mocks.markResearchSectionFailed).toHaveBeenCalledWith(mocks.db, {
      slug: "cartesia",
      domain: "cartesia.ai",
      sectionId: "market",
      visibility: "gated",
      error: "inngest unavailable",
      runId: "run-section"
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
      jobKind: "basics",
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
        openQuestions: [{ question: "What changed?", category: "buyer_budget" }],
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
      jobKind: "analysis",
      status: "queued"
    });
  });

  it("dispatches basics in-process by default instead of sending to Inngest", async () => {
    delete process.env.GENERATION_DISPATCH;
    mocks.findPublicCardBySlug.mockResolvedValue(null);
    mocks.findActiveGenerationRunStatusBySlug.mockResolvedValue(null);
    mocks.markGenerationRun.mockResolvedValue({ id: "run-id", startedAt: new Date("2026-07-23T15:00:00.000Z") });

    const response = await POST(generateRequest("cartesia.ai"));

    await expect(response.json()).resolves.toMatchObject({ slug: "cartesia", status: "queued", mode: "basics", runId: "run-id" });
    expect(response.status).toBe(202);
    expect(mocks.startInlineGeneration).toHaveBeenCalledWith({
      domain: "cartesia.ai",
      slug: "cartesia",
      mode: "basics",
      requestedAtMs: Date.parse("2026-07-23T15:00:00.000Z")
    });
    expect(mocks.send).not.toHaveBeenCalled();
  });

  it("dispatches analysis in-process by default", async () => {
    delete process.env.GENERATION_DISPATCH;
    mocks.findCardBySlug.mockResolvedValue(usablePublicCard());
    mocks.findActiveGenerationRunStatusBySlug.mockResolvedValue(null);
    mocks.markGenerationRun.mockResolvedValue({ id: "run-id" });

    const response = await POST(
      generateRequest("cartesia.ai", { mode: "analysis", confirmStart: true, extensionAuth: true })
    );

    await expect(response.json()).resolves.toMatchObject({ slug: "cartesia", status: "queued", mode: "analysis" });
    expect(response.status).toBe(202);
    expect(mocks.startInlineGeneration).toHaveBeenCalledWith(
      expect.objectContaining({ slug: "cartesia", mode: "analysis" })
    );
    expect(mocks.send).not.toHaveBeenCalled();
  });

  it("keeps section jobs on Inngest even when inline dispatch is the default", async () => {
    delete process.env.GENERATION_DISPATCH;
    mocks.findCardBySlug.mockResolvedValue(usablePublicCard());
    mocks.findActiveGenerationRunStatusBySlug.mockResolvedValue(null);
    mocks.markGenerationRun.mockResolvedValue({ id: "run-id" });
    mocks.send.mockResolvedValue(undefined);

    const response = await POST(
      generateRequest("cartesia.ai", { sectionId: "market", mode: "analysis", confirmStart: true, extensionAuth: true })
    );

    await expect(response.json()).resolves.toMatchObject({ slug: "cartesia", status: "queued", runId: "run-id" });
    expect(response.status).toBe(202);
    expect(mocks.startInlineGeneration).not.toHaveBeenCalled();
    expect(mocks.send).toHaveBeenCalledWith(
      expect.objectContaining({ name: "card/generate.requested", data: expect.objectContaining({ sectionId: "market" }) })
    );
  });

  it("marks the queued run failed when inline dispatch throws synchronously", async () => {
    delete process.env.GENERATION_DISPATCH;
    mocks.findPublicCardBySlug.mockResolvedValue(null);
    mocks.findActiveGenerationRunStatusBySlug.mockResolvedValue(null);
    mocks.markGenerationRun.mockResolvedValue({ id: "run-id" });
    mocks.startInlineGeneration.mockImplementation(() => {
      throw new Error("dispatch exploded");
    });

    const response = await POST(generateRequest("cartesia.ai"));

    await expect(response.json()).resolves.toEqual({ error: "failed to queue generation" });
    expect(response.status).toBe(500);
    expect(mocks.markGenerationRun).toHaveBeenCalledWith(mocks.db, expect.objectContaining({
      slug: "cartesia",
      mode: "basics",
      status: "failed",
      error: "dispatch exploded"
    }));
  });

  it("retires a silent running run as failed and starts a fresh one in its place", async () => {
    const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000);
    mocks.findPublicCardBySlug.mockResolvedValue(null);
    mocks.findActiveGenerationRunStatusBySlug.mockResolvedValue({
      id: "dead-run",
      slug: "cartesia",
      domain: "cartesia.ai",
      mode: "basics",
      jobKind: "basics",
      status: "running",
      startedAt: tenMinutesAgo
    });
    mocks.findResearchRunEventsByRunId.mockResolvedValue([
      { type: "generation.started", createdAt: new Date(Date.now() - 9 * 60 * 1000).toISOString() }
    ]);
    mocks.retireGenerationRunById.mockResolvedValue({ id: "dead-run", status: "failed" });
    mocks.markGenerationRun.mockResolvedValue({ id: "fresh-run" });
    mocks.send.mockResolvedValue(undefined);

    const response = await POST(generateRequest("cartesia.ai"));

    await expect(response.json()).resolves.toMatchObject({ slug: "cartesia", status: "queued", runId: "fresh-run" });
    expect(response.status).toBe(202);
    expect(mocks.retireGenerationRunById).toHaveBeenCalledWith(mocks.db, { id: "dead-run", target: "failed" });
    expect(mocks.markGenerationRun).toHaveBeenCalledWith(mocks.db, expect.objectContaining({ status: "queued" }));
  });

  it("retires a silent running run that saved a card as complete", async () => {
    const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000);
    mocks.findPublicCardBySlug.mockResolvedValue(null);
    mocks.findActiveGenerationRunStatusBySlug.mockResolvedValue({
      id: "dead-run",
      slug: "cartesia",
      domain: "cartesia.ai",
      mode: "basics",
      jobKind: "basics",
      status: "running",
      startedAt: tenMinutesAgo
    });
    mocks.findResearchRunEventsByRunId.mockResolvedValue([
      { type: "card.saved", createdAt: new Date(Date.now() - 8 * 60 * 1000).toISOString() }
    ]);
    mocks.retireGenerationRunById.mockResolvedValue({ id: "dead-run", status: "complete" });
    mocks.markGenerationRun.mockResolvedValue({ id: "fresh-run" });
    mocks.send.mockResolvedValue(undefined);

    const response = await POST(generateRequest("cartesia.ai"));

    expect(response.status).toBe(202);
    expect(mocks.retireGenerationRunById).toHaveBeenCalledWith(mocks.db, { id: "dead-run", target: "complete" });
  });

  it("joins a running run whose event trail is still fresh instead of retiring it", async () => {
    mocks.findPublicCardBySlug.mockResolvedValue(null);
    mocks.findActiveGenerationRunStatusBySlug.mockResolvedValue({
      id: "live-run",
      slug: "cartesia",
      domain: "cartesia.ai",
      mode: "basics",
      jobKind: "basics",
      status: "running",
      startedAt: new Date(Date.now() - 10 * 60 * 1000)
    });
    mocks.findResearchRunEventsByRunId.mockResolvedValue([
      { type: "source.found", createdAt: new Date(Date.now() - 60 * 1000).toISOString() }
    ]);

    const response = await POST(generateRequest("cartesia.ai"));

    await expect(response.json()).resolves.toMatchObject({ slug: "cartesia", status: "running", runId: "live-run" });
    expect(response.status).toBe(202);
    expect(mocks.retireGenerationRunById).not.toHaveBeenCalled();
    expect(mocks.markGenerationRun).not.toHaveBeenCalled();
  });

  it("joins the run when the dead-run retire misses because it just went terminal", async () => {
    mocks.findPublicCardBySlug.mockResolvedValue(null);
    mocks.findActiveGenerationRunStatusBySlug.mockResolvedValue({
      id: "just-finished-run",
      slug: "cartesia",
      domain: "cartesia.ai",
      mode: "basics",
      jobKind: "basics",
      status: "running",
      startedAt: new Date(Date.now() - 10 * 60 * 1000)
    });
    mocks.findResearchRunEventsByRunId.mockResolvedValue([]);
    mocks.retireGenerationRunById.mockResolvedValue(null);

    const response = await POST(generateRequest("cartesia.ai"));

    await expect(response.json()).resolves.toMatchObject({ slug: "cartesia", status: "running", runId: "just-finished-run" });
    expect(response.status).toBe(202);
    expect(mocks.markGenerationRun).not.toHaveBeenCalled();
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

  function statusRequest(domain = "cartesia.ai", mode: unknown = "analysis") {
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
      jobKind: "analysis",
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
      mode: "analysis",
      jobKind: "analysis"
    });
    expect(mocks.findLatestGenerationRunStatusBySlug).toHaveBeenCalledWith(mocks.db, "cartesia", "analysis", "analysis");
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
    expect(mocks.retireStaleGenerationRuns).toHaveBeenCalledWith(mocks.db, {
      slug: "cartesia",
      mode: "analysis",
      jobKind: "section:market"
    });
    expect(mocks.findLatestGenerationRunStatusBySlug).toHaveBeenCalledWith(mocks.db, "cartesia", "analysis", "section:market");
  });

  it("treats an empty section status mode as omitted", async () => {
    mocks.findLatestGenerationRunStatusBySlug.mockResolvedValue({
      id: "run-section",
      slug: "cartesia",
      domain: "cartesia.ai",
      mode: "analysis",
      jobKind: "section:market",
      status: "running",
      startedAt: new Date("2026-05-06T12:00:00.000Z")
    });

    const response = await GET(sectionStatusRequest("market", "cartesia.ai", ""));

    await expect(response.json()).resolves.toMatchObject({
      slug: "cartesia",
      domain: "cartesia.ai",
      mode: "analysis",
      status: "running",
      runId: "run-section"
    });
    expect(mocks.findLatestGenerationRunStatusBySlug).toHaveBeenCalledWith(mocks.db, "cartesia", "analysis", "section:market");
  });

  it("rejects section status when the requested mode does not match the section", async () => {
    const response = await GET(sectionStatusRequest("market", "cartesia.ai", "basics"));

    await expect(response.json()).resolves.toEqual({ error: "section mode does not match requested mode" });
    expect(response.status).toBe(400);
    expect(mocks.createDb).not.toHaveBeenCalled();
  });

  it("rejects malformed generation status modes before touching DB", async () => {
    const response = await GET(statusRequest("cartesia.ai", "analysys"));

    await expect(response.json()).resolves.toEqual({ error: "invalid generation mode: analysys" });
    expect(response.status).toBe(400);
    expect(mocks.createDb).not.toHaveBeenCalled();
  });

  it("includes compact run events for the active generation status", async () => {
    mocks.findLatestGenerationRunStatusBySlug.mockResolvedValue({
      id: "run-1",
      slug: "cartesia",
      domain: "cartesia.ai",
      mode: "basics",
      jobKind: "basics",
      status: "running",
      startedAt: new Date("2026-05-06T12:00:00.000Z")
    });
    mocks.findResearchRunEventsByRunId.mockResolvedValue([
      {
        id: "event-1",
        runId: "run-1",
        slug: "cartesia",
        domain: "cartesia.ai",
        sectionId: null,
        type: "source.found",
        message: "Found 8 accepted sources",
        metadata: { acceptedCount: 8 },
        createdAt: "2026-05-06T12:00:20.000Z"
      }
    ]);

    const response = await GET(statusRequest("cartesia.ai", "basics"));

    await expect(response.json()).resolves.toMatchObject({
      slug: "cartesia",
      domain: "cartesia.ai",
      mode: "basics",
      status: "running",
      runId: "run-1",
      events: [
        {
          id: "event-1",
          type: "source.found",
          message: "Found 8 accepted sources"
        }
      ]
    });
    expect(mocks.findResearchRunEventsByRunId).toHaveBeenCalledWith(mocks.db, "run-1", { limit: 12 });
    expect(mocks.retireStaleGenerationRuns).toHaveBeenCalledWith(mocks.db, {
      slug: "cartesia",
      mode: "basics",
      jobKind: "basics"
    });
    expect(mocks.findLatestGenerationRunStatusBySlug).toHaveBeenCalledWith(mocks.db, "cartesia", "basics", "basics");
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
    expect(mocks.findLatestGenerationRunStatusBySlug).toHaveBeenCalledWith(mocks.db, "linear", "basics", "basics");
  });

  it("requires extension auth", async () => {
    const response = await GET(new Request("http://localhost/api/generate?domain=cartesia.ai&mode=analysis"));

    await expect(response.json()).resolves.toEqual({ error: "extension identity required" });
    expect(response.status).toBe(403);
    expect(response.headers.get(COLD_START_API_CONTRACT_HEADER)).toBe(COLD_START_API_CONTRACT_VERSION);
    expect(mocks.createDb).not.toHaveBeenCalled();
  });
});
