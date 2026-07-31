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
const LOCAL_DATABASE_URL_PATTERN = /(localhost|127\.0\.0\.1):55432/;

function assertLocalDatabaseUrl(databaseUrl: string | undefined): asserts databaseUrl is string {
  if (!databaseUrl || !LOCAL_DATABASE_URL_PATTERN.test(databaseUrl)) {
    throw new Error(
      `seed-web-gallery refuses to run against a non-local DATABASE_URL. Expected a host matching localhost:55432 or 127.0.0.1:55432, got: ${databaseUrl ?? "(unset)"}`
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
