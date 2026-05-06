import { createDb, findCardBySlug, findPublicCardBySlug } from "@cold-start/db";

import { webEnv } from "./env";

export function getPublicCachedCard(slug: string) {
  const db = createDb(webEnv().DATABASE_URL);
  return findPublicCardBySlug(db, slug);
}

export function getFullCachedCard(slug: string) {
  const db = createDb(webEnv().DATABASE_URL);
  return findCardBySlug(db, slug);
}
