import { describe, expect, it, vi } from "vitest";

import { type ColdStartCard } from "@cold-start/core";
import type { GenerationTrace } from "@cold-start/core";

import type { ColdStartDb } from "../src/client";
import { createDb } from "../src/client";
import {
  cardExpiryDates,
  findActiveGenerationRunBySlug,
  findCardBySlug,
  findActiveGenerationRunStatusBySlug,
  findLatestGenerationRunBySlug,
  findLatestGenerationRunStatusBySlug,
  findResearchRunEventsBySlug,
  findSourceSummariesBySlug,
  findPublicCardBySlug,
  generationRunStaleAfterMs,
  listPublicCardSummaries,
  markGenerationRun,
  recordResearchRunEvent,
  recordCardEvidence,
  retireStaleGenerationRuns,
  upsertCard
} from "../src/repository";
import { citations, claims, researchRunEvents, sources } from "../src/schema";

const generatedAt = "2026-05-06T12:00:00.000Z";
type TestGenerationRun = {
  id: string;
  slug: string;
  domain: string;
  mode: "basics" | "analysis";
  jobKind?: string;
  status: "queued" | "running" | "complete" | "failed";
  error?: string;
  costUsd?: string;
  traceJson?: GenerationTrace;
  inngestEventId?: string;
  inngestRunId?: string;
  startedAt: Date;
  completedAt?: Date;
};

const card: ColdStartCard = {
  slug: "cartesia",
  domain: "cartesia.ai",
  generatedAt,
  generationCostUsd: 0.12,
  cacheStatus: "miss",
  identity: {
    name: { value: "Cartesia", status: "verified", confidence: "high", citationIds: ["c1"] },
    logoUrl: null,
    oneLiner: { value: "Real-time voice AI platform", status: "verified", confidence: "high", citationIds: ["c1"] },
    hq: { value: { city: "San Francisco", country: "US" }, status: "verified", confidence: "high", citationIds: ["c1"] },
    foundedYear: { value: 2023, status: "verified", confidence: "high", citationIds: ["c1"] },
    status: "private"
  },
  funding: {
    totalRaisedUsd: { value: 91000000, status: "verified", confidence: "high", citationIds: ["c2"] },
    lastRound: {
      value: { name: "Series B", amountUsd: 64000000, announcedAt: "2025-03-01", leadInvestors: ["Kleiner Perkins"] },
      status: "verified",
      confidence: "high",
      citationIds: ["c2"]
    },
    investors: {
      value: [{ name: "Kleiner Perkins", domain: "kleinerperkins.com" }],
      status: "verified",
      confidence: "high",
      citationIds: ["c2"]
    }
  },
  team: {
    founders: {
      value: [{ name: "Karan Goel", role: "Co-founder", sourceUrl: "https://cartesia.ai" }],
      status: "verified",
      confidence: "high",
      citationIds: ["c1"]
    },
    keyExecs: { value: [], status: "verified", confidence: "high", citationIds: ["c1"] },
    headcount: { value: { value: 42, asOf: "2026-05-06" }, status: "inferred", confidence: "low", citationIds: ["c3"] }
  },
  signals: [],
  comparables: [],
  citations: [
    {
      id: "c1",
      url: "https://cartesia.ai",
      title: "Cartesia",
      fetchedAt: generatedAt,
      sourceType: "company_site",
      snippet: "Real-time multimodal intelligence."
    },
    {
      id: "c2",
      url: "https://example.com/cartesia-funding",
      title: "Funding",
      fetchedAt: generatedAt,
      sourceType: "news"
    },
    {
      id: "c3",
      url: "https://example.com/cartesia-headcount",
      title: "Headcount",
      fetchedAt: generatedAt,
      sourceType: "enrichment"
    }
  ],
  synthesis: {
    whyItMatters: { text: "Cartesia is relevant because real-time voice is a live infra wedge [c1].", citationIds: ["c1"] },
    bullCase: [{ text: "The company has a credible infra wedge [c1].", citationIds: ["c1"] }],
    bearCase: [],
    openQuestions: ["Which buyer owns the budget?"]
  }
};

