import { and, eq, isNull, sql } from "drizzle-orm";

import { rowsFromExecuteResult, type ColdStartDb } from "../client";
import { accessRequests } from "../schema";

export type AccessRequestOutcome = "created" | "rate_limited_ip" | "rate_limited_email";

export async function createAccessRequest(
  db: ColdStartDb,
  input: { name: string; email: string; note: string; ipHash: string },
  now = new Date()
): Promise<AccessRequestOutcome> {
  const result = await db.execute<{ result: AccessRequestOutcome }>(sql`
    select create_access_request(
      ${input.name},
      ${input.email},
      ${input.note},
      ${input.ipHash},
      ${now}
    ) as result
  `);
  const outcome = rowsFromExecuteResult<{ result: unknown }>(result)[0]?.result;
  if (outcome !== "created" && outcome !== "rate_limited_ip" && outcome !== "rate_limited_email") {
    throw new TypeError("create_access_request returned an invalid result");
  }
  return outcome;
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
  return rowsFromExecuteResult<{ id: string }>(result).length;
}
