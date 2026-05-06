import { describe, expect, it } from "vitest";

import { publicCard, type ColdStartCard } from "@cold-start/core";

import type { ColdStartDb } from "../src/client";
import { createDb } from "../src/client";
import {
  cardExpiryDates,
  findActiveGenerationRunBySlug,
  findPublicCardBySlug,
  recordCardEvidence,
  upsertCard
} from "../src/repository";
import { citations, claims } from "../src/schema";

const generatedAt = "2026-05-06T12:00:00.000Z";

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

    expect(typeof db.batch).toBe("function");
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
              limit: async () => [{ slug: "cartesia", domain: "cartesia.ai", status }]
            })
          })
        })
      })
    } as unknown as ColdStartDb;

    await expect(findActiveGenerationRunBySlug(db, "cartesia")).resolves.toEqual({
      slug: "cartesia",
      domain: "cartesia.ai",
      status
    });
  });

  it.each(["complete", "failed"] as const)("returns null when the latest run is %s", async (status) => {
    const db = {
      select: () => ({
        from: () => ({
          where: () => ({
            orderBy: () => ({
              limit: async () => [{ slug: "cartesia", domain: "cartesia.ai", status }]
            })
          })
        })
      })
    } as unknown as ColdStartDb;

    await expect(findActiveGenerationRunBySlug(db, "cartesia")).resolves.toBeNull();
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

    await expect(findActiveGenerationRunBySlug(db, "cartesia")).resolves.toBeNull();
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
});