function tableName(table: unknown) {
  if (table === citations) {
    return "citations";
  }

  if (table === claims) {
    return "claims";
  }

  return "other";
}

function sourceTableName(table: unknown) {
  if (table === sources) {
    return "sources";
  }

  if (table === researchRunEvents) {
    return "research_run_events";
  }

  return tableName(table);
}

function sqlParamValues(value: unknown, seen = new Set<unknown>()): unknown[] {
  if (value instanceof Date) {
    return [value];
  }

  if (typeof value !== "object" || value === null || seen.has(value)) {
    return [];
  }

  seen.add(value);

  if (Array.isArray(value)) {
    return value.flatMap((item) => sqlParamValues(item, seen));
  }

  const record = value as { queryChunks?: unknown[]; value?: unknown };
  const directValue = "value" in record
    ? record.value instanceof Date || typeof record.value !== "object"
      ? [record.value]
      : []
    : [];
  const chunkValues = Array.isArray(record.queryChunks)
    ? record.queryChunks.flatMap((chunk) => sqlParamValues(chunk, seen))
    : [];

  return [...directValue, ...chunkValues];
}

function generationRunLifecycleDb() {
  const rows: TestGenerationRun[] = [];

  const db = {
    insert: () => ({
      values: (values: Omit<TestGenerationRun, "id" | "startedAt">) => ({
        returning: async () => {
          const row = {
            id: `run-${rows.length + 1}`,
            startedAt: new Date(`2026-05-06T12:00:0${rows.length}.000Z`),
            ...values
          };
          rows.push(row);
          return [row];
        }
      })
    }),
    update: () => ({
      set: (values: Omit<TestGenerationRun, "id" | "startedAt">) => ({
        where: (condition: unknown) => ({
          returning: async () => {
            const conditionValues = sqlParamValues(condition);
            const mode = conditionValues.includes("basics")
              ? "basics"
              : conditionValues.includes("analysis")
                ? "analysis"
                : values.mode;
            const slug = rows.find((row) => conditionValues.includes(row.slug))?.slug ?? values.slug;
            const statuses = ["queued", "running", "complete", "failed"].filter((status) =>
              conditionValues.includes(status)
            );
            const cutoff = conditionValues.find((value): value is Date => value instanceof Date);
            const activeRows = rows.filter(
              (row) =>
                row.slug === slug &&
                row.mode === mode &&
                (statuses.length === 0 || statuses.includes(row.status)) &&
                (!cutoff || row.startedAt < cutoff)
            );

            activeRows.forEach((row) => {
              Object.assign(row, values);
            });

            return activeRows;
          }
        })
      })
    }),
    select: () => ({
      from: () => ({
        where: (condition: unknown) => ({
          orderBy: () => ({
            limit: async () => {
              const values = sqlParamValues(condition);
              const mode = values.includes("basics") ? "basics" : values.includes("analysis") ? "analysis" : undefined;
              const statuses = ["queued", "running", "complete", "failed"].filter((status) =>
                values.includes(status)
              );
              const slug = rows.find((row) => values.includes(row.slug))?.slug;
              return rows
                .filter(
                  (row) =>
                    (!slug || row.slug === slug) &&
                    (!mode || row.mode === mode) &&
                    (statuses.length === 0 || statuses.includes(row.status))
                )
                .sort((left, right) => right.startedAt.getTime() - left.startedAt.getTime())
                .slice(0, 1);
            }
          })
        })
      })
    })
  } as unknown as ColdStartDb;

  return { db, rows };
}

describe("cardExpiryDates", () => {
  it("computes stable card TTL dates from one clock value", () => {
    const now = new Date("2026-05-06T12:00:00.000Z");

    expect(cardExpiryDates(now)).toEqual({
      identityExpiresAt: new Date("2026-05-13T12:00:00.000Z"),
      signalsExpiresAt: new Date("2026-05-06T18:00:00.000Z"),
      synthesisExpiresAt: new Date("2026-05-07T12:00:00.000Z")
    });
  });
});

