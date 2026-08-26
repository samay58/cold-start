import { randomUUID } from "node:crypto";

import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import {
  HOW_IT_WINS_STRATEGIES,
  howItWinsJudgmentSchema,
  type HowItWinsJudgment
} from "@cold-start/core";

import type { ColdStartDb } from "../src/client";
import { findHowItWinsJudgment, pruneHowItWinsJudgments, storeHowItWinsJudgment } from "../src/index";
import * as schema from "../src/schema";

const databaseUrl = process.env.CARDS_DB_TEST_URL;
const describeDatabase = databaseUrl ? describe : describe.skip;
let pool: Pool;
let db: ColdStartDb;

describeDatabase("how-it-wins judgment cache against Postgres", () => {
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

  it("reads a stored verdict back for the same evidence, prompt, and vocabulary", async () => {
    const hashes = hashesFixture();
    const judgment = judgmentFixture(hashes);

    const stored = await storeHowItWinsJudgment(db, {
      ...hashes,
      slug: "modal",
      model: "claude-test",
      judgment,
      estimatedCostUsd: 1.75,
      latencyMs: 91_000
    });
    const found = await findHowItWinsJudgment(db, hashes);

    expect(found?.id).toBe(stored.id);
    expect(found?.judgment).toEqual(judgment);
    const row = await judgmentRow(stored.id);
    expect(row.slug).toBe("modal");
    expect(Number(row.estimated_cost_usd)).toBeCloseTo(1.75, 4);
    expect(row.latency_ms).toBe(91_000);
  });

  it("misses when any one of the three hashes moves", async () => {
    const hashes = hashesFixture();
    await storeHowItWinsJudgment(db, {
      ...hashes,
      slug: "modal",
      model: "claude-test",
      judgment: judgmentFixture(hashes)
    });

    expect(await findHowItWinsJudgment(db, { ...hashes, evidencePacketHash: hashFixture() })).toBeNull();
    expect(await findHowItWinsJudgment(db, { ...hashes, promptHash: hashFixture() })).toBeNull();
    expect(await findHowItWinsJudgment(db, { ...hashes, vocabularyHash: hashFixture() })).toBeNull();
  });

  it("keeps the first verdict when two runs race the same evidence, without throwing", async () => {
    const hashes = hashesFixture();
    const first = judgmentFixture(hashes);
    const second = { ...judgmentFixture(hashes), currentStrategyIds: [] as string[] } as HowItWinsJudgment;

    const [a, b] = await Promise.all([
      storeHowItWinsJudgment(db, { ...hashes, slug: "modal", model: "claude-test", judgment: first }),
      storeHowItWinsJudgment(db, { ...hashes, slug: "modal", model: "claude-test", judgment: second })
    ]);

    expect(a.id).toBe(b.id);
    const rows = await pool.query(
      "SELECT id FROM how_it_wins_judgments WHERE evidence_packet_hash = $1 AND prompt_hash = $2 AND vocabulary_hash = $3",
      [hashes.evidencePacketHash, hashes.promptHash, hashes.vocabularyHash]
    );
    expect(rows.rows).toHaveLength(1);
    // Whichever run lost the race, the stored body is the one that actually landed, and it still
    // parses; the loser never overwrites it.
    const found = await findHowItWinsJudgment(db, hashes);
    expect(found).not.toBeNull();
  });

  it("reads a corrupt row as a miss instead of throwing", async () => {
    const hashes = hashesFixture();
    const stored = await storeHowItWinsJudgment(db, {
      ...hashes,
      slug: "modal",
      model: "claude-test",
      judgment: judgmentFixture(hashes)
    });
    await pool.query("UPDATE how_it_wins_judgments SET judgment_json = $1 WHERE id = $2", [
      JSON.stringify({ version: 1, missing: "everything" }),
      stored.id
    ]);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    const found = await findHowItWinsJudgment(db, hashes);

    expect(found).toBeNull();
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it("prunes judgments older than the boundary, oldest first, and leaves newer ones", async () => {
    const stale = hashesFixture();
    const fresh = hashesFixture();
    const staleRow = await storeHowItWinsJudgment(db, {
      ...stale,
      slug: "modal-stale",
      model: "claude-test",
      judgment: judgmentFixture(stale)
    });
    await storeHowItWinsJudgment(db, {
      ...fresh,
      slug: "modal-fresh",
      model: "claude-test",
      judgment: judgmentFixture(fresh)
    });
    await pool.query("UPDATE how_it_wins_judgments SET created_at = $1 WHERE id = $2", [
      new Date("2026-01-01T00:00:00.000Z"),
      staleRow.id
    ]);

    expect(await pruneHowItWinsJudgments(db, { before: new Date("2026-04-01T00:00:00.000Z"), limit: 1 })).toBe(1);
    expect(await findHowItWinsJudgment(db, stale)).toBeNull();
    expect(await findHowItWinsJudgment(db, fresh)).not.toBeNull();
    expect(await pruneHowItWinsJudgments(db, { before: new Date("2026-04-01T00:00:00.000Z") })).toBe(0);
  });

  it("stores a judgment the schema accepts, so the fixture cannot drift from the real shape", () => {
    const hashes = hashesFixture();

    expect(howItWinsJudgmentSchema.safeParse(judgmentFixture(hashes)).success).toBe(true);
  });
});

async function judgmentRow(id: string) {
  const result = await pool.query(
    "SELECT slug, model, estimated_cost_usd, latency_ms FROM how_it_wins_judgments WHERE id = $1",
    [id]
  );
  return result.rows[0];
}

function hashFixture() {
  return `${randomUUID()}${randomUUID()}`.replace(/-/g, "").slice(0, 64);
}

function hashesFixture() {
  return {
    evidencePacketHash: hashFixture(),
    promptHash: hashFixture(),
    vocabularyHash: hashFixture()
  };
}

const NOT_REACHED_DIMENSIONS = {
  evidenceStrength: "not_reached",
  centrality: "not_reached",
  materiality: "not_reached",
  distinctiveness: "not_reached",
  independence: "not_reached",
  explanatoryValue: "not_reached"
} as const;

// A whole-vocabulary verdict: two strategies carried in full, the other 78 left as the compact
// rejected record the schema allows. Small enough to read, complete enough that the real schema
// accepts it (the last test in the suite pins that).
function judgmentFixture(hashes: {
  evidencePacketHash: string;
  promptHash: string;
  vocabularyHash: string;
}): HowItWinsJudgment {
  const current = ["specialization", "iteration"];
  const judgment = {
    version: 1,
    hashes: {
      evidencePacket: hashes.evidencePacketHash,
      prompt: hashes.promptHash,
      vocabulary: hashes.vocabularyHash
    },
    evidenceCutoff: "2026-08-24T18:00:00.000Z",
    evidenceRegistry: [
      {
        evidenceId: "e1",
        text: "Modal runs serverless compute for AI teams.",
        source: "Modal (https://modal.com)",
        sourceDate: null,
        attribution: "company_site",
        scope: "company"
      }
    ],
    claims: [],
    materialBets: [
      {
        betId: "bet-1",
        statement: "A narrow compute surface beats a broad platform on iteration speed.",
        scope: "company",
        supportingEvidenceIds: ["e1"],
        scopeReasons: ["The filed record covers only serverless compute."]
      }
    ],
    strategyEvaluations: HOW_IT_WINS_STRATEGIES.map((strategy) =>
      current.includes(strategy.id)
        ? {
            strategyId: strategy.id,
            disposition: "current",
            betIds: ["bet-1"],
            mechanism: "A narrow surface shipped weekly.",
            evidenceGate: "pass",
            evidenceIds: ["e1"],
            claimIds: [],
            counterevidenceIds: [],
            dimensions: {
              evidenceStrength: "direct",
              centrality: "central",
              materiality: "material",
              distinctiveness: "company_specific",
              independence: "independent",
              explanatoryValue: "necessary"
            },
            presentRelevance: "current",
            historicalEvidenceIds: [],
            presentEvidenceIds: ["e1"],
            presentBridge: null,
            siblingCandidateIds: [],
            siblingResolutions: [],
            notYet: null,
            dispositionReason: "Carried by the filed record."
          }
        : {
            strategyId: strategy.id,
            disposition: "rejected",
            betIds: [],
            mechanism: null,
            evidenceGate: "unresolved",
            evidenceIds: [],
            claimIds: [],
            counterevidenceIds: [],
            dimensions: NOT_REACHED_DIMENSIONS,
            presentRelevance: "not_reached",
            historicalEvidenceIds: [],
            presentEvidenceIds: [],
            presentBridge: null,
            siblingCandidateIds: [],
            siblingResolutions: [],
            notYet: null,
            dispositionReason: "Not carried by this judgment."
          }
    ),
    currentStrategyIds: current,
    unusualPair: null,
    openQuestions: [],
    overallWrongCondition: {
      condition: "A broad platform matches the release cadence.",
      evidenceIds: []
    },
    disagreements: [],
    overrides: [],
    calls: [
      {
        callId: "call-1",
        stage: "global_judge",
        provider: "anthropic",
        model: "claude-test",
        inputTokens: 40_000,
        outputTokens: 28_000,
        cacheCreationInputTokens: 0,
        cacheReadInputTokens: 0,
        actualCostUsd: null,
        estimatedCostUsd: 1.5,
        latencyMs: 91_000,
        retryCount: 0,
        thinkingState: "enabled",
        outcome: "ok"
      }
    ]
  };
  return judgment as unknown as HowItWinsJudgment;
}

function assertSafeTestDatabase(value: string | undefined): asserts value is string {
  if (!value) throw new Error("CARDS_DB_TEST_URL is required");
  const url = new URL(value);
  if (!["127.0.0.1", "localhost"].includes(url.hostname) || !url.pathname.endsWith("_test")) {
    throw new Error("CARDS_DB_TEST_URL must point to a local database ending in _test");
  }
}
