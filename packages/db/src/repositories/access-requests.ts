import { and, eq, isNotNull, isNull, lt, sql, type SQL } from "drizzle-orm";

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

// Handled requests are deleted 30 days after handling, the same privacy commitment as the
// alpha-events prune (see the privacy page). Open requests (handledAt null) are never touched
// here. Plain DELETE...WHERE: Neon HTTP has no interactive transactions, and this statement
// needs none.
export async function pruneHandledAccessRequests(db: ColdStartDb, cutoff: Date): Promise<number> {
  const rows = await db
    .delete(accessRequests)
    .where(and(isNotNull(accessRequests.handledAt), lt(accessRequests.handledAt, cutoff)))
    .returning();
  return rows.length;
}

async function countRecentRequests(db: ColdStartDb, matchColumn: SQL, since: Date): Promise<number> {
  const rows = await db
    .select({ count: sql<number>`count(*)` })
    .from(accessRequests)
    .where(and(matchColumn, sql`${accessRequests.createdAt} > ${since}`));
  return Number(rows[0]?.count ?? 0);
}
