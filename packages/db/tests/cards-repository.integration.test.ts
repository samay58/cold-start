import { randomUUID } from "node:crypto";

import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { ColdStartCard } from "@cold-start/core";

import type { ColdStartDb } from "../src/client";
import { mutateCard, upsertCard } from "../src/index";
import * as schema from "../src/schema";

const databaseUrl = process.env.CARDS_DB_TEST_URL;
const describeDatabase = databaseUrl ? describe : describe.skip;
let pool: Pool;
let db: ColdStartDb;

describeDatabase("card writes against Postgres", () => {
  beforeAll(async () => {
    assertSafeTestDatabase(databaseUrl);
    pool = new Pool({ connectionString: databaseUrl });
    const testDb = drizzle(pool, { schema });
    db = testDb as ColdStartDb;
    await migrate(testDb, {
      migrationsFolder: new URL("../drizzle", import.meta.url).pathname
    });
  }, 30_000);

  afterAll(async () => {
    await pool?.end();
  });

  it("mutates a card whose stored timestamp carries microseconds", async () => {
    // The production failure mode: a fresh insert leaves updated_at to the column default,
    // which Postgres stamps with microsecond precision. A JS Date holds only milliseconds, so
    // any compare built from the read-back value can never match the stored one. The remainder
    // is forced here so the reproduction cannot pass by the 1-in-1000 chance of a zero remainder.
    const card = cardFixture();
    await upsertCard(db, card);
    await pool.query(
      "UPDATE cards SET updated_at = date_trunc('milliseconds', updated_at) + interval '123 microseconds' WHERE slug = $1",
      [card.slug]
    );

    const result = await mutateCard(
      db,
      card.slug,
      (value) => ({ ...value, generationCostUsd: value.generationCostUsd + 1 }),
      { maxAttempts: 4 }
    );

    expect(result?.card.generationCostUsd).toBeCloseTo(card.generationCostUsd + 1, 8);
    const stored = await pool.query("SELECT card_json FROM cards WHERE slug = $1", [card.slug]);
    expect(stored.rows[0].card_json.generationCostUsd).toBeCloseTo(card.generationCostUsd + 1, 8);
  });

  it("increments version on upsert conflict-updates and mutations", async () => {
    const card = cardFixture();
    await upsertCard(db, card);
    expect(await storedVersion(card.slug)).toBe(0);

    await upsertCard(db, { ...card, generationCostUsd: card.generationCostUsd + 1 });
    expect(await storedVersion(card.slug)).toBe(1);

    await mutateCard(db, card.slug, (value) => ({
      ...value,
      generationCostUsd: value.generationCostUsd + 1
    }));
    expect(await storedVersion(card.slug)).toBe(2);
  });

  it("applies overlapping mutations through the genuine insert path", async () => {
    const card = cardFixture();
    await upsertCard(db, card);

    await Promise.all(
      Array.from({ length: 8 }, () =>
        mutateCard(db, card.slug, (value) => ({
          ...value,
          generationCostUsd: value.generationCostUsd + 1
        }))
      )
    );

    const stored = await pool.query("SELECT card_json FROM cards WHERE slug = $1", [card.slug]);
    expect(stored.rows[0].card_json.generationCostUsd).toBeCloseTo(card.generationCostUsd + 8, 8);
  });
});

async function storedVersion(slug: string): Promise<number> {
  const result = await pool.query("SELECT version FROM cards WHERE slug = $1", [slug]);
  return Number(result.rows[0].version);
}

function cardFixture(): ColdStartCard {
  const suffix = randomUUID().slice(0, 8);
  const generatedAt = "2026-05-06T12:00:00.000Z";

  return {
    slug: `cartesia-${suffix}`,
    domain: `cartesia-${suffix}.ai`,
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
      totalRaisedUsd: { value: 91000000, status: "verified", confidence: "high", citationIds: ["c1"] },
      lastRound: { value: null, status: "unknown", confidence: "low", citationIds: [] },
      investors: { value: [{ name: "Kleiner Perkins", domain: "kleinerperkins.com" }], status: "verified", confidence: "high", citationIds: ["c1"] }
    },
    team: {
      founders: { value: [{ name: "Karan Goel", role: "Co-founder", sourceUrl: "https://cartesia.ai" }], status: "verified", confidence: "high", citationIds: ["c1"] },
      keyExecs: { value: [], status: "verified", confidence: "high", citationIds: ["c1"] },
      headcount: { value: null, status: "unknown", confidence: "low", citationIds: [] }
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
      }
    ]
  };
}

function assertSafeTestDatabase(value: string | undefined): asserts value is string {
  if (!value) throw new Error("CARDS_DB_TEST_URL is required");
  const url = new URL(value);
  if (!["127.0.0.1", "localhost"].includes(url.hostname) || !url.pathname.endsWith("_test")) {
    throw new Error("CARDS_DB_TEST_URL must point to a local database ending in _test");
  }
}