describe("createDb", () => {
  it("creates a neon-http db with batch support without opening a network connection", () => {
    const db = createDb("postgres://user:pass@example.com/db");

    expect("batch" in db && typeof db.batch === "function").toBe(true);
  });

  it("creates a node-postgres db for local Docker Postgres URLs", () => {
    const db = createDb("postgres://coldstart:local@localhost:5432/coldstart");

    expect(typeof db.transaction).toBe("function");
  });
});

describe("upsertCard", () => {
  it("refreshes TTL columns on insert and conflict update", async () => {
    let insertValues: Record<string, unknown> | undefined;
    let updateSet: Record<string, unknown> | undefined;

    const db = {
      insert: () => ({
        values: (values: Record<string, unknown>) => {
          insertValues = values;
          return {
            onConflictDoUpdate: (config: { set: Record<string, unknown> }) => {
              updateSet = config.set;
              return {
                returning: async () => [{ id: "card-id" }]
              };
            }
          };
        }
      })
    } as unknown as ColdStartDb;

    await upsertCard(db, card);

    expect(insertValues?.identityExpiresAt).toBeInstanceOf(Date);
    expect(insertValues?.signalsExpiresAt).toBeInstanceOf(Date);
    expect(insertValues?.synthesisExpiresAt).toBeInstanceOf(Date);
    expect(updateSet?.identityExpiresAt).toEqual(insertValues?.identityExpiresAt);
    expect(updateSet?.signalsExpiresAt).toEqual(insertValues?.signalsExpiresAt);
    expect(updateSet?.synthesisExpiresAt).toEqual(insertValues?.synthesisExpiresAt);
  });
});

describe("findPublicCardBySlug", () => {
  it("derives the public card from private card JSON instead of trusting the stored public projection", async () => {
    const db = {
      select: () => ({
        from: () => ({
          where: () => ({
            limit: async () => [
              {
                cardJson: card,
                identityExpiresAt: new Date("2026-05-13T12:00:00.000Z"),
                signalsExpiresAt: new Date("2026-05-06T18:00:00.000Z"),
                synthesisExpiresAt: new Date("2026-05-07T12:00:00.000Z")
              }
            ]
          })
        })
      })
    } as unknown as ColdStartDb;

    const publicOnly = await findPublicCardBySlug(db, "cartesia", { now: new Date("2026-05-06T12:00:00.000Z") });

    expect(publicOnly?.slug).toBe("cartesia");
    expect(publicOnly).not.toHaveProperty("synthesis");
  });

  it("returns null when the basics cache is stale", async () => {
    const db = {
      select: () => ({
        from: () => ({
          where: () => ({
            limit: async () => [
              {
                cardJson: card,
                identityExpiresAt: new Date("2026-05-13T12:00:00.000Z"),
                signalsExpiresAt: new Date("2026-05-06T11:59:59.000Z"),
                synthesisExpiresAt: new Date("2026-05-07T12:00:00.000Z")
              }
            ]
          })
        })
      })
    } as unknown as ColdStartDb;

    await expect(findPublicCardBySlug(db, "cartesia", { now: new Date("2026-05-06T12:00:00.000Z") })).resolves.toBeNull();
  });

  it("can return the last stored public card when stale reads are allowed", async () => {
    const db = {
      select: () => ({
        from: () => ({
          where: () => ({
            limit: async () => [
              {
                cardJson: card,
                identityExpiresAt: new Date("2026-05-06T11:59:59.000Z"),
                signalsExpiresAt: new Date("2026-05-06T11:59:59.000Z"),
                synthesisExpiresAt: new Date("2026-05-06T11:59:59.000Z")
              }
            ]
          })
        })
      })
    } as unknown as ColdStartDb;

    await expect(findPublicCardBySlug(db, "cartesia", { now: new Date("2026-05-06T12:00:00.000Z"), allowStale: true })).resolves.toMatchObject({
      slug: "cartesia",
      cacheStatus: "stale"
    });
  });

  it("returns null when the public card row is absent", async () => {
    const db = {
      select: () => ({
        from: () => ({
          where: () => ({
            limit: async () => []
          })
        })
      })
    } as unknown as ColdStartDb;

    await expect(findPublicCardBySlug(db, "missing")).resolves.toBeNull();
  });
});

