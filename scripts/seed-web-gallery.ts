#!/usr/bin/env tsx
// Seeds the three web-gallery fixture cards (apps/web/tests/fixtures/gallery-cards.ts) into
// Postgres so the screenshot harness (apps/web/tests/e2e/web-gallery.spec.ts) has real /c/{slug}
// pages to visit. Refuses to run against anything but the local docker-compose Postgres so a
// misconfigured DATABASE_URL can never write fixture data into a real deployment.
//
// Usage:
//   docker-compose up -d postgres
//   set -a; source .env.local; set +a
//   npm run seed:web-gallery
import { createDb, upsertCard } from "@cold-start/db";

import { emptySectionsCard, richConflictCard, thinFileCard } from "../apps/web/tests/fixtures/gallery-cards";

const GALLERY_CARDS = [richConflictCard, thinFileCard, emptySectionsCard];
const LOCAL_HOSTNAMES = new Set(["localhost", "127.0.0.1"]);
const LOCAL_PORT = "55432";

// Redacted host:port for error messages only. Never echo the raw DATABASE_URL back — it carries
// credentials, and this function's whole job is to fire on a URL that isn't what the caller
// thinks it is.
function redactedHostPort(databaseUrl: string): string {
  try {
    const url = new URL(databaseUrl);
    return `${url.hostname}:${url.port || "(no port)"}`;
  } catch {
    return "unparseable";
  }
}

// Parses the URL and checks the real hostname/port rather than substring-matching the raw
// string. A substring check (e.g. /localhost:55432/.test(databaseUrl)) is bypassable by a URL
// like postgres://localhost:55432@evil.com/db, where "localhost:55432" lands in the userinfo
// section and the real host is evil.com. Mirrors packages/db/src/client.ts's isLocalPostgresUrl.
function isLocalGalleryDatabaseUrl(databaseUrl: string): boolean {
  try {
    const url = new URL(databaseUrl);
    return LOCAL_HOSTNAMES.has(url.hostname) && url.port === LOCAL_PORT;
  } catch {
    return false;
  }
}

function assertLocalDatabaseUrl(databaseUrl: string | undefined): asserts databaseUrl is string {
  if (!databaseUrl || !isLocalGalleryDatabaseUrl(databaseUrl)) {
    const hostPort = databaseUrl ? redactedHostPort(databaseUrl) : "(unset)";
    throw new Error(
      `seed-web-gallery refuses to run against a non-local DATABASE_URL. Expected hostname "localhost" or "127.0.0.1" on port ${LOCAL_PORT}, got: ${hostPort}`
    );
  }
}

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  assertLocalDatabaseUrl(databaseUrl);

  const db = createDb(databaseUrl);

  for (const card of GALLERY_CARDS) {
    await upsertCard(db, card);
    console.log(`[seed-web-gallery] wrote ${card.slug} (${card.domain})`);
  }
}

main().catch((error) => {
  console.error("[seed-web-gallery] failed:", error);
  process.exitCode = 1;
});
