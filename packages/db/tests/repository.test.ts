import { describe, expect, it } from "vitest";

import { publicCard, type ColdStartCard } from "@cold-start/core";

import type { ColdStartDb } from "../src/client";
import { createDb } from "../src/client";
import {
  cardExpiryDates,
  findActiveGenerationRunBySlug,
  findPublicCardBySlug,
  markGenerationRun,
  recordCardEvidence,
  upsertCard
} from "../src/repository";
import { citations, claims } from "../src/schema";

const generatedAt = "2026-05-06T12:00:00.000Z";
type TestGenerationRun = {
  id: string;
  slug: string;
  domain: string;
  mode: "basics" | "analysis";
  status: "queued" | "running" | "complete" | "failed";
  error?: string;
  costUsd?: string;
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

function sqlParamValues(value: unknown, seen = new Set<unknown>()): unknown[] {
  if (typeof value !== "object" || value === null || seen.has(value)) {
    return [];
  }

  seen.add(value);

  if (Array.isArray(value)) {
    return value.flatMap((item) => sqlParamValues(item, seen));
  }

  const record = value as { queryChunks?: unknown[]; value?: unknown };
  const directValue = "value" in record && typeof record.value !== "object" ? [record.value] : [];
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
        where: () => ({
          returning: async () => {
            const activeRows = rows.filter(
              (row) =>
                row.slug === values.slug &&
                row.mode === values.mode &&
                (row.status === "queued" || row.status === "running")
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
              return rows
                .filter(
                  (row) =>
                    (!mode || row.mode === mode) &&
                    (row.status === "queued" || row.status === "running")
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
  it("returns parsed public card JSON without synthesis", async () => {
    const db = {
      select: () => ({
        from: () => ({
          where: () => ({
            limit: async () => [{ publicCardJson: publicCard(card) }]
          })
        })
      })
    } as unknown as ColdStartDb;

    const publicOnly = await findPublicCardBySlug(db, "cartesia");

    expect(publicOnly?.slug).toBe("cartesia");
    expect(publicOnly).not.toHaveProperty("synthesis");
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