describe("findCardBySlug", () => {
  it("returns null for analysis mode when synthesis is stale", async () => {
    const db = {
      select: () => ({
        from: () => ({
          where: () => ({
            limit: async () => [
              {
                cardJson: card,
                identityExpiresAt: new Date("2026-05-13T12:00:00.000Z"),
                signalsExpiresAt: new Date("2026-05-06T18:00:00.000Z"),
                synthesisExpiresAt: new Date("2026-05-06T11:59:59.000Z")
              }
            ]
          })
        })
      })
    } as unknown as ColdStartDb;

    await expect(findCardBySlug(db, "cartesia", { mode: "analysis", now: new Date("2026-05-06T12:00:00.000Z") })).resolves.toBeNull();
  });

  it("can return the last stored full card when analysis is stale", async () => {
    const db = {
      select: () => ({
        from: () => ({
          where: () => ({
            limit: async () => [
              {
                cardJson: card,
                identityExpiresAt: new Date("2026-05-06T11:59:59.000Z"),
                signalsExpiresAt: new Date("2026-05-06T11:59:59.000Z"),
                synthesisExpiresAt: new Date("2026-05-06T11:59:59.000Z")
              }
            ]
          })
        })
      })
    } as unknown as ColdStartDb;

    await expect(findCardBySlug(db, "cartesia", { mode: "analysis", now: new Date("2026-05-06T12:00:00.000Z"), allowStale: true })).resolves.toMatchObject({
      slug: "cartesia",
      cacheStatus: "stale"
    });
  });

  it("allows basics mode when identity and signals are fresh even if synthesis is stale", async () => {
    const db = {
      select: () => ({
        from: () => ({
          where: () => ({
            limit: async () => [
              {
                cardJson: card,
                identityExpiresAt: new Date("2026-05-13T12:00:00.000Z"),
                signalsExpiresAt: new Date("2026-05-06T18:00:00.000Z"),
                synthesisExpiresAt: new Date("2026-05-06T11:59:59.000Z")
              }
            ]
          })
        })
      })
    } as unknown as ColdStartDb;

    await expect(findCardBySlug(db, "cartesia", { mode: "basics", now: new Date("2026-05-06T12:00:00.000Z") })).resolves.toMatchObject({
      slug: "cartesia"
    });
  });
});

describe("findActiveGenerationRunBySlug", () => {
  it.each(["queued", "running"] as const)("returns the latest active %s run", async (status) => {
    const db = {
      select: () => ({
        from: () => ({
          where: () => ({
            orderBy: () => ({
              limit: async () => [{ slug: "cartesia", domain: "cartesia.ai", mode: "analysis", status }]
            })
          })
        })
      })
    } as unknown as ColdStartDb;

    await expect(findActiveGenerationRunBySlug(db, "cartesia", "analysis")).resolves.toEqual({
      slug: "cartesia",
      domain: "cartesia.ai",
      mode: "analysis",
      status
    });
  });

  it.each(["complete", "failed"] as const)("returns null when the latest run is %s", async (status) => {
    const db = {
      select: () => ({
        from: () => ({
          where: () => ({
            orderBy: () => ({
              limit: async () => [{ slug: "cartesia", domain: "cartesia.ai", mode: "analysis", status }]
            })
          })
        })
      })
    } as unknown as ColdStartDb;

    await expect(findActiveGenerationRunBySlug(db, "cartesia", "analysis")).resolves.toBeNull();
  });

  it("returns null when no generation run exists", async () => {
    const db = {
      select: () => ({
        from: () => ({
          where: () => ({
            orderBy: () => ({
              limit: async () => []
            })
          })
        })
      })
    } as unknown as ColdStartDb;

    await expect(findActiveGenerationRunBySlug(db, "cartesia", "analysis")).resolves.toBeNull();
  });

  it("queries active statuses directly before selecting the latest run", async () => {
    let whereCondition: unknown;

    const db = {
      select: () => ({
        from: () => ({
          where: (condition: unknown) => {
            whereCondition = condition;
            return {
              orderBy: () => ({
                limit: async () => [{ slug: "cartesia", domain: "cartesia.ai", mode: "analysis", status: "queued" }]
              })
            };
          }
        })
      })
    } as unknown as ColdStartDb;

    await expect(findActiveGenerationRunBySlug(db, "cartesia", "analysis")).resolves.toMatchObject({ status: "queued" });
    expect(sqlParamValues(whereCondition)).toEqual(expect.arrayContaining(["cartesia", "analysis", "queued", "running"]));
  });

  it("tracks active basics and analysis runs independently", async () => {
    const { db, rows } = generationRunLifecycleDb();

    await markGenerationRun(db, { slug: "cartesia", domain: "cartesia.ai", mode: "basics", status: "queued" });
    await markGenerationRun(db, { slug: "cartesia", domain: "cartesia.ai", mode: "analysis", status: "queued" });
    await markGenerationRun(db, { slug: "cartesia", domain: "cartesia.ai", mode: "basics", status: "running" });

    expect(rows).toHaveLength(2);
    await expect(findActiveGenerationRunBySlug(db, "cartesia", "basics")).resolves.toMatchObject({
      mode: "basics",
      status: "running"
    });
    await expect(findActiveGenerationRunBySlug(db, "cartesia", "analysis")).resolves.toMatchObject({
      mode: "analysis",
      status: "queued"
    });
  });
});

