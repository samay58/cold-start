import { describe, expect, it } from "vitest";

import type { ColdStartCard } from "@cold-start/core";

import type { ColdStartDb } from "../src/client";
import { cardExpiryDates, recordCardEvidence, upsertCard } from "../src/repository";
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

describe("recordCardEvidence", () => {
  it("replaces citations and claims inside one transaction", async () => {
    const operations: string[] = [];
    const inserted: Record<string, unknown[]> = {};

    const tx = {
      delete: (table: unknown) => ({
        where: async () => {
          operations.push(`delete:${tableName(table)}`);
        }
      }),
      insert: (table: unknown) => ({
        values: async (values: unknown[]) => {
          const name = tableName(table);
          operations.push(`insert:${name}`);
          inserted[name] = values;
        }
      })
    };

    const db = {
      transaction: async (callback: (transaction: typeof tx) => Promise<void>) => {
        operations.push("transaction:start");
        await callback(tx);
        operations.push("transaction:end");
      }
    } as unknown as ColdStartDb;

    await recordCardEvidence(db, "card-id", card);

    expect(operations).toEqual([
      "transaction:start",
      "delete:citations",
      "delete:claims",
      "insert:citations",
      "insert:claims",
      "transaction:end"
    ]);
    expect(inserted.citations).toHaveLength(3);
    expect(inserted.claims).toHaveLength(10);
    expect(inserted.citations?.[0]).toMatchObject({ citationKey: "c1", snippet: "Real-time multimodal intelligence." });
    expect(inserted.citations?.[1]).not.toHaveProperty("snippet");
  });
});
