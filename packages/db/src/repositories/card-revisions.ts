import { asc, eq, sql } from "drizzle-orm";

import { rowsFromExecuteResult, type ColdStartDb } from "../client";
import { cardRevisions } from "../schema";

export type CardRevisionSummary = {
  edition: number;
  filedAt: Date;
  frozenAt: Date;
  hadSynthesis: boolean;
};

// The freeze is one SQL statement (read-and-insert atomically): Neon HTTP in prod has no
// interactive transactions, so this can't be a select followed by a separate insert without
// opening a race. The NOT EXISTS guard keys on card_json->>'generatedAt': two freezes of the
// same filing collapse into one edition, so a step retry (or a crash after freeze but before the
// store write that follows it) can never duplicate an edition.
export async function freezeCurrentEditionForRefile(
  db: ColdStartDb,
  slug: string,
  opts: { supersededByRunId?: string | null; appSchemaNote?: string | null } = {}
): Promise<{ frozen: boolean }> {
  const result = await db.execute(sql`
    INSERT INTO card_revisions
      (card_id, slug, edition, card_json, superseded_by_run_id, filed_at, had_synthesis, app_schema_note)
    SELECT
      c.id,
      c.slug,
      COALESCE((SELECT MAX(r.edition) FROM card_revisions r WHERE r.slug = c.slug), 0) + 1,
      c.card_json,
      ${opts.supersededByRunId ?? null},
      (c.card_json->>'generatedAt')::timestamptz,
      (c.card_json->'synthesis') IS NOT NULL,
      ${opts.appSchemaNote ?? null}
    FROM cards c
    WHERE c.slug = ${slug}
      AND NOT EXISTS (
        SELECT 1 FROM card_revisions r2
        WHERE r2.slug = c.slug
          AND r2.card_json->>'generatedAt' = c.card_json->>'generatedAt'
      )
  `);
  return { frozen: rowCountFromExecuteResult(result) > 0 };
}

export async function listCardRevisionSummaries(db: ColdStartDb, slug: string): Promise<CardRevisionSummary[]> {
  return db
    .select({
      edition: cardRevisions.edition,
      filedAt: cardRevisions.filedAt,
      frozenAt: cardRevisions.frozenAt,
      hadSynthesis: cardRevisions.hadSynthesis
    })
    .from(cardRevisions)
    .where(eq(cardRevisions.slug, slug))
    .orderBy(asc(cardRevisions.edition));
}

export async function countCardRevisions(db: ColdStartDb, slug: string): Promise<number> {
  const rows = await db
    .select({ id: cardRevisions.id })
    .from(cardRevisions)
    .where(eq(cardRevisions.slug, slug));
  return rows.length;
}

// neon-http and node-postgres both return an object carrying `rowCount` for a plain
// db.execute(sql`...`) with no RETURNING clause; this only falls back to counting rows for
// driver shapes that omit it (matching the tolerance rowsFromExecuteResult already has for the
// bare-array and malformed-result cases).
function rowCountFromExecuteResult(result: unknown): number {
  if (result && typeof result === "object" && "rowCount" in result) {
    const rowCount = (result as { rowCount?: unknown }).rowCount;
    if (typeof rowCount === "number") {
      return rowCount;
    }
  }
  return rowsFromExecuteResult(result).length;
}