describe("listPublicCardSummaries", () => {
  it("returns usable public cards newest first", async () => {
    const rows = [
      { cardJson: { ...card, slug: "thin", domain: "thin.ai", citations: [] } },
      { cardJson: { ...card, slug: "cartesia", domain: "cartesia.ai", generatedAt: "2026-05-07T12:00:00.000Z" } }
    ];
    let selectCount = 0;
    const db = {
      select: () => {
        selectCount += 1;
        return selectCount === 1
          ? {
              from: () => ({
                orderBy: async () => rows
              })
            }
          : {
              from: () => ({
                where: async () => []
              })
            };
      }
    } as unknown as ColdStartDb;

    await expect(listPublicCardSummaries(db)).resolves.toMatchObject([
      {
        slug: "cartesia",
        domain: "cartesia.ai",
        name: "Cartesia",
        sourceCount: 3,
        totalRaisedUsd: 91_000_000,
        lastRoundName: "Series B",
        headcount: 42
      }
    ]);
  });
});

describe("retireStaleGenerationRuns", () => {
  it("marks stale queued and running runs failed without deleting history", async () => {
    const { db, rows } = generationRunLifecycleDb();

    await markGenerationRun(db, { slug: "cartesia", domain: "cartesia.ai", mode: "analysis", status: "queued" });
    rows[0]!.startedAt = new Date("2026-05-06T12:00:00.000Z");

    const retired = await retireStaleGenerationRuns(db, {
      slug: "cartesia",
      mode: "analysis",
      now: new Date("2026-05-06T12:20:00.000Z"),
      staleAfterMs: generationRunStaleAfterMs
    });

    expect(retired).toBe(1);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      status: "failed",
      error: "stale generation run retired after 15 minutes"
    });
    expect(rows[0]?.completedAt).toEqual(new Date("2026-05-06T12:20:00.000Z"));
    await expect(findActiveGenerationRunBySlug(db, "cartesia", "analysis")).resolves.toBeNull();
  });

  it("keeps active runs that are still inside the stale threshold", async () => {
    const { db, rows } = generationRunLifecycleDb();

    await markGenerationRun(db, { slug: "cartesia", domain: "cartesia.ai", mode: "basics", status: "running" });
    rows[0]!.startedAt = new Date("2026-05-06T12:10:00.000Z");

    await expect(
      retireStaleGenerationRuns(db, {
        slug: "cartesia",
        mode: "basics",
        now: new Date("2026-05-06T12:20:00.000Z"),
        staleAfterMs: generationRunStaleAfterMs
      })
    ).resolves.toBe(0);
    await expect(findActiveGenerationRunBySlug(db, "cartesia", "basics")).resolves.toMatchObject({
      status: "running"
    });
  });
});

