import { hasUsablePublicProfile, materializeFundingFromCitations } from "@cold-start/core";
import { createDb, findCardBySlug, findPublicCardBySlug } from "@cold-start/db";

import { webEnv } from "./env";

export async function getPublicCachedCard(slug: string) {
  const db = createDb(webEnv().DATABASE_URL);
  const card = await findPublicCardBySlug(db, slug);
  return card && hasUsablePublicProfile(card) ? materializeFundingFromCitations(card) : null;
}

export async function getFullCachedCard(slug: string) {
  const db = createDb(webEnv().DATABASE_URL);
  const card = await findCardBySlug(db, slug);
  return card && hasUsablePublicProfile(card) ? materializeFundingFromCitations(card) : null;
}
