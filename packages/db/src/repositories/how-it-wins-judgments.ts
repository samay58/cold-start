import { and, eq } from "drizzle-orm";

import { howItWinsJudgmentSchema, type HowItWinsJudgment } from "@cold-start/core";

import type { ColdStartDb } from "../client";
import { howItWinsJudgments } from "../schema";

export type HowItWinsJudgmentInputHashes = {
  evidencePacketHash: string;
  promptHash: string;
  vocabularyHash: string;
};

export type StoredHowItWinsJudgment = {
  id: string;
  judgment: HowItWinsJudgment;
  createdAt: Date;
};

function inputsMatch(hashes: HowItWinsJudgmentInputHashes) {
  return and(
    eq(howItWinsJudgments.evidencePacketHash, hashes.evidencePacketHash),
    eq(howItWinsJudgments.promptHash, hashes.promptHash),
    eq(howItWinsJudgments.vocabularyHash, hashes.vocabularyHash)
  );
}

// Null on a corrupt row rather than a throw, matching the stored-card and stored-trace read paths:
// a verdict written before a schema change must not 500 every later read of that slug. A null
// simply re-pays for the judge on the next run.
export async function findHowItWinsJudgment(
  db: ColdStartDb,
  hashes: HowItWinsJudgmentInputHashes
): Promise<StoredHowItWinsJudgment | null> {
  const rows = await db
    .select({
      id: howItWinsJudgments.id,
      judgmentJson: howItWinsJudgments.judgmentJson,
      createdAt: howItWinsJudgments.createdAt
    })
    .from(howItWinsJudgments)
    .where(inputsMatch(hashes))
    .limit(1);
  const row = rows[0];
  if (!row) {
    return null;
  }

  const parsed = howItWinsJudgmentSchema.safeParse(row.judgmentJson);
  if (!parsed.success) {
    console.warn("[repository] dropping unparsable stored how-it-wins judgment", {
      id: row.id,
      issues: parsed.error.issues.slice(0, 3).map((issue) => ({
        path: issue.path.join("."),
        code: issue.code,
        message: issue.message
      }))
    });
    return null;
  }

  return { id: row.id, judgment: parsed.data, createdAt: row.createdAt };
}

// onConflictDoNothing then re-read, never onConflictDoUpdate: two analysis runs over the same
// unchanged evidence race here, and the first verdict written is the one every later reader
// should keep seeing. The re-read is what turns the loser's no-op insert into the winner's row.
export async function storeHowItWinsJudgment(
  db: ColdStartDb,
  input: HowItWinsJudgmentInputHashes & {
    slug: string;
    model: string;
    judgment: HowItWinsJudgment;
    estimatedCostUsd?: number | undefined;
    latencyMs?: number | undefined;
  }
): Promise<StoredHowItWinsJudgment> {
  const [inserted] = await db
    .insert(howItWinsJudgments)
    .values({
      evidencePacketHash: input.evidencePacketHash,
      promptHash: input.promptHash,
      vocabularyHash: input.vocabularyHash,
      slug: input.slug,
      model: input.model,
      judgmentJson: input.judgment,
      ...(input.estimatedCostUsd === undefined ? {} : { estimatedCostUsd: String(input.estimatedCostUsd) }),
      ...(input.latencyMs === undefined ? {} : { latencyMs: Math.round(input.latencyMs) })
    })
    .onConflictDoNothing({
      target: [
        howItWinsJudgments.evidencePacketHash,
        howItWinsJudgments.promptHash,
        howItWinsJudgments.vocabularyHash
      ]
    })
    .returning();

  if (inserted) {
    return { id: inserted.id, judgment: input.judgment, createdAt: inserted.createdAt };
  }

  const existing = await findHowItWinsJudgment(db, input);
  if (existing) {
    return existing;
  }

  // The conflicting row exists but no longer parses. Report this run's own verdict against that
  // row's id so the caller still has something to point its trace at.
  const rows = await db
    .select({ id: howItWinsJudgments.id, createdAt: howItWinsJudgments.createdAt })
    .from(howItWinsJudgments)
    .where(inputsMatch(input))
    .limit(1);
  const row = rows[0];
  if (!row) {
    throw new Error(`Failed to store how-it-wins judgment for ${input.slug}`);
  }
  return { id: row.id, judgment: input.judgment, createdAt: row.createdAt };
}