describe("findLatestGenerationRunBySlug", () => {
  it("returns the newest run even when it is terminal", async () => {
    const { db, rows } = generationRunLifecycleDb();

    await markGenerationRun(db, { slug: "cartesia", domain: "cartesia.ai", mode: "analysis", status: "queued" });
    await markGenerationRun(db, {
      slug: "cartesia",
      domain: "cartesia.ai",
      mode: "analysis",
      status: "failed",
      error: "worker failed"
    });
    rows[0]!.startedAt = new Date("2026-05-06T12:00:00.000Z");

    await expect(findLatestGenerationRunBySlug(db, "cartesia", "analysis")).resolves.toMatchObject({
      slug: "cartesia",
      mode: "analysis",
      status: "failed",
      error: "worker failed"
    });
  });

  it("returns null traceJson when the persisted shape is corrupt, instead of forwarding a malformed object", async () => {
    const corruptTrace = { jobKind: "definitely-not-a-job-kind", mode: 42, steps: "not-a-record" } as unknown as GenerationTrace;
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    const db = {
      select: () => ({
        from: () => ({
          where: () => ({
            orderBy: () => ({
              limit: async () => [{
                id: "run-corrupt",
                slug: "cartesia",
                domain: "cartesia.ai",
                mode: "analysis",
                jobKind: "analysis",
                status: "complete",
                error: null,
                costUsd: "0.10",
                traceJson: corruptTrace,
                inngestEventId: "evt_x",
                inngestRunId: "run_x",
                startedAt: new Date("2026-05-06T12:00:00.000Z"),
                completedAt: new Date("2026-05-06T12:01:00.000Z")
              }]
            })
          })
        })
      })
    } as unknown as ColdStartDb;

    const summary = await findLatestGenerationRunBySlug(db, "cartesia", "analysis");

    expect(summary?.slug).toBe("cartesia");
    expect(summary?.traceJson).toBeNull();
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });
});

describe("generation run status snapshots", () => {
  it("returns active runs without trace payloads or external worker ids", async () => {
    const { db } = generationRunLifecycleDb();
    const trace: GenerationTrace = {
      jobKind: "basics",
      mode: "basics",
      steps: {
        "fetch-sources": { status: "complete", durationMs: 42 }
      }
    };

    await markGenerationRun(db, {
      slug: "cartesia",
      domain: "cartesia.ai",
      mode: "basics",
      jobKind: "basics",
      status: "running",
      traceJson: trace,
      inngestEventId: "evt_1",
      inngestRunId: "run_1"
    });

    const snapshot = await findActiveGenerationRunStatusBySlug(db, "cartesia", "basics");

    expect(snapshot).toMatchObject({ slug: "cartesia", mode: "basics", status: "running" });
    expect(snapshot).not.toHaveProperty("traceJson");
    expect(snapshot).not.toHaveProperty("inngestEventId");
    expect(snapshot).not.toHaveProperty("inngestRunId");
  });

  it("returns latest terminal runs without trace payloads", async () => {
    const { db } = generationRunLifecycleDb();
    const trace: GenerationTrace = {
      jobKind: "analysis",
      mode: "analysis",
      steps: {
        "generate-card": { status: "complete", durationMs: 84 }
      }
    };

    await markGenerationRun(db, {
      slug: "cartesia",
      domain: "cartesia.ai",
      mode: "analysis",
      jobKind: "analysis",
      status: "failed",
      error: "worker failed",
      traceJson: trace,
      inngestEventId: "evt_2",
      inngestRunId: "run_2"
    });

    const snapshot = await findLatestGenerationRunStatusBySlug(db, "cartesia", "analysis");

    expect(snapshot).toMatchObject({ slug: "cartesia", mode: "analysis", status: "failed", error: "worker failed" });
    expect(snapshot).not.toHaveProperty("traceJson");
    expect(snapshot).not.toHaveProperty("inngestEventId");
    expect(snapshot).not.toHaveProperty("inngestRunId");
  });
});

