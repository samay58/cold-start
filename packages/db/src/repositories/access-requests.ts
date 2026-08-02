import { and, eq, isNull, sql, type SQL } from "drizzle-orm";

import type { ColdStartDb } from "../client";
import { accessRequests } from "../schema";

export type AccessRequestOutcome = "created" | "rate_limited_ip" | "rate_limited_email";

const ipWindowMs = 60 * 60 * 1000;
const emailWindowMs = 24 * 60 * 60 * 1000;

// Pure so the rate-limit thresholds are testable without a database. IP is checked first: an IP
// hammering the endpoint with distinct emails should never fall through to the looser email check.
export function accessRequestDecision(input: { recentFromIp: number; recentFromEmail: number }): AccessRequestOutcome {
  if (input.recentFromIp >= 3) return "rate_limited_ip";
  if (input.recentFromEmail >= 1) return "rate_limited_email";
  return "created";
}

// Neon HTTP has no interactive transactions and no SELECT...FOR UPDATE, so this is plain
// sequential queries rather than a locked read-then-write. A lost race between the count and the
// insert admits at worst one extra request row past the limit, which is acceptable here.
export async function createAccessRequest(
  db: ColdStartDb,
  input: { name: string; email: string; note: string; ipHash: string },
  now = new Date()
): Promise<AccessRequestOutcome> {
  const recentFromIp = await countRecentRequests(db, eq(accessRequests.ipHash, input.ipHash), new Date(now.getTime() - ipWindowMs));
  const recentFromEmail = await countRecentRequests(
    db,
    eq(accessRequests.email, input.email),
    new Date(now.getTime() - emailWindowMs)
  );

  const decision = accessRequestDecision({ recentFromIp, recentFromEmail });
  if (decision !== "created") return decision;

  await db.insert(accessRequests).values({
    name: input.name,
    email: input.email,
    note: input.note,
    ipHash: input.ipHash,
    createdAt: now
  });

  return decision;
}

export async function listOpenAccessRequests(
  db: ColdStartDb
): Promise<Array<{ id: string; name: string; email: string; note: string; createdAt: Date }>> {
  return db
    .select({
      id: accessRequests.id,
      name: accessRequests.name,
      email: accessRequests.email,
      note: accessRequests.note,
      createdAt: accessRequests.createdAt
    })
    .from(accessRequests)
    .where(isNull(accessRequests.handledAt))
    .orderBy(accessRequests.createdAt);
}

export async function markAccessRequestHandled(db: ColdStartDb, id: string, now = new Date()): Promise<boolean> {
  const rows = await db
    .update(accessRequests)
    .set({ handledAt: now })
    .where(and(eq(accessRequests.id, id), isNull(accessRequests.handledAt)))
    .returning();
  return rows.length === 1;
}

// Open requests are never eligible. The CTE keeps each deletion bounded without relying on an
// interactive transaction, which Neon HTTP does not provide.
export async function pruneHandledAccessRequests(
  db: ColdStartDb,
  input: { before: Date; limit?: number }
): Promise<number> {
  const limit = input.limit ?? 1_000;
  if (!Number.isInteger(limit) || limit <= 0) {
    throw new Error("limit must be a positive integer");
  }
  const result = await db.execute<{ id: string }>(sql`
    with doomed as (
      select id
      from access_requests
      where handled_at is not null and handled_at < ${input.before}
      order by handled_at
      limit ${limit}
    )
    delete from access_requests requests
    using doomed
    where requests.id = doomed.id
    returning requests.id
  `);
  if (Array.isArray(result)) {
    return result.length;
  }
  if (result && typeof result === "object" && "rows" in result) {
    const rows = (result as { rows?: unknown }).rows;
    return Array.isArray(rows) ? rows.length : 0;
  }
  return 0;
}

async function countRecentRequests(db: ColdStartDb, matchColumn: SQL, since: Date): Promise<number> {
  const rows = await db
    .select({ count: sql<number>`count(*)` })
    .from(accessRequests)
    .where(and(matchColumn, sql`${accessRequests.createdAt} > ${since}`));
  return Number(rows[0]?.count ?? 0);
}
