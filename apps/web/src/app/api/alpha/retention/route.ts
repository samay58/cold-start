import { timingSafeEqual } from "node:crypto";

import { createDb, pruneAlphaEvents } from "@cold-start/db";

import { webEnv } from "../../../../lib/web-env";

const RETENTION_DAYS = 30;
const BATCH_SIZE = 1_000;
const MAX_DELETIONS = 10_000;

function secretMatches(header: string | null, secret: string) {
  const expected = Buffer.from(`Bearer ${secret}`);
  const received = Buffer.from(header ?? "");
  return expected.length === received.length && timingSafeEqual(expected, received);
}

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) {
    console.error("[alpha-retention]", { signal: "cron_secret_missing" });
    return Response.json({ error: "retention job is unavailable" }, { status: 503 });
  }
  if (!secretMatches(request.headers.get("authorization"), secret)) {
    console.warn("[alpha-security]", {
      signal: "retention_auth_rejected",
      status: 401
    });
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  const before = new Date(Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1_000);
  const db = createDb(webEnv().DATABASE_URL);
  let deleted = 0;

  while (deleted < MAX_DELETIONS) {
    const removed = await pruneAlphaEvents(db, {
      before,
      limit: Math.min(BATCH_SIZE, MAX_DELETIONS - deleted)
    });
    deleted += removed;
    if (removed < BATCH_SIZE) break;
  }

  const capped = deleted === MAX_DELETIONS;
  console.info("[alpha-retention]", {
    signal: "events_pruned",
    deleted,
    capped,
    before: before.toISOString()
  });

  return Response.json(
    { deleted, capped, before: before.toISOString() },
    { headers: { "Cache-Control": "no-store" } }
  );
}