describe("research run evidence summaries", () => {
  it("records and loads recent run events without exposing raw traces", async () => {
    const rows: unknown[] = [];
    const db = {
      insert: (table: unknown) => ({
        values: (value: unknown) => ({
          returning: async () => {
            const row = {
              id: "event-1",
              ...(value as Record<string, unknown>),
              createdAt: new Date("2026-05-26T20:00:00.000Z")
            };
            rows.push({ table: sourceTableName(table), row });
            return [row];
          }
        })
      }),
      select: () => ({
        from: () => ({
          where: () => ({
            orderBy: () => ({
              limit: async () => rows.map((entry) => (entry as { row: unknown }).row)
            })
          })
        })
      })
    } as unknown as ColdStartDb;

    await recordResearchRunEvent(db, {
      runId: "run-basics",
      slug: "cartesia",
      domain: "cartesia.ai",
      type: "source.found",
      message: "Found 3 independent sources",
      metadata: { sourceCount: 3 }
    });

    await expect(findResearchRunEventsBySlug(db, "cartesia", { limit: 5 })).resolves.toEqual([
      {
        id: "event-1",
        runId: "run-basics",
        slug: "cartesia",
        domain: "cartesia.ai",
        sectionId: null,
        type: "source.found",
        message: "Found 3 independent sources",
        metadata: { sourceCount: 3 },
        createdAt: "2026-05-26T20:00:00.000Z"
      }
    ]);
  });

  it("returns compact source summaries with snippets capped for extension bootstrap", async () => {
    const db = {
      select: () => ({
        from: () => ({
          innerJoin: () => ({
            where: () => ({
              orderBy: () => ({
                limit: async () => [
                  {
                    id: "source-1",
                    url: "https://cartesia.ai/blog",
                    title: "Cartesia Blog",
                    sourceType: "company_site",
                    fetchedAt: new Date("2026-05-26T20:01:00.000Z"),
                    rawText: "A".repeat(900)
                  }
                ]
              })
            })
          })
        })
      })
    } as unknown as ColdStartDb;

    await expect(findSourceSummariesBySlug(db, "cartesia", { limit: 3 })).resolves.toEqual([
      {
        id: "source-1",
        url: "https://cartesia.ai/blog",
        title: "Cartesia Blog",
        domain: "cartesia.ai",
        sourceType: "company_site",
        fetchedAt: "2026-05-26T20:01:00.000Z",
        snippet: `${"A".repeat(360)}...`
      }
    ]);
  });
});

describe("markGenerationRun", () => {
  it("promotes a queued run to running without inserting a duplicate row", async () => {
    const { db, rows } = generationRunLifecycleDb();

    await markGenerationRun(db, { slug: "cartesia", domain: "cartesia.ai", mode: "analysis", status: "queued" });
    await markGenerationRun(db, { slug: "cartesia", domain: "cartesia.ai", mode: "analysis", status: "running" });

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ slug: "cartesia", domain: "cartesia.ai", mode: "analysis", status: "running" });
    await expect(findActiveGenerationRunBySlug(db, "cartesia", "analysis")).resolves.toMatchObject({ status: "running" });
  });

  it("retires a queued run when marking the slug failed", async () => {
    const { db, rows } = generationRunLifecycleDb();

    await markGenerationRun(db, { slug: "cartesia", domain: "cartesia.ai", mode: "analysis", status: "queued" });
    expect(await findActiveGenerationRunBySlug(db, "cartesia", "analysis")).toMatchObject({ status: "queued" });

    await markGenerationRun(db, {
      slug: "cartesia",
      domain: "cartesia.ai",
      mode: "analysis",
      status: "failed",
      error: "queue failed"
    });

    await expect(findActiveGenerationRunBySlug(db, "cartesia", "analysis")).resolves.toBeNull();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ status: "failed", error: "queue failed" });
    expect(rows[0]?.completedAt).toBeInstanceOf(Date);
  });

  it.each(["failed", "complete"] as const)("retires a running run when marking the slug %s", async (status) => {
    const { db, rows } = generationRunLifecycleDb();

    await markGenerationRun(db, { slug: "cartesia", domain: "cartesia.ai", mode: "analysis", status: "running" });
    expect(await findActiveGenerationRunBySlug(db, "cartesia", "analysis")).toMatchObject({ status: "running" });

    await markGenerationRun(db, {
      slug: "cartesia",
      domain: "cartesia.ai",
      mode: "analysis",
      status,
      ...(status === "failed" ? { error: "worker failed" } : { costUsd: 0.42 })
    });

    await expect(findActiveGenerationRunBySlug(db, "cartesia", "analysis")).resolves.toBeNull();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject(
      status === "failed" ? { status, error: "worker failed" } : { status, costUsd: "0.42" }
    );
    expect(rows[0]?.completedAt).toBeInstanceOf(Date);
  });

  it("stores trace metadata and external run identifiers on lifecycle updates", async () => {
    const { db, rows } = generationRunLifecycleDb();
    const trace: GenerationTrace = {
      jobKind: "basics",
      mode: "basics",
      steps: {
        "fetch-sources": { status: "complete", durationMs: 42 }
      },
      sourceGate: {
        acceptedCount: 1,
        rejectedCount: 1,
        acceptedSamples: [{ url: "https://cartesia.ai", title: "Cartesia", sourceType: "company_site" }],
        rejectedSamples: [
          {
            url: "https://cartesia.example",
            title: "Wrong Cartesia",
            sourceType: "news",
            reason: "ambiguous_same_name_domain"
          }
        ]
      }
    };

    await markGenerationRun(db, {
      slug: "cartesia",
      domain: "cartesia.ai",
      mode: "basics",
      jobKind: "basics",
      status: "queued",
      traceJson: trace,
      inngestEventId: "evt_1",
      inngestRunId: "run_1"
    });

    await expect(findLatestGenerationRunBySlug(db, "cartesia", "basics")).resolves.toMatchObject({
      jobKind: "basics",
      traceJson: trace,
      inngestEventId: "evt_1",
      inngestRunId: "run_1"
    });
    expect(rows[0]).toMatchObject({
      jobKind: "basics",
      traceJson: trace,
      inngestEventId: "evt_1",
      inngestRunId: "run_1"
    });
  });
});

