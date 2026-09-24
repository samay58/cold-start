import { randomUUID } from "node:crypto";

import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { ColdStartCard } from "@cold-start/core";

import type { ColdStartDb } from "../src/client";
import { countCardRevisions, findSourcesBySlug, freezeCurrentEditionForRefile, listCardRevisionSummaries, mutateCard, recordSource, upsertCard } from "../src/index";
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

  it("preserves the saved edition when a later write contains a fractional dollar amount", async () => {
    const card = cardFixture();
    await upsertCard(db, card);
    const invalid = structuredClone(card);
    invalid.funding.lastRound.value = { name: "Reported financing", amountUsd: 33.3 * 1_000_000, announcedAt: null, leadInvestors: [] };
    await expect(upsertCard(db, invalid)).rejects.toThrow();
    expect(await storedVersion(card.slug)).toBe(0);
    const stored = await pool.query("SELECT card_json FROM cards WHERE slug = $1", [card.slug]);
    expect(stored.rows[0].card_json.funding).toEqual(card.funding);
  });

  afterAll(async () => {
    await pool?.end();
  });

  it("stores each source's publish date and reads it back, null when the source has none", async () => {
    const card = cardFixture();
    const { id } = await upsertCard(db, card);
    const source = { cardId: id, title: "Source", sourceType: "news" as const, fetchedAt: "2026-09-01T00:00:00.000Z", rawText: "Text." };
    await recordSource(db, { ...source, url: "https://news.example/dated", publishedAt: "2026-05-01T00:00:00.000Z" });
    await recordSource(db, { ...source, url: "https://news.example/undated" });

    const stored = await findSourcesBySlug(db, card.slug);
    const dates = Object.fromEntries(stored.map((row) => [row.url, row.publishedAt]));
    expect(dates).toEqual({ "https://news.example/dated": "2026-05-01T00:00:00.000Z", "https://news.example/undated": null });
  });

  it("fills a stored source's page text and publish date when the same URL comes back with them", async () => {
    const card = cardFixture();
    const { id } = await upsertCard(db, card);
    const base = { cardId: id, title: "Source", sourceType: "news" as const, fetchedAt: "2026-09-01T00:00:00.000Z" };
    const titleOnly = JSON.stringify({ id: "a", url: "https://news.example/a", title: "Source", publishedDate: null });
    const withText = JSON.stringify({ id: "a", url: "https://news.example/a", title: "Source", text: "The page's own text." });
    const readable = "Plain page text stored before.";

    // A row stored before page text was requested, then the same URL fetched with page text.
    await recordSource(db, { ...base, url: "https://news.example/a", rawText: titleOnly });
    await recordSource(db, { ...base, url: "https://news.example/a", rawText: withText, fetchedAt: "2026-09-02T00:00:00.000Z", publishedAt: "2026-05-01T00:00:00.000Z" });
    // A row that already has readable text keeps it, but still gains a date it lacked.
    await recordSource(db, { ...base, url: "https://news.example/b", rawText: readable });
    await recordSource(db, { ...base, url: "https://news.example/b", rawText: withText, publishedAt: "2026-06-01T00:00:00.000Z" });
    // A row with page text is never replaced by one without it, and keeps its date.
    await recordSource(db, { ...base, url: "https://news.example/c", rawText: withText, publishedAt: "2026-04-01T00:00:00.000Z" });
    await recordSource(db, { ...base, url: "https://news.example/c", rawText: titleOnly, publishedAt: "2026-07-01T00:00:00.000Z" });

    const stored = Object.fromEntries((await findSourcesBySlug(db, card.slug)).map((row) => [row.url, row]));
    expect(stored["https://news.example/a"]).toMatchObject({ rawText: withText, fetchedAt: "2026-09-02T00:00:00.000Z", publishedAt: "2026-05-01T00:00:00.000Z" });
    expect(stored["https://news.example/b"]).toMatchObject({ rawText: readable, publishedAt: "2026-06-01T00:00:00.000Z" });
    expect(stored["https://news.example/c"]).toMatchObject({ rawText: withText, publishedAt: "2026-04-01T00:00:00.000Z" });
  });

  it("never replaces a stored row that already has page text, whatever shape it is stored in", async () => {
    const card = cardFixture();
    const { id } = await upsertCard(db, card);
    const base = { cardId: id, title: "Source", sourceType: "news" as const, fetchedAt: "2026-09-01T00:00:00.000Z" };
    const refetch = JSON.stringify({ id: "r", title: "Source", text: "A newer fetch of the page." });
    const kept = {
      "https://news.example/record": JSON.stringify({ id: "x", title: "Source", text: "The page's own text." }),
      "https://news.example/summary": JSON.stringify({ id: "x", title: "Source", summary: "A summary." }),
      "https://news.example/highlights": JSON.stringify({ id: "x", title: "Source", highlights: ["A highlight."] }),
      "https://news.example/markdown-link": "[Home](https://news.example/)\n\nMarkdown page text.",
      "https://news.example/markdown-bullet": "* A bulleted page.",
      "https://news.example/starts-with-s": "some page text that starts with s.",
    };
    for (const [url, rawText] of Object.entries(kept)) {
      await recordSource(db, { ...base, url, rawText });
      await recordSource(db, { ...base, url, rawText: refetch, fetchedAt: "2026-09-02T00:00:00.000Z" });
    }

    const stored = Object.fromEntries((await findSourcesBySlug(db, card.slug)).map((row) => [row.url, row]));
    for (const [url, rawText] of Object.entries(kept)) {
      expect(stored[url], url).toMatchObject({ rawText, fetchedAt: "2026-09-01T00:00:00.000Z" });
    }
  });

  it("fills a stored JSON array of records, which carries no page text", async () => {
    const card = cardFixture();
    const { id } = await upsertCard(db, card);
    const base = { cardId: id, url: "https://news.example/list", title: "List", sourceType: "news" as const, fetchedAt: "2026-09-01T00:00:00.000Z" };
    const withText = JSON.stringify({ id: "r", title: "List", text: "The page's own text." });
    await recordSource(db, { ...base, rawText: JSON.stringify([{ id: "a", title: "A" }]) });
    await recordSource(db, { ...base, rawText: withText });

    const [row] = await findSourcesBySlug(db, card.slug);
    expect(row?.rawText).toBe(withText);
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

describeDatabase("card revisions repository", () => {
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

  it("archives edition 1 with the live card's JSON, filedAt from generatedAt, and hadSynthesis false for a basics card", async () => {
    const card = cardFixture();
    await upsertCard(db, card);
    const supersededByRunId = randomUUID();

    const outcome = await freezeCurrentEditionForRefile(db, card.slug, {
      supersededByRunId,
      appSchemaNote: "pre-refile"
    });

    expect(outcome).toEqual({ frozen: true });
    const rows = await revisionRows(card.slug);
    expect(rows).toHaveLength(1);
    expect(rows[0].edition).toBe(1);
    expect(rows[0].card_json.slug).toBe(card.slug);
    expect(rows[0].card_json.generatedAt).toBe(card.generatedAt);
    expect(new Date(rows[0].filed_at).toISOString()).toBe(new Date(card.generatedAt).toISOString());
    expect(rows[0].had_synthesis).toBe(false);
    expect(rows[0].superseded_by_run_id).toBe(supersededByRunId);
    expect(rows[0].app_schema_note).toBe("pre-refile");
  });

  it("archives a second edition with a different generatedAt after the card is replaced", async () => {
    const card = cardFixture();
    await upsertCard(db, card);
    await freezeCurrentEditionForRefile(db, card.slug);

    const replacement = { ...card, generatedAt: "2026-06-01T09:00:00.000Z" };
    await upsertCard(db, replacement);
    const outcome = await freezeCurrentEditionForRefile(db, card.slug);

    expect(outcome).toEqual({ frozen: true });
    const rows = await revisionRows(card.slug);
    expect(rows).toHaveLength(2);
    expect(rows.map((row) => row.edition)).toEqual([1, 2]);
    expect(rows[0].card_json.generatedAt).toBe(card.generatedAt);
    expect(rows[1].card_json.generatedAt).toBe(replacement.generatedAt);
    expect(rows[0].card_json.generatedAt).not.toBe(rows[1].card_json.generatedAt);
  });

  it("is idempotent: a second freeze without a card change writes nothing new", async () => {
    const card = cardFixture();
    await upsertCard(db, card);

    const first = await freezeCurrentEditionForRefile(db, card.slug);
    const second = await freezeCurrentEditionForRefile(db, card.slug);

    expect(first).toEqual({ frozen: true });
    expect(second).toEqual({ frozen: false });
    expect(await countCardRevisions(db, card.slug)).toBe(1);
  });

  it("freezes nothing for a slug with no card row", async () => {
    const slug = `missing-${randomUUID().slice(0, 8)}`;

    const outcome = await freezeCurrentEditionForRefile(db, slug);

    expect(outcome).toEqual({ frozen: false });
    expect(await countCardRevisions(db, slug)).toBe(0);
  });

  it("lists and counts revisions in ascending edition order", async () => {
    const card = cardFixture();
    await upsertCard(db, card);
    await freezeCurrentEditionForRefile(db, card.slug);

    const second = { ...card, generatedAt: "2026-06-01T09:00:00.000Z" };
    await upsertCard(db, second);
    await freezeCurrentEditionForRefile(db, card.slug);

    const third = { ...card, generatedAt: "2026-07-01T09:00:00.000Z" };
    await upsertCard(db, third);
    await freezeCurrentEditionForRefile(db, card.slug);

    const summaries = await listCardRevisionSummaries(db, card.slug);
    expect(summaries.map((summary) => summary.edition)).toEqual([1, 2, 3]);
    expect(summaries.every((summary) => summary.filedAt instanceof Date)).toBe(true);
    expect(summaries.every((summary) => summary.frozenAt instanceof Date)).toBe(true);
    expect(summaries.every((summary) => summary.hadSynthesis === false)).toBe(true);
    expect(await countCardRevisions(db, card.slug)).toBe(3);
  });
});

async function revisionRows(slug: string) {
  const result = await pool.query(
    "SELECT edition, card_json, filed_at, frozen_at, had_synthesis, superseded_by_run_id, app_schema_note FROM card_revisions WHERE slug = $1 ORDER BY edition ASC",
    [slug]
  );
  return result.rows;
}

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