describe("recordCardEvidence", () => {
  it("replaces citations and claims inside one neon-http batch", async () => {
    const batchItems: Array<{ table: string; action: string; values?: unknown[] }> = [];
    const inserted: Record<string, unknown[]> = {};

    const db = {
      delete: (table: unknown) => ({
        where: () => ({ action: "delete", table: tableName(table) })
      }),
      insert: (table: unknown) => ({
        values: (values: unknown[]) => {
          const name = tableName(table);
          inserted[name] = values;
          return { action: "insert", table: name, values };
        }
      }),
      batch: async (items: Array<{ table: string; action: string; values?: unknown[] }>) => {
        batchItems.push(...items);
      },
      transaction: async () => {
        throw new Error("recordCardEvidence must use neon-http batch, not transaction");
      }
    } as unknown as ColdStartDb;

    await recordCardEvidence(db, "card-id", card);

    expect(batchItems.map((item) => `${item.action}:${item.table}`)).toEqual([
      "delete:citations",
      "delete:claims",
      "insert:citations",
      "insert:claims"
    ]);
    expect(inserted.citations).toHaveLength(3);
    expect(inserted.claims).toHaveLength(10);
    expect(inserted.citations?.[0]).toMatchObject({ citationKey: "c1", snippet: "Real-time multimodal intelligence." });
    expect(inserted.citations?.[1]).not.toHaveProperty("snippet");
  });

  it("replaces citations and claims inside a transaction when batch is unavailable", async () => {
    const operations: string[] = [];
    const statementBuilder = {
      delete: (table: unknown) => ({
        where: () => {
          operations.push(`delete:${tableName(table)}`);
          return { table: tableName(table), action: "delete" };
        }
      }),
      insert: (table: unknown) => ({
        values: (values: unknown[]) => {
          operations.push(`insert:${tableName(table)}:${values.length}`);
          return { table: tableName(table), action: "insert", values };
        }
      })
    } as unknown as ColdStartDb;
    const db = {
      ...statementBuilder,
      transaction: async (callback: (transaction: ColdStartDb) => Promise<void>) => {
        operations.length = 0;
        await callback(statementBuilder);
      }
    } as unknown as ColdStartDb;

    await recordCardEvidence(db, "card-id", card);

    expect(operations).toEqual([
      "delete:citations",
      "delete:claims",
      "insert:citations:3",
      "insert:claims:10"
    ]);
  });
});
